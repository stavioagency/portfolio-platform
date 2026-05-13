# Portfolio Platform — Setup Guide

This guide takes you from zero to a live portfolio site. **No terminal. No coding required.** Just web browser clicks.

Time estimate: 30–45 minutes the first time. Don't rush. Take breaks.

---

## What you're building

A portfolio website + admin dashboard where you (or your clients) can:
- Edit profile info, bio, social links
- Add projects with images, descriptions, galleries
- Customize colors and language
- All changes live instantly, visible to anyone visiting the site

Tech stack (don't worry about understanding these — just names):
- **Next.js** = the frontend framework
- **Supabase** = the database + login system + image storage
- **Vercel** = where your site lives online (free hosting)
- **GitHub** = where your code lives (free)

---

## Step 1: Create accounts (10 min)

You need three accounts. All free. Use the same email if you want.

1. **GitHub** → https://github.com/signup
2. **Vercel** → https://vercel.com/signup (click "Continue with GitHub")
3. **Supabase** → https://supabase.com/dashboard/sign-up (click "Continue with GitHub")

All three accounts let you sign in with GitHub. Easier.

---

## Step 2: Set up Supabase (the backend) (10 min)

1. Go to https://supabase.com/dashboard
2. Click **"New project"**
3. Name it whatever you want (e.g. `portfolio-platform`)
4. Set a database password — **save this somewhere, you might need it later**
5. Pick a region close to your users (for Doha, pick `Asia Pacific (Singapore)` or `Middle East`)
6. Click **"Create new project"** — wait ~2 minutes for it to set up

### Set up the database tables

7. Once your project is ready, look at the left sidebar → click **"SQL Editor"**
8. Click **"+ New query"**
9. Open the file `supabase-setup.sql` from this project (in any text editor or just on GitHub)
10. **Copy everything**, paste into the SQL Editor
11. Click **"Run"** (bottom right). You should see "Success."

### Create the storage bucket for images

12. Left sidebar → click **"Storage"**
13. Click **"New bucket"**
14. Name: `media`
15. ✅ Check **"Public bucket"**
16. Click **"Save"**

### Create your admin user (for logging into the dashboard)

17. Left sidebar → click **"Authentication"** → **"Users"**
18. Click **"Add user"** → **"Create new user"**
19. Enter your email + a password (save the password!)
20. ✅ Check **"Auto Confirm User"** (so you don't need email verification)
21. Click **"Create user"**

### Get your API keys (you'll paste these into Vercel)

22. Left sidebar → click **"Project Settings"** (gear icon at bottom) → **"API"**
23. You'll see two important values. Keep this tab open, you'll copy from here:
    - **Project URL** (looks like `https://xxxxx.supabase.co`)
    - **anon public** key (a long string starting with `eyJ...`)

---

## Step 3: Upload the code to GitHub (5 min)

1. Go to https://github.com/new
2. Repository name: `portfolio-platform` (or whatever)
3. Set it to **Private** (so others can't see your code)
4. ✅ Check **"Add a README file"**
5. Click **"Create repository"**

### Upload all the project files

6. On the new repo page, click **"uploading an existing file"** (it's a link in the empty repo message). Or use **"Add file"** → **"Upload files"**
7. Drag **all the files and folders** from this project into the upload area:
   - `pages/` folder
   - `lib/` folder
   - `styles/` folder
   - `package.json`
   - `next.config.js`
   - `.gitignore`
   - `.env.local.example`
   - `supabase-setup.sql`
   - `README.md` (this file)
8. Scroll down, click **"Commit changes"**

---

## Step 4: Deploy to Vercel (5 min)

1. Go to https://vercel.com/new
2. Click **"Import"** next to your `portfolio-platform` repo
3. **Important:** Before clicking "Deploy", expand **"Environment Variables"** section
4. Add two variables (copy from the Supabase tab you left open):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon public key |

5. Click **"Deploy"** → wait 1-2 minutes
6. When it's done, you'll see a "Congratulations" screen. Click the screenshot to open your live site.

Your site is live. Note the URL — it'll be something like `portfolio-platform-xxxx.vercel.app`.

---

## Step 5: First login + setup (5 min)

1. Visit `your-site-url.vercel.app/admin`
2. Sign in with the email + password you created in Step 2 (the admin user)
3. You're in the dashboard. Fill out:
   - **Profile tab**: name, tagline, bio, upload profile image
   - **Projects tab**: click "+ Add Project" to create your first one
   - **Links tab**: paste your Instagram, WhatsApp, etc.
   - **Appearance tab**: pick your accent color
4. Save each tab
5. Visit your main site URL (without `/admin`) to see your portfolio live

---

## How to update the site after deploy

Two ways:

### A. Change content (text, images, projects)
Just go to `/admin` and edit. Changes are live instantly.

### B. Change code (design, features)
1. Edit files on GitHub directly (click any file → pencil icon → edit → commit)
2. Vercel auto-deploys within ~1 minute

---

## Common issues

**"Application error" on first visit**
- Check Vercel → your project → **Logs** for the error
- Most common: environment variables not set. Project → Settings → Environment Variables
- After fixing, click **Deployments** → top deployment → **⋯** → **Redeploy**

**Can't log into /admin**
- Make sure you created a user in Supabase → Authentication → Users
- Make sure you checked "Auto Confirm User"

**Images not uploading**
- Check that the `media` bucket exists in Supabase → Storage
- Make sure it's set to **Public**
- Make sure you ran the storage policies SQL (step 2 #11)

**Site shows "Setup needed"**
- Means the database is connected but has no profile row
- Either: SQL script wasn't run, or the seed `INSERT` didn't happen
- Go to Supabase → Table Editor → `profile` table → manually add row with `id = 1`

---

## Project structure (for reference)

```
portfolio-platform/
├── pages/
│   ├── _app.js          # Next.js root
│   ├── _document.js     # HTML lang/dir setup
│   ├── index.js         # Public portfolio page
│   └── admin.js         # Admin dashboard
├── lib/
│   ├── supabase.js      # Database client
│   └── translations.js  # AR + EN strings
├── styles/
│   └── globals.css      # Global styles + design tokens
├── package.json         # Dependencies
├── next.config.js       # Next.js config
├── supabase-setup.sql   # Database schema
└── .env.local.example   # Env var template
```

---

## Known limitations (we'll address these later)

1. **Single profile only** — this version supports one client per deployment. For multi-client (one platform serving many portfolios), we need to add tenant separation. Easy to add later.
2. **No image compression on upload** — Supabase free tier has 1GB storage, enough for a few hundred images. Add compression if you outgrow it.
3. **Basic project gallery only** — no video/PDF embed yet, no nested case-study layers from the brief. Coming in next version.
4. **No analytics** — add Umami or Plausible later by pasting their script tag into `pages/_document.js`.

---

## What was deferred from the full brief

You asked for an aggressive scope. Some pieces from your original brief aren't in v1:

- ✗ Multi-client tenant system (one platform → many portfolios)
- ✗ Nested expandable case-study layers
- ✗ Video / PDF / embed support
- ✗ Bulk upload with reorder
- ✗ Categories and tags
- ✗ Viewer/admin permissions (only single admin for now)
- ✗ Analytics dashboard
- ✗ Publish/draft workflow

These are real work and worth doing properly when you're not tired. v1 covers the core: portfolio + projects + admin + media + auth + Arabic/English. That's enough to deliver to a real client.

---

## When you get stuck

- Vercel logs: your project → Deployments → click the latest → see errors
- Supabase logs: project → Logs → API
- Send me a screenshot of any error and I can debug
