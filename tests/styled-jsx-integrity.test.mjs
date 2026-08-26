// styled-jsx template integrity — the gap that let a non-compiling file pass.
//
// WHY THIS EXISTS, precisely: during DS-6 a comment was added inside a
// <style jsx> block that contained backticks in its prose. A backtick closes
// the surrounding template literal, so components/ui/Badge.js stopped parsing
// and `next build` failed with "Expected '}', got 'none'".
//
// THE FULL TEST SUITE PASSED ANYWAY — 674 tests, 0 failures — because every
// test that reads a component reads it as TEXT. Nothing in this project parses
// a component as JavaScript, so nothing noticed. Only the build did.
//
// This guard closes that specific, demonstrated hole. It is deliberately NARROW:
// it does not claim to be a parser and it does not replace the build. It checks
// the one structural property that the failure depended on, and it does so
// without adding a dependency (this project has five runtime deps and no
// devDependencies, and that is a hard constraint).
//
// WHAT IT MUST NOT DO: ban `${...}`. components/ui/Toast.js legitimately
// interpolates EXIT_MS into its animation shorthand, and a guard that broke
// that would be worse than the bug it prevents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.next|\.git/.test(full)) walk(full);
        continue;
      }
      if (/\.js$/.test(entry.name)) out.push(full);
    }
  };
  for (const r of ['pages', 'components']) walk(join(ROOT, r));
  return out;
}

const OPEN = '<style jsx';
const TEMPLATE_START = '{`';
const TEMPLATE_END = '`}</style>';

// Every styled-jsx template in the tree, as { file, inner }.
function templates() {
  const found = [];
  for (const file of sources()) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');
    let cursor = 0;
    for (;;) {
      const tag = src.indexOf(OPEN, cursor);
      if (tag === -1) break;
      const start = src.indexOf(TEMPLATE_START, tag);
      const end = src.indexOf(TEMPLATE_END, start);
      found.push({
        rel,
        start,
        end,
        inner: start !== -1 && end !== -1 ? src.slice(start + TEMPLATE_START.length, end) : null,
      });
      cursor = end === -1 ? tag + OPEN.length : end + TEMPLATE_END.length;
    }
  }
  return found;
}

test('every styled-jsx block opens and closes its template literal', () => {
  const broken = templates()
    .filter((t) => t.start === -1 || t.end === -1)
    .map((t) => t.rel);
  assert.deepEqual(
    [...new Set(broken)],
    [],
    'a <style jsx> block has no matching {` … `}</style> — the file will not parse',
  );
});

test('no styled-jsx template contains a raw backtick', () => {
  // The exact DS-6 failure. A backtick anywhere inside the template ends it
  // early, and everything after it is reinterpreted as JavaScript.
  const offenders = [];
  for (const t of templates()) {
    if (t.inner === null) continue;
    // An escaped backtick is legal; a raw one is not. Count only unescaped.
    const raw = [...t.inner.matchAll(/(^|[^\\])`/g)].length;
    if (raw > 0) offenders.push(`${t.rel} (${raw})`);
  }
  assert.deepEqual(
    [...new Set(offenders)],
    [],
    'a backtick inside a <style jsx> template closes it early. If it is in a '
    + 'comment, use quotes instead — prose is not worth a build failure',
  );
});

test('the guard actually reached the styled-jsx blocks it claims to check', () => {
  // A scanner that matches nothing passes both assertions above. Pin the corpus
  // so a broken walk or a changed tag spelling fails loudly instead of quietly.
  const files = sources();
  const found = templates();
  assert.ok(files.length >= 40, `only ${files.length} .js files walked — the scan is broken`);
  assert.ok(found.length >= 30, `only ${found.length} styled-jsx templates found — the scan is broken`);
  assert.ok(
    found.every((t) => t.inner === null || t.inner.length > 0),
    'a template was matched but read as empty',
  );
});

test('legitimate ${} interpolation is not treated as a fault', () => {
  // components/ui/Toast.js interpolates EXIT_MS into its exit animation. This
  // is correct styled-jsx and must stay passing — a guard that forced it out
  // would be a regression disguised as hardening. Asserted so nobody "hardens"
  // this file into banning it.
  const withInterpolation = templates().filter((t) => t.inner && t.inner.includes('${'));
  assert.ok(
    withInterpolation.length >= 1,
    'no template interpolates any more — if that is real, this negative control needs rewriting',
  );
  for (const t of withInterpolation) {
    const raw = [...t.inner.matchAll(/(^|[^\\])`/g)].length;
    assert.equal(raw, 0, `${t.rel}: interpolating template also carries a raw backtick`);
  }
});
