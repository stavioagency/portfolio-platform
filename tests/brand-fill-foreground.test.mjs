// Anything filled with the brand/accent takes the brand ink. Nothing else.
//
// THE RULE. docs/design/design.md §3: "One brand blue, #2A6BCE, derived through
// color-mix() from a single token. **No raw hex outside the token block.**"
//
// styles/globals.css goes further and states the consequence next to the token,
// because it had already worked out the arithmetic:
//
//   --brand-ink: #0C1530;   /* navy ON the fill: white would be 3.4:1 */
//
// The dark theme lightens --brand to #598CD9 so the fill separates from the
// page, and white text on that measures 3.40:1 — under the 4.5 AA needs for
// normal text. --accent-fg / --brand-ink exist for exactly this position and
// flip per theme: navy on dark, white on light.
//
// WHAT THIS CAUGHT. pages/reset-password.js styled its primary link-button
// `background: var(--accent); color: #fff`, so the dark theme rendered it at
// 3.40:1 while every other filled control in the product used the token. The
// codebase had already decided this eleven times over; that one site had not
// been told.
//
// EXEMPTION, recorded rather than silently skipped: an element that sets no
// color at all is decorative. components/studio/OwnerBar.js fills a .diamond
// and a .dot with --brand, and both render as <span aria-hidden="true" /> with
// no children — there is no text to contrast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { contrastRatio } from '../lib/contrast.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CSS = readFileSync(join(ROOT, 'styles', 'globals.css'), 'utf8');

// Protected public-rendering surfaces and pages/admin.js are out of scope for
// the design-system phases; admin.js additionally paints client-chosen colours.
const OUT_OF_SCOPE = /^(pages\/index\.js|pages\/\[slug\]\.js|pages\/_document\.js|pages\/admin\.js|components\/ui\/BrandGlyph\.js|components\/portfolio\/)/;

function block(selector) {
  const start = CSS.indexOf(selector);
  assert.notEqual(start, -1, `selector not found: ${selector}`);
  const open = CSS.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') { depth--; if (depth === 0) break; }
  }
  const out = {};
  for (const line of CSS.slice(open + 1, i).split('\n')) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const DARK = block(':root');
const LIGHT = block("[data-admin-theme='light']");
const SCOPE = { dark: DARK, light: { ...DARK, ...LIGHT } };

function resolve(theme, name) {
  let v = `var(${name})`;
  for (let hop = 0; hop <= 16; hop++) {
    const m = v.match(/^var\((--[a-z0-9-]+)\)$/);
    if (!m) return v;
    v = SCOPE[theme][m[1]];
    if (v === undefined) return undefined;
  }
  return v;
}

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (!/node_modules|\.next|\.git/.test(full)) walk(full); continue; }
      if (/\.js$/.test(entry.name)) out.push(full);
    }
  };
  for (const r of ['pages', 'components']) walk(join(ROOT, r));
  return out.filter((f) => !OUT_OF_SCOPE.test(relative(ROOT, f)));
}

const code = (f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Rules that fill with the brand and DO set a text colour.
function filledRules() {
  const found = [];
  for (const file of sources()) {
    const rel = relative(ROOT, file);
    for (const m of code(file).matchAll(/([^{}\n]{1,80})\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      const body = m[2];
      if (!/background:\s*var\(--(accent|brand)\)/.test(body)) continue;
      const fg = body.match(/(?:^|;)\s*color:\s*([^;]+)/);
      found.push({ rel, sel, fg: fg ? fg[1].trim() : null });
    }
  }
  return found;
}

test('every brand-filled element takes its foreground from the brand ink token', () => {
  const offenders = filledRules()
    .filter((r) => r.fg !== null)                                  // decorative: no text
    .filter((r) => !/^var\(--(accent-fg|brand-ink)\)$/.test(r.fg))
    .map((r) => `${r.rel} :: ${r.sel} -> color: ${r.fg}`);
  assert.deepEqual(
    offenders,
    [],
    'a control filled with --accent/--brand sets its own foreground. On the dark '
    + 'theme white on that fill is 3.40:1, under AA — use var(--accent-fg), which '
    + 'flips to navy on dark and white on light',
  );
});

test('the brand ink actually clears AA on the brand fill, in both themes', () => {
  // The property the token exists to guarantee. If --accent-fg were ever
  // repointed at something unreadable, the rule above would still pass while
  // every filled button in the product went under AA.
  for (const theme of ['dark', 'light']) {
    const fill = resolve(theme, '--accent');
    const ink = resolve(theme, '--accent-fg');
    const r = contrastRatio(ink, fill);
    assert.ok(r !== null, `${theme}: unparseable ${ink} on ${fill}`);
    assert.ok(r >= 4.5, `${theme}: --accent-fg on --accent is ${r.toFixed(2)}:1, needs 4.5`);
  }
});

test('raw white on the brand fill is measurably the defect, not a preference', () => {
  // Pins the arithmetic that makes this a bug rather than taste, and pins the
  // globals.css comment that predicted it. If the dark theme ever renders the
  // brand light enough for white to pass, this fails and the rule can be revisited.
  const darkFill = resolve('dark', '--accent');
  const white = contrastRatio('#ffffff', darkFill);
  assert.ok(
    white < 4.5,
    `white on the dark brand fill is now ${white.toFixed(2)}:1 — it used to be 3.40:1. `
    + 'If the fill changed deliberately, revisit this guard',
  );
});

test('the sweep reaches the tree, and the decorative exemption is real', () => {
  const files = sources();
  assert.ok(files.length >= 18, `only ${files.length} in-scope files walked`);
  const filled = filledRules();
  // Was 8 while components/studio and components/shell existed; 6 after those
  // were deleted with the Studio/Console shells; 5 since 2026-08-28, when
  // components/CredentialsHandoff.js went with the credentials handover. Five
  // is what the shipped product actually has.
  assert.ok(filled.length >= 5, `only ${filled.length} brand-filled rules found — scan is broken`);
  // The OwnerBar exemption that used to be checked here is gone with
  // components/studio/. Nothing in the product now fills with the brand and
  // renders text inside it without an ink, which is what this test is for.
});
