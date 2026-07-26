import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAuthLinkError, isExpiredLinkError, isPasswordLink } from '../lib/auth-link.js';

// A consumed or expired link comes back with NO token and NO `type=`, which is why
// the app saw "not a password link, no session" and showed a bare sign-in form.
const EXPIRED_HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

test('an expired invite link is recognised as an error, not a password link', () => {
  assert.equal(isPasswordLink(EXPIRED_HASH, ''), false);
  const err = readAuthLinkError(EXPIRED_HASH, '');
  assert.equal(err.code, 'otp_expired');
  assert.equal(err.description, 'Email link is invalid or has expired');
  assert.equal(isExpiredLinkError(err), true);
});

test('error_code is preferred, but a bare error still reports', () => {
  assert.equal(readAuthLinkError('#error=access_denied', '').code, 'access_denied');
  assert.equal(readAuthLinkError('', '?error=server_error').code, 'server_error');
});

test('a successful link carries no error', () => {
  assert.equal(readAuthLinkError('#access_token=abc&type=invite', ''), null);
  assert.equal(readAuthLinkError('', ''), null);
  assert.equal(readAuthLinkError(null, undefined), null);
});

test('isExpiredLinkError only claims the cases a NEW link would fix', () => {
  assert.equal(isExpiredLinkError({ code: 'otp_expired' }), true);
  assert.equal(isExpiredLinkError({ code: 'access_denied' }), true);
  assert.equal(isExpiredLinkError({ code: 'x', description: 'Email link is invalid' }), true);
  assert.equal(isExpiredLinkError({ code: 'server_error', description: 'boom' }), false);
  assert.equal(isExpiredLinkError(null), false);
});

test('a real invite link is still a password link and not an error', () => {
  const ok = '#access_token=abc&expires_in=3600&type=invite';
  assert.equal(isPasswordLink(ok, ''), true);
  assert.equal(readAuthLinkError(ok, ''), null);
});
