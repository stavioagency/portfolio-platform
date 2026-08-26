// A clipboard write can reject: the API rejects when the permission is denied or
// the document is not focused, and it throws outright when navigator.clipboard is
// absent. A write that is neither awaited nor caught floats an unhandled rejection
// and lets the caller report a copy that never happened.
//
// CredentialsHandoff.copy() is the project's established shape for this: await the
// write inside try/catch, and confirm to the user only on success. This guard holds
// every clipboard write in the repository to that shape. It asserts a property of
// each call site, not where any call site happens to sit in a file.

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

test('the scanner actually finds the known clipboard writes', () => {
  const sites = callSites();
  assert.ok(sites.length >= 2, `expected at least 2 clipboard writes, found ${sites.length}`);
  assert.ok(sites.some((s) => s.file.includes('CredentialsHandoff')), 'missed the CredentialsHandoff write');
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
