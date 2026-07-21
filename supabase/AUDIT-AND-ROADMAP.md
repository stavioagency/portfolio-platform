# Portfolio Platform — Multi-Tenant Audit & Production Roadmap

> Audited against the **live** Supabase project `gphrzvjlstznhypcfgre`
> ("stavioagency's Project" = Portfolio Platform production) via read-only queries.
> The other project on the account, `jswxevbghmbqumlccpfy` ("Finance App" = Financial
> Manager), was **not** touched. No writes were made to any database during this audit.

---

## PHASE 1 — DATABASE AUDIT REPORT

### Current architecture (verified)
- **Tables** (all with RLS enabled): `profile`, `projects`, `analytics_events`,
  `admin_usernames`, `tenants`, `tenant_admins`, `tenant_domains`.
- **profile**: `id INTEGER PK DEFAULT 1`, `CONSTRAINT single_profile CHECK (id = 1)`
  **still present**; `tenant_id UUID` nullable. **1** profile row (belongs to f9designer).
- **Sections A + B are applied**: tenant tables exist, `tenant_id` columns exist and are
  **fully backfilled** (0 null tenant_id across profile/projects/analytics_events).
- **Section C is NOT applied**: `single_profile` intact, `id` not auto-generating, RLS
  still `is_admin()` (not tenant-scoped).
- **Functions** (all SECURITY DEFINER): `is_admin()`, `is_tenant_admin(uuid)`,
  `get_email_for_username(text)`. `assign_tenant_admin` **does not exist yet**.
- **Storage**: one **public** bucket `media`, **135** objects. Policies: public SELECT
  (view+list), admin INSERT/UPDATE/DELETE via `is_admin()`. **Not tenant-scoped.**

### Data state
| tenant | status | admins | domains | projects | profile |
|---|---|---|---|---|---|
| f9designer (demo) | active | 2 | 2 | 8 | ✅ (id=1) |
| designakum (official) | active | 1 | 0 | 0 | ❌ none |

- `admin_usernames`: **2** users total; both are the owner's accounts. The designakum
  admin **also** administers f9designer (0 designakum-only admins) → **no external client
  has a login yet**.

### RLS policies (verified)
| table | policy | cmd | rule |
|---|---|---|---|
| profile | Public can read profile | SELECT | `true` |
| profile | Admins can write profile | ALL | `is_admin()` — **not tenant-scoped** |
| projects | Public can read projects | SELECT | `true` |
| projects | Admins can write projects | ALL | `is_admin()` — **not tenant-scoped** |
| analytics_events | Anyone can log event | INSERT | `true` (public logging) |
| analytics_events | Admins can read events | SELECT | `is_admin()` — **not tenant-scoped** |
| tenants | Public can read tenants | SELECT | `true` — **no write policy** |
| tenant_domains | Public can read tenant_domains | SELECT | `true` — **no write policy** |
| tenant_admins | tenant_admins_select_own | SELECT | `user_id = auth.uid()` ✅ |
| admin_usernames | *(none)* | — | RLS on, no policy (definer-only access) |

### Grants (verified)
- `anon` **and** `authenticated` hold **ALL** privileges (SELECT/INSERT/UPDATE/DELETE/
  TRUNCATE/TRIGGER/REFERENCES) on `profile`, `projects`, `analytics_events`, `tenants`,
  `tenant_domains`. Only RLS prevents misuse.
- `tenant_admins`: `authenticated` has **SELECT only** (correct).

### Security advisors (Supabase linter)
- WARN — `media` public bucket allows listing (broad SELECT).
- WARN — `is_admin()` / `is_tenant_admin()` / `get_email_for_username()` executable by
  `anon` (SECURITY DEFINER via RPC). `get_email_for_username` is intentional (login);
  the other two should have `anon` EXECUTE revoked.
- WARN — auth leaked-password protection disabled (enable in dashboard).
- INFO — `admin_usernames` RLS-enabled-no-policy (acceptable; definer-only access).

### Multi-tenant readiness: **~70%**
- **Working:** tenant tables + backfill; public resolver (host/slug/www) with disabled-
  tenant blocking; admin selector + per-tenant scoping in the app; tenant-isolated storage
  paths in the app; own-mapping reads (`tenant_admins_select_own`).
- **Blocked:** second profile (single_profile); tenant/domain/admin **writes** (no RLS
  write policies); DB-level tenant isolation (still `is_admin()`); `assign_tenant_admin`.

### Security risks
1. **No DB-level tenant isolation** — `is_admin()` lets ANY admin write ANY tenant's
   profile/projects and read any analytics. **Latent only today** (no external client
   login), but it **must** be fixed before the first client login.
2. **Storage not tenant-scoped** — any admin can upload/delete any tenant's media.
3. **Broad `anon`/`authenticated` table grants** — RLS is the sole guard; a future
   permissive policy or RLS toggle would expose data. Over-provisioned.

### Production risks
- Applying Section C is **irreversible** (drops a constraint, converts the PK) → backup
  first, run staged, verify between steps.
- Dropping the old `is_admin()` policies before the new ones are verified could lock
  admins out of writes.

---

## PHASE 2 — CODE / DATABASE COMPATIBILITY REPORT

| Question | Code | Database | Verdict |
|---|---|---|---|
| Users can have multiple tenants | ✅ `tenant_admins` loader | ✅ `select_own` policy + grant | **OK** |
| Admins can switch tenants | ✅ selector + persistence | n/a | **OK** |
| Reads scoped by tenant | ✅ all editors + resolver | ⚠️ RLS not scoped (app-only) | **App yes, DB no** |
| Writes scoped by tenant | ✅ `persistProfile`/inserts | ❌ `is_admin()` allows all | **DB gap** |
| Analytics scoped | ✅ `.eq('tenant_id')` | ⚠️ `is_admin()` read | **App yes, DB no** |
| Profile depends on id=1 | ✅ only as gated fallback | ❌ `single_profile` still enforces it | **DB blocker** |
| Multiple profiles possible | ✅ code ready (insert by tenant) | ❌ blocked by `single_profile` | **DB blocker** |
| Projects tenant-isolated | ✅ insert stamps tenant_id | ⚠️ RLS not scoped | **App yes, DB no** |
| Domains attachable | ✅ add/remove UI | ❌ no write policy | **DB blocker** |
| Uploads tenant-isolated | ✅ `t-<id>/` paths | ⚠️ storage RLS not scoped | **App yes, DB no** |
| DB security matches app | — | ❌ | **Mismatch — DB behind** |

**Remaining singleton assumptions in code:** all are gated fallbacks (reachable only when
no tenant resolves) — `pages/index.js` public reader, `pages/admin.js` `loadProfile`/
`persistProfile`/`deletePortfolio`, `lib/tenant.js DEFAULT_TENANT`. None are bugs; they
preserve today's single-tenant production and should be removed *after* Section C.

**Conclusion:** the application is ahead of the database. Every remaining blocker is a DB
change in `supabase/sections/section-c-and-onboarding.sql`.

---

## PHASE 3 — PRODUCTION ROADMAP

### Phase 0 — Backup & safety
- **Changes:** none. **Files:** none. **SQL:** none.
- **Do:** Supabase Dashboard → Database → Backups (confirm a recent daily backup); also
  take a manual `pg_dump`/CSV of `profile`, `projects`, `analytics_events`, `tenants`,
  `tenant_admins`, `tenant_domains`.
- **Risk:** none. **Verify:** backup downloadable. **Rollback:** n/a.

### Phase 1 — Database migration (Section C Part 1–2)
- **Changes:** drop `single_profile`; `id` → identity (START 2); `uq_profile_tenant`;
  `NOT NULL` + FKs on tenant_id. **Files:** `section-c-and-onboarding.sql` Parts 1–2.
- **Risk:** **HIGH / irreversible.** **Verify:** live site + admin save still work; a new
  `profile(tenant_id=...)` insert succeeds. **Rollback:** restore from Phase 0 backup.

### Phase 2 — RLS / security (Section C Part 3)
- **Changes:** add tenant-scoped policies (`is_tenant_admin`) for profile/projects/
  analytics + write policies for tenants/tenant_admins/tenant_domains; verify on a dummy
  tenant; **then** drop the old `is_admin()` write policies. **Files:** Part 3.
- **Risk:** medium (mis-sequencing locks writes). **Verify:** a second admin cannot touch
  tenant #1's rows. **Rollback:** re-create the old `is_admin()` policies (kept in
  `supabase-complete.sql`).

### Phase 3 — Admin onboarding tools
- **Status:** ✅ already shipped in code (create workspace, assign client admin, domains,
  suspend/reactivate). Activates automatically once Phases 1–2 land. **Files:** `pages/admin.js`.

### Phase 4 — Custom domains
- **Changes:** none in repo. **Manual:** add domain in the Portfolio Platform's own
  Vercel project + point DNS. Slug URL works meanwhile. **Risk:** low.

### Phase 5 — AI onboarding automation
- See Phase 6 below. Design only; build after Phases 1–2 are verified in production.

---

## PHASE 4 — REQUIRED FIXES, CLASSIFIED

### Safe to do now (non-destructive) — DONE in code this session
- App tenant scoping, storage isolation, onboarding UI, workspace suspend/rename, domain
  primary, resolver disabled-tenant blocking, reserved slugs, resolver tests. (Committed.)

### Needs database migration (prepared, NOT run) → `supabase/sections/section-c-and-onboarding.sql`
- Section C Part 1–2 (profile constraint/PK/FKs), Part 3 (tenant-scoped RLS + write
  policies + `assign_tenant_admin`), optional hardening appendix.

### Needs manual action (outside repo)
- Take the backup (Phase 0). Run the migration (dashboard SQL editor, staged).
- Per client: create auth user + `admin_usernames` row (dashboard). Add Vercel domain +
  DNS. Enable leaked-password protection (Auth settings).

---

## PHASE 5 — "Ready to onboard first paying client" checklist

**Database**
- [ ] Backup taken and downloadable
- [ ] Section C Part 1 applied; live site + admin save verified
- [ ] `INSERT INTO profile(tenant_id,...)` succeeds (multiple profiles work)
- [ ] Part 2 applied (no null tenant_id — already true)
- [ ] tenant creation insert works (tenants write policy)
- [ ] projects isolation verified (dummy tenant)
- [ ] analytics isolation verified

**Admin**
- [ ] tenant selector lists all owned tenants
- [ ] workspace suspend/rename works
- [ ] client-admin assignment works (`assign_tenant_admin`)

**Public**
- [ ] slug URLs work (`/<slug>`)
- [ ] custom domain resolves (after Vercel+DNS)
- [ ] disabled tenant returns 404 (not the default portfolio)

**Security**
- [ ] old `is_admin()` write policies dropped after new verified
- [ ] second admin CANNOT read/write another tenant's rows (proven)
- [ ] storage isolation acceptable (public assets; optional per-tenant RLS)

---

## PHASE 6 — AI onboarding operator (design only)

**Command:** `Onboard client { name, email, slug, domain }`

**Architecture:** a single privileged server action / Edge Function `onboard_client`
(service-role, never client-side) that orchestrates idempotent steps and returns a report.
The browser admin calls it; it is the only place with elevated rights.

**DB functions (SECURITY DEFINER, service-role invoked):**
1. `create_tenant(slug,name)` → validates reserved slugs, inserts tenant + initial profile.
2. `assign_tenant_admin(tenant_id, username)` → already designed (Part 3e).
3. `add_tenant_domain(tenant_id, domain)` → normalized insert, first = primary.
4. `provision_defaults(tenant_id)` → seed default appearance/sections.

**API requirements:** Supabase Admin API (create auth user) — service key, server-only;
Vercel Domains API (attach domain) — separate token for the Portfolio Platform Vercel
project (not the marketing one).

**Safety checks / approval points:**
- Confirm slug is free + not reserved; confirm domain not already mapped.
- **Human approval before** creating the auth user and before attaching a live domain.
- Post-run **security verification**: assert the new admin can see only the new tenant.
- Dry-run mode that produces the report without writing.

**Onboarding report:** tenant id/slug, profile id, admin user, domain + DNS instructions,
isolation-check result, and any manual follow-ups.

**Build only after** Phases 1–2 are verified in production.

---

## FINAL STATUS
- **Multi-tenant readiness:** ~70% (app ~95%, database ~45%).
- **Client-onboarding readiness:** ~40% — blocked entirely on the one migration.
- **Remaining blockers:** run Section C (backup + staged); create client auth users
  (dashboard); Vercel/DNS per domain.
- **Biggest risk:** do **not** create any client login until Phase 2 (tenant-scoped RLS,
  old policies dropped) is verified — `is_admin()` currently grants cross-tenant access.
