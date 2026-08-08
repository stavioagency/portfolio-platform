// Tests for checkoutStatus() and needsRemoteVerification() in
// supabase/functions/billing-checkout/index.ts — the two guards that let a
// comped workspace start a checkout without losing access.
//
// THE BUG THESE LOCK DOWN
// -----------------------
// There is one subscription row per tenant (unique (tenant_id) in
// section-h-billing.sql), so checkout's closing write UPDATES whatever is
// already there. It wrote `pending` unconditionally. `comped` is entitled
// unconditionally in tenant_has_active_subscription(); `pending` is entitled by
// nothing. So merely STARTING a checkout took a comped workspace's entitlement
// away — and permanently, because nothing walks a customer back from PayPal and
// no event corrects an approval that was simply abandoned. That is the section-K
// failure mode: a recoverable mistake made unrecoverable.
//
// The second function is the duplicate-subscription guard. It keyed on
// `pending` alone, so once a comped row could carry a provider_subscription_id
// a retry would have created a parallel PayPal subscription and billed the
// customer on both, with only the newer one visible here.
//
// NOT REACHABLE YET, AND TESTED ANYWAY. The already_subscribed guard still
// refuses `comped`, so no comped row reaches either path today. These are the
// safety properties going in BEFORE the gate that needs them, which is the only
// order in which the gate is a safe change to make.
//
// WHY BY EXTRACTION RATHER THAN BY IMPORT
// ---------------------------------------
// billing-checkout is a Deno Edge Function: it imports from `jsr:`, calls
// Deno.serve at module scope, and cannot be imported by Node. Same constraint
// and same solution as tests/billing-period-end.test.mjs — the decisions are
// written as pure, exported functions, and this file lifts them out of the
// source by brace matching and runs them for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKOUT = join(ROOT, 'supabase/functions/billing-checkout/index.ts');
const SOURCE = readFileSync(CHECKOUT, 'utf8');

// Exactly the annotations these two signatures use. Deliberately explicit
// rather than a general stripper: if a signature changes, extraction fails
// loudly instead of quietly testing something else.
function stripTypes(source) {
  return source
    .replaceAll('existingStatus: string | null | undefined,', 'existingStatus,')
    .replaceAll('createdStatus: SubscriptionStatus,', 'createdStatus,')
    .replaceAll('): SubscriptionStatus {', ') {')
    .replaceAll('status: string | null | undefined,', 'status,')
    .replaceAll('providerSubscriptionId: string | null | undefined,', 'providerSubscriptionId,')
    .replaceAll('): boolean {', ') {');
}

/** Lift `name`'s full declaration out of already-stripped source. */
function extract(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.notEqual(start, -1, `${name} should be exported — the test cannot run otherwise`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) {
      return source.slice(start, i + 1).replace(/^export /, '');
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const STRIPPED = stripTypes(SOURCE);
const { checkoutStatus, needsRemoteVerification } = new Function(
  [
    extract(STRIPPED, 'checkoutStatus'),
    extract(STRIPPED, 'needsRemoteVerification'),
    'return { checkoutStatus, needsRemoteVerification };',
  ].join('\n'),
)();

// --- the regression itself ---------------------------------------------------

test('starting a checkout never moves a comped row off comped', () => {
  // The whole point. `pending` grants nothing, so this write would have been an
  // immediate revocation of a live client's site.
  assert.equal(checkoutStatus('comped', 'pending'), 'comped');
});

test('an abandoned approval leaves the comped row entitled', () => {
  // Nothing runs after this write until a webhook arrives, and an abandoned
  // approval produces no webhook. So the value written here IS the resting
  // state, and it has to be one that carries access.
  const resting = checkoutStatus('comped', 'pending');
  assert.equal(resting, 'comped', 'the row must still be entitled with no cleanup');
});

test('whatever the provider calls the new subscription, comped survives it', () => {
  // createSubscription() is adapter output — a second provider may map its own
  // vocabulary onto something other than `pending`, and none of those may
  // displace a grant either.
  for (const created of ['pending', 'active', 'trialing', 'past_due', 'canceled', 'expired']) {
    assert.equal(checkoutStatus('comped', created), 'comped', `${created} must not displace a comp`);
  }
});

// --- paid checkout is untouched ----------------------------------------------

test('a tenant with no subscription row is recorded exactly as before', () => {
  // The overwhelmingly common path: self-signup, first purchase. `existing` is
  // null, so `existing?.status` is undefined.
  assert.equal(checkoutStatus(undefined, 'pending'), 'pending');
  assert.equal(checkoutStatus(null, 'pending'), 'pending');
});

test('every non-comped status still takes the provider\'s answer', () => {
  // Only the statuses that can actually reach the write are meaningful here —
  // active and trialing are refused earlier — but the rule is "comped or
  // nothing", so assert it across the whole vocabulary.
  for (const existing of ['pending', 'canceled', 'expired', 'past_due', 'active', 'trialing']) {
    assert.equal(checkoutStatus(existing, 'pending'), 'pending', `${existing} must not be preserved`);
  }
});

test('comped is matched exactly, not loosely', () => {
  // A near-miss must fail OPEN into the ordinary path rather than silently
  // granting a status nothing else in the system understands.
  assert.equal(checkoutStatus('COMPED', 'pending'), 'pending');
  assert.equal(checkoutStatus('comp', 'pending'), 'pending');
  assert.equal(checkoutStatus('', 'pending'), 'pending');
});

// --- the duplicate-subscription guard ----------------------------------------

test('a pending row with a provider id is still verified against PayPal', () => {
  // The original protection, unchanged. This is the one that stops a customer
  // ending up approved on two subscriptions and billed on both.
  assert.equal(needsRemoteVerification('pending', 'I-BW452GLLEP1G'), true);
});

test('a converting comped row is verified too', () => {
  // New. Once checkoutStatus() keeps the status, a first attempt leaves a
  // comped row carrying a real provider id, and a retry that skipped this
  // check would create a parallel subscription.
  assert.equal(needsRemoteVerification('comped', 'I-BW452GLLEP1G'), true);
});

test('a row with no provider id is never verified — there is nothing to ask about', () => {
  // Every comped row written by section-h and section-k is exactly this: no
  // provider id, nothing live at PayPal, so no round trip and no 503 risk on
  // the very first conversion attempt.
  assert.equal(needsRemoteVerification('comped', null), false);
  assert.equal(needsRemoteVerification('comped', undefined), false);
  assert.equal(needsRemoteVerification('comped', ''), false);
  assert.equal(needsRemoteVerification('pending', null), false);
});

test('statuses that cannot hide a live subscription are not verified', () => {
  // A cancelled or expired row's provider subscription is dead at PayPal, and
  // active/trialing are refused before this point. Widening it further would
  // spend a provider round trip — and a 503 when PayPal is down — on every
  // resubscribe.
  assert.equal(needsRemoteVerification('canceled', 'I-BW452GLLEP1G'), false);
  assert.equal(needsRemoteVerification('expired', 'I-BW452GLLEP1G'), false);
  assert.equal(needsRemoteVerification(null, 'I-BW452GLLEP1G'), false);
});

// --- the call sites ----------------------------------------------------------
// The pure functions cannot prove they are actually WIRED IN, and "not wired
// in" is precisely what the bug was. These read the source, which is the only
// way to assert it from Node.

test('the closing write routes its status through checkoutStatus', () => {
  assert.ok(
    /status:\s*checkoutStatus\(existing\?\.status,\s*created\.status\)/.test(SOURCE),
    'the subscription write must not assign created.status directly',
  );
  // Scoped to the DATABASE write, not the whole file: the JSON response also
  // carries `status: created.status`, and that one is correct — it reports what
  // PayPal said to the caller and touches no row.
  const write = SOURCE.slice(SOURCE.indexOf('await upsertSubscription(admin, tenantId, {\n    provider: provider.name'));
  const body = write.slice(0, write.indexOf('});'));
  assert.ok(body.length > 0, 'could not locate the closing subscription write');
  assert.ok(
    !/\bstatus:\s*created\.status\b/.test(body),
    'no unguarded created.status assignment may remain in the subscription write',
  );
});

test('the duplicate guard routes through needsRemoteVerification', () => {
  assert.ok(
    /if \(needsRemoteVerification\(existing\?\.status, existing\?\.provider_subscription_id\)\)/.test(SOURCE),
    'the pending/comped check must go through the tested predicate',
  );
});

test('the already_subscribed guard still refuses comped', () => {
  // Phase 1 deliberately does NOT open the gate. Removing `comped` from this
  // list is the Phase 2 change, and it is only safe because of the two
  // functions above — if this assertion fails, check that it was a decision.
  assert.ok(
    /\["active",\s*"trialing",\s*"comped"\]\.includes\(existing\.status\)/.test(SOURCE),
    'comped is still refused at checkout until convertible comps ship',
  );
});
