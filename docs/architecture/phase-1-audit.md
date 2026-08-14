# Phase 1 — architecture audit

**What the system actually does today**, established by reading the code and
querying production read-only on 2026-08-14. Written before any Phase 1 UI work,
so the redesign is built against reality rather than against the plan.

Authority for what *should* be true: [overview.md](overview.md),
[billing.md](billing.md), [database.md](database.md). Where this document and
those disagree, this one is the newer measurement and the disagreement is
recorded here rather than silently corrected.

---

## 1. The journey, stage by stage

Each row is: where the state lives, the field that carries it, and the code that
enforces it.

| # | Stage | State lives in | Field | Enforced by |
|---|---|---|---|---|
| 1 | Visitor | — | — | — |
| 2 | Signup submitted | `auth.users`, unconfirmed | `email_confirmed_at IS NULL`; `user_metadata.pending_slug`, `pending_workspace_name`, `lang`, `pending_plan` | `signup-start` (Edge, `--no-verify-jwt`). Validates via `slugError()`; always answers `{ok:true}` so the endpoint cannot enumerate accounts |
| 3 | Verification link | A signed HMAC token, 24h, deliberately reusable | token claims `u`/`k`/`e`; no DB row | `_shared/signup-token.ts` → `verifyVerificationToken()` |
| 4 | Workspace created | `tenants` + `tenant_admins` + `admin_usernames` + empty `profile` | `tenants.status='disabled'`, `created_via='self_signup'`, `handed_over_at=now()`; `tenant_admins.self_signup=true` | `signup-verify` (service role). Idempotent — the token is reusable, so it *will* run twice |
| 5 | Password owed (invited clients) | auth user metadata | `user_metadata.must_set_password` | `SetPasswordGate` in `admin.js` |
| 6 | Dashboard access | session + membership | `tenant_admins(tenant_id, user_id)` | `is_tenant_admin()` — **has no billing component, deliberately**, or a lapsed customer could not reach Billing to resubscribe |
| 7 | Portfolio creation | `profile`, `projects` rows | `profile.tenant_id`, `projects.tenant_id` | **RLS `can_edit_tenant()` = `is_platform_owner() OR (is_tenant_admin() AND tenant_has_active_subscription())`** |
| 8 | Preview | none — an iframe of the **real public route** | `/{slug}?preview=1` | `resolveTenant()`. `?preview=1` only suppresses analytics and `localStorage`; it does **not** bypass any gate |
| 9 | Payment | `subscriptions` | `status`, `current_period_end`, `grace_ends_at`, `environment`, `plan_code` | `billing-checkout` (signed grant or JWT); `billing-webhook` is the **only** thing that may activate |
| 10 | Publishing | **nothing — there is no publish state** | — | implicit; see §2 |
| 11 | Public portfolio | `profile`, `projects` | — | `resolveTenant()` two gates, then `hasPublicContent()` chooses "setup needed" vs render |

### The two gates on rendering

`lib/tenant.js` → `resolveTenant()`:

1. `tenants.status !== 'disabled'` — the **operator's** axis. Manual, durable,
   and billing never writes it.
2. `tenant_has_active_subscription(tid)` over RPC — **entitlement**, evaluated
   live at page load. Fails **open** on an RPC error, by design: failing closed
   would darken every client site on one bad response.

Both must pass. `resolveTenantByHost()` applies gate 1 only — it answers *who
owns this host*, not *may this render*.

---

## 2. Findings that matter for Phase 1

### F1 — There is no publish state. Publishing is a side effect.

Nothing in the schema represents "published". A portfolio becomes public the
instant both gates in §1 happen to pass, and private again the instant one stops.
There is no draft, no "publish" action, no `published_at`, and therefore no
moment a user chooses. The word "publish" does not exist in the data model.

### F2 — The paywall is at CONTENT CREATION, not at publishing.

This is the single most important finding, and it contradicts the locked
business model.

```
profile          ALL  USING can_edit_tenant(tenant_id)  WITH CHECK same
projects         ALL  USING can_edit_tenant(tenant_id)  WITH CHECK same
tenant_domains   ALL  USING can_edit_tenant(tenant_id)  WITH CHECK same
```

and `can_edit_tenant()` includes `tenant_has_active_subscription()`. So **an
unpaid self-signup user cannot write anything at all** — not a profile field, not
a project, not an upload. Media writes are gated the same way through
`can_write_media()`.

The locked model requires the opposite: free users create content, upload
projects, edit their profile, and preview privately; only publishing is paid.

Moving the paywall is therefore **an RLS change**, not a UI change. It is the
gating item for the whole free tier and it is out of scope for this phase under
the standing safety rules — recommended, not implemented, in
[publishing-boundary.md](publishing-boundary.md).

### F3 — "Preview privately" does not currently exist.

The admin's live preview is an iframe of the real public page, and
`resolveTenant()` applies the entitlement gate to it like any other visitor. An
unpaid tenant previewing their own portfolio gets **the 404 screen**. Under the
locked model, private preview is a free-tier feature, so this needs its own
answer — it is not a side effect of fixing F2.

The `?preview=1` flag exists but does something unrelated: it suppresses
analytics and `localStorage` writes, because the preview shares an origin with
the admin.

### F4 — A client cannot change their own `tenants` row.

```
tenants  UPDATE  USING is_platform_owner()  WITH CHECK is_platform_owner()
```

So if publish state lands on `tenants`, a client toggling it needs either a new
policy or an Edge Function. This shapes the design in §2 of the boundary
document and is easy to miss.

### F5 — `tenants.status='disabled'` is doing two jobs.

`billing.md` states the column is the operator's decision and billing never
writes it. True — but `signup-verify` creates every self-signup workspace with
`status='disabled'`, which means the column currently reads as both "an operator
suspended this" and "this signup has not paid". Those want to be different
states the moment a free tier exists.

### F6 — `lib/tenant.js`'s file header is badly stale.

The top of the file says it is "FOUNDATION ONLY", "changes NO live behavior", is
"intentionally NOT wired into the public page or admin yet", and that "the DB is
still single-tenant" with `CHECK (id = 1)`. Every one of those is false: it is
the live resolver on every public request, and the constraint is gone. The rest
of the same file is accurate and current. A reader who stops at the header will
believe the resolver is dead code. Documentation only — no behaviour change.

---

## 3. Billing reality, measured

Read-only against `gphrzvjlstznhypcfgre`, 2026-08-14.

### Entitlement, exactly

```sql
tenant_has_active_subscription(tid) :=
  exists (select 1 from subscriptions s
           where s.tenant_id = tid
             and s.environment is distinct from 'sandbox'   -- NULL-safe: comps
             and ( s.status = 'comped'
                or (s.status in ('active','trialing')
                    and (s.current_period_end is null or s.current_period_end > now()))
                or (s.status = 'past_due'  and s.grace_ends_at     > now())
                or (s.status = 'canceled'  and s.current_period_end > now()) ))
```

`environment is distinct from 'sandbox'` is NULL-safe on purpose — comps carry
`environment IS NULL`, and `= 'live'` would revoke all of them.

### The population

| Tenant status | created_via | Subscription | env | n | entitled |
|---|---|---|---|---|---|
| active | owner | `comped` | NULL | 7 | **7** |
| active | owner | `pending` (monthly) | live | 1 | 0 |
| active | owner | `pending` (test) | live | 1 | 0 |
| active | self_signup | `expired` (yearly) | sandbox | 2 | 0 |
| disabled | self_signup | *(no row)* | — | 3 | 0 |

Totals: **14 tenants, 11 subscription rows, 7 entitled, 7 publicly renderable.**
No tenant has more than one subscription row.

Three things to read off that table:

- **Every entitled tenant is a comp.** Zero revenue-bearing subscriptions are
  active. `self_signup_entitled = 0` — no self-serve customer has ever been
  entitled, so the paid path has never completed end-to-end in production.
- **Sandbox is excluded, and two self-signup tenants sit behind it.** Consistent
  with the known "PayPal env is sandbox-only" position: going live is a data
  migration, not a toggle.
- **Two owner tenants are `active` but not entitled** (`pending`, never
  activated), so their public sites currently 404. One is `plan_code='test'` and
  is probably deliberate; the other is `monthly` and may not be. **Flagged for
  the operator to confirm — not touched.**

### The state machine

`lib/billing-status.js` mirrors the SQL for the UI and is unit-tested against it.
Its nine states are the complete set: `none`, `pending`, `trialing`, `active`,
`past_due`, `canceling`, `canceled`, `expired`, `comped`. Where the mirror and
the database disagree, the database is right and the disagreement is the bug.

### User classes as they exist today

| Class | Shape | Can edit? | Site renders? |
|---|---|---|---|
| Owner / operator | row in `platform_owners` | yes, every tenant | n/a |
| Comped client | `status='comped'`, no provider, no price | yes | yes |
| Paying client | `active`/`trialing`/`past_due` in grace/`canceled` before period end | yes | yes |
| Lapsed client | subscription exists, entitlement false | **no** | no |
| **Free signup** | no subscription row | **no** | no |

The last row is the one the locked model is about, and today it is
indistinguishable from "lapsed": both are simply *not entitled*, and both are
locked out of their own dashboard's write path.
