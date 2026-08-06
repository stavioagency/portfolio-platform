// Tests for lib/billing-poll.js — when the Billing screen re-checks itself
// after a customer returns from PayPal. Zero dependencies — run with: npm test
//
// Three ways this could go wrong, and all three are covered below: polling for
// a customer who never went to checkout, polling for a subscriber who is
// already active, and polling forever when the webhook never arrives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPollForActivation, MAX_POLL_ATTEMPTS } from '../lib/billing-poll.js';

test('polls while pending, straight back from checkout', () => {
  assert.equal(
    shouldPollForActivation({ state: 'pending', returnedFromCheckout: true, attempts: 0 }),
    true,
  );
  assert.equal(
    shouldPollForActivation({ state: 'pending', returnedFromCheckout: true, attempts: MAX_POLL_ATTEMPTS - 1 }),
    true,
  );
});

test('never polls without the checkout flag', () => {
  // An abandoned checkout leaves a workspace in `pending` indefinitely. Without
  // this guard it would poll on every visit, forever, for an answer that is
  // never coming.
  assert.equal(
    shouldPollForActivation({ state: 'pending', returnedFromCheckout: false, attempts: 0 }),
    false,
  );
});

test('never polls for a subscriber who is not pending', () => {
  // This is what keeps existing subscribers entirely unaffected.
  for (const state of ['active', 'comped', 'canceling', 'canceled', 'past_due', 'trialing', 'expired', 'none']) {
    assert.equal(
      shouldPollForActivation({ state, returnedFromCheckout: true, attempts: 0 }),
      false,
      `${state} must not poll`,
    );
  }
});

test('stops the moment activation lands', () => {
  // The state flipping to active is what ends the loop, not the attempt count.
  assert.equal(
    shouldPollForActivation({ state: 'active', returnedFromCheckout: true, attempts: 1 }),
    false,
  );
});

test('stops at the attempt cap even if still pending', () => {
  // The webhook never arrived. Fall back to the ordinary pending message rather
  // than spinning until the tab is closed.
  assert.equal(
    shouldPollForActivation({ state: 'pending', returnedFromCheckout: true, attempts: MAX_POLL_ATTEMPTS }),
    false,
  );
  assert.equal(
    shouldPollForActivation({ state: 'pending', returnedFromCheckout: true, attempts: MAX_POLL_ATTEMPTS + 50 }),
    false,
  );
});

test('a missing or malformed attempt count does not become infinite polling', () => {
  assert.equal(
    shouldPollForActivation({ state: 'pending', returnedFromCheckout: true, attempts: undefined }),
    false,
    'undefined must not compare as less than the cap',
  );
  assert.equal(
    shouldPollForActivation({ state: 'pending', returnedFromCheckout: true, attempts: 'lots' }),
    false,
  );
});

test('the window is about a minute — long enough for a 40-second webhook', () => {
  assert.ok(MAX_POLL_ATTEMPTS >= 12, 'the verified sandbox run took ~40s to activate');
});
