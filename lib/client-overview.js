// lib/client-overview.js
// -----------------------------------------------------------------------------
// What the owner console counts, and how it searches.
//
// Pure. No Supabase, no React, no environment — the rows arrive as arguments,
// so every rule below can be tested directly rather than through a screen.
//
// ── ONLY REAL DATA, AND ONLY WHAT IT ACTUALLY MEANS ──────────────────────
// Every number here is a count of rows the operator can click through to. There
// is no engagement metric, no growth percentage and no trend, because nothing
// in the database supports one and inventing it would put a made-up figure on
// the screen an operator uses to decide who to contact.
//
// ── "OFFLINE" IS THE WORD THAT MATTERS ───────────────────────────────────
// A portfolio can be invisible to visitors for three unrelated reasons, and the
// operator's response is different for each:
//
//   never published   the customer has not finished. Nothing is wrong.
//   not entitled      the subscription lapsed. The page 404s TODAY.
//   disabled          an operator switched it off. Deliberate.
//
// Collapsing them into one "offline" count is how somebody ends up chasing a
// customer who simply has not pressed Publish yet.

import { deriveBilling } from './billing-status.js';

/* One customer row, assembled from the two tables the console already reads.
   `sub` may be absent — a workspace that never subscribed is a normal state. */
export function toCustomer(tenant, sub, now = Date.now()) {
  const billing = deriveBilling(sub || null, now);
  const published = Boolean(tenant.published_at);
  const disabled = tenant.status === 'disabled';
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name || '',
    status: tenant.status,
    createdAt: tenant.created_at || null,
    publishedAt: tenant.published_at || null,
    billing,
    published,
    disabled,
    /* Visible to a stranger right now. The public read path requires all three:
       an enabled tenant, an entitlement, and something published. */
    live: published && billing.entitled && !disabled,
    /* WHY it is not live, when it is not. Null when it is. */
    offlineReason: (published && billing.entitled && !disabled)
      ? null
      : disabled ? 'disabled'
        : !published ? 'never-published'
          : 'not-entitled',
  };
}

export const ENDING_SOON_DAYS = 7;

/* Whether a time-bounded grant or a grace period is about to run out. Only
   meaningful when there is a number of days to read — a permanent grant has no
   end and must never be counted as expiring. */
export function endingSoon(customer, days = ENDING_SOON_DAYS) {
  const d = customer.billing && customer.billing.daysLeft;
  if (typeof d !== 'number') return false;
  return d >= 0 && d <= days;
}

/* The counts the owner's home screen shows. Each one is a filter over the same
   list, so every number on the screen can be clicked into the rows behind it —
   a total nobody can open is a number nobody can act on. */
export function summarise(customers, days = ENDING_SOON_DAYS) {
  const by = (fn) => customers.filter(fn);
  return {
    total: customers.length,
    live: by((c) => c.live).length,
    entitled: by((c) => c.billing.entitled).length,
    /* Paying is narrower than entitled: a comped workspace is entitled and
       brings in nothing, and an operator deciding who to chase needs the
       difference. */
    paying: by((c) => c.billing.entitled && c.billing.state !== 'comped').length,
    comped: by((c) => c.billing.state === 'comped').length,
    lapsed: by((c) => !c.billing.entitled && c.billing.state !== 'none').length,
    neverSubscribed: by((c) => c.billing.state === 'none').length,
    neverPublished: by((c) => !c.published).length,
    disabled: by((c) => c.disabled).length,
    endingSoon: by((c) => endingSoon(c, days)).length,
    /* The one number that means "somebody should look at this today": a
       portfolio a paying-or-granted customer expects to be live, that is not. */
    offlineButEntitled: by((c) => c.billing.entitled && c.published && c.disabled).length,
  };
}

/* Search across the fields an operator actually knows: the name they were told,
   the address they were sent, and the email on the account. Case-insensitive,
   trimmed, and substring rather than prefix — an operator searching "ahmad"
   should find "ahmad-demo".

   NOT fuzzy. A near-match on the wrong customer is how an operator ends up
   acting on the wrong workspace, which is the one mistake this screen must make
   difficult. */
export function searchCustomers(customers, query) {
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return customers;
  return customers.filter((c) => [c.name, c.slug, c.email]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q)));
}

/* The named filters behind the home screen's numbers. */
export const FILTERS = {
  all: () => true,
  live: (c) => c.live,
  lapsed: (c) => !c.billing.entitled && c.billing.state !== 'none',
  comped: (c) => c.billing.state === 'comped',
  'never-published': (c) => !c.published,
  disabled: (c) => c.disabled,
  'ending-soon': (c) => endingSoon(c),
};

export function applyFilter(customers, id) {
  const fn = FILTERS[id] || FILTERS.all;
  return customers.filter(fn);
}

/* Sorted so the rows that need attention are not at the bottom of a long list:
   anything expiring first, then anything lapsed, then everyone else by newest.
   Deliberately not alphabetical — a list sorted by name is a list an operator
   has to read all of. */
export function rankCustomers(customers) {
  const weight = (c) => {
    if (endingSoon(c)) return 0;
    if (!c.billing.entitled && c.billing.state !== 'none') return 1;
    if (c.disabled) return 2;
    return 3;
  };
  return [...customers].sort((a, b) => {
    const w = weight(a) - weight(b);
    if (w !== 0) return w;
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bt - at;
  });
}
