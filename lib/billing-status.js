// billing-status.js — reading a subscription row into something a screen can
// render, and one honest answer to "is this workspace entitled right now?".
//
// WHAT THIS IS NOT: the authority. The database decides entitlement, in a
// Postgres function that write policies call — exactly as tenant access is
// decided by is_tenant_admin() and not by the admin's sidebar. This module is
// the CLIENT-SIDE MIRROR of that rule, used to render the right screen and to
// avoid offering a button the server will refuse. If the two ever disagree the
// database wins, and the disagreement is the bug.
//
// It is pure, has no imports beyond the plan catalogue, and is unit-tested —
// which is the point: the state machine is the part of billing most likely to
// be wrong in a way nobody notices until a customer is charged twice or a paid
// account goes dark.

// The .js extension is required, not stylistic: these modules are imported both
// by webpack (which would resolve it either way) and by Node's ESM loader in
// tests/, which will not guess an extension.
import { COMP_PLAN_CODE, getPlan } from './billing-plans.js';

// The complete set of states a workspace can be in. Anything not in this list
// is a bug, not a state — deriveBilling() never invents one.
export const BILLING_STATES = [
  'none', // never subscribed
  'pending', // created at the provider, waiting for the customer to approve it
  'trialing', // inside a trial that has not been paid for yet
  'active', // paid, renews on renewsAt
  'past_due', // a renewal charge failed; still entitled while in grace
  'canceling', // cancelled but paid through the end of the current period
  'canceled', // cancelled and the paid period has ended
  'expired', // ran out without an explicit cancellation (dunning gave up)
  'comped', // granted by the operator; no price, no renewal
];

// How long a failed renewal keeps its access. Kept here rather than in the cron
// job so the UI can say "access ends in 4 days" using the same number the
// backend enforces. Changing it is one edit.
export const GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// Accepts an ISO string, a Date, or an epoch millisecond count. The numeric
// case is not theoretical: `now` is passed as Date.now() everywhere, and
// Date.parse(1754395200000) is NaN — which quietly made every calculation run
// against the wall clock instead of the clock it was handed.
function time(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// Derive everything a screen needs from one subscription row.
//
// `sub` is the row shape written in Section 2:
//   { status, plan_code, current_period_end, cancel_at_period_end,
//     grace_ends_at, trial_ends_at }
// A null/undefined row means "this workspace has never subscribed", which is a
// normal state and not an error.
export function deriveBilling(sub, now = Date.now()) {
  const at = time(now) ?? Date.now();

  if (!sub || !sub.status) {
    return view({ state: 'none', planCode: null, at });
  }

  const planCode = sub.plan_code || null;
  const periodEnd = time(sub.current_period_end);
  const graceEnd = time(sub.grace_ends_at);
  const trialEnd = time(sub.trial_ends_at);

  // Comped is decided by the row, never by a date: a granted workspace has no
  // period end, and treating a missing date as "expired" would switch off every
  // pre-billing client the moment this shipped.
  if (sub.status === 'comped' || planCode === COMP_PLAN_CODE) {
    return view({ state: 'comped', planCode: COMP_PLAN_CODE, at });
  }

  // Created at the provider but never approved by the customer. With PayPal
  // this is the window between "we made the subscription" and "they came back
  // from paypal.com having agreed to it" — which they may simply never do.
  // It grants NOTHING: the row exists, the money does not.
  if (sub.status === 'pending') {
    return view({ state: 'pending', planCode, at, needsAction: true });
  }

  if (sub.status === 'canceled') {
    // A cancellation that is still inside its paid period is 'canceling', not
    // 'canceled' — the customer paid for those days and keeps them. Only after
    // the period ends does access actually stop.
    if (periodEnd && periodEnd > at) {
      return view({ state: 'canceling', planCode, at, endsAt: periodEnd });
    }
    return view({ state: 'canceled', planCode, at, endsAt: periodEnd });
  }

  if (sub.status === 'past_due') {
    // Grace is generous but finite. Without an explicit grace_ends_at we fall
    // back to GRACE_DAYS past the period end, so a row written by an older
    // version of the cron job still behaves.
    const until = graceEnd ?? (periodEnd ? periodEnd + GRACE_DAYS * DAY_MS : null);
    if (until && until > at) {
      return view({ state: 'past_due', planCode, at, endsAt: until, needsAction: true });
    }
    return view({ state: 'expired', planCode, at, endsAt: until, needsAction: true });
  }

  if (sub.status === 'trialing') {
    if (trialEnd && trialEnd > at) {
      return view({ state: 'trialing', planCode, at, renewsAt: trialEnd });
    }
    return view({ state: 'expired', planCode, at, endsAt: trialEnd, needsAction: true });
  }

  if (sub.status === 'active') {
    // An active row whose period has quietly elapsed is NOT entitled. This
    // happens whenever the renewal job has not run yet, and treating it as
    // active would hand out free time proportional to how broken the cron is.
    if (periodEnd && periodEnd <= at) {
      return view({ state: 'expired', planCode, at, endsAt: periodEnd, needsAction: true });
    }
    if (sub.cancel_at_period_end) {
      return view({ state: 'canceling', planCode, at, endsAt: periodEnd });
    }
    return view({ state: 'active', planCode, at, renewsAt: periodEnd });
  }

  // Unknown status from a newer backend: fail CLOSED. Showing an unrecognised
  // subscription as entitled is how a refunded account keeps its features.
  return view({ state: 'expired', planCode, at, needsAction: true });
}

// States that carry access. Written as a list rather than as logic scattered
// through the states above, so "who is entitled" is answerable by reading four
// lines instead of tracing a function.
const ENTITLED = new Set(['active', 'trialing', 'past_due', 'canceling', 'comped']);

function view({ state, planCode, at, renewsAt = null, endsAt = null, needsAction = false }) {
  const target = renewsAt ?? endsAt;
  return {
    state,
    planCode,
    entitled: ENTITLED.has(state),
    renewsAt: renewsAt ? new Date(renewsAt).toISOString() : null,
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    // Whole days remaining, floored, never negative. Null when there is no date
    // to count towards (comped, none).
    daysLeft: target ? Math.max(0, Math.floor((target - at) / DAY_MS)) : null,
    needsAction,
    tone: TONES[state] || 'neutral',
  };
}

// Badge tone per state. past_due is a warning rather than a danger on purpose:
// the customer still has access, and colouring it red makes a recoverable card
// decline look like the account is already gone.
const TONES = {
  none: 'neutral',
  pending: 'warning',
  trialing: 'accent',
  active: 'success',
  past_due: 'warning',
  canceling: 'warning',
  canceled: 'neutral',
  expired: 'danger',
  comped: 'accent',
};

const LABELS = {
  none: { ar: 'بدون اشتراك', en: 'Not subscribed' },
  pending: { ar: 'بانتظار التأكيد', en: 'Awaiting approval' },
  trialing: { ar: 'فترة تجريبية', en: 'Trial' },
  active: { ar: 'نشط', en: 'Active' },
  past_due: { ar: 'دفعة متعثّرة', en: 'Payment failed' },
  canceling: { ar: 'ينتهي قريبًا', en: 'Ending soon' },
  canceled: { ar: 'ملغى', en: 'Cancelled' },
  expired: { ar: 'منتهٍ', en: 'Expired' },
  comped: { ar: 'وصول ممنوح', en: 'Granted' },
};

export function statusLabel(state, lang = 'ar') {
  const entry = LABELS[state] || LABELS.none;
  return entry[lang === 'ar' ? 'ar' : 'en'];
}

// One sentence explaining the state in the customer's own terms, with the date
// already in it. The admin screens render this instead of assembling their own
// sentence, so the client view and the owner view can never describe the same
// subscription differently.
export function statusSentence(billing, lang = 'ar') {
  const ar = lang === 'ar';
  const when = formatBillingDate(billing.renewsAt || billing.endsAt, lang);
  switch (billing.state) {
    case 'active':
      return ar ? `يتجدّد تلقائيًا في ${when}.` : `Renews automatically on ${when}.`;
    case 'pending':
      return ar
        ? 'لم يكتمل التأكيد على باي بال بعد. أكمل الخطوة الأخيرة لتفعيل اشتراكك.'
        : 'This has not been approved on PayPal yet. Finish that last step to activate it.';
    case 'trialing':
      return ar ? `الفترة التجريبية تنتهي في ${when}.` : `Your trial ends on ${when}.`;
    case 'past_due':
      return ar
        ? `تعذّر تحصيل الدفعة. الوصول مستمر حتى ${when} — حدّث بطاقتك قبل ذلك.`
        : `We could not take the payment. Access continues until ${when} — update your card before then.`;
    case 'canceling':
      return ar
        ? `أُلغي التجديد. الوصول مستمر حتى ${when}، ويمكنك التراجع قبلها.`
        : `Renewal is off. You keep access until ${when}, and can undo this before then.`;
    case 'canceled':
      return ar ? `انتهى الاشتراك في ${when}.` : `The subscription ended on ${when}.`;
    case 'expired':
      return ar ? 'انتهى الاشتراك ولم يعد الوصول متاحًا.' : 'The subscription has lapsed and access has stopped.';
    case 'comped':
      return ar ? 'وصول ممنوح من ديزاينكم بدون رسوم.' : 'Access granted by Designakum at no charge.';
    default:
      return ar ? 'لا يوجد اشتراك على هذه المساحة بعد.' : 'This workspace has no subscription yet.';
  }
}

// Dates, Latin numerals, both locales — the project-wide rule.
// Intl with an 'ar' locale renders ١٢ سبتمبر, so the month name is looked up and
// the digits are written plainly.
const MONTHS = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export function formatBillingDate(value, lang = 'ar') {
  const ms = time(value);
  if (ms === null) return '—';
  const d = new Date(ms);
  const months = MONTHS[lang === 'ar' ? 'ar' : 'en'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// A payment row's outcome, for the billing history table. Kept beside the
// subscription states so both vocabularies live in one file.
const PAYMENT_TONES = { paid: 'success', pending: 'warning', failed: 'danger', refunded: 'neutral', voided: 'neutral' };
const PAYMENT_LABELS = {
  paid: { ar: 'مدفوعة', en: 'Paid' },
  pending: { ar: 'قيد المعالجة', en: 'Pending' },
  failed: { ar: 'فشلت', en: 'Failed' },
  refunded: { ar: 'مستردّة', en: 'Refunded' },
  voided: { ar: 'ملغاة', en: 'Voided' },
};

export function paymentTone(status) {
  return PAYMENT_TONES[status] || 'neutral';
}

export function paymentLabel(status, lang = 'ar') {
  const entry = PAYMENT_LABELS[status];
  if (!entry) return status || '—';
  return entry[lang === 'ar' ? 'ar' : 'en'];
}

// Convenience for the owner's list: a workspace counts as a subscriber when it
// is entitled, whatever the route (paid, trialing, comped). The Subscribers
// screen filters on this rather than on `status === 'active'`, which would have
// hidden every comped workspace and every card that is mid-retry.
export function isSubscriber(sub, now = Date.now()) {
  return deriveBilling(sub, now).entitled;
}

// The plan a row should be shown as being on, falling back to the plan's own
// display name. Exists so no screen has to import both modules to render a row.
export function subscriptionPlan(sub) {
  return sub?.plan_code ? getPlan(sub.plan_code) : null;
}
