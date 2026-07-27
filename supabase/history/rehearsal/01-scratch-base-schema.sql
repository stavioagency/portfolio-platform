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
-- Copied from the canonical  supabase-complete.sql  (repo root).
-- Use ONLY on the scratch Supabase project (e.g. "portfolio-mt-scratch").
-- DO NOT run on production. DO NOT run Section C.
-- Confirm the Supabase project name (top-left of the SQL editor) before Run.
--
-- STEP 1 of the scratch rehearsal — apply the BASE (single-tenant) schema.
-- This file is self-contained: paste ALL of it into the SCRATCH SQL editor and
-- Run. Then proceed to 02-scratch-multitenant-section-a.sql.
--
-- Source of truth remains supabase-complete.sql; this is a point-in-time copy
-- for the rehearsal runbook. If the canonical base schema changes, refresh this.
-- ############################################################################

-- ================================================
-- designakum portfolio - COMPLETE database setup
-- Run this ONE file in the Supabase SQL Editor.
-- (Original setup + all 9 migrations, in order.)
-- ================================================


-- ---------- supabase-setup.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — SUPABASE SCHEMA
-- Paste this entire file into Supabase SQL Editor and click "Run"
-- =========================================================

-- 1. Profile table (single row, id = 1)
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT,
  tagline TEXT,
  bio TEXT,
  profile_image TEXT,
  default_lang TEXT DEFAULT 'ar',
  links JSONB DEFAULT '{}'::jsonb,
  appearance JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_profile CHECK (id = 1)
);

-- 2. Projects table
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  full_description TEXT,
  cover_image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  external_url TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Public read access (anyone visiting the site can see content)
ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read profile" ON profile FOR SELECT USING (true);
CREATE POLICY "Public can read projects" ON projects FOR SELECT USING (true);

-- Table-level SELECT privilege for the public roles. RLS above decides WHICH
-- rows are visible; this GRANT decides whether the role may touch the table at
-- all. A fresh project does not auto-grant these, so without it the anon key
-- gets "42501 permission denied for table profile". Read-only; no write access.
GRANT SELECT ON profile, projects TO anon, authenticated;

-- 4. Authenticated users can write (admin)
CREATE POLICY "Authed can write profile" ON profile
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authed can write projects" ON projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Storage bucket for media (run in Storage section if SQL doesn't work for buckets):
-- Go to Storage → New bucket → Name it "media" → Make it Public

-- After bucket created, set storage policies:
CREATE POLICY "Public can view media" ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

CREATE POLICY "Authed can upload media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');

CREATE POLICY "Authed can update media" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'media');

CREATE POLICY "Authed can delete media" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'media');

-- 6. Seed initial profile row so the site doesn't 404 on first load
INSERT INTO profile (id, name, tagline, default_lang)
VALUES (1, 'Your Name', 'Your Tagline', 'ar')
ON CONFLICT (id) DO NOTHING;


-- ---------- supabase-migration-v2.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — MIGRATION v2
-- Adds: bilingual JSONB content, analytics, usernames,
--       custom fields, custom links, section toggles,
--       expanded appearance.
--
-- HOW TO RUN:
-- 1. Open Supabase → SQL Editor → New query
-- 2. Paste this entire file
-- 3. Click "Run"
-- 4. Should see "Success. No rows returned."
--
-- SAFE TO RE-RUN: every statement uses IF NOT EXISTS or a guard.
-- BACKUP FIRST if you have content you can't lose:
--   Supabase → Database → Backups → Take a backup.
-- =========================================================


-- ---------------------------------------------------------
-- 1. PROFILE: convert text columns to bilingual JSONB
-- ---------------------------------------------------------
-- Each becomes { "en": "...", "ar": "..." } so the same row
-- holds both languages. Existing text moves into the "en" key.
-- ---------------------------------------------------------

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name='profile' AND column_name='name') = 'text' THEN
    ALTER TABLE profile ALTER COLUMN name TYPE JSONB
      USING jsonb_build_object('en', COALESCE(name, ''), 'ar', '');
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name='profile' AND column_name='tagline') = 'text' THEN
    ALTER TABLE profile ALTER COLUMN tagline TYPE JSONB
      USING jsonb_build_object('en', COALESCE(tagline, ''), 'ar', '');
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name='profile' AND column_name='bio') = 'text' THEN
    ALTER TABLE profile ALTER COLUMN bio TYPE JSONB
      USING jsonb_build_object('en', COALESCE(bio, ''), 'ar', '');
  END IF;
END $$;


-- ---------------------------------------------------------
-- 2. PROFILE: new columns for custom fields, section visibility,
--    and the new custom-links list (replaces fixed `links`)
-- ---------------------------------------------------------
-- custom_fields: [{ label:{en,ar}, value:{en,ar} }, ...]
-- custom_links:  [{ icon, label:{en,ar}, href, display_order }, ...]
-- sections:      { bio:true, custom_fields:true, projects:true, links:true, lang_switcher:false }
-- ---------------------------------------------------------

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_links  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sections      JSONB DEFAULT
    '{"bio":true,"custom_fields":true,"projects":true,"links":true,"lang_switcher":true}'::jsonb;

-- Backfill custom_links from old `links` map so nothing disappears.
-- Old shape: { instagram:"...", whatsapp:"...", email:"...", ... }
-- New shape: array of {icon, label, href, display_order}
UPDATE profile
SET custom_links = (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'icon',  CASE key
                 WHEN 'instagram' THEN '📷'
                 WHEN 'twitter'   THEN '𝕏'
                 WHEN 'linkedin'  THEN '💼'
                 WHEN 'behance'   THEN '🎨'
                 WHEN 'whatsapp'  THEN '💬'
                 WHEN 'email'     THEN '✉️'
                 WHEN 'website'   THEN '🌐'
                 ELSE '🔗'
               END,
      'label', jsonb_build_object(
                 'en', initcap(key),
                 'ar', CASE key
                         WHEN 'instagram' THEN 'إنستجرام'
                         WHEN 'twitter'   THEN 'إكس'
                         WHEN 'linkedin'  THEN 'لينكدإن'
                         WHEN 'behance'   THEN 'بيهانس'
                         WHEN 'whatsapp'  THEN 'واتساب'
                         WHEN 'email'     THEN 'البريد'
                         WHEN 'website'   THEN 'الموقع'
                         ELSE initcap(key)
                       END),
      'href',          value,
      'display_order', ord
    ) ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_each_text(COALESCE(links, '{}'::jsonb)) WITH ORDINALITY AS t(key, value, ord)
  WHERE value IS NOT NULL AND value <> ''
)
WHERE id = 1 AND custom_links = '[]'::jsonb;


-- ---------------------------------------------------------
-- 3. PROJECTS: convert text columns to bilingual JSONB
-- ---------------------------------------------------------

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name='projects' AND column_name='title') = 'text' THEN
    ALTER TABLE projects ALTER COLUMN title DROP NOT NULL;
    ALTER TABLE projects ALTER COLUMN title TYPE JSONB
      USING jsonb_build_object('en', COALESCE(title, ''), 'ar', '');
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name='projects' AND column_name='description') = 'text' THEN
    ALTER TABLE projects ALTER COLUMN description TYPE JSONB
      USING jsonb_build_object('en', COALESCE(description, ''), 'ar', '');
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name='projects' AND column_name='full_description') = 'text' THEN
    ALTER TABLE projects ALTER COLUMN full_description TYPE JSONB
      USING jsonb_build_object('en', COALESCE(full_description, ''), 'ar', '');
  END IF;
END $$;


-- ---------------------------------------------------------
-- 4. ANALYTICS EVENTS
-- ---------------------------------------------------------
-- Append-only event log. One row per page view / project view /
-- contact-link click. Filter by event_type at read time.
-- visitor_id is a random ID stored in localStorage by the public
-- site (not a fingerprint, not a cookie — privacy-friendly).
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS analytics_events (
  id           BIGSERIAL PRIMARY KEY,
  event_type   TEXT NOT NULL CHECK (event_type IN ('page_view','project_view','link_click')),
  project_id   BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  link_key     TEXT,
  path         TEXT,
  referrer     TEXT,
  country      TEXT,
  user_agent   TEXT,
  visitor_id   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_type_idx    ON analytics_events (event_type);
CREATE INDEX IF NOT EXISTS analytics_events_project_idx ON analytics_events (project_id);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert events (the public site needs to log them)
DROP POLICY IF EXISTS "Anyone can log event" ON analytics_events;
CREATE POLICY "Anyone can log event" ON analytics_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Table-level INSERT privilege for the public roles. The policy above decides the
-- insert is ALLOWED; this GRANT lets the role touch the table at all. A fresh
-- project does not auto-grant it, so without it the anon key gets
-- "42501 permission denied for table analytics_events". INSERT only — the public
-- roles still cannot SELECT/UPDATE/DELETE events (reads stay admin-only).
GRANT INSERT ON analytics_events TO anon, authenticated;

-- `analytics_events.id` is BIGSERIAL, so every insert calls nextval() on its
-- sequence. Table INSERT does NOT carry sequence rights, so without this a fresh
-- project fails the insert with "42501 permission denied for sequence
-- analytics_events_id_seq". USAGE only (permits nextval) — no read of sequence
-- values, no other privilege, no change to analytics read access.
GRANT USAGE ON SEQUENCE analytics_events_id_seq TO anon, authenticated;

-- Only admins can read events (analytics tab)
DROP POLICY IF EXISTS "Authed can read events" ON analytics_events;
CREATE POLICY "Authed can read events" ON analytics_events
  FOR SELECT TO authenticated USING (true);


-- ---------------------------------------------------------
-- 5. USERNAME SIGN-IN
-- ---------------------------------------------------------
-- Supabase auth requires email. We store a username alongside,
-- and the sign-in form looks up the email by username via an
-- RPC. The RPC is SECURITY DEFINER so it can read the mapping
-- without exposing the whole table.
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_usernames (
  username TEXT PRIMARY KEY,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_usernames ENABLE ROW LEVEL SECURITY;
-- No public policies — only accessible via the RPC below.

-- Lookup function: given a username, return the matching email.
-- Returns NULL if not found (frontend shows "invalid credentials").
CREATE OR REPLACE FUNCTION get_email_for_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT u.email INTO v_email
  FROM admin_usernames au
  JOIN auth.users u ON u.id = au.user_id
  WHERE au.username = lower(trim(p_username));
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_email_for_username(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------
-- After running this migration, you need to MANUALLY create a
-- username for your existing admin user. Run this once,
-- replacing 'akum' and the email with your values:
--
--   INSERT INTO admin_usernames (username, user_id)
--   SELECT 'akum', id FROM auth.users WHERE email = 'you@example.com';
--
-- After that, sign in at /admin with the username instead of the email.
-- ---------------------------------------------------------


-- ---------------------------------------------------------
-- 6. APPEARANCE: nothing to change in schema — `appearance`
--    column is already JSONB. New keys (font_heading, font_body,
--    density, radius_preset, color tokens) just get added by
--    the admin UI when you save. No migration needed.
-- ---------------------------------------------------------


-- ---------------------------------------------------------
-- DONE.
-- ---------------------------------------------------------
-- Don't forget: run the INSERT statement above to give your
-- existing admin user a username, otherwise you won't be able
-- to log in with the new username form.
-- ---------------------------------------------------------


-- ---------- supabase-migration-v3.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — MIGRATION v3
-- Adds the homepage "Card" data: banners, stats, CTA buttons,
-- and brand_logo.
--
-- HOW TO RUN:
-- 1. Open Supabase → SQL Editor → New query
-- 2. Paste this entire file
-- 3. Click "Run"
-- 4. Should see "Success. No rows returned."
--
-- SAFE TO RE-RUN.
-- =========================================================

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS banners     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stats       JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_buttons JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_logo  TEXT;

-- Reference shapes:
--
-- banners: [
--   {
--     "id": "uuid-string",
--     "type": "image" | "text",
--     "image_url": "https://...",          // when type=image
--     "text":     { "en": "...", "ar": "..." },  // when type=text
--     "subtitle": { "en": "...", "ar": "..." },  // optional
--     "bg":       "purple" | "blue" | "sunset" | "forest" | "custom",
--     "bg_color1": "#7a72d6",              // when bg=custom
--     "bg_color2": "#9FA7FF",              // when bg=custom
--     "font":     "calligraphy" | "modern" | "serif"
--   }, ...
-- ]
--
-- stats: [
--   {
--     "id": "uuid-string",
--     "label": { "en": "Rating",  "ar": "التقييم" },
--     "value": { "en": "★ 4.9",  "ar": "★ 4.9" }
--   }, ...   // up to 3
-- ]
--
-- cta_buttons: [
--   {
--     "id": "uuid-string",
--     "icon":   "whatsapp" | "instagram" | "x" | ... | "custom",
--     "label":  { "en": "Contact me on WhatsApp", "ar": "تواصل معي عبر واتساب" },
--     "action": "link" | "open_projects",
--     "href":   "https://wa.me/97450000000"   // when action=link
--   }, ...
-- ]


-- ---------- supabase-migration-v4.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — MIGRATION v4
-- Adds project metadata columns (client / year / role).
-- Everything else needed by the polished admin is already
-- present from migrations v2 + v3.
--
-- HOW TO RUN:
-- Supabase → SQL Editor → + New query → paste → Run.
-- Safe to re-run.
-- =========================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client TEXT,
  ADD COLUMN IF NOT EXISTS year   TEXT,
  ADD COLUMN IF NOT EXISTS role   TEXT;

-- Notes:
-- client/year/role are plain TEXT (not bilingual) — client names and dates
-- usually stay the same across languages. If a client wants the value in
-- Arabic they can type the Arabic value.


-- ---------- supabase-migration-v5.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — MIGRATION v5
-- Fixes a bug in migration v3 where the backfill of `links`
-- → `custom_links` set the icon field to emoji strings
-- instead of brand keys (e.g. '📷' instead of 'instagram').
--
-- HOW TO RUN:
-- Supabase → SQL Editor → + New query → paste → Run.
-- Safe to re-run (idempotent — only fixes emoji values).
-- =========================================================

UPDATE profile
SET custom_links = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN link->>'icon' = '📷' THEN jsonb_set(link, '{icon}', '"instagram"')
      WHEN link->>'icon' = '𝕏'  THEN jsonb_set(link, '{icon}', '"x"')
      WHEN link->>'icon' = '💼' THEN jsonb_set(link, '{icon}', '"linkedin"')
      WHEN link->>'icon' = '🎨' THEN jsonb_set(link, '{icon}', '"behance"')
      WHEN link->>'icon' = '💬' THEN jsonb_set(link, '{icon}', '"whatsapp"')
      WHEN link->>'icon' = '✉️' THEN jsonb_set(link, '{icon}', '"email"')
      WHEN link->>'icon' = '🌐' THEN jsonb_set(link, '{icon}', '"website"')
      WHEN link->>'icon' = '🔗' THEN jsonb_set(link, '{icon}', '"website"')
      ELSE link
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(custom_links, '[]'::jsonb)) AS link
)
WHERE id = 1
  AND custom_links IS NOT NULL
  AND jsonb_typeof(custom_links) = 'array';


-- ---------- supabase-migration-v6.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — MIGRATION v6 (SECURITY HARDENING)
-- Tightens RLS so only users in admin_usernames can write
-- (previously: any authenticated user could write).
--
-- HOW TO RUN: Supabase → SQL Editor → + New query → paste → Run.
-- Safe to re-run (idempotent).
-- =========================================================

-- 1. Drop old over-permissive policies
DROP POLICY IF EXISTS "Authed can write profile"  ON profile;
DROP POLICY IF EXISTS "Authed can write projects" ON projects;
DROP POLICY IF EXISTS "Authed can read events"    ON analytics_events;

-- 2. Profile: only admins can write
DROP POLICY IF EXISTS "Admins can write profile" ON profile;
CREATE POLICY "Admins can write profile" ON profile
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid()));

-- 3. Projects: only admins can write
DROP POLICY IF EXISTS "Admins can write projects" ON projects;
CREATE POLICY "Admins can write projects" ON projects
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid()));

-- 4. Analytics: only admins can read; INSERT policy from v2 stays (public can log events)
DROP POLICY IF EXISTS "Admins can read events" ON analytics_events;
CREATE POLICY "Admins can read events" ON analytics_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid()));

-- 5. Storage: tighten media uploads to admins only (was: any authenticated user)
DROP POLICY IF EXISTS "Authed can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Authed can update media" ON storage.objects;
DROP POLICY IF EXISTS "Authed can delete media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete media" ON storage.objects;

CREATE POLICY "Admins can upload media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid()));

CREATE POLICY "Admins can delete media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid()));

-- Note: the "Public can view media" SELECT policy from setup.sql stays — visitors
-- need to load images. Only writes are restricted.

-- =========================================================
-- After running this: any signed-in user NOT in admin_usernames
-- can no longer write to profile/projects or upload media.
-- The two users you have (feras + f9f9) ARE in admin_usernames,
-- so the admin continues to work for them. Just verify after deploy.
-- =========================================================


-- ---------- supabase-migration-v7.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — MIGRATION v7 (FIX FOR v6 RLS BUG)
--
-- Migration v6 tried to gate writes by checking `EXISTS (SELECT 1
-- FROM admin_usernames WHERE user_id = auth.uid())` inside the
-- policies. But admin_usernames has RLS enabled and NO read policy,
-- so the EXISTS check always returned FALSE for authenticated users
-- → all admin writes were rejected.
--
-- Fix: replace the inline EXISTS with an is_admin() SECURITY DEFINER
-- function. SECURITY DEFINER runs as the function owner (postgres),
-- bypassing the admin_usernames RLS. Safe because the function only
-- returns a boolean — it never exposes the table contents.
--
-- HOW TO RUN: Supabase → SQL Editor → + New query → paste → Run.
-- Safe to re-run.
-- =========================================================

-- 1. Create the helper function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- 2. Rewrite the policies to use is_admin()
DROP POLICY IF EXISTS "Admins can write profile"  ON profile;
DROP POLICY IF EXISTS "Admins can write projects" ON projects;
DROP POLICY IF EXISTS "Admins can read events"    ON analytics_events;
DROP POLICY IF EXISTS "Admins can upload media"   ON storage.objects;
DROP POLICY IF EXISTS "Admins can update media"   ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete media"   ON storage.objects;

CREATE POLICY "Admins can write profile" ON profile
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins can write projects" ON projects
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins can read events" ON analytics_events
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can upload media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND is_admin());

CREATE POLICY "Admins can update media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND is_admin());

CREATE POLICY "Admins can delete media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND is_admin());

-- =========================================================
-- After running this, admins (feras, f9f9) can write again.
-- Verify by signing into /admin and saving anything in Profile.
-- =========================================================


-- ---------- supabase-migration-v8.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — MIGRATION v8
-- Adds the "Top ticker" — a scrolling text strip at the very
-- top of the public site, above the card.
--
-- HOW TO RUN: Supabase → SQL Editor → + New query → paste → Run.
-- Safe to re-run.
-- =========================================================

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS top_ticker JSONB DEFAULT '{}'::jsonb;

-- Shape (admin writes this):
-- {
--   "enabled":     true,
--   "text":        { "en": "...", "ar": "..." },
--   "bg_color":    "#9FA7FF",
--   "text_color":  "#ffffff",
--   "speed":       "medium"   // "slow" | "medium" | "fast"
-- }


-- ---------- supabase-migration-v9.sql ----------

-- =========================================================
-- PORTFOLIO PLATFORM — MIGRATION v9
-- Adds a `footer` JSONB column so the user's copyright/footer
-- text and color is customizable (the "made by designakum"
-- credit is kept fixed in code below it).
--
-- HOW TO RUN: Supabase → SQL Editor → + New query → paste → Run.
-- Safe to re-run.
-- =========================================================

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS footer JSONB DEFAULT '{}'::jsonb;

-- Shape:
-- {
--   "text":  { "en": "© ...", "ar": "..." },   // user's custom footer line (line 1)
--   "color": "rgba(255,255,255,0.3)"           // color for both the user line and the designakum credit
-- }


-- ---------- favicon support (added) ----------

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS favicon_url TEXT;


-- ---------- SEO support (added) ----------
-- Shape: { "title": {en,ar}, "description": {en,ar}, "og_image": "https://..." }
ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS seo JSONB DEFAULT '{}'::jsonb;
