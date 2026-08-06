// reserved-slugs.js — which workspace addresses nobody may claim, and what a
// valid one looks like.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// A tenant's slug becomes a top-level route: /{slug}. So a workspace claiming
// `admin` would shadow the dashboard, `subscribe` would shadow checkout, and
// `privacy` would shadow a legal page — and the shadowing is silent, because
// Next.js resolves the static route first and the tenant simply becomes
// unreachable. Until self-signup, the only person choosing a slug was the
// operator, so a list inside pages/admin.js was advice. A public signup form
// makes it a rule, and a rule has to be enforced where the browser cannot
// reach it.
//
// This file is therefore imported by BOTH the signup form (for instant
// feedback) and the Edge Function that actually creates the workspace (for the
// decision). The server is the authority; the browser copy exists only so the
// user is not told "no" after pressing the button.

// Every static route the app serves, plus the words we may plausibly want as
// routes later. Cheap to reserve now, impossible to reclaim once a customer
// owns one.
export const RESERVED_SLUGS = new Set([
  // real routes today
  'admin', 'subscribe', 'signup', 'privacy', 'terms', 'api', '_next',
  // reserved for the near future
  'login', 'signin', 'sign-in', 'signout', 'sign-out', 'register', 'verify',
  'account', 'billing', 'checkout', 'pricing', 'plans', 'invoice', 'invoices',
  'dashboard', 'settings', 'support', 'help', 'docs', 'blog', 'about',
  'contact', 'status', 'health', 'webhook', 'webhooks', 'callback',
  // things that read as official and would be used to impersonate us
  'designakum', 'official', 'www', 'mail', 'email', 'root', 'system',
  'security', 'abuse', 'postmaster', 'no-reply', 'noreply',
]);

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

// Lowercase letters, digits and single inner hyphens. No leading or trailing
// hyphen, no doubles. Deliberately ASCII: the slug lives in a URL and in a
// certificate's host name for custom domains, and an Arabic slug would be
// punycoded into something nobody can read back or dictate over the phone.
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Returns an error CODE, or '' when the slug is acceptable. Codes, not
// sentences, so the caller picks the language — the same shape as
// passwordPolicyError().
export function slugError(raw) {
  const slug = String(raw ?? '').trim().toLowerCase();
  if (!slug) return 'slug_required';
  if (slug.length < SLUG_MIN) return 'slug_too_short';
  if (slug.length > SLUG_MAX) return 'slug_too_long';
  if (!SLUG_SHAPE.test(slug)) return 'slug_invalid_characters';
  if (RESERVED_SLUGS.has(slug)) return 'slug_reserved';
  // A slug that is only digits would collide with any future numeric id route
  // and reads as an accident rather than a name.
  if (/^\d+$/.test(slug)) return 'slug_reserved';
  return '';
}

// Best-effort suggestion from a workspace name, for pre-filling the field.
// It can still fail slugError() — the caller must always re-check rather than
// assume this returns something valid.
export function suggestSlug(name) {
  const base = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    // Strip anything that is not a plain ASCII letter or digit. Arabic names
    // reduce to nothing here, which is correct: the user is then asked to
    // choose a Latin address rather than handed a punycode string.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
  return base;
}
