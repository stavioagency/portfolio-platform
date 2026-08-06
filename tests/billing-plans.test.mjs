// Tests for lib/billing-plans.js — the plan catalogue and every number that
// means money. Zero dependencies — run with: npm test
//
// The load-bearing cases here are the ones where being wrong costs real money:
// an invalid price override must never resolve to zero, amounts must stay
// integer halalas, and upgrade/downgrade must be decided by rank rather than by
// price (a discounted higher tier is still an upgrade).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPLAY_CURRENCY,
  BILLING_CURRENCY,
  minorUnits,
  DEFAULT_PLAN_CODE,
  listPlans,
  allPlans,
  getPlan,
  planAmount,
  billingAmount,
  toProviderAmount,
  periodMonths,
  monthlyEquivalent,
  savingsPercent,
  planChangeKind,
  planIncludes,
  formatAmount,
  formatBillingNote,
  formatInterval,
  planName,
} from '../lib/billing-plans.js';

test('the catalogue holds the two beta plans at the agreed prices', () => {
  const codes = listPlans().map((p) => p.code);
  assert.deepEqual(codes, ['monthly', 'yearly']);
  assert.equal(planAmount('monthly'), 1200); // 12 SAR
  assert.equal(planAmount('yearly'), 12000); // 120 SAR
  assert.equal(DISPLAY_CURRENCY, 'SAR');
});

test('every amount is an integer number of minor units, in both currencies', () => {
  for (const plan of listPlans()) {
    for (const [currency, amount] of Object.entries(plan.price)) {
      assert.ok(Number.isInteger(amount), `${plan.code}.${currency} must be an integer`);
      assert.ok(amount > 0, `${plan.code}.${currency} must be positive`);
    }
    assert.equal(plan.amount, plan.price[DISPLAY_CURRENCY], 'plan.amount is the DISPLAY price');
  }
});

// ---------------------------------------------------------------------------
// The currency split. PayPal cannot charge SAR, so what is quoted and what is
// debited are two different numbers and the code must never confuse them.
// ---------------------------------------------------------------------------

test('every plan is priced in the billing currency, or it cannot be sold', () => {
  for (const plan of listPlans()) {
    const billed = billingAmount(plan.code);
    assert.ok(billed, `${plan.code} has no ${BILLING_CURRENCY} price — checkout would fail`);
    assert.equal(billed.currency, BILLING_CURRENCY);
    assert.ok(Number.isInteger(billed.amount) && billed.amount > 0);
  }
});

test('the billing amount is NOT the display amount', () => {
  // The bug this guards against is passing plan.amount (SAR) to PayPal, which
  // would charge 12 US dollars for a 12 riyal plan — nearly four times over.
  const billed = billingAmount('monthly');
  assert.notEqual(billed.amount, planAmount('monthly'));
  assert.equal(billed.amount, 320);
  assert.equal(billingAmount('yearly').amount, 3200);
});

test('an unknown plan has no billing amount rather than a zero one', () => {
  assert.equal(billingAmount('enterprise'), null);
});

test('provider amounts are decimal strings, because PayPal wants "3.20"', () => {
  assert.equal(toProviderAmount(320, 'USD'), '3.20');
  assert.equal(toProviderAmount(3200, 'USD'), '32.00');
  assert.equal(toProviderAmount(1200, 'SAR'), '12.00');
  // Zero-decimal currencies must NOT gain a ".00" — PayPal rejects it.
  assert.equal(toProviderAmount(500, 'JPY'), '500');
  assert.equal(minorUnits('JPY'), 1);
  assert.equal(minorUnits('USD'), 100);
});

test('the default plan exists in the catalogue', () => {
  assert.ok(getPlan(DEFAULT_PLAN_CODE), 'DEFAULT_PLAN_CODE must name a real plan');
});

test('listPlans is sorted by rank, cheapest tier first', () => {
  const ranks = listPlans().map((p) => p.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('an unknown plan code resolves to null rather than throwing', () => {
  assert.equal(getPlan('enterprise'), null);
  assert.equal(planAmount('enterprise'), null);
});

test('period length is derived from the interval, not the name', () => {
  assert.equal(periodMonths(getPlan('monthly')), 1);
  assert.equal(periodMonths(getPlan('yearly')), 12);
  assert.equal(periodMonths({ interval: 'month', intervalCount: 3 }), 3);
  assert.equal(periodMonths({ interval: 'once', intervalCount: 1 }), 0);
});

test('the yearly plan reports its per-month equivalent', () => {
  assert.equal(monthlyEquivalent(getPlan('yearly')), 1000); // 10 SAR/month
  assert.equal(monthlyEquivalent(getPlan('monthly')), 1200);
});

test('yearly saves two months against paying monthly', () => {
  // 12 x 12 SAR = 144, charged 120 -> 17%.
  assert.equal(savingsPercent(getPlan('yearly')), 17);
});

test('savings returns null where the comparison is meaningless', () => {
  assert.equal(savingsPercent(getPlan('monthly')), null, 'a plan cannot save against itself');
  assert.equal(savingsPercent(null), null);
  assert.equal(savingsPercent(getPlan('yearly'), 'nope'), null);
});

test('upgrade and downgrade follow rank, not price', () => {
  assert.equal(planChangeKind('monthly', 'yearly'), 'upgrade');
  assert.equal(planChangeKind('yearly', 'monthly'), 'downgrade');
  assert.equal(planChangeKind('monthly', 'monthly'), 'same');
  assert.equal(planChangeKind(null, 'yearly'), 'new');
  assert.equal(planChangeKind('monthly', 'enterprise'), null, 'an unknown target must be refused, not guessed');
});

test('beta plans unlock every feature', () => {
  assert.equal(planIncludes('monthly', 'custom_domain'), true);
  assert.equal(planIncludes('yearly', 'anything_at_all'), true);
  assert.equal(planIncludes('enterprise', 'custom_domain'), false, 'no plan, no features');
});

test('the customer is told what will actually leave their account', () => {
  // Seeing an unexplained USD figure on a statement after being quoted riyals
  // is how a payment becomes a dispute.
  const note = formatBillingNote('monthly', 'en');
  assert.match(note, /USD 3\.20/);
  assert.match(formatBillingNote('monthly', 'ar'), /3\.20/);
  assert.equal(formatBillingNote('enterprise', 'en'), null);
});

test('amounts render with Latin numerals in both locales', () => {
  assert.equal(formatAmount(1200, 'ar'), '12 ر.س');
  assert.equal(formatAmount(1200, 'en'), 'SAR 12');
  assert.equal(formatAmount(320, 'en', 'USD'), 'USD 3.20');
  // No stray .00 on whole riyals, but fractions keep both places.
  assert.equal(formatAmount(9999, 'en'), 'SAR 99.99');
  assert.equal(formatAmount(1250, 'ar'), '12.50 ر.س');
  for (const out of [formatAmount(12000, 'ar'), formatAmount(12000, 'en')]) {
    assert.match(out, /120/, 'digits must stay Latin in both locales');
  }
});

test('a non-numeric amount formats to empty rather than NaN', () => {
  assert.equal(formatAmount(undefined, 'en'), '');
  assert.equal(formatAmount(Number.NaN, 'ar'), '');
});

test('the interval phrase is generated from the plan', () => {
  assert.equal(formatInterval(getPlan('monthly'), 'en'), 'per month');
  assert.equal(formatInterval(getPlan('yearly'), 'ar'), 'سنويًا');
  assert.equal(formatInterval({ interval: 'month', intervalCount: 3 }, 'en'), 'every 3 months');
  assert.equal(formatInterval({ interval: 'once', intervalCount: 1 }, 'en'), 'one-time');
});

test('a comped workspace has a name but no plan', () => {
  assert.equal(planName('comped', 'en'), 'Granted access');
  assert.equal(planName(null, 'en'), 'No plan');
  assert.equal(planName('yearly', 'en'), 'Yearly');
});

// ---------------------------------------------------------------------------
// Hidden plans. The test plan must be reachable by id and unreachable by sale.
// ---------------------------------------------------------------------------
test('the TEST plan is never offered to a customer', () => {
  const sellable = listPlans().map((p) => p.code);
  assert.ok(!sellable.includes('test'), 'a hidden plan must not appear in listPlans');
  assert.deepEqual(sellable, ['monthly', 'yearly'], 'only the two real plans are sellable');
});

test('the TEST plan is still resolvable by code, so a link can render it', () => {
  const t = getPlan('test');
  assert.ok(t, 'getPlan must resolve hidden plans');
  assert.equal(t.hidden, true);
  assert.equal(billingAmount('test').amount, 1, 'one US cent');
  assert.equal(billingAmount('test').currency, 'USD');
});

test('allPlans includes hidden plans so the provider catalogue can mirror them', () => {
  assert.ok(allPlans().map((p) => p.code).includes('test'));
  assert.ok(allPlans().length > listPlans().length);
});

test('the TEST plan is labelled so nobody mistakes it for a product', () => {
  for (const lang of ['ar', 'en']) {
    assert.match(planName('test', lang), /TEST|اختبار/i);
  }
});

test('real prices are untouched by the test plan', () => {
  assert.equal(planAmount('monthly'), 1200);
  assert.equal(planAmount('yearly'), 12000);
  assert.equal(billingAmount('monthly').amount, 320);
  assert.equal(billingAmount('yearly').amount, 3200);
});
