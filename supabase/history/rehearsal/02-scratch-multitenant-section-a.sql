-- ############################################################################
-- ##  SUPERSEDED — DO NOT RUN THIS FILE AGAINST ANY DATABASE.               ##
-- ##                                                                        ##
-- ##  Kept only as a record of how the schema used to look. Parts of it are ##
-- ##  actively WRONG for the live database, most dangerously any            ##
-- ##  single-tenant assumption such as `CHECK (id = 1)` on profile, which   ##
-- ##  multi-tenancy required removing. Copying table definitions out of     ##
-- ##  here silently reintroduces them.                                      ##
-- ##                                                                        ##
-- ##  For what the database IS:      ../SCHEMA.sql                          ##
-- ##  To CHANGE the database:        add a file to ../sections/             ##
-- ############################################################################

-- ############################################################################
-- ⚠️  SCRATCH REHEARSAL ONLY  ⚠️
-- Use ONLY on the scratch Supabase project (e.g. "portfolio-mt-scratch").
-- DO NOT run on production. DO NOT run Section C.
-- Confirm the Supabase project name (top-left of the SQL editor) before Run.
-- ############################################################################
--
-- STEP 2 of the scratch rehearsal — Section A (SAFE / ADDITIVE).
-- Prerequisite: 01 (base schema, supabase-complete.sql) already applied.
-- Verbatim copy of Section A from the repo's  supabase-multitenant.sql
-- (that file remains the source of truth). Additive only — cannot reject rows.
-- After running, run the verification queries in the runbook, then proceed to 03.
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

-- 2b. PUBLIC READ for tenant resolution.
--     The public site resolves tenants by host (tenant_domains) and slug (tenants)
--     using the ANON key, so anon/authenticated MUST be able to SELECT these two
--     tables. No write policy is added (writes stay closed). tenant_admins is
--     intentionally NOT made public. Idempotent — safe to re-run.
ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read tenants"        ON tenants;
DROP POLICY IF EXISTS "Public can read tenant_domains" ON tenant_domains;
CREATE POLICY "Public can read tenants"        ON tenants        FOR SELECT USING (true);
CREATE POLICY "Public can read tenant_domains" ON tenant_domains FOR SELECT USING (true);
GRANT SELECT ON tenants        TO anon, authenticated;
GRANT SELECT ON tenant_domains TO anon, authenticated;

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

-- END SECTION A (scratch rehearsal copy) -------------------------------------
