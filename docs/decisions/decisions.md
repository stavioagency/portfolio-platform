# Decisions

**Why things are the way they are.** Read this before "fixing" something that
looks wrong — several of these look like mistakes and are not.

Each entry is: the decision, the reason, and what it costs.

---

## Products and boundaries

### Why the marketing site is a separate project

Different products, different deployments, different owner accounts, different
Supabase projects. Keeping them apart means a marketing change cannot take the
customer product down, and a platform migration cannot break a landing page.

*Cost:* two places to keep in step, and a hand-off link that must be maintained.
Worth it. See [environments/marketing.md](../environments/marketing.md).

### Why there is no default tenant

There once was: a singleton fallback to `profile.id = 1`. In production that row
was a real client's live portfolio, so **every unresolved request served their
site to strangers.**

Anything unresolvable is now a 404. **Never reintroduce a default tenant.**

---

## Authentication

### Why Supabase Auth is the only password authority

No custom hashing, no shadow table, no password column anywhere in `public` —
verified by scanning `information_schema.columns`, not assumed. A second place
storing a credential is a second place to get it wrong, and password storage is
the last thing worth writing yourself.

*Our entire involvement:* `lib/password-policy.js` bounds length and enforces the
72-**byte** bcrypt cap.

### Why we built our own password reset instead of using Supabase's

Two reasons, in order of weight:

1. **Supabase's mailer has effectively never delivered on this project.** Across
   14 users, `confirmation_sent_at` was null for all of them and
   `recovery_sent_at` set for 2. "Forgot password" was a dead button: the
   customer clicked, nothing arrived, and they concluded their password had
   broken.
2. **Branding and language control.** A reset mail should be Designakum's, in the
   recipient's language, from our language chain — which Supabase's template
   layer cannot see.

Plus full ownership of expiry, revocation and single-use semantics.

*Cost:* a table, two functions and a page we now maintain.

### Why the reset token is a database row, but the signup token is not

They have different requirements, and the difference is idempotency.

**Email confirmation is idempotent** — confirming an already-confirmed address is
a no-op. So a stateless HMAC token (`_shared/signup-token.ts`) that is expiring
and **re-usable** costs nothing, and re-usability is the direct answer to mail
scanners pre-fetching links.

**A password reset is not idempotent.** Whoever holds the link can set the
password, so it must be revocable and single-use — and "used" is state a
stateless token cannot carry. Hence a row per token, storing the hash.

### Why single-use is safe for reset but was not for Supabase's links

The pre-fetch problem does not apply to ours. `/reset-password` renders a form on
GET and **calls nothing**. The token is spent by the POST a human causes by
submitting, which a scanner never performs.

Supabase's links were burned by scanners because arriving at the link *was* the
consumption. **Adding a validate-on-load call to `/reset-password` brings the
whole bug back** — `tests/password-reset.test.mjs` fails if one appears.

### Why signup uses separate secrets from billing

`SIGNUP_TOKEN_SECRET`, never `BILLING_GRANT_SECRET`. A leaked billing secret must
not be able to verify email addresses.

### Why account creation is server-side

A browser `signUp()` would trigger Supabase's mailer — the one thing we are
deliberately routing around.

### Why a plaintext temporary password is emailed at all

It is a real trade-off, accepted for a specific reason: `must_set_password`
forces a change on first sign-in, and the alternative repeatedly failed. A
one-time magic link is single-use and Supabase cannot make it otherwise, mail
scanners burned it by pre-fetching, and the account had **no password at all**
until it was clicked.

*Cost, and it is sharp:* a typo in the email address hands a working password to
a stranger, and whoever signs in first owns the workspace.

### Why `reset-client-password` refuses to touch a platform owner

Co-owners are peers. One silently resetting the other is account takeover, not
support.

---

## Email

### Why Resend

Branded emails, per-language control, and — decisively — it is the one mail path
proven to work on this project. See
[architecture/emails.md](../architecture/emails.md).

### Why mail failures are silent

A 500 from `request-password-reset` would tell an anonymous caller which
addresses have accounts. Silence is the price of not leaking that.

*Cost, and it is real:* a missing `RESEND_API_KEY` looks exactly like working
software from the outside. That is why it is the first thing to check when mail
stops.

### Why onboarding sends the email last

Account, username and tenant mapping are committed **before** any send, and a
send failure never fails the request. **Email is an optimisation, not a
dependency** — when it breaks, onboarding degrades to copy-and-paste instead of
stopping. This property is the whole reason the flow was rewritten.

---

## Billing

### Why PayPal, and why prices are in two currencies

**PayPal cannot charge SAR** — 24 supported currencies, and the riyal is not one.
So every plan carries a SAR display price and a USD billing price, set by hand,
with nothing converting between them at runtime. An FX lookup would make the
charged amount drift daily.

Checkout shows the customer **both**, deliberately: being surprised by a USD
figure on a statement is how a payment becomes a dispute.

### Why there is no renewal scheduler

PayPal owns the schedule — it charges renewals, retries failures and suspends
after the plan's failure threshold. `payment_failure_threshold` on the PayPal
plan *is* the retry policy.

**A second scheduler would double-charge.** Do not build one.

### Why the webhook is the only thing that may activate a subscription

Returning from PayPal means the customer approved it, not that it is paid. The
browser never reports a payment, and `pending` grants nothing.

### Why the browser cannot write any billing row

There is no INSERT or UPDATE policy on any of the six billing tables. A client
who could write `status = 'active'` would own the product for the cost of a
fetch.

### Why idempotency is constraints rather than logic

`billing_events (provider, provider_event_id)` and
`payments (provider, provider_payment_id)`. PayPal retries for three days; two
unique constraints make every retry free, with no code to get wrong.

### Why every pre-existing tenant is comped

Billing shipping must never take a live client's site down. Entitled, no price,
no renewal, no provider.

### Why comping excludes self-signup workspaces

The grant above protects a client who was already being served when billing
arrived. A self-serve customer is the opposite case: they have a working way to
pay, and comping them means they never do.

The trap is that "predates billing" and "has no subscription row" look
interchangeable and are not. A signup that has verified its email but not yet
paid *is* a tenant with no subscription row, so a backfill keyed on the row's
absence grants free permanent access to precisely the population that is meant
to pay. The discriminator is `created_via`: a self-signup tenant cannot predate
billing, because signup shipped after billing.

What makes it a decision rather than a bug fix is the second-order effect.
`billing-checkout` refuses anyone already holding `comped`, so a wrongly-comped
workspace cannot buy its way out, and a `disabled` tenant's site stays dark
because only the ACTIVATED webhook lifts that. Being too generous with
entitlement is normally the safe direction; here it produced an unrecoverable
state, which is why the exclusion is written into the backfill rather than left
to be cleaned up afterwards.

### Why `billing-checkout` and `billing-webhook` skip the JWT gateway

Neither caller has a Supabase session: an owner's payment-link recipient has none
at all, and PayPal has no token. Each authenticates itself — a signed grant, or
PayPal's signature. **This is not a weakening**, and deploying checkout with the
gateway on is a quiet failure that breaks payment links and nothing else.

### Why cancellation records intent and leaves `status` alone

PayPal has accepted it, so the customer is owed immediate feedback, but
`BILLING.SUBSCRIPTION.CANCELLED` can be seconds or minutes away. So
`cancel_at_period_end` and `canceled_at` are written now, and `status` is left to
the webhook. **Access continues to `current_period_end` either way** — which is
exactly the "stop renewing, keep what they paid for" behaviour.

### Why there is no resume button

A cancelled PayPal subscription is **terminal** and cannot be reactivated through
the API. The UI offers "subscribe again" rather than a button that would fail.

### Why `/subscribe` is not public

Without a grant, `billing-checkout` requires a real session *and* admin rights on
the named tenant. That is what stops a stranger opening a subscription against
someone else's workspace. Self-signup did not loosen it — it changed how a
stranger *becomes* a tenant admin, so they arrive at checkout already holding a
session.

---

## Data and code

### Why `SCHEMA.sql` is documentation and not a migration

There were eleven `.sql` files totalling ~2,300 lines describing four different
overlapping states of the same database, with **no way to tell which was true.**
`SCHEMA.sql` is read back out of the live database, so it is what exists rather
than what someone intended.

Changes go in `supabase/sections/`; `SCHEMA.sql` is then updated to match. The
superseded scripts are quarantined in `supabase/history/` behind do-not-run
banners because some of them are actively wrong — one carries a single-tenant
`CHECK (id = 1)`.

### Why `tenant_admins.role` is descriptive only

No policy or function reads it. Administering *every* tenant comes from
`platform_owners`. A partial unique index on `tenant_admins(user_id) WHERE role =
'owner'` was designed, checked, and found **unbuildable** — platform owners hold
that role on every tenant.

### Why public reads are wide open

A portfolio is public. Every **write** is gated by `is_tenant_admin()`.

### Why the language toggle drives both chrome and content

One control, not two. Arabic is a first-class language here, not a translation
layer — so editing "in Arabic" means the whole surface is Arabic, and what you
type goes to the Arabic side of the bilingual JSON. Latin numerals in both
locales.

### Why the admin is one enormous file

Not a decision anyone would make twice, but splitting it is a large refactor with
no user-visible benefit and real risk to the editor/preview/dirty-state contract.
It stays until there is a reason. [architecture/overview.md
§4](../architecture/overview.md) is the map through it.

### Why the dependency list is frozen at five

Five runtime dependencies, no devDependencies, no TypeScript, no Tailwind. Small
surface, fast builds, nothing to keep patched. **Do not add to it without an
explicit request.**

### Why documentation lives in `docs/` with one index

Prose rots the same way those eleven SQL files did. One index, one owner per
fact, links instead of restatement. A fact written in two places will be wrong in
one of them within a month.
