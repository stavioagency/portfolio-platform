# Launch readiness — the checklist, the live checkout test, and health checks

## 0. The launch checklist

Sorted by what actually stops a launch. Everything here is explained in full
below or in the document named.

### BLOCKERS — do not accept a paying customer until these are done

| # | Item | Why it blocks |
|---|---|---|
| 1 | **Run the live checkout test** (§2) | The path from *customer pays* → *customer has access* has NEVER run. Both live subscription rows are `pending`; every entitled workspace is a comp. This is unproven, not merely untested. |

That is the whole blocker list. Everything below is a real gap, but none of it
stops the first customer from succeeding.

### IMPORTANT — before spending money on marketing

| # | Item | Why |
|---|---|---|
| 2 | **Failed-payment email** ([emails.md §4b](../architecture/emails.md)) | The one silence that directly costs money. `past_due` grants a grace period the customer is never told about, so they discover it as a lockout. The webhook already recognises `payment_failed`; only the sending is missing. |
| 3 | **Payment confirmation / receipt** | A charge with no receipt is a support ticket and a chargeback risk. |
| 4 | **Cancellation confirmation** | A cancellation the customer cannot see is a cancellation they will email about. |
| 5 | **Run the health checks** (§3) | Written, not automated. They only help if someone runs them. Five queries, about a minute. |
| 6 | **Re-brand the two signup emails** | Off-brand (`#4f6ef2`, no card) and they are the FIRST two emails a self-signup customer ever sees. Cheap, but it is a first impression. |

### LATER — fold into the UX redesign

| # | Item | Why it can wait |
|---|---|---|
| 7 | Show `environment` in the Subscribers list | An operator cannot currently distinguish a sandbox row from a live one. Now low-risk, since sandbox no longer entitles. |
| 8 | Plan-change / renewal notices | Nice to have; neither causes a lockout. |
| 9 | Automating the health checks on a schedule | Manual is fine at this size. |
| 10 | Non-destructive credentials re-send ([auth.md §7.1](../architecture/auth.md)) | `send_welcome` silently invalidates a working password. Real, but operator-only and already documented. |

**A note on sequencing the billing emails (2–4):** they are a *product* feature,
and the UX redesign will decide what the billing experience feels like.
Building them now risks building them twice. The exception is the
failed-payment email, which is a reliability concern rather than an
experience one and is worth doing regardless.

---

# Manual tasks, the live checkout test, and health checks

Written 2026-08-13, at the end of the stabilisation phase. Everything in the
codebase that stabilisation could fix is fixed and deployed. What remains is
work that **cannot be done from the repository**: a dashboard setting, a real
payment, and a few checks nobody has written yet.

Read this before declaring the platform open to customers.

---

## 1. Manual task: disable the sandbox webhook — ✅ DONE 2026-08-13

The sandbox webhook pointing at the production `billing-webhook` has been
**deleted by the owner**. Kept below because the reasoning explains what the
logs should now look like, and what it would mean if that changed.

**Verification available to us is corroborating, not proof:** no
`signature verification FAILED` line has appeared since. That is consistent
with the endpoint being gone — but it is equally consistent with no sandbox
event having been sent, so treat it as agreement rather than confirmation. The
authoritative check is the sandbox PayPal dashboard showing no webhook.

**What it means going forward:** a `signature verification FAILED` line is now
a real signal rather than expected noise. If one appears it is a LIVE webhook
failing to verify, which is a genuine incident — see billing.md §10
troubleshooting, most likely `PAYPAL_WEBHOOK_ID` no longer matching the live
app.

---

## 1b. Why it was done (original note)

**Was: NOT DONE. Owner action, PayPal dashboard, ~2 minutes.**

`PAYPAL_ENV` is `live`, so sandbox events reaching the production endpoint are
already rejected — verification posts them to the live API against the live
webhook id, which cannot validate a sandbox signature (architecture/billing.md
§10d). They fail closed and nothing is written.

So this is not a security hole; it is noise removal. Rejecting events is worse
than not receiving them: every sandbox delivery burns an Edge Function
invocation, writes a scary `signature verification FAILED` line to the logs, and
trains whoever reads those logs to ignore the one message that would matter if
a *live* webhook ever started failing.

**Do:** sandbox PayPal dashboard → Apps & Credentials → the sandbox app →
Webhooks → deactivate or delete the endpoint pointing at
`.../functions/v1/billing-webhook`.

**Do NOT** touch the live webhook, and do not rotate any secret while doing it.
`PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and
`PAYPAL_WEBHOOK_ID` are an atomic set — a half-changed set means every API call
or every webhook fails.

**Verify afterwards:** no new `signature verification FAILED` lines appear.

---

## 2. The live checkout test — THE last unknown in the money flow

**Status: NOT RUN. Needs owner approval and a real payment method.**

No subscription has ever completed in production. The two live rows
(`onecenttest`, `ggghsj`) are both `pending`, meaning checkout started and
nothing came back. Every entitled workspace today is a comp. **The path from
"customer pays" to "customer has access" has never once run end to end.**

That is the single largest risk remaining, and no amount of code reading
retires it — the webhook signature, the plan mapping, the ACTIVATED handler and
the entitlement flip can only be proven by one real payment.

### Before you start

- A **real payment method**, and a **plan that costs little** — the
  `onecenttest` workspace name suggests a minimal-price plan already exists.
  Check `provider_plans` where `environment = 'live'` for what is actually
  sellable.
- A **throwaway email** you control, for a clean self-signup.
- Do it at a **quiet time** and expect to babysit it for ~15 minutes.
- **Have this document open**, so cleanup is decided before it is needed.

### The flow, and what to assert at each step

| # | Step | Assert |
|---|---|---|
| 1 | Sign up at `/signup` with the throwaway email | verification mail arrives (Resend); tenant created `status='disabled'`, `created_via='self_signup'`, no subscription row |
| 2 | Verify the email, sign in | `SetPasswordGate` behaves; dashboard loads; **saving is refused** (unentitled — this is section K working) |
| 3 | Billing tab → checkout | `billing-checkout` returns an approve URL; subscription row appears `status='pending'`, **`environment='live'`** |
| 4 | Complete payment at PayPal | you are returned to `/subscribe` |
| 5 | **Webhook** | `billing_events` gains a row; **no** `signature verification FAILED` in logs |
| 6 | **Subscription row** | `status='active'`, `current_period_end` set, `provider_subscription_id` populated, `environment='live'` |
| 7 | **Entitlement** | `select public.tenant_has_active_subscription('<tenant>')` → **true** |
| 8 | **Tenant status** | flipped `disabled` → `active` by the ACTIVATED webhook |
| 9 | **Dashboard access** | editing and **saving** now succeed — the write that failed at step 2 |
| 10 | Cancellation | cancel from the Billing tab; PayPal confirms first, webhook writes the row; access persists to `current_period_end` (`canceled` + future period end still entitles — by design) |

Step 9 is the real acceptance criterion. Steps 2 and 9 are the same action
either side of a payment, and the difference between them *is* the product.

### The one query to watch throughout

Run this after every step. It is the whole test in one row, and it is the
fastest way to see which step actually moved something:

```sql
select t.slug, t.status as tenant_status, t.created_via,
       s.status as sub_status, s.environment, s.provider_subscription_id,
       s.current_period_end,
       public.tenant_has_active_subscription(t.id) as entitled
from public.tenants t
left join public.subscriptions s on s.tenant_id = t.id
where t.slug = '<your test slug>';
```

**What success looks like, as a single before/after:**

| | after step 2 (signed up, unpaid) | after step 6 (paid) |
|---|---|---|
| `tenant_status` | `disabled` | **`active`** |
| `sub_status` | *(no row)* | **`active`** |
| `environment` | — | **`live`** |
| `provider_subscription_id` | — | **`I-…`** |
| `entitled` | `false` | **`true`** |
| saving in the dashboard | **refused** | **works** |

If `entitled` is true but saving still fails, the problem is section K / RLS,
not billing. If `sub_status` reaches `active` but `tenant_status` stays
`disabled`, the ACTIVATED webhook ran partially — capture the row and stop.

Also watch, in the same window:

```sql
select received_at, provider, event_type
from public.billing_events order by received_at desc limit 10;
```

and the function logs for `billing-webhook`. A **`signature verification
FAILED`** line during this test is now unambiguous — the sandbox webhook is
gone, so it can only be the live webhook failing, and the test should stop
until that is understood.

### If it fails

Consult architecture/billing.md §10 troubleshooting first. The likely failures,
in order: `plan_not_available` (live plans never synced — run
`billing-plans-sync`), every webhook 401 (`PAYPAL_WEBHOOK_ID` from the wrong
environment), or a `pending` row that never advances (the webhook never
arrived — check the endpoint URL registered at PayPal).

**Rollback / cleanup plan — decide before starting:**

- **Refund** through the PayPal dashboard. This is a real charge to a real card.
- **Cancel** the subscription at PayPal so it does not renew. Do this even if
  you refund; a refund is not a cancellation.
- **The workspace**: leave it, or delete it — but a tenant delete **cascades
  payments, invoices and billing_customers with no archive**. For the first
  real transaction the platform has ever processed, keeping the record is
  probably worth more than a tidy tenant list. Prefer expiring the subscription
  and leaving the tenant.
- **Do not** hand-edit the subscription row to "fix" a failed test. The row is
  evidence of what actually happened; fix forward instead
  (billing.md §9's rule).

---

## 3. Health checks — the smallest set worth having

Every check below exists because a **real defect got through**, not because it
seemed prudent. Each is one SQL query or one HTTP call. This is deliberately not
a monitoring system; it is a handful of assertions someone can run in a minute,
or wire to a weekly cron later.

### Check 1 — password reset actually mints tokens  *(highest value)*

```sql
select count(*) as tokens_last_7d
from public.password_reset_tokens
where created_at > now() - interval '7 days';
```

**Why:** this exact table sat at **zero rows since launch** while the endpoint
returned `{ok:true}` and everything looked healthy. Zero rows alongside any
support contact about a missing reset mail is the signal — the code returned
before it ever tried to send. It distinguishes a *lookup* failure from a *mail*
failure instantly, which is the distinction that cost two weeks.

**Alert when:** a customer reports a missing reset AND this is 0.

### Check 2 — no sandbox row is entitling

```sql
select t.slug, s.status, s.environment
from public.subscriptions s join public.tenants t on t.id = s.tenant_id
where s.environment = 'sandbox'
  and public.tenant_has_active_subscription(t.id);
```

**Why:** this is exactly the hole section-o closed. **Must return zero rows.**
Any row means the predicate was removed or a sandbox subscription was created
against production.

### Check 3 — comps are still entitled  *(the section-o tripwire)*

```sql
select count(*) as comps_not_entitled
from public.subscriptions s
where s.status = 'comped'
  and not public.tenant_has_active_subscription(s.tenant_id);
```

**Why:** the failure mode of "tidying" the predicate to `environment = 'live'`
is that all seven comps lose access silently — including both owner
workspaces. **Must be 0.** This is the cheapest possible guard on the most
dangerous single line in the schema.

### Check 4 — entitled workspaces that cannot save

```sql
select t.slug, t.status, s.status as sub_status
from public.tenants t left join public.subscriptions s on s.tenant_id = t.id
where s.id is null and t.created_via = 'owner';
```

**Why:** an owner-invited client with no subscription row can sign in and read
but never save — the defect `grant_comp` exists to prevent. Any row here is a
client who needs a comp granted.

### Check 5 — deployment drift

Not SQL. Fetch each deployed function's bundle and diff it against the repo, the
way `workflows/deployment.md` describes. **Why:** a hand-typed paraphrase of
`signup-start` once reached production, and `billing-subscription` carried a
stale `_shared/billing-db.ts` for weeks. Now that the CLI deploys from disk this
is far less likely — run it after each deploy rather than on a schedule.

### Deliberately NOT recommended

- Uptime/latency monitoring — Supabase and Vercel already provide it.
- Alerting on webhook verification failures — these are *expected* until the
  sandbox webhook is disabled (§1). Turn this on afterwards, when a failure
  would genuinely mean something.
- Anything requiring a new table, service or dependency.
