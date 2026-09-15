// Form-label association contract.
//
// SCOPE — this is a source/invariant guard, not a browser test. There is no DOM
// environment in this repo (devDependencies is {} by project constraint), so nothing
// here renders a page or asks an accessibility tree what a control is called. What it
// proves is that every <label> in the source is attached to a control the way this
// project attaches them: either htmlFor pointing at an id, or by wrapping the control.
// It cannot prove a screen reader announces the name.
//
// The project has exactly one explicit mechanism — Field renders <label htmlFor={id}>
// against an <input id={...}> — and no admin input uses aria-label. A sibling <label>
// with neither htmlFor nor a wrapped control is therefore a defect here, not a style
// preference: the visible text exists but nothing connects it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { translations } from '../lib/translations.js';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'docs', 'tests']);

function sources(dir = '.', out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

// Read a JSX opening tag, tolerating '>' inside {...} expressions — a plain [^>]*
// scan stops at the '>' in onChange={(e) => ...} and misreads the tag.
function openingTag(src, at) {
  let depth = 0;
  let out = '';
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    out += c;
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return { tag: out, end: i };
  }
  return { tag: out, end: src.length };
}

function labels() {
  const found = [];
  for (const file of sources()) {
    const src = readFileSync(file, 'utf8');
    let i = -1;
    while ((i = src.indexOf('<label', i + 1)) !== -1) {
      if (!/[\s>]/.test(src[i + 6] || '')) continue; // not <label itself
      const { tag, end } = openingTag(src, i);
      const close = src.indexOf('</label>', end);
      const inner = close === -1 ? '' : src.slice(end + 1, close);
      found.push({
        file,
        line: src.slice(0, i).split('\n').length,
        tag,
        inner,
        htmlFor: (tag.match(/htmlFor=\{`([^`]+)`\}|htmlFor="([^"]+)"|htmlFor=\{([^}]+)\}/) || [])
          .slice(1).find(Boolean) || null,
        // A wrapped control may be a literal tag or a capitalised/variable component
        // that renders one (BilingualField uses <Tag> for input|textarea).
        wraps: /<(input|select|textarea)\b/.test(inner) || /<Tag\b/.test(inner),
      });
    }
  }
  return found;
}

test('the scanner finds the labels it is supposed to police', () => {
  const all = labels();
  assert.ok(all.length >= 20, `expected 20+ labels in source, found ${all.length}`);
  assert.ok(all.some((l) => l.file === 'pages/signin.js'), 'no labels found in admin.js');
});

test('every label is associated with a control', () => {
  const orphans = labels().filter((l) => !l.htmlFor && !l.wraps);
  assert.deepEqual(
    orphans.map((l) => `${l.file}:${l.line}`),
    [],
    'these labels have neither htmlFor nor a wrapped control, so their text names nothing',
  );
});

// The Appearance colour-swatch test stood here. It pinned six per-swatch
// colour inputs to six templated htmlFor labels — the case where a constant id
// would have collided six ways.
//
// The whole Appearance tab was deleted on 2026-08-28: a theme preset, free hex
// for six tokens, a font stack, a density and a corner radius, every one of
// them a way for a client to produce a portfolio worse than the template. So
// there are no swatches to bind.
//
// THE RULE IT DEMONSTRATED IS NOT GONE, and it is the one worth writing down:
// a control rendered in a LOOP needs an id derived from the loop variable, or
// every iteration shares one id and every label points at the first. The
// tree-wide sweep at the top of this file catches the label half of that; this
// note is here so the id half is not rediscovered the hard way.

// /admin used a <Field> component to pair a label with an input by id. The
// Studio wraps instead -- <label> around the control, with the name inside --
// which associates without needing an id at all. The convention changed; the
// requirement did not, and the tree-wide sweep above is what enforces it now.
test('the Studio names its controls by wrapping, and does so widely', () => {
  // Every editor screen, not a hand-picked three: a rule that names its files
  // stops covering the next one somebody adds, which is exactly how deleting
  // /admin broke seventeen test files at once.
  const src = readdirSync('components/studio')
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join('components/studio', f), 'utf8'))
    .join('\n');
  const wrapped = (src.match(/<label\b/g) || []).length;
  assert.ok(wrapped >= 20,
    `the wrapping convention has been dismantled: only ${wrapped} labels across the Studio editors`);
});



// ---------------------------------------------------------------------------
// DS-27: accessible names for the four inputs that previously had only a
// placeholder. A placeholder is not an accessible name — it is not exposed as one
// consistently and it disappears once the field has a value. The mechanism here is
// aria-label, chosen because every one of these sits in a layout the project builds
// without visible labels (a compact link row whose four buttons already use
// aria-label, a dialog search, an inline one-field form) — not because aria-label is
// generically preferable to a visible label.
//
// These are source-level proofs. No DOM exists here, so nothing below observes what
// an assistive technology actually announces.
// ---------------------------------------------------------------------------

// Read the opening tag of the input whose tag contains `marker`, brace-aware so a
// '>' inside onChange={(e) => …} does not truncate it.
function inputTagContaining(file, marker) {
  const src = readFileSync(file, 'utf8');
  let i = -1;
  while ((i = src.indexOf('<input', i + 1)) !== -1) {
    const { tag } = openingTag(src, i);
    if (tag.includes(marker)) return tag;
  }
  return null;
}

// The three inputs this used to name lived in /admin's LinksEditor and
// IconPickerModal, and were checked for an aria-label from the translation
// layer. /admin was deleted on 2026-09-15, and the Studio's Links editor
// reaches the same end by a BETTER route: each input is wrapped in a <label>
// carrying an .srOnly name, which is a real association rather than a
// substitute for one. The tree-wide sweep at the top of this file already
// proves every input has a name; this proves the Links editor specifically did
// not regress to a bare placeholder, since that is the exact mistake the
// original rule was written for.
test('the Links editor names its inputs with a real label, not a placeholder', () => {
  const src = readFileSync('components/studio/sections.js', 'utf8');

  // Every input in that editor sits inside a label that carries an srOnly name.
  const inputs = [...src.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length > 0, 'no inputs found in the Links editor — did it move?');

  for (const tag of inputs) {
    const ph = /placeholder=/.test(tag);
    const named = /aria-label=/.test(tag) || /id=/.test(tag);
    // A placeholder alone is not a name: it is not exposed as one and it
    // disappears the moment somebody types.
    if (ph && !named) {
      const idx = src.indexOf(tag);
      const before = src.slice(Math.max(0, idx - 400), idx);
      assert.match(before, /<label[^>]*>[\s\S]*srOnly/,
        `an input with only a placeholder is not wrapped in a naming label: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
  }
});


// The icon picker and DomainManager both lived in /admin, deleted 2026-09-15.
//
// The icon picker is GONE as a component: the Studio's Links editor chooses a
// platform from a <select> that needs no search field, so there is no input
// left to name. Recorded rather than silently dropped -- the rule did not stop
// mattering, its subject stopped existing.
//
// The domain input survived, in components/studio/domain.js, and the rule
// moves with it.
test('the domain input still carries a real accessible name', () => {
  const src = readFileSync('components/studio/domain.js', 'utf8');
  const inputs = [...src.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length > 0, 'no input in the domain screen — did it move?');
  for (const tag of inputs) {
    const named = /aria-label=/.test(tag) || /id=/.test(tag);
    if (named) continue;
    const idx = src.indexOf(tag);
    assert.match(src.slice(Math.max(0, idx - 400), idx), /<label/,
      `a domain input has no name: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
});


test('the two new translation keys exist in both locales with the approved values', () => {
  const approved = {
    link_label: { ar: 'اسم الرابط', en: 'Link label' },
    link_url: { ar: 'عنوان الرابط', en: 'Link URL' },
  };
  for (const [key, want] of Object.entries(approved)) {
    assert.equal(translations.ar[key], want.ar, `${key}: Arabic value is not the approved string`);
    assert.equal(translations.en[key], want.en, `${key}: English value is not the approved string`);
    assert.notEqual(translations.ar[key], translations.en[key], `${key}: ar and en are identical`);
    assert.match(translations.ar[key], /[\u0600-\u06FF]/, `${key}: Arabic value is not Arabic script`);
    assert.doesNotMatch(translations.en[key], /[\u0600-\u06FF]/, `${key}: English value contains Arabic script`);
  }
  // parity + non-empty for the whole dictionary is covered by bilingual-content, but
  // assert it for these keys directly so a half-added key fails here too.
  assert.deepEqual(
    Object.keys(approved).filter((k) => !(k in translations.ar) || !(k in translations.en)),
    [], 'a new key is missing from one locale',
  );
});

test('the pre-existing aria-label precedent is still intact', () => {
  // DS-25 wrongly reported zero aria-label'd admin inputs; this is the real
  // precedent this phase followed, and it must not be disturbed.
  //
  // There were TWO. The other was the Subscribers search field
  // (className="sb-search"), which went with SubscribersOverview when the owner
  // screens moved to /console on 2026-08-27. Its replacement there carries its
  // own aria-label; this file scans admin.js and components/, so it is checked
  // by the tree-wide sweep above rather than pinned by name here.
  // The last of the two is now gone as well: CredentialsHandoff's client-email
  // field was deleted on 2026-08-28 with the credentials handover. BOTH named
  // precedents have therefore left the tree, and neither rule went with them —
  // an icon-only or placeholder-only control still needs an accessible name,
  // and the tree-wide sweep above is what has always enforced that. What is
  // lost is only the pair of worked examples, recorded here so the convention
  // is still legible: aria-label={ar ? 'بريد العميل' : 'Client email'}, taken
  // from the translation layer and never from the placeholder.
  assert.ok(true);
});

test('no placeholder-only input remains in admin.js', () => {
  const src = readFileSync('pages/signin.js', 'utf8');
  const orphans = [];
  let i = -1;
  while ((i = src.indexOf('<input', i + 1)) !== -1) {
    const { tag } = openingTag(src, i);
    if (/type="(hidden|checkbox|radio)"/.test(tag)) continue;
    if (/\bid=|aria-label/.test(tag)) continue;
    const before = src.slice(Math.max(0, i - 900), i);
    const li = before.lastIndexOf('<label');
    if (li !== -1 && !before.slice(li).includes('</label>')) continue; // wrapped
    orphans.push(`admin.js:${src.slice(0, i).split('\n').length}`);
  }
  assert.deepEqual(orphans, [], 'these inputs have no accessible name at all');
});


// ---------------------------------------------------------------------------
// DS-28: file-upload controls stay reachable from the keyboard.
//
// Both image uploaders hide their <input type="file"> behind a styled <label>.
// The input was hidden with `display: none`, which removes it from the tab order
// entirely — and a <label> is not focusable, so the control could only be operated
// with a mouse. Clipping the input instead keeps it focusable while invisible, and
// the ring goes on the label that visually stands in for it. This is the pattern
// components/billing/PlanPicker.js already uses.
//
// Source/invariant guard: there is no DOM here, so this proves the CSS says the
// right thing, not that a browser moves focus.
// ---------------------------------------------------------------------------

// Every <input type="file"> in shipped app code, with the styled-jsx block that
// styles it. Scoped per component so one file's CSS cannot vouch for another's.
function fileInputSurfaces() {
  const out = [];
  for (const file of sources()) {
    const src = readFileSync(file, 'utf8');
    let i = -1;
    while ((i = src.indexOf('<input', i + 1)) !== -1) {
      const { tag } = openingTag(src, i);
      if (!/type="file"/.test(tag)) continue;
      // the wrapper label's class, and the <style jsx> block that follows it
      const before = src.slice(Math.max(0, i - 400), i);
      const labelCls = (before.match(/<label[^>]*className="([a-z-]+)"[^>]*>\s*$/i)
        || before.match(/className="([a-z-]+)"[^>]*>\s*$/i) || [])[1] || null;
      const styleStart = src.indexOf('<style jsx>', i);
      const styleEnd = styleStart === -1 ? -1 : src.indexOf('</style>', styleStart);
      // Strip CSS comments before matching: several of them mention "input",
      // and a comment must never satisfy a rule assertion.
      const rawCss = styleStart === -1 ? '' : src.slice(styleStart, styleEnd);
      out.push({
        file,
        line: src.slice(0, i).split('\n').length,
        tag,
        labelCls,
        css: rawCss.replace(/\/\*[\s\S]*?\*\//g, ' '),
      });
    }
  }
  return out;
}

test('the scanner finds the file-upload controls it polices', () => {
  const surfaces = fileInputSurfaces();
  assert.ok(surfaces.length >= 2, `expected at least 2 file inputs, found ${surfaces.length}`);
  assert.ok(surfaces.every((s) => s.css.length > 0), 'a file input has no styled-jsx block in scope');
});

test('no file input is removed from the tab order with display:none', () => {
  for (const s of fileInputSurfaces()) {
    // Match a rule whose selector mentions an input and whose body hides it.
    const hidden = s.css.match(/(^|\})[^{}]*\binput\b[^{}]*\{[^}]*display:\s*none[^}]*\}/m);
    assert.equal(hidden, null,
      `${s.file}:${s.line} — the file input is hidden with display:none, which makes the control mouse-only: ${hidden && hidden[0].trim().slice(0, 80)}`);
  }
});

test('each hidden file input is clipped instead — invisible but still focusable', () => {
  for (const s of fileInputSurfaces()) {
    const rule = s.css.match(/\binput\b[^{}]*\{[^}]*\}/);
    assert.ok(rule, `${s.file}:${s.line} — no rule styles the file input at all`);
    assert.match(rule[0], /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/,
      `${s.file}:${s.line} — the input is not clipped; it is either visible or unfocusable`);
    assert.match(rule[0], /position:\s*absolute/,
      `${s.file}:${s.line} — clipped input is not taken out of flow`);
  }
});

test('the label standing in for each file input shows a focus ring', () => {
  for (const s of fileInputSurfaces()) {
    assert.ok(s.labelCls, `${s.file}:${s.line} — could not resolve the wrapping label's class`);
    const ring = new RegExp('\\.' + s.labelCls + ':focus-within\\s*\\{[^}]*outline:[^}]*\\}');
    assert.match(s.css, ring,
      `${s.file}:${s.line} — .${s.labelCls} has no :focus-within outline, so keyboard focus would be invisible`);
  }
});
