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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translations } from '../lib/translations.js';

// CredentialsHandoff was here and was one of the canonical surfaces. It went
// with the credentials handover on 2026-08-28 — the owner no longer issues a
// password, so there is nothing to hand over and no modal to hand it over in.
// The contract it demonstrated is unchanged and still enforced on every surface
// below; there is simply one fewer surface.
const SURFACES = [
  { name: 'SetPasswordGate',    file: 'pages/admin.js', component: 'SetPasswordGate',  container: 'panelRef',  canonical: false },
  { name: 'IconPickerModal',    file: 'pages/admin.js', component: 'IconPickerModal',  container: 'pickerRef', canonical: true },
  { name: 'CropperModal',       file: 'pages/admin.js', component: 'CropperModal',     container: 'cmRef',     canonical: true },
];

// admin.js holds several contained surfaces, so a whole-file scan would only ever
// see the first one. Narrow to the component before looking for its handler.
function componentSource(src, component) {
  if (!component) return src;
  const start = src.indexOf(`function ${component}(`);
  assert.notEqual(start, -1, `component ${component} not found`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\nfunction [A-Za-z]/);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

function tabHandler(surface) {
  const src = componentSource(readFileSync(surface.file, 'utf8'), surface.component);
  for (const m of src.matchAll(/function onKey\s*\([^)]*\)\s*\{/g)) {
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

test('every copy of FOCUSABLE is identical to ConfirmDialog\'s', () => {
  const read = (f) => (readFileSync(f, 'utf8').match(/^const FOCUSABLE = (.*);$/m) || [])[1];
  const canonical = read('components/ui/ConfirmDialog.js');
  assert.ok(canonical, 'ConfirmDialog no longer defines FOCUSABLE');
  assert.match(canonical, /button:not\(\[disabled\]\)/, 'canonical selector stopped excluding disabled buttons');
  for (const f of ['pages/admin.js']) {
    assert.equal(read(f), canonical, `${f}: FOCUSABLE has drifted from ConfirmDialog`);
  }
});

test('IconPickerModal captures its opener before autoFocus and restores it', () => {
  const src = componentSource(readFileSync('pages/admin.js', 'utf8'), 'IconPickerModal');
  // React applies autoFocus in commitMount, before passive effects, so an effect-time
  // read of activeElement would return the search field instead of the opener.
  const capture = src.indexOf('openerRef.current = document.activeElement');
  assert.notEqual(capture, -1, 'IconPickerModal no longer captures its opener');
  assert.ok(capture < src.indexOf('useEffect'),
    'opener capture moved inside/after an effect — autoFocus will have moved focus by then');
  // Must match the JSX attribute, not the word: the comment above the capture
  // mentions autoFocus, so a bare /autoFocus/ would pass even if the prop were gone.
  assert.match(src, /<input\s+autoFocus\b/, 'the search field lost its autoFocus prop');
  assert.match(src, /opener\.isConnected/, 'restoration no longer guards against a detached opener');
  assert.match(src, /opener\.focus\(\)/, 'opener is captured but never restored');
});

test('DS-17/18/19 contracts were not displaced', () => {
  // The four CredentialsHandoff pins that stood here (capture-phase Escape and
  // its matching removal, prevOverflow, opener restoration) named a file that
  // no longer exists. Their CONTRACTS are not gone: the sweep above asserts
  // every one of them across every remaining contained surface, which is where
  // the enforcement always actually lived. These were extra pins on one
  // example, and the example was deleted.
  //
  // The DS-17 clipboard pin went the same way — see tests/clipboard-guard.
  const admin = readFileSync('pages/admin.js', 'utf8');
  // The DS-17 stacking-order pin and the DS-18 mount-scoped-focus pin both named
  // ClientPanel, which was deleted with the owner screens on 2026-08-27. The
  // contracts they protected are still enforced for every REMAINING surface by
  // the sweep above; there is simply no ClientPanel left to pin.
  // Escape must still close these two; containment must not have swallowed it.
  for (const s of SURFACES.filter((x) => ['IconPickerModal'].includes(x.name))) {
    assert.match(tabHandler(s), /e\.key === 'Escape'/, `${s.name}: Escape handling lost from the handler`);
  }
});

test('backdrop dismissal is preserved on the surfaces that had it', () => {
  // Containment was added without changing how these close. cm-bg is CropperModal,
  // which DS-21 left uncontained.
  const admin = readFileSync('pages/admin.js', 'utf8');
  // 'cp-bg' was ClientPanel's backdrop and left with the owner screens.
  for (const cls of ['picker-bg', 'cm-bg']) {
    assert.match(admin, new RegExp(`className="${cls}" onClick=`),
      `${cls} no longer dismisses on backdrop click`);
  }
});


test('CropperModal focuses Cancel on open — not Confirm, not the close button', () => {
  const src = componentSource(readFileSync('pages/admin.js', 'utf8'), 'CropperModal');
  // The ref must be on the cancel control itself, and the focus call must name that
  // ref. Asserting "a focus() appears somewhere" would survive a retarget.
  assert.match(src, /className="cm-cancel"[^>]*ref=\{cancelRef\}|ref=\{cancelRef\}[^>]*className="cm-cancel"/,
    'cancelRef is not attached to the .cm-cancel button');
  assert.match(src, /cancelRef\.current\?\.focus\(\)/, 'initial focus does not target cancelRef');
  assert.doesNotMatch(src, /confirmRef|cm-confirm[^>]*ref=/, 'focus was retargeted to the committing control');
  // and the focus call must actually be reachable inside a mount-scoped effect
  const eff = src.slice(src.indexOf('cancelRef.current?.focus()'));
  assert.match(eff.slice(0, 400), /\}, \[\]\);/, 'initial focus is not in a mount-scoped effect');
});

test('CropperModal captures its opener during render, not in an effect', () => {
  const src = componentSource(readFileSync('pages/admin.js', 'utf8'), 'CropperModal');
  const capture = src.indexOf('openerRef.current = document.activeElement');
  assert.notEqual(capture, -1, 'CropperModal no longer captures its opener');
  assert.ok(capture < src.indexOf('useEffect'),
    'opener capture moved into/after an effect — the dialog will have taken focus by then');
  assert.match(src, /opener\.isConnected/, 'restoration no longer guards against a detached opener');
  assert.match(src, /opener\.focus\(\)/, 'opener is captured but never restored');
});

test("CropperModal keeps react-image-crop's keyboard controls in the cycle", () => {
  // The library gives its crop area and eight drag handles tabIndex=0. They stay in
  // the cycle only while the canonical selector keeps its [tabindex] clause, so a
  // narrowing of the selector for this surface must fail here.
  const src = componentSource(readFileSync('pages/admin.js', 'utf8'), 'CropperModal');
  const h = tabHandler({ file: 'pages/admin.js', component: 'CropperModal' });
  assert.match(h, /querySelectorAll\(FOCUSABLE\)/, 'CropperModal stopped using the canonical selector');
  assert.doesNotMatch(h, /:not\(\[tabindex\]\)|querySelectorAll\('button/,
    'the selector was narrowed for this surface, excluding the crop controls');
  const canonical = (readFileSync('pages/admin.js', 'utf8').match(/^const FOCUSABLE = (.*);$/m) || [])[1];
  assert.match(canonical, /\[tabindex\]:not\(\[tabindex="-1"\]\)/,
    'the canonical selector lost its [tabindex] clause — the 9 crop controls drop out of the cycle');
  assert.doesNotMatch(src, /ReactCrop[^>]*tabIndex/, 'tabIndex was forced onto ReactCrop');
});

test('CropperModal Escape and backdrop behaviour are unchanged', () => {
  const src = componentSource(readFileSync('pages/admin.js', 'utf8'), 'CropperModal');
  assert.match(src, /e\.key === 'Escape'\) \{ e\.stopPropagation\(\); onCancel\(\); return; \}/,
    'Escape no longer cancels the crop');
  assert.match(src, /className="cm-bg" onClick=\{onCancel\}/, 'backdrop no longer cancels');
  assert.match(src, /className="cm-close"/, 'the close control disappeared');
  assert.match(src, /onClick=\{confirmCrop\}/, 'Confirm no longer runs confirmCrop');
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
  const src = componentSource(readFileSync('pages/admin.js', 'utf8'), 'CropperModal');
  const start = src.indexOf('const cropAriaLabels = {');
  assert.notEqual(start, -1, 'CropperModal no longer builds a cropAriaLabels object');
  const body = src.slice(start, src.indexOf('};', start));
  const pairs = new Map();
  for (const m of body.matchAll(/(\w+):\s*t\('([^']+)'\)/g)) pairs.set(m[1], m[2]);
  return pairs;
}

test('ReactCrop actually receives the localised ariaLabels prop', () => {
  const src = componentSource(readFileSync('pages/admin.js', 'utf8'), 'CropperModal');
  // Must be on the ReactCrop element itself, so slice the actual opening tag. A
  // [^>]* scan would stop at the '>' inside onChange={(c) => setCrop(c)} and never
  // reach the prop — the same regex trap that bit an earlier phase.
  const open = src.indexOf('<ReactCrop');
  assert.notEqual(open, -1, 'CropperModal no longer renders ReactCrop');
  const tag = src.slice(open, src.indexOf('>\n', open));
  assert.match(tag, /\bariaLabels=\{cropAriaLabels\}/,
    'ReactCrop is not receiving ariaLabels={cropAriaLabels}');
  assert.doesNotMatch(tag, /ariaLabels=\{\{/,
    'ariaLabels was inlined as a literal, bypassing the translation layer');
});

test('every ariaLabels key the dependency declares is supplied, via t()', () => {
  const required = requiredAriaKeys();
  const supplied = cropAriaObject();
  assert.equal(required.length, 9, `expected 9 ariaLabels keys, dependency declares ${required.length}`);
  assert.deepEqual([...supplied.keys()].sort(), required,
    'the supplied ariaLabels keys do not match what react-image-crop declares');
  // every value must come from the translator, never a hardcoded string
  for (const [key, tkey] of supplied) {
    assert.match(tkey, /^crop_aria_/, `${key} is not wired to a crop_aria_* translation key`);
  }
});

test('both dictionaries define every crop aria key, in their own language', () => {
  const supplied = cropAriaObject();
  for (const tkey of supplied.values()) {
    const ar = translations.ar[tkey];
    const en = translations.en[tkey];
    assert.ok(ar, `${tkey} missing from the Arabic dictionary`);
    assert.ok(en, `${tkey} missing from the English dictionary`);
    // getTranslator falls back to English on a missing/!Arabic value, so assert script.
    assert.match(ar, /[\u0600-\u06FF]/, `${tkey}: Arabic value is not in Arabic script`);
    assert.doesNotMatch(en, /[\u0600-\u06FF]/, `${tkey}: English value contains Arabic script`);
    assert.notEqual(ar, en, `${tkey}: Arabic and English values are identical`);
  }
});

test('the Arabic and English crop label sets are not swapped or shared', () => {
  const tkeys = [...cropAriaObject().values()];
  const arSet = tkeys.map((k) => translations.ar[k]);
  const enSet = tkeys.map((k) => translations.en[k]);
  for (const v of arSet) assert.doesNotMatch(v, /^[\x20-\x7E]+$/, 'an Arabic crop label is pure ASCII — English leaked into the Arabic set');
  for (const v of enSet) assert.match(v, /^[\x20-\x7E]+$/, 'an English crop label is not ASCII — Arabic leaked into the English set');
  assert.equal(new Set(arSet).size, arSet.length, 'two Arabic crop labels are identical — a value was copied over another');
  assert.equal(new Set(enSet).size, enSet.length, 'two English crop labels are identical — a value was copied over another');
});
