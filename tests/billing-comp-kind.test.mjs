// Tests for the owner-only comp_kind mutation — normalizeCompKind() in
// supabase/functions/billing-subscription/index.ts and setCompKind() in
// supabase/functions/_shared/billing-db.ts.
//
// WHAT comp_kind IS, AND THE INVARIANT THESE PROTECT
// --------------------------------------------------
// section-m-convertible-comps.sql added subscriptions.comp_kind: 'grandfather'
// for a client granted permanent free access, 'convertible' for a comp we
// intend to turn into a paying subscription. It is METADATA. It records who may
// be OFFERED a checkout; it does not decide who is entitled.
//
// tenant_has_active_subscription() does not read it and must never read it, so
// a comped workspace is exactly as entitled whichever kind it carries. That is
// what makes a mislabelled row a wrong BUTTON rather than a lockout — the
// property the section-K backfill lacked when it comped three unpaid
// self-signup workspaces and left them unable to buy their way out.
//
// WHY BY EXTRACTION AND BY SOURCE-READING
// ---------------------------------------
// Both files are Deno Edge Functions: they import from `jsr:`, call Deno.serve
// at module scope, and cannot be imported by Node. Same constraint and same
// solution as tests/billing-period-end.test.mjs — the decision is written as a
// pure, exported function and lifted out of the source by brace matching.
//
// setCompKind() is async and needs a Supabase client, so it cannot be executed
// here. What CAN be proved from Node is the shape of the statement it builds,
// and that is where the safety lives: the `status = 'comped'` filter is what
// makes the write structurally unable to touch a paid row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const SUBSCRIPTION = read('supabase/functions/billing-subscription/index.ts');
const BILLING_DB = read('supabase/functions/_shared/billing-db.ts');
const CHECKOUT = read('supabase/functions/billing-checkout/index.ts');
const WEBHOOK = read('supabase/functions/billing-webhook/index.ts');
const STATUS_LIB = read('lib/billing-status.js');
const SECTION_H = read('supabase/sections/section-h-billing.sql');

// Exactly the annotations normalizeCompKind's signature uses. Deliberately
// explicit rather than a general stripper: if the signature changes, extraction
// fails loudly instead of quietly testing something else.
function stripTypes(source) {
  return source
    .replaceAll('value: unknown', 'value')
    .replaceAll('): "grandfather" | "convertible" | null {', ') {');
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

const { normalizeCompKind } = new Function(
  [extract(stripTypes(SUBSCRIPTION), 'normalizeCompKind'), 'return { normalizeCompKind };'].join('\n'),
)();

// --- 1 & 2. both directions are allowed ---------------------------------------

test('grandfather → convertible is accepted', () => {
  // The consequential direction: it makes a workspace eligible to be asked to
  // pay. Allowed, but only through this one owner-gated action.
  assert.equal(normalizeCompKind('convertible'), 'convertible');
});

test('convertible → grandfather is accepted', () => {
  // The safe direction, and the rollback for the whole feature: setting every
  // comp back to grandfather restores the behaviour that existed before
  // section-m, with no deploy.
  assert.equal(normalizeCompKind('grandfather'), 'grandfather');
});

test('the two values round-trip, so a mistake is always reversible', () => {
  const there = normalizeCompKind('convertible');
  const back = normalizeCompKind('grandfather');
  assert.equal(there, 'convertible');
  assert.equal(back, 'grandfather');
});

// --- 3. everything else is rejected -------------------------------------------

test('unrecognised strings are rejected', () => {
  for (const bad of ['free', 'comped', 'permanent', 'grandfathered', 'convert', '']) {
    assert.equal(normalizeCompKind(bad), null, `${JSON.stringify(bad)} must be refused`);
  }
});

test('case and whitespace are NOT forgiven', () => {
  // No trimming and no case folding on purpose. These are typos in a
  // hand-written request, and guessing what an operator meant about who gets
  // asked to pay is not a kindness.
  for (const bad of ['Convertible', 'GRANDFATHER', ' convertible', 'convertible ', 'Grandfather']) {
    assert.equal(normalizeCompKind(bad), null, `${JSON.stringify(bad)} must be refused`);
  }
});

test('non-strings are rejected rather than coerced', () => {
  for (const bad of [null, undefined, 0, 1, true, false, {}, [], ['convertible']]) {
    assert.equal(normalizeCompKind(bad), null, `${JSON.stringify(bad) ?? 'undefined'} must be refused`);
  }
});

test('a rejected value produces a 400 and never reaches the database', () => {
  // The order matters: validate, THEN write. A caller that sends nonsense must
  // get a named 400, not a CHECK-constraint violation surfaced as a 500.
  const validate = SUBSCRIPTION.indexOf('const kind = normalizeCompKind(body.comp_kind);');
  const reject = SUBSCRIPTION.indexOf('"invalid_comp_kind"');
  const write = SUBSCRIPTION.indexOf('await setCompKind(admin, tenantId, kind)');
  assert.ok(validate !== -1 && reject !== -1 && write !== -1, 'all three must be present');
  assert.ok(validate < reject, 'validation must precede the rejection');
  assert.ok(reject < write, 'the rejection must precede the write');
});

// --- 4. non-owners are rejected -----------------------------------------------

test('the branch requires is_platform_owner, not merely tenant admin', () => {
  // is_tenant_admin() is checked for every action further up, and it is NOT
  // enough: section F gives platform owners tenant-admin parity, but it also
  // passes an ordinary client admin on their own workspace — who would
  // otherwise be able to make their own comp sellable.
  const branch = SUBSCRIPTION.slice(
    SUBSCRIPTION.indexOf('if (action === "set_comp_kind")'),
    SUBSCRIPTION.indexOf('const sub = await subscriptionByTenant(admin, tenantId);'),
  );
  assert.ok(branch.length > 0, 'the set_comp_kind branch must exist');
  assert.ok(branch.includes('caller.rpc("is_platform_owner")'), 'must check is_platform_owner');
  assert.ok(branch.includes('"forbidden_not_owner"'), 'must refuse a non-owner');
});

test('the owner check happens before the write', () => {
  const owner = SUBSCRIPTION.indexOf('caller.rpc("is_platform_owner")');
  const write = SUBSCRIPTION.indexOf('await setCompKind(admin, tenantId, kind)');
  assert.ok(owner !== -1 && write !== -1);
  assert.ok(owner < write, 'authorisation must precede the write');
});

test('the owner check is made against the CALLER, never the service role', () => {
  // adminClient() bypasses RLS by design. Deciding permissions with it would
  // make every caller an owner.
  assert.ok(
    !/admin\.rpc\("is_platform_owner"\)/.test(SUBSCRIPTION),
    'is_platform_owner must never be asked of the service-role client',
  );
});

test('an authz RPC fault is reported as a fault, not as "not an owner"', () => {
  const branch = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('if (action === "set_comp_kind")'));
  assert.ok(branch.includes('ownerErr'), 'the RPC error must be captured');
  assert.ok(
    branch.indexOf('"authz_check_failed"') < branch.indexOf('"forbidden_not_owner"'),
    'an RPC error must be answered before the boolean is trusted',
  );
});

// --- 5. non-comped subscriptions are rejected ---------------------------------

test('setCompKind can only ever update a comped row', () => {
  // The structural guarantee. Even if every check above were bypassed, this
  // statement cannot touch a paid, pending or cancelled subscription.
  const fn = BILLING_DB.slice(
    BILLING_DB.indexOf('export async function setCompKind('),
    BILLING_DB.indexOf('// Payments and invoices'),
  );
  assert.ok(fn.length > 0, 'setCompKind must exist');
  assert.ok(fn.includes('.eq("tenant_id", tenantId)'), 'must be scoped to one tenant');
  assert.ok(fn.includes('.eq("status", "comped")'), 'must be scoped to comped rows');
  assert.ok(fn.includes('.update({ comp_kind: kind })'), 'must write only comp_kind');
});

test('setCompKind reports "nothing matched" rather than a false success', () => {
  // A predicate-filtered UPDATE reports success having changed nothing
  // (HANDOFF §6), so the affected rows are what decide the answer.
  const fn = BILLING_DB.slice(
    BILLING_DB.indexOf('export async function setCompKind('),
    BILLING_DB.indexOf('// Payments and invoices'),
  );
  assert.ok(fn.includes('.select('), 'must read back the affected rows');
  assert.ok(/return data\?\.\[0\] \?\? null;/.test(fn), 'zero rows must surface as null');
});

test('a non-comped target answers 409, and a missing row answers 404', () => {
  const branch = SUBSCRIPTION.slice(
    SUBSCRIPTION.indexOf('if (action === "set_comp_kind")'),
    SUBSCRIPTION.indexOf('const sub = await subscriptionByTenant(admin, tenantId);'),
  );
  assert.ok(branch.includes('"not_a_comped_subscription"'), 'must distinguish a non-comp');
  assert.ok(branch.includes('"no_subscription"'), 'must distinguish a missing row');
});

test('the branch is placed BEFORE the paid-subscription guard', () => {
  // That guard 409s on status === "comped", which is exactly the population
  // this action edits. A branch after it would be unreachable — silently, with
  // a passing deploy and a button that never works.
  const branch = SUBSCRIPTION.indexOf('if (action === "set_comp_kind")');
  const guard = SUBSCRIPTION.indexOf('"not_a_paid_subscription"');
  assert.ok(branch !== -1 && guard !== -1);
  assert.ok(branch < guard, 'set_comp_kind must short-circuit before not_a_paid_subscription');
});

// --- the operator record ------------------------------------------------------
// There is no audit table, and billing_events must not become one — it is raw
// provider webhooks keyed on (provider, provider_event_id). So this log line is
// the only record that an operator changed who may be asked to pay, and it has
// to name the transition: "convertible" alone cannot tell a real change from a
// re-apply of the value a row already had.

test('the row is read BEFORE the write, so the prior value is knowable', () => {
  const branch = SUBSCRIPTION.slice(
    SUBSCRIPTION.indexOf('if (action === "set_comp_kind")'),
    SUBSCRIPTION.indexOf('const sub = await subscriptionByTenant(admin, tenantId);'),
  );
  const read = branch.indexOf('const current = await subscriptionByTenant(admin, tenantId);');
  const capture = branch.indexOf('const previous');
  const write = branch.indexOf('await setCompKind(admin, tenantId, kind)');
  assert.ok(read !== -1, 'the branch must read the row first');
  assert.ok(read < capture && capture < write, 'read, capture the prior value, then write');
});

test('the audit line records the transition, not just the destination', () => {
  const branch = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('if (action === "set_comp_kind")'));
  // Anchored AFTER console.log: the branch has earlier `return json({` guards,
  // and searching from zero produces an inverted (empty) slice that passes
  // nothing and proves nothing.
  const logStart = branch.indexOf('console.log(');
  assert.notEqual(logStart, -1, 'the branch must log the change');
  const log = branch.slice(logStart, branch.indexOf('return json({', logStart));
  assert.ok(/previous/.test(log), 'the log must carry the previous value');
  assert.ok(/-> \$\{kind\}/.test(log), 'the log must carry the new value as a transition');
  assert.ok(/tenant=/.test(log) && /by=/.test(log), 'the log must name the tenant and the actor');
});

test('an unset prior value is written as "unset", never as empty', () => {
  // Every comp carries a kind after section-m's backfill, so this is the
  // could-not-happen branch. It still must not log a bare "-> convertible"
  // with a hole where the previous value belongs.
  const branch = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('if (action === "set_comp_kind")'));
  assert.ok(/previous \?\? "unset"/.test(branch), 'a null prior value must render as "unset"');
});

test('the response reports the previous value and whether anything changed', () => {
  const branch = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('if (action === "set_comp_kind")'));
  assert.ok(/previous_comp_kind: previous/.test(branch), 'must return the prior value');
  assert.ok(/changed: previous !== kind/.test(branch), 'must say whether it actually changed');
});

test('a race that un-comps the row between read and write is still refused', () => {
  // The read above is not a lock. setCompKind's own status filter is what
  // actually catches this, which is why that filter is on the statement rather
  // than only in the handler.
  const branch = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('if (action === "set_comp_kind")'));
  const write = branch.indexOf('await setCompKind(admin, tenantId, kind)');
  const after = branch.slice(write);
  assert.ok(
    after.indexOf('"not_a_comped_subscription"') !== -1,
    'a zero-row write must still answer not_a_comped_subscription',
  );
});

// --- 6. entitlement is untouched by comp_kind ---------------------------------

test('the entitlement authority does not mention comp_kind', () => {
  // tenant_has_active_subscription() is THE definition of "is this workspace
  // paid up". If comp_kind ever appears in it, a metadata mistake becomes a
  // client's site going dark.
  const fn = SECTION_H.slice(
    SECTION_H.indexOf('create or replace function public.tenant_has_active_subscription'),
    SECTION_H.indexOf('grant execute on function public.tenant_has_active_subscription'),
  );
  assert.ok(fn.length > 0, 'could not locate the entitlement function');
  assert.ok(!/comp_kind/.test(fn), 'entitlement must never read comp_kind');
});

test('the UI mirror of entitlement does not mention comp_kind either', () => {
  // lib/billing-status.js is the UI's copy of the same rule. A convertible comp
  // must derive identically to a grandfather comp — same state, same tone, same
  // label — or the client is shown a difference the backend does not honour.
  assert.ok(!/comp_kind/.test(STATUS_LIB), 'deriveBilling must not read comp_kind');
});

test('comp_kind is not part of the generic subscription patch', () => {
  // Every other write in billing-db.ts is driven by something the provider
  // said. Operator intent must never ride along on a webhook patch.
  const patch = BILLING_DB.slice(
    BILLING_DB.indexOf('export interface SubscriptionPatch {'),
    BILLING_DB.indexOf('}', BILLING_DB.indexOf('export interface SubscriptionPatch {')),
  );
  assert.ok(patch.length > 0, 'SubscriptionPatch must exist');
  assert.ok(!/comp_kind/.test(patch), 'comp_kind must not be in SubscriptionPatch');
});

// --- 7. checkout is still closed to comped tenants ----------------------------

test('billing-checkout still refuses every comped tenant', () => {
  // Phase 2B records intent and opens nothing. This is the machine-checkable
  // form of that promise: if it fails, someone opened the gate.
  assert.ok(
    /\["active", "trialing", "comped"\]\.includes\(existing\.status\)/.test(CHECKOUT),
    'comped must still be refused at checkout',
  );
});

test('billing-checkout knows nothing about comp_kind', () => {
  assert.ok(!/comp_kind/.test(CHECKOUT), 'checkout must not read comp_kind in this phase');
});

test('billing-webhook knows nothing about comp_kind', () => {
  // The webhook is untouched by this work, and comp_kind must not become
  // something a provider event can change.
  assert.ok(!/comp_kind/.test(WEBHOOK), 'the webhook must not read or write comp_kind');
});

test('Phase 1 comped checkout safety is still wired in', () => {
  // set_comp_kind shares a bundle with nothing, but billing-subscription and
  // billing-checkout share _shared/. Confirm the Phase 1 guarantees survived.
  assert.ok(/status: checkoutStatus\(existing\?\.status, created\.status\)/.test(CHECKOUT));
  assert.ok(/if \(needsRemoteVerification\(existing\?\.status, existing\?\.provider_subscription_id\)\)/.test(CHECKOUT));
});
