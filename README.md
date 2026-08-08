# Portfolio Platform

A multi-tenant, bilingual (Arabic / English) portfolio platform. Built on Next.js + Supabase, deployed on Vercel.

One app and one Supabase project serve every client. Each client is a **tenant** with their own public site — a card showing their logo, name, banners, stats, projects and links — and their own dashboard to edit it without writing code. Tenant isolation is enforced by Postgres RLS.

**Engineers and AI agents: read [docs/GRANDMASTER.md](docs/GRANDMASTER.md) first.** It is the index to the whole documentation system — read it, then only the one document it routes you to. The live database schema is documented in [supabase/SCHEMA.sql](supabase/SCHEMA.sql).

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

**There is no per-client setup**, and there are two ways a workspace comes into
existence:

- **Self-signup.** A visitor arrives from the marketing site at
  `/signup?lang=ar|en&plan=monthly|yearly`, confirms their email, and the
  workspace is created for them — disabled until they pay. This is the public
  route and needs nobody on our side.
- **Owner-invited.** Clients → "+ Add client" creates the workspace and the
  account together, the way it always did. Still right for a done-for-you sale.

Both end at the same place; they differ only in who presses the buttons. See
[docs/architecture/auth.md](docs/architecture/auth.md) for both routes, and
[docs/architecture/billing.md](docs/architecture/billing.md) for where each one
meets checkout.

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
- Every **write** is gated by `is_tenant_admin(tenant_id)` — true for that
  tenant's own admins (`tenant_admins`) and for any platform owner
  (`platform_owners`)
- Storage writes to the `media` bucket are gated the same way
- Entitlement (does this workspace have a live subscription) is decided in
  Postgres by `tenant_has_active_subscription()`
- No billing table is writable from the browser at all — reads only

Enforced by RLS. See [docs/architecture/database.md](docs/architecture/database.md).

---

## Updating content vs updating code

- **Content** (name, bio, projects, banners, etc.) → go to `/admin`, edit, save. Live immediately.
- **Code** (design changes, new features) → edit files on GitHub directly. Vercel auto-redeploys within ~1 minute.

---

## Common issues

**"Application error" on first visit**
Check Vercel → your project → Logs. Almost always: env vars missing. Set them in Project → Settings → Environment Variables, then redeploy.

**Can't sign into /admin**
- Does the user have an `admin_usernames` row (username login) and a
  `tenant_admins` row for the workspace?
- Is the user confirmed in Supabase → Authentication → Users?
- See [docs/architecture/auth.md](docs/architecture/auth.md) before assuming it
  is a data problem — at the last audit, none of them were.

**No email arrived**
Check `RESEND_API_KEY` in the Edge Function logs **first**. Mail failures are
deliberately silent, so a missing key looks exactly like working software.
[docs/architecture/emails.md](docs/architecture/emails.md).

**Images not uploading**
- Check the `media` bucket exists and is **Public**
- The signed-in user must be an admin of that tenant

**Schema cache errors ("Could not find column X")**
A migration in `supabase/sections/` has not been applied. Apply it in the
Supabase SQL editor, then update `supabase/SCHEMA.sql`. Never run anything in
`supabase/history/`.

**Public site card is empty**
Visit `/admin` → Card tab → add at least one banner, stat, or CTA button. Or add some projects.

---

## Deferred / not yet implemented

The current list lives in [docs/features/planned.md](docs/features/planned.md);
[docs/features/completed.md](docs/features/completed.md) says what is already
built.

Long-standing small gaps not tracked there:

- **Real geo IP** for the country column in Analytics (always "Unknown")
- **Image optimization** via `next/image` (currently plain `<img>`)
- **Sitemap.xml / robots.txt** for SEO

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
