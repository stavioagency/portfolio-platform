// A clipboard write can reject: the API rejects when the permission is denied or
// the document is not focused, and it throws outright when navigator.clipboard is
// absent. A write that is neither awaited nor caught floats an unhandled rejection
// and lets the caller report a copy that never happened.
//
// The required shape: await the write inside try/catch, and confirm to the user
// only on success. This guard holds every clipboard write in the repository to
// that shape. It asserts a property of each call site, not where any call site
// happens to sit in a file.
//
// THERE ARE CURRENTLY NO CALL SITES. Every one of them was in the credentials
// handover — copying a generated password to send to a client — and that went
// away on 2026-08-28 when clients started signing themselves up. The guard is
// deliberately kept rather than deleted: it costs nothing while the count is
// zero, and it arms itself the moment somebody adds a copy button. What it
// cannot do while empty is prove it still works, so the scanner is checked
// against a sample below instead of against the tree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.next', 'tests']);

function sources(dir = '.', out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

function callSites() {
  const sites = [];
  for (const file of sources()) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.writeText\s*\(/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      sites.push({ file, line, before: src.slice(Math.max(0, m.index - 60), m.index), after: src.slice(m.index, m.index + 240) });
    }
  }
  return sites;
}

test('the scanner still works, and still recognises a bad write', () => {
  // With no real call sites left, a scanner that silently matched nothing would
  // pass every assertion below forever. Run it over a sample instead.
  const good = 'try { await navigator.clipboard.writeText(x); ok(); } catch (e) { fail(e); }';
  const bad = 'navigator.clipboard.writeText(x); ok();';
  const find = (src) => [...src.matchAll(/\.writeText\s*\(/g)].map((m) => ({
    before: src.slice(0, m.index),
    after: src.slice(m.index, m.index + 240),
  }));
  assert.equal(find(good).length, 1, 'the scanner no longer finds a clipboard write at all');
  assert.match(find(good)[0].before, /await\s+[\w.?]*$/, 'a correctly awaited write reads as un-awaited');
  assert.doesNotMatch(find(bad)[0].before, /await\s+[\w.?]*$/, 'an un-awaited write reads as awaited');
  assert.match(find(good)[0].after, /catch\s*\(/, 'a guarded write reads as unguarded');
});

test('every clipboard write is awaited', () => {
  for (const s of callSites()) {
    assert.match(s.before, /await\s+[\w.?]*$/, `${s.file}:${s.line} — clipboard write is not awaited`);
  }
});

test('every clipboard write is inside a try/catch', () => {
  for (const s of callSites()) {
    assert.match(s.after, /catch\s*\(/, `${s.file}:${s.line} — clipboard write has no catch in scope`);
  }
});

test('no clipboard write reports success unconditionally', () => {
  // A success signal must not sit between the write and its catch: reaching it
  // would mean the caller confirmed before knowing the write landed.
  for (const s of callSites()) {
    const upToCatch = s.after.slice(0, s.after.search(/catch\s*\(/));
    assert.doesNotMatch(upToCatch, /toast\.success|setDone\(true\)|mark\(/,
      `${s.file}:${s.line} — success is reported before the write is known to have landed`);
  }
});
