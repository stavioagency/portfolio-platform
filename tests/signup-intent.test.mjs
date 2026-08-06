// Tests for lib/signup-intent.js — the plan a visitor brings in from the
// marketing site. Zero dependencies — run with: npm test
//
// The load-bearing cases are the ones where being wrong costs a sale or
// misrepresents a price: a plan code must be checked against the real
// catalogue rather than a copy of it, an unknown code must degrade to "no
// preference" instead of throwing or preselecting something arbitrary, and
// nothing here may ever decide what a person is charged — billing-checkout
// prices against provider_plans, and this file must stay out of that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlanCode, isPlanCodeShape, planFromQuery } from '../lib/signup-intent.js';
import { listPlans, DEFAULT_PLAN_CODE, COMP_PLAN_CODE } from '../lib/billing-plans.js';

test('every plan in the catalogue is accepted', () => {
  const codes = listPlans().map((p) => p.code);
  assert.ok(codes.length >= 2, 'catalogue should have at least monthly and yearly');
  for (const code of codes) {
    assert.equal(resolvePlanCode(code), code, `${code} should resolve`);
  }
  assert.equal(resolvePlanCode(DEFAULT_PLAN_CODE), DEFAULT_PLAN_CODE);
});

test('the marketing links resolve', () => {
  assert.equal(planFromQuery('?lang=en&plan=yearly'), 'yearly');
  assert.equal(planFromQuery('?lang=ar&plan=monthly'), 'monthly');
  assert.equal(planFromQuery('lang=en&plan=yearly'), 'yearly', 'leading ? optional');
});

test('case and whitespace are forgiven, the code is not invented', () => {
  assert.equal(resolvePlanCode('YEARLY'), 'yearly');
  assert.equal(resolvePlanCode('  monthly  '), 'monthly');
});

test('an unknown plan is no preference, never a guess', () => {
  // Must NOT fall back to DEFAULT_PLAN_CODE: silently selecting yearly for
  // someone who asked for something else is how a person pays for a plan
  // they did not choose.
  assert.equal(resolvePlanCode('enterprise'), null);
  assert.equal(resolvePlanCode('lifetime'), null);
  assert.equal(planFromQuery('?plan=free'), null);
  assert.equal(planFromQuery('?lang=en'), null, 'no plan param at all');
  assert.equal(planFromQuery(''), null);
});

test('the comped plan can never be selected', () => {
  // It is granted, has no price, and is not in listPlans(). Accepting it
  // here would let a URL ask for a free subscription.
  assert.equal(resolvePlanCode(COMP_PLAN_CODE), null);
});

test('junk input cannot reach the catalogue', () => {
  for (const bad of [null, undefined, 0, 1, {}, [], true, '  ', '']) {
    assert.equal(resolvePlanCode(bad), null, `${JSON.stringify(bad)} should be null`);
  }
});

test('planFromQuery never throws on a malformed query', () => {
  for (const q of [null, undefined, '?', '?plan', '?plan=', '%%%', '?plan=%E0%A4%A']) {
    assert.doesNotThrow(() => planFromQuery(q));
    assert.equal(planFromQuery(q), null);
  }
});

test('shape check accepts real codes and rejects injection', () => {
  for (const code of listPlans().map((p) => p.code)) {
    assert.equal(isPlanCodeShape(code), true, `${code} should pass shape`);
  }
  assert.equal(isPlanCodeShape('some_future-plan9'), true, 'unknown but plausible');
  for (const bad of [
    'yearly ', 'year ly', 'yearly"', "yearly'", 'yearly<script>', 'yearly/../x',
    'yearly?a=b', 'yearly&plan=x', 'YEARLY', '', 'a'.repeat(33), null, 42, {},
  ]) {
    assert.equal(isPlanCodeShape(bad), false, `${JSON.stringify(bad)} should fail shape`);
  }
});

test('shape check is looser than the catalogue, on purpose', () => {
  // The Edge Function cannot import the catalogue, and the app and the
  // functions deploy separately — a code can be legitimate before this build
  // has heard of it. Shape is all the server promises.
  assert.equal(isPlanCodeShape('quarterly'), true);
  assert.equal(resolvePlanCode('quarterly'), null);
});
