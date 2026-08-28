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
// cannot render Arabic — one explicitly pinned dir="ltr" is Latin by
// construction. The single exemption was components/CredentialsHandoff.js,
// which letter-spaced a monospace <code dir="ltr"> holding a username and a
// password. That file went with the credentials handover on 2026-08-28, so
// LTR_PINNED is now EMPTY. The mechanism is kept because the next
// direction-pinned Latin element will need it; an empty set can excuse nothing,
// which is a stronger guarantee than the exemption ever was.
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
const LTR_PINNED = new Set();

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

test('the exemption list is empty, and every future entry must earn its place', () => {
  // The test that stood here read CredentialsHandoff's <code dir="ltr"> to prove
  // the one exemption pointed at something real rather than being a blanket
  // skip. That file is gone. The replacement pins the stronger property: while
  // the list is empty, no selector anywhere is excused from the rule.
  //
  // An entry added later must name a real, direction-pinned element — the same
  // bar the deleted test enforced, restated so it is not lost with the file.
  assert.equal(
    LTR_PINNED.size,
    0,
    'an exemption was added to LTR_PINNED. It must name an element that is still '
    + 'explicitly dir="ltr", or it is excusing Arabic from the rule',
  );
});

test('the sweep actually reaches the tree it claims to check', () => {
  // A scanner matching nothing passes the first assertion vacuously.
  const files = sources();
  // Recalibrated when pages/studio, components/studio and components/shell were
  // deleted. The number is a broken-scan tripwire, not a target.
  assert.ok(files.length >= 18, `only ${files.length} in-scope files walked`);
  const tracked = files.filter((f) => {
    const src = code(f);
    return rules(src).some((r) => !IS_RTL_SELECTOR.test(r.sel) && (TRACKS.test(r.body) || UPPERCASES.test(r.body)));
  });
  // Was 3 until components/CredentialsHandoff.js was deleted on 2026-08-28 —
  // it letter-spaced the monospace credential block. The number is a
  // broken-scan tripwire, not a target: it moves when files legitimately go,
  // and it must never be lowered to make a real regression pass.
  assert.ok(tracked.length >= 2, `only ${tracked.length} files found setting tracking/uppercase`);
});
