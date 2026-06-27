# Portfolio Platform — Project Operations Document (Verified)

> Generated 2026-05-25 by direct inspection of the repository. Every line is classified:
> **✅ VERIFIED** (confirmed from files/config) · **⚠️ NEEDS VERIFICATION** (likely, not provable from
> repo) · **❌ ASSUMPTION** (from conversation, not confirmed in repo).
>
> Rule of thumb: anything that lives **outside** this git repo (Vercel dashboard, Supabase dashboard,
> DNS, the live project ref) could NOT be verified from files and is marked ⚠️ or ❌. Confirm those in
> the respective dashboards before trusting them.

---

## 0. ⚠️ READ THIS FIRST — Things that WILL confuse you in 6 months

1. **✅ The real app code lives ONLY in `pages/`, `lib/`, `styles/`.** (Historical note: stale
   duplicate copies of these files used to sit at the repo root and were a major confusion trap;
   they were removed in commit `0ce6b16`. There is now one obvious place to edit.)
2. **✅ There is a second, STALE working folder on this Mac:**
   `/Users/feras/Downloads/portfolio-platform-main` — **not** a git repo, not connected to anything.
   The live, git-connected folder is `/Users/feras/Documents/GitHub/portfolio-platform-new/Portfolio Project`.
   Editing the Downloads one is a dead end.
3. **❌ The live Supabase project ref is NOT in the repo.** It was given in conversation
   (`fzjojgknisasomihduul`) but cannot be confirmed from any file. Verify in Supabase + Vercel env vars.
4. **✅ The database setup file is `supabase-complete.sql`** — run this one file for new clients.
   (The old 66-line base `supabase-setup.sql` is superseded and now lives in `/archive`.)

---

## 1. Project Overview

- **Purpose:** ❌ ASSUMPTION (from conversation) — a bilingual EN/AR portfolio-website builder sold by
  designakum to Arab freelancers. *Not derivable from repo files alone.*
- **Current status:** ⚠️ NEEDS VERIFICATION — feature-complete single-tenant v1, one client live.
  Repo facts that support "active/maintained": ✅ branch `main` is in sync with origin, latest commit
  `5f8e3c9 Update index.js`.
- **Intended users:** ❌ ASSUMPTION — non-technical Arab creators. Repo contains full EN+AR strings
  (✅ `lib/translations.js`, 522 lines) which confirms **bilingual intent**, but not the audience.
- **Business purpose:** ❌ ASSUMPTION — paid per-client setup service. Not in repo.

---

## 2. Repository Information

- **GitHub repo name:** ✅ VERIFIED `portfolio-platform`
- **GitHub owner:** ✅ VERIFIED `stavioagency` (from `git remote -v` →
  `https://github.com/stavioagency/portfolio-platform.git`)
- **Which human/account pushes:** ⚠️ NEEDS VERIFICATION — `stavioagency` is the org; the personal
  GitHub login used in GitHub Desktop is not provable from the repo.
- **Branch structure:** ✅ VERIFIED — single branch `main` only. Remote: `origin/main` (+ `origin/HEAD
  → origin/main`). No `dev`/`staging`/feature branches exist.
- **Sync state:** ✅ VERIFIED — local `main` is **0 ahead / 0 behind** origin. Working tree clean
  except this untracked `OPERATIONS.md`.
- **Local project location (source of truth):** ✅ VERIFIED
  `/Users/feras/Documents/GitHub/portfolio-platform-new/Portfolio Project`
- **Source of truth:** ✅ `origin/main` on GitHub = canonical. The git-connected local clone above
  mirrors it. ⚠️ Everything else on disk (the Downloads folder) is NOT source of truth.

---

## 3. Hosting

- **Hosting provider:** ❌ ASSUMPTION (Vercel). **No `vercel.json` or `.vercel` exists in the repo**,
  so hosting is **not provable from files**. `next.config.js` is generic Next.js (✅ exists) and works
  on any Next host.
- **Account used:** ⚠️ NEEDS VERIFICATION — not in repo.
- **Deployment method:** ❌ ASSUMPTION — git push → auto-deploy. Not provable from repo (no CI config,
  no `.github/workflows`).
- **Production URL:** ❌ ASSUMPTION — `https://www.f9designer.site`. Not in any file.
- **Preview URLs:** ⚠️ NEEDS VERIFICATION — provider default (e.g. `*.vercel.app`) if on Vercel.
- **Custom domains:** ❌ ASSUMPTION — `f9designer.site` (apex via GoDaddy forwarding) +
  `www.f9designer.site` (CNAME). None of this is in the repo; confirm in the host + GoDaddy DNS.

> To make hosting **verifiable in-repo**, add a `vercel.json` (even minimal) — see §15.

---

## 4. Database (Supabase)

Schema facts below are ✅ VERIFIED from `supabase-complete.sql`. The *project instance* details are not.

- **Supabase project reference:** ❌ ASSUMPTION `fzjojgknisasomihduul` (from conversation). **Not in
  repo.** A second ref `gphrzvjlstznhypcfgre` was mentioned historically — **unverified**. Confirm
  which one the live env vars point at.
- **Supabase account owner:** ⚠️ NEEDS VERIFICATION — not in repo.
- **Tables:** ✅ VERIFIED (CREATE TABLE in SQL + `.from()` calls in code):
  - `profile` · `projects` · `analytics_events` · `admin_usernames`
  - ⚠️ Note: code also contains `.from('media')` matches — these are the **storage** calls
    (`supabase.storage.from('media')`), **not** a table. No `media` table exists.
- **Functions:** ✅ VERIFIED — `is_admin(...)` and `get_email_for_username(...)` (CREATE FUNCTION in
  SQL). `is_admin` is used inside RLS policies.
- **Storage buckets:** ✅ VERIFIED (referenced) — a single public bucket **`media`**. ⚠️ The bucket is
  created **manually in the dashboard** (the SQL only sets its policies; it has a comment "Go to
  Storage → New bucket → Make it Public"). So the bucket's existence is per-project manual, not SQL.
- **Auth configuration:** ✅ VERIFIED (partial) — username→email mapping via `admin_usernames`
  (`user_id UUID REFERENCES auth.users(id)`) and the `get_email_for_username` function. ⚠️ SMTP /
  email provider / password-reset settings are **dashboard-only**, not in repo — unverified.
- **RLS policies:** ✅ VERIFIED — RLS enabled on all 4 tables. Policies in SQL include:
  public-read on `profile`/`projects`, "anyone can log event" insert on `analytics_events`, and
  **admin-only writes** gated by `EXISTS (SELECT 1 FROM admin_usernames WHERE user_id = auth.uid())`.
  ⚠️ The SQL contains **both** an early permissive set ("Authed can write…") **and** later tightened
  ("Admins can write…") policies that `DROP` and recreate — net effect is admin-gated, but the file
  carries historical layers (see §11).

---

## 5. Environment Variables

✅ VERIFIED from `lib/supabase.js` — the entire env surface is **two** variables:

| Variable | Where it lives | Production-critical? | Verified |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Host env vars (⚠️ Vercel) + local `.env.local` | **Yes** — app can't reach DB without it | ✅ (used in code) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Host env vars (⚠️ Vercel) + local `.env.local` | **Yes** | ✅ (used in code) |

- ✅ No `.env` file is committed (none exists in repo) — correct.
- ✅ No secrets are hardcoded anywhere in code (grep for supabase refs/keys = none).
- ⚠️ The actual values are stored in the host's env settings and Supabase dashboard — not in repo.

---

## 6. Deployment Process

⚠️ The exact mechanism is host-dependent and not provable from repo. Assuming the intended
GitHub-Desktop → GitHub → host-auto-deploy flow (❌ ASSUMPTION):

1. Edit files in the canonical clone (`pages/`, `lib/`, `styles/`, `public/`).
2. GitHub Desktop → review diff → Commit to `main` → **Push origin**.
3. Host detects the push and rebuilds automatically.
4. Verify the new build is live; hard-refresh (Cmd+Shift+R) / private window for cache.

**Schema changes:** ✅ if a change needs a new column, each existing client's Supabase must run the
SQL manually (e.g. `ALTER TABLE profile ADD COLUMN IF NOT EXISTS …`). New clients get everything from
`supabase-complete.sql`.

**Rollback:** ⚠️ NEEDS VERIFICATION — if on Vercel, redeploy a previous deployment from the dashboard,
**or** `git revert <bad-commit>` → push. No rollback tooling exists in-repo.

**Common deployment mistakes (✅ grounded in this repo's real traps):**
- Editing the **stale Downloads folder** → never reaches git.
- Hand-uploading files via github.com web UI → caused branch divergence before (visible as the merge
  commit `c9798cd` in history). Use GitHub Desktop only.
- Forgetting to run a new migration on an existing client's DB → "column not found" errors.

---

## 7. Local Development Process

- **Required software:** ✅ Node.js (a working `node v24.16.0` is present on this machine) + npm.
  ⚠️ No engines field pins a version; Node 18+ is the safe assumption for Next 14.
- **Commands** (✅ VERIFIED from `package.json` scripts):
  ```bash
  cd "/Users/feras/Documents/GitHub/portfolio-platform-new/Portfolio Project"
  npm install                 # first run
  # create .env.local with the 2 NEXT_PUBLIC_SUPABASE_* vars
  npm run dev                 # http://localhost:3000  (admin: /admin)
  npm run build               # production build
  npm run start               # serve the build
  ```
- ⚠️ Without a valid `.env.local`, the app builds but can't reach the database.

---

## 8. Folder Structure

✅ VERIFIED from `git ls-files`:

```
Portfolio Project/
├── pages/            ← REAL app (Next.js runs only this)
│   ├── index.js      public site (✅ contains lightbox)
│   ├── admin.js      admin dashboard
│   ├── _app.js  _document.js
├── lib/
│   ├── supabase.js   client (env-driven)
│   ├── translations.js (EN+AR)
│   ├── i18n.js  brand-icons.js
├── styles/globals.css
├── public/  logo.png  logo-light.png  favicon.png
├── archive/  supabase-setup.sql  pattern.png   ← retired files, kept for history
├── supabase-complete.sql   (the one to run for a new client DB)
├── .gitignore  package-lock.json
├── CLIENT-SETUP.md  README.md  OPERATIONS.md  next.config.js  package.json
```

- **Important dirs:** ✅ `pages/`, `lib/`, `styles/`, `public/`.
- **Dead/duplicate files:** ✅ none. (The 7 stale root-level duplicates were removed in `0ce6b16`.)
- **Retired files:** ✅ `archive/supabase-setup.sql` (superseded by `supabase-complete.sql`) and
  `archive/pattern.png` (unused asset — the admin pattern was removed). Kept in `/archive` for history,
  not used by the app.
- **Missing:** ✅ no `vercel.json`, no `.github/workflows`, no test dir. (`.gitignore` and
  `package-lock.json` now exist.)

---

## 9. Dependencies

✅ VERIFIED from `package.json`:

| Package | Version | Role |
|---|---|---|
| `next` | `^14.2.32` | framework (✅ bumped off vulnerable 14.2.5) |
| `react`, `react-dom` | `^18.3.1` | UI runtime |
| `@supabase/supabase-js` | `^2.45.0` | DB + auth + storage |
| `react-image-crop` | `^11.0.7` | admin image cropper |

- **Services/APIs:** ✅ Supabase (only external service referenced in code). ⚠️ Hosting provider
  (assumed Vercel) is a service but unprovable from repo.
- **Third-party tools:** ✅ none beyond the four packages. No analytics SDK, no error tracker, no CSS
  framework — analytics are self-built against the `analytics_events` table.

---

## 10. Known Issues

**✅ Confirmed from the repo:**
- `supabase-complete.sql` carries layered/historical RLS policies (permissive set then
  admin-tightened set).
- No `vercel.json`, no CI, no tests.
- `media` storage bucket is created **manually** (not by SQL) per client — a step easy to forget.

**❌ Reported in conversation, NOT verifiable from repo (treat as unconfirmed):**
- Password reset doesn't work (no SMTP).
- Apex domain served via GoDaddy forwarding with occasional SSL-warning edge case.
- Favicon caching requires hard refresh.

---

## 11. Technical Debt

- **✅ Layered RLS in one SQL file:** old "Authed can write" policies plus newer "Admins can write"
  drop/recreate blocks — works, but the file reads like an archaeology dig.
- **✅ Retired SQL kept for history:** `archive/supabase-setup.sql` is superseded by
  `supabase-complete.sql`.
- **❌/⚠️ Architecture debt (from conversation, not files):** single-tenant (one Supabase + one host
  project per client); no staging; CSR public site. Real, but not provable from the repo.
- *(Resolved: duplicate root-file code system removed in `0ce6b16`; `package-lock.json` now committed
  for reproducible installs.)*

---

## 12. Cleanup Opportunities

**✅ Done (this cleanup round):**
- Removed the 7 stale root duplicate files (`0ce6b16`).
- Added `.gitignore` and committed `package-lock.json` (`0ce6b16`).
- Moved retired files to `/archive`: `supabase-setup.sql`, `pattern.png`.

**Still open (optional):**
- `vercel.json` so hosting is provable in-repo.

**High-risk removals (do NOT touch without a migration plan):**
- Any table, function, or RLS policy in `supabase-complete.sql`.
- The `media` bucket or its policies.
- Anything in `/archive` — leave as historical record unless you deliberately prune it.

---

## 13. Recovery Guide — "if it broke today"

**To restore the codebase:**
1. ✅ `git clone https://github.com/stavioagency/portfolio-platform.git` (or re-pull in GitHub Desktop).
2. ✅ `npm install` → create `.env.local` with the two `NEXT_PUBLIC_SUPABASE_*` values → `npm run dev`.

**To restore a client deployment:**
3. ⚠️ Recreate/redeploy the host project (assumed Vercel) importing this repo, with the two env vars.
4. ⚠️ Re-point the domain (GoDaddy DNS) if it was lost.

**To restore the database (worst case):**
5. ✅ New Supabase project → run `supabase-complete.sql` → create public `media` bucket → add the auth
   user → run the `admin_usernames` INSERT (template is in the SQL comments).
6. ⚠️ Restore data from a Supabase backup (backups are a dashboard feature — verify they're enabled).

**Credentials needed (✅ list is provable; values are not in repo):**
- GitHub login for `stavioagency`.
- Host (Vercel) login.
- Supabase login + project API keys.
- GoDaddy login (domain/DNS).

**Services that would need recreating:** Supabase project (DB+auth+storage+bucket), host project +
env vars, DNS records. The **code** is fully recoverable from GitHub alone.

---

## 14. Operations Summary

| Item | Value | Confidence |
|---|---|---|
| GitHub Account | `stavioagency` (org) | ✅ VERIFIED |
| Repository | `portfolio-platform` | ✅ VERIFIED |
| Hosting Provider | Vercel | ❌ ASSUMPTION (no vercel config in repo) |
| Hosting Account | unknown | ⚠️ NEEDS VERIFICATION |
| Deployment Method | GitHub Desktop → GitHub → auto-deploy | ❌ ASSUMPTION |
| Domain | `f9designer.site` / `www.f9designer.site` | ❌ ASSUMPTION (not in repo) |
| Supabase Account | unknown | ⚠️ NEEDS VERIFICATION |
| Supabase Project Ref | `fzjojgknisasomihduul` (live?) / `gphrzvjlstznhypcfgre` (old?) | ❌ ASSUMPTION |
| Status | single-tenant v1, `main` in sync, working tree clean | ✅ VERIFIED (git) |
| Source of Truth | `origin/main` @ GitHub; clone at `…/portfolio-platform-new/Portfolio Project` | ✅ VERIFIED |

---

## 15. Standardization Recommendations

**Your preferred workflow:** GitHub Desktop → GitHub → Vercel auto-deploy.

**Does the repo match it? ✅ Mostly yes:**
- ✅ Single `main` branch, clean, in sync — exactly what a Desktop→push→auto-deploy flow wants.
- ✅ Standard Next.js layout, env-driven config, no exotic build steps — auto-deploy-friendly.

**Where it DEVIATES (fix these to remove future confusion):**
1. **✅ Mixed history of web-uploads.** Several commits are github.com web-editor edits ("Update
   admin.js") and a merge commit (`c9798cd`) from a divergence. → Going forward, **only** commit via
   GitHub Desktop; never edit files on github.com.
2. *(Resolved)* **Duplicate root files** from those early uploads were removed in `0ce6b16`.
3. **✅ Two local folders** (Downloads stale vs Documents canonical). → Delete/rename the Downloads
   copy so you can't open the wrong one.
4. **✅ Hosting not represented in-repo.** → Add `vercel.json` so the host is self-documenting.
5. **⚠️ Apex domain via GoDaddy forwarding** (from conversation). → For a clean setup, move DNS to the
   host's nameservers later.

**Platform recommendation:** **Stay on the current stack** (Next.js + Supabase + Vercel). It fits your
GitHub-Desktop → auto-deploy workflow natively; ✅ nothing in the repo suggests a migration is needed.
The only structural change worth planning is the **multi-tenant rebuild** (a code change, not a
platform change) — and that's a product decision, not an operations one.

---

### Confidence legend recap
✅ verified from files/git · ⚠️ needs dashboard verification · ❌ from conversation, unconfirmed in repo.
**The in-repo duplicate-file traps are now resolved. The remaining operational risk lives outside the
repo — the stale Downloads folder and the dashboard-only facts (Vercel/Supabase) that §0 flags.**
