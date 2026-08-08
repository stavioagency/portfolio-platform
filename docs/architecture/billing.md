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

- **Every tenant that existed when billing shipped is `comped`** — entitled, no
  price, no renewal, no provider. Billing must never take a live client's site
  down.

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
It is additive and idempotent, and grants every existing tenant a **comped**
subscription. Six tables: `provider_plans`, `billing_customers`, `subscriptions`,
`payments`, `invoices`, `billing_events`. See
[database.md](database.md).

Verify immediately after (the queries are at the bottom of the file):

```sql
select count(*) as tenants,
       (select count(*) from public.subscriptions where status = 'comped') as comped
  from public.tenants;
```

Those two numbers must match.

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

1. Create a **live** PayPal app; new client id, secret and webhook.
2. Set `PAYPAL_ENV=live` and swap the three secrets.
3. Re-run `billing-plans-sync` — live plan ids differ, and `provider_plans` keys
   on environment for exactly this reason.
4. Set `BILLING_RETURN_HOSTS` to the production host(s) only.
5. Rotate `BILLING_GRANT_SECRET` if it was ever used in a shared sandbox.
6. Run matrix rows 1, 8 and 11 against live with a real card, and refund yourself.

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

## 11. Adding another provider

The interface is `supabase/functions/_shared/provider.ts`. Write an adapter
satisfying `BillingProvider`, add one line to the `PROVIDERS` registry, set
`BILLING_PROVIDER`. No schema change and no UI change: `provider` and
`provider_*_id` columns already exist on every billing table, `provider_plans`
already maps plan codes per provider, and the whole app speaks our status
vocabulary rather than any provider's.

The two rules an adapter must follow are in that file: map into **our**
vocabulary, and **fail closed**.
