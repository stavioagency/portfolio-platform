# Billing — setup and operations

Subscription billing for the Portfolio Platform, on **PayPal Subscriptions**.

This document is the operator's guide: what to set, where to click, and what to
do when something goes wrong. The reasoning behind the design lives in the code
comments — start with `supabase/functions/_shared/provider.ts` and
`supabase/sections/section-h-billing.sql`.

---

## 1. How it works in one page

Two plans, priced in `lib/billing-plans.js` and mirrored into PayPal as billing
plans. A customer approves a subscription **on paypal.com**; PayPal then charges
it on schedule, retries failures, and tells us what happened over webhooks.

```
  client dashboard ─┐
                    ├─→ /subscribe ─→ billing-checkout ─→ PayPal approval page
  owner's link ─────┘                                            │
                                                                 ▼
   subscriptions table ←── billing-webhook ←──── BILLING.SUBSCRIPTION.ACTIVATED
                                                 PAYMENT.SALE.COMPLETED, …
```

`/subscribe` takes these query parameters:

| Parameter | Door | Meaning |
|---|---|---|
| `plan` | 1 | plan code — `monthly` or `yearly` |
| `tenant` | 1 | the workspace being subscribed, a UUID |
| `t` | 2 | the owner-issued signed grant; carries plan *and* tenant |
| `lang` | both | `ar` or `en`. Overrides the stored preference; anything else is ignored and Arabic wins |
| `status` | — | set by the return/cancel URLs coming back from PayPal |

**There is no third door.** Without a grant, `billing-checkout` requires a real
session *and* admin rights on the named tenant, so a visitor who has never
signed in cannot start a checkout — by design. Public pricing links must point
at the marketing site, which captures the lead; the owner then creates the
workspace and sends a door-2 payment link.

`lang` exists because a visitor can arrive from the marketing site, which is a
different origin — nothing is stored there, so without it an English reader
lands on an Arabic payment page. It is also forwarded to PayPal as the approval
page's locale.

Three things follow from this, and they explain most of the code:

* **PayPal owns the schedule.** There is no renewal cron, no retry ladder and no
  stored card in this codebase. `payment_failure_threshold` on the PayPal plan
  *is* the retry policy.
* **The webhook is the only source of truth.** Coming back from PayPal means the
  customer approved it, not that it is active. The browser never reports a
  payment.
* **Entitlement is decided in Postgres**, by
  `tenant_has_active_subscription(tenant_id)`. `lib/billing-status.js` mirrors
  that rule for the UI; where they disagree, the database is right.

### Currency — read this before quoting anyone a price

**PayPal cannot charge SAR.** Its supported list is 24 currencies and the Saudi
riyal is not one of them.

So every plan carries two prices in `lib/billing-plans.js`:

| | |
|---|---|
| `DISPLAY_CURRENCY` = SAR | What customers are quoted, everywhere in the UI |
| `BILLING_CURRENCY` = USD | What PayPal actually debits |

They are two numbers **you** set. Nothing converts between them at runtime — an
FX lookup would make the charged amount drift daily. Keep them roughly in step
by hand, and note that checkout tells the customer both, which is deliberate:
being surprised by a USD figure on a statement is how a payment becomes a
dispute.

Current values: **12 SAR / 3.20 USD** monthly, **120 SAR / 32 USD** yearly.

> **Fee note.** PayPal's fixed per-transaction fee is a large share of a small
> charge — on ~3.20 USD it is most of the cost, on ~32 USD it is marginal. The
> annual plan is dramatically more efficient to collect. Worth steering toward.

---

## 2. Environment variables

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
| `PAYPAL_WEBHOOK_ID` | yes | from the webhook you create in step 3. Without it every webhook is rejected |
| `PAYPAL_ENV` | yes | `sandbox` or `live`. Also selects which `provider_plans` rows are used |
| `BILLING_GRANT_SECRET` | yes | ≥32 random chars; signs the owner's payment links. `openssl rand -base64 48` |
| `BILLING_RETURN_HOSTS` | yes | comma-separated allow-list of hosts a checkout may return to, e.g. `designakum.site,localhost`. **Empty means no checkout can start** — it fails closed |
| `BILLING_PROVIDER` | no | defaults to `paypal` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform.

---

## 3. PayPal setup

### 3.1 Sandbox (do this first)

1. <https://developer.paypal.com/dashboard/> → **Apps & Credentials** →
   *Sandbox* → **Create App** (type: Merchant).
2. Copy the **Client ID** and **Secret** into the Supabase secrets above with
   `PAYPAL_ENV=sandbox`.
3. **Sandbox → Accounts** gives you a test *business* and *personal* account.
   The personal one is what you pay with while testing.

### 3.2 The webhook

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

### 3.3 Create the plans

Sign in to `/admin` as a platform owner and run the plan sync (Subscribers →
plan tools), or call it directly:

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
PayPal plan is created and the old mapping is deactivated. **Existing
subscribers stay on the old plan and the old price** — that is PayPal's model;
moving them requires a revise plus a fresh approval from each customer.

---

## 4. Database

Apply once, in the Supabase SQL editor:

```
supabase/sections/section-h-billing.sql
```

It is additive and idempotent. It also grants every existing tenant a **comped**
subscription, so nobody who is already a client loses access the day billing
ships.

Verify immediately after (the queries are at the bottom of the file):

```sql
select count(*) as tenants,
       (select count(*) from public.subscriptions where status = 'comped') as comped
  from public.tenants;
```

Those two numbers must match. Then update `supabase/SCHEMA.sql` to describe the
new tables, per the convention in section 4 of `HANDOFF.md`.

---

## 5. Deploying the functions

```bash
# JWT-gated (default)
supabase functions deploy billing-subscription
supabase functions deploy billing-plans-sync

# NOT JWT-gated — both authenticate themselves, see the file headers
supabase functions deploy billing-checkout --no-verify-jwt
supabase functions deploy billing-webhook  --no-verify-jwt
```

`--no-verify-jwt` on those two is **required**, and it is not a weakening:

* `billing-checkout` serves the owner's payment link, whose recipient has no
  session at all. It verifies a signed grant or a real JWT itself.
* `billing-webhook` is called by PayPal, which has no Supabase token. It
  verifies PayPal's signature and refuses anything else.

Deploying `billing-checkout` *with* the gateway check breaks payment links and
nothing else — a quiet failure, which is why it is written at the top of the
file too.

---

## 6. Local development

```bash
npm run dev                      # the app, on :3000
supabase functions serve         # the functions, on :54321
```

Add `localhost` to `BILLING_RETURN_HOSTS`. PayPal cannot reach a laptop, so to
exercise webhooks either use a tunnel (`cloudflared tunnel --url
http://localhost:54321`) and point a **second sandbox webhook** at it, or use
the PayPal dashboard's **webhook simulator**.

Note that the simulator's payloads do not carry a real signature, so
verification rejects them. Test against a tunnel for anything that must prove
the verification path.

---

## 7. The test matrix

Run every row in sandbox before going live.

| # | Flow | How | Expect |
|---|---|---|---|
| 1 | New subscription | `/subscribe?plan=yearly&tenant=<id>` → approve | row goes `pending` → `active`; a `payments` row; an invoice |
| 1b | Checkout language | open a link with `?lang=en`, then one with `?lang=ar` | the page renders in that language regardless of what was stored; `?lang=fr` falls back to Arabic |
| 2 | Payment link | Subscribers → send link → open in a private window | same as 1, with no sign-in |
| 3 | Link tampering | edit `plan=` in a link URL | the grant's plan wins, not the URL's |
| 4 | Expired link | wait out the TTL, or corrupt the token | "this link is no longer valid" |
| 5 | Renewal | sandbox subscriptions bill on an accelerated clock | second `payments` row; period end moves |
| 6 | Upgrade | Billing → yearly → confirm | either applied, or an approval redirect; plan changes only after approval |
| 7 | Downgrade | Billing → monthly → confirm | same, effective next cycle |
| 8 | Cancel | Billing → cancel | `cancel_at_period_end` true; access continues to period end; PayPal shows cancelled |
| 9 | Failed payment | sandbox negative testing | status `past_due`, grace date set, banner counts days |
| 10 | Expiry after grace | move `grace_ends_at` into the past | `tenant_has_active_subscription` false |
| 11 | Webhook replay | re-send the same event from the dashboard | second delivery returns `duplicate: true`; no second payment row |
| 12 | Forged webhook | POST a payload with no signature | 401, nothing written |
| 13 | Refund | refund the sale in PayPal | payment `refunded`, access ends |
| 14 | Comped tenant | any existing workspace | stays entitled, no PayPal calls |

---

## 8. Going live

1. Create a **live** PayPal app; new client id, secret and webhook.
2. Set `PAYPAL_ENV=live` and swap the three secrets.
3. Re-run `billing-plans-sync` — live plan ids are different, and
   `provider_plans` keys on environment for exactly this reason.
4. Set `BILLING_RETURN_HOSTS` to the production host(s) only.
5. Rotate `BILLING_GRANT_SECRET` if it was ever used in a shared sandbox.
6. Run flows 1, 8 and 11 from the matrix against live with a real card, and
   refund yourself.

---

## 9. When something goes wrong

**Every webhook ever received is in `billing_events`**, verbatim, with
`processed_at` and `error`. That table is the first place to look.

```sql
-- what failed, and why
select received_at, event_type, error
  from billing_events
 where processed_at is null and error is not null
 order by received_at desc limit 20;
```

| Symptom | Cause | Fix |
|---|---|---|
| Every webhook 401s | `PAYPAL_WEBHOOK_ID` missing or from the other environment | set it, redeploy |
| `unknown_subscription_...` | the subscription exists at PayPal but not here — a failed write during checkout | insert the row, then replay the event from the PayPal dashboard |
| Checkout returns `invalid_redirect_url` | `BILLING_RETURN_HOSTS` unset or missing the host | set it; it fails closed on purpose |
| `plan_not_available` | plans never synced, or synced in the other environment | run `billing-plans-sync` |
| `grant_signing_failed` | `BILLING_GRANT_SECRET` missing or under 32 chars | set a long random one |
| Customer says cancelled, PayPal still billing | should be impossible — cancellation goes to PayPal first | check `billing_events` for the cancellation, cancel in PayPal directly, and treat it as a bug |

---

## 10. Adding another provider

The interface is `supabase/functions/_shared/provider.ts`. Write an adapter that
satisfies `BillingProvider`, add one line to the `PROVIDERS` registry, and set
`BILLING_PROVIDER`. No schema change and no UI change: `provider` and
`provider_*_id` columns already exist on every billing table, `provider_plans`
already maps plan codes per provider, and the whole app speaks our status
vocabulary rather than any provider's.

The two rules an adapter must follow are in that file: map into **our**
vocabulary, and **fail closed**.
