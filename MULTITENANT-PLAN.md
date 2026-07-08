# Multi-Tenant Plan — Portfolio Platform

> Status: **PLAN ONLY. No database changes have been applied.** This document +
> `supabase-multitenant.sql` describe the intended multi-tenant model. The SQL is
> reviewed but **not executed**.

## The core rule

**One Supabase project holds many tenants (clients).** We do **not** create a new
Supabase project per client — that hits Supabase project limits and cost. Every
future client is added as a **tenant row inside the same database**.

## Chosen database

- **Main DB:** the **f9designer Portfolio Platform** Supabase project, under the
  accessible **`stavio.agency@gmail.com`** account. This is the long-term Portfolio
  Platform database for now.
- The older **`designakum@gmail.com`** Supabase project is **not** the long-term
  source of truth. Its Designakum data may need to be **manually copied/seeded**
  into the main DB later (see "Designakum data" below).

## Tenants at launch

| Tenant (slug) | What it is | Domains |
|---|---|---|
| `f9designer` | Demo customer / partner personal portfolio | `f9designer.site` (primary), `www.f9designer.site` |
| `designakum` | Official Designakum business portfolio | `designakum.vercel.com` (primary) |

Future clients are added the same way: **a `tenants` row + their domain(s) + an
admin mapping** — never a new Supabase project.

## How tenants are resolved (public site)

1. **By host/domain first** — the request `Host` is looked up in `tenant_domains`.
   A custom domain is an unambiguous, owner-configured signal.
2. **By slug fallback** — `/f9designer`, `/designakum`, `/demo-client` always work,
   even before (or without) a custom domain.
3. **Default tenant for bare `/`** — so the current live site never 404s during the
   transition.

> Public/host resolution is **read-only** and is **never** used to authorize admin
> writes. Admin edit rights come only from `tenant_admins` (+ `is_tenant_admin()` RLS).
> A spoofed Host header must never grant write access.

## Custom domains

- Stored in **`tenant_domains`** (a tenant may have many: apex, `www`, `.vercel.app`,
  future custom domains). One `is_primary` per tenant = the canonical host.
- Slug URLs remain the **fallback** and keep working whether or not a domain is
  connected.
- Adding a client domain later = **DNS + Vercel domain add + one `tenant_domains`
  row** — no code change, no redeploy.

## Schema summary (see `supabase-multitenant.sql`)

New tables: `tenants`, `tenant_domains`, `tenant_admins`.
New columns: `tenant_id` on `profile`, `projects`, `analytics_events`.
New function: `is_tenant_admin(tenant_id)`.

The SQL is split into three clearly-labeled sections:
- **A — Safe / additive:** new tables, function, nullable `tenant_id` columns. Breaks
  nothing; changes no app behavior.
- **B — Seed / backfill:** create the two tenants, seed their domains, assign all
  existing data to `f9designer`, map current admin(s). Review the ownership
  assumption first.
- **C — Dangerous / staged:** remove the single-profile lock, enforce NOT NULL/FKs,
  and swap RLS from `is_admin()` → `is_tenant_admin()`. **Backup first**, verify on a
  dummy tenant, and **drop the old policies last**.

### The biggest risk to know about

`profile` currently has `CONSTRAINT single_profile CHECK (id = 1)` **and** the app
still writes `upsert({ id: 1, ... })`. That CHECK physically blocks a second tenant's
profile. Dropping it (SQL section C1) must **not** happen until the app no longer
depends on `id = 1` (a later code batch) — otherwise the live admin "Save" breaks.

## Designakum data

The official Designakum content presently lives in the old `designakum@gmail.com`
Supabase project. Bringing it into the main DB is a **later, manual** step (export
its profile/projects/images, insert under the `designakum` tenant). Until then, the
`designakum` tenant exists but is **empty**.

## Known landmines before tenant #2

Do NOT onboard a second tenant until these are resolved. Each one is currently
safe only because the app is effectively single-tenant.

1. **`single_profile CHECK (id = 1)` stays until the code stops assuming id 1.**
   Don't drop it while any admin read/write still uses `id: 1`, `.eq('id', 1)`, or
   `upsert({ id: 1 })`. Dropping it early breaks the live admin "Save".
2. **Admin reads/writes still need tenant scoping** across Profile, Card, Projects,
   Links, Appearance, Analytics, and Account (all still key off the singleton profile).
3. **Storage upload paths are still flat** (`profile-…`, `og-…`, `project-…`). They
   need `{tenant_id}/` prefixes before real multi-tenant use, or files collide.
4. **Analytics inserts/reads still lack `tenant_id`.** Until added, per-tenant stats
   are mixed/untrustworthy.
5. **Admin auth/session has no user→tenant mapping yet.** Logins must resolve the
   tenant via `tenant_admins` before writes can be trusted.
6. **Section C of `supabase-multitenant.sql` must stay gated** (constraint drop +
   NOT NULL/FKs + RLS swap) until the app code above is ready and verified.
7. **Before adding tenant #2, verify on a dummy tenant** that reset/delete, upload,
   and save operations affect ONLY that tenant — never global.

> Note: the worst of these — the global-delete in `deletePortfolio` — was defused
> in commit `a2b00a8` (scoped to the active tenant; singleton behavior unchanged).

## What has NOT been done

- No SQL executed. No Supabase change. No Vercel change. No env change.
- No app code touched; no UI changed; no dependency added.
- Nothing deployed.

Next batches (code/SQL authored before any live change): tenant resolver helper →
tenant-aware public reads → slug routing → host/domain resolution → admin scoping →
tenant storage paths → then apply the migration (with backup) and onboard tenants.
