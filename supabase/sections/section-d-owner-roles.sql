-- ############################################################################
-- SECTION D — OWNER vs CLIENT permission foundation
-- ############################################################################
-- Introduces a platform-owner concept so only Designakum (owners) can manage
-- tenants/clients, while clients keep full edit access to ONLY their own tenant.
--
-- Also CLOSES a latent privilege-escalation hole: the previous
--   "Admins self-assign new tenant" INSERT policy WITH CHECK (user_id = auth.uid())
-- let ANY authenticated user insert (any_tenant_id, their_own_uid) into
-- tenant_admins and thereby gain edit access to another tenant. Not yet
-- exploitable (only owner accounts existed), but must be closed before any
-- client login. Fixed in PART 3 (tenant_admins writes are now owner-only).
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ APPLIED + VERIFIED IN PRODUCTION 2026-07-21 (gphrzvjlstznhypcfgre):        │
-- │   ✅ D1 section_d1_platform_owners                                          │
-- │   ✅ D2 seed owners (both Designakum accounts)                              │
-- │   ✅ D3 section_d3_owner_only_tenant_management                             │
-- │   Verified: owner CAN create tenants; a non-owner admin (f9f9) CANNOT       │
-- │   create tenants and CANNOT self-assign into another tenant; a client       │
-- │   CAN still edit its own tenant's profile/projects. Editing policies         │
-- │   (is_tenant_admin on profile/projects/analytics) left untouched.           │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- BACKUP NOTES:
--   * Additive + policy-swap only. NO portfolio data is read, modified, or
--     deleted. platform_owners is a NEW table. Supabase automatic daily backup is
--     the catastrophe fallback; a schema-only change like this is low risk.
--   * Reversible (see ROLLBACK at the bottom).
--
-- STAGED ORDER USED (each verified before proceeding):
--   D1 create table+function -> D2 add ONE owner -> verify predicate ->
--   D3 swap policies -> verify (owner creates / client blocked / client edits own /
--   self-assign blocked) -> add second owner -> final state check.
-- ############################################################################


-- ============================================================================
-- D1 — platform_owners table + is_platform_owner()
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_owners (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE platform_owners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own owner row" ON platform_owners;
CREATE POLICY "Read own owner row" ON platform_owners
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON platform_owners TO authenticated;

-- Source of truth for owner privileges. SECURITY DEFINER so it reads
-- platform_owners regardless of RLS and never depends on the frontend.
CREATE OR REPLACE FUNCTION is_platform_owner()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_owners WHERE user_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION is_platform_owner() TO authenticated;
REVOKE EXECUTE ON FUNCTION is_platform_owner() FROM anon;


-- ============================================================================
-- D2 — seed the Designakum owner accounts (edit user_ids for other environments)
-- ============================================================================
INSERT INTO platform_owners (user_id) VALUES
  ('6b0ab503-a663-4014-9221-a2ede4611fde'),  -- designakum
  ('24baae5a-93c6-4000-bcac-0ecb1c86e7ae')   -- f9f9
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================================
-- D3 — tenant/client MANAGEMENT is owner-only. Portfolio EDITING is unchanged.
-- ============================================================================
-- create tenants: owners only (was is_admin() = any admin_usernames user)
DROP POLICY IF EXISTS "Admins create tenants" ON tenants;
CREATE POLICY "Owners create tenants" ON tenants
  FOR INSERT TO authenticated WITH CHECK (is_platform_owner());

-- suspend / rename slug / status: owners only
DROP POLICY IF EXISTS "Tenant admins update tenant" ON tenants;
CREATE POLICY "Owners update tenants" ON tenants
  FOR UPDATE TO authenticated USING (is_platform_owner()) WITH CHECK (is_platform_owner());

-- delete tenant (offboarding / create-rollback): owners only
DROP POLICY IF EXISTS "Tenant admins delete tenant" ON tenants;
CREATE POLICY "Owners delete tenants" ON tenants
  FOR DELETE TO authenticated USING (is_platform_owner());

-- manage client admins: owners only. Closes the self-assign escalation hole.
DROP POLICY IF EXISTS "Admins self-assign new tenant" ON tenant_admins;
CREATE POLICY "Owners insert tenant admins" ON tenant_admins
  FOR INSERT TO authenticated WITH CHECK (is_platform_owner());
CREATE POLICY "Owners update tenant admins" ON tenant_admins
  FOR UPDATE TO authenticated USING (is_platform_owner()) WITH CHECK (is_platform_owner());
CREATE POLICY "Owners delete tenant admins" ON tenant_admins
  FOR DELETE TO authenticated USING (is_platform_owner());

-- assign_tenant_admin RPC is now owner-only, and assigns role 'client'.
CREATE OR REPLACE FUNCTION assign_tenant_admin(p_tenant_id UUID, p_username TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'only a platform owner can assign tenant admins'; END IF;
  SELECT user_id INTO v_user FROM admin_usernames WHERE username = p_username;
  IF v_user IS NULL THEN RAISE EXCEPTION 'no user with that username'; END IF;
  INSERT INTO tenant_admins (tenant_id, user_id, role) VALUES (p_tenant_id, v_user, 'client')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
END; $$;

-- NOTE: portfolio EDITING policies are intentionally NOT changed here —
--   profile / projects / analytics_events writes remain gated by
--   is_tenant_admin(tenant_id), so a client keeps full control of ONLY its tenant.


-- ============================================================================
-- VERIFICATION QUERIES (run with the SQL editor / as the given user)
-- ============================================================================
-- owner check (expect true for owners, false otherwise):
--   select is_platform_owner();   -- run while authenticated as each user
-- owner-only management (simulate a user):
--   begin; set local role authenticated;
--   set local request.jwt.claims to '{"sub":"<uuid>"}';
--   insert into tenants(slug,name) values('probe','x');  -- owner: ok; client: RLS error
--   rollback;
-- client can still edit own tenant:
--   update profile set default_lang='en' where tenant_id='<their tenant>';  -- 1 row
-- policy audit:
--   select tablename,cmd,policyname from pg_policies
--   where schemaname='public' and tablename in ('tenants','tenant_admins')
--   order by tablename,cmd;


-- ============================================================================
-- ROLLBACK (reverses D3 to the previous behavior; then optionally drop D1/D2)
-- ============================================================================
-- DROP POLICY IF EXISTS "Owners create tenants"      ON tenants;
-- DROP POLICY IF EXISTS "Owners update tenants"      ON tenants;
-- DROP POLICY IF EXISTS "Owners delete tenants"      ON tenants;
-- DROP POLICY IF EXISTS "Owners insert tenant admins" ON tenant_admins;
-- DROP POLICY IF EXISTS "Owners update tenant admins" ON tenant_admins;
-- DROP POLICY IF EXISTS "Owners delete tenant admins" ON tenant_admins;
-- CREATE POLICY "Admins create tenants" ON tenants FOR INSERT TO authenticated WITH CHECK (is_admin());
-- CREATE POLICY "Tenant admins update tenant" ON tenants FOR UPDATE TO authenticated USING (is_tenant_admin(id)) WITH CHECK (is_tenant_admin(id));
-- CREATE POLICY "Tenant admins delete tenant" ON tenants FOR DELETE TO authenticated USING (is_tenant_admin(id));
-- CREATE POLICY "Admins self-assign new tenant" ON tenant_admins FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
--   (re-introduces the self-assign hole — only for emergency rollback)
-- To fully remove owners: DROP FUNCTION is_platform_owner(); DROP TABLE platform_owners;
-- ############################################################################
