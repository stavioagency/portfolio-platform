// Regression tests for lib/resolve-login.js — how the sign-in box interprets
// whatever was typed into it.
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// The bug these lock down: the form used to treat every input as a username, so
// typing your own email address failed with "username or password is incorrect"
// WITHOUT the password ever being checked. Because the forgot-password screen
// does accept an email, the reset link became the only reliable way back in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLoginIdentifier } from '../lib/resolve-login.js';

test('an email address is recognised as an email', () => {
  const r = parseLoginIdentifier('stavio.agency@gmail.com');
  assert.equal(r.kind, 'email');
  assert.equal(r.value, 'stavio.agency@gmail.com');
});

test('a plain username is recognised as a username', () => {
  const r = parseLoginIdentifier('designakum');
  assert.equal(r.kind, 'username');
  assert.equal(r.value, 'designakum');
});

test('usernames are lowercased to match the database lookup', () => {
  assert.equal(parseLoginIdentifier('DESIGNAKUM').value, 'designakum');
  assert.equal(parseLoginIdentifier('DesignAkum').value, 'designakum');
});

test('surrounding whitespace is trimmed on both kinds', () => {
  assert.deepEqual(parseLoginIdentifier('  designakum  '), { kind: 'username', value: 'designakum' });
  assert.deepEqual(parseLoginIdentifier('  a@b.com '), { kind: 'email', value: 'a@b.com' });
});

test('email case is preserved — only usernames are lowercased', () => {
  // Supabase matches addresses case-insensitively; mangling it here would just
  // hide what the user typed from any future error message.
  assert.equal(parseLoginIdentifier('Stavio.Agency@Gmail.com').value, 'Stavio.Agency@Gmail.com');
});

test('empty and whitespace-only input is reported as empty', () => {
  assert.equal(parseLoginIdentifier('').kind, 'empty');
  assert.equal(parseLoginIdentifier('    ').kind, 'empty');
  assert.equal(parseLoginIdentifier(null).kind, 'empty');
  assert.equal(parseLoginIdentifier(undefined).kind, 'empty');
});

test('any "@" makes it an email — validation is Supabase\'s job, not ours', () => {
  // Deliberately loose. Guessing wrong costs one failed sign-in; being strict
  // risks rejecting a real address and recreating the original bug.
  assert.equal(parseLoginIdentifier('@handle').kind, 'email');
  assert.equal(parseLoginIdentifier('weird@').kind, 'email');
});

test('a username containing a dot is still a username', () => {
  assert.deepEqual(parseLoginIdentifier('faisal.designs'), { kind: 'username', value: 'faisal.designs' });
});
