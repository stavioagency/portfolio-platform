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
