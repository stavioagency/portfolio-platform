# Portfolio Platform

A self-hosted, bilingual (Arabic / English) portfolio site + admin dashboard. Built on Next.js + Supabase, deployed on Vercel.

The public site is a "linktree-style" card showing your brand logo, name, banners, stats, and CTA buttons. The admin lets you edit every piece of it without writing code.

---

## Tech stack

- **Next.js 14** (Pages Router) — frontend
- **Supabase** — Postgres database, auth, storage, RLS
- **Vercel** — hosting
- **react-image-crop** — manual image cropping on upload
- **Free Google Fonts** — Manrope, Cairo, Reem Kufi, IBM Plex Sans Arabic

---

## First-time setup (single-tenant)

1. **Create Supabase project** → https://supabase.com/dashboard
2. **Run the SQL migrations in order**, each in Supabase SQL Editor:
   - `supabase-setup.sql`        (base schema)
   - `supabase-migration-v2.sql` (bilingual fields, analytics, usernames)
   - `supabase-migration-v3.sql` (banners, stats, CTA buttons, brand logo)
   - `supabase-migration-v4.sql` (project metadata: client / year / role)
   - `supabase-migration-v5.sql` (icon backfill fix)
   - `supabase-migration-v6.sql` (RLS hardening — admins only can write)
3. **Create the `media` storage bucket** in Supabase → Storage → New bucket → Public
4. **Create an admin auth user** in Supabase → Authentication → Users → Add user (with Auto Confirm)
5. **Create a username for that user**:
   ```sql
   INSERT INTO admin_usernames (username, user_id)
   SELECT 'yourusername', id FROM auth.users WHERE email = 'you@example.com';
   ```
6. **Deploy to Vercel**:
   - Connect this GitHub repo
   - Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Deploy
7. **Sign in at `/admin`** with your username + password

---

## File map

```
pages/
  index.js          # Public site — the linktree-style card
  admin.js          # Admin dashboard — 7 tabs
  _app.js           # Next.js root + react-image-crop CSS
  _document.js      # HTML lang/dir default + favicon
lib/
  supabase.js       # Supabase client
  i18n.js           # Bilingual JSON helpers (pick / setLangValue)
  translations.js   # UI strings (EN + AR)
  brand-icons.js    # Inline SVG paths for 25+ social platforms
styles/
  globals.css       # Design tokens (colors, fonts, spacing, radii)
public/
  favicon.svg
next.config.js      # Image domains + security headers
package.json
```

---

## Admin dashboard — 7 tabs

| Tab | What it controls |
|---|---|
| **Profile** | Name, tagline, bio (all bilingual), profile image, custom fields, section visibility toggles |
| **Card** | Brand logo, banners (text or image, up to 5, slider), stats (up to 3), CTA buttons |
| **Projects** | Add / edit / reorder projects, bilingual title + descriptions, cover + gallery images, optional client / year / role metadata |
| **Links** | Social + contact links with icon picker (25+ brands), bilingual labels, drag to reorder |
| **Appearance** | Theme presets, color tokens, fonts, density, corner roundness, live device preview |
| **Analytics** | Page views, unique visitors, project views, contact clicks, top referrers, country breakdown |
| **Account** | Signed-in user, default language (also flips admin chrome), change password, danger zone |

---

## Bilingual model

Every user-facing string is bilingual:

- **Admin chrome strings** live in `lib/translations.js` (keyed)
- **User content** (name, bio, project titles, etc.) is stored as JSONB `{ en: "...", ar: "..." }` in the database; read via `pick(field, lang)`
- **One language toggle** (sidebar top-right with globe icon) controls BOTH the admin chrome AND which language of bilingual content is being edited

When the chrome is set to Arabic, the whole UI flips RTL and every input you fill in saves to the Arabic side of the bilingual JSON.

---

## How content flows

```
Admin edits in admin.js
        ↓
Supabase JSONB columns (profile.name, projects.title, etc.)
        ↓
Public site (index.js) reads via pick(field, lang) → shows in visitor's chosen language
```

Analytics events are inserted by the public site on every page view / project view / link click, into `analytics_events`. The Analytics tab reads them.

---

## Security model

- Public can **read** profile + projects (so the site renders for visitors)
- Public can **insert** into `analytics_events` (so the site can log views)
- Only users in `admin_usernames` can **write** to profile / projects or **read** analytics events
- Only users in `admin_usernames` can upload / modify / delete in the `media` storage bucket
- Auth.users without an `admin_usernames` row have read-only access — even if they sign up via Supabase Auth somehow

This is enforced by RLS policies set up in migration v6.

---

## Updating content vs updating code

- **Content** (name, bio, projects, banners, etc.) → go to `/admin`, edit, save. Live immediately.
- **Code** (design changes, new features) → edit files on GitHub directly. Vercel auto-redeploys within ~1 minute.

---

## Common issues

**"Application error" on first visit**
Check Vercel → your project → Logs. Almost always: env vars missing. Set them in Project → Settings → Environment Variables, then redeploy.

**Can't sign into /admin**
- Did you run the `INSERT INTO admin_usernames` step?
- Is the user "Auto Confirmed" in Supabase → Authentication → Users?
- Try resetting the password from Supabase Auth dashboard.

**Images not uploading**
- Check the `media` bucket exists and is **Public**
- After migration v6, only users in `admin_usernames` can upload — make sure the signed-in user is in that table

**Schema cache errors ("Could not find column X")**
You haven't run a migration. Run all migrations in order (v2 → v6).

**Public site card is empty**
Visit `/admin` → Card tab → add at least one banner, stat, or CTA button. Or add some projects.

---

## Deferred / not yet implemented

Things on the roadmap but not built:

- **Custom domain** — point your domain at Vercel (add in Vercel → Settings → Domains)
- **Multi-tenant** — currently one deployment = one portfolio. To serve multiple designers, you'd need a tenant column and per-tenant routing
- **Real geo IP** for the country column in Analytics (currently always shows "Unknown")
- **Image optimization** via `next/image` (currently using plain `<img>`)
- **Sitemap.xml / robots.txt** for SEO
- **Email config** in Supabase for working password resets (Auth → Email Templates → SMTP)

---

## Maintenance notes for future deploys

When making schema changes:
1. Create a new `supabase-migration-vN.sql`
2. Make it idempotent (`IF NOT EXISTS`, guard with checks)
3. Add it to the migration list in this README
4. Run it in Supabase BEFORE pushing the corresponding code

When making code changes:
- Files in `pages/` are routed automatically by Next.js
- Don't touch `lib/i18n.js` or `lib/brand-icons.js` without testing both EN + AR
- Always add new user-facing strings to `lib/translations.js` (both EN + AR blocks)

---

## License / credits

Built for designakum. Brand icons sourced from [simple-icons](https://simpleicons.org) (CC0).
