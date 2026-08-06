// billing-plans.js — THE ONE PLACE A PRICE IS WRITTEN DOWN.
//
// Nothing else in this project may contain a number that means money. Every
// screen, every Edge Function and every invoice reads from here, so changing
// what a subscription costs is a one-line edit in this file (or an environment
// variable, below) rather than a search across the codebase.
//
// AMOUNTS ARE INTEGER MINOR UNITS, never floats. 12.00 SAR is 1200; 3.20 USD is
// 320. Two reasons this is not negotiable:
//   * every provider's API takes the amount in the minor unit anyway;
//   * money that lives in a float eventually disagrees with the bank
//     (12.1 * 100 is 1209.9999999999998).
//
// ---------------------------------------------------------------------------
// WHY THERE ARE TWO CURRENCIES PER PLAN
// ---------------------------------------------------------------------------
// PayPal does not support SAR. Its supported list is 24 currencies and the
// Saudi riyal is not among them, so a Saudi-priced product cannot be charged
// through PayPal in the currency it is priced in.
//
// So a plan carries a price in BOTH:
//   * DISPLAY_CURRENCY (SAR) — what the market is quoted, on every screen.
//   * BILLING_CURRENCY (USD) — what the customer's card or PayPal balance is
//     actually debited, and the only figure sent to the provider.
//
// These are two independent numbers that YOU set. Nothing converts between
// them at runtime: an FX lookup would make the charged amount drift daily and
// silently disagree with the price on the page. Keep them roughly in step by
// hand, and tell the customer both — checkout says "12 SAR (charged as USD
// 3.20)", because being surprised by the figure on a statement is how a
// payment turns into a dispute.
//
// When a provider that supports SAR is added, BILLING_CURRENCY becomes 'SAR'
// and the second number stops being used. That is the whole migration.
//
// ---------------------------------------------------------------------------
// ADDING A PLAN (Business, Team, Lifetime, …) is meant to be two edits: one
// entry in PLAN_DEFS and, if it should be overridable, one line in ENV_PRICES.
// No caller anywhere names a plan — they iterate listPlans() and switch on
// `interval`. If you find yourself writing `if (code === 'yearly')` outside
// this file, the abstraction has sprung a leak.
//
// A new plan ALSO needs a provider-side plan created for it — see
// supabase/functions/billing-plans-sync. The mapping lives in the
// provider_plans table, never here: provider ids differ per environment and
// change whenever a price changes.

// What customers are quoted, and what every screen renders.
export const DISPLAY_CURRENCY = 'SAR';

// What the provider actually charges. USD because PayPal cannot do SAR.
// Overridable so a future SAR-capable provider is a config change.
export const BILLING_CURRENCY = process.env.NEXT_PUBLIC_BILLING_CURRENCY || 'USD';

// Minor units per major unit. Three PayPal currencies have none — sending
// "100.00" for a zero-decimal currency is rejected outright.
const ZERO_DECIMAL = new Set(['JPY', 'HUF', 'TWD']);
export function minorUnits(currency) {
  return ZERO_DECIMAL.has(currency) ? 1 : 100;
}

// Environment overrides, in minor units. These must be STATIC property reads:
// Next.js inlines process.env.NEXT_PUBLIC_* at build time by textual
// substitution, so a computed key like process.env[`..._${code}`] silently
// becomes undefined in the browser bundle. One literal line per plan.
const ENV_PRICES = {
  monthly: {
    SAR: process.env.NEXT_PUBLIC_PLAN_PRICE_MONTHLY,
    USD: process.env.NEXT_PUBLIC_PLAN_PRICE_MONTHLY_USD,
  },
  yearly: {
    SAR: process.env.NEXT_PUBLIC_PLAN_PRICE_YEARLY,
    USD: process.env.NEXT_PUBLIC_PLAN_PRICE_YEARLY_USD,
  },
};

// `interval` + `intervalCount` describe the billing period in a way the
// provider adapter can translate without knowing the plan's name. A future
// 'lifetime' plan is interval: 'once', which means "never renews".
//
// `rank` orders plans by value, and is what upgrade/downgrade is decided from —
// NOT the price, because a promotional plan can cost less than the tier below
// it and still be an upgrade.
const PLAN_DEFS = [
  {
    code: 'monthly',
    interval: 'month',
    intervalCount: 1,
    price: { SAR: 1200, USD: 320 }, // 12.00 SAR ≈ 3.20 USD
    rank: 10,
    // Beta: a subscription unlocks the entire product. The wildcard is
    // deliberate — it lets the entitlement check exist and be called from every
    // screen now, so introducing real tiers later is a data change here rather
    // than a hunt for missing checks.
    features: ['*'],
    name: { ar: 'اشتراك شهري', en: 'Monthly' },
    tagline: { ar: 'ادفع شهرًا بشهر، وألغِ متى شئت.', en: 'Pay month to month, cancel anytime.' },
  },
  {
    code: 'yearly',
    interval: 'year',
    intervalCount: 1,
    price: { SAR: 12000, USD: 3200 }, // 120.00 SAR ≈ 32.00 USD
    rank: 20,
    features: ['*'],
    name: { ar: 'اشتراك سنوي', en: 'Yearly' },
    tagline: { ar: 'ادفع مرة واحدة في السنة ووفّر شهرين.', en: 'Pay once a year and get two months free.' },
  },
];

// The plan a new subscriber lands on if nothing else is specified. Named, not
// positional, so reordering PLAN_DEFS cannot change it.
export const DEFAULT_PLAN_CODE = 'yearly';

// A subscription that was granted rather than paid for. The workspaces that
// predate billing carry this, and it is NOT a plan anyone can select — it has
// no price and never renews. It lives here so the UI has something to name.
export const COMP_PLAN_CODE = 'comped';

function envAmount(code, currency) {
  const raw = ENV_PRICES[code]?.[currency];
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  // A malformed override must not silently become 0 — that would hand the
  // product away for free and still look like a successful payment.
  if (!Number.isInteger(n) || n <= 0) {
    console.warn(`[billing] ignoring invalid ${currency} price override for "${code}": ${raw}`);
    return null;
  }
  return n;
}

function resolve(def) {
  const price = {};
  for (const currency of Object.keys(def.price)) {
    price[currency] = envAmount(def.code, currency) ?? def.price[currency];
  }
  return {
    ...def,
    price,
    // `amount` is the DISPLAY figure, because that is what almost every caller
    // wants. Anything talking to a provider must ask for billingAmount().
    amount: price[DISPLAY_CURRENCY],
  };
}

// Every selectable plan, cheapest tier first.
export function listPlans() {
  return PLAN_DEFS.map(resolve).sort((a, b) => a.rank - b.rank);
}

export function getPlan(code) {
  const def = PLAN_DEFS.find((p) => p.code === code);
  return def ? resolve(def) : null;
}

// The display price, in DISPLAY_CURRENCY minor units.
export function planAmount(code) {
  return getPlan(code)?.amount ?? null;
}

// What the provider is actually told to charge, and in what currency. This is
// the ONLY figure that may be sent to PayPal.
export function billingAmount(code) {
  const plan = getPlan(code);
  if (!plan) return null;
  const amount = plan.price[BILLING_CURRENCY];
  if (amount === undefined) return null; // plan not priced in the billing currency
  return { amount, currency: BILLING_CURRENCY };
}

// PayPal wants a decimal string ("3.20"), not minor units, unlike almost every
// other gateway. Doing the conversion here keeps that quirk out of the adapter
// and out of every caller.
export function toProviderAmount(minor, currency = BILLING_CURRENCY) {
  const units = minorUnits(currency);
  if (units === 1) return String(minor);
  return (minor / units).toFixed(2);
}

// How many months one billing period covers. The provider adapter and the
// "per month" comparison both need this, and neither should do the arithmetic.
export function periodMonths(plan) {
  if (!plan) return 0;
  if (plan.interval === 'year') return 12 * plan.intervalCount;
  if (plan.interval === 'month') return plan.intervalCount;
  return 0; // 'once' — a lifetime plan covers no repeating period
}

// What this plan works out to per month, in display minor units.
export function monthlyEquivalent(plan) {
  const months = periodMonths(plan);
  if (!months) return null;
  return Math.round(plan.amount / months);
}

// How much cheaper this plan is than paying the baseline plan for the same
// span, as a whole percent. Returns null where the comparison is meaningless
// (same plan, no baseline, non-repeating plan) rather than 0 — the UI hides the
// badge on null, and 0 would render "Save 0%".
export function savingsPercent(plan, baselineCode = 'monthly') {
  const baseline = getPlan(baselineCode);
  if (!plan || !baseline || plan.code === baseline.code) return null;
  const months = periodMonths(plan);
  const baseMonths = periodMonths(baseline);
  if (!months || !baseMonths) return null;
  const baselineCost = (baseline.amount / baseMonths) * months;
  if (baselineCost <= 0) return null;
  const pct = Math.round((1 - plan.amount / baselineCost) * 100);
  return pct > 0 ? pct : null;
}

// Is moving from → to an upgrade, a downgrade, or neither? Rank decides, not
// price. Unknown codes return null so a caller can refuse rather than guess.
export function planChangeKind(fromCode, toCode) {
  const from = getPlan(fromCode);
  const to = getPlan(toCode);
  if (!to) return null;
  if (!from) return 'new';
  if (from.code === to.code) return 'same';
  return to.rank > from.rank ? 'upgrade' : 'downgrade';
}

// Feature gate. During beta every plan carries '*', so this is true for any
// active subscriber — but the call sites are real, so switching a feature to a
// named key later is a change in PLAN_DEFS and nowhere else.
export function planIncludes(code, feature) {
  const plan = getPlan(code);
  if (!plan) return false;
  return plan.features.includes('*') || plan.features.includes(feature);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
// LATIN NUMERALS IN BOTH LOCALES — a deliberate product rule across this
// project. Intl.NumberFormat('ar') renders Eastern Arabic digits (١٢), so it is
// not used here; the digits are produced by plain Number formatting and only
// the currency word is translated.

const CURRENCY_LABEL = {
  SAR: { ar: 'ر.س', en: 'SAR' },
  USD: { ar: '$', en: 'USD' },
};

export function formatAmount(minor, lang = 'ar', currency = DISPLAY_CURRENCY) {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return '';
  const units = minorUnits(currency);
  const major = minor / units;
  // Whole units read as "12 SAR", not "12.00 SAR". Fractions keep two places,
  // because a price like 99.99 must not round to 100 on a checkout screen.
  const digits = units === 1 || Number.isInteger(major) ? String(major) : major.toFixed(2);
  const label = (CURRENCY_LABEL[currency] || { ar: currency, en: currency })[lang === 'ar' ? 'ar' : 'en'];
  return lang === 'ar' ? `${digits} ${label}` : `${label} ${digits}`;
}

// "12 SAR (charged as USD 3.20)" — used wherever the customer is about to be
// charged, so the figure on their statement is never a surprise. Returns null
// when the two currencies are the same, and the caller renders nothing.
export function formatBillingNote(code, lang = 'ar') {
  if (BILLING_CURRENCY === DISPLAY_CURRENCY) return null;
  const billed = billingAmount(code);
  if (!billed) return null;
  const amount = formatAmount(billed.amount, lang, billed.currency);
  return lang === 'ar'
    ? `يُخصم المبلغ بالدولار الأمريكي: ${amount}`
    : `Charged in US dollars: ${amount}`;
}

// "12 SAR / month" — the interval word comes from the plan, so a quarterly plan
// would read correctly without touching any caller.
export function formatInterval(plan, lang = 'ar') {
  const ar = lang === 'ar';
  if (!plan) return '';
  const n = plan.intervalCount;
  if (plan.interval === 'once') return ar ? 'مرة واحدة' : 'one-time';
  if (plan.interval === 'year') {
    if (n === 1) return ar ? 'سنويًا' : 'per year';
    return ar ? `كل ${n} سنوات` : `every ${n} years`;
  }
  if (n === 1) return ar ? 'شهريًا' : 'per month';
  return ar ? `كل ${n} أشهر` : `every ${n} months`;
}

export function formatPlanPrice(plan, lang = 'ar') {
  if (!plan) return '';
  return `${formatAmount(plan.amount, lang)} · ${formatInterval(plan, lang)}`;
}

export function planName(code, lang = 'ar') {
  const ar = lang === 'ar';
  if (code === COMP_PLAN_CODE) return ar ? 'وصول ممنوح' : 'Granted access';
  const plan = getPlan(code);
  if (!plan) return ar ? 'بدون خطة' : 'No plan';
  return plan.name[ar ? 'ar' : 'en'];
}
