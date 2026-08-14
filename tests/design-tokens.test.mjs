// Tests for the design tokens in styles/globals.css.
//
// WHY THIS EXISTS: "premium" and "accessible" are otherwise matters of opinion
// that drift the moment someone picks a colour by eye. These tests read the
// REAL stylesheet — not a copy of the values — so a token cannot be changed
// without its contrast being re-checked. A failing build is a cheaper place to
// discover an unreadable chip than a customer's dashboard.
//
// WHY IT PARSES CSS RATHER THAN IMPORTING CONSTANTS: the tokens have to live in
// globals.css to be usable by styled-jsx, and duplicating them into a .js module
// would create exactly the drift this file exists to prevent. The parser below
// is deliberately small and dumb: it reads `--name: value;` pairs out of the two
// theme blocks and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseColor, contrastRatio } from '../lib/contrast.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, '..', 'styles', 'globals.css'), 'utf8');

// Comments explain WHY a value was retired and therefore legitimately mention
// it. Scan the declarations only, or the guard below fires on its own rationale.
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

// WCAG 2.1 AA.
const AA_TEXT = 4.5;   // body text
const AA_LARGE = 3;    // >=18.66px bold / >=24px, and non-text UI components

// ---------------------------------------------------------------- parsing ---

// Pulls the declarations out of one selector's block. Brace-counting rather
// than a regex for the body, because the file contains nested at-rules.
function block(selector) {
  const start = CSS.indexOf(selector);
  assert.notEqual(start, -1, `selector not found in globals.css: ${selector}`);
  const open = CSS.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') { depth--; if (depth === 0) break; }
  }
  const body = CSS.slice(open + 1, i);
  const out = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const DARK = block(':root');
const LIGHT = block("[data-admin-theme='light']");

// Resolves one `var(--x)` hop, which is all the aliases need.
function deref(tokens, value) {
  const m = value && value.match(/^var\((--[a-z0-9-]+)\)$/i);
  return m ? tokens[m[1]] : value;
}

// Flattens a translucent colour onto an opaque one. The status backgrounds are
// rgba() tints designed to sit on the page, so the ink has to be judged against
// the COMPOSITE, not against the tint's own nominal colour.
// Returns an `rgb(r, g, b)` STRING, because contrastRatio() parses its own
// arguments rather than taking parsed objects.
function over(fg, bg) {
  const f = parseColor(fg);
  const b = parseColor(bg);
  assert.ok(f && b, `unparseable colour pair: ${fg} / ${bg}`);
  const am = String(fg).match(/rgba\([^)]*?,\s*([\d.]+)\s*\)/);
  const a = am ? Number(am[1]) : 1;
  const mix = (x, y) => Math.round(a * x + (1 - a) * y);
  return `rgb(${mix(f.r, b.r)}, ${mix(f.g, b.g)}, ${mix(f.b, b.b)})`;
}

function ratio(tokens, fgName, bgName, { composite = false } = {}) {
  const fg = deref(tokens, tokens[fgName]);
  const bg = deref(tokens, tokens[bgName]);
  assert.ok(fg, `missing token ${fgName}`);
  assert.ok(bg, `missing token ${bgName}`);
  const page = deref(tokens, tokens['--bg-primary']);
  const bgSolid = composite ? over(bg, page) : bg;
  const r = contrastRatio(fg, bgSolid);
  assert.ok(r !== null, `unparseable pair: ${fgName}=${fg} on ${bgName}=${bgSolid}`);
  return r;
}

const THEMES = [['dark', DARK], ['light', LIGHT]];

// ------------------------------------------------------------------ brand ---

test('the brand constant is the value measured from the logo asset', () => {
  assert.equal(DARK['--brand-base'], '#2A6BCE');
});

test('the retired blue never comes back', () => {
  // #2C6FE0 was documented as the brand for months; the logo asset is #2A6BCE.
  // Two near-identical blues read as a mistake rather than a palette, so this
  // is a regression guard, not a style preference.
  assert.equal(/#2C6FE0/i.test(CSS_CODE), false, 'globals.css declares the retired #2C6FE0');
  // The pre-redesign accents should also be gone from the token layer.
  assert.equal(/--accent:\s*#9FA7FF/i.test(CSS_CODE), false, 'old dark accent still set');
  assert.equal(/--accent:\s*#4f57d8/i.test(CSS_CODE), false, 'old light accent still set');
});

test('--accent aliases the brand in both themes, so old call sites follow', () => {
  for (const [name, t] of THEMES) {
    assert.equal(t['--accent'], 'var(--brand)', `${name}: --accent is not aliased`);
    assert.equal(t['--accent-hover'], 'var(--brand-hover)', `${name}: --accent-hover`);
    assert.equal(t['--accent-fg'], 'var(--brand-ink)', `${name}: --accent-fg`);
  }
});

test('brand ink is readable on the brand fill in both themes', () => {
  for (const [name, t] of THEMES) {
    const r = ratio(t, '--brand-ink', '--brand');
    assert.ok(r >= AA_TEXT, `${name}: --brand-ink on --brand is ${r.toFixed(2)}:1, needs ${AA_TEXT}`);
  }
});

test('the brand fill separates from the page it sits on', () => {
  for (const [name, t] of THEMES) {
    const r = ratio(t, '--brand', '--bg-primary');
    assert.ok(r >= AA_LARGE, `${name}: --brand on --bg-primary is ${r.toFixed(2)}:1, needs ${AA_LARGE}`);
  }
});

test('the eyebrow tint is readable as text', () => {
  // The Arabic eyebrow uses colour where the Latin one uses tracking and case,
  // so it carries real information and has to meet text contrast, not decoration.
  for (const [name, t] of THEMES) {
    const r = ratio(t, '--brand-eyebrow', '--bg-primary');
    assert.ok(r >= AA_TEXT, `${name}: --brand-eyebrow is ${r.toFixed(2)}:1, needs ${AA_TEXT}`);
  }
});

// ------------------------------------------------------------------- text ---

test('the four-step text ramp keeps its hierarchy and stays readable', () => {
  // The ramp is built from alpha (1 / .72 / .5 / .36), and lib/contrast.js
  // deliberately ignores alpha — it cannot know what is behind a translucent
  // colour. Here we DO know: it is the page. So composite first, or all four
  // steps measure identically and the hierarchy assertion is meaningless.
  const step = (t, token) => {
    const page = deref(t, t['--bg-primary']);
    return contrastRatio(over(deref(t, t[token]), page), page);
  };
  for (const [name, t] of THEMES) {
    const primary = step(t, '--text-primary');
    const secondary = step(t, '--text-secondary');
    const tertiary = step(t, '--text-tertiary');

    assert.ok(primary >= AA_TEXT, `${name}: --text-primary ${primary.toFixed(2)}:1`);
    assert.ok(secondary >= AA_TEXT, `${name}: --text-secondary ${secondary.toFixed(2)}:1`);
    assert.ok(tertiary >= AA_LARGE, `${name}: --text-tertiary ${tertiary.toFixed(2)}:1`);

    // A previous light theme set all four steps to the same colour, which
    // collapsed the hierarchy entirely. Assert they remain distinct and ordered.
    assert.ok(primary > secondary, `${name}: primary must outrank secondary`);
    assert.ok(secondary > tertiary, `${name}: secondary must outrank tertiary`);
  }
});

// ----------------------------------------------------------------- status ---

for (const status of ['success', 'warning', 'danger', 'neutral']) {
  test(`--${status}-ink is readable on --${status}-bg`, () => {
    for (const [name, t] of THEMES) {
      const r = ratio(t, `--${status}-ink`, `--${status}-bg`, { composite: true });
      assert.ok(
        r >= AA_TEXT,
        `${name}: --${status}-ink on --${status}-bg is ${r.toFixed(2)}:1, needs ${AA_TEXT}`,
      );
    }
  });
}

test('every status colour carries a full fill / bg / border / ink set', () => {
  for (const [name, t] of THEMES) {
    for (const status of ['success', 'warning', 'danger', 'neutral']) {
      for (const part of ['', '-bg', '-border', '-ink']) {
        assert.ok(t[`--${status}${part}`], `${name}: missing --${status}${part}`);
      }
    }
  }
});

test('the informational state is grey, not a second blue', () => {
  // Blue is spent on the primary action. An informational chip sharing the
  // accent hue is what makes an accent stop meaning "act here".
  for (const [name, t] of THEMES) {
    const n = parseColor(t['--neutral']);
    const spread = Math.max(n.r, n.g, n.b) - Math.min(n.r, n.g, n.b);
    assert.ok(spread <= 30, `${name}: --neutral is not grey enough (spread ${spread})`);
  }
});

// ----------------------------------------------------------------- layout ---

test('the layout and line-height tokens exist', () => {
  for (const token of ['--measure', '--gutter', '--content-max']) {
    assert.ok(DARK[token], `missing ${token}`);
  }
  for (const token of ['--leading-tight', '--leading-snug', '--leading-normal', '--leading-arabic']) {
    assert.ok(DARK[token], `missing ${token}`);
  }
  // Arabic needs more leading than Latin: ascenders, descenders and diacritics
  // collide at the Latin value.
  assert.ok(
    Number(DARK['--leading-arabic']) > Number(DARK['--leading-normal']),
    'Arabic leading must exceed Latin leading',
  );
});
