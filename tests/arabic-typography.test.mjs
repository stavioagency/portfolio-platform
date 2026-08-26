// Arabic typography — the two rules the design system will not bend on.
//
// THE RULE, from styles/globals.css beside the .eyebrow definition:
//
//   "LATIN gets uppercase + tracking. ARABIC CAN HAVE NEITHER:
//      - Arabic is cursive. letter-spacing severs the joins between letterforms,
//        which is broken typography rather than a style choice.
//      - Arabic has no letter case, so text-transform does nothing but risk
//        mangling transliterated fragments."
//
// docs/design/design.md §10 states it as product law: "No letter-spacing and no
// uppercase on Arabic."
//
// globals.css enforces it for .eyebrow. Nothing enforced it for the ~24 places
// that set tracking or uppercase in their own styled-jsx, and two of them —
// the Studio and Console placeholder headings — rendered Arabic at
// --track-tight (-0.02em) with no RTL reset. Every other site in the codebase
// already carried one, which is what made those two a defect rather than a
// design choice: the codebase had already decided, 20+ times over.
//
// WHAT THIS DOES NOT DO: it does not require an RTL override on elements that
// cannot render Arabic. components/CredentialsHandoff.js letter-spaces a
// monospace <code dir="ltr"> holding a username and password — Latin by
// construction, explicitly direction-pinned, and correctly exempt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// pages/admin.js is protected scope for the design-system phases and already
// carries an RTL reset beside every one of its uppercase labels; pages/index.js
// and the portfolio renderer are protected public-rendering surfaces.
const OUT_OF_SCOPE = /^(pages\/index\.js|pages\/\[slug\]\.js|pages\/_document\.js|pages\/admin\.js|components\/ui\/BrandGlyph\.js|components\/portfolio\/)/;

// Elements that are direction-pinned to LTR cannot render Arabic, so the rule
// does not apply to them. Recorded explicitly rather than silently skipped.
const LTR_PINNED = new Set(['components/CredentialsHandoff.js :: .ch-row code.mono']);

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

// A rule "tracks" if it sets a non-zero letter-spacing or uppercases text.
const TRACKS = /letter-spacing:\s*(-?[\d.]+em|var\(--track-(?:tight|lead|eyebrow|wide|caps)\))/;
const UPPERCASES = /text-transform:\s*uppercase/;
const RESETS = /letter-spacing:\s*(0|normal)|text-transform:\s*none/;
const IS_RTL_SELECTOR = /dir=.rtl/;

// Every CSS rule in a file, as { selector, body }.
function rules(src) {
  return [...src.matchAll(/([^{}\n]{1,90})\{([^{}]*)\}/g)].map((m) => ({
    sel: m[1].trim(),
    body: m[2],
  }));
}

function violations() {
  const found = [];
  for (const file of sources()) {
    const rel = relative(ROOT, file);
    const all = rules(code(file));
    const resets = all.filter((r) => IS_RTL_SELECTOR.test(r.sel) && RESETS.test(r.body));
    for (const r of all) {
      if (IS_RTL_SELECTOR.test(r.sel)) continue;
      if (!TRACKS.test(r.body) && !UPPERCASES.test(r.body)) continue;
      const key = `${rel} :: ${r.sel}`;
      if (LTR_PINNED.has(key)) continue;
      // The reset must target this selector: either the same text, or the same
      // trailing simple selector after the :global(...) prefix.
      const bare = r.sel.split(/\s+/).pop();
      const covered = resets.some((x) => {
        const t = x.sel.replace(/^.*\)\s*/, '').trim();
        return t === r.sel || t === bare;
      });
      if (!covered) found.push(key);
    }
  }
  return found;
}

test('no element that can render Arabic is letter-spaced or uppercased without an RTL reset', () => {
  assert.deepEqual(
    violations(),
    [],
    'Arabic is cursive — letter-spacing severs its joins, and it has no letter case. '
    + 'Each selector above needs a [dir=\'rtl\'] rule resetting letter-spacing to 0 '
    + '(and text-transform to none if it uppercases), as ~20 other sites already do',
  );
});

test('the two Studio/Console headings carry their RTL reset', () => {
  // The specific defect this file was written for. Pinned by name so a future
  // edit that drops the override fails here with the reason, not just in the
  // tree-wide sweep.
  for (const rel of ['pages/studio/index.js', 'pages/console/index.js']) {
    const src = code(join(ROOT, rel));
    assert.match(
      src,
      /letter-spacing: var\(--track-tight\)/,
      `${rel}: the Latin heading no longer tracks — if intentional, this pin needs rewriting`,
    );
    assert.match(
      src,
      /:global\(\[dir='rtl'\]\) h1 \{ letter-spacing: 0; \}/,
      `${rel}: the RTL letter-spacing reset is gone; Arabic headings would be tracked`,
    );
  }
});

test('the LTR-pinned exemption is real, not a blanket skip', () => {
  // The one exemption must keep earning itself: the element has to still be
  // direction-pinned to ltr. If that attribute disappears the element can render
  // Arabic, and the exemption must be reconsidered rather than silently held.
  const src = readFileSync(join(ROOT, 'components/CredentialsHandoff.js'), 'utf8');
  const codeEls = [...src.matchAll(/<code\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(codeEls.length > 0, 'CredentialsHandoff no longer renders a <code> element');
  // EVERY one, not merely one of them. An earlier draft asserted only that some
  // <code> carried dir="ltr", which a mutation survived: removing the pin from
  // the letter-spaced element still left a sibling matching.
  const unpinned = codeEls.filter((el) => !/dir="ltr"/.test(el));
  assert.deepEqual(
    unpinned,
    [],
    'a <code> element in CredentialsHandoff is no longer pinned to dir="ltr". It can '
    + 'now render Arabic, so the letter-spacing exemption in LTR_PINNED no longer holds',
  );
});

test('the sweep actually reaches the tree it claims to check', () => {
  // A scanner matching nothing passes the first assertion vacuously.
  const files = sources();
  assert.ok(files.length >= 30, `only ${files.length} in-scope files walked`);
  const tracked = files.filter((f) => {
    const src = code(f);
    return rules(src).some((r) => !IS_RTL_SELECTOR.test(r.sel) && (TRACKS.test(r.body) || UPPERCASES.test(r.body)));
  });
  assert.ok(tracked.length >= 5, `only ${tracked.length} files found setting tracking/uppercase`);
});
