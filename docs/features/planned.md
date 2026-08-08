# Features — planned

**The one deliberately time-sensitive file in this system.** Prune items as they
land. Do not let it grow into a task tracker, and do not record what you did
today — only what is still owed.

Last reviewed: 2026-08-08.

---

## P0 — blocking confidence in what already ships

### 1. Prove the self-signup payment activation

Everything up to payment is proven on `zz-signup-live`: `created_via =
self_signup`, `status = disabled`, membership `self_signup = true`, profile
present, not entitled. **The `disabled → active` flip in `billing-webhook` v7 has
never fired.** Until it does, the public funnel is unproven at its last step.

### 2. Prove customer cancellation — the part that is left

The cancel → PayPal → webhook → row path is **proven in production**: two
`BILLING.SUBSCRIPTION.CANCELLED` events processed clean, both leaving
`status = canceled`, `cancel_at_period_end = true` and `current_period_end`
intact and still entitled. Section K then wired entitlement into the write
policies, so the lapse now actually revokes editing (proved against a real
non-owner admin with the period end pushed into the past).

What is still owed:

- **A yearly cancellation.** Both proven runs ended on a ~monthly period.
  `billing-webhook`'s no-period-end fallback grants a flat **31 days**, so if
  PayPal returns no `next_billing_time` on a cancelled yearly subscription, a
  subscriber cancelling in month two would be silently cut from ten paid months
  to one. Confirm what PayPal actually returns before trusting that branch.
- **A cancellation initiated inside the customer's own PayPal account**, which
  exercises the 422-already-cancelled path in `_shared/paypal.ts`.
- **A `BILLING.SUBSCRIPTION.UPDATED` arriving while PayPal still reports ACTIVE
  on a subscription we just cancelled.** `billing-webhook` line ~202 resets
  `cancel_at_period_end` to false in that case, and the UI reverts to "renews
  automatically". Narrow window, wrong direction.

*(Section L closed the public-site half: the resolver now gates rendering on
entitlement too. See [architecture/overview.md §5](../architecture/overview.md).)*

### 3. "Asked to set a password again after resetting" — reproduce it

Reported; **not reproduced.** Do not change code before you can trigger it.

Already ruled out: `complete-password-reset` sets `must_set_password: false` in
the same call that writes the password, precisely so the gate does not reappear.

Leading hypothesis: a stale `admin_must_set_password` flag in that browser's
localStorage, left behind by an old Supabase recovery/invite link that was never
completed or signed out of. Check it first. Details in
[architecture/auth.md §7](../architecture/auth.md).

### 4. PayPal country defaults to UK for Saudi customers

Reported; **not diagnosed.** `lang` is forwarded to PayPal as the approval page's
*locale*, which is not the payer's *country*. Start with what
`billing-checkout` sends in `application_context`, and with the sandbox business
account's own registered country — a sandbox account colours what you see while
testing. See [architecture/billing.md §10](../architecture/billing.md).

---

## P1 — known debt with a known shape

### 5. `SCHEMA.sql` is two migrations behind

It does not describe section **H** (billing) or section **I** (signup). It is
meant to be the authority on the live database; right now it is not. Read the
live schema back out and update it.

### 6. Non-destructive credential resend

`send_welcome` silently invalidates a working password, which is the top source
of "the client says their password stopped working". Two changes:

- warn at the moment of clicking, the way `reset-client-password` already does;
- when `last_sign_in_at IS NULL` there is no working password to protect, so
  re-issue without destroying anything. Fall back to the destructive path only
  for clients who have actually signed in.

### 7. Remove the test artefacts

All deliberately preserved, all to be removed once the flows above are signed
off: tenant `zz-signup-live` and its user; `signup-test@designakum.site`
(unconfirmed, no workspace); tenant `zz-billing-test`; the hidden one-cent `test`
plan in `lib/billing-plans.js` plus its `provider_plans` row; subscription
`I-M65XW1E7MM82`.

### 8. The riyal symbol

Replace the "SAR" text label with the symbol image. `formatAmount()` in
`lib/billing-plans.js` is the single source of truth. **The CSV export must keep
the literal currency code** — a spreadsheet needs a code, not an image.

### 9. Add `SIGNUP_TOKEN_SECRET` to `.env.example`

It is read by the functions but missing from
`supabase/functions/.env.example`, so a fresh local setup silently falls back to
a default.

---

## P2 — not started, not urgent

- **Internal admin dashboard** for operators beyond the current Clients and
  Subscribers surfaces.
- **Notifications panel.**
- **Client-side error reporting.** Production errors currently reach
  `console.error` only.
- **ESLint.**
- **Analytics retention and server-side aggregation.** `analytics_events` is
  unbounded and the admin query has no limit. Fine now; not fine with a
  high-traffic tenant.
- **Legacy media paths.** Everything currently in the `media` bucket uses flat
  paths, so tenant storage isolation governs only future uploads. Migrating means
  renaming objects **and** rewriting every stored URL in `profile` and
  `projects`; the failure mode is broken images on live sites.
- **Move username→email resolution server-side** so `get_email_for_username` can
  stop being anon-callable. An auth-flow refactor, not a grant change.

---

## Explicitly not being built

- **A renewal cron, dunning ladder or stored card.** PayPal owns the schedule. A
  second scheduler would double-charge.
- **A resume button for a cancelled PayPal subscription.** Cancellation is
  terminal at PayPal; the UI offers "subscribe again" because a resume would
  fail.
- **A 1-day trial** — until asked. It needs no schema change:
  `subscriptions.status` already has `trialing` and `trial_ends_at`,
  `deriveBilling()` handles both, and `tenant_has_active_subscription()` already
  returns true for `trialing`. The work is writing a `trialing` row at signup and
  activating the tenant then rather than on the webhook.
- **Multi-workspace per user** — until asked. `tenant_admins` is already
  many-to-many; it is one guard to remove plus a switcher.
