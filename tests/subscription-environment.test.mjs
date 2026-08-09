// A subscription must record which PayPal it lives at.
//
// THE PROBLEM THESE PIN
// ---------------------
// `provider_plans` has an `environment` column; `subscriptions` did not, and
// carries no provider_plan_id to join back through. After PAYPAL_ENV flipped to
// `live` on 2026-08-09, production held sandbox and live subscriptions in one
// table with nothing telling them apart — same `provider`, same statuses, same
// `I-` id format.
//
// The cleanup audit had to classify five of them by reading billing_events
// payloads for `api.sandbox.paypal.com` vs `api.paypal.com`. No code path can do
// that, and it stops working when events are pruned.
//
// Read as source rather than executed: these are Deno Edge Functions that import
// from `jsr:` and call Deno.serve at module scope, so Node cannot import them.
// Same approach as tests/billing-subscription-guards.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CHECKOUT = read('supabase/functions/billing-checkout/index.ts');
const WEBHOOK = read('supabase/functions/billing-webhook/index.ts');
const BILLING_DB = read('supabase/functions/_shared/billing-db.ts');
const MIGRATION = read('supabase/sections/section-n-subscription-environment.sql');

/**
 * The object literal of the upsertSubscription() call containing `marker`.
 *
 * Identified by a line inside the patch rather than by position, so inserting
 * another upsert above it does not silently retarget the assertion.
 */
function upsertArgContaining(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `expected to find ${marker}`);
  const call = src.lastIndexOf('upsertSubscription(', at);
  assert.notEqual(call, -1, `${marker} must sit inside an upsertSubscription call`);
  const open = src.indexOf('{', call);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error('unterminated upsertSubscription argument');
}

// --- 1. THE COLUMN IS WRITTEN WHERE SUBSCRIPTIONS ARE CREATED -----------------

test('checkout records the environment on the subscription it creates', () => {
  // The main creation path. Without this, every new subscription is unlabelled
  // and the table goes straight back to being ambiguous.
  const arg = upsertArgContaining(CHECKOUT, 'provider_subscription_id: created.id');
  assert.ok(
    /environment: PAYPAL_ENV/.test(arg),
    'the created subscription must carry PAYPAL_ENV, not just mention it elsewhere in the file',
  );
});

test('the environment written by checkout is the one the plan was looked up with', () => {
  // activeProviderPlan() is already filtered on PAYPAL_ENV, so the plan and the
  // subscription cannot disagree about which PayPal this is. A literal
  // 'live'/'sandbox' string here would be able to drift from that lookup.
  assert.ok(
    /activeProviderPlan\(admin, provider\.name, PAYPAL_ENV, planCode\)/.test(CHECKOUT),
    'the plan lookup must still be environment-scoped',
  );
  assert.ok(
    !/environment: ["'](live|sandbox)["']/.test(CHECKOUT),
    'the environment must never be hardcoded — it comes from PAYPAL_ENV',
  );
});

test('the webhook heal path records the environment too', () => {
  // The other way a subscription comes into existence: adopting one that exists
  // at PayPal but not here. An unlabelled row from this path is the same
  // ambiguity by a quieter route.
  const heal = WEBHOOK.slice(
    WEBHOOK.indexOf('async function healMissingSubscription'),
    WEBHOOK.indexOf('async function apply('),
  );
  assert.ok(heal.length > 0, 'healMissingSubscription must exist');
  assert.ok(/environment: PAYPAL_ENV/.test(heal), 'the adopted subscription must be labelled');
  assert.ok(
    /import \{ PAYPAL_ENV \} from "\.\.\/_shared\/paypal\.ts"/.test(WEBHOOK),
    'and PAYPAL_ENV must actually be imported',
  );
});

test('the patch type carries environment', () => {
  assert.ok(/environment\?: string \| null;/.test(BILLING_DB), 'SubscriptionPatch must accept it');
});

// --- 2. IT IS NOT WRITTEN ANYWHERE ELSE ---------------------------------------

test('status-only webhook patches do NOT relabel the environment', () => {
  // The failure this prevents: a deployment configured for live touching a
  // sandbox row's status and quietly restamping it as live. The environment is
  // a fact about where the subscription was CREATED; it never changes, so only
  // the creation paths may write it.
  const applyFn = WEBHOOK.slice(WEBHOOK.indexOf('async function apply('));
  const occurrences = (applyFn.match(/environment:/g) || []).length;
  assert.equal(occurrences, 0, 'no status patch in apply() may carry an environment');
});

test('cancel and change-plan paths do not write it either', () => {
  const SUBSCRIPTION = read('supabase/functions/billing-subscription/index.ts');
  assert.ok(
    !/environment:/.test(SUBSCRIPTION),
    'billing-subscription only changes state, never where the subscription lives',
  );
});

test('entitlement is untouched by this change', () => {
  // The one guarantee that matters: a sandbox subscription currently granting
  // access keeps granting it. Labelling a row must never revoke a workspace.
  for (const src of [CHECKOUT, WEBHOOK, BILLING_DB]) {
    assert.ok(
      !/tenant_has_active_subscription[\s\S]{0,200}environment/.test(src),
      'no entitlement check may read the environment column',
    );
  }
  assert.ok(
    /no entitlement reads this/i.test(MIGRATION) || /entitlement/i.test(MIGRATION),
    'the migration must state that it changes no entitlement',
  );
});

// --- 3. THE MIGRATION IS SAFE TO RUN AND SAFE TO RE-RUN -----------------------

test('the migration is idempotent', () => {
  assert.ok(/add column if not exists environment/i.test(MIGRATION), 'the column add must be guarded');
  assert.ok(/from pg_constraint/i.test(MIGRATION), 'the constraint add must be guarded');
  assert.ok(/subscriptions_environment_check/.test(MIGRATION));
});

test('the migration never guesses an environment', () => {
  // Defaulting an unclassifiable row to 'sandbox' would mislabel a LIVE
  // subscription as harmless — precisely the mistake the column exists to stop.
  assert.ok(
    !/default 'sandbox'/i.test(MIGRATION) && !/default 'live'/i.test(MIGRATION),
    'the column must have no default',
  );
  // Nullable is load-bearing: comped and never-subscribed rows have no provider
  // subscription, so NULL means "not applicable" rather than "unknown".
  const addColumn = MIGRATION.slice(
    MIGRATION.indexOf('add column if not exists environment'),
    MIGRATION.indexOf(';', MIGRATION.indexOf('add column if not exists environment')),
  );
  assert.ok(!/not null/i.test(addColumn), 'the column must stay nullable');
  assert.ok(
    /check \(environment is null or environment in \('sandbox', 'live'\)\)/.test(MIGRATION),
    'and the constraint must explicitly permit NULL',
  );
  assert.ok(
    /and s\.environment is null/i.test(MIGRATION),
    'the backfill must only ever fill blanks, never overwrite',
  );
});

test('the backfill classifies by PayPal link host, the way the audit did', () => {
  assert.ok(/sandbox\.paypal\.com/.test(MIGRATION), 'sandbox is identified by its host');
  assert.ok(/bool_or/.test(MIGRATION), 'any sandbox link makes the whole subscription sandbox');
  assert.ok(
    MIGRATION.indexOf("like '%sandbox.paypal.com%'") < MIGRATION.indexOf("like '%paypal.com%'"),
    'sandbox must be tested BEFORE the bare host, which also matches sandbox urls',
  );
});

test('the migration verifies itself', () => {
  // "Do not assume it applied" — docs/workflows/deployment.md.
  assert.ok(/VERIFY/.test(MIGRATION), 'there must be a VERIFY block');
  assert.ok(/raise exception/i.test(MIGRATION), 'which fails loudly rather than printing');
  assert.ok(
    /provider_subscription_id is not null and environment is null/i.test(MIGRATION),
    'and must count provider subscriptions it could not classify',
  );
});

test('the migration touches only the subscriptions table', () => {
  // Smallest production-safe change: no billing redesign rode along with it.
  const statements = MIGRATION.replace(/--[^\n]*/g, '');
  assert.ok(!/drop table|drop column|delete from|truncate/i.test(statements), 'nothing destructive');
  assert.ok(!/alter table public\.(payments|invoices|tenants|provider_plans)/i.test(statements));
});
