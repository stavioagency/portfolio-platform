# Architecture — billing & PayPal

Subscription billing runs on **PayPal Subscriptions**. This document is both the
design (§1–2) and the operator's guide (§3 onward): what to set, where to click,
and what to do when something goes wrong. The reasoning behind the adapter layer
lives in code comments — start with `supabase/functions/_shared/provider.ts` and
`supabase/sections/section-h-billing.sql`.

---

## 1. Invariants — the things that will not be obvious from the code

- **PayPal cannot charge SAR.** Its supported list is 24 currencies and the
  Saudi riyal is not one of them. Customers are quoted riyals and debited
  dollars, so every plan in `lib/billing-plans.js` carries **two prices** and
  nothing converts between them at runtime. Both figures are shown at checkout on
  purpose. `BILLING_CURRENCY` is the switch if a SAR-capable provider is ever
  added.

- **PayPal owns the billing schedule.** It charges renewals, retries failures and
  suspends after the plan's failure threshold. There is deliberately NO renewal
  cron, no dunning ladder and no stored card in this repo. **Do not build one — a
  second scheduler would double-charge.**

- **The webhook is the only thing that may activate a subscription.** Returning
  from PayPal means the customer approved it, not that it is paid. `pending`
  grants nothing. The browser never reports a payment.

- **Entitlement is `tenant_has_active_subscription()` in Postgres.** The write
  policies on `profile`, `projects` and `tenant_domains` reach it through
  `can_edit_tenant()` — *owner, OR (tenant admin AND paid up)* — and media
  writes through `can_write_media()`. `lib/billing-status.js` is the UI's mirror
  of that rule and is unit-tested against it. Where the two disagree the
  database is right, and the disagreement is the bug.

- **Entitlement gates WRITES, not reads.** A lapsed workspace keeps its
  dashboard, its own content and its billing rows readable — deliberately, or
  the customer could not reach the Billing tab to resubscribe. `is_tenant_admin()`
  therefore has no billing component and must not grow one. What a lapsed
  workspace loses is the ability to change anything.

- **A lapsed workspace's public site stops rendering**, via a second gate in the
  tenant resolver — `tenant_has_active_subscription()` over RPC, which anon may
  execute (it returns a bare boolean and exposes no billing data). It is
  **independent of `tenants.status`**: both gates must pass, so billing still
  never writes that column and an operator's manual suspension is theirs alone.
  Nothing is swept or scheduled; entitlement is evaluated at page load, so a
  cancelled subscription serves until `current_period_end` and stops the moment
  it passes. Unlike the write gate, this one **fails open** on an RPC error. See
  [overview.md §5](overview.md).

- **The browser cannot write any billing row.** There is no INSERT or UPDATE
  policy on any of the six billing tables — reads only. Every write is an Edge
  Function using the service role, acting on something PayPal said. A client who
  could write `status = 'active'` would own the product for the cost of a fetch.

- **Idempotency is two unique constraints, not logic:**
  `billing_events (provider, provider_event_id)` and
  `payments (provider, provider_payment_id)`. PayPal retries for three days;
  those constraints are what make the retries free.

- **Operator-created tenants that predate billing are `comped`** — entitled, no
  price, no renewal, no provider. Billing must never take a live client's site
  down. Section H granted the cohort that existed when billing shipped; section
  K granted the stragglers when entitlement was wired into the write policies.

- **Comping excludes `created_via = 'self_signup'`, and that exclusion is
  load-bearing.** A self-serve customer has a way to pay and must use it. A
  verified-but-unpaid signup is, structurally, a tenant with no subscription
  row — so a backfill that keys only on "has no subscription row" comps exactly
  the people who are supposed to pay. Section K did that to three workspaces
  before it was caught, and the result was worse than free access: `comped` also
  makes `billing-checkout` answer `already_subscribed`, so they could never buy
  their way out, while `tenants.status = 'disabled'` kept their site dark with
  no webhook able to flip it. **Any future self-serve `created_via` value must
  be added to that exclusion in `section-k-entitlement-enforcement.sql`.**

- **`billing-checkout` and `billing-webhook` deploy with `--no-verify-jwt`** and
  authenticate themselves (a signed grant, or PayPal's signature). Deploying
  checkout with the gateway check on silently breaks owner payment links.

- **A cancelled PayPal subscription is terminal.** It cannot be reactivated
  through the API, which is why the UI offers "subscribe again" rather than a
  resume button that would fail.

- **PayPal DROPS `billing_info.next_billing_time` once a subscription is
  cancelled.** Verified against the stored payloads: present on ACTIVATED, gone
  on CANCELLED, while `last_payment.time` survives. So `getSubscription()`
  reports `currentPeriodEnd: null` for anything cancelled, permanently.
  Since entitlement is `status = 'canceled' AND current_period_end > now()`,
  **writing that null is a revocation** — it takes back time the customer has
  paid for. Delivery order is not guaranteed and PayPal retries for three days,
  so an ACTIVATED, UPDATED or PAYMENT.SALE.COMPLETED landing *after* a
  cancellation is a real ordering, and the loss scales with the plan: a month on
  monthly, up to a year on yearly. Every branch that re-reads the subscription
  therefore goes through `keepPeriodEnd()` — PayPal stays authoritative whenever
  it has an answer, and "no answer" means leave the date alone. The one
  exception is `healMissingSubscription()`, which runs only when there is no
  local row to preserve anything from.

---

## 2. How it works in one page

Two plans, priced in `lib/billing-plans.js` and mirrored into PayPal as billing
plans. A customer approves a subscription **on paypal.com**; PayPal then charges
it on schedule, retries failures, and tells us what happened over webhooks.

```
  marketing site ─→ /signup ─→ email (Resend) ─→ workspace, DISABLED ─┐
                                                                      │
  client dashboard ───────────────────────────────────────────────────┤
                                    ├─→ /subscribe ─→ billing-checkout ─→ PayPal
  owner's link ─────────────────────┘                              │
                                                                   ▼
   subscriptions table ←── billing-webhook ←──── BILLING.SUBSCRIPTION.ACTIVATED
   tenant DISABLED → ACTIVE                      PAYMENT.SALE.COMPLETED, …
```

`/subscribe` takes these query parameters:

| Parameter | Door | Meaning |
|---|---|---|
| `plan` | 1 | plan code — `monthly` or `yearly` |
| `tenant` | 1 | the workspace being subscribed, a UUID |
| `t` | 2 | the owner-issued signed grant; carries plan *and* tenant |
| `lang` | both | `ar` or `en`. Overrides stored preference; anything else is ignored and Arabic wins |
| `status` | — | set by the return/cancel URLs coming back from PayPal |

**Checkout has exactly two doors, and neither is public.** Without a grant,
`billing-checkout` requires a real session *and* admin rights on the named
tenant, so a visitor who has never signed in cannot start a checkout. That rule
is load-bearing: it is what stops a stranger opening a subscription against
somebody else's workspace.

What changed with self-signup is only *how a stranger becomes a tenant admin*.
`/signup` creates the account, verifies the address through Resend, and builds
the workspace `status = 'disabled'` with no subscription row — so the visitor
arrives at door 1 already holding a session and admin rights on their own new
workspace. Nothing about checkout was loosened.

> **Marketing must link to `/signup`, never `/subscribe`.** `/subscribe` is not a
> public page. A visitor sent there has no session, so `billing-checkout` answers
> `invalid_token` and they hit a dead end. Link to
> `https://designakum.site/signup?lang=ar` or `?lang=en` — the language parameter
> matters, because a visitor crossing from another origin has no stored
> preference and would otherwise land on an Arabic form.

`lang` is also forwarded to PayPal as the approval page's locale.

### Currency — read this before quoting anyone a price

| | |
|---|---|
| `DISPLAY_CURRENCY` = SAR | what customers are quoted, everywhere in the UI |
| `BILLING_CURRENCY` = USD | what PayPal actually debits |

They are two numbers **you** set. Nothing converts between them at runtime — an
FX lookup would make the charged amount drift daily. Keep them roughly in step by
hand. Checkout tells the customer both, deliberately: being surprised by a USD
figure on a statement is how a payment becomes a dispute.

Current values: **12 SAR / 3.20 USD** monthly, **120 SAR / 32 USD** yearly.

> **Fee note.** PayPal's fixed per-transaction fee is a large share of a small
> charge — on ~3.20 USD it is most of the cost, on ~32 USD it is marginal. The
> annual plan is dramatically more efficient to collect. Worth steering toward.

### Cancellation — what "cancel" already does

**This is built.** `billing-subscription` with `action: "cancel"` calls PayPal
first, then records `cancel_at_period_end: true` and `canceled_at`, and returns
`access_until: current_period_end`. `status` is deliberately left alone; the
webhook sets it. **Access continues to the end of the paid period either way.**

So a customer who cancels in January 2027 on a period ending August 2027 keeps
access until August 2027 and is not renewed. That is the behaviour already
implemented, and `lib/billing-status.js` and the admin UI both read
`cancel_at_period_end`. What is *not* done is proving it end to end — see
[features/planned.md](../features/planned.md).

---

## 3. Environment variables

### Next.js app (Vercel → Settings → Environment Variables)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | already set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | already set |
| `NEXT_PUBLIC_BILLING_CURRENCY` | no | defaults to `USD`. Set to `SAR` only when a SAR-capable provider is live |
| `NEXT_PUBLIC_PLAN_PRICE_MONTHLY` | no | display price override, **minor units** (`1200` = 12 SAR) |
| `NEXT_PUBLIC_PLAN_PRICE_YEARLY` | no | display price override |
| `NEXT_PUBLIC_PLAN_PRICE_MONTHLY_USD` | no | billing price override (`320` = 3.20 USD) |
| `NEXT_PUBLIC_PLAN_PRICE_YEARLY_USD` | no | billing price override |

A malformed override is ignored with a console warning rather than becoming 0 —
see `envAmount()`.

### Supabase Edge Function secrets

`Supabase dashboard → Project settings → Edge Functions → Secrets`, or:

```bash
supabase secrets set PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=...
```

| Secret | Required | Notes |
|---|---|---|
| `PAYPAL_CLIENT_ID` | yes | from the PayPal app |
| `PAYPAL_CLIENT_SECRET` | yes | **never** goes near the browser |
| `PAYPAL_WEBHOOK_ID` | yes | from the webhook in §4. Without it every webhook is rejected |
| `PAYPAL_ENV` | yes | `sandbox` or `live`. Also selects which `provider_plans` rows are used |
| `BILLING_GRANT_SECRET` | yes | ≥32 random chars; signs the owner's payment links. `openssl rand -base64 48` |
| `BILLING_RETURN_HOSTS` | yes | comma-separated allow-list of hosts a checkout may return to. **Empty means no checkout can start** — it fails closed |
| `BILLING_PROVIDER` | no | defaults to `paypal` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform.

---

## 4. PayPal setup

### 4.1 Sandbox (do this first)

1. <https://developer.paypal.com/dashboard/> → **Apps & Credentials** →
   *Sandbox* → **Create App** (type: Merchant).
2. Copy the **Client ID** and **Secret** into the Supabase secrets above with
   `PAYPAL_ENV=sandbox`.
3. **Sandbox → Accounts** gives you a test *business* and *personal* account. The
   personal one is what you pay with while testing.

### 4.2 The webhook

1. In the app, **Add Webhook**.
2. URL: `https://<project-ref>.supabase.co/functions/v1/billing-webhook`
3. Subscribe to exactly these events:

   ```
   BILLING.SUBSCRIPTION.ACTIVATED
   BILLING.SUBSCRIPTION.RE-ACTIVATED
   BILLING.SUBSCRIPTION.UPDATED
   BILLING.SUBSCRIPTION.CANCELLED
   BILLING.SUBSCRIPTION.SUSPENDED
   BILLING.SUBSCRIPTION.EXPIRED
   BILLING.SUBSCRIPTION.PAYMENT.FAILED
   PAYMENT.SALE.COMPLETED
   PAYMENT.SALE.DENIED
   PAYMENT.SALE.REFUNDED
   PAYMENT.SALE.REVERSED
   CUSTOMER.DISPUTE.CREATED
   ```

4. Copy the generated **Webhook ID** into `PAYPAL_WEBHOOK_ID`.

Anything not in that list is recorded and ignored — adding more is harmless.

### 4.3 Create the plans

Sign in to `/admin` as a platform owner and run the plan sync (Subscribers → plan
tools), or call it directly:

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/billing-plans-sync \
  -H "Authorization: Bearer <your owner JWT>" \
  -H "Content-Type: application/json" \
  -d '{"plans":[
        {"code":"monthly","amount":"3.20","currency":"USD","interval":"month","interval_count":1},
        {"code":"yearly","amount":"32.00","currency":"USD","interval":"year","interval_count":1}
      ]}'
```

It creates a PayPal product and one plan per code, then writes the ids into
`provider_plans`. Re-running is safe: unchanged plans are skipped.

**Changing a price later** means running it again with the new amount. A new
PayPal plan is created and the old mapping deactivated. **Existing subscribers
stay on the old plan and the old price** — that is PayPal's model; moving them
requires a revise plus a fresh approval from each customer.

---

## 5. Database

Apply once, in the Supabase SQL editor: `supabase/sections/section-h-billing.sql`.
It is additive and idempotent, and grants pre-existing tenants a **comped**
subscription. Six tables: `provider_plans`, `billing_customers`, `subscriptions`,
`payments`, `invoices`, `billing_events`. See
[database.md](database.md).

Two later sections complete the billing picture and are applied the same way:
**section K** wires entitlement into the write policies (`can_edit_tenant`,
`can_write_media`), and **section L** declares the public-site gate. Each carries
its own VERIFY block at the bottom of the file — use those, not the query below.

Verify section H immediately after applying it:

```sql
select count(*) as tenants,
       (select count(*) from public.subscriptions where status = 'comped') as comped
  from public.tenants;
```

Those two numbers match **only in the moment section H is applied**, before any
real subscription exists and before any self-signup workspace does. They diverge
permanently afterwards and are supposed to: a paid tenant is not comped, and an
unpaid self-signup tenant has no subscription row at all. Do not treat a
mismatch later as a fault — section K's own VERIFY counts the grantable
population instead, which is the check that stays true.

---

## 6. Deploying the functions

```bash
supabase functions deploy billing-subscription
supabase functions deploy billing-plans-sync
supabase functions deploy billing-checkout --no-verify-jwt
supabase functions deploy billing-webhook  --no-verify-jwt
```

`--no-verify-jwt` on those two is **required**, and it is not a weakening:

- `billing-checkout` serves the owner's payment link, whose recipient has no
  session at all. It verifies a signed grant or a real JWT itself.
- `billing-webhook` is called by PayPal, which has no Supabase token. It verifies
  PayPal's signature and refuses anything else.

Deploying `billing-checkout` *with* the gateway check breaks payment links and
nothing else — a quiet failure, which is why it is written at the top of the file
too.

---

## 7. Local development

```bash
npm run dev                      # the app, on :3000
supabase functions serve         # the functions, on :54321
```

Add `localhost` to `BILLING_RETURN_HOSTS`. PayPal cannot reach a laptop, so to
exercise webhooks either use a tunnel (`cloudflared tunnel --url
http://localhost:54321`) with a **second sandbox webhook** pointed at it, or use
the PayPal dashboard's **webhook simulator**. The simulator's payloads carry no
real signature, so verification rejects them — test against a tunnel for anything
that must prove the verification path.

---

## 8. The test matrix

Run every row in sandbox before going live.

| # | Flow | How | Expect |
|---|---|---|---|
| 1 | New subscription | `/subscribe?plan=yearly&tenant=<id>` → approve | row goes `pending` → `active`; a `payments` row; an invoice |
| 1b | Checkout language | open with `?lang=en`, then `?lang=ar` | renders in that language regardless of stored preference; `?lang=fr` falls back to Arabic |
| 2 | Payment link | Subscribers → send link → open in a private window | same as 1, with no sign-in |
| 3 | Link tampering | edit `plan=` in a link URL | the grant's plan wins, not the URL's |
| 4 | Expired link | wait out the TTL, or corrupt the token | "this link is no longer valid" |
| 5 | Renewal | sandbox bills on an accelerated clock | second `payments` row; period end moves |
| 6 | Upgrade | Billing → yearly → confirm | applied, or an approval redirect; plan changes only after approval |
| 7 | Downgrade | Billing → monthly → confirm | same, effective next cycle |
| 8 | Cancel | Billing → cancel | `cancel_at_period_end` true; access continues to period end; PayPal shows cancelled |
| 9 | Failed payment | sandbox negative testing | status `past_due`, grace date set, banner counts days |
| 10 | Expiry after grace | move `grace_ends_at` into the past | `tenant_has_active_subscription` false |
| 11 | Webhook replay | re-send the same event from the dashboard | second delivery returns `duplicate: true`; no second payment row |
| 12 | Forged webhook | POST a payload with no signature | 401, nothing written |
| 13 | Refund | refund the sale in PayPal | payment `refunded`, access ends |
| 14 | Comped tenant | any existing workspace | stays entitled, no PayPal calls |

---

## 9. Going live

The order below is not a preference. Steps 6 and 7 must be adjacent, and the
cleanup in step 3 must happen before step 6 — see the notes after the list.

1. **Check the live account in the PayPal dashboard.** Business account live,
   verified and unlimited; note its registered country. Then open **Payment
   Receiving Preferences** and confirm USD is accepted and payments in a
   currency the account does not hold are **not** held for manual approval. The
   account cannot hold SAR (§1), so USD arrives as a foreign currency; if it is
   blocked or held, a live payment succeeds while nothing activates — which
   looks exactly like a broken webhook.
2. Create a **live** PayPal app; new client id, secret and webhook. Subscribe
   the webhook to all **12** events in §4.2 — the whole list, not the subset
   that looks relevant. `BILLING.SUBSCRIPTION.RE-ACTIVATED` is the one usually
   missed: without it, a customer who resumes a suspended subscription at PayPal
   is never re-entitled here — they stay `past_due`, the grace window expires,
   and they lose access while paying. Adding an event later does not backfill
   the deliveries missed in the meantime.
3. **Delete the sandbox subscription rows.** Any row carrying a
   `provider_subscription_id` from sandbox becomes a dangling reference the
   moment the environment changes, because that id does not exist in live:
   - an `active` row keeps entitlement to its `current_period_end` — possibly a
     year — off a payment that was never real, with no webhook able to correct
     it;
   - an owner cancel hits the live API, gets a 404, and cannot be cleared from
     the UI;
   - worst, a `pending` or `comped` row with an id trips
     `needsRemoteVerification()` in `billing-checkout`, whose 404 lands in the
     catch and returns **503 `provider_unreachable` — permanently blocking that
     tenant's checkout**.

   Deleting the throwaway workspaces is enough. Do it before the flip, not after.
4. Set `BILLING_RETURN_HOSTS` to the production host(s) only. Note that
   `safeRedirect()` permits `localhost` regardless of the list, so leaving
   `localhost` in it lets a live checkout return to a developer machine.
5. Rotate `BILLING_GRANT_SECRET` if it was ever used in a shared sandbox.
6. Set `PAYPAL_ENV=live` and swap the three secrets, then **redeploy every
   billing function from the repo**. `PAYPAL_ENV`, the API `BASE` and
   `PAYPAL_WEBHOOK_ID` are all module-scope constants evaluated at import, so a
   warm instance can keep talking to sandbox with live credentials until it is
   replaced. Keep the JWT flags as they are — `billing-checkout` and
   `billing-webhook` deploy `--no-verify-jwt`, the other two do not.

   **`billing-plans-sync` matters most here**, and it is the one most likely to
   be running a stale bundle, because nothing else calls it. A pre-fix bundle
   still creates plans correctly — the `ensureProduct`/`createPlan` payloads
   have not changed — but it lacks the `details[0].field` suffix and the body
   logging in `api()`, so a live plan rejection reads as a bare
   `paypal_400: Value is invalid.` with nothing in the logs. That is exactly the
   failure the next step provokes: currency, country and account-eligibility
   rejections all surface there.
7. **Re-run `billing-plans-sync` immediately.** Live plan ids differ, and
   `provider_plans` keys on environment for exactly this reason. Verify the
   response reports `environment: "live"` and new `P-...` ids, and that the
   sandbox rows are still present — they are the rollback path, and the partial
   unique index is on `(provider, environment, plan_code) WHERE active`, so both
   environments coexist safely.
8. Run matrix rows 1, 8 and 11 against live with a real card, and refund
   yourself. Use the hidden `test` plan ($0.01) for the first one — send an
   owner payment link to a fresh, non-entitled workspace.
9. Deactivate the sandbox webhook. Both environments point at the same endpoint
   URL, so sandbox subscriptions keep posting after the flip and fail
   verification against the live webhook id. Those rejections return 401
   **before** the `billing_events` insert, so they leave no database trace —
   look in the Edge Function logs, not the table.

### The window between steps 6 and 7

`billing-plans-sync` writes `environment: PAYPAL_ENV` and creates the plans
against the same `BASE`, so **live plans cannot be created before the flip**.
Between setting `PAYPAL_ENV=live` and finishing the sync there are no live
`provider_plans` rows, and every checkout returns `plan_not_available`.

This is unavoidable with the current code, and it fails closed — nobody is
billed wrongly, they simply cannot subscribe. Keep the two steps adjacent and do
them when a few minutes of refused checkouts costs nothing.

### Rollback

**Before the first live payment, rollback is free.** Set `PAYPAL_ENV=sandbox`,
restore the sandbox secrets, redeploy. The sandbox `provider_plans` rows are
still there, so checkout works again immediately. Leave the live rows alone —
they cost nothing and save re-running the sync.

**After the first live payment, there is no clean rollback.** A real
subscription now exists whose id resolves nowhere in sandbox, so reverting
leaves a paying customer the system cannot read, cancel or renew. From that
point forward, fix forward: repair the data, never revert the environment.

---

## 10. When something goes wrong

**Every webhook ever received is in `billing_events`**, verbatim, with
`processed_at` and `error`. That table is the first place to look.

```sql
select received_at, event_type, error
  from billing_events
 where processed_at is null and error is not null
 order by received_at desc limit 20;
```

| Symptom | Cause | Fix |
|---|---|---|
| Every webhook 401s | `PAYPAL_WEBHOOK_ID` missing or from the other environment | set it, redeploy |
| `unknown_subscription_...` | exists at PayPal but not here — a failed write during checkout | insert the row, then replay the event from the PayPal dashboard |
| `invalid_redirect_url` | `BILLING_RETURN_HOSTS` unset or missing the host | set it; it fails closed on purpose |
| `plan_not_available` | plans never synced, or synced in the other environment | run `billing-plans-sync` |
| `grant_signing_failed` | `BILLING_GRANT_SECRET` missing or under 32 chars | set a long random one |
| Customer says cancelled, PayPal still billing | should be impossible — cancellation goes to PayPal first | check `billing_events` for the cancellation, cancel in PayPal directly, treat as a bug |

### Reported, not yet investigated: PayPal country defaults to UK

Arabic / Saudi customers reportedly see PayPal's approval page defaulting the
country to the United Kingdom. **Not reproduced and not diagnosed** — recorded
here so the next session does not rediscover it from scratch.

Where to start: `lang` is forwarded to PayPal as the approval page's *locale*,
which is not the same field as the payer's *country*. Look at what
`billing-checkout` sends in the subscription create call
(`supabase/functions/billing-checkout/index.ts` and `_shared/paypal.ts`) —
specifically whether an `application_context` locale is being set without a
corresponding country, and what the sandbox business account's own country is set
to. A sandbox account registered in one country will colour what you see while
testing.

---

## 10a. Granting a comp

`billing-subscription` action **`grant_comp`** — Subscribers → "Grant free
access". Owners only. Built 2026-08-13; before it, no product path could
*create* a comp and every comp in production came from one bulk SQL backfill
(all seven rows share `created_at = 2026-08-06 00:57:39.709533+00`).

**Why it had to exist.** "+ Add client" creates the tenant and the login but
writes no subscription row, so `tenant_has_active_subscription()` is false, and
section K gates **writes** on entitlement. A client onboarded that way could
sign in, see the dashboard and see their public site render — reads are gated by
`tenants.status`, not entitlement — while **every save was refused by RLS**.
They were a read-only tenant of their own workspace, and the only fix was a
hand-written INSERT against production.

The granted row is byte-identical in shape to the backfilled ones, so a granted
comp and an old one are indistinguishable to every reader:

| column | value | why |
|---|---|---|
| `provider` | `'none'` | there is no provider behind a grant |
| `provider_subscription_id` | null | nothing to point at |
| `plan_code` | `'comped'` | `COMP_PLAN_CODE`; never a `provider_plans` row |
| `status` | `'comped'` | already entitled by `tenant_has_active_subscription()` |
| `comp_kind` | `'grandfather'` unless told otherwise | the safer default: it does not mark anyone to invoice later |
| `environment` | null | see below |
| `amount` / `currency` | null | there is no price |

**`environment` stays null on purpose.** That column is the sandbox/live axis
and it is a PayPal fact; a comp has no PayPal. Null is what keeps grants out of
the environment migration in §10b entirely, rather than making them part of it.

**Three properties worth keeping:**

- **INSERT, never upsert.** `subscriptions_tenant_id_key` is UNIQUE on
  `tenant_id`, so a second grant raises 23505 and the helper returns null, which
  the action reports as `already_has_subscription` (409). An upsert here would
  let a mis-clicked grant overwrite a **paying** subscription — wiping its
  provider id and period, turning a customer into a freebie and destroying the
  only local pointer to their PayPal agreement. The database refusing is the
  feature; the handler's read-before-write is only a courtesy, and two owners
  clicking at once both pass it.
- **Owners only, re-checked with `is_platform_owner()`.** The generic
  `is_tenant_admin()` check at the top of the function is *not* sufficient:
  section F gives platform owners tenant-admin parity, but it equally passes an
  ordinary client admin on their own workspace — who would otherwise grant
  themselves free access. Of every action in the file this is where that
  distinction is load-bearing.
- **Handled ABOVE the `no_subscription` 404.** The action exists for tenants
  with no subscription, so below that guard it is unreachable — every call 404s,
  with a passing deploy and a button that never works. `set_comp_kind`
  documents the identical trap against the paid-subscription guard.
  `tests/billing-comp-grant.test.mjs` fails if either branch moves.

**No PayPal call is made**, and that is not a departure from the rule at the top
of the function ("change it at the provider first, let the webhook write the
row"). That rule governs provider-backed subscriptions; a comp has no provider
to ask and no webhook will ever arrive, so the operator's decision is the whole
of the fact.

**Auditability:** there is no audit table, and `billing_events` is not one — it
is raw provider webhooks keyed on `(provider, provider_event_id)`, and writing
operator actions there would corrupt both its meaning and its idempotency. The
trace is `created_at` on the row plus a log line carrying the acting owner's
user id, which is the part that cannot be reconstructed from the row afterwards.

**What it deliberately does not do:** it does not touch `tenants.status`. A
comped workspace that is still `disabled` (the state self-signup leaves) stays
unpublished — granting access and publishing a site are different decisions, and
folding them together would let one button do both by surprise. There is also
no "ungrant": the way back is deleting the subscription, which this screen does
not offer.

---

## 10c. Environment strategy — audited 2026-08-13

**Environments are separated by DEPLOYMENT CONFIG, not by data.** `PAYPAL_ENV`
is one global variable read in `_shared/paypal.ts`, and it selects the API base
(`api-m.paypal.com` vs `api-m.sandbox.paypal.com`) alongside whichever
`PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` are set. There
is exactly **one** PayPal live at a time. `subscriptions.environment` does not
change that; it is a *record* of which PayPal a row came from.

**Where `environment` is honoured:**

| Path | Use |
|---|---|
| `activeProviderPlan()` | plan lookup filters on `(provider, environment, plan_code)` |
| `billing-plans-sync` | writes and filters on `PAYPAL_ENV` |
| `billing-checkout` | stamps `environment: PAYPAL_ENV` at creation |
| `billing-webhook` (adopt-orphan) | stamps it when adopting a subscription |

**Where it is NOT honoured — the gap:** `tenant_has_active_subscription()`
reads `status` and nothing else, and no admin screen distinguishes a sandbox row
from a live one.

**Set only at creation, never on a patch.** Both stamping sites are paths where
a subscription comes into existence. Status patches from webhooks deliberately
do not carry `environment`, so a flip of `PAYPAL_ENV` cannot relabel existing
rows. Verified in `billing-webhook`; keep it that way.

**Webhooks are environment-aware implicitly, and fail CLOSED.** Both PayPals
deliver to the same endpoint URL; separation happens at verification, which
posts the event back to the *current* environment's API against the *current*
`PAYPAL_WEBHOOK_ID`. A sandbox event arriving while `PAYPAL_ENV=live` cannot
verify and is rejected 401. That is correct security, and it has a consequence
worth stating plainly: **while the platform is live, sandbox subscriptions are
frozen** — no webhook can cancel, expire or update them. They can only be
changed in the database.

### Production state at audit (2026-08-13)

`PAYPAL_ENV` has been `live` since 2026-08-09, and live plans exist.

| Rows | environment | status | entitled? |
|---|---|---|---|
| 2 (`zz-signup-live`, `niggatesting`) | **sandbox** | active | **YES — on fake money** |
| 2 (`onecenttest`, `ggghsj`) | live | pending | no |
| 7 | null (comps) | comped | yes |
| provider_plans | 3 live + 3 sandbox | active | — |

**There are currently ZERO real paying customers.** Every entitled workspace is
either a comp or one of the two sandbox subscriptions. That is what makes this
safe to fix now and expensive to fix later.

### The recommended model, and the predicate NOT to use

Entitlement should **not** compare against "the current application
environment". `tenant_has_active_subscription()` is a SQL function with no
access to `PAYPAL_ENV`, so making it runtime-aware would couple the database to
deployment config — and worse, it would mean flipping a config variable
silently revokes access for everyone on the other side. Access changes belong
in data, deliberately, not as a side effect of a deploy.

The correct rule is that **a sandbox subscription never entitles, ever**:

```sql
and s.environment is distinct from 'sandbox'
```

> **Use `IS DISTINCT FROM 'sandbox'`, NEVER `= 'live'`.**
> All seven comps carry `environment = NULL`. `environment = 'live'` would
> evaluate NULL to false and **revoke access from every comped client at once**
> — including `designakum` and `f9designer`. This is the single most dangerous
> line in the whole migration.

Longer term the real fix is structural: sandbox testing should not touch the
production database at all. A separate Supabase project (or branch) for sandbox
billing removes the entire class of problem, and makes the predicate above a
belt-and-braces backstop rather than the primary defence.

### Migration order (not yet executed — planning only)

Order matters more than content here.

1. **Neutralise the two sandbox rows first.** They cannot be cancelled through
   PayPal while `PAYPAL_ENV=live` (see fail-closed above), so this is a database
   action: expire the rows, or delete the workspaces if they are junk. Note that
   deleting a tenant cascades its billing history — see the note on that.
2. **Then** add the predicate. Doing it in this order means the change is a
   no-op at the moment it lands, instead of yanking access from two workspaces
   as a surprise.
3. **Deactivate the sandbox webhook** in the sandbox PayPal dashboard, so
   sandbox events stop reaching the production endpoint at all (§9 step 8).
4. Leave the two `pending` live rows alone — `pending` does not entitle.
5. Treat the secrets as an atomic SET. `PAYPAL_ENV`, client id, secret and
   webhook id must change together; a half-changed set means every API call or
   every webhook fails.

---

## 10b. Sandbox never entitles — CLOSED 2026-08-13 (was: entitlement ignored `environment`)

**Fixed.** `section-o-sandbox-entitlement.sql` added one line to
`tenant_has_active_subscription()`:

```sql
and s.environment is distinct from 'sandbox'
```

Before it, entitlement read `status` only, so a sandbox subscription at
`status='active'` granted exactly the access a paid live one does — and since
section K gates *writes*, that meant editing and saving a real workspace
forever, on fake money.

**`IS DISTINCT FROM 'sandbox'`, never `= 'live'`.** Comps carry
`environment = NULL`; `= 'live'` evaluates NULL to not-true and would revoke all
seven comped clients at once, `designakum` and `f9designer` included. The rule
is "sandbox never entitles", not "only live entitles". Do not "tidy" this.

Applied when there were **zero real paying customers** — every entitled
workspace was a comp or one of two owner test rows — which is what made it free
to do. Verified after applying: 7 comps entitled, both sandbox rows false, both
live `pending` rows unchanged.

The two sandbox subscriptions (`zz-signup-live`, `niggatesting`) were then set
to `status='expired'` with `canceled_at` stamped. They could not be cancelled at
PayPal — verification fails closed while `PAYPAL_ENV=live`, so the sandbox API
is unreachable — making a database write the only route. Their tenants were
deliberately NOT deleted: a tenant delete cascades payments, invoices and
billing_customers with no archive, and that call belongs to the owner.

---

## 10d. Webhook environment separation — reviewed 2026-08-13

Both PayPal environments deliver to the **same endpoint URL**. Separation
happens entirely at verification, and it fails closed:

1. `billing-webhook` reads the RAW body and calls `verifyWebhook` **before
   anything touches the database**. An unverified event is discarded with 401
   and never reaches `billing_events`.
2. `verifyWebhook` posts the event back to the **current** environment's API
   (`BASE`, from `PAYPAL_ENV`) against the **current** `PAYPAL_WEBHOOK_ID`.
3. A missing `PAYPAL_WEBHOOK_ID` refuses to verify rather than assuming.
4. `cert_url` is hostname-checked against `paypal.com` before being fetched —
   it arrives in an attacker-controllable header.
5. A verification that errors is treated as failure, never as "probably fine".

**Consequences, both intended:**

- A **sandbox event cannot affect production** while `PAYPAL_ENV=live`: the live
  API will not validate a sandbox signature, so it 401s. Confirmed by the two
  sandbox subscriptions, which no webhook has been able to touch.
- The same mechanism means **sandbox subscriptions are frozen** — unreachable by
  webhook, changeable only in the database. That is why §10b expired them
  directly.

`environment` is stamped **only where a subscription comes into existence**
(`billing-checkout` on create, `billing-webhook` on adopt-orphan). Status
patches deliberately do not carry it, so flipping `PAYPAL_ENV` cannot relabel
existing rows. Keep it that way.

**Secrets are an atomic SET.** `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`,
`PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID` must change together; a
half-changed set means every API call or every webhook fails. Not changed in
this pass — nothing required it.

**Still open:** the sandbox webhook should be deactivated in the sandbox PayPal
dashboard (§9 step 8) so those events stop reaching production at all. Today
they are correctly rejected, but rejecting noise is worse than not receiving it.

Audited 2026-08-13. Recorded because it is the mechanism behind "a test user
signed up, never paid, and still had a working dashboard", which had been filed
as an access-control bug.

`subscriptions.environment` records which PayPal a subscription lives at
(`sandbox` / `live`). **`tenant_has_active_subscription()` does not read that
column**, so a subscription created against sandbox PayPal — with fake money, by
anyone who can reach the checkout — satisfies entitlement exactly like a paid
live one.

Two production workspaces are entitled today on sandbox subscriptions alone:

| Workspace | tenant status | subscription | environment | entitled |
|---|---|---|---|---|
| `zz-signup-live` | active | active | **sandbox** | yes |
| `niggatesting` | active | active | **sandbox** | yes |

Both are the owner's own test signups, so nothing is currently being given away
to a stranger. The exposure is that nothing *structural* stops it: the platform
is in sandbox ([[paypal-env-sandbox-only]] — no live `provider_plans` exist),
so every subscription that can be created right now is a sandbox one.

**Do not "fix" this by adding `and environment = 'live'` to the function.** That
predicate would instantly revoke both workspaces above, and would revoke every
real customer the moment the live migration created live rows alongside sandbox
ones. The environment cutover is a data migration (§9), and this check belongs
in it — as one step, deliberately ordered, not as an isolated edit. Until then
the correct reading of an entitled sandbox workspace is "test data", and the
list above is the whole of it.

The signup flow itself is **not** the defect and needs no new gate: self-signup
tenants are created `disabled` with no subscription row, and both current
self-signups (`murtaza`, `gggzuu`) are correctly `disabled` / not entitled.
What an unpaid customer *can* do is load the dashboard shell — see
[overview.md](overview.md) on where the boundary actually sits; that is by
design, because the Billing tab is how they pay, and writes are stopped by RLS
rather than by hiding the UI.

---

## 11. Adding another provider

The interface is `supabase/functions/_shared/provider.ts`. Write an adapter
satisfying `BillingProvider`, add one line to the `PROVIDERS` registry, set
`BILLING_PROVIDER`. No schema change and no UI change: `provider` and
`provider_*_id` columns already exist on every billing table, `provider_plans`
already maps plan codes per provider, and the whole app speaks our status
vocabulary rather than any provider's.

The two rules an adapter must follow are in that file: map into **our**
vocabulary, and **fail closed**.
