// Whether a workspace may be deleted, given its subscription.
//
// THE PROBLEM THIS EXISTS FOR
// ---------------------------
// `tenants` is ON DELETE CASCADE into `subscriptions`, `billing_customers`,
// `payments` and `invoices`. Deleting a workspace therefore destroys the only
// local record that a provider subscription exists — while PayPal carries on
// charging the card every month. There is no reconciliation job that would ever
// notice: the id we would need to cancel with went away with the row.
//
// So the rule is ordering, and the only way to enforce an order in a UI is to
// refuse the second step until the first has happened. Cancel at the provider,
// THEN delete. This module is the refusal.
//
// It is pure and imports only the state machine, so "which states are safe to
// delete" is one readable list rather than a condition spread through a React
// handler. The call that reads the row lives in pages/admin.js.

import { deriveBilling } from './billing-status.js';

// States where the provider may still take money, or may still start taking it.
//
// `pending` is in here for a reason that is easy to miss: it grants nothing, so
// it looks harmless. But the subscription EXISTS at PayPal and is one customer
// approval away from activating — an approval that can land minutes after the
// workspace is gone, creating a live subscription with no local row at all.
//
// `past_due` is a subscription PayPal is still retrying. Dunning can succeed.
export const BLOCKING_STATES = ['pending', 'trialing', 'active', 'past_due'];

// States where nothing can be charged again, so the cascade destroys nothing
// that is still live:
//   none      — never subscribed
//   comped    — granted by the operator; no provider subscription behind it
//   canceling — cancelled AT THE PROVIDER, just still inside the paid period
//   canceled  — cancelled and elapsed
//   expired   — lapsed; dunning gave up
//
// `canceling` being safe is the whole point of the design. Cancelling does not
// have to wait out the remaining paid days: once PayPal has the cancellation,
// deleting is safe immediately, and the owner is not told to come back in three
// weeks to finish a cleanup.
export const DELETABLE_STATES = ['none', 'comped', 'canceling', 'canceled', 'expired'];

/**
 * Why this workspace may not be deleted, or null if it may.
 *
 * `sub` is the `subscriptions` row (null when the workspace has never
 * subscribed — a normal state, not an error). Returns
 * `{ state, providerSubscriptionId }` when deletion must be refused.
 *
 * Fails CLOSED on an unrecognised state: deriveBilling() maps anything it does
 * not know to 'expired', which is deletable, so a newly added status would
 * silently become deletable. Checking membership of DELETABLE_STATES rather
 * than of BLOCKING_STATES puts the default on the safe side.
 */
export function deletionBlock(sub, now = Date.now()) {
  const { state } = deriveBilling(sub, now);
  if (DELETABLE_STATES.includes(state)) return null;
  return {
    state,
    providerSubscriptionId: sub?.provider_subscription_id || null,
  };
}

/**
 * The sentence the owner reads instead of a delete.
 *
 * It names the state and the next action, because "cannot delete" with no route
 * forward is how an owner ends up deleting the row by hand in the SQL editor —
 * which is the exact outcome this module exists to prevent.
 */
export function deletionBlockMessage(block, ar) {
  if (!block) return '';
  const paypal = block.providerSubscriptionId ? ` (${block.providerSubscriptionId})` : '';
  return ar
    ? `لا يمكن حذف هذه المساحة: اشتراكها ما زال قائمًا${paypal}. ألغِ الاشتراك من تبويب «الفوترة» أولًا — الحذف قبل الإلغاء يترك باي بال يسحب المبلغ بلا أي سجل لدينا.`
    : `This workspace still has a live subscription${paypal}. Cancel it in the Billing tab first — deleting first leaves PayPal charging with no record on our side.`;
}

/**
 * What to say when the subscription cannot be READ.
 *
 * Separate from the block above because it is a different fact: not "there is a
 * subscription" but "we do not know". Both refuse. A read error that let the
 * delete through would be the one failure mode this whole module is about, and
 * it is the likeliest one — RLS, a dropped connection, an offline tab.
 */
export function deletionUnknownMessage(ar) {
  return ar
    ? 'تعذّر التحقق من اشتراك هذه المساحة، ولن يُحذف شيء قبل التحقق. حاول مرة أخرى.'
    : 'Could not check this workspace for a subscription, and nothing is deleted until that check succeeds. Try again.';
}
