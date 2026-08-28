// DS-5 — every CSS custom-property reference in the product must resolve.
//
// WHY THIS EXISTS: an undeclared custom property is NOT a CSS error. The
// declaration using it is dropped at computed-value time and the property
// silently falls back to its inherited or initial value. No browser warning, no
// build failure, no runtime exception — the element simply renders wrong, and
// only for the one rule that referenced it.
//
// The existing token tests cannot see this. tests/design-tokens.test.mjs checks
// reference integrity INSIDE styles/globals.css, so a token that exists is
// verified — but a component reaching for a name that was never declared is
// invisible to it. That gap is not hypothetical: it shipped. See the known
// defect pinned at the bottom of this file.
//
// A reference is legitimate three ways, and the guard accepts all three:
//
//   1. the token is declared in styles/globals.css
//   2. the token is declared BY THE SAME FILE — as a CSS declaration, as a
//      style-object key ('--pf-accent': …), or via setProperty('--pf-accent')
//   3. the reference carries an explicit fallback: var(--x, something)
//
// Anything else is a name that resolves to nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ---------------------------------------------------------------- scanning ---

const GLOBALS = readFileSync(join(ROOT, 'styles', 'globals.css'), 'utf8');
const DECLARED = new Set(
  [...GLOBALS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]),
);

function sources(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.next|\.git/.test(full)) walk(full);
        continue;
      }
      if (/\.(js|mjs|css)$/.test(entry.name)) out.push(full);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

// Comments legitimately name tokens that were retired, deferred or are being
// explained — scanning them would fire the guard on its own documentation, the
// same trap tests/design-tokens.test.mjs and tests/semantic-conversion.test.mjs
// both document. Only full-line // comments are stripped, so a `//` inside a URL
// survives; it cannot produce a var() match either way.
function code(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// The three ways a file can declare a property for itself.
function locallyDeclared(body) {
  const local = new Set();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:/g)) local.add(m[1]);           // CSS
  for (const m of body.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/g)) local.add(m[1]);   // style object key
  for (const m of body.matchAll(/setProperty\(\s*['"](--[a-z0-9-]+)['"]/g)) local.add(m[1]); // runtime
  return local;
}

// Every var() reference that resolves to nothing, as { file, token }.
function danglingReferences() {
  const found = [];
  for (const file of [...sources('pages'), ...sources('components')]) {
    const rel = relative(ROOT, file);
    const body = code(file);
    const local = locallyDeclared(body);
    for (const m of body.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,|\))/g)) {
      const [, token, next] = m;
      if (next === ',') continue;            // has an explicit fallback
      if (DECLARED.has(token)) continue;     // declared globally
      if (local.has(token)) continue;        // declared by this file
      found.push({ file: rel, token });
    }
  }
  return found;
}

// ------------------------------------------------------------ known defect ---
//
// EMPTY, and it should stay that way.
//
// DS-5 introduced this list holding exactly one entry: pages/reset-password.js
// referenced var(--text-base), a Designakum name (15px) that this platform's
// scale never declared. The declaration was invalid at computed-value time, so
// font-size — an inherited property — resolved to the browser default, and that
// one input rendered at 16px while every other input in the product was 14px.
// DS-6 FIX-3 pointed it at --text-md and the entry was deleted, which is the
// only correct way for an entry to leave this list.
//
// THIS IS NOT A SUPPRESSION MECHANISM. A new dangling reference is a bug to
// fix, not a line to add here — the length assertion below exists to make that
// difficult on purpose.
const KNOWN_UNDECLARED = [];

const key = (r) => `${r.file} :: ${r.token}`;

// ----------------------------------------------------------------- guards ---

test('every var() reference in pages/ and components/ resolves to something', () => {
  const pinned = new Set(KNOWN_UNDECLARED.map(key));
  const unexpected = danglingReferences().filter((r) => !pinned.has(key(r)));
  // Deduplicated with counts. Renaming one token in globals.css orphans every
  // consumer at once — 81 for --radius-md — and eighty identical lines buries
  // the one fact that matters, which is WHICH token and WHERE.
  const tally = new Map();
  for (const r of unexpected) tally.set(key(r), (tally.get(key(r)) || 0) + 1);
  const reported = [...tally].sort().map(([k, n]) => (n > 1 ? `${k} (x${n})` : k));
  assert.deepEqual(
    reported,
    [],
    'these custom properties are referenced but never declared, and carry no '
    + 'fallback — each one is a CSS declaration that silently does nothing',
  );
});

test('the known-defect list is empty, and every entry must earn its place', () => {
  // Two directions, both of which matter. The list is empty because the one bug
  // it held was fixed; growing it again is how a guard quietly becomes a
  // suppression file. And any entry that IS added must correspond to a real
  // dangling reference, so a stale pin cannot outlive the defect it describes.
  assert.equal(
    KNOWN_UNDECLARED.length,
    0,
    'an entry was added to KNOWN_UNDECLARED. A custom property that resolves to '
    + 'nothing is a bug to fix, not a line to add here',
  );
  const dangling = danglingReferences().map(key);
  for (const entry of KNOWN_UNDECLARED) {
    assert.ok(
      dangling.includes(key(entry)),
      `${key(entry)} does not dangle — delete the stale pin`,
    );
  }
});

test('the guard actually scans the tree it claims to', () => {
  // A scanner that silently matches nothing passes every assertion above. These
  // pin the corpus so a broken walk or a bad regex fails loudly instead.
  const files = [...sources('pages'), ...sources('components')];
  // 29 since 2026-08-28: CredentialsHandoff was deleted with the credentials
  // handover. A tripwire for a broken walk, not a coverage target.
  assert.ok(files.length >= 29, `only ${files.length} source files found — the walk is broken`);
  assert.ok(DECLARED.size >= 100, `only ${DECLARED.size} tokens parsed from globals.css`);

  const refs = files.reduce(
    (n, f) => n + [...code(f).matchAll(/var\(\s*--[a-z0-9-]+/g)].length,
    0,
  );
  assert.ok(refs >= 500, `only ${refs} var() references seen — the scan is not reaching the styles`);
});

test('the three legitimate declaration forms are all recognised', () => {
  // PortfolioRenderer declares --pf-* as style-object keys and pages/index.js
  // sets --accent through setProperty. Both are real mechanisms, and a guard
  // that only understood CSS syntax would report them as bugs — which is how a
  // guard gets weakened by the first person it inconveniences.
  const local = locallyDeclared(code(join(ROOT, 'components', 'portfolio', 'PortfolioRenderer.js')));
  for (const token of ['--pf-accent', '--pf-heading', '--pf-pad', '--pf-gap']) {
    assert.ok(local.has(token), `${token} is set by PortfolioRenderer but not recognised as local`);
  }
  // This was --card-radius until 2026-08-28, when the public portfolio stopped
  // letting a tenant set its corner radius (a presentation control, not a
  // content one) and the setProperty call went with it. --accent is the one
  // value a tenant still supplies at runtime, so it is what the runtime form is
  // now pinned against. The mechanism being proved is unchanged.
  const index = locallyDeclared(code(join(ROOT, 'pages', 'index.js')));
  assert.ok(index.has('--accent'), 'setProperty() declarations are not recognised');
});
