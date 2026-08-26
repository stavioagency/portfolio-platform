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

test('the Appearance colour swatches are each bound to their own label', () => {
  const src = readFileSync('pages/admin.js', 'utf8');
  const at = src.indexOf('className="color-item"');
  assert.notEqual(at, -1, 'the colour-item row is gone');
  const row = src.slice(at, src.indexOf('</div>', at));

  // The input must carry an id, and it must be keyed on the map variable so each of
  // the six swatches gets a distinct one — a constant id would collide six ways.
  const input = openingTag(row, row.indexOf('<input')).tag;
  const inputId = (input.match(/id=\{`([^`]+)`\}/) || [])[1];
  assert.ok(inputId, 'the colour input has no templated id');
  assert.match(inputId, /\$\{k\}/, 'the colour input id is not per-swatch — six controls would share one id');

  const label = openingTag(row, row.indexOf('<label')).tag;
  const labelFor = (label.match(/htmlFor=\{`([^`]+)`\}/) || [])[1];
  assert.ok(labelFor, 'the colour label has no templated htmlFor');
  assert.equal(labelFor, inputId, 'htmlFor and id do not match, so the label points at nothing');

  // The decision was id/htmlFor, not aria-label; and no visible text was added.
  assert.doesNotMatch(input, /aria-label/, 'aria-label was introduced instead of the project mechanism');
  assert.match(label, /^<label/, 'the label element was replaced');
});

test('the Field labelling convention is still the norm in admin.js', () => {
  const src = readFileSync('pages/admin.js', 'utf8');
  // Field is the project's explicit-association component; it renders
  // <label htmlFor={id}> against a matching input id.
  assert.ok((src.match(/<Field\b/g) || []).length >= 40, 'the Field convention has been dismantled');
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
    'className="sb-search"',        // pre-existing subscriber search
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

test('the pre-existing aria-label precedents are still intact', () => {
  // DS-25 wrongly reported zero aria-label'd admin inputs; these two are the real
  // precedent this phase followed, and they must not be disturbed.
  const search = inputTagContaining('pages/admin.js', 'className="sb-search"');
  assert.ok(search && /aria-label=\{ar \? 'بحث' : 'Search'\}/.test(search),
    'the subscriber search aria-label precedent was altered');
  const email = inputTagContaining('components/CredentialsHandoff.js', 'value={draftEmail}');
  assert.ok(email && /aria-label=\{ar \? 'بريد العميل' : 'Client email'\}/.test(email),
    'the CredentialsHandoff client-email aria-label precedent was altered');
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
