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

// THIS LIST IS EMPTY, AND THAT IS NOT AN OVERSIGHT.
//
// ClientPanel left on 2026-08-27 with the owner screens; CredentialsHandoff
// left on 2026-08-28 with the credentials handover, when clients started
// signing themselves up and no password was ever issued again. Neither rule
// changed — both surfaces did.
//
// The file is kept rather than deleted because the contract is still the one
// any future overlay must meet, and re-deriving it from scratch is exactly the
// cost this repository's guards exist to avoid. Add a surface here and every
// assertion below arms itself.
//
// The hazard of an empty list is that every sweep passes vacuously, so the last
// test checks the PARSER against a sample instead of against the tree.
const SURFACES = [];

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

// The DS-17 nested-overlay pins that stood here named ClientPanel and then
// CredentialsHandoff, and both files are gone. tests/modal-containment.test.mjs
// enforces the same invariants across every surface that still exists, which is
// where the enforcement always actually lived.

test('the parser still works, so an empty list is not silent coverage', () => {
  // With no surfaces left, every sweep above iterates nothing and passes. That
  // is honest only if the machinery would still catch a real regression, so it
  // is exercised here against a correct sample and three broken ones.
  const good = `useEffect(() => {
    const opener = document.activeElement;
    modalRef.current?.focus();
    return () => { if (opener && opener.isConnected) opener.focus(); };
  }, []);`;
  const eff = enclosingEffect(good, 'modalRef.current?.focus()');
  assert.ok(eff, 'the parser no longer finds the effect enclosing a focus call');
  assert.equal(eff.deps, '[]', 'mount-scoped deps are no longer read correctly');
  assert.match(eff.body, /document\.activeElement/, 'opener capture is no longer detected');
  assert.match(eff.body.slice(eff.body.indexOf('return () =>')), /isConnected/,
    'the attached-opener check is no longer detected');

  const rescoped = good.replace('}, []);', '}, [onClose]);');
  assert.equal(enclosingEffect(rescoped, 'modalRef.current?.focus()').deps, '[onClose]',
    'a re-rendering dependency would not be caught');
  assert.equal(enclosingEffect(good, 'somethingElse.focus()'), null,
    'the parser matches a focus call that is not there');
});
