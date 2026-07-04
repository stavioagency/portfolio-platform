-- ============================================================================
-- Portfolio Platform — MULTI-TENANT SCHEMA (PLAN / NOT YET APPLIED)
-- ============================================================================
--
-- Target DB: the f9designer Portfolio Platform Supabase project
--            (account: stavio.agency@gmail.com). ONE project holds MANY tenants.
--
-- ⚠️  NOTHING IN THIS FILE HAS BEEN RUN. It is a reviewed plan only.
--     Do NOT paste this whole file at once. It is split into sections:
--
--       SECTION A — SAFE / ADDITIVE      (create new tables/cols; breaks nothing)
--       SECTION B — SEED / BACKFILL       (data; review slugs+ownership first)
--       SECTION C — DANGEROUS / STAGED    (run ONLY after a full DB backup;
--                                          removes the single-profile lock and
--                                          swaps RLS — verify on a dummy tenant
--                                          BEFORE dropping the old policies)
--
-- Existing schema this builds on (from supabase-complete.sql):
--   profile          : id INTEGER PK DEFAULT 1, CONSTRAINT single_profile CHECK (id = 1)
--   projects         : id BIGSERIAL PK
--   analytics_events : id BIGSERIAL PK
--   admin_usernames  : (username TEXT PK, user_id UUID → auth.users)
--   is_admin()       : "is the current user ANY admin" — gates all writes today
-- ============================================================================


-- ############################################################################
-- SECTION A — SAFE / ADDITIVE
-- Creates new tables, a helper function, and NULLABLE tenant_id columns.
-- Adds NO constraints that could reject existing rows. Fully reversible.
-- Running this alone changes NO app behavior (the app ignores these until later
-- batches wire them in).
-- ############################################################################

-- 1. tenants — one row per client/portfolio
CREATE TABLE IF NOT EXISTS tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,            -- URL fallback, e.g. 'f9designer'
  name         TEXT,                            -- human label
  default_lang TEXT DEFAULT 'ar',
  status       TEXT DEFAULT 'active',           -- 'active' | 'disabled'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. tenant_domains — a tenant can have many hosts (apex, www, .vercel.app, custom)
CREATE TABLE IF NOT EXISTS tenant_domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain      TEXT NOT NULL UNIQUE,             -- host only, lowercase, no scheme/port
  is_primary  BOOLEAN DEFAULT FALSE,            -- canonical host for redirects/canonical tags
  status      TEXT DEFAULT 'pending',           -- 'pending' | 'active' | 'error'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains(tenant_id);
-- domain is already UNIQUE (the hot lookup path for host resolution).
-- At most one primary domain per tenant:
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_primary_domain
  ON tenant_domains(tenant_id) WHERE is_primary;

-- 3. tenant_admins — which auth user may administer which tenant (owner-created)
CREATE TABLE IF NOT EXISTS tenant_admins (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT DEFAULT 'owner',             -- 'owner' | 'editor' (future)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_admins_user ON tenant_admins(user_id);

-- 4. tenant_id columns — NULLABLE for now (no FK/NOT NULL yet → cannot reject rows)
ALTER TABLE profile          ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE projects         ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Non-unique helper indexes (safe; used once data is backfilled)
CREATE INDEX IF NOT EXISTS idx_projects_tenant   ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_tenant  ON analytics_events(tenant_id);

-- 5. is_tenant_admin(tid) — "is the current user an admin of THIS tenant?"
--    SECURITY DEFINER + STABLE, mirrors the existing is_admin() style.
--    Additive: creating it changes nothing until policies use it (Section C).
CREATE OR REPLACE FUNCTION is_tenant_admin(tid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_admins
    WHERE user_id = auth.uid() AND tenant_id = tid
  );
$$;
GRANT EXECUTE ON FUNCTION is_tenant_admin(UUID) TO authenticated;

-- END SECTION A ---------------------------------------------------------------


-- ############################################################################
-- SECTION B — SEED / BACKFILL   (data only; review before running)
-- Mostly safe (INSERT/UPDATE), but you MUST confirm the ownership assumption:
-- ALL existing rows in THIS database belong to the f9designer demo tenant.
-- (The official Designakum data currently lives in a DIFFERENT Supabase project
--  under designakum@gmail.com and is NOT in this DB yet — the 'designakum'
--  tenant is created EMPTY here, to be seeded/copied manually later.)
-- Idempotent via ON CONFLICT so re-running is safe.
-- ############################################################################

-- 1. Create the two known tenants
INSERT INTO tenants (slug, name, default_lang)
VALUES
  ('f9designer', 'f9designer (demo)', 'ar'),
  ('designakum', 'Designakum (official)', 'ar')
ON CONFLICT (slug) DO NOTHING;

-- 2. Seed domains (host only, lowercase, no scheme). Adjust before running.
INSERT INTO tenant_domains (tenant_id, domain, is_primary, status)
SELECT id, 'f9designer.site', TRUE, 'active'   FROM tenants WHERE slug = 'f9designer'
ON CONFLICT (domain) DO NOTHING;
INSERT INTO tenant_domains (tenant_id, domain, is_primary, status)
SELECT id, 'www.f9designer.site', FALSE, 'active' FROM tenants WHERE slug = 'f9designer'
ON CONFLICT (domain) DO NOTHING;
INSERT INTO tenant_domains (tenant_id, domain, is_primary, status)
SELECT id, 'designakum.vercel.com', TRUE, 'active' FROM tenants WHERE slug = 'designakum'
ON CONFLICT (domain) DO NOTHING;

-- 3. Backfill: assign ALL existing data in this DB to the f9designer tenant.
--    (Confirm this is correct before running — it claims every current row.)
UPDATE profile
   SET tenant_id = (SELECT id FROM tenants WHERE slug = 'f9designer')
 WHERE tenant_id IS NULL;
UPDATE projects
   SET tenant_id = (SELECT id FROM tenants WHERE slug = 'f9designer')
 WHERE tenant_id IS NULL;
UPDATE analytics_events
   SET tenant_id = (SELECT id FROM tenants WHERE slug = 'f9designer')
 WHERE tenant_id IS NULL;

-- 4. Map existing admin(s) → f9designer tenant, so current logins keep working.
--    Uses the existing admin_usernames → auth.users mapping.
INSERT INTO tenant_admins (tenant_id, user_id, role)
SELECT (SELECT id FROM tenants WHERE slug = 'f9designer'), au.user_id, 'owner'
FROM admin_usernames au
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- (Designakum's admin user + data will be added later, once its data is copied
--  in from the old designakum@gmail.com Supabase project.)

-- END SECTION B ---------------------------------------------------------------


-- ############################################################################
-- SECTION C — DANGEROUS / STAGED   ⚠️  BACKUP THE DATABASE FIRST  ⚠️
-- These steps change constraints and security. Run each block deliberately,
-- verify on a DUMMY tenant, and DO NOT drop the old RLS policies until the new
-- tenant-scoped policies are confirmed working. Reversible only via backup +
-- careful re-add, so treat as high-risk.
-- Prerequisite: Section A + B applied, and every row has a non-null tenant_id.
-- ############################################################################

-- C1. Remove the single-profile lock so multiple tenants can each have a profile.
--     THIS IS THE BIGGEST BREAKING CHANGE. The app also still writes upsert({id:1})
--     today — that app change lands in a later batch, so do NOT run C1 until the
--     app no longer depends on id=1 (Batch 3), or the live admin save will break.
-- ALTER TABLE profile DROP CONSTRAINT IF EXISTS single_profile;
-- ALTER TABLE profile ALTER COLUMN id DROP DEFAULT;
-- ALTER TABLE profile ADD CONSTRAINT uq_profile_tenant UNIQUE (tenant_id);

-- C2. Enforce ownership once backfilled + verified (rejects null tenant_id going forward)
-- ALTER TABLE profile          ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE projects         ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE analytics_events ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE profile          ADD CONSTRAINT fk_profile_tenant   FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
-- ALTER TABLE projects         ADD CONSTRAINT fk_projects_tenant  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
-- ALTER TABLE analytics_events ADD CONSTRAINT fk_analytics_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- C3. RLS DIRECTION (add NEW policies ALONGSIDE the old ones; drop old LAST).
--     Today writes are gated by is_admin() (any admin → the one profile).
--     New model: is_tenant_admin(tenant_id) (this row's tenant only).
--
--     Step 1 — add tenant-scoped write policies (old policies still active):
-- CREATE POLICY "Tenant admins write profile"  ON profile          FOR ALL TO authenticated USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));
-- CREATE POLICY "Tenant admins write projects" ON projects         FOR ALL TO authenticated USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));
-- CREATE POLICY "Tenant admins read events"    ON analytics_events FOR SELECT TO authenticated USING (is_tenant_admin(tenant_id));
--
--     Step 2 — VERIFY on a dummy tenant (see MULTITENANT-PLAN.md isolation tests).
--
--     Step 3 — ONLY after verification, drop the old un-scoped policies:
-- DROP POLICY IF EXISTS "Admins can write profile"  ON profile;
-- DROP POLICY IF EXISTS "Admins can write projects" ON projects;
-- DROP POLICY IF EXISTS "Admins can read events"    ON analytics_events;
--
--     Public READ policies (anon can view profile/projects) stay UNCHANGED here;
--     per-tenant public scoping is handled by the app's tenant resolver, not RLS.

-- END SECTION C ---------------------------------------------------------------
-- ============================================================================
-- Reminder: NONE of the above has been executed. See MULTITENANT-PLAN.md.
-- ============================================================================
