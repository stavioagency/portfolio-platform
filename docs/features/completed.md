# Features — completed

What is built and working. Use this to answer "is this already done?" before
building anything.

**Built ≠ proven.** Where something is shipped but has never been exercised end
to end, it says so, and it is also listed in [planned.md](planned.md).

---

## Public sites

- Multi-tenant rendering at `/{slug}` and on custom domains, one renderer.
- Bilingual content (`{ar, en}` JSONB) with per-visitor language, RTL for Arabic.
- Profile, card, banners, stats, CTA buttons, projects, links, appearance themes.
- Analytics: page views, project views, link clicks.
- Tenant isolation by RLS. No default tenant, ever.

## Admin dashboard

- One dashboard for clients and owners, with owner-only surfaces gated by
  `platform_owners`.
- Editors: Profile, Card, Projects, Links, Appearance, Analytics, Account,
  Website Guide.
- Owner tools: Clients overview, onboarding, Workspace settings, custom domains
  and DNS instructions, Subscribers.
- Live preview — an iframe of the **real** public site, refreshed by the shared
  save bar.
- Unsaved-changes guard, toasts, confirm dialogs, image crop and compression.
- One language toggle drives both the admin chrome and which side of the
  bilingual content is being edited.

## Authentication

- Login by **username or email**, resolved server-side.
- Password policy: 8–20 characters with a 72-byte bcrypt backstop.
- HaveIBeenPwned k-anonymity check on password change.
- `must_set_password` gate forcing temporary passwords to be replaced, surviving
  a page refresh.
- Supabase Auth is the sole password authority — verified, no hash anywhere in
  `public`.

## Public self-service signup

- `/signup?lang=…&plan=…` → `signup-start` → Resend verification →
  `/signup/verify` → `signup-verify` → workspace created `disabled` → `/admin` →
  Billing tab with the plan preselected.
- `lang` and `plan` survive the whole journey, including the verification email
  being opened on a different device.
- No user enumeration: one response for every input.
- Workspace created `status = 'disabled'`, `created_via = 'self_signup'`, stamped
  `handed_over_at` so it never enters the operator's handover queue.
- Reserved slugs enforced server-side from a list shared with the browser.
- **Everything up to payment is proven** on `zz-signup-live`. The
  `disabled → active` flip on payment is **not** — see
  [planned.md](planned.md).

## Owner-driven onboarding

- `invite-client` creates workspace + account + generated password in one step,
  and emails the credentials.
- Email is the **last** step and never fails the request — onboarding degrades to
  copy-and-paste rather than stopping.
- `reset-client-password` for recovery; refuses to act on a platform owner.
- `client-recovery` — `update_email` and `send_welcome`, neither of which ever
  creates a user, workspace or membership.
- Credentials handoff UI and PDF, plus a Pending handover queue driven by
  `handed_over_at`.
- Localized onboarding email per the language chain.

## Billing

- PayPal Subscriptions, monthly and yearly, two prices per plan (SAR displayed,
  USD charged).
- Two checkout doors: a signed-in tenant admin, or an owner-issued signed grant.
  Neither is public.
- `billing-webhook` is the only thing that may activate a subscription.
  Idempotent by two unique constraints; PayPal's three days of retries are free.
- Entitlement decided in Postgres by `tenant_has_active_subscription()`, mirrored
  for the UI by `lib/billing-status.js` and unit-tested against it.
- No billing row is writable from the browser — reads only.
- Plan sync to PayPal (`billing-plans-sync`), per-environment plan ids.
- Upgrade and downgrade via `billing-subscription`.
- **Cancel-at-period-end is implemented.** Cancelling calls PayPal, records
  `cancel_at_period_end` and `canceled_at`, and returns `access_until`. Access
  continues to the end of the paid period; renewal stops. **Never exercised
  end to end** — see [planned.md](planned.md).
- Every existing tenant comped at launch, so billing shipped without taking a
  live client's site down.
- Grace periods, `past_due`, trial fields — all present in the schema and handled
  by `deriveBilling()`.
- CSV export of subscribers.

## Email

- Resend on every path: invite, credentials resend, signup verification,
  password reset.
- Supabase's mailer is on no live path.
- One language-resolution chain shared by every sender and the admin:
  `admin_lang → lang → tenant.default_lang → ar`.
- Failures are deliberately silent to avoid revealing which addresses have
  accounts.

## Password reset (self-serve)

- Our own, on Resend, since 2026-08-08. `resetPasswordForEmail` is gone.
- `request-password-reset` → branded per-language mail → `/reset-password` →
  `complete-password-reset`.
- Tokens: hashed at rest, expiring, single-use, claimed against the **database's**
  clock, never reinstated after being spent.
- No user enumeration; no password logged.
- Safe against the mail-scanner pre-fetch that made Supabase's own links
  unusable, because the page calls nothing on GET. A test enforces this.
- One symptom is still open — see [planned.md](planned.md).

## Engineering

- 29 unit-test files over the pure `lib/` modules, including ar/en translation
  parity and a billing-status-vs-database mirror test.
- `supabase/SCHEMA.sql` as a single read-back-from-production description of the
  database, replacing eleven contradictory SQL files.
- Applied-migration log in `supabase/sections/`, superseded scripts quarantined
  in `supabase/history/` behind do-not-run banners.
- `.claude/skills/` — `feature-workflow` and `verify`.
