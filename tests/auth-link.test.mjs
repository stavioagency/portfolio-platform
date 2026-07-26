import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPasswordLink } from '../lib/auth-link.js';

// THE REGRESSION. An invited client used to land straight in the dashboard with a
// live session and no password they had ever chosen — fine until they signed out.
test('an INVITE link must force the set-password screen', () => {
  assert.equal(isPasswordLink('#access_token=abc&type=invite&expires_in=3600', ''), true);
  assert.equal(isPasswordLink('', '?type=invite'), true);
  assert.equal(isPasswordLink('#type=invite', ''), true);
});

test('a RECOVERY link still forces it', () => {
  assert.equal(isPasswordLink('#access_token=abc&type=recovery&expires_in=3600', ''), true);
  assert.equal(isPasswordLink('', '?token=x&type=recovery'), true);
});

test('type at the END of the fragment is matched', () => {
  assert.equal(isPasswordLink('#access_token=abc&type=invite', ''), true);
  assert.equal(isPasswordLink('#access_token=abc&type=recovery', ''), true);
});

test('an ordinary sign-in is NOT a password link', () => {
  assert.equal(isPasswordLink('', ''), false);
  assert.equal(isPasswordLink('#access_token=abc&type=signup', ''), false);
  assert.equal(isPasswordLink('#access_token=abc&type=magiclink', ''), false);
  assert.equal(isPasswordLink('?tab=profile', ''), false);
});

test('a lookalike parameter does not trigger it', () => {
  // Guards the leading-delimiter part of the pattern: "subtype=invite" and
  // "type=invitation" must not match, or a normal load could be hijacked into the
  // set-password screen.
  assert.equal(isPasswordLink('#subtype=invite', ''), false);
  assert.equal(isPasswordLink('#type=invitation', ''), false);
  assert.equal(isPasswordLink('#mytype=recovery', ''), false);
});

test('null/undefined inputs are safe', () => {
  assert.equal(isPasswordLink(null, undefined), false);
  assert.equal(isPasswordLink(undefined, null), false);
});
