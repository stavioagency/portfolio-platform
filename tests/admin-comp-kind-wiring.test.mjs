// The Subscribers screen's comp_kind control, read as source.
//
// WHAT THIS PHASE PROMISED
// ------------------------
// Phase 2C exposes convertible comps to the OWNER and opens nothing. A comp
// gets a label and a toggle; it does not get a payment link, and it cannot
// reach a checkout. billing-checkout still refuses every comped tenant
// whatever its comp_kind, so a link or a CTA offered here would lead straight
// to a 409.
//
// The separation that guarantees it is structural, not a matter of care:
// payment links render on `!r.billing.entitled`, and a comp IS entitled, so it
// is excluded by the condition that was already there. This file pins that the
// condition was not "helpfully" widened while someone was editing the same
// block of JSX — which is the single most likely way to break the promise.
//
// pages/admin.js is a React page with no test harness in this project (the
// suite covers pure lib modules), so these are source assertions. They cannot
// prove the screen renders; they can prove the wiring, and the wiring is where
// the risk is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = readFileSync(join(ROOT, 'pages/admin.js'), 'utf8');

// The Subscribers row action area: from the <div className="cl-actions"> that
// follows the subscriber list, to the end of that row's markup.
function subscriberActions() {
  const listStart = ADMIN.indexOf('async function changeCompKind(');
  assert.notEqual(listStart, -1, 'changeCompKind must exist');
  const actions = ADMIN.indexOf('<div className="cl-actions">', listStart);
  assert.notEqual(actions, -1, 'the subscriber row actions must exist');
  const end = ADMIN.indexOf('</Card>', actions);
  assert.notEqual(end, -1, 'the row Card must close');
  return ADMIN.slice(actions, end);
}

// --- the query can actually see the column ------------------------------------

test('the Subscribers query selects comp_kind', () => {
  // Without this the toggle appears to work and the label never updates —
  // a silent failure that looks like a broken write.
  const select = ADMIN.match(/\.select\('tenant_id, plan_code, status,[^']*'\)/);
  assert.ok(select, 'the subscriptions select must exist');
  assert.ok(select[0].includes('comp_kind'), 'comp_kind must be selected');
});

// --- the action is wired to the deployed backend ------------------------------

test('the handler calls the set_comp_kind action', () => {
  assert.ok(/action: 'set_comp_kind'/.test(ADMIN), 'must call set_comp_kind');
  assert.ok(/comp_kind: kind/.test(ADMIN), 'must send the requested kind');
  assert.ok(
    /invokeBilling\('billing-subscription'/.test(ADMIN),
    'must go through billing-subscription, which is owner-gated server-side',
  );
});

test('only the two valid kinds are ever sent', () => {
  const handler = ADMIN.slice(
    ADMIN.indexOf('async function changeCompKind('),
    ADMIN.indexOf('async function syncPlans('),
  );
  const kinds = [...handler.matchAll(/'(grandfather|convertible)'/g)].map((m) => m[1]);
  assert.ok(kinds.length > 0, 'the handler must name the kinds');
  assert.ok(
    kinds.every((k) => k === 'grandfather' || k === 'convertible'),
    'no other value may be sent',
  );
});

test('making a comp convertible is confirmed; making it permanent is not', () => {
  // Asymmetric on purpose. Convertible changes a promise made to a real client;
  // grandfather is the undo, and friction on an undo is friction in the wrong
  // place.
  const handler = ADMIN.slice(
    ADMIN.indexOf('async function changeCompKind('),
    ADMIN.indexOf('async function syncPlans('),
  );
  const guard = handler.indexOf("if (kind === 'convertible')");
  const confirmCall = handler.indexOf('await confirm(');
  assert.ok(guard !== -1, 'the convertible direction must be guarded');
  assert.ok(confirmCall > guard, 'the confirm must sit inside that guard');
  assert.ok(
    handler.indexOf('setBusyId(row.id)') > confirmCall,
    'nothing may be sent before the operator agrees',
  );
});

test('the screen refreshes after a successful change', () => {
  const handler = ADMIN.slice(
    ADMIN.indexOf('async function changeCompKind('),
    ADMIN.indexOf('async function syncPlans('),
  );
  assert.ok(/setReloadToken\(\(n\) => n \+ 1\)/.test(handler), 'must reload the list');
  assert.ok(/billingActionError\(err\?\.message, lang\)/.test(handler), 'must surface a real message');
});

// --- THE PROMISE: comps get no checkout, no payment link ----------------------

test('the payment-link condition is still exactly !r.billing.entitled', () => {
  // Widening this to include comps is the one edit that would break the phase,
  // and it is a plausible edit because the comp control sits beside it.
  assert.ok(
    /\{!r\.billing\.entitled && \(/.test(ADMIN),
    'the payment-link block must remain gated on !r.billing.entitled alone',
  );
});

test('the comp branch calls neither createPaymentLink nor goToCheckout', () => {
  const actions = subscriberActions();
  const compStart = actions.indexOf("{r.billing.state === 'comped' && (");
  assert.notEqual(compStart, -1, 'the comp control must exist');
  // The comp block runs to its closing `)}` at the same nesting depth; taking
  // everything from its start to the next sibling block is close enough to
  // catch a stray call added inside it.
  const compBlock = actions.slice(compStart, actions.indexOf("{r.billing.entitled &&", compStart));
  assert.ok(compBlock.length > 0, 'could not isolate the comp block');
  assert.ok(!/createPaymentLink/.test(compBlock), 'a comp must never be offered a payment link');
  assert.ok(!/goToCheckout/.test(compBlock), 'a comp must never be sent to checkout');
  assert.ok(!/allPlans\(\)/.test(compBlock), 'and must not render the plan buttons');
});

test('the comp control only renders for a comped workspace', () => {
  const actions = subscriberActions();
  assert.ok(
    actions.includes("{r.billing.state === 'comped' && ("),
    'the control must be gated on the comped state',
  );
});

test('changeCompKind never reaches checkout', () => {
  const handler = ADMIN.slice(
    ADMIN.indexOf('async function changeCompKind('),
    ADMIN.indexOf('async function syncPlans('),
  );
  assert.ok(!/goToCheckout|createPaymentLink|billing-checkout/.test(handler));
});

// --- the client's view is untouched -------------------------------------------

test('the client Billing tab still says only one thing about comps', () => {
  // A convertible comp must look identical to the client until checkout
  // accepts one. Exactly one comped note, and no comp_kind anywhere near it.
  const notes = ADMIN.match(/billing_comped_note/g) ?? [];
  assert.equal(notes.length, 1, 'the client-facing comped note must not have grown a variant');
  const tabStart = ADMIN.indexOf("billing.state === 'comped' && <p className=\"bl-comped\"");
  assert.notEqual(tabStart, -1, 'the client comped note must still exist');
  const around = ADMIN.slice(tabStart - 400, tabStart + 400);
  assert.ok(!/comp_kind/.test(around), 'the client tab must not branch on comp_kind');
});
