// A workspace with a live subscription must not be deletable.
//
// THE BUG THESE PIN
// -----------------
// `tenants` is ON DELETE CASCADE into `subscriptions`, `billing_customers`,
// `payments` and `invoices`. Deleting a workspace mid-subscription therefore
// destroys the provider_subscription_id — the only handle that could ever
// cancel the thing — while PayPal keeps charging on schedule. Nothing on our
// side would ever notice: there is no row left to reconcile against.
//
// Found during the 2026-08-09 production cleanup audit, with five test
// workspaces holding provider subscriptions and one of them live.
//
// Two halves, tested two ways, matching tests/account-release.test.mjs: the
// decision is a pure function and is executed here; the wiring in pages/admin.js
// is read as source, because Node cannot import a React page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  deletionBlock,
  deletionBlockMessage,
  deletionUnknownMessage,
  BLOCKING_STATES,
  DELETABLE_STATES,
} from '../lib/workspace-deletion.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = readFileSync(join(ROOT, 'pages/admin.js'), 'utf8');

/** deleteWorkspace(), from its declaration to the start of the next one. */
function deleteWorkspaceSource() {
  const start = ADMIN.indexOf('async function deleteWorkspace()');
  assert.notEqual(start, -1, 'deleteWorkspace must exist');
  const end = ADMIN.indexOf('\n  return (', start);
  assert.notEqual(end, -1, 'could not find the end of deleteWorkspace');
  return ADMIN.slice(start, end);
}

/** The billingGate helper that reads the row. */
function billingGateSource() {
  const start = ADMIN.indexOf('async function billingGate(');
  assert.notEqual(start, -1, 'billingGate must exist');
  const end = ADMIN.indexOf('async function deleteWorkspace()', start);
  assert.notEqual(end, -1, 'billingGate must sit above deleteWorkspace');
  return ADMIN.slice(start, end);
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-09T12:00:00Z');
const LATER = new Date(NOW + 30 * DAY).toISOString();
const EARLIER = new Date(NOW - 30 * DAY).toISOString();

// --- 1. AN ACTIVE SUBSCRIPTION BLOCKS DELETION --------------------------------

test('an active subscription blocks deletion', () => {
  // The case that costs money: delete this and PayPal bills I-D3EHXR0FH8M9
  // every month with nothing left on our side that could stop it.
  const block = deletionBlock(
    {
      status: 'active',
      plan_code: 'yearly',
      current_period_end: LATER,
      cancel_at_period_end: false,
      provider_subscription_id: 'I-D3EHXR0FH8M9',
    },
    NOW,
  );
  assert.ok(block, 'an active subscription must refuse the delete');
  assert.equal(block.state, 'active');
  assert.equal(block.providerSubscriptionId, 'I-D3EHXR0FH8M9');
});

test('trialing, pending and past_due block it too', () => {
  // pending is the subtle one. It grants NOTHING, so it looks harmless — but the
  // subscription exists at PayPal and is one customer approval away from
  // activating, and that approval can land after the workspace is gone.
  const pending = deletionBlock(
    { status: 'pending', plan_code: 'test', provider_subscription_id: 'I-V83KGRCDG4E1' },
    NOW,
  );
  assert.equal(pending?.state, 'pending', 'an unapproved subscription still exists at the provider');

  const trialing = deletionBlock({ status: 'trialing', trial_ends_at: LATER }, NOW);
  assert.equal(trialing?.state, 'trialing');

  // Dunning can still succeed, so this is a subscription that may yet charge.
  const pastDue = deletionBlock({ status: 'past_due', current_period_end: EARLIER, grace_ends_at: LATER }, NOW);
  assert.equal(pastDue?.state, 'past_due');
});

test('the refusal names the next action, not just the refusal', () => {
  // "Cannot delete" with no route forward is how an owner ends up deleting the
  // row by hand in the SQL editor — the exact outcome this guard prevents.
  const block = { state: 'active', providerSubscriptionId: 'I-D3EHXR0FH8M9' };
  const en = deletionBlockMessage(block, false);
  assert.match(en, /Billing tab/);
  assert.match(en, /I-D3EHXR0FH8M9/, 'and the id, so it can be found at PayPal');
  assert.match(deletionBlockMessage(block, true), /الفوترة/);
});

test('an unknown status fails CLOSED', () => {
  // deriveBilling maps anything it does not recognise to 'expired', which is
  // deletable — so a status added by a newer backend would silently become
  // deletable. The check is membership of DELETABLE_STATES for this reason.
  // A future 'paused' must arrive as a blocked state, not as a free delete.
  assert.ok(!DELETABLE_STATES.includes('paused'), 'a state nobody has classified is not deletable');
  for (const state of BLOCKING_STATES) {
    assert.ok(!DELETABLE_STATES.includes(state), `${state} must not be in both lists`);
  }
});

// --- 2. A CANCELLED SUBSCRIPTION ALLOWS DELETION ------------------------------

test('a cancelled subscription allows deletion', () => {
  // Cancelled AND elapsed: PayPal is done with it.
  assert.equal(
    deletionBlock(
      { status: 'canceled', current_period_end: EARLIER, canceled_at: EARLIER, provider_subscription_id: 'I-M65XW1E7MM82' },
      NOW,
    ),
    null,
  );
});

test('a cancellation still inside its paid period allows deletion immediately', () => {
  // 'canceling' — cancelled AT THE PROVIDER, just still inside the days already
  // paid for. PayPal cannot charge again, so there is nothing left to protect,
  // and making the owner come back in three weeks to finish a cleanup would only
  // teach them to delete rows by hand.
  assert.equal(
    deletionBlock(
      { status: 'canceled', current_period_end: LATER, cancel_at_period_end: true, canceled_at: EARLIER },
      NOW,
    ),
    null,
  );
  // The other shape of the same fact: still 'active' at the provider, with the
  // renewal switched off.
  assert.equal(
    deletionBlock({ status: 'active', current_period_end: LATER, cancel_at_period_end: true }, NOW),
    null,
  );
});

test('an expired subscription allows deletion', () => {
  assert.equal(deletionBlock({ status: 'active', current_period_end: EARLIER }, NOW), null);
  assert.equal(deletionBlock({ status: 'past_due', current_period_end: EARLIER, grace_ends_at: EARLIER }, NOW), null);
});

// --- 3. A WORKSPACE WITH NO BILLING DELETES NORMALLY --------------------------

test('a workspace that never subscribed deletes normally', () => {
  // The common case, and the one the cleanup depends on: nine junk workspaces
  // with no billing at all must not be caught by a guard aimed at PayPal.
  assert.equal(deletionBlock(null, NOW), null);
  assert.equal(deletionBlock(undefined, NOW), null);
  assert.equal(deletionBlock({}, NOW), null);
});

test('a comped workspace deletes normally', () => {
  // Comped access is granted by the operator with no provider subscription
  // behind it — there is nothing at PayPal to cancel. Blocking these would have
  // frozen every pre-billing client and most of the junk in production.
  assert.equal(deletionBlock({ status: 'comped', plan_code: 'comped' }, NOW), null);
});

// --- 4. THE WIRING: THE GATE RUNS, AND RUNS FIRST -----------------------------

test('the gate is checked before the tenant is deleted', () => {
  const src = deleteWorkspaceSource();
  const gate = src.indexOf('billingGate(doomed.id)');
  const del = src.indexOf("from('tenants').delete()");
  assert.notEqual(gate, -1, 'the gate must be checked inside the delete path');
  assert.notEqual(del, -1, 'the tenant must be deleted');
  assert.ok(gate < del, 'and the check must come first');
  assert.ok(/if \(stillBlocked\) \{ setWsErr\(stillBlocked\); return; \}/.test(src), 'a block must return, not warn');
});

test('the gate is also checked before the confirm dialog', () => {
  // Not the guard — the one below is. This only spares the owner typing a slug
  // for a delete that was never going to happen.
  const src = deleteWorkspaceSource();
  const early = src.indexOf('billingGate(tenant.id)');
  assert.notEqual(early, -1, 'the pre-dialog check must exist');
  assert.ok(early < src.indexOf('await confirm('), 'and must precede the dialog');
});

test('a subscription that cannot be READ blocks the delete', () => {
  // The likeliest failure of all — RLS, a dropped connection, an offline tab —
  // and the one that would defeat the entire guard if it fell through. "We could
  // not check" and "there is nothing to check" must never be the same answer.
  const gate = billingGateSource();
  assert.ok(/if \(error\)/.test(gate), 'the read error must be handled');
  assert.ok(/deletionUnknownMessage\(ar\)/.test(gate), 'and must refuse rather than continue');
  assert.ok(gate.indexOf('if (error)') < gate.indexOf('deletionBlock('), 'before the row is judged');
  assert.match(deletionUnknownMessage(false), /nothing is deleted/);
  assert.match(deletionUnknownMessage(true), /لن يُحذف/);
});

test('the gate reads every field the state machine needs', () => {
  // deriveBilling decides on six fields. Selecting a subset does not error — it
  // silently yields the wrong state, which here means a wrong delete.
  const gate = billingGateSource();
  for (const column of [
    'status',
    'plan_code',
    'current_period_end',
    'cancel_at_period_end',
    'grace_ends_at',
    'trial_ends_at',
    'provider_subscription_id',
  ]) {
    assert.ok(gate.includes(column), `the select must include ${column}`);
  }
});

// --- 5. NOTHING ELSE MOVED ----------------------------------------------------

test('the email release still runs, and still runs after the delete', () => {
  // The guard sits in front of a path that already had to be right. Adding a
  // return before the delete must not have stranded the release behind it.
  const src = deleteWorkspaceSource();
  const del = src.indexOf("from('tenants').delete()");
  const release = src.indexOf('releaseAccounts(stranded)');
  assert.notEqual(release, -1, 'the release must still be wired in');
  assert.ok(del < release, 'and must still follow the delete');
  assert.ok(
    src.indexOf("supabase.rpc('list_workspace_members')") < del,
    'the members must still be read before the cascade removes them',
  );
});

test('the gate does not cancel anything itself', () => {
  // Cancelling is an irreversible call to a payment provider. It belongs to the
  // deliberate button in the Billing tab, not to a side effect of a delete —
  // and billing-subscription is deliberately untouched by this change.
  const src = deleteWorkspaceSource() + billingGateSource();
  assert.ok(!/action: 'cancel'/.test(src), 'the delete path must never call the cancel action');
  assert.ok(!/billing-subscription/.test(src), 'nor reach the billing function at all');
});
