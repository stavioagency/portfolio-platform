# Portfolio Platform

A multi-tenant, bilingual (Arabic / English) portfolio platform. Built on Next.js + Supabase, deployed on Vercel.

One app and one Supabase project serve every client. Each client is a **tenant** with their own public site — a card showing their logo, name, banners, stats, projects and links — and their own dashboard to edit it without writing code. Tenant isolation is enforced by Postgres RLS.

**Engineers: read [HANDOFF.md](HANDOFF.md) first.** It is the single source of project context. The live database schema is documented in [supabase/SCHEMA.sql](supabase/SCHEMA.sql).

---

## Tech stack

- **Next.js 14** (Pages Router) — frontend
- **Supabase** — Postgres database, auth, storage, RLS
- **Vercel** — hosting
- **react-image-crop** — manual image cropping on upload
- **Free Google Fonts** — Manrope, Cairo, Reem Kufi, IBM Plex Sans Arabic

---

## Running it locally

1. Clone the repo and `npm install`.
2. Create `.env.local` (gitignored) with the two public Supabase values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   Without them the build fails on `supabaseUrl is required`. Placeholders are
   enough to build or run tests, but every data-driven screen will be empty.
3. `npm run dev`, then sign in at `/admin` with a username and password.

**There is no per-client setup.** Clients are onboarded from inside the admin
(Clients → "+ Add client"), which creates their workspace and account together.
See HANDOFF.md section 7.

**Database changes** go in `supabase/sections/` and are applied by hand; then
update `supabase/SCHEMA.sql` to match. Never run anything in `supabase/history/` —
those scripts are superseded and some are actively wrong for this database.

---

## File map

```
pages/
  index.js          # Public site (client-side rendered); also serves "/"
  [slug].js         # Per-tenant public route; reuses <Home> from index.js
  admin.js          # The entire admin dashboard
lib/                # tenant resolver, onboarding guide, auth helpers, i18n, ...
components/ui/      # Button, Card, Badge, Toast, ConfirmDialog, ...
supabase/
  SCHEMA.sql        # The live schema, documented. Not a migration.
  sections/         # Applied migrations — new changes go here
  history/          # Superseded scripts. DO NOT RUN.
  functions/        # Edge Functions (onboarding, password reset)
tests/              # Node test runner; pure lib modules only
styles/globals.css  # Design tokens
```

---

## Admin dashboard

Owners additionally get **Clients** (the list, plus onboarding) and **Workspace**
(the active tenant's settings and custom domain). Clients see only their own site.

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
1. Add a new file to `supabase/sections/`
2. Make it idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, guarded drops)
3. Apply it to Supabase BEFORE pushing the corresponding code
4. Update `supabase/SCHEMA.sql` so it still describes reality

When making code changes:
- Files in `pages/` are routed automatically by Next.js
- Don't touch `lib/i18n.js` or `lib/brand-icons.js` without testing both EN + AR
- Always add new user-facing strings to `lib/translations.js` (both EN + AR blocks)

---

## License / credits

Built for designakum. Brand icons sourced from [simple-icons](https://simpleicons.org) (CC0).
