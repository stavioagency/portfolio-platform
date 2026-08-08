# Features — planned

**The one deliberately time-sensitive file in this system.** Prune items as they
land. Do not let it grow into a task tracker, and do not record what you did
today — only what is still owed.

Last reviewed: 2026-08-08.

---

## P0 — blocking confidence in what already ships

### 1. Prove customer cancellation — the part that is left

The cancel → PayPal → webhook → row path is **proven in production**: two
`BILLING.SUBSCRIPTION.CANCELLED` events processed clean, both leaving
`status = canceled`, `cancel_at_period_end = true` and `current_period_end`
intact and still entitled. Section K then wired entitlement into the write
policies, so the lapse now actually revokes editing (proved against a real
non-owner admin with the period end pushed into the past).

What is still owed:

- **A yearly cancellation.** Both proven runs ended on a ~monthly period. An
  earlier version of this entry blamed the 31-day fallback and was **wrong**:
  that fallback fires only when there is no date at all, so it can over-grant
  and never under-grant. The real defect was `subscription_updated` and
  `payment_succeeded` writing PayPal's null period end straight through —
  fixed and **live in production as `billing-webhook` v8**, see
  [architecture/billing.md §1](../architecture/billing.md). Still worth running
  once end to end, because nothing has yet cancelled a real twelve-month
  subscription.
- **A cancellation initiated inside the customer's own PayPal account**, which
  exercises the 422-already-cancelled path in `_shared/paypal.ts`.
- **A `BILLING.SUBSCRIPTION.UPDATED` arriving while PayPal still reports ACTIVE
  on a subscription we just cancelled.** `billing-webhook` line ~237 resets
  `cancel_at_period_end` to false in that case, and the UI reverts to "renews
  automatically". Narrow window, wrong direction. The period end is now safe
  either way; this is the one field still unguarded on that path.
- **A cancellation that arrives before activation.** A subscription cancelled
  while still `pending` has no period end and no payment, so the cancellation
  branch's 31-day fallback grants a month of entitlement to someone who never
  paid. Our own UI cannot reach it — the cancel button requires
  `billing.entitled`, and `pending` is not — but PayPal can emit it. Small,
  wrong direction, and its own change: the fix is to refuse to invent a date
  when no `payments` row exists.

*(Section L closed the public-site half: the resolver now gates rendering on
entitlement too. See [architecture/overview.md §5](../architecture/overview.md).)*

### 2. "Asked to set a password again after resetting" — reproduce it

Reported; **not reproduced.** Do not change code before you can trigger it.

Already ruled out: `complete-password-reset` sets `must_set_password: false` in
the same call that writes the password, precisely so the gate does not reappear.

Leading hypothesis: a stale `admin_must_set_password` flag in that browser's
localStorage, left behind by an old Supabase recovery/invite link that was never
completed or signed out of. Check it first. Details in
[architecture/auth.md §7](../architecture/auth.md).

### 3. PayPal country defaults to UK for Saudi customers

Reported; **not diagnosed.** `lang` is forwarded to PayPal as the approval page's
*locale*, which is not the payer's *country*. Start with what
`billing-checkout` sends in `application_context`, and with the sandbox business
account's own registered country — a sandbox account colours what you see while
testing. See [architecture/billing.md §10](../architecture/billing.md).

---

## P1 — known debt with a known shape

### 4. A `comped` workspace cannot check out

`billing-checkout` refuses anyone already holding `active`, `trialing` or
`comped` with `already_subscribed` (409). For a genuine comped client that is
correct — they have nothing to buy. But it means a workspace that is comped *by
mistake* has no way to buy its way out, and if its tenant is `disabled` the
public site stays dark, because only the ACTIVATED webhook flips that and it can
no longer generate one. Recovery needs a hand-written DELETE.

That is not hypothetical: the section K backfill comped three unpaid self-signup
workspaces and stranded exactly this way. The backfill is fixed and the rows are
cleaned, so nothing is stranded today — this entry is about the trap that made a
recoverable mistake unrecoverable.

Decide whether `comped` belongs in that list at all, or whether the refusal
should be scoped to comped tenants that are `active`. Deliberately left alone
when the backfill was fixed: it is a checkout change, not a backfill change.

### 5. `SCHEMA.sql` is five migrations behind

It describes none of section **H** (billing), **I** (signup), **J** (password
reset), **K** (entitlement enforcement) or **L** (public-site entitlement) —
verified by grep: no `subscriptions`, `provider_plans`, `billing_events`,
`created_via`, `tenant_has_active_subscription` or `can_edit_tenant`. It is
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
off. **Self-signup activation is now signed off** (see
[completed.md](completed.md)), so everything below that only existed to prove it
is now free to go; cancellation is not, so anything feeding item 1 must stay
until it is.

- tenant `zz-signup-live` and its user
- `signup-test@designakum.site` (unconfirmed, no workspace)
- tenant `zz-billing-test`
- the hidden one-cent `test` plan in `lib/billing-plans.js` plus its
  `provider_plans` row
- subscription `I-M65XW1E7MM82`
- the self-signup test workspaces: `gegeg` and `niggatesting` (both paid and
  active), and `woee`, `testnigga`, `testsubject` (verified but never paid, and
  as of the section K cleanup they correctly have no subscription row at all)

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
