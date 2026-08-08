// The set-password gate in pages/admin.js — the invariants that stop the
// "asked to set a password again" loop from coming back.
//
// THE BUG THIS GUARDS
// -------------------
// The link-arrival signal used to be `const arrivedViaPasswordLink = fn()`,
// evaluated once at module load and true for the rest of the page's life. The
// auth listener re-arms the obligation on SIGNED_IN while that signal is true —
// and SIGNED_IN is NOT once per login. supabase-js re-emits it on every tab
// refocus (@supabase/auth-js GoTrueClient: the visibilitychange listener calls
// _recoverAndRefresh, which ends in _notifyAllSubscribers('SIGNED_IN', session)
// for any valid session). So after someone completed the gate, tabbing away and
// back re-showed it AND rewrote the localStorage flag, which made the loop
// survive a reload.
//
// The fix is that the arrival is CONSUMABLE: a one-shot fact that stops
// speaking once a password has actually been written.
//
// These are source assertions rather than behavioural ones. admin.js is a 6000-
// line React page that cannot be imported into node:test, and a test that
// re-implemented its state machine would only be testing the copy. Asserting the
// shape is the honest thing available — same approach as the two admin.js checks
// in password-reset.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../pages/admin.js', import.meta.url), 'utf8');
// Comments carry the words this file greps for, in the notes explaining them.
const code = src.replace(/^\s*\/\/.*$/gm, '');

test('the link arrival is consumable, not a permanent const', () => {
  assert.match(code, /let passwordLinkArrival = arrivedViaPasswordLinkFn\(\)/,
    'the arrival must be reassignable — a const is the bug');
  assert.ok(!/const\s+arrivedViaPasswordLink\s*=/.test(code),
    'a const arrivedViaPasswordLink is exactly what caused the loop');
  assert.match(code, /function consumePasswordLinkArrival\(\)\s*{\s*passwordLinkArrival = false/,
    'something must be able to spend it');
});

test('discharging the obligation clears BOTH local signals', () => {
  // Whichever one is left standing re-arms the other. That is the loop.
  const fn = code.slice(code.indexOf('function dischargePasswordObligation()'));
  const body = fn.slice(0, fn.indexOf('}') + 1);
  assert.match(body, /consumePasswordLinkArrival\(\)/, 'the arrival must be spent');
  assert.match(body, /clearPasswordPending\(\)/, 'the persisted flag must be cleared');
});

test('the SIGNED_IN re-arm is gated on the CALL, not a captured value', () => {
  const line = code.split('\n').find((l) => l.includes("event === 'SIGNED_IN'"));
  assert.ok(line, 'the SIGNED_IN branch still exists');
  assert.match(line, /arrivedViaPasswordLink\(\)/,
    're-arming must read the live, consumable value — SIGNED_IN fires on every tab refocus');
});

test('every path that ends the obligation goes through dischargePasswordObligation', () => {
  // Three of them: the gate completing, signing out, and signing in with a
  // password that works. Each one used to clear a different subset.
  const calls = [...code.matchAll(/dischargePasswordObligation\(\)/g)];
  assert.ok(calls.length >= 4,
    `expected the definition plus at least 3 call sites, found ${calls.length}`);

  assert.match(code, /onDone=\{\(\) => \{ dischargePasswordObligation\(\); setRecoveryMode\(false\); \}\}/,
    'the gate completing must discharge it');
  assert.match(code, /onPasswordSignIn=\{\(\) => \{ dischargePasswordObligation\(\); setRecoveryMode\(false\); \}\}/,
    'a successful password sign-in must discharge a stale flag');
  assert.match(code, /event === 'SIGNED_OUT'.*dischargePasswordObligation\(\)/,
    'signing out must discharge it');
});

test('the stale-flag clear fires only after credentials are accepted', () => {
  // Clearing it on every attempt would drop the obligation for someone who
  // merely typed a wrong password at an invited account.
  const handler = code.slice(code.indexOf('signInWithPassword'));
  const line = handler.split('\n').find((l) => l.includes('onPasswordSignIn'));
  assert.match(line, /^\s*else /,
    'it must be the else of the authError check, never unconditional');
});

test('an account that genuinely owes a password is still gated', () => {
  // The metadata half of the condition is independent of every local signal, so
  // an owner-issued temporary password still forces the gate. If this ever
  // collapses to recoveryMode alone, the 5 accounts holding a temp password walk
  // straight into the dashboard.
  assert.match(code,
    /recoveryMode \|\| session\.user\?\.user_metadata\?\.must_set_password === true/,
    'the gate must keep reading user_metadata independently of the local flags');
});
