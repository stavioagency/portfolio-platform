// Guards in supabase/functions/billing-subscription/index.ts that exist to stop
// a call reaching PayPal when it can only fail there.
//
// WHY THESE ARE PINNED BY TESTS
// -----------------------------
// Both were found MISSING FROM THE REPO and present in the deployed function.
// There are no Supabase CLI credentials on this machine, so every deploy is
// hand-transcribed through the MCP tools, and that has now dropped code from
// three separate files: _shared/paypal.ts lost `err.body` and the
// already-cancelled handling, billing-checkout's bundle lost both of those
// again, and this file lost the change_plan guard below plus the create_link
// hint.
//
// Deploying the repo over production would have silently deleted them. These
// tests are the cheap half of the fix — the other half is diffing the live
// bundle before every billing deploy. If one of these fails, the question is
// not "should I update the test" but "is production about to lose a guard".
//
// Read as source rather than executed: billing-subscription is a Deno Edge
// Function that imports from `jsr:` and calls Deno.serve at module scope, so
// Node cannot import it. Same constraint and same approach as
// tests/billing-period-end.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(ROOT, 'supabase/functions/billing-subscription/index.ts'), 'utf8');

/** The body of one `if (action === "<name>")` branch. */
function branch(name) {
  const start = SOURCE.indexOf(`if (action === "${name}")`);
  assert.notEqual(start, -1, `the ${name} branch must exist`);
  const open = SOURCE.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}' && --depth === 0) return SOURCE.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading the ${name} branch`);
}

// --- change_plan refuses a cancelled subscription ------------------------------

test('change_plan refuses a cancelled subscription with 409', () => {
  // PayPal cancellation is terminal, so a revise against it can only come back
  // as a provider_error carrying PayPal's wording. This turns that into an
  // answer the caller can act on.
  const cp = branch('change_plan');
  assert.ok(cp.includes('"subscription_is_cancelled"'), 'the guard must exist');
  assert.ok(/\}, 409\);/.test(cp), 'it must answer 409');
});

test('the guard covers cancel_at_period_end, not just status', () => {
  // THE CASE THAT ACTUALLY HAPPENS. billing-subscription records the intent to
  // cancel immediately and leaves `status` to the webhook, so a customer who
  // cancels and then tries to change plan is still locally `active` until
  // BILLING.SUBSCRIPTION.CANCELLED lands. Checking status alone lets exactly
  // that window through.
  const cp = branch('change_plan');
  assert.ok(
    /sub\.status === "canceled" \|\| sub\.cancel_at_period_end/.test(cp),
    'both the settled status and the pending intent must be refused',
  );
});

test('the guard runs BEFORE anything reaches PayPal', () => {
  // A guard placed after the provider call would still return 409, having
  // already made the call it exists to prevent.
  const cp = branch('change_plan');
  const guard = cp.indexOf('"subscription_is_cancelled"');
  const planLookup = cp.indexOf('activeProviderPlan(');
  const revise = cp.indexOf('provider.reviseSubscription(');
  assert.ok(guard !== -1 && revise !== -1);
  assert.ok(guard < planLookup, 'refuse before the plan lookup');
  assert.ok(guard < revise, 'refuse before the provider call');
});

test('same_plan is still checked first', () => {
  // Ordering preserved from production: the cheapest refusal comes first, and
  // "you are already on that plan" is a better message than "it is cancelled"
  // for someone who is both.
  const cp = branch('change_plan');
  assert.ok(cp.indexOf('"same_plan"') < cp.indexOf('"subscription_is_cancelled"'));
});

// --- create_link names the fix ------------------------------------------------

test('create_link plan_not_available carries the plans-sync hint', () => {
  // This failure has one cause worth guessing at — the plans were never synced
  // into provider_plans for this PAYPAL_ENV — and the reader is the owner
  // operating their own tooling.
  const cl = branch('create_link');
  assert.ok(cl.includes('"plan_not_available"'), 'the error must exist');
  assert.ok(cl.includes('hint: "run billing-plans-sync first"'), 'and must name the fix');
});

test('change_plan plan_not_available deliberately has NO hint', () => {
  // Matches production exactly. The hint is owner-facing tooling advice; a
  // client changing their own plan cannot run a plan sync and should not be
  // told to.
  const cp = branch('change_plan');
  assert.ok(cp.includes('"plan_not_available"'), 'the error must exist here too');
  assert.ok(!cp.includes('billing-plans-sync'), 'but the owner-only hint must not leak into it');
});

// --- the cancel path is unchanged ---------------------------------------------

test('cancel relies on the adapter for already-cancelled, and adds nothing', () => {
  // cancelSubscription() maps PayPal's 422 SUBSCRIPTION_STATUS_INVALID to a
  // return rather than a throw, so a double-click reaches the same end state
  // without an error. A second guard here would be duplicated logic that could
  // drift from the adapter.
  const c = branch('cancel');
  assert.ok(c.includes('provider.cancelSubscription('), 'must call the adapter');
  // Checks for the LOGIC, not the words: the branch explains the adapter's 422
  // handling in a comment, and banning the identifier would fail on the prose
  // rather than on a duplicated implementation.
  assert.ok(!/status === 422/.test(c), 'the 422 check belongs in the adapter');
  assert.ok(!/alreadyGone/.test(c), 'and its result must not be re-derived here');
  assert.ok(c.includes('cancel_at_period_end: true'), 'must record the intent locally');
  assert.ok(!/status:/.test(c), 'and must NOT write status — that is the webhook\'s job');
});

// --- the repo is now the superset of production -------------------------------

test('every behaviour observed in the deployed v3 bundle is present here', () => {
  // A checklist rather than a diff, because the deployed bundle is not on disk.
  // Each string below was read out of billing-subscription v3 via the Supabase
  // MCP on 2026-08-08 and confirmed present in this file.
  for (const marker of [
    '"missing_authorization"',
    '"invalid_tenant_id"',
    '"invalid_token"',
    '"authz_check_failed"',
    '"forbidden"',
    '"forbidden_not_owner"',
    '"plan_not_available"',
    'hint: "run billing-plans-sync first"',
    '"grant_signing_failed"',
    '"no_subscription"',
    '"not_a_paid_subscription"',
    '"same_plan"',
    '"subscription_is_cancelled"',
    '"provider_error"',
    '"unknown_action"',
  ]) {
    assert.ok(SOURCE.includes(marker), `${marker} must survive in the repo copy`);
  }
});

test('the Phase 2B additions are repo-only and still intact', () => {
  // These do NOT exist in the deployed v3 bundle — they are what this deploy
  // will add. Listed here so the superset claim is explicit in both directions.
  for (const marker of [
    'export function normalizeCompKind(',
    'if (action === "set_comp_kind")',
    '"invalid_comp_kind"',
    '"not_a_comped_subscription"',
    'setCompKind(admin, tenantId, kind)',
  ]) {
    assert.ok(SOURCE.includes(marker), `${marker} must still be present`);
  }
});
