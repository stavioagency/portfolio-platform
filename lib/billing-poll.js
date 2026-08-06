// billing-poll.js — should the Billing screen re-check itself right now?
//
// WHY POLLING EXISTS AT ALL
// -------------------------
// Activation is asynchronous by design. The customer returns from PayPal the
// moment they approve, but the subscription only becomes real when
// BILLING.SUBSCRIPTION.ACTIVATED reaches billing-webhook — about 40 seconds
// later in the verified sandbox run. A dashboard that fetches once on mount
// therefore renders "pending" indefinitely, and the customer is told to refresh
// a page that was correct when it loaded.
//
// The decision lives here rather than inside pages/admin.js because it is the
// only part worth testing: the timer around it is plumbing, but "when do we
// poll, and when do we stop" is where an infinite loop or a wasted request
// would come from.

// ~60 seconds at 5s intervals. Long enough for a webhook that took 40, short
// enough that a genuinely stuck subscription stops asking.
export const MAX_POLL_ATTEMPTS = 12;
export const POLL_INTERVAL_MS = 5000;

// TWO conditions, and both are load-bearing:
//
//   * `returnedFromCheckout` — without it, any workspace sitting in `pending`
//     (someone who started a checkout months ago and walked away) would poll
//     on every single visit, forever, for an answer that is never coming.
//
//   * `state === 'pending'` — without it, an active, comped or cancelling
//     subscriber would poll for nothing. This is what keeps existing
//     subscribers completely untouched by the feature.
//
// The attempt cap is the third stop, for the case where the webhook genuinely
// never arrives: the screen falls back to the ordinary pending message rather
// than spinning until the tab is closed.
export function shouldPollForActivation({ state, returnedFromCheckout, attempts }) {
  if (!returnedFromCheckout) return false;
  if (state !== 'pending') return false;
  return Number(attempts) < MAX_POLL_ATTEMPTS;
}
