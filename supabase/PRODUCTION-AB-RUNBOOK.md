# Production A+B Migration Runbook — Portfolio Platform

> **Status:** plan / not yet run in production. Nothing in this file has been executed
> against the production database. Source of truth for the SQL is
> [`../supabase-multitenant.sql`](../supabase-multitenant.sql).

**Summary: READY** (to hand-run manually) — with **one production-specific decision**
you must make first (the `designakum.vercel.com` domain seed — see §2). Scope is
**Section A + Section B only**.

> 🛑 **Section C is NOT next and must NOT be run.** Section C (the dangerous/gated
> hardening — dropping `single_profile`, adding NOT NULL/FKs, swapping RLS from
> `is_admin()` to `is_tenant_admin()`) stays fully gated. It is not part of this
> runbook and is not the step after A+B.
>
> ✅ **After production A+B, the next body of work is admin/app tenant scoping**
> (making the admin and remaining app reads/writes tenant-aware while the app still
> uses `profile` id = 1). **Not** Section C.

---

## 1. Pre-flight checks (all must pass before any SQL)

| # | Check | How | Expected |
|---|---|---|---|
| 1 | **Correct Supabase project** | Dashboard → top-left project name & Settings → Reference ID | The **production** f9designer Portfolio Platform project — ref begins **`gphr…`** (`gphrzvjlstznhypcfgre`). **NOT** scratch `qnhuzjpbhcbcwxvxgtbz`, **NOT** any marketing project. |
| 2 | **Production tables exist** | Run the SQL below | `profile`, `projects`, `analytics_events`, `admin_usernames` all present |
| 3 | **Live site works now** | Open `https://f9designer.site` | Loads; profile + projects render; AR/EN/RTL fine (baseline before change) |
| 4 | **Commits pushed** | GitHub Desktop history / `git log origin/main..HEAD` | `05f0d5b`, `ca1dddf`, `7a1afe4`, `8b38994` on `origin/main`; nothing unpushed |
| 5 | **Backup taken** | See below | A restorable backup exists **before** any SQL |

**Pre-flight table check:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('profile','projects','analytics_events','admin_usernames')
ORDER BY table_name;                      -- expect exactly these 4 rows
```

**Baseline row counts (record these — compare after B):**
```sql
SELECT
  (SELECT count(*) FROM profile)          AS profiles,   -- expect 1 (single_profile)
  (SELECT count(*) FROM projects)         AS projects,
  (SELECT count(*) FROM analytics_events) AS events,
  (SELECT count(*) FROM admin_usernames)  AS admins;
```

**Backup (do all that apply):**
- Supabase Dashboard → **Database → Backups** — confirm a recent daily backup exists
  (or trigger/download one on paid plans).
- Also take a manual logical dump you control — a `pg_dump` of the `public` schema, or at
  minimum export `profile`, `projects`, `analytics_events`, `admin_usernames` to CSV.
- Even though A+B are additive/reversible, **do not proceed without a restorable backup.**

---

## 2. Production SQL execution order (Section A, then B — **no C**)

Run in the Supabase **SQL Editor**, one section at a time, and run the §3 verification
**before** moving from A to B. **Do not paste the whole file.** **Do not run anything
from Section C** (lines 166–210 of `supabase-multitenant.sql` — leave them alone).

**Step 1 — Section A (safe/additive).** Copy lines **35–108** of
`supabase-multitenant.sql` (`-- 1. tenants …` through
`GRANT EXECUTE ON FUNCTION is_tenant_admin(UUID) TO authenticated;`). This **includes the
public tenant-read grants from `05f0d5b`** (block `2b`, lines 60–72):
```sql
ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read tenants"        ON tenants;
DROP POLICY IF EXISTS "Public can read tenant_domains" ON tenant_domains;
CREATE POLICY "Public can read tenants"        ON tenants        FOR SELECT USING (true);
CREATE POLICY "Public can read tenant_domains" ON tenant_domains FOR SELECT USING (true);
GRANT SELECT ON tenants        TO anon, authenticated;
GRANT SELECT ON tenant_domains TO anon, authenticated;
```
→ **Then run §3 verification. Only proceed if all green.**

**Step 2 — Section B (seed/backfill).** Copy lines **123–158**. **Before running, confirm
the two production assumptions:**
- **Ownership:** every existing row in this DB belongs to **f9designer**. (True for the
  live f9designer DB — the backfill claims all current rows.)
- **Domains** are the real production hosts.

→ **Then run §4 verification.**

### 2a. Section B domain seed — production recommendation

The public page resolver is live in production (`pages/index.js`). Seeding a domain for the
**empty** `designakum` tenant means that host will resolve to a tenant with **no
profile/projects** and render empty/not-found.

**Recommended — f9designer-only domain seed.** Run tenant creation, the **f9designer**
domains, the backfill, and the admin mapping; **hold** the `designakum.vercel.com` insert
until Designakum's data has been copied into this DB. The empty `designakum` *tenant row*
is harmless; only its *domain* causes a live empty-tenant render.

Run these parts of Section B:
```sql
-- create both tenants (designakum row is harmless while empty)
INSERT INTO tenants (slug, name, default_lang)
VALUES
  ('f9designer', 'f9designer (demo)', 'ar'),
  ('designakum', 'Designakum (official)', 'ar')
ON CONFLICT (slug) DO NOTHING;

-- f9designer domains ONLY (hold the designakum domain for now)
INSERT INTO tenant_domains (tenant_id, domain, is_primary, status)
SELECT id, 'f9designer.site', TRUE, 'active'   FROM tenants WHERE slug = 'f9designer'
ON CONFLICT (domain) DO NOTHING;
INSERT INTO tenant_domains (tenant_id, domain, is_primary, status)
SELECT id, 'www.f9designer.site', FALSE, 'active' FROM tenants WHERE slug = 'f9designer'
ON CONFLICT (domain) DO NOTHING;

-- backfill all current rows to f9designer
UPDATE profile          SET tenant_id = (SELECT id FROM tenants WHERE slug='f9designer') WHERE tenant_id IS NULL;
UPDATE projects         SET tenant_id = (SELECT id FROM tenants WHERE slug='f9designer') WHERE tenant_id IS NULL;
UPDATE analytics_events SET tenant_id = (SELECT id FROM tenants WHERE slug='f9designer') WHERE tenant_id IS NULL;

-- map existing admins to f9designer so current logins keep working
INSERT INTO tenant_admins (tenant_id, user_id, role)
SELECT (SELECT id FROM tenants WHERE slug='f9designer'), au.user_id, 'owner'
FROM admin_usernames au
ON CONFLICT (tenant_id, user_id) DO NOTHING;
```

**Held for later** (run only once Designakum's data exists in this DB, or if
`designakum.vercel.com` is confirmed **not** routed to this deployment yet):
```sql
INSERT INTO tenant_domains (tenant_id, domain, is_primary, status)
SELECT id, 'designakum.vercel.com', TRUE, 'active' FROM tenants WHERE slug = 'designakum'
ON CONFLICT (domain) DO NOTHING;
```

---

## 3. Verification SQL — after Section A (before B)

```sql
-- (A-1) tenant tables exist  -> expect 3 rows
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('tenants','tenant_domains','tenant_admins')
ORDER BY table_name;

-- (A-2) tenant_id columns exist, NULLABLE, uuid  -> expect 3 rows, is_nullable=YES, uuid
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='public' AND column_name='tenant_id'
  AND table_name IN ('profile','projects','analytics_events')
ORDER BY table_name;

-- (A-3) single_profile constraint STILL exists  -> expect 1 row
SELECT conname FROM pg_constraint WHERE conname='single_profile';
-- and profile.id default is still 1  -> expect '1'
SELECT column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='profile' AND column_name='id';

-- (A-4) public read POLICIES for tenants/tenant_domains  -> expect 2 rows, cmd=SELECT
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('tenants','tenant_domains')
ORDER BY tablename;

-- (A-4) public read GRANTS for tenants/tenant_domains  -> expect 4 rows (anon+authenticated × 2)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('tenants','tenant_domains')
  AND grantee IN ('anon','authenticated') AND privilege_type='SELECT'
ORDER BY table_name, grantee;

-- (A-4 guard) tenant_admins is NOT public  -> expect 0 rows
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='tenant_admins'
  AND grantee IN ('anon','authenticated');

-- (A-5) helper function present  -> expect 1 row
SELECT proname FROM pg_proc WHERE proname='is_tenant_admin';
```
**Gate:** A-1=3, A-2=3 (nullable uuid), A-3 present + default 1, A-4 policies=2 & grants=4,
tenant_admins guard=0, A-5=1. Any miss → **stop** (see §6).

---

## 4. Verification SQL — after Section B

```sql
-- (B-1) tenants seeded  -> expect f9designer + designakum
SELECT slug, name, default_lang, status FROM tenants ORDER BY slug;

-- (B-2) tenant_domains seeded (rows depend on your §2a designakum decision)
SELECT d.domain, d.is_primary, d.status, t.slug
FROM tenant_domains d JOIN tenants t ON t.id=d.tenant_id
ORDER BY t.slug, d.domain;

-- (B-3) profile has tenant_id, none null  -> expect null_profiles=0, tenant_id = f9designer
SELECT count(*) FILTER (WHERE tenant_id IS NULL) AS null_profiles FROM profile;
SELECT p.id, t.slug FROM profile p LEFT JOIN tenants t ON t.id=p.tenant_id;

-- (B-4) projects backfilled  -> expect null_tenant=0, all under f9designer
SELECT count(*) AS total,
       count(*) FILTER (WHERE tenant_id IS NULL) AS null_tenant FROM projects;
SELECT t.slug, count(*) FROM projects p JOIN tenants t ON t.id=p.tenant_id GROUP BY t.slug;

-- (B-5) analytics backfilled  -> expect null_tenant=0
SELECT count(*) FILTER (WHERE tenant_id IS NULL) AS null_tenant FROM analytics_events;

-- (B-6) admin mapping  -> mapped count should equal number of admin_usernames
SELECT (SELECT count(*) FROM admin_usernames) AS admins,
       (SELECT count(*) FROM tenant_admins)   AS mapped;
SELECT t.slug, ta.role, count(*) FROM tenant_admins ta
JOIN tenants t ON t.id=ta.tenant_id GROUP BY t.slug, ta.role;

-- (B-7) single_profile STILL exists  -> expect 1 row
SELECT conname FROM pg_constraint WHERE conname='single_profile';
```
**Gate:** B-1 shows both tenants; B-3/B-4/B-5 all `null_*=0` and owned by **f9designer**;
B-6 `admins == mapped`; B-7 present. Row counts for projects/events unchanged vs. the §1
baseline (backfill only *sets* `tenant_id`, never deletes).

---

## 5. Base grant alignment (optional — production already works)

The base-schema grants from commits `ca1dddf`, `7a1afe4`, `8b38994` fixed a **fresh-DB
portability gap**. Production already works (live reads + analytics logging prove the
grants are effectively present), so this is **not** a required migration step — it only
makes production byte-match the schema files. These statements were applied and validated
on **scratch only**; production has not been touched.

**Verify whether production already has them:**
```sql
-- profile/projects public SELECT  -> expect 4 rows (anon+authenticated × 2)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('profile','projects')
  AND grantee IN ('anon','authenticated') AND privilege_type='SELECT'
ORDER BY table_name, grantee;

-- analytics_events public INSERT  -> expect 2 rows (anon, authenticated)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='analytics_events'
  AND grantee IN ('anon','authenticated') AND privilege_type='INSERT'
ORDER BY grantee;

-- analytics id sequence USAGE  -> expect 2 rows (anon, authenticated)
SELECT grantee, privilege_type
FROM information_schema.role_usage_grants
WHERE object_schema='public' AND object_name='analytics_events_id_seq'
  AND grantee IN ('anon','authenticated');
```

**If any are missing**, they can be applied safely — they are **idempotent** and already
validated on scratch:
```sql
GRANT SELECT ON profile, projects TO anon, authenticated;
GRANT INSERT ON analytics_events TO anon, authenticated;
GRANT USAGE ON SEQUENCE analytics_events_id_seq TO anon, authenticated;
```
If the verify queries already return the expected rows, **do nothing** — production is fine.

---

## 6. Live smoke test — after production A+B

- [ ] `https://f9designer.site` loads; profile + projects render (same as baseline).
- [ ] `https://www.f9designer.site` loads (www sibling resolves).
- [ ] `https://designakum.vercel.com` — **only if you seeded its domain** (see §2a): expect
      it to resolve to the empty designakum tenant. If you held the seed (recommended), it
      behaves as before.
- [ ] Public profile/projects still visible to a logged-out visitor.
- [ ] Admin login page opens; you can sign in with an existing admin.
- [ ] A simple admin **save** succeeds (edit a field, save, reload) — confirms writes still
      work (single-profile path unchanged; C not run).
- [ ] Browsing throws **no** analytics/console errors (page_view/link_click inserts succeed).
- [ ] Arabic ↔ English toggle works and RTL layout is intact.

Any failure → treat as an abort trigger (§7) and consider rollback (§8).

---

## 7. Abort conditions (stop immediately if any occur)

- **Wrong project** — the SQL editor is not the production `gphr…` project (e.g. it's
  scratch `qnhuzjpbhcbcwxvxgtbz` or a marketing project). Stop before running anything.
- **Any red SQL error** during A or B — stop; do not run the next block; capture the message.
- **`single_profile` missing** at any verification (A-3 / B-7) — something ran that
  shouldn't have (Section C territory). Stop.
- **Profile/projects lose data** — row counts drop vs. §1 baseline, or profile no longer
  returns. Stop; roll back.
- **Live site breaks** — public page or admin fails after A or B. Stop; roll back.
- **Backfill wrong** — any `null_tenant`/`null_profiles` > 0 after B, or rows attributed to
  the wrong tenant (e.g. existing data under `designakum`). Stop; correct before continuing.

---

## 8. Rollback notes

**Section A is additive and reversible** (new tables/columns/policies/grants — no existing
data touched). If A must be undone:
```sql
DROP FUNCTION IF EXISTS is_tenant_admin(UUID);
ALTER TABLE analytics_events DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE projects         DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE profile          DROP COLUMN IF EXISTS tenant_id;
DROP TABLE IF EXISTS tenant_admins;
DROP TABLE IF EXISTS tenant_domains;
DROP TABLE IF EXISTS tenants;   -- also removes their policies/grants
```

**Section B is data.** It only **inserts** tenant/domain/admin rows and **sets** `tenant_id`
on existing rows (never deletes). To reverse the backfill without a full restore:
```sql
UPDATE profile          SET tenant_id = NULL;
UPDATE projects         SET tenant_id = NULL;
UPDATE analytics_events SET tenant_id = NULL;
DELETE FROM tenant_admins;
DELETE FROM tenant_domains;
DELETE FROM tenants;
```

**When a full backup restore is required** instead of the above: any red error mid-statement
that leaves partial/ambiguous state, unexpected data loss, or if you're unsure what ran.
Prefer the §1 backup over hand-reversal when in doubt.

**What NOT to touch during rollback:** the existing base-schema objects — `profile.id` /
`single_profile` constraint, `is_admin()`, the existing `"Admins can write …"` /
`"Public can read …"` policies, and `admin_usernames`. A+B never modified them; a rollback
shouldn't either. **Never run any Section C statement as part of a rollback.**

---

## 9. Final go / no-go gate — all must be TRUE before you run production SQL

1. ✅ SQL editor is the **production `gphr…`** project (not scratch, not marketing).
2. ✅ Pre-flight table check passed; §1 baseline counts recorded.
3. ✅ A **restorable backup** exists (Supabase backup and/or your own dump/CSV).
4. ✅ Commits `05f0d5b`, `ca1dddf`, `7a1afe4`, `8b38994` are on `origin/main`.
5. ✅ You will run **Section A only**, verify (§3 green), **then** Section B, verify (§4
   green) — **never** Section C.
6. ✅ You've made the **§2a designakum-domain decision** (recommended: hold that insert).
7. ✅ You accept the ownership assumption: **all current rows → f9designer**.
8. ✅ You have the §6 smoke-test list open to run immediately after.

If **any** is not true → **NO-GO.**

---

**Reminder:** Section C is **not** next and must not be run. After production A+B, the next
body of work is **admin/app tenant scoping** — not Section C.
