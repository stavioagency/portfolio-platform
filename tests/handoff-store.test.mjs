// Tests for lib/handoff-store.js — the in-memory home of an issued password.
// Zero dependencies — run with: npm test
//
// The store is what stops a stray click costing an onboarding, so the cases
// that matter are: a set survives being read repeatedly, a reset REPLACES the
// old one (handing over a dead password is worse than having none), and
// forgetting actually forgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rememberCredentials,
  recallCredentials,
  hasCredentials,
  forgetCredentials,
  clearAllCredentials,
  workspacesWithCredentials,
} from '../lib/handoff-store.js';

const CREDS = { workspace: 'Acme', username: 'acme', password: 'Xk7-tuna-92Qm', email: 'a@b.com' };

test('a remembered set survives being read more than once', () => {
  clearAllCredentials();
  rememberCredentials('t1', CREDS);
  assert.equal(recallCredentials('t1').password, CREDS.password);
  assert.equal(recallCredentials('t1').password, CREDS.password, 'recall must not consume');
  assert.equal(hasCredentials('t1'), true);
});

test('a uuid and a number key the same entry', () => {
  clearAllCredentials();
  rememberCredentials(42, CREDS);
  assert.equal(recallCredentials('42').password, CREDS.password);
});

// A reset invalidates the previous password server-side. Keeping the old one
// would let the admin confidently hand over something that cannot sign in.
test('re-issuing replaces the old password rather than keeping both', () => {
  clearAllCredentials();
  rememberCredentials('t1', CREDS);
  rememberCredentials('t1', { ...CREDS, password: 'NEW-password-99' });
  assert.equal(recallCredentials('t1').password, 'NEW-password-99');
  assert.equal(workspacesWithCredentials().length, 1);
});

test('workspaces are isolated from one another', () => {
  clearAllCredentials();
  rememberCredentials('t1', { ...CREDS, password: 'one' });
  rememberCredentials('t2', { ...CREDS, password: 'two' });
  assert.equal(recallCredentials('t1').password, 'one');
  assert.equal(recallCredentials('t2').password, 'two');
  assert.deepEqual(workspacesWithCredentials().sort(), ['t1', 't2']);
});

test('forgetting one leaves the others intact', () => {
  clearAllCredentials();
  rememberCredentials('t1', CREDS);
  rememberCredentials('t2', CREDS);
  assert.equal(forgetCredentials('t1'), true);
  assert.equal(recallCredentials('t1'), null);
  assert.equal(hasCredentials('t1'), false);
  assert.equal(hasCredentials('t2'), true);
});

test('clearing removes everything — sign-out must not leak into the next session', () => {
  rememberCredentials('t1', CREDS);
  rememberCredentials('t2', CREDS);
  clearAllCredentials();
  assert.deepEqual(workspacesWithCredentials(), []);
  assert.equal(recallCredentials('t1'), null);
});

test('an unknown workspace reports nothing rather than throwing', () => {
  clearAllCredentials();
  assert.equal(recallCredentials('nope'), null);
  assert.equal(hasCredentials('nope'), false);
  assert.equal(forgetCredentials('nope'), false);
});

test('junk input is refused instead of creating a phantom entry', () => {
  clearAllCredentials();
  assert.equal(rememberCredentials(null, CREDS), null);
  assert.equal(rememberCredentials('', CREDS), null);
  assert.equal(rememberCredentials('t1', null), null);
  assert.deepEqual(workspacesWithCredentials(), []);
});

test('the stored entry carries its workspace id and an issue time', () => {
  clearAllCredentials();
  const before = Date.now();
  const e = rememberCredentials('t9', CREDS);
  assert.equal(e.tenantId, 't9');
  assert.ok(e.issuedAt >= before, 'issuedAt should be stamped');
  assert.equal(recallCredentials('t9').tenantId, 't9');
});

test('the caller cannot mutate the stored set by accident', () => {
  clearAllCredentials();
  const input = { ...CREDS };
  rememberCredentials('t1', input);
  input.password = 'tampered';
  assert.equal(recallCredentials('t1').password, CREDS.password);
});
