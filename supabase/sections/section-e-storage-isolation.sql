-- =============================================================================
-- Section E — Storage tenant isolation
-- Target: gphrzvjlstznhypcfgre (public bucket `media`)
-- =============================================================================
--
-- STATUS 2026-07-26 — PARTIALLY APPLIED. Isolation is NOT yet in effect.
--
--   [x] can_write_media() created, anon revoked, authenticated granted
--   [x] the three "Tenant admins ... own media" policies created
--   [x] bucket file_size_limit = 5 MB + image-only allowed_mime_types
--   [ ] the three DROP POLICY statements in step 1  <-- STILL REQUIRED
--
-- The DROPs were blocked by a safety classifier and must be run by hand in the
-- Supabase SQL editor. Until they run, the old unscoped policies remain and RLS
-- ORs them with the new ones, so every client can still write every file — the
-- new policies grant, they cannot restrict. Nothing is broken in the meantime;
-- uploads work exactly as before. The fix simply is not active yet.
--
-- Run this, then re-run the verification in step 5:
--   DROP POLICY "Admins can upload media" ON storage.objects;
--   DROP POLICY "Admins can update media" ON storage.objects;
--   DROP POLICY "Admins can delete media" ON storage.objects;
-- =============================================================================
--
-- THE PROBLEM
-- The three write policies on storage.objects check only:
--     bucket_id = 'media' AND is_admin()
-- and is_admin() is TRUE for anyone holding a row in admin_usernames — that is,
-- every client. There is no tenant check anywhere, so ANY client admin can
-- overwrite or delete EVERY other client's images. The `t-{tenant_id}/` prefix
-- written by tenantStoragePath() in pages/admin.js is a naming convention with
-- nothing enforcing it.
--
-- THE FIX
-- Scope the write policies by the first path segment: you may only write under
-- `t-<a tenant you administer>/`. Platform owners keep full access, since they
-- administer every client.
--
-- WHAT HAPPENS TO THE 135 EXISTING FILES
-- They sit at the bucket ROOT with no `t-` prefix (122 MB, all of them). For a
-- flat name, storage.foldername(name) returns NULL, so the new policies deny
-- every write on them and they become READ-ONLY. That is deliberate and is the
-- safe outcome:
--   * public SELECT is unchanged, so every live portfolio image keeps loading —
--     no URL in profile/projects breaks;
--   * re-uploading a profile picture or project cover writes a NEW file under
--     the correct t-<id>/ prefix and updates the row, so the admin still works;
--   * the old flat files simply linger as orphans until someone cleans them up.
-- Moving them instead would mean rewriting every stored image URL in `profile`
-- and `projects` — a live-data migration with real breakage risk — for no gain
-- beyond reclaiming space. Not worth doing in the same change as a security fix.
--
-- ORDER MATTERS: RLS policies are PERMISSIVE and OR'd together. Adding these
-- next to the old ones would NOT tighten anything — the old permissive policy
-- would still allow the write. The DROPs below are mandatory, not cleanup.
--
-- ROLLBACK: re-create the three dropped policies from the definitions quoted in
-- the DROP section below. Nothing here alters data, only access rules.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Drop the three unscoped write policies.
--
-- Their current definitions, for rollback:
--   "Admins can upload media" INSERT WITH CHECK ((bucket_id = 'media') AND is_admin())
--   "Admins can update media" UPDATE USING      ((bucket_id = 'media') AND is_admin())
--   "Admins can delete media" DELETE USING      ((bucket_id = 'media') AND is_admin())
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete media" ON storage.objects;


-- ---------------------------------------------------------------------------
-- 2. Helper: may the current user write under this object path?
--
-- SECURITY DEFINER so it can read tenant_admins regardless of that table's own
-- RLS. STABLE so the planner evaluates it once per statement, not per row.
-- Returns FALSE (never NULL) for a flat legacy path, so the policies below deny
-- cleanly rather than evaluating to NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_media(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT COALESCE(
    -- Platform owners administer every client.
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_admins ta
      WHERE ta.user_id = auth.uid()
        AND (storage.foldername(object_name))[1] = 't-' || ta.tenant_id::text
    ),
    FALSE
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_media(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.can_write_media(TEXT) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. Re-create the write policies, tenant-scoped.
-- ---------------------------------------------------------------------------
CREATE POLICY "Tenant admins upload own media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.can_write_media(name));

CREATE POLICY "Tenant admins update own media"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'media' AND public.can_write_media(name))
  WITH CHECK (bucket_id = 'media' AND public.can_write_media(name));

CREATE POLICY "Tenant admins delete own media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND public.can_write_media(name));

-- NOTE: "Public can view media" (SELECT, USING bucket_id = 'media') is left
-- ALONE on purpose. The bucket is public and every portfolio image is served
-- from it; scoping SELECT would break live client sites. Supabase's advisor
-- separately flags that this broad SELECT also permits LISTING the bucket —
-- worth tightening later, but it is a different change with a different risk.


-- ---------------------------------------------------------------------------
-- 4. Enforce the upload size limit in the BUCKET, not just the browser.
--
-- file_size_limit is currently NULL, so the 5 MB MAX_UPLOAD_BYTES check in
-- pages/admin.js is advisory only — anyone calling the storage API directly
-- bypasses it. There is already a 7.8 MB object in the bucket proving this.
-- Existing oversized files are unaffected; the limit applies to new uploads.
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 5242880,               -- 5 MB, matches MAX_UPLOAD_BYTES
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml']
WHERE id = 'media';


-- ---------------------------------------------------------------------------
-- 5. VERIFY (run after applying; all four should hold)
-- ---------------------------------------------------------------------------
-- a) Exactly one SELECT policy and three tenant-scoped write policies remain:
--      SELECT policyname, cmd FROM pg_policies
--      WHERE schemaname='storage' AND tablename='objects' ORDER BY cmd;
--
-- b) The bucket now has a size limit:
--      SELECT id, public, file_size_limit FROM storage.buckets WHERE id='media';
--
-- c) MANUAL, and the one that actually proves the fix — sign in as a CLIENT
--    (not an owner) and attempt to delete an object under another tenant's
--    prefix. It must fail. A passing SQL check does not substitute for this.
--
-- d) Confirm a normal upload still works from the admin for both an owner and
--    a client, and that existing public images still load.
