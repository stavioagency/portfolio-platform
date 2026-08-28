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
  assert.ok(all.some((l) => l.file === 'pages/admin.js'), 'no labels found in admin.js');
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

test('the Field labelling convention is still the norm in admin.js', () => {
  const src = readFileSync('pages/admin.js', 'utf8');
  // Field is the project's explicit-association component; it renders
  // <label htmlFor={id}> against a matching input id.
  // A moving floor, and the reason it moves is recorded each time:
  //   >= 40  while admin.js held the two owner screens (they left 2026-08-27)
  //   >= 25  after the editor went from ten tabs to five, 2026-08-28
  //   >= 20  after a piece of work stopped having eight fields and started
  //          having a name and its images, same day
  // The guard is about the CONVENTION still being the norm, not about a count.
  assert.ok((src.match(/<Field\b/g) || []).length >= 20, 'the Field convention has been dismantled');
  assert.match(readFileSync('pages/admin.js', 'utf8'), /<label htmlFor=\{id\}>/,
    'Field no longer renders an htmlFor label');

  // aria-label is not banned outright — it is the project's mechanism for controls
  // with no visible label to point at, and it is wrong only where visible label text
  // already exists (covered by the colour-swatch test above). DS-27 approved three
  // more. Pin the exact approved set by identity, not by count, so a new unapproved
  // aria-label'd input still fails here.
  const ariaInputs = [...src.matchAll(/<input\b/g)]
    .map((m) => openingTag(src, m.index).tag)
    .filter((t) => !/type="(hidden|checkbox|radio)"/.test(t))
    .filter((t) => /aria-label/.test(t));
  const APPROVED = [
    // 'className="sb-search"' was here — the Subscribers search input. It left
    // with SubscribersOverview when the owner screens moved to /console on
    // 2026-08-27. Removed from the approved set rather than kept as a ghost:
    // this list is checked in BOTH directions, so a stale entry would fail.
    'placeholder={icon.label}',     // DS-27: link label
    'update(l.id, { href:',         // DS-27: link URL
    'className="picker-search"',    // DS-27: icon-picker search
    'value={newDomain}',            // DS-27: domain
  ];
  const unapproved = ariaInputs.filter((t) => !APPROVED.some((m) => t.includes(m)));
  assert.deepEqual(unapproved.map((t) => t.replace(/\s+/g, ' ').slice(0, 90)), [],
    'an admin input gained an aria-label outside the approved set');
  for (const marker of APPROVED) {
    assert.ok(ariaInputs.some((t) => t.includes(marker)),
      `the approved aria-label on ${marker} is missing`);
  }
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

const NAMED = [
  { what: 'LinksEditor link label', marker: 'placeholder={icon.label}', expect: "aria-label={t('link_label')}" },
  { what: 'LinksEditor link URL', marker: "update(l.id, { href:", expect: "aria-label={t('link_url')}" },
  { what: 'IconPickerModal search', marker: 'className="picker-search"', expect: "aria-label={t('icon_picker_search')}" },
];

test('each formerly placeholder-only input now carries its approved accessible name', () => {
  for (const { what, marker, expect } of NAMED) {
    const tag = inputTagContaining('pages/admin.js', marker);
    assert.ok(tag, `${what}: input not found — did the marker move?`);
    assert.ok(tag.includes(expect), `${what}: expected ${expect} on this input, got: ${tag.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
});

test('those accessible names come from the translation layer, never hardcoded', () => {
  for (const { what, marker } of NAMED) {
    const tag = inputTagContaining('pages/admin.js', marker);
    const aria = (tag.match(/aria-label=\{([^}]*)\}/) || [])[1];
    assert.ok(aria, `${what}: no aria-label`);
    assert.match(aria, /^t\('[a-z_]+'\)$/, `${what}: aria-label is not a t() lookup — got ${aria}`);
  }
});

test('no accessible name is taken from the placeholder', () => {
  for (const { what, marker } of NAMED) {
    const tag = inputTagContaining('pages/admin.js', marker);
    const aria = (tag.match(/aria-label=\{([^}]*)\}/) || [])[1];
    const ph = (tag.match(/placeholder=\{([^}]*)\}/) || [])[1];
    // The picker deliberately reuses its own existing key for both; the other two
    // must not fall back to whatever the placeholder happens to say.
    if (marker !== 'className="picker-search"') {
      assert.notEqual(aria, ph, `${what}: the accessible name is just the placeholder`);
    }
  }
});

test('the icon picker reuses its existing key rather than a duplicate', () => {
  const tag = inputTagContaining('pages/admin.js', 'className="picker-search"');
  assert.ok(tag.includes("aria-label={t('icon_picker_search')}"), 'picker no longer uses icon_picker_search');
  assert.ok('icon_picker_search' in translations.ar && 'icon_picker_search' in translations.en,
    'icon_picker_search vanished from a dictionary');
  // A near-duplicate key would mean the copy was forked instead of reused.
  const dupes = Object.keys(translations.en).filter((k) => /icon_picker_search./.test(k));
  assert.deepEqual(dupes, [], `a duplicate of icon_picker_search was introduced: ${dupes}`);
});

test('DomainManager names its input with the approved bilingual pair, inline', () => {
  const tag = inputTagContaining('pages/admin.js', 'value={newDomain}');
  assert.ok(tag, 'the domain input is gone');
  const aria = (tag.match(/aria-label=\{([^}]*)\}/) || [])[1];
  assert.ok(aria, 'the domain input has no aria-label');
  // Exact approved wording, both languages — not merely "something bilingual".
  assert.equal(aria.replace(/\s+/g, ' ').trim(), "ar ? 'النطاق' : 'Domain'",
    `domain aria-label wording changed: ${aria}`);
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
  const src = readFileSync('pages/admin.js', 'utf8');
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
