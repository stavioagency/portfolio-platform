// Overlay focus-ownership contract.
//
// SCOPE OF THIS GUARD — read before trusting it. This repository has no DOM test
// environment (0 devDependencies is a project constraint, and jsdom/testing-library
// are absent), so no test here can observe real focus movement. What this guard
// asserts is the *structure* of the contract in source: that an overlay which takes
// focus on open does so in a mount-scoped effect, captures the element it took focus
// from, and hands focus back only to a node still in the document. It would catch a
// regression that removes or rescopes those pieces. It cannot prove the browser ends
// up with focus in the right place.
//
// Why mount-scoped matters: ClientPanel previously focused inside an effect keyed on
// its inline `onClose` prop, whose identity changes every parent render, so the panel
// shell stole focus back on each re-render.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ClientPanel was the second surface here until 2026-08-27, when the owner
// screens moved to /console and it went with them. The RULE it demonstrated is
// unchanged and still enforced below against every surface that remains.
const SURFACES = [
  { file: 'components/CredentialsHandoff.js', name: 'CredentialsHandoff', focusCall: 'modalRef.current?.focus()' },
];

// Return the source of the useEffect that encloses `needle`, plus its dependency array.
function enclosingEffect(src, needle) {
  const at = src.indexOf(needle);
  if (at === -1) return null;
  const start = src.lastIndexOf('useEffect(() => {', at);
  if (start === -1) return null;
  let depth = 0;
  let i = src.indexOf('{', start);
  const bodyStart = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const body = src.slice(bodyStart, i + 1);
  const tail = src.slice(i + 1, i + 40);
  const deps = (tail.match(/^\s*,\s*(\[[^\]]*\])/) || [])[1] ?? null;
  return { body, deps };
}

test('both overlays still take focus on open', () => {
  for (const s of SURFACES) {
    const src = readFileSync(s.file, 'utf8');
    assert.ok(src.includes(s.focusCall), `${s.name}: no longer focuses itself on open`);
    assert.ok(enclosingEffect(src, s.focusCall), `${s.name}: focus call is not inside a useEffect`);
  }
});

test('initial focus is mount-scoped, not tied to a re-rendering dependency', () => {
  for (const s of SURFACES) {
    const eff = enclosingEffect(readFileSync(s.file, 'utf8'), s.focusCall);
    assert.equal(eff.deps, '[]',
      `${s.name}: initial focus sits in an effect with deps ${eff.deps} — it must be [] or it refocuses on re-render`);
  }
});

test('each overlay captures the element it took focus from', () => {
  for (const s of SURFACES) {
    const eff = enclosingEffect(readFileSync(s.file, 'utf8'), s.focusCall);
    assert.match(eff.body, /document\.activeElement/,
      `${s.name}: does not capture the opener, so it cannot hand focus back`);
  }
});

test('focus is handed back only to a node still in the document', () => {
  for (const s of SURFACES) {
    const eff = enclosingEffect(readFileSync(s.file, 'utf8'), s.focusCall);
    const cleanup = eff.body.slice(eff.body.indexOf('return () =>'));
    assert.ok(cleanup.length > 0, `${s.name}: effect has no cleanup`);
    assert.match(cleanup, /\.focus\(\)/, `${s.name}: cleanup never restores focus`);
    assert.match(cleanup, /isConnected/,
      `${s.name}: restores focus without checking the opener is still attached`);
  }
});

test('DS-17 nested-overlay invariants are still in place', () => {
  const ch = readFileSync('components/CredentialsHandoff.js', 'utf8');
  assert.match(ch, /addEventListener\('keydown', onKey, true\)/, 'capture-phase Escape lost');
  assert.match(ch, /removeEventListener\('keydown', onKey, true\)/, 'capture flag lost on removal');
  assert.match(ch, /prevOverflow/, 'prevOverflow scroll-lock lost');
  // The admin.js half of this pin was ClientPanel's scroll lock, deleted with
  // the owner screens. CredentialsHandoff above still carries it.
});
