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

test('accepts a long ASCII password up to the bcrypt byte cap', () => {
  const pwd = 'a'.repeat(PASSWORD_MAX_BYTES);
  assert.equal(passwordByteLength(pwd), PASSWORD_MAX_BYTES);
  assert.equal(passwordPolicyError(pwd, pwd), '');
});

test('rejects one byte past the bcrypt cap', () => {
  const pwd = 'a'.repeat(PASSWORD_MAX_BYTES + 1);
  assert.equal(passwordPolicyError(pwd, pwd), 'password_too_long');
});

test('counts Arabic in BYTES, not characters', () => {
  // 40 Arabic letters = 80 bytes: comfortably under a 72-CHARACTER cap but over
  // the real 72-byte bcrypt limit. Counting characters here would let a silently
  // truncated password through.
  const arabic = 'ك'.repeat(40);
  assert.equal(arabic.length, 40);
  assert.equal(passwordByteLength(arabic), 80);
  assert.equal(passwordPolicyError(arabic, arabic), 'password_too_long');
});

test('an Arabic password within the byte cap is accepted', () => {
  const arabic = 'ك'.repeat(30); // 60 bytes
  assert.equal(passwordByteLength(arabic), 60);
  assert.equal(passwordPolicyError(arabic, arabic), '');
});

test('emoji count as their full byte width', () => {
  assert.equal(passwordByteLength('😀'), 4);
  assert.equal(passwordPolicyError('😀'.repeat(19), '😀'.repeat(19)), 'password_too_long');
});

test('null and undefined are treated as empty, never throw', () => {
  assert.equal(passwordPolicyError(null, null), 'password_too_short');
  assert.equal(passwordPolicyError(undefined, undefined), 'password_too_short');
});

test('confirm is optional — omitting it skips the mismatch check', () => {
  assert.equal(passwordPolicyError('correct-horse'), '');
});
