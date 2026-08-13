// Tests for the owner-only "grant complimentary access" action — the
// `grant_comp` branch in supabase/functions/billing-subscription/index.ts and
// grantComp() in supabase/functions/_shared/billing-db.ts.
//
// WHY THIS ACTION EXISTS
// ----------------------
// Until 2026-08-13 nothing in the product could CREATE a comp. The admin could
// read one, relabel it (set_comp_kind) and delete it with the workspace, but
// every comp in production came from a single bulk SQL backfill. The live
// consequence was on the onboarding path: "+ Add client" writes no subscription
// row, so the client was unentitled, and section K gates WRITES on entitlement
// — they could sign in and read their own workspace but never save anything.
// docs/architecture/billing.md §10a is the full account.
//
// WHY BY SOURCE-READING
// ---------------------
// Same constraint as tests/billing-comp-kind.test.mjs: both files are Deno Edge
// Functions that import from `jsr:` and call Deno.serve at module scope, so
// Node cannot import them, and grantComp() needs a live Supabase client. What
// CAN be proved from here is the shape of the statement and the ORDER of the
// branches — which is where every risk in this change actually lives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const SUBSCRIPTION = read('supabase/functions/billing-subscription/index.ts');
const BILLING_DB = read('supabase/functions/_shared/billing-db.ts');
const SECTION_K = read('supabase/sections/section-k-entitlement-enforcement.sql');

/** The body of grantComp(), by brace matching from its signature. */
function grantCompBody() {
  const start = BILLING_DB.indexOf('export async function grantComp(');
  assert.ok(start !== -1, 'grantComp() should exist in _shared/billing-db.ts');
  const open = BILLING_DB.indexOf('{', BILLING_DB.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < BILLING_DB.length; i++) {
    if (BILLING_DB[i] === '{') depth++;
    else if (BILLING_DB[i] === '}') {
      depth--;
      if (depth === 0) return BILLING_DB.slice(open, i + 1);
    }
  }
  throw new Error('could not brace-match grantComp()');
}

/** The `grant_comp` branch of the handler, by brace matching from its `if`. */
function grantCompBranch() {
  const start = SUBSCRIPTION.indexOf('if (action === "grant_comp")');
  assert.ok(start !== -1, 'the grant_comp branch should exist');
  const open = SUBSCRIPTION.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < SUBSCRIPTION.length; i++) {
    if (SUBSCRIPTION[i] === '{') depth++;
    else if (SUBSCRIPTION[i] === '}') {
      depth--;
      if (depth === 0) return SUBSCRIPTION.slice(open, i + 1);
    }
  }
  throw new Error('could not brace-match the grant_comp branch');
}

// ===========================================================================
// Reachability — the trap this action shares with set_comp_kind
// ===========================================================================

// The handler falls through to `if (!sub) return no_subscription 404` for every
// action below it. grant_comp exists FOR tenants with no subscription, so
// placed after that line it can never run: every call 404s, the deploy passes,
// and the button silently never works. set_comp_kind documents the identical
// trap against the paid-subscription guard.
test('grant_comp is handled BEFORE the no_subscription 404', () => {
  const branch = SUBSCRIPTION.indexOf('if (action === "grant_comp")');
  const guard = SUBSCRIPTION.indexOf('if (!sub) return json({ error: "no_subscription" }, 404)');
  assert.ok(branch !== -1 && guard !== -1);
  assert.ok(
    branch < guard,
    'grant_comp must be handled before the no_subscription guard, or it is unreachable',
  );
});

// ===========================================================================
// Authorisation
// ===========================================================================

// is_tenant_admin() is NOT sufficient. Section F gives platform owners
// tenant-admin parity, but it equally passes an ordinary client admin on their
// own workspace — who would otherwise grant themselves free access. Of every
// action in this file, this is the one where that distinction is load-bearing.
test('grant_comp is owners-only, checked with is_platform_owner', () => {
  const branch = grantCompBranch();
  assert.match(branch, /is_platform_owner/,
    'granting a comp must re-check platform ownership');
  assert.match(branch, /forbidden_not_owner/);
  // The owner check must come before the write, not after it.
  assert.ok(
    branch.indexOf('is_platform_owner') < branch.indexOf('grantComp('),
    'the ownership check must precede the grant',
  );
});

test('an RPC fault is not reported as "you are not an owner"', () => {
  const branch = grantCompBranch();
  assert.match(branch, /ownerErr/, 'the RPC error must be captured separately');
  assert.match(branch, /authz_check_failed/);
});

// ===========================================================================
// The write itself
// ===========================================================================

// The single most important property here. An upsert would let a mis-clicked
// grant overwrite a PAYING subscription — wiping provider_subscription_id and
// the period, turning a customer into a freebie and destroying the only local
// pointer to their PayPal agreement. The unique index on tenant_id is the
// guard, and it only guards an INSERT.
test('a comp is INSERTed, never upserted — a paying row cannot be overwritten', () => {
  const body = grantCompBody();
  assert.match(body, /\.insert\(/, 'grantComp must insert');
  assert.ok(!/\.upsert\(/.test(body),
    'grantComp must NEVER upsert: that would overwrite a paying subscription');
  assert.ok(!/\.update\(/.test(body),
    'grantComp must not update an existing row');
});

test('the granted row has the same shape as the backfilled comps', () => {
  const body = grantCompBody();
  // provider 'none' and a null provider subscription id: there is no provider
  // behind a grant.
  assert.match(body, /provider:\s*"none"/);
  assert.match(body, /provider_subscription_id:\s*null/);
  assert.match(body, /status:\s*"comped"/);
  assert.match(body, /plan_code:\s*COMP_PLAN_CODE/);
  // No price.
  assert.match(body, /amount:\s*null/);
  assert.match(body, /currency:\s*null/);
});

// environment is the sandbox/live axis, and it is a PayPal fact. A comp has no
// PayPal, so null is what keeps grants out of the environment migration
// entirely (billing.md §10b) rather than making them part of it.
test('a comp carries no environment', () => {
  assert.match(grantCompBody(), /environment:\s*null/);
});

test('COMP_PLAN_CODE mirrors the browser-side constant', () => {
  assert.match(BILLING_DB, /export const COMP_PLAN_CODE = "comped"/);
  assert.match(read('lib/billing-plans.js'), /export const COMP_PLAN_CODE = 'comped'/);
});

// ===========================================================================
// Duplicates
// ===========================================================================

// subscriptions_tenant_id_key is UNIQUE on tenant_id, so a second grant raises
// 23505. That is a CONFLICT — "this tenant already has a subscription" — and
// must not surface as a 500. The read-before-write in the handler is a
// courtesy; two owners clicking at once both pass it and the database is what
// actually refuses the second.
test('a duplicate grant is a conflict, not a fault', () => {
  const body = grantCompBody();
  assert.match(body, /23505/, 'the unique violation must be recognised');
  assert.match(body, /return null/, 'a duplicate must return null, not throw');
  const branch = grantCompBranch();
  assert.match(branch, /already_has_subscription/);
  assert.match(branch, /409/);
});

test('any error that is NOT a unique violation still throws', () => {
  assert.match(grantCompBody(), /comp_grant_failed/,
    'a real fault must not be swallowed as a duplicate');
});

test('the handler checks for an existing subscription before granting', () => {
  const branch = grantCompBranch();
  assert.ok(
    branch.indexOf('subscriptionByTenant') < branch.indexOf('grantComp('),
    'read before write, so the common conflict names what is already there',
  );
});

// ===========================================================================
// Auditability
// ===========================================================================

// There is no audit table, and billing_events is not one — it is raw provider
// webhooks keyed on (provider, provider_event_id), and writing operator actions
// there would corrupt its meaning and its idempotency. The log line plus
// created_at on the row is the trace; the acting user id is the part that
// cannot be reconstructed from the row afterwards.
test('the grant records WHO performed it', () => {
  const branch = grantCompBranch();
  assert.match(branch, /console\.log/);
  assert.match(branch, /by=\$\{who\.user\.id\}/,
    'the acting owner must be recorded — it is not recoverable from the row');
  assert.match(branch, /tenant=/);
});

// ===========================================================================
// Blast radius — what this change must NOT have touched
// ===========================================================================

test('comp_kind defaults to a permanent grant, and a wrong value is refused', () => {
  const branch = grantCompBranch();
  assert.match(branch, /"grandfather"/, 'the default must be the permanent grant');
  // An explicitly wrong value is still rejected rather than silently defaulted.
  assert.match(branch, /invalid_comp_kind/);
  assert.match(branch, /normalizeCompKind/);
});

// Entitlement is decided by tenant_has_active_subscription(), which already
// treats 'comped' as entitled. This change adds a row of a status the function
// already understood; it must not have edited the function or its wiring.
test('entitlement rules were not modified', () => {
  assert.match(SECTION_K, /tenant_has_active_subscription/);
  assert.ok(
    !/grant_comp|grantComp/.test(SECTION_K),
    'section K must not know about the grant action',
  );
});

test('no PayPal call is made when granting a comp', () => {
  const branch = grantCompBranch();
  for (const forbidden of ['provider.', 'paypal', 'PAYPAL_ENV', 'signGrant', 'activeProviderPlan']) {
    assert.ok(
      !branch.includes(forbidden),
      `granting a comp must not touch the provider (found "${forbidden}")`,
    );
  }
});
