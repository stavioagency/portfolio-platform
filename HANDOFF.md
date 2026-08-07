# HANDOFF — Portfolio Platform

**This is the ONLY AI-context document in this repository.** Do not create
`CONTEXT.md`, `STATUS.md`, `SESSION.md`, `NOTES.md`, `HANDOFF_V2.md` or anything
similar. If something learned is durable, edit this file. If it is only true today,
it does not belong here.

Keep this file to **long-term project knowledge**: architecture, invariants, the
reasoning behind decisions that look odd, and traps that have already cost time.
Never session logs, task lists, or "what we did today".

---

## 0. PROJECT BOUNDARY — read before anything else

This repository is the **Portfolio Platform**: the multi-tenant SaaS where clients
manage their own portfolio websites, plus the public sites it serves.

There is a **separate, unrelated project** for the marketing/landing website. It has
its own repository, its own Supabase project and its own domain. **Nothing in this
repo may reference, import from, copy, or serve it**, and no marketing copy, pricing
or sales content belongs here. If a task seems to concern the marketing site, stop
and ask rather than assuming.

There is also a **third, unrelated** Supabase project on the same account
(`jswxevbghmbqumlccpfy`, a personal finance app). **Never touch it.**

---

## 1. WHAT THIS IS

A multi-tenant SaaS that builds **bilingual (Arabic / English) portfolio websites**
for freelancers. One Next.js app and one Supabase project serve every client.

- Each client is a **tenant** with their own public site and private dashboard.
- Public sites render at `/{slug}`, or on a client's own custom domain.
- Tenant isolation is enforced by **Postgres RLS**, not by the UI.
- Arabic is first-class, not a translation layer. Latin numerals in both locales.

---

## 2. TECH STACK & HARD CONSTRAINTS

- **Next.js 14, Pages Router, plain JavaScript.** No TypeScript, no tsconfig.
- **styled-jsx** for all styling. **No Tailwind, no PostCSS config.**
- **Five runtime dependencies only:** `@supabase/supabase-js`, `next`, `react`,
  `react-dom`, `react-image-crop`. **No devDependencies.**
  **Do not add dependencies without an explicit request.**
- Design tokens are CSS custom properties in `styles/globals.css`.
- Supabase: Postgres + Auth (GoTrue) + Storage + RLS + Edge Functions (Deno).
- Tests: the Node built-in runner. `npm test` → `node --test tests/*.test.mjs`.

**The build requires Supabase env vars or it fails on `supabaseUrl is required`.**
`.env.local` is gitignored; placeholders are fine for a build or type check:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="x" npm run build
```

Real values are needed for any data-driven screen to work locally.

---

## 3. REPO MAP

```
pages/
  index.js      The public portfolio, client-side rendered. Resolves the tenant,
                loads its data, renders the site. Serves "/" as well.
  [slug].js     Per-tenant public route. Reuses <Home> from index.js and passes the
                slug. There is NO second renderer.
  admin.js      THE ENTIRE ADMIN — every editor, the shell, nav, contexts, modals.
                One very large file; see section 5.
  privacy.js, terms.js, _app.js, _document.js

components/
  PreviewPane.js   Live-preview iframe (device frame, scaling, refresh, retry).
  ui/              Button, Card, Badge, Icon, Input, EmptyState, Skeleton,
                   Toast (ToastProvider/useToast), ConfirmDialog
                   (ConfirmProvider/useConfirm), barrel index.js.

lib/
  supabase.js          createClient from NEXT_PUBLIC_* env. No options.
  tenant.js            PUBLIC tenant resolver. See section 6 — read it before
                       changing anything about routing.
  admin-nav.js         navGroups({isOwner, ar, t}) — the sidebar IA as pure data so
                       visibility rules are unit-testable.
  onboarding-guide.js  The client's guided setup content (why / how / tip per step),
                       bilingual. Content, deliberately not UI.
  profile-content.js   hasPublicContent() — does a profile render anything real.
  auth-link.js         Detects invite/recovery links and dead-link errors.
  pwned-password.js    HaveIBeenPwned k-anonymity check.
  password-policy.js   Min 8 / max 20 chars + a 72-BYTE bcrypt backstop.
  resolve-login.js     parseLoginIdentifier — email vs username at sign-in.
  image-compress.js    Downscale + WebP before upload; returns the ORIGINAL on any
                       failure so an upload is never blocked.
  safe-url.js          safeUrl() XSS guard for every public link sink.
  translations.js      ar + en dictionaries, parity-verified. getTranslator.
  i18n.js              pick / setLangValue / emptyBilingual.
  brand-icons.js, legal-content.js

supabase/
  SCHEMA.sql      >>> THE AUTHORITY on the live database. Read back OUT of it, so it
                  is what exists rather than what someone intended. Documentation,
                  NOT a migration — never run it.
  sections/       The applied-migration log (c, d, e, f). NEW changes go here.
  history/        Superseded scripts behind a do-not-run README. See section 9.
  functions/      Edge Functions (Deno), both deployed. See section 7.

tests/            One file per lib module. Pure functions only — no React, no network.
```

Other documentation: `README.md` (human-facing overview), `CLIENT-GUIDE.md` (a
guide written for clients, not for engineers) and `BILLING.md` (the operator's
guide to subscriptions — env vars, PayPal setup, the test matrix, the runbook).

---

## 4. DATABASE

Supabase project **`gphrzvjlstznhypcfgre`**, region ap-northeast-1.

**Read `supabase/SCHEMA.sql`.** It documents every table, foreign key, function,
policy and index, and why each exists. It is kept in sync with the live database.
The summary below is orientation only.

- **Tenant model:** `profile`, `projects`, `tenant_domains` and `analytics_events`
  all carry `tenant_id` and cascade when the tenant is deleted. There is no
  singleton fallback anywhere — see section 6.
- **Who may edit what:** `tenant_admins` maps users to tenants.
  `platform_owners` holds the operator accounts.
- **`is_tenant_admin(tid)` gates every write policy** and returns true for a
  tenant's own admins AND for any platform owner.
- **`tenant_admins.role` is descriptive only.** No policy or function reads it;
  `'owner'` and `'client'` confer identical access to that one tenant.
  Administering *every* tenant comes from `platform_owners`.
- **Public reads are deliberately wide open** — a portfolio is public. Every WRITE
  is gated.
- **Own-row-only reads:** `admin_usernames`, `platform_owners`, `tenant_admins`.
  This is why `list_workspace_members()` exists: owners cannot otherwise join a
  workspace to the client who owns it. It is owner-gated internally and returns an
  empty set to everyone else.

To change the schema: add a file to `supabase/sections/`, apply it, then update
`SCHEMA.sql` to match.

---

## 5. admin.js INTERNAL STRUCTURE

It is one very large file. Orientation:

- `Admin` (root) mounts `ToastProvider` + `ConfirmProvider`, and renders `SignIn` or
  `Dashboard` by auth state, with `SetPasswordGate` layered on top when a password
  is owed.
- `Dashboard` is the shell. It owns `tenant`, `tenants`, `isOwner`, `activeTab` and
  the preview state, and renders the grouped sidebar plus an editor/preview split.
- Contexts: `DirtyContext` (unsaved-changes guard), `TenantContext` (`useTenant`),
  `PreviewContext` (`usePreview().refresh()`).
- Editors: `ClientHome`, `OwnerClientsOverview`, `ProfileEditor`, `CardEditor`,
  `ProjectsEditor`, `ProjectEditForm`, `LinksEditor`, `AppearanceEditor`,
  `AnalyticsEditor`, `AccountEditor`, `WebsiteGuide`.
- Owner administration: `TenantAdminSection`, with a `part` prop selecting which
  screen it is rendering into — `'onboard'` (inside the Clients modal) or
  `'settings'` (the Workspace tab). Plus `DomainManager`, `DnsInstructions`.
- Module-level helpers: `loadProfile`, `persistProfile`, `tenantStoragePath`,
  `computeSetup`, `adminRedirectUrl`, `checkDomainDns`, the dialog builders, and
  the `RESERVED_SLUGS` / upload-limit constants.

**Every editor must wrap itself in `<div className="editor">` and mount
`<AdminStyles />`.** Input styling is scoped under `.editor`. A component rendered
outside that wrapper renders as unstyled native form controls — this has happened
and looked like a broken page.

---

## 6. ARCHITECTURE INVARIANTS

These are load-bearing. Changing one without understanding it has broken production
before.

- **Tenant resolution is client-side**, in `index.js` via `resolveTenant`.
  An explicit `/{slug}` wins over the host; the host is only consulted when there is
  no slug. Anything unresolvable is a **404** — never a fallback to another tenant.
  There was once a singleton fallback to `profile.id = 1`, which in production was a
  real client's live portfolio, so every unresolved request served their site to
  strangers. **Never reintroduce a default tenant.**

- **An empty profile is not a missing profile.** A freshly created workspace has a
  profile row containing nothing, which is the normal state for every new client.
  `hasPublicContent()` decides whether the page renders or shows "setup needed";
  checking only for the row's existence produced a nameless blank card.

- **Live preview is an iframe of the REAL public site** at
  `${origin}/${slug}?preview=1`. Refresh is a query-param bump on the same iframe.
  Save-to-refresh is wired through the shared `SaveBar`, which detects a successful
  save and calls `usePreview().refresh()`. **No editor knows the preview exists** —
  do not add refresh calls inside editors.

- **The preview shares an origin with the admin**, so anything the public page
  persists to `localStorage` is written on the admin's behalf. `index.js` therefore
  suppresses both analytics and language persistence when `?preview=1` or when
  embedded in an iframe. Removing those guards silently corrupts the dashboard's own
  state and inflates tenant analytics.

- **An RLS-filtered write is not an error.** PostgREST reports success having
  changed zero rows. Every write helper must inspect the affected rows — see
  `persistProfile` and the `projects` handlers — or a blocked save reports "Saved"
  and silently discards the work.

- **`safeUrl()` guards every public link sink** (social anchors, CTA `window.open`,
  project URLs, lightbox). Applied at RENDER, not at save; input is stored raw.

---

## 7. CLIENT ONBOARDING AND RECOVERY

Two Edge Functions, both deployed, both owner-gated by re-checking
`is_platform_owner()` against the caller's own JWT. The `service_role` key is used
only inside them and never reaches the browser.

**`invite-client`** — Clients → "+ Add client". Creates the workspace AND the
account together, with a generated 14-character password (no ambiguous characters,
inside the 8–20 policy). It emails the credentials via the **Resend API**, and also
returns the password to the owner on screen.

**The email is deliberately the LAST step.** The account, username and tenant
mapping are all committed before any send is attempted, and a send failure never
fails the request. **Email is an optimisation, not a dependency** — when it breaks,
onboarding degrades to copy-and-paste instead of stopping. This property is the
whole reason the flow was rewritten; do not make any of it conditional on mail.

Emailing a plaintext temporary password is a deliberate trade-off. It is acceptable
only because `user_metadata.must_set_password` forces a change on first sign-in, and
because the alternative — a one-time magic link — repeatedly failed: the link is
single-use and Supabase cannot make it otherwise, mail scanners burned it by
pre-fetching, and the account had no password at all until it was clicked.

Two consequences worth knowing before touching this:

- **A typo in the email address hands a working password to a stranger.** Whoever
  signs in FIRST sets the real password and owns the workspace. Reset immediately.
- **There is no "re-invite".** `invite-client` creates a NEW auth user, so re-running
  it for an existing client fails on `email_taken` / `username_taken`.

**`reset-client-password`** — Clients → "Reset password". The recovery path.
Generates a fresh password, re-arms `must_set_password`, returns it to the owner.
It **refuses to touch a platform owner's account**: co-owners are peers, and one
silently resetting the other is account takeover, not support.

**Changing a client's email has no UI.** Do it in the Supabase dashboard. A wrong
email does NOT lock a client out — sign-in resolves their *username* to an email
server-side — it only breaks Supabase's own recovery.

Optional Edge Function secrets, which switch automatic email on with no code change:
`RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_URL`.

---

## 7b. BILLING

Subscriptions run on **PayPal**, and the operator detail lives in `BILLING.md`.
What belongs here is the handful of invariants that will not be obvious from the
code, and the one fact that surprises everyone.

- **PayPal cannot charge SAR.** Customers are quoted riyals and debited dollars,
  so every plan in `lib/billing-plans.js` carries two prices and nothing
  converts between them at runtime. Both figures are shown at checkout on
  purpose. If a SAR-capable provider is ever added, `BILLING_CURRENCY` is the
  switch.

- **PayPal owns the billing schedule.** It charges renewals, retries failures
  and suspends after the plan's failure threshold. There is deliberately NO
  renewal cron, no dunning ladder and no stored card in this repo. Do not build
  one — a second scheduler would double-charge.

- **The webhook is the only thing that may activate a subscription.** Returning
  from PayPal means the customer approved it, not that it is paid. `pending`
  grants nothing.

- **Entitlement is `tenant_has_active_subscription()` in Postgres**, called by
  policies. `lib/billing-status.js` is the UI's mirror of that rule and is
  unit-tested against it; where the two disagree the database is right, and the
  disagreement is the bug.

- **The browser cannot write any billing row.** There is no INSERT/UPDATE policy
  on any of the six billing tables — reads only. Every write is an Edge Function
  using the service role, acting on something PayPal said. A client who could
  write `status = 'active'` would own the product for the cost of a fetch.

- **Idempotency is two unique constraints**, not logic:
  `billing_events (provider, provider_event_id)` and
  `payments (provider, provider_payment_id)`. PayPal retries for three days;
  those constraints are what make the retries free.

- **Every existing tenant is `comped`** — entitled, no price, no renewal, no
  provider. Billing shipping must never take a live client's site down.

- **`billing-checkout` and `billing-webhook` deploy with `--no-verify-jwt`** and
  authenticate themselves (a signed grant, or PayPal's signature). Deploying
  checkout with the gateway check on silently breaks owner payment links.

- **A cancelled PayPal subscription is terminal.** It cannot be reactivated
  through the API, which is why the UI offers "subscribe again" rather than a
  resume button that would fail.

## 7c. PUBLIC SELF-SERVICE SIGNUP

Decided and locked; see the flow below before changing any of it. The operator
route (`invite-client`, section 7) is unaffected and stays the way an existing
client is onboarded.

```
/signup?lang=…&plan=… → signup-start → Resend verification email
        → /signup/verify?t=…&lang=… → signup-verify
              confirms the email in Supabase, creates the workspace
        → Continue → /admin?plan=…&lang=… → sign in
        → Billing tab (plan preselected) → checkout → /subscribe → PayPal
        → ACTIVATED webhook → subscription active AND tenant status → active
```

The customer never types `/subscribe` and is never sent there by a link: the
Billing tab navigates there once they press subscribe, with a session already
in hand. BILLING.md is the authority on why a link straight to `/subscribe` is
a dead end.

`lang` and `plan` ride the whole way. `plan` is stored on the account by
signup-start and read back by signup-verify, because the verification email is
usually opened on another device; `lang` travels the same way, with the URL
beating stored preference at every hop. Neither is trusted for pricing —
billing-checkout resolves the plan against `provider_plans`.

- **Supabase's built-in confirmation mailer is NOT used.** It has never
  delivered a message on this project — every account was created by
  `admin.createUser` with confirmation bypassed, and `confirmation_sent_at` is
  null for all of them. Verification goes through Resend, the one mail path
  proven to work here (section 7). This is why account creation is server-side:
  a browser `signUp()` would trigger the mailer we are deliberately avoiding.

- **Supabase Auth remains the source of truth for "is this email confirmed".**
  `signup-verify` sets `email_confirmed_at` through the admin API rather than
  recording confirmation in a column of our own. A second place storing that
  fact is a second place for it to be wrong.

- **The verification token is `_shared/grant.ts`'s design**, with its own secret
  (`SIGNUP_TOKEN_SECRET`, never `BILLING_GRANT_SECRET` — a leaked billing secret
  must not verify email addresses). It is **stateless, expiring and re-usable,
  not single-use**: section 9 records what single-use links cost this project,
  and a token that cannot be burned by a mail scanner is the direct answer to
  it. Resending mints an additional valid token rather than invalidating the
  old one, for the same reason.

- **Signup never reveals whether an email exists.** One response for every
  input. Behind it: a new address is created, an unconfirmed one is re-sent, and
  a confirmed one gets a "you already have an account" email instead. The
  information reaches the mailbox owner and never the requester — the same rule
  `forgot_password_sent` already follows.

- **No access before payment, and it needs no new enforcement.**
  `tenant_has_active_subscription()` is already false for a workspace with no
  subscription row. A self-signup tenant is created with `status = 'disabled'`
  and is flipped to `'active'` by the ACTIVATED webhook — that one line is the
  whole rule. A failed or abandoned payment simply leaves it there; retrying is
  opening `/subscribe` again.

- **One workspace per user is a single guard**, not a schema assumption.
  `tenant_admins` is already many-to-many and nothing else assumes one, so
  multi-workspace later is removing that check and adding a switcher.

- **A future 1-day trial needs no schema change.** `subscriptions.status`
  already has `trialing` and `trial_ends_at`, `deriveBilling()` handles both,
  and `tenant_has_active_subscription()` already returns true for `trialing`.
  The trial is: write a `trialing` row at signup instead of nothing, and
  activate the tenant then rather than on the webhook. Do not build it until
  asked.

- **`tenants.created_via`** (`'owner' | 'self_signup'`) distinguishes the two
  origins. Self-signups are stamped `handed_over_at = now()` at creation,
  because there are no credentials to hand over and they would otherwise sit in
  the operator's Pending handover queue forever.

- **Reserved slugs are enforced server-side.** They live in `lib/` so the
  browser and the Edge Function share one list. A tenant claiming `admin` or
  `subscribe` would shadow a real route.

## 7d. AUTHENTICATION & PASSWORD SYSTEM

Audited 2026-08-06 against production. The storage model is already correct;
what is wrong is the delivery of emails and the destructiveness of two operator
actions. Read this before touching anything that sets a password.

### Current architecture

**Supabase Auth is the only password authority, and this is verified, not
assumed.** A scan of `information_schema.columns` for anything matching
password / passwd / hash / secret across the whole `public` schema returns
NONE. There is no custom hashing, no shadow table, no duplicate storage.

Login: `lib/resolve-login.js` decides email vs username, a username is resolved
to an email by the anon-callable `get_email_for_username` RPC (see §8 — it must
stay anon-callable or sign-in breaks for everyone), then
`signInWithPassword`.

Passwords are created in exactly two places and updated in three:

| | |
|---|---|
| `invite-client` | creates with a generated 14-char password, mails it, sets `must_set_password` |
| `signup-start` | creates unconfirmed with the customer's own password |
| AccountEditor | re-auth, HIBP check, then `auth.updateUser({ password })` |
| `reset-client-password` | generates a NEW password (destructive — see below) |
| `client-recovery` → `send_welcome` | generates a NEW password (destructive) |
| `complete-password-reset` | the customer's own choice, against a single-use token |

### Known issues, in the order they cause support load

**1. Two operator actions silently invalidate a working password.** This is the
source of "the client says their password stopped working". It is not a bug —
it is the design surfacing as one.

`send_welcome` has no alternative: the original password is only ever a hash, so
"re-send their welcome email" cannot mean "re-send their password". An operator
clicking it to help a client who never got the mail breaks the password that
client may already be using. `reset-client-password` warns before doing this;
`send_welcome` does not.

*Future fix:* warn at the moment of clicking, and add a NON-destructive resend
for the common case — when `last_sign_in_at IS NULL` there is no working
password to protect, so re-issuing costs nothing. Fall back to the destructive
path only when they have actually signed in.

**2. Self-serve password recovery had almost certainly never worked.** ✅ FIXED.
Across 14 users: `confirmation_sent_at` was null for ALL of them and
`recovery_sent_at` set for only 2. Supabase's mailer is effectively
unconfigured — which is exactly why signup verification was built on Resend
(§7c). A customer clicked "forgot password", nothing arrived, and they concluded
their password had broken.

*Fixed by* moving reset onto Resend: `request-password-reset` mints a token and
sends a branded, per-language mail; `/reset-password` collects the new password;
`complete-password-reset` spends the token and writes it. `resetPasswordForEmail`
is gone from the codebase. Needs
`supabase/sections/section-j-password-reset.sql` applied and both functions
deployed with `--no-verify-jwt`.

*Not* built on `_shared/signup-token.ts` as this section originally proposed. A
stateless HMAC token cannot be revoked or spent, and a reset link must be both —
see the reasoning at the top of the migration.

**3. Supabase recovery links are single-use and cannot be made otherwise** (§9).
✅ NO LONGER APPLIES to password reset, which no longer uses them. A mail scanner
pre-fetching one burned it, and the user saw "link expired" for a link they
never clicked.

Our own reset token IS single-use, and that is safe for the reason the Supabase
one was not: `/reset-password` renders a form on GET and calls nothing. The
token is spent by the POST a human causes by submitting, which a scanner never
performs. Anything that adds a validate-on-load call to that page brings the
whole bug back — `tests/password-reset.test.mjs` fails if one appears.

### Two guardrails for any auth change

- **`must_set_password` was true for 3 users at audit time.** Any change must
  keep `SetPasswordGate` working, or those accounts are stranded holding a
  temporary password with no way to set a real one.
- **`user_metadata` writes must SPREAD, never replace** (§9). A replace drops
  `must_set_password` and the gate silently disappears.

### Mapping integrity, as audited

0 duplicate emails, 0 duplicate usernames, 0 orphaned usernames, 0 orphaned
profiles. `users_without_workspace` was 6 — expected: two platform owners plus
the unattached logins the recovery tooling already handles (§7). **No mapping
defect is causing login failures**; do not go looking for one.

## 8. KNOWN GAPS

- **`get_email_for_username` is callable by anon and confirms which usernames
  exist.** It must stay that way: sign-in resolves a username before anyone is
  authenticated, so revoking it breaks login for everyone. The real fix is to move
  username→email resolution server-side (an Edge Function taking username+password)
  and then revoke `anon`. That is an auth-flow refactor, not a grant change.
- **All existing objects in the `media` bucket use legacy FLAT paths.** Tenant
  storage isolation therefore governs only future uploads, and clients cannot manage
  pre-existing media. Migrating means renaming objects AND rewriting every stored
  URL in `profile` and `projects` — the failure mode is broken images on live sites.
- **`analytics_events` has no retention policy** and the admin query for it is
  unbounded. Fine at current volume; needs server-side aggregation before a
  high-traffic tenant.
- **`tenant_domains.status` is set by hand and drifts** from reality. It only drives
  a coloured dot in the Clients list.
- **Leaked-password protection is a Supabase Pro feature** and cannot be enabled on
  the current plan. `lib/pwned-password.js` reimplements it client-side instead — a
  guardrail, not enforcement, since a direct API call bypasses it. The security
  advisor will report this warning permanently; it is not actionable.
- **Two read-only loaders lack try/finally** and can stick on a skeleton if a fetch
  throws. They self-heal on reload.
- **No client-side error reporting.** Production errors reach `console.error` only.
- **No ESLint configured.**

---

## 9. TRAPS THAT HAVE ALREADY COST TIME

- **`supabase/history/` contains scripts that are actively WRONG for this database**,
  most dangerously a single-tenant `CHECK (id = 1)` constraint that multi-tenancy
  required removing. Every file there carries a do-not-run banner. Copying a table
  definition out of one silently reintroduces single-tenant assumptions.

- **Supabase invite and recovery links are single-use and cannot be made otherwise.**
  Shortening their expiry does not change that. A "link already used" arrival comes
  back as `#error=...` with no token and no `type=`, which is why it must be detected
  explicitly — otherwise the user lands on a bare sign-in form being asked for a
  password they never set.

- **`user_metadata` writes should spread the existing object.** If the API replaced
  rather than merged, writing one key would clear `must_set_password` and drop the
  password gate.

- **The browser preview pane can return a STALE DOM after navigation.** Screenshots
  and JS probes may disagree with reality; re-run the probe or reload before
  concluding a change did not work.

---

## 10. HOW TO WORK

- Finish every change with **`npm test`** and a **build** (placeholder env is fine),
  then read the diff before committing.
- Tests cover pure `lib/` modules only. Anything touching React or the network is
  verified by running it, not by a unit test.
- Verifying RLS behaviour is best done with a rolled-back transaction that sets
  `request.jwt.claims` to a specific user and `set local role authenticated` — that
  exercises the real policies without writing anything.
- Work happens directly on `main`. Commit or push only when asked.
- Remote: `https://github.com/stavioagency/portfolio-platform.git`

---

## 11. GUARDRAILS

Do not, without an explicit request:

- add a dependency, or introduce Tailwind or any framework;
- change the database schema, RLS, auth, the tenant resolver, or routing;
- reintroduce a default/singleton tenant;
- touch the separate marketing project or the finance Supabase project;
- redesign or rewrite the admin wholesale;
- commit a temporary test harness — grep for it before committing.

---

## 12. SESSION CONTINUITY RULES

Hard rules for anyone — human or agent — picking this up cold.

- **Never replace Supabase Auth with custom password storage**, and never store
  a password or hash in a `public` table. The audit in §7d confirms none exist
  today; that property is worth more than any convenience.
- **Never write custom password hashing.** `lib/password-policy.js` bounds
  length and enforces the 72-BYTE bcrypt cap; that is the whole of our
  involvement in passwords.
- **Do not modify billing, PayPal, subscriptions or tenants while changing
  authentication** unless auth consistency genuinely requires it — and say so
  explicitly if it does.
- **Preserve the signup verification architecture** in §7c. Resend, not
  Supabase's mailer; reusable expiring tokens, not single-use links.
- **Audit user mappings before changing auth** — `auth.users`, `profile`,
  `tenant_admins`, `admin_usernames` — rather than assuming a login failure is a
  data problem. It has not been so far.
- **Verify claims against the database before acting on them.** More than one
  reported failure in this project turned out to be correct behaviour observed
  at the wrong moment; and a partial unique index on `tenant_admins(user_id)
  WHERE role = 'owner'` was designed, checked, and found to be unbuildable
  because platform owners hold that role on every tenant.

## 13. PENDING WORK

The one deliberately time-sensitive block in this file — prune it as items
land, and do not let it grow into a task tracker.

1. **Self-signup payment activation is untested.** Everything up to payment is
   proven: `zz-signup-live` exists, `created_via = self_signup`, `status =
   disabled`, membership `self_signup = true`, profile present, not entitled.
   The `disabled → active` flip in `billing-webhook` v7 has never fired.
2. **Customer cancellation is untested** against the live sandbox subscription
   `I-M65XW1E7MM82`. The four reliability fixes are deployed.
3. **Auth improvements** — the three future fixes in §7d.
4. **Test artefacts to remove**, all deliberately preserved: tenant
   `zz-signup-live` and its user, `signup-test@designakum.site` (unconfirmed, no
   workspace), tenant `zz-billing-test`, the hidden one-cent `test` plan in
   `lib/billing-plans.js` plus its `provider_plans` row, and subscription
   `I-M65XW1E7MM82`.
5. **`supabase/SCHEMA.sql` does not yet describe sections H (billing) or I
   (signup).** It is meant to be the authority on the live database; right now
   it is behind by two applied migrations.
6. **The R.S currency symbol** replacement for the "SAR" label.
   `formatAmount()` in `lib/billing-plans.js` is the single source of truth; the
   CSV export should keep the literal code, because a spreadsheet needs a
   currency code rather than an image.
