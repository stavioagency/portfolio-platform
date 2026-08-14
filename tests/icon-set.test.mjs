// Tests for components/ui/Icon.js.
//
// WHY IT PARSES SOURCE RATHER THAN IMPORTING: Icon.js is JSX, and the test
// runner has no transform — adding one would mean a devDependency, which this
// project does not have. Reading the source is enough for the two properties
// that actually matter: the glyphs the UI asks for exist, and the set stays
// visually uniform. A set is only a set if a new glyph is indistinguishable in
// weight and grid from an old one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'components', 'ui', 'Icon.js'), 'utf8');

// The header comment documents the very rules asserted below and therefore
// contains the strings they look for. Count declarations, not documentation.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Keys of the ICONS object: `name: (` or `'quoted-name': (` or `name: <path`.
const names = [...SRC.matchAll(/^\s{2}'?([a-z][a-z-]*)'?:\s*[(<]/gm)].map((m) => m[1]);

test('the navigation glyphs the sidebar already uses are all present', () => {
  for (const n of ['home', 'users', 'user', 'card', 'receipt', 'folder', 'link',
    'palette', 'chart', 'globe', 'settings']) {
    assert.ok(names.includes(n), `missing navigation icon: ${n}`);
  }
});

test('the state and attention glyphs exist', () => {
  // Without these the admin reaches for an emoji whenever it needs to say
  // something is late, paused or retrying — and an emoji cannot inherit
  // currentColor, cannot follow the theme, and renders differently per OS.
  for (const n of ['alert', 'alert-triangle', 'clock', 'calendar', 'pause', 'play',
    'refresh', 'credit-card', 'trend-up', 'trend-down', 'image', 'eye', 'search']) {
    assert.ok(names.includes(n), `missing state icon: ${n}`);
  }
});

test('every glyph name is unique', () => {
  assert.equal(new Set(names).size, names.length, 'duplicate icon name');
});

test('the set stays on one grid and one stroke weight', () => {
  // One viewBox and one stroke width for the whole set, set on the <svg> rather
  // than per glyph — that is what keeps sizes matching when icons sit in a row.
  assert.match(CODE, /viewBox="0 0 24 24"/);
  assert.equal((CODE.match(/viewBox=/g) || []).length, 1, 'more than one viewBox');
  assert.match(CODE, /stroke="currentColor"/);
  assert.equal((CODE.match(/stroke="/g) || []).length, 1, 'a glyph sets its own stroke');
  // No glyph may carry its own fill: one filled icon in a row of stroked ones
  // breaks the uniform weight the set exists to hold.
  assert.equal(/<(path|circle|rect|polyline|line)[^>]*\sfill="/.test(CODE), false,
    'a glyph sets its own fill');
});

test('glyphs are decorative unless given a title', () => {
  assert.match(SRC, /aria-hidden=\{title \? undefined : 'true'\}/);
  assert.match(SRC, /role=\{title \? 'img' : undefined\}/);
});

// ---- Regression guard: emoji must not return as an interface glyph ---------
//
// The count of "emoji in the app" was always misleading, because it swept up
// comments, the ✓ and ★ typographic marks, and the legacy emoji→brand-icon
// map. What actually mattered was much smaller: a handful of places where a
// colour emoji was standing in for an icon. An emoji cannot inherit
// currentColor, cannot follow the theme, does not scale with the type ramp,
// and renders as a different picture on every OS — so as an interface glyph it
// is a bug, while in prose it is just a word.
//
// This asserts the distinction rather than banning the character class: emoji
// used as an affordance fails, emoji used as tone passes.
const PICTOGRAPH = /[\u{1F300}-\u{1FAFF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}]/u;

function jsxOnly(src) {
  // Comments describe the rule and would trip it. Strings that are message
  // copy are prose by definition; the guard is about markup.
  //
  // The `/*` must be preceded by whitespace or `{` to count as a comment
  // opener. Without that, `accept="image/*"` on the file input opens a comment
  // that runs to the next `*/` — 9KB of markup later — and every guard below
  // goes quietly blind over the range it ate. A guard that cannot see is worse
  // than no guard, because it reports green.
  return src.replace(/(?<=[\s{])\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const ADMIN = jsxOnly(readFileSync(join(HERE, '..', 'pages', 'admin.js'), 'utf8'));

test('no component takes an emoji as its icon', () => {
  // `icon="🔍"` and `icon="⚠️"` were EmptyState props sitting beside sibling
  // call sites that already passed <Icon />. Same prop, two different visual
  // languages.
  const bad = [...ADMIN.matchAll(/icon=(["'])([^"']*)\1/g)]
    .filter((m) => PICTOGRAPH.test(m[2]))
    .map((m) => m[0]);
  assert.deepEqual(bad, [], `emoji passed as an icon prop: ${bad.join(', ')}`);
});

test('no button labels itself with an emoji', () => {
  // A button is an affordance end to end: the glyph in it is interface, not
  // tone, and it has to take the button's colour on hover, focus and disable.
  const bad = [...ADMIN.matchAll(/<button[\s\S]{0,400}?<\/button>/g)]
    .filter((m) => PICTOGRAPH.test(m[0]))
    .map((m) => m[0].slice(0, 90));
  assert.deepEqual(bad, [], `emoji inside a button: ${bad.join(' | ')}`);
});

test('the upload affordance uses a glyph, not a camera emoji', () => {
  assert.equal(/📷/u.test(ADMIN), false, 'the image picker went back to 📷');
});
