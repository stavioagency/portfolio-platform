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
import { readFileSync, readdirSync } from 'node:fs';
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

// Resolves a `var(--x)` alias chain to the literal at the end of it.
//
// This used to resolve exactly ONE hop, which was all the current aliases
// need: --accent -> var(--brand) -> #2A6BCE is two levels, and the second was
// only ever reached because ratio() happened to call deref() on an already
// dereferenced value. A semantic alias layer is three deep by construction — a
// component token points at a semantic alias, which points at a theme
// rendering, which points at a primitive — and one hop resolves such a chain
// to the STRING `var(--the-next-link)`, which parseColor() reads as null.
//
// Measured, not assumed: making --brand-ink three deep fails EIGHT tests in
// this file under the single-hop parser and none under this one. Those eight
// are FALSE failures — the chain is valid CSS that a browser resolves without
// complaint — so the shallow parser was never a safety net here. It was a
// blocker on the alias layer, and it would have been paid off by whoever
// landed DS-2 loosening an assertion to get past it. That is the drift this
// file exists to prevent, so the parser is fixed instead.
//
// Three properties the single-hop version did not have:
//   * it follows the chain to the end
//   * a cycle throws with the path, rather than recursing until the stack dies
//   * a chain ending at an undeclared token throws AT THE BREAK, rather than
//     returning undefined and letting the caller blame the wrong end
//
// A value that merely CONTAINS var() — `var(--t-ui) var(--ease)` — is not an
// alias and is returned untouched. Reference integrity for those is asserted
// separately below.
const MAX_HOPS = 16;
function deref(tokens, value) {
  let current = value;
  const seen = [];
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const m = typeof current === 'string' && current.match(/^var\((--[a-z0-9-]+)\)$/i);
    if (!m) return current;
    const name = m[1];
    assert.equal(
      seen.includes(name),
      false,
      `var() cycle in the token layer: ${[...seen, name].join(' -> ')}`,
    );
    seen.push(name);
    const next = tokens[name];
    assert.ok(next, `${name} is referenced but not declared — chain: ${seen.join(' -> ')}`);
    current = next;
  }
  return assert.fail(`var() chain deeper than ${MAX_HOPS} hops: ${seen.join(' -> ')}`);
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

// The cascade, for reference checking only: the light block OVERRIDES the dark
// one, it does not replace it, so a light token may legitimately point at a
// token declared only in :root. Contrast is still measured per theme block,
// exactly as before — this scope is used by the two integrity tests below and
// by nothing else.
const SCOPE = { dark: DARK, light: { ...DARK, ...LIGHT } };

// The semantic alias layer, read out of the CSS between its own sentinels
// rather than from a hand-kept list here. A list would be the second copy that
// drifts: an alias added to globals.css and forgotten here would be asserted
// by nothing, which is the exact failure mode these tests exist to close.
const SEMANTIC = (() => {
  const begin = CSS.indexOf('@ds2-semantic-begin');
  const end = CSS.indexOf('@ds2-semantic-end');
  assert.ok(begin !== -1 && end > begin, 'the DS-2 semantic layer sentinels are missing');
  const out = {};
  for (const line of CSS.slice(begin, end).split('\n')) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/);
    if (m) out[m[1]] = m[2].trim();
  }
  assert.ok(Object.keys(out).length > 0, 'no semantic aliases found between the sentinels');
  return out;
})();

// ---------------------------------------------------- semantic alias layer ---

test('the semantic layer is references only — never a literal value', () => {
  // THE INVARIANT THAT MAKES ONE DECLARATION SAFE FOR TWO THEMES.
  //
  // The aliases are declared once, in :root, and are correct in the light
  // theme only because they hold no value of their own: `var(--bg-primary)`
  // resolves against whichever --bg-primary won on <html>, and the light block
  // sets that on the same element. The moment one of them is written as a
  // literal — `--surface-page: #0a0a0c` — it stops following the theme and
  // paints a dark surface onto the light admin, silently, with every existing
  // test still green.
  //
  // So the rule is structural rather than a matter of care: a semantic alias
  // is a var() reference or it is a bug.
  for (const [token, value] of Object.entries(SEMANTIC)) {
    assert.match(
      value,
      /^var\(--[a-z0-9-]+\)$/,
      `${token} is "${value}" — a semantic alias must be a bare var() reference, `
      + 'or it cannot follow the theme',
    );
  }
});

test('every semantic alias resolves to a real value in BOTH themes', () => {
  // The aliases live in :root, so the light block does not declare them; they
  // reach light values through their targets. Resolving each one under both
  // scopes proves that path actually works, in the direction that matters:
  // a light resolution is what the admin renders.
  for (const theme of ['dark', 'light']) {
    for (const token of Object.keys(SEMANTIC)) {
      const resolved = deref(SCOPE[theme], `var(${token})`);
      assert.ok(resolved, `${theme}: ${token} resolves to nothing`);
      assert.equal(
        /^var\(/.test(String(resolved)),
        false,
        `${theme}: ${token} does not bottom out — got ${resolved}`,
      );
    }
  }
});

test('a semantic alias never aliases another semantic alias', () => {
  // Keeps the layer two deep: semantic -> platform token -> literal. A
  // semantic name pointing at another semantic name is how the chain grows
  // until nobody can answer "what colour is this" without running the parser.
  for (const [token, value] of Object.entries(SEMANTIC)) {
    const target = value.match(/^var\((--[a-z0-9-]+)\)$/);
    if (!target) continue;
    assert.equal(
      Object.hasOwn(SEMANTIC, target[1]),
      false,
      `${token} points at ${target[1]}, which is itself a semantic alias`,
    );
  }
});

test('the semantic layer introduces no new value', () => {
  // DS-2 is a vocabulary, not a migration: every alias must resolve to a value
  // the platform ALREADY renders. If one resolves to something no existing
  // token holds, a value was invented and the "zero visual change" claim is
  // no longer true.
  for (const theme of ['dark', 'light']) {
    const existing = new Set(
      Object.entries(SCOPE[theme])
        .filter(([name]) => !Object.hasOwn(SEMANTIC, name))
        .map(([, v]) => deref(SCOPE[theme], v)),
    );
    for (const token of Object.keys(SEMANTIC)) {
      const resolved = deref(SCOPE[theme], `var(${token})`);
      assert.ok(
        existing.has(resolved),
        `${theme}: ${token} resolves to ${resolved}, which no existing token holds`,
      );
    }
  }
});

test('the semantic layer follows the theme rather than pinning one', () => {
  // The surfaces and the action fills must differ between the two themes. If
  // one resolves identically in both, it has stopped tracking its target —
  // which is precisely what a literal, or a reference to a token the light
  // block does not redeclare, would look like.
  for (const token of [
    '--surface-page', '--surface-card', '--surface-elevated', '--surface-hover',
    '--surface-input', '--action-primary-bg', '--action-primary-fg',
    '--action-secondary-fg', '--border-default', '--border-focus', '--text-link',
  ]) {
    const dark = deref(SCOPE.dark, `var(${token})`);
    const light = deref(SCOPE.light, `var(${token})`);
    assert.notEqual(dark, light, `${token} resolves to ${dark} in both themes`);
  }
});

test('the semantic action and status pairs are wired the right way round', () => {
  // A mapping typo is silent: --action-primary-fg pointing at --brand instead
  // of --brand-ink still resolves, still passes every structural test above,
  // and renders an invisible button. Measuring the pair through the SEMANTIC
  // names is what catches it — and it re-uses the same contrast machinery the
  // underlying tokens are already held to.
  for (const theme of ['dark', 'light']) {
    const scope = SCOPE[theme];
    const primary = ratio(scope, '--action-primary-fg', '--action-primary-bg');
    assert.ok(
      primary >= AA_TEXT,
      `${theme}: --action-primary-fg on --action-primary-bg is ${primary.toFixed(2)}:1`,
    );
    for (const tone of ['success', 'warning', 'danger']) {
      const r = ratio(scope, `--status-${tone}-fg`, `--status-${tone}-bg`, { composite: true });
      assert.ok(
        r >= AA_TEXT,
        `${theme}: --status-${tone}-fg on --status-${tone}-bg is ${r.toFixed(2)}:1`,
      );
    }
  }
});

// ------------------------------------------------------- token integrity ---

test('every var() reference in the token layer points at a declared token', () => {
  // An undeclared custom property is NOT a CSS error. The declaration using it
  // is simply dropped, and the surface renders as whatever was underneath —
  // which is exactly how rgba(var(--on-bg),0.3) once reached the public page
  // as nothing at all. There is no browser warning and no build failure, so
  // this is the only place a dangling reference can be caught.
  //
  // It is also the only place MOST tokens are checked at all: the contrast
  // tests read the colours the interface measures, which leaves --brand-soft,
  // --brand-line, --border, every --radius-* and every --font-* asserted by
  // nothing. Verified by mutation — a dangling reference on --brand-soft
  // fails this test and the cycle test, and no other test in the suite.
  for (const [name, tokens] of THEMES) {
    const scope = SCOPE[name];
    for (const [token, value] of Object.entries(tokens)) {
      for (const m of String(value).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        assert.ok(
          scope[m[1]],
          `${name}: ${token} references ${m[1]}, which is declared in neither block`,
        );
      }
    }
  }
});

test('no token resolves through a cycle, and every alias bottoms out', () => {
  // Routes every declared token through the guarded resolver, so a chain that
  // loops fails with its path instead of a stack overflow, and a chain that
  // ends nowhere fails at the break rather than at the caller.
  for (const [name, tokens] of THEMES) {
    for (const token of Object.keys(tokens)) {
      deref(SCOPE[name], `var(${token})`);
    }
  }
});

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

test('the gradient and its coloured glow stay retired, everywhere', () => {
  // Deleting these tokens without chasing every consumer would have left
  // `background: var(--accent-gradient)` resolving to nothing — invisible
  // buttons on checkout and on the email-verification landing, which are two
  // paths a customer cannot route around. The first grep for consumers only
  // covered three files and missed three more, so this guard scans the tree.
  const roots = ['pages', 'components', 'lib', 'styles'];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs|css)$/.test(entry.name)) continue;
      const body = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/--accent-gradient|--accent-glow/.test(body)) offenders.push(full);
    }
  };
  for (const r of roots) walk(join(HERE, '..', r));
  assert.deepEqual(offenders, [], `gradient tokens are referenced again in: ${offenders.join(', ')}`);
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

// ------------------------------------------------------------- typography ---

test('the type scale reaches a display size that can lead a screen', () => {
  const px = (v) => Number(String(v).replace('px', ''));
  const body = px(DARK['--text-md']);
  const lead = px(DARK['--text-4xl']);
  assert.ok(DARK['--text-3xl'], 'missing --text-3xl');
  assert.ok(lead, 'missing --text-4xl');
  // The old scale topped out at 26px against a 14px body — 1.86x, which is why
  // nothing could lead. Widen from the top; the body deliberately does not move.
  assert.ok(lead / body >= 3, `lead-to-body ratio is ${(lead / body).toFixed(2)}x, needs >= 3`);
});

test('tracking is defined as a function of size', () => {
  for (const token of ['--track-eyebrow', '--track-tight', '--track-lead']) {
    assert.ok(DARK[token], `missing ${token}`);
  }
  // Display sizes track negative, small caps track positive.
  assert.ok(DARK['--track-lead'].startsWith('-'), '--track-lead should be negative');
  assert.ok(!DARK['--track-eyebrow'].startsWith('-'), '--track-eyebrow should be positive');
});

test('the Arabic display face is one already in the font request', () => {
  assert.match(DARK['--font-display-ar'], /Reem Kufi/);
  const doc = readFileSync(join(HERE, '..', 'pages', '_document.js'), 'utf8');
  assert.match(doc, /Reem\+Kufi/, 'Reem Kufi is not in the single font <link>');
  // No fifth family: the four-into-one <link> was deliberate performance work.
  const families = (doc.match(/family=/g) || []).length;
  assert.ok(families <= 4, `font request grew to ${families} families`);
});

test('the Arabic eyebrow drops tracking and case', () => {
  // Arabic is cursive — letter-spacing severs the joins — and it has no case.
  // Applying the Latin eyebrow treatment to it is broken typography, so the
  // override is asserted rather than trusted to survive future edits.
  const rtl = CSS_CODE.match(/html\[dir='rtl'\]\s*\.eyebrow\s*{([^}]*)}/);
  assert.ok(rtl, 'no html[dir=rtl] .eyebrow override found');
  assert.match(rtl[1], /letter-spacing:\s*0/, 'RTL eyebrow must not be tracked');
  assert.match(rtl[1], /text-transform:\s*none/, 'RTL eyebrow must not be uppercased');
  assert.match(rtl[1], /--font-display-ar/, 'RTL eyebrow should use the display face');
});

test('figures are tabular so columns align in both locales', () => {
  const numeric = CSS_CODE.match(/\.numeric\s*{([^}]*)}/);
  assert.ok(numeric, 'no .numeric utility found');
  assert.match(numeric[1], /tabular-nums/);
});

// ----------------------------------------------------------------- motion ---

test('press is faster than hover, and hover is faster than entrance', () => {
  const ms = (v) => (String(v).endsWith('ms') ? Number(v.replace('ms', '')) : Number(v.replace('s', '')) * 1000);
  const press = ms(DARK['--t-press']);
  const ui = ms(DARK['--t-ui']);
  const enter = ms(DARK['--t-enter']);
  assert.ok(press < ui, 'press must be faster than hover');
  assert.ok(ui < enter, 'hover must be faster than entrance');
  // A press outside ~150ms stops feeling like a direct response to the finger.
  assert.ok(press <= 150, `--t-press is ${press}ms, needs <= 150ms to feel instant`);
});

test('motion is restrained: overshoot stays small', () => {
  // Lumetra's springs run to 1.56. The mark is geometric and chiselled; a
  // bouncy Designakum would contradict its own logo. 6% reads as physical
  // without reading as playful.
  // cubic-bezier(x1, y1, x2, y2) — a curve overshoots when either OUTPUT
  // control point (y1, y2) exceeds 1. Reading x2 instead of y1 is an easy way
  // to assert nothing at all, so both are checked.
  const [, y1, , y2] = DARK['--ease-pop'].match(/cubic-bezier\(([^)]*)\)/)[1].split(',').map(Number);
  const overshoot = Math.max(y1, y2);
  assert.ok(overshoot > 1, '--ease-pop should overshoot at all');
  assert.ok(overshoot <= 1.1, `--ease-pop overshoots to ${overshoot}, cap is 1.1`);
  // --ease and --ease-exit must NOT overshoot: a colour change that springs
  // reads as a glitch.
  for (const token of ['--ease', '--ease-exit']) {
    const [, a, , b] = DARK[token].match(/cubic-bezier\(([^)]*)\)/)[1].split(',').map(Number);
    assert.ok(Math.max(a, b) <= 1, `${token} must not overshoot`);
  }
});

test('the legacy transition tokens still resolve', () => {
  assert.match(DARK['--transition'], /var\(--t-ui\)/);
  assert.match(DARK['--transition-slow'], /var\(--t-enter\)/);
});

test('no surface re-declares the accent and shadows the brand', () => {
  // pages/admin.js used to set `--accent: #4f6ef2` on both .dashboard and
  // .signin-wrap. That shadowed the token layer, so setting the brand in
  // globals.css had no effect on the two largest surfaces in the product.
  const roots = ['pages', 'components'];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs)$/.test(entry.name)) continue;
      const body = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // A literal colour assigned to --accent* is a shadow; var(--brand*) is fine.
      const m = body.match(/--accent[a-z-]*:\s*(?!var\()[^;]+;/g);
      if (m) offenders.push(`${full}: ${m.join(' ')}`);
    }
  };
  for (const r of roots) walk(join(HERE, '..', r));
  assert.deepEqual(offenders, [], `accent is re-declared locally in: ${offenders.join(' | ')}`);
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
