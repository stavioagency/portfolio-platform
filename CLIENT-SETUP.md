# Client Setup Guide — Spinning Up a New Portfolio

This is the step-by-step to create a brand-new portfolio site for a client.
Each client gets their own **Supabase project** (database) and **Vercel project** (hosting).

**Time:** ~30 minutes per client.
**No coding required** — just clicks and copy-paste.

---

## Before you start (one-time, you already have these)

- A GitHub account with the `portfolio-platform` repo
- A Supabase account → https://supabase.com
- A Vercel account → https://vercel.com

---

# PHASE 1 — Database (Supabase)

### Step 1 — Create the Supabase project
1. Go to https://supabase.com/dashboard
2. Click **New project**
3. Name it after the client, e.g. `portfolio-ahmed`
4. Set a database password — **save it somewhere**
5. Region: pick the closest to the client (Gulf → `Middle East` or `Asia Pacific (Singapore)`)
6. Click **Create new project** — wait ~2 minutes

### Step 2 — Run the database setup (ONE file)
1. Left sidebar → **SQL Editor**
2. Click **+ New query**
3. Open **`supabase-complete.sql`**, copy ALL of it, paste into the editor, click **Run**
4. Wait for **"Success"**.

> `supabase-complete.sql` already contains the original setup **plus all 9 migrations, in the correct order** — so it's a single paste instead of nine. If you see a red error, take a screenshot before doing anything else.

### Step 3 — Create the image storage bucket
1. Left sidebar → **Storage**
2. Click **New bucket**
3. Name: `media` (exactly, lowercase)
4. ✅ Check **Public bucket**
5. Click **Save**

### Step 4 — Create the client's admin login
1. Left sidebar → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter the client's email + a temporary password
4. ✅ Check **Auto Confirm User**
5. Click **Create user**

### Step 5 — Link a username to that login
1. Left sidebar → **SQL Editor** → **+ New query**
2. Paste this, replacing the username and email with the client's:

```sql
INSERT INTO admin_usernames (username, user_id)
SELECT 'clientusername', id FROM auth.users WHERE email = 'client@email.com';
```

3. Click **Run** — should say "Success. 1 row".
   - If it says "0 rows", the email doesn't match — double-check Step 4.

### Step 6 — Copy the API keys
1. Left sidebar → **Project Settings** (gear icon) → **API**
2. Keep this tab open — you'll need two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (a long string starting with `eyJ...`)

---

# PHASE 2 — Hosting (Vercel)

### Step 7 — Create the Vercel project
1. Go to https://vercel.com/new
2. Find the `portfolio-platform` GitHub repo → click **Import**
3. **Before clicking Deploy**, expand the **Environment Variables** section

### Step 8 — Add the two environment variables
Add both (copy the values from the Supabase tab in Step 6):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon public key |

### Step 9 — Deploy
1. Click **Deploy**
2. Wait 1–2 minutes
3. When done, you get a live URL like `portfolio-platform-xxxx.vercel.app`

---

# PHASE 3 — Handoff

### Step 10 — Test it
1. Visit the live URL — you should see the empty portfolio card
2. Visit `the-url/admin` → sign in with the username + password from Steps 4–5
3. Confirm all 7 admin tabs load (Profile, Card, Projects, Links, Appearance, Analytics, Account)

### Step 11 — Give the client access
- Send them: their site URL, their `/admin` URL, their username, their temporary password
- Tell them to change the password in **Account → Change password** on first login

---

# Quick reference — one client = these accounts

| What | Where | Purpose |
|---|---|---|
| Supabase project | supabase.com | the client's database + images + login |
| Vercel project | vercel.com | hosts the client's live site |
| GitHub repo | (shared) | the SAME repo powers every client — no need to duplicate it |

> **Important:** all clients share the ONE GitHub repo. When you update the code, every client's Vercel project can be redeployed to get the update. You do NOT make a copy of the code per client — only a copy of the *database* and *hosting*.

---

# Common problems

| Problem | Fix |
|---|---|
| "Application error" on the live site | Env vars missing/wrong → Vercel → Settings → Environment Variables → fix → redeploy |
| Can't sign into /admin | Username row not created (Step 5), or user not Auto-Confirmed (Step 4) |
| "Could not find column X" error | A migration was skipped → re-run all 9 SQL files in order |
| Images won't upload | `media` bucket missing or not Public (Step 3) |
| Site shows "Setup needed" | Normal for a brand-new site — the client just needs to fill in their Profile + Card |

---

# Limits to know (free tiers)

- Supabase free: 500 MB database, 1 GB image storage per project → ~enough for one full portfolio with plenty of images
- Vercel free: fine for portfolio traffic
- This single-project-per-client method works well for ~3–5 clients. Beyond that, consider the multi-tenant rebuild (one dashboard controlling all clients).
