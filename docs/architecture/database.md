# Architecture — database

Supabase project **`gphrzvjlstznhypcfgre`**, region ap-northeast-1.

> **`supabase/SCHEMA.sql` is the authority.** It documents every table, foreign
> key, function, policy and index, and why each exists — read back OUT of the
> live database, so it is what exists rather than what someone intended. It is
> **documentation, not a migration**: never run it.
>
> This file is orientation only. It tells you what each group of tables is *for*
> and how they relate, so you know which part of SCHEMA.sql to open.

---

## 1. The model in one paragraph

A **tenant** is one client's website. Every content row (`profile`, `projects`,
`tenant_domains`, `analytics_events`) carries `tenant_id` and cascades when the
tenant is deleted. Who may edit a tenant is `tenant_admins`. Who runs the whole
platform is `platform_owners`. Public **reads are wide open by design** — a
portfolio is public. Every **write** goes through `is_tenant_admin()`, which is
true for a tenant's own admins AND for any platform owner. Login accepts a
username, resolved to an email by `get_email_for_username`.

---

## 2. Tables by purpose

### Identity and access

| Table | Purpose |
|---|---|
| `auth.users` | Supabase Auth. The **only** password authority — no hash lives anywhere in `public`. |
| `admin_usernames` | username → auth user. PK `(username)`. Powers username login. |
| `tenant_admins` | who may edit which tenant. PK `(tenant_id, user_id)`. |
| `platform_owners` | the operator accounts. |

**`tenant_admins.role` is descriptive only.** No policy or function reads it;
`'owner'` and `'client'` confer identical access *to that one tenant*.
Administering **every** tenant comes from `platform_owners`, not from this
column. A partial unique index on `tenant_admins(user_id) WHERE role = 'owner'`
was designed, checked, and found unbuildable for exactly this reason — platform
owners hold that role on every tenant.

### Tenancy and content

| Table | Purpose |
|---|---|
| `tenants` | one row per client website. `slug` unique; `status` `'active' \| 'disabled'` (disabled makes the public site 404); `default_lang`; `created_via` `'owner' \| 'self_signup'`; `handed_over_at`. |
| `tenant_domains` | custom domains. At most one primary per tenant. |
| `profile` | one row per tenant. All content is JSONB `{ar, en}`. |
| `projects` | portfolio items; `display_order` drives ordering. |
| `analytics_events` | `page_view \| project_view \| link_click`, CHECK-constrained. |

`handed_over_at` is **operator state**: NULL means the workspace exists but the
admin has not confirmed the client received their credentials, which is what puts
it in the Pending handover queue. It does not affect public site resolution.
Self-signups are stamped `handed_over_at = now()` at creation, because there are
no credentials to hand over and they would otherwise sit in that queue forever.

### Password reset

| Table | Purpose |
|---|---|
| `password_reset_tokens` | one row per issued reset link. Stores the token **hash**, `expires_at`, `used_at`, `user_id`. |

Single-use is enforced by a conditional UPDATE (`WHERE used_at IS NULL AND
expires_at > now()`) using the database's clock, not the function's. See
[auth.md §4](auth.md#4-password-reset-self-serve).

### Billing

Six tables, all from `supabase/sections/section-h-billing.sql`:

| Table | Purpose |
|---|---|
| `provider_plans` | plan code → provider plan id, **keyed by environment** so sandbox and live cannot charge against each other's ids |
| `billing_customers` | tenant → provider customer |
| `subscriptions` | one per tenant. `status`, `current_period_end`, `cancel_at_period_end`, `canceled_at`, `grace_ends_at`, `trial_ends_at` |
| `payments` | one per charge |
| `invoices` | issued documents |
| `billing_events` | **every webhook ever received, verbatim**, with `processed_at` and `error` |

**No INSERT or UPDATE policy exists on any of them — reads only.** Every write is
an Edge Function using the service role.

**Idempotency is two unique constraints, not logic:**
`billing_events (provider, provider_event_id)` and
`payments (provider, provider_payment_id)`.

---

## 3. Functions that policies depend on

| Function | Role |
|---|---|
| `is_tenant_admin(tid)` | **gates every write policy.** True for the tenant's own admins and for any platform owner. |
| `is_platform_owner()` | operator check; Edge Functions re-check it against the caller's own JWT. |
| `tenant_has_active_subscription(tenant_id)` | **the entitlement rule.** `lib/billing-status.js` mirrors it for the UI; where they disagree, the database is right. |
| `get_email_for_username(username)` | username → email at sign-in. Must stay anon-callable. |
| `list_workspace_members()` | owner-gated; returns empty to everyone else. |
| `enroll_platform_owners()` | AFTER INSERT trigger on `tenants`. |

`list_workspace_members()` exists because `admin_usernames`, `platform_owners`
and `tenant_admins` are **own-row-only reads** — owners cannot otherwise join a
workspace to the client who owns it.

---

## 4. Rules for changing the schema

1. Write a new file in `supabase/sections/`.
2. Make it **idempotent** (`IF NOT EXISTS`, `CREATE OR REPLACE`, guarded drops)
   and put a VERIFY block at the bottom.
3. Apply it by hand in the Supabase SQL editor, **before** pushing the code that
   depends on it.
4. Update `supabase/SCHEMA.sql` to match.

**Never run anything in `supabase/history/`.** Those scripts are superseded and
some are actively wrong for this database — most dangerously a single-tenant
`CHECK (id = 1)` constraint that multi-tenancy required removing. Every file
carries a do-not-run banner. Copying a table definition out of one silently
reintroduces single-tenant assumptions.

Verifying RLS behaviour is best done in a **rolled-back transaction** that sets
`request.jwt.claims` to a specific user and `set local role authenticated` — that
exercises the real policies without writing anything.

---

## 5. Legacy and drift, so you do not "fix" it by accident

- `profile.links` (JSONB) predates `custom_links`. It is written but never
  rendered; one row still holds data.
- `profile.id` (integer PK) is a single-tenant leftover. The old
  `CHECK (id = 1)` is **gone**; `tenant_id` is the real key.
- `projects.full_description` is populated on 8 rows; the public page renders
  `description`.
- `analytics_events.country` exists but is never populated.
- `tenant_domains.status` is set by hand and drifts from reality.
- **`SCHEMA.sql` is behind by two applied migrations** — it does not yet describe
  sections H (billing) or I (signup). See
  [features/planned.md](../features/planned.md).
