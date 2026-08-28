// Tests for lib/billing-status.js — the subscription state machine.
// Zero dependencies — run with: npm test
//
// This is the module most likely to be wrong in a way nobody notices, so the
// cases below are written around the two failure modes that actually cost
// something: a paying customer losing access they paid for, and a lapsed
// account keeping access it did not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING_STATES,
  GRACE_DAYS,
  deriveBilling,
  statusLabel,
  statusSentence,
  formatBillingDate,
  paymentTone,
  paymentLabel,
  isSubscriber,
} from '../lib/billing-status.js';

const NOW = Date.parse('2026-08-05T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(NOW + n * DAY).toISOString();

test('no row at all is "none", and not entitled', () => {
  const v = deriveBilling(null, NOW);
  assert.equal(v.state, 'none');
  assert.equal(v.entitled, false);
  assert.equal(v.daysLeft, null);
});

test('an active subscription is entitled and reports its renewal date', () => {
  const v = deriveBilling({ status: 'active', plan_code: 'yearly', current_period_end: inDays(30) }, NOW);
  assert.equal(v.state, 'active');
  assert.equal(v.entitled, true);
  assert.equal(v.daysLeft, 30);
  assert.equal(v.renewsAt, inDays(30));
  assert.equal(v.needsAction, false);
});

test('an active row whose period has already elapsed is NOT entitled', () => {
  // The renewal job not having run is not a reason to give the product away —
  // and treating this as active would hand out free time proportional to how
  // long the cron has been broken.
  const v = deriveBilling({ status: 'active', plan_code: 'monthly', current_period_end: inDays(-1) }, NOW);
  assert.equal(v.state, 'expired');
  assert.equal(v.entitled, false);
  assert.equal(v.needsAction, true);
});

test('a cancellation inside the paid period keeps access until it ends', () => {
  // They paid for those days. Cutting access at the moment of cancellation is
  // taking money for nothing.
  const v = deriveBilling(
    { status: 'active', plan_code: 'monthly', cancel_at_period_end: true, current_period_end: inDays(12) },
    NOW,
  );
  assert.equal(v.state, 'canceling');
  assert.equal(v.entitled, true);
  assert.equal(v.daysLeft, 12);
});

test('a cancelled row is still "canceling" while its period runs, then "canceled"', () => {
  const during = deriveBilling({ status: 'canceled', plan_code: 'yearly', current_period_end: inDays(3) }, NOW);
  assert.equal(during.state, 'canceling');
  assert.equal(during.entitled, true);

  const after = deriveBilling({ status: 'canceled', plan_code: 'yearly', current_period_end: inDays(-3) }, NOW);
  assert.equal(after.state, 'canceled');
  assert.equal(after.entitled, false);
});

test('a failed payment keeps access through the grace window', () => {
  const v = deriveBilling(
    { status: 'past_due', plan_code: 'monthly', current_period_end: inDays(-2), grace_ends_at: inDays(5) },
    NOW,
  );
  assert.equal(v.state, 'past_due');
  assert.equal(v.entitled, true, 'a declined card is recoverable — do not cut them off on day one');
  assert.equal(v.needsAction, true);
  assert.equal(v.tone, 'warning', 'red would read as "already gone"');
});

test('grace is finite — past its end the account is expired', () => {
  const v = deriveBilling(
    { status: 'past_due', plan_code: 'monthly', current_period_end: inDays(-20), grace_ends_at: inDays(-1) },
    NOW,
  );
  assert.equal(v.state, 'expired');
  assert.equal(v.entitled, false);
});

test('past_due without an explicit grace date falls back to GRACE_DAYS', () => {
  // Rows written before grace_ends_at existed must still behave.
  const inside = deriveBilling({ status: 'past_due', current_period_end: inDays(-(GRACE_DAYS - 2)) }, NOW);
  assert.equal(inside.entitled, true);
  const outside = deriveBilling({ status: 'past_due', current_period_end: inDays(-(GRACE_DAYS + 1)) }, NOW);
  assert.equal(outside.entitled, false);
});

test('a comped workspace with no dates at all is entitled', () => {
  // The workspaces that predate billing carry this. A missing period end must
  // not read as "expired" — that would switch off every live client site.
  // Grants CAN now expire, but only when a date says so; see the block at the
  // bottom of this file.
  const v = deriveBilling({ status: 'comped', plan_code: 'comped' }, NOW);
  assert.equal(v.state, 'comped');
  assert.equal(v.entitled, true);
  assert.equal(v.renewsAt, null);
  assert.equal(v.daysLeft, null);
});

test('a subscription awaiting approval grants nothing', () => {
  // PayPal creates the subscription BEFORE the customer approves it. Between
  // those two moments a row exists and no money has moved — treating that as
  // access would give the product away to anyone who starts checkout and walks.
  const v = deriveBilling({ status: 'pending', plan_code: 'yearly' }, NOW);
  assert.equal(v.state, 'pending');
  assert.equal(v.entitled, false);
  assert.equal(v.needsAction, true);
});

test('a trial is entitled until it ends', () => {
  assert.equal(deriveBilling({ status: 'trialing', trial_ends_at: inDays(4) }, NOW).entitled, true);
  assert.equal(deriveBilling({ status: 'trialing', trial_ends_at: inDays(-1) }, NOW).state, 'expired');
});

test('an unrecognised status fails CLOSED', () => {
  // A status this build does not know about — written by a newer backend, or a
  // refund path added later — must not be treated as paid.
  const v = deriveBilling({ status: 'chargeback', plan_code: 'yearly', current_period_end: inDays(60) }, NOW);
  assert.equal(v.entitled, false);
  assert.equal(v.needsAction, true);
});

test('a malformed date does not produce NaN days or a crash', () => {
  const v = deriveBilling({ status: 'active', plan_code: 'monthly', current_period_end: 'not-a-date' }, NOW);
  assert.equal(v.state, 'active');
  assert.equal(v.daysLeft, null);
  assert.equal(v.renewsAt, null);
});

test('daysLeft never goes negative', () => {
  const v = deriveBilling({ status: 'canceled', plan_code: 'monthly', current_period_end: inDays(-9) }, NOW);
  assert.equal(v.daysLeft, 0);
});

test('every derived state is a declared one', () => {
  const rows = [
    null,
    { status: 'active', current_period_end: inDays(5) },
    { status: 'active', current_period_end: inDays(-5) },
    { status: 'active', cancel_at_period_end: true, current_period_end: inDays(5) },
    { status: 'canceled', current_period_end: inDays(5) },
    { status: 'canceled', current_period_end: inDays(-5) },
    { status: 'past_due', current_period_end: inDays(-1) },
    { status: 'trialing', trial_ends_at: inDays(2) },
    { status: 'pending' },
    { status: 'comped' },
    { status: 'who_knows' },
  ];
  for (const row of rows) {
    assert.ok(BILLING_STATES.includes(deriveBilling(row, NOW).state), `undeclared state for ${JSON.stringify(row)}`);
  }
});

test('isSubscriber counts comped and mid-retry workspaces, not just "active"', () => {
  // The owner's Subscribers filter uses this. Filtering on status === 'active'
  // would have hidden every granted workspace and every recoverable decline.
  assert.equal(isSubscriber({ status: 'comped' }, NOW), true);
  assert.equal(isSubscriber({ status: 'past_due', grace_ends_at: inDays(2) }, NOW), true);
  assert.equal(isSubscriber({ status: 'canceled', current_period_end: inDays(-1) }, NOW), false);
  assert.equal(isSubscriber(null, NOW), false);
});

test('labels and sentences exist in both locales for every state', () => {
  for (const state of BILLING_STATES) {
    for (const lang of ['ar', 'en']) {
      const label = statusLabel(state, lang);
      assert.ok(label && label.length > 0, `missing ${lang} label for ${state}`);
      const sentence = statusSentence({ state, renewsAt: inDays(3), endsAt: inDays(3) }, lang);
      assert.ok(sentence && sentence.length > 0, `missing ${lang} sentence for ${state}`);
    }
  }
});

test('dates render with Latin numerals in Arabic', () => {
  const iso = '2026-09-05T00:00:00Z';
  assert.match(formatBillingDate(iso, 'ar'), /5 سبتمبر 2026/);
  assert.match(formatBillingDate(iso, 'en'), /5 Sep 2026/);
  assert.equal(formatBillingDate(null, 'en'), '—');
  assert.equal(formatBillingDate('nonsense', 'ar'), '—');
});

test('payment outcomes have a tone and a label in both locales', () => {
  for (const status of ['paid', 'pending', 'failed', 'refunded', 'voided']) {
    assert.ok(paymentTone(status));
    assert.ok(paymentLabel(status, 'ar'));
    assert.ok(paymentLabel(status, 'en'));
  }
  assert.equal(paymentTone('unknown'), 'neutral');
  assert.equal(paymentLabel('unknown', 'en'), 'unknown');
});

// ── Comped grants that run out ──────────────────────────────────────────
//
// Free access became time-limited on 2026-08-28: a grant is normally 30 days
// and renewable. Before that, comped meant entitled and no date was read at
// all — so these tests exist to pin the ONE property that keeps the change
// safe, alongside the new behaviour.
//
// THE SAFE PROPERTY: no end date still means forever. Every live client is
// comped with current_period_end null, so a missing date reading as "expired"
// would have taken down all seven portfolios at once.

test('a comped grant with no end date is permanent, and stays entitled', () => {
  const v = deriveBilling({ status: 'comped', plan_code: 'comped', current_period_end: null });
  assert.equal(v.state, 'comped');
  assert.equal(v.entitled, true);
  assert.equal(v.endsAt, null);
  assert.equal(v.daysLeft, null, 'a permanent grant counts down to nothing');
});

test('the seven live rows are exactly that shape, so none of them moved', () => {
  // grandfather comps as they exist in the database today: status comped,
  // plan_code comped, no period end.
  const live = { status: 'comped', plan_code: 'comped', comp_kind: 'grandfather', current_period_end: null };
  assert.equal(deriveBilling(live).entitled, true);
});

test('a comped grant still inside its window is entitled and counts down', () => {
  const now = Date.parse('2026-08-28T00:00:00Z');
  const v = deriveBilling(
    { status: 'comped', plan_code: 'comped', current_period_end: '2026-09-27T00:00:00Z' },
    now,
  );
  assert.equal(v.state, 'comped');
  assert.equal(v.entitled, true);
  assert.equal(v.daysLeft, 30, 'daysLeft is what the 7-day and 1-day warnings read');
});

test('a comped grant whose window has passed is expired, and NOT entitled', () => {
  const now = Date.parse('2026-08-28T00:00:00Z');
  const v = deriveBilling(
    { status: 'comped', plan_code: 'comped', current_period_end: '2026-08-27T00:00:00Z' },
    now,
  );
  assert.equal(v.state, 'expired', 'it lands in the same state an unpaid account reaches');
  assert.equal(v.entitled, false);
  assert.equal(v.needsAction, true);
});

test('the boundary belongs to the client: entitled up to the instant it ends', () => {
  const end = Date.parse('2026-09-27T00:00:00Z');
  assert.equal(
    deriveBilling({ status: 'comped', plan_code: 'comped', current_period_end: '2026-09-27T00:00:00Z' }, end - 1).entitled,
    true,
  );
  assert.equal(
    deriveBilling({ status: 'comped', plan_code: 'comped', current_period_end: '2026-09-27T00:00:00Z' }, end).entitled,
    false,
  );
});

test('isSubscriber agrees, so the two never disagree about a lapsed grant', () => {
  // The console's counts read isSubscriber, not deriveBilling. If they diverge,
  // an expired client is still shown as one who has access.
  const now = Date.parse('2026-08-28T00:00:00Z');
  assert.equal(
    isSubscriber({ status: 'comped', plan_code: 'comped', current_period_end: '2026-08-27T00:00:00Z' }, now),
    false,
  );
  assert.equal(isSubscriber({ status: 'comped', plan_code: 'comped', current_period_end: null }, now), true);
});
