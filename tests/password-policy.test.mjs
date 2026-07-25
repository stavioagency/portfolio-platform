// Regression tests for lib/password-policy.js — the rules applied wherever a
// password is set (post-reset screen + Account editor).
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// The byte cap is the load-bearing case: bcrypt ignores input past byte 72, so a
// password longer than that is silently truncated and a different long password
// can unlock the same account. Arabic is the realistic way to hit it — this admin
// is Arabic-first, and Arabic letters cost 2 bytes each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  passwordPolicyError,
  passwordByteLength,
  PASSWORD_MIN,
  PASSWORD_MAX_CHARS,
  PASSWORD_MAX_BYTES,
} from '../lib/password-policy.js';

test('accepts an ordinary valid password', () => {
  assert.equal(passwordPolicyError('correct-horse', 'correct-horse'), '');
});

test('rejects anything under the minimum', () => {
  assert.equal(passwordPolicyError('short1', 'short1'), 'password_too_short');
  assert.equal(passwordPolicyError('', ''), 'password_too_short');
});

test('accepts exactly the minimum length', () => {
  const pwd = 'a'.repeat(PASSWORD_MIN);
  assert.equal(passwordPolicyError(pwd, pwd), '');
});

test('reports a mismatch when both halves differ', () => {
  assert.equal(passwordPolicyError('correct-horse', 'correct-hors'), 'password_mismatch');
});

test('length is reported before mismatch', () => {
  // A too-short password that also does not match should say "too short" —
  // telling the user about the mismatch first would be the less useful error.
  assert.equal(passwordPolicyError('abc', 'xyz'), 'password_too_short');
});

test('accepts exactly the maximum character length', () => {
  const pwd = 'a'.repeat(PASSWORD_MAX_CHARS);
  assert.equal(passwordPolicyError(pwd, pwd), '');
});

test('rejects one character past the maximum', () => {
  const pwd = 'a'.repeat(PASSWORD_MAX_CHARS + 1);
  assert.equal(passwordPolicyError(pwd, pwd), 'password_too_long');
});

test('a password-manager-length password is now rejected', () => {
  // Documents the deliberate trade-off of the 20-char cap: generated passwords
  // no longer fit. If this test ever fails, the cap was raised - that is fine.
  const generated = 'xK9#mP2$vL7@qR4!wN6&';
  assert.equal(generated.length, 20);
  assert.equal(passwordPolicyError(generated, generated), '');
  assert.equal(passwordPolicyError(generated + 'a', generated + 'a'), 'password_too_long');
});

test('Arabic is counted in characters for the visible cap', () => {
  const arabic = '\u0643'.repeat(PASSWORD_MAX_CHARS);
  assert.equal(arabic.length, PASSWORD_MAX_CHARS);
  assert.equal(passwordByteLength(arabic), PASSWORD_MAX_CHARS * 2);
  assert.equal(passwordPolicyError(arabic, arabic), '');
});

test('the bcrypt byte backstop still exists above the char cap', () => {
  // 20 emoji is only 20 characters but 80 bytes - past bcrypt's 72-byte limit.
  const emoji = '\u{1F600}'.repeat(20);
  assert.equal(passwordByteLength(emoji), 80);
  assert.ok(passwordByteLength(emoji) > PASSWORD_MAX_BYTES);
  assert.equal(passwordPolicyError(emoji, emoji), 'password_too_long');
});

test('null and undefined are treated as empty, never throw', () => {
  assert.equal(passwordPolicyError(null, null), 'password_too_short');
  assert.equal(passwordPolicyError(undefined, undefined), 'password_too_short');
});

test('confirm is optional — omitting it skips the mismatch check', () => {
  assert.equal(passwordPolicyError('correct-horse'), '');
});
