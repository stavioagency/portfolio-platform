-- ############################################################################
-- SCHEMA.sql — THE AUTHORITATIVE PICTURE OF THE LIVE DATABASE
-- Project gphrzvjlstznhypcfgre (ap-northeast-1) · verified 2026-07-27
-- ############################################################################
--
-- READ THIS FIRST
-- ---------------
-- This file is DOCUMENTATION, not a migration. It was read back out of the live
-- database, so it is what actually exists — not what someone intended. Do not run
-- it against production: it would be at best a no-op and at worst destructive.
--
-- To CHANGE the schema, write a new section file in supabase/sections/ and apply
-- that, then update this file to match. supabase/history/ holds superseded scripts
-- that must never be re-run; see the README in there.
--
-- WHY THIS EXISTS: there were eleven .sql files totalling ~2,300 lines describing
-- four different overlapping states of the same database, and no way to tell which
-- was true. This is the one that is true.
--
-- ============================================================================
-- THE MODEL IN ONE PARAGRAPH
-- ============================================================================
-- A TENANT is one client's website. Every content row (profile, projects,
-- tenant_domains, analytics_events) carries tenant_id and cascades when the tenant
-- is deleted. Who may edit a tenant is tenant_admins. Who runs the whole platform
-- is platform_owners — currently the two Designakum accounts. Public reads are
-- wide open by design (a portfolio is public); every WRITE goes through
-- is_tenant_admin(), which is true for a tenant's own admins AND for any platform
-- owner. Login accepts a username, resolved to an email by get_email_for_username.


-- >>> EDGE FUNCTION NOT YET DEPLOYED <<<
-- supabase/functions/client-recovery/ handles onboarding recovery: correcting a
-- mistyped client email on the EXISTING auth user, and re-sending the welcome
-- (which necessarily issues a fresh temporary password, since the original is
-- only ever a hash). It is committed but has NOT been deployed to this project.
-- Until it is, the admin's "Edit email" and "Send welcome email" actions report
-- that plainly; copy / WhatsApp / PDF / Reset password all keep working.
-- Deploy it, then delete this notice.
--
-- ============================================================================
-- TABLES
-- ============================================================================

-- tenants — one row per client website.
--   id uuid PK · slug text UNIQUE NOT NULL · name text · default_lang text
--   status text ('active' | 'disabled'; 'disabled' makes the public site 404)
--   created_at timestamptz
--   TRIGGER trg_enroll_platform_owners AFTER INSERT -> enroll_platform_owners()
--
--   >>> NOT YET APPLIED <<<
--   handed_over_at timestamptz NULL — operator state: NULL means the workspace
--   was created but the admin has not confirmed the client received their
--   credentials. Does NOT affect public site resolution. Ships in
--   supabase/sections/section-g-handoff.sql, which has NOT been run against
--   this database. Until it is, the admin's Clients list detects the missing
--   column, logs a console warning, and treats every workspace as handed over —
--   so the pending section simply does not appear. Apply the section file, then
--   delete this notice.

-- tenant_domains — custom domains pointing at a tenant.
--   id uuid PK · tenant_id uuid NOT NULL -> tenants ON DELETE CASCADE
--   domain text UNIQUE NOT NULL · is_primary boolean · status text · created_at
--   UNIQUE (tenant_id) WHERE is_primary  -- at most one primary domain per tenant
--   NOTE: `status` is set by hand and drifts. f9designer.site reads 'error' while
--   the site is verifiably up. It only drives a coloured dot in the Clients list.

-- tenant_admins — who may edit which tenant. PK (tenant_id, user_id).
--   role text ('client' | 'owner') — DESCRIPTIVE ONLY. No policy or function reads
--   it; both values grant identical access to that one tenant. Administering EVERY
--   tenant comes from platform_owners, not from this column.

-- platform_owners — the Designakum accounts. id uuid PK, user_id uuid UNIQUE.

-- admin_usernames — username -> auth user. PK (username).
--   Powers username login via get_email_for_username.

-- profile — one row per tenant (UNIQUE tenant_id). All content is jsonb of the
--   shape {ar, en}: name, tagline, bio, banners, stats, cta_buttons, custom_links,
--   custom_fields, sections, top_ticker, footer, seo, appearance.
--   LEGACY: `links` jsonb predates custom_links and is written but never rendered;
--   one row still holds data. `id` integer PK is a single-tenant leftover — the old
--   CHECK (id = 1) constraint is GONE, tenant_id is the real key.

-- projects — portfolio items. tenant_id NOT NULL, display_order drives ordering.
--   LEGACY: `full_description` is populated on 8 rows; the public page renders
--   `description`.

-- analytics_events — page_view | project_view | link_click (CHECK constrained).
--   tenant_id NOT NULL. `country` exists but is never populated.
--   Unbounded: AnalyticsEditor selects every row in range with no limit.


-- ============================================================================
-- FOREIGN KEYS — every one is ON DELETE CASCADE except where noted
-- ============================================================================
-- admin_usernames.user_id   -> auth.users(id)  CASCADE
-- platform_owners.user_id   -> auth.users(id)  CASCADE
-- tenant_admins.user_id     -> auth.users(id)  CASCADE
-- tenant_admins.tenant_id   -> tenants(id)     CASCADE
-- profile.tenant_id         -> tenants(id)     CASCADE
-- projects.tenant_id        -> tenants(id)     CASCADE
-- tenant_domains.tenant_id  -> tenants(id)     CASCADE
-- analytics_events.tenant_id-> tenants(id)     CASCADE
-- analytics_events.project_id -> projects(id)  SET NULL
--
-- CONSEQUENCE, relied on by the admin: deleting a tenant removes its profile,
-- projects, domains, analytics and access rows in one statement. Deleting an auth
-- user removes their username and every access row.


-- ============================================================================
-- FUNCTIONS  (all SECURITY DEFINER)
-- ============================================================================
-- is_platform_owner()            -> bool   authenticated only
--     EXISTS in platform_owners for auth.uid().
--
-- is_tenant_admin(tid uuid)      -> bool   authenticated only
--     is_platform_owner() OR a tenant_admins row. Gates EVERY write policy.
--
-- can_write_media(object_name)   -> bool   authenticated only
--     Rejects any name containing '..', then is_platform_owner() OR the first path
--     segment equals 't-<tenant_id>' for a tenant the caller administers.
--
-- get_email_for_username(p_username) -> text   ANON + authenticated
--     The ONLY function anon may execute, because the sign-in screen resolves a
--     username before anyone is authenticated. This is the known email-enumeration
--     issue in HANDOFF section 8 — a grant change would break login; it needs an
--     auth-flow change.
--
-- assign_tenant_admin(tenant, username, role default 'client') -> void
--     Owner-gated (raises otherwise). ON CONFLICT DO UPDATE, so re-granting fixes a
--     mis-recorded role instead of doing nothing.
--
-- list_workspace_members()       -> table   authenticated only
--     For owners: which email/username belongs to which workspace, so a client who
--     loses their password can be recovered instead of rebuilt. Returns an EMPTY
--     SET for anyone who is not a platform owner, and never lists owners.
--
-- enroll_platform_owners()       -> trigger   NO grants (fires as the table owner)
--     On tenant INSERT, enrols every platform owner. The browser cannot do this:
--     platform_owners is readable only for your own row.
--
-- REMOVED 2026-07-27: is_admin() — "is this user an admin at all", meaningless once
-- access became per-tenant. Nothing referenced it.


-- ============================================================================
-- ROW LEVEL SECURITY — enabled on every public table
-- ============================================================================
-- READ (public/anon, deliberately wide — a portfolio is public):
--   profile, projects, tenants, tenant_domains .......... USING (true)
--   storage.objects bucket 'media' ...................... USING (bucket_id='media')
--
-- WRITE (authenticated):
--   profile, projects, tenant_domains ... ALL    is_tenant_admin(tenant_id)
--   tenants ............................. INSERT/UPDATE/DELETE  is_platform_owner()
--   tenant_admins ....................... INSERT/UPDATE/DELETE  is_platform_owner()
--   storage.objects ..................... INSERT/UPDATE/DELETE  can_write_media(name)
--
-- OWN-ROW ONLY (authenticated):
--   admin_usernames ..... SELECT  user_id = auth.uid()
--   platform_owners ..... SELECT  user_id = auth.uid()
--   tenant_admins ....... SELECT  user_id = auth.uid()
--     ^ this is why list_workspace_members() has to exist.
--
-- analytics_events: INSERT WITH CHECK (true) for anon+authenticated so anonymous
--   visits can be recorded; SELECT is is_tenant_admin(tenant_id). The permissive
--   INSERT is flagged by the advisor and is intentional — the trade is that anyone
--   can post fake events.


-- ============================================================================
-- INDEXES beyond the primary keys
-- ============================================================================
-- analytics_events: (tenant_id), (created_at DESC), (event_type), (project_id)
-- projects (tenant_id) · tenant_admins (user_id) · tenant_domains (tenant_id)
-- tenant_domains: UNIQUE (tenant_id) WHERE is_primary


-- ============================================================================
-- KNOWN GAPS — see HANDOFF.md sections 7 and 8
-- ============================================================================
-- 1. get_email_for_username is anon-callable and confirms which usernames exist.
-- 2. All 135 objects in the media bucket use legacy FLAT paths, so tenant storage
--    isolation governs only future uploads and clients cannot manage existing media.
-- 3. analytics_events has no retention policy and its admin query is unbounded.
-- 4. tenant_domains.status is set by hand and drifts from reality.
-- 5. Leaked-password protection is a Pro-plan feature; mitigated in
--    lib/pwned-password.js instead.
