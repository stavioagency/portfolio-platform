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
-- STEP 3 of the scratch rehearsal — Section B (SEED / BACKFILL).
-- Prerequisite: 02 (Section A) already applied on the SAME scratch project.
-- Verbatim copy of Section B from the repo's  supabase-multitenant.sql
-- (that file remains the source of truth). Idempotent (ON CONFLICT DO NOTHING).
--
-- REVIEW BEFORE RUN:
--   * Ownership: this claims ALL existing rows for the 'f9designer' tenant.
--   * Domains below are the real production hosts. For pure scratch host-testing
--     you MAY swap one to a fake you can spoof (e.g. 'scratch.example.com').
--     Do NOT use 'localhost' — the app treats it as a neutral host.
--   * No UUIDs/emails/user-ids are hardcoded; rows are derived by slug and from
--     admin_usernames. If scratch has no data/admins, updates affect 0 rows (OK).
-- After running, run the verification queries in the runbook.
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

-- END SECTION B (scratch rehearsal copy) -------------------------------------
