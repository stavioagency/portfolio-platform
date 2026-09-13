// The owner's operations on a customer.
//
// THIS FILE EXISTS BECAUSE OF ONE SENTENCE in tests/client-console.test.mjs:
// "duplicating them into an unproven screen is how one gets done twice, or to
// the wrong row." That guard kept /client read-only for a whole phase. The
// operations are moving there now, so the protection has to move too — from
// "this screen cannot do anything" to "every operation names the row it was
// handed, and nothing else."
//
// Every assertion below is a wrong-row or wrong-target failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FN_RECOVERY, FN_BILLING, FN_DELETE, COMP_KIND,
  resetPasswordCall, changeEmailCall, grantFreeCall, setCompPeriodCall,
  revokeFreeCall, deleteClientCall, slugConfirmed, canOperate, OPERATIONS,
} from '../lib/client-operations.js';

const ROW = {
  id: 'tenant-aaa',
  slug: 'alice',
  name: 'Alice',
  member: { user_id: 'user-aaa', email: 'alice@example.com' },
};
const OTHER = {
  id: 'tenant-bbb',
  slug: 'bob',
  name: 'Bob',
  member: { user_id: 'user-bbb', email: 'bob@example.com' },
};

// ── every call names the row it was handed ───────────────────────────────

test('each operation targets the row it was given and no other', () => {
  // The wrong-row failure, asserted directly: build every call for two
  // different rows and confirm no identifier from one appears in the other's.
  const build = (row) => [
    resetPasswordCall(row),
    changeEmailCall(row, 'new@example.com'),
    grantFreeCall(row, 30),
    setCompPeriodCall(row, 30),
    revokeFreeCall(row),
    deleteClientCall(row, row.slug),
  ];

  for (const call of build(ROW)) {
    const json = JSON.stringify(call.body);
    assert.ok(!json.includes(OTHER.id), `${call.fn} leaked the other tenant id`);
    assert.ok(!json.includes(OTHER.member.user_id), `${call.fn} leaked the other user id`);
    assert.ok(!json.includes(OTHER.slug), `${call.fn} leaked the other slug`);
  }
});

test('a tenant operation carries the tenant id, a user operation the user id', () => {
  assert.equal(grantFreeCall(ROW).body.tenant_id, ROW.id);
  assert.equal(setCompPeriodCall(ROW, 7).body.tenant_id, ROW.id);
  assert.equal(revokeFreeCall(ROW).body.tenant_id, ROW.id);
  assert.equal(deleteClientCall(ROW, 'alice').body.tenant_id, ROW.id);

  assert.equal(resetPasswordCall(ROW).body.user_id, ROW.member.user_id);
  assert.equal(changeEmailCall(ROW, 'x@y.com').body.user_id, ROW.member.user_id);
});

test('each operation calls the function that actually performs it', () => {
  assert.equal(resetPasswordCall(ROW).fn, FN_RECOVERY);
  assert.equal(changeEmailCall(ROW, 'x@y.com').fn, FN_RECOVERY);
  assert.equal(grantFreeCall(ROW).fn, FN_BILLING);
  assert.equal(setCompPeriodCall(ROW, 7).fn, FN_BILLING);
  assert.equal(revokeFreeCall(ROW).fn, FN_BILLING);
  assert.equal(deleteClientCall(ROW, 'alice').fn, FN_DELETE);
});

// ── refusing to build a call at all ──────────────────────────────────────

test('an operation on a workspace with no login is not built', () => {
  // Without this the function is invoked with user_id undefined, and
  // "undefined" is not obviously nobody to a server.
  const orphan = { id: 'tenant-ccc', slug: 'carol', member: null };
  assert.equal(resetPasswordCall(orphan), null);
  assert.equal(changeEmailCall(orphan, 'x@y.com'), null);
  assert.equal(canOperate('reset_password', orphan), false);
  assert.equal(canOperate('change_email', orphan), false);
  // Billing is per-tenant and does not need a login.
  assert.equal(canOperate('grant_free', orphan), true);
  assert.equal(canOperate('revoke_free', orphan), true);
});

test('nothing is built from a missing row', () => {
  for (const build of [resetPasswordCall, grantFreeCall, setCompPeriodCall, revokeFreeCall]) {
    assert.equal(build(null), null);
    assert.equal(build(undefined), null);
    assert.equal(build({}), null);
  }
  assert.equal(deleteClientCall(null, 'alice'), null);
  assert.equal(changeEmailCall(null, 'x@y.com'), null);
});

test('an empty email is not a change', () => {
  assert.equal(changeEmailCall(ROW, ''), null);
  assert.equal(changeEmailCall(ROW, '   '), null);
  assert.equal(changeEmailCall(ROW, null), null);
});

// ── the delete, which is the one that cannot be undone ───────────────────

test('the typed slug is passed through for the SERVER to judge', () => {
  // The single most important property here. The Edge Function compares
  // confirm_slug against the tenant's own slug, so a UI bug that hands this the
  // wrong row produces a mismatch and the database refuses the delete. Checking
  // the match here INSTEAD would move that protection into the browser.
  const call = deleteClientCall(ROW, 'alice');
  assert.equal(call.body.confirm_slug, 'alice');

  // Even a slug that does not match this row is still forwarded verbatim —
  // it is not this function's job to decide, and silently "fixing" it to the
  // row's own slug would defeat the server's check entirely.
  assert.equal(deleteClientCall(ROW, 'bob').body.confirm_slug, 'bob');
  assert.equal(deleteClientCall(ROW, 'bob').body.tenant_id, ROW.id);
});

test('a delete with nothing typed is not built', () => {
  assert.equal(deleteClientCall(ROW, ''), null);
  assert.equal(deleteClientCall(ROW, '   '), null);
});

test('force is absent unless asked for', () => {
  // `force` deletes a client whose subscription may still be charging. It must
  // never appear by default.
  assert.equal('force' in deleteClientCall(ROW, 'alice').body, false);
  assert.equal(deleteClientCall(ROW, 'alice', { force: true }).body.force, true);
});

test('the button is gated on the typed slug matching THIS row', () => {
  assert.equal(slugConfirmed(ROW, 'alice'), true);
  assert.equal(slugConfirmed(ROW, 'ALICE'), true, 'case is not the point');
  assert.equal(slugConfirmed(ROW, '  alice '), true, 'nor is whitespace');
  assert.equal(slugConfirmed(ROW, 'bob'), false, 'another customer’s slug must not arm it');
  assert.equal(slugConfirmed(ROW, ''), false);
  assert.equal(slugConfirmed({ slug: '' }, ''), false, 'an empty slug must never be confirmable');
});

// ── what the screen is allowed to say about them ─────────────────────────

test('a grant is convertible, never grandfathered', () => {
  // The pre-billing seven are the grandfathered ones; nothing here may create
  // another. A grant made today is meant to become a paying subscription.
  assert.equal(grantFreeCall(ROW).body.comp_kind, COMP_KIND);
  assert.equal(COMP_KIND, 'convertible');
});

test('a permanent grant passes null days, not zero', () => {
  // null means "remove the end date". Zero would mean it ends immediately.
  assert.equal(setCompPeriodCall(ROW, null).body.days, null);
  assert.notEqual(setCompPeriodCall(ROW, null).body.days, 0);
});

test('every operation declares whether it can be undone', () => {
  for (const [id, op] of Object.entries(OPERATIONS)) {
    assert.equal(typeof op.destructive, 'boolean', `${id} must declare destructive`);
    assert.equal(typeof op.irreversible, 'boolean', `${id} must declare irreversible`);
    assert.ok(op.label.ar && op.label.en, `${id} needs both languages`);
  }
  // The two with no undo at all: an email already sent, and a workspace gone.
  assert.equal(OPERATIONS.reset_password.irreversible, true);
  assert.equal(OPERATIONS.delete_client.irreversible, true);
  // These can be put back.
  assert.equal(OPERATIONS.revoke_free.irreversible, false);
  assert.equal(OPERATIONS.change_email.irreversible, false);
});

test('only the delete demands a typed slug', () => {
  assert.equal(OPERATIONS.delete_client.needsSlug, true);
  for (const id of ['reset_password', 'change_email', 'grant_free', 'set_period', 'revoke_free']) {
    assert.ok(!OPERATIONS[id].needsSlug, `${id} should not demand a slug`);
  }
});
