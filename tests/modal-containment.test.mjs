// Tab-containment contract for the overlays that hold their own keyboard cycle.
//
// SCOPE — read before trusting this. There is no DOM environment in this repo
// (devDependencies is {} by project constraint; jsdom/testing-library/happy-dom are
// absent and must not be added), so nothing here presses Tab or observes focus. This
// guard reads source and asserts the containment logic is present, REACHABLE, scoped
// to the surface, wrapping in both directions, and filtering out controls that cannot
// take focus. It would catch containment being deleted, weakened, half-implemented,
// or left behind as dead code. It does NOT prove a browser keeps focus inside a
// dialog.
//
// Surfaces are listed explicitly rather than discovered, because "is this surface
// meant to be contained?" is a product decision, not something source can be scanned
// for. CropperModal joined the list in DS-23, once its focus target was decided.

// ── WHAT WENT WITH /admin, 2026-09-15 ────────────────────────────────────
// Five assertions here policed the image CROPPER: its aria keys in both
// dictionaries, its backdrop dismissal, and the copy of FOCUSABLE it carried.
// The cropper is not ported to the Studio and that is recorded, not accidental
// -- uploadImage already compresses and fits an avatar on the way up, so the
// crop it produced happens anyway, and a hand-crop can return on its own
// merits rather than as a reason to keep 5,172 lines alive.
//
// FOCUSABLE now has one definition, in ConfirmDialog, because the components
// that held the other copies are gone. A rule about copies staying identical
// has nothing left to compare.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translations } from '../lib/translations.js';

// CredentialsHandoff was here and was one of the canonical surfaces. It went
// with the credentials handover on 2026-08-28 — the owner no longer issues a
// password, so there is nothing to hand over and no modal to hand it over in.
// The contract it demonstrated is unchanged and still enforced on every surface
// below; there is simply one fewer surface.
// IconPickerModal and CropperModal lived in /admin, deleted 2026-09-15. Neither
// capability was lost the way it looks: the Studio picks a platform from a
// <select> that needs no searchable modal, and uploads are fitted automatically
// rather than hand-cropped. What is left is the gate that still exists, and
// ConfirmDialog, which is the primitive every destructive action in the console
// goes through -- so the contract is now checked where it is actually used
// rather than on two components that no longer exist.
const SURFACES = [
  { name: 'SetPasswordGate', file: 'pages/signin.js',                  component: 'SetPasswordGate', container: 'panelRef', canonical: false },
  { name: 'ConfirmDialog',   file: 'components/ui/ConfirmDialog.js',   component: 'ConfirmProvider', container: 'dialogRef', canonical: true },
];

// admin.js holds several contained surfaces, so a whole-file scan would only ever
// see the first one. Narrow to the component before looking for its handler.
function componentSource(src, component) {
  if (!component) return src;
  // `export function X(` as well as `function X(`: the surviving surfaces are
  // exported components, where the old ones were locals inside admin.js.
  let start = src.indexOf(`export function ${component}(`);
  if (start === -1) start = src.indexOf(`function ${component}(`);
  assert.notEqual(start, -1, `component ${component} not found`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\nfunction [A-Za-z]/);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

function tabHandler(surface) {
  const src = componentSource(readFileSync(surface.file, 'utf8'), surface.component);
  // Both declaration forms. /admin wrote `function onKey(e) {`; the surviving
  // components write `const onKeyDown = (e) => {`, which is the same handler
  // and was invisible to a matcher that only knew the first shape.
  for (const m of src.matchAll(/(?:function\s+onKey\w*\s*\([^)]*\)|const\s+onKey\w*\s*=\s*\([^)]*\)\s*=>)\s*\{/g)) {
    let depth = 0, i = src.indexOf('{', m.index);
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(m.index, i + 1);
    if (body.includes("'Tab'")) return body;
  }
  return null;
}

// A presence check alone can be fooled: an unconditional `return` after the Tab guard
// leaves every expected string in place as dead code. Every `return` past that guard
// must belong to an `if`, or the wrap below it never runs.
function reachableTabBody(handler) {
  const guard = handler.indexOf("if (e.key !== 'Tab') return;");
  assert.notEqual(guard, -1, 'Tab guard clause missing');
  const body = handler.slice(guard + "if (e.key !== 'Tab') return;".length);
  return body.replace(/if\s*\([^)]*\)\s*\{?[^;{}]*return[^;]*;/g, '');
}

test('every contained surface has a Tab handler', () => {
  for (const s of SURFACES) {
    assert.ok(tabHandler(s), `${s.name}: no keydown handler deals with Tab`);
  }
});

test('the wrap logic is reachable — no unconditional return above it', () => {
  for (const s of SURFACES) {
    assert.doesNotMatch(reachableTabBody(tabHandler(s)), /\breturn\b/,
      `${s.name}: an unconditional return sits above the wrap, so containment never runs`);
  }
});

test('containment wraps in both directions and blocks the default', () => {
  for (const s of SURFACES) {
    const h = tabHandler(s);
    assert.match(h, /e\.shiftKey/, `${s.name}: no Shift+Tab branch`);
    assert.match(h, /last\.focus\(\)/, `${s.name}: backward wrap missing`);
    assert.match(h, /first\.focus\(\)/, `${s.name}: forward wrap missing`);
    // Counting preventDefault is too weak: these handlers also preventDefault on
    // Escape, so a count survives losing one from a wrap branch. Check each branch.
    const back = h.match(/if\s*\(\s*e\.shiftKey[^)]*\)\s*\{([^}]*)\}/);
    const fwd = h.match(/else\s+if\s*\([^)]*\)\s*\{([^}]*)\}/);
    assert.ok(back && /preventDefault/.test(back[1]),
      `${s.name}: the Shift+Tab wrap does not preventDefault, so focus still escapes`);
    assert.ok(fwd && /preventDefault/.test(fwd[1]),
      `${s.name}: the Tab wrap does not preventDefault, so focus still escapes`);
  }
});

test('containment queries its own container, not the document', () => {
  for (const s of SURFACES) {
    const h = tabHandler(s);
    assert.match(h, new RegExp(`${s.container}\\.current\\??\\.?\\s*querySelectorAll`),
      `${s.name}: focusables are not scoped to the surface container`);
    assert.doesNotMatch(h, /document\.querySelectorAll/,
      `${s.name}: query widened to the whole document`);
  }
});

test('surfaces on the canonical contract exclude disabled and hidden controls', () => {
  for (const s of SURFACES.filter((x) => x.canonical)) {
    const h = tabHandler(s);
    assert.match(h, /FOCUSABLE/, `${s.name}: not using the canonical selector`);
    assert.match(h, /offsetParent !== null/, `${s.name}: hidden controls are not filtered out`);
  }
});



















// ---------------------------------------------------------------------------
// DS-24: ReactCrop accessibility labels are localised.
// The nine crop controls are deliberately in the tab cycle (DS-23), so their
// aria-labels are user-facing in both locales. react-image-crop ships English
// defaults, and getTranslator falls back to English for a missing key — so a
// missing Arabic entry would degrade silently rather than fail. These assertions
// read the actual object literal and the actual dictionaries.
// ---------------------------------------------------------------------------

// The keys the installed dependency actually declares — read from its own .d.ts so
// this cannot drift from the API on a version bump.
function requiredAriaKeys() {
  const dts = readFileSync('node_modules/react-image-crop/dist/index.d.ts', 'utf8');
  const start = dts.indexOf('ariaLabels: {');
  assert.notEqual(start, -1, 'react-image-crop no longer declares ariaLabels');
  const block = dts.slice(start, dts.indexOf('};', start));
  return [...block.matchAll(/(\w+):\s*string;/g)].map((m) => m[1]).sort();
}

// The object literal passed to ReactCrop, not any mention of the word elsewhere.
function cropAriaObject() {
  const src = componentSource(readFileSync('pages/signin.js', 'utf8'), 'CropperModal');
  const start = src.indexOf('const cropAriaLabels = {');
  assert.notEqual(start, -1, 'CropperModal no longer builds a cropAriaLabels object');
  const body = src.slice(start, src.indexOf('};', start));
  const pairs = new Map();
  for (const m of body.matchAll(/(\w+):\s*t\('([^']+)'\)/g)) pairs.set(m[1], m[2]);
  return pairs;
}








