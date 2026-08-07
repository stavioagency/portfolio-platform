// signup-intent.js — what a visitor asked for on their way in.
//
// The marketing site sends people to /signup?lang=en&plan=yearly. Two
// separate things arrive in that URL and they are read the same way here so
// neither is trusted:
//
//   lang — which language to render. resolveLang() in lib/translations.js
//          owns that decision; this file does not repeat it.
//   plan — which subscription they clicked. That is what lives here.
//
// WHY THE PLAN IS NOT VALIDATED FOR PRICE ANYWHERE ON THIS PATH
// -------------------------------------------------------------
// It cannot be, and must not try. `billing-checkout` resolves a plan code
// against `provider_plans` and prices it there — "the price comes from
// provider_plans, never from the request". A plan code travelling through
// signup is a *preference*, not an entitlement: the worst a bad one can do
// is preselect nothing, and the worst a stale one can do is reach checkout
// and come back `plan_not_available`, which that page already handles.
//
// So this validates shape and membership of the catalogue, and stops. It
// never reads a price and never decides what anyone is charged.
// Extension included: lib/ modules are imported directly by tests/*.test.mjs
// under plain Node ESM, which does not resolve extensionless paths the way
// the bundler does. Matches billing-status.js and billing-export.js.
import { listPlans } from './billing-plans.js';

/**
 * The plan code a URL asked for, or null.
 *
 * Checked against the real catalogue rather than a list of strings, so a
 * plan that is retired stops being accepted here the moment it leaves
 * PLAN_DEFS — no second list to keep in step.
 *
 * listPlans(), NOT getPlan(): the SELLABLE catalogue, which is the same set
 * PlanPicker renders. getPlan() searches every PLAN_DEFS entry including the
 * hidden ones, so it answered yes to `?plan=test` — the internal one-cent
 * plan marked "never sold, never shown to a customer" — and preselected a
 * plan no picker on the page can display. `comped` falls out of the same
 * rule: it is granted, never chosen.
 */
export function resolvePlanCode(requested) {
  if (typeof requested !== 'string') return null;
  const code = requested.trim().toLowerCase();
  if (!code) return null;
  return listPlans().some((plan) => plan.code === code) ? code : null;
}

/**
 * A plan code safe to hand to a server or put back in a URL.
 *
 * Deliberately looser than `resolvePlanCode`: this runs where the catalogue
 * is not importable (a Deno Edge Function has no lib/billing-plans.js) and
 * where rejecting an unknown-but-plausible code would be wrong — the app
 * and the functions deploy separately, so a code can be legitimate before
 * this build has heard of it. Shape only: lowercase, digits, dash,
 * underscore, 1–32 characters. Enough to make it unusable as an injection
 * vector, not so strict that it invents a policy the catalogue owns.
 */
export function isPlanCodeShape(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,32}$/.test(value);
}

/** Read `?plan=` out of a query string. Returns a known code, or null. */
export function planFromQuery(search) {
  try {
    return resolvePlanCode(new URLSearchParams(search || '').get('plan'));
  } catch (_) {
    return null;
  }
}
