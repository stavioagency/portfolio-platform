# HANDOFF — Designakum Portfolio Platform

_Last updated: 2026-07-26 · HEAD `cc9163f` (branch `main`, all pushed) · working tree clean_

This document lets a new chat / engineer continue without re-deriving context. Read
sections 0–2 before touching anything.

---

## 0. CRITICAL ORIENTATION — read first

**The code is NOT where the environment says it is.**

- A new Claude Code session is told the working directory is
  `/Users/feras/Downloads/portfolio-platform-main`. **That is the WRONG folder.**
  It is a separate, older tree containing the marketing sites
  (`marketing-site/`, `marketing-site-v2/`) and an old single-tenant copy of the
  platform. Per prior user direction, that copy's `pages/`/`lib/` are off-limits.
- **All real work lives here:**
  `/Users/feras/Documents/GitHub/portfolio-platform-new/Portfolio Project`
  (note the space in "Portfolio Project"). This is the git repo.
  - Remote: `https://github.com/stavioagency/portfolio-platform.git` (`origin`)
  - Branch: `main`, HEAD `cc9163f`, **fully pushed**, tree clean.
- **First action in a new chat:** `cd` into the GitHub path above. Everything below
  is relative to it.

**Two more environment gotchas:**
- The in-app Browser pane historically could not open `localhost`, then later could.
  If it can, the dev server needs env vars (below) or `/admin` 500s on
  `supabaseUrl is required`. There is no `.env.local` in the GitHub copy.
- There is a launch config entry `portfolio-project` in the **Downloads** copy's
  `.claude/launch.json` that `cd`s into the GitHub path and runs `npm run dev`.

---

## 1. WHAT THIS IS

A multi-tenant SaaS that builds **bilingual (Arabic/English) portfolio websites**
for freelancers. Designakum (the "owner") onboards paying clients; each client
("client"/"tenant") gets a private site + dashboard. **One** Next.js app + **one**
Supabase project serve everyone. Tenant isolation is enforced by Postgres RLS, not
the UI.

- Brand: royal blue `#2C6FE0`; deep navy `#0C1530`.
- Numerals: Latin in both locales.
- WhatsApp: `+966 50 579 6218`. Domain TBD (placeholder `designakum.com`).
- Pricing (marketing side, not in this app): 149.90 SAR; hidden code `F9SPECIAL` → 99.99.

---

## 2. TECH STACK & HARD CONSTRAINTS

- **Next.js 14, Pages Router, plain JS** (no TypeScript, no tsconfig).
- **styled-jsx** for all styling. **NO Tailwind, NO PostCSS config.**
- **5 runtime deps only:** `@supabase/supabase-js`, `next`, `react`, `react-dom`,
  `react-image-crop`. **No devDeps. Do not add dependencies** without explicit ask.
- Design tokens are CSS custom properties in `styles/globals.css`.
- Supabase: Postgres + Auth (GoTrue) + Storage + RLS + one Edge Function (Deno).
- Tests: Node built-in runner. `npm test` → `node --test tests/*.test.mjs`.

**Build (must set placeholder env or it fails):**
```
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="x" npx next build
```
**Test:** `npm test` → currently **66 pass** (tenant 14, admin-nav 9, safe-url 6,
password-policy 12, resolve-login 8, image-compress 17).

---

## 3. REPO MAP (every file that matters)

```
pages/
  index.js        Public portfolio (CSR). Resolves tenant, loads data, renders site.
                  Also the /  route. ~1215 lines. Contains safeUrl-guarded links,
                  analytics page_view logging with ?preview=1 suppression.
  [slug].js       Reuses <Home> from index.js, passes slug. This is the per-tenant
                  public route (/{slug}). NO separate renderer.
  admin.js        THE ENTIRE ADMIN. ~3551 lines. Every editor, the shell, nav,
                  contexts, modals, SaveBar. See §5 for its internal structure.
  privacy.js, terms.js   Static legal pages.
  _app.js         imports styles/globals.css. _document.js  base HTML.

components/
  PreviewPane.js  Live-preview iframe (device frame, scaling, refresh, error/retry).
  ui/
    Button.js Card.js(+CardHeader) Badge.js Icon.js(+ICON_NAMES)
    Input.js(+Hint) EmptyState.js Skeleton.js(+SkeletonText)
    Toast.js(ToastProvider/useToast) ConfirmDialog.js(ConfirmProvider/useConfirm)
    index.js  barrel export
  NOTE dead exports (built, never used, tree-shaken): Input, Hint, SkeletonText,
  ICON_NAMES. Also `CardHeader` is imported in admin.js but unused.

lib/
  supabase.js       createClient(url,key) from NEXT_PUBLIC_* env. No options.
  tenant.js         PUBLIC resolver. resolveTenant/resolveTenantByHost/normalizeHost,
                    NO_TENANT (404), BLOCKED_TENANT. Order as of 2026-07-26:
                    explicit slug(tenants) FIRST, then host(tenant_domains) when there
                    is no slug, else NO_TENANT. There is NO singleton fallback any
                    more. Ignores tenant_domains.status.
  password-policy.js  min 8 / max 20 CHARS (owner's product call) + a 72-BYTE bcrypt
                    backstop. Returns a translation key.
  resolve-login.js  parseLoginIdentifier — decides email vs username at sign-in.
  image-compress.js compressImage — downscale + WebP before upload; returns the
                    ORIGINAL file on any failure so an upload is never blocked.
  admin-nav.js      navGroups({isOwner,ar,t}) — the grouped sidebar IA (pure data,
                    extracted so it is unit-testable). Owner-only "clients",
                    client-only "home" (labelled "Overview").
  safe-url.js       safeUrl(raw) — XSS guard. Allowlist http/https/mailto/tel;
                    bare host → https; rejects javascript:/data:/control-char smuggling.
  translations.js   ar + en dictionaries. 271 keys each, PARITY VERIFIED. getTranslator.
  i18n.js           pick / setLangValue / emptyBilingual (bilingual field helpers).
  brand-icons.js    BRAND_ICONS / BRAND_KEYS / normalizeIcon (social icon paths).
  legal-content.js  privacy/terms content.

tests/
  tenant.test.mjs         14 — resolver isolation + slug-vs-host precedence.
  admin-nav.test.mjs       9 — nav visibility (owner/client leaks).
  safe-url.test.mjs        6 — XSS scheme blocking.
  password-policy.test.mjs 12 — length rules, Arabic/emoji byte counting.
  resolve-login.test.mjs    8 — email vs username at sign-in.
  image-compress.test.mjs  17 — scaling maths, pass-through formats, extensions.

supabase/
  sections/section-c-and-onboarding.sql   Applied+verified in prod.
  sections/section-d-owner-roles.sql      Applied+verified in prod (owner roles).
  functions/invite-client/index.ts        Owner-only invite Edge Function (DEPLOYED).
  AUDIT-AND-ROADMAP.md, PRODUCTION-AB-RUNBOOK.md   docs.
```

---

## 4. DATABASE (Supabase project ref `gphrzvjlstznhypcfgre`, region ap-northeast-1)

> There is a SECOND Supabase project `jswxevbghmbqumlccpfy` = "Finance App" =
> Financial Manager. **OFF-LIMITS. Never touch it.**

**8 tables (public schema):**
`tenants`, `tenant_domains`, `tenant_admins`, `platform_owners`, `profile`,
`projects`, `admin_usernames`, `analytics_events`.

**Tenant model:** `profile`/`projects`/`analytics_events` carry a `tenant_id`.
The legacy singleton mode is GONE as of 2026-07-26. It fell back to `profile.id = 1`,
which in production belongs to a live client — so every unresolvable request served
that client's portfolio, and the admin read/wrote it whenever no workspace was
selected. Public resolution now 404s (137607c) and the admin refuses (8ec5458).

**RLS functions (all SECURITY DEFINER):**
`is_admin()`, `is_tenant_admin(uuid)`, `is_platform_owner()`,
`get_email_for_username(text)`, `assign_tenant_admin(uuid,text)` (owner-only, role
`client`).

**Owner accounts (platform_owners.user_id):**
- `6b0ab503-a663-4014-9221-a2ede4611fde` — designakum
- `24baae5a-93c6-4000-bcac-0ecb1c86e7ae` — f9f9

**Current tenants (3):** `f9designer` — label "Faisal's Portfolio", 8 projects —
`designakum` (official), `ahmad-demo` (4 projects). Do NOT delete these when testing.
Deleted 2026-07-26 at the owner's request: `luma-studio` (demo), `dd` (test tenant),
and the `www.f9designer.site` domain row.

Note `tenants.name` is the ADMIN-FACING label only. The public site name lives in
`profile.name` as bilingual JSON — for `f9designer` that is `{ar:"فيصل", en:"𝗙𝗔𝗜𝗦𝗔𝗟"}`
(styled unicode, intentional). Renaming the label does not touch the public page.

**Domain reality check (2026-07-26):** the `status` column in `tenant_domains` records
what the app was told, NOT whether the domain resolves. Only `f9designer.site` has
real DNS (→ Vercel `216.198.79.1`, not the `76.76.21.21` the in-app instructions give);
it is nonetheless stored as `error`. `ahmad-demo.com` is stored `active` but has no DNS
record at all. Verify with `dig` before believing this column.

**Reserved slugs** (cannot be created): `admin, privacy, terms, api, _next, 404, 500,
favicon.ico`.

**RLS gotcha:** policies are permissive/OR'd — adding a restrictive policy next to a
permissive one does NOT tighten; the old one must be DROPPED.

**Storage:** public bucket `media`. Paths are tenant-scoped `t-{tenant.id}/{name}`;
`tenantStoragePath()` returns null (upload refused) when no tenant is selected.
Limits are enforced on the BUCKET as of 2026-07-26 — `file_size_limit` 5 MB and
image-only `allowed_mime_types` — not just in the browser.

Writes are tenant-isolated via `can_write_media(name)` (SECURITY DEFINER): the
first path segment must match a tenant in your `tenant_admins`, or you must be a
platform owner. Applied 2026-07-26 (Section E). Before that, all three write
policies checked only `is_admin()`, which is true for EVERY client — any client
could delete any other client's images.

The 135 pre-existing files sit at the bucket ROOT with no `t-` prefix (122 MB).
`storage.foldername()` returns NULL for a flat name, so they are READ-ONLY by
design: public reads verified still working, writes denied. A re-upload writes a
correctly-prefixed new file and orphans the old one. Migrating them would mean
rewriting every image URL in `profile`/`projects` — deliberately not attempted.

`Public can view media` (SELECT) is intentionally left unscoped — it serves every
public portfolio image. Supabase's advisor flags that it also permits listing the
bucket; tightening that is a separate change.

**Edge Function `invite-client`:** DEPLOYED, `verify_jwt=true`. Re-checks
`is_platform_owner()` server-side, uses service_role key server-side only (never
client), creates auth user + `admin_usernames` row, maps via `assign_tenant_admin`.

---

## 5. admin.js INTERNAL STRUCTURE (it's one 3551-line file)

- `Admin` (root) → mounts `ToastProvider` + `ConfirmProvider`, renders `SignIn` /
  `SetNewPassword` / `Dashboard` by auth state.
- `Dashboard` — the shell. Owns: `tenant`, `tenants`, `isOwner`, `activeTab`,
  `previewToken`, `previewOrigin`, `previewOpen`. Renders sidebar (grouped nav via
  `navGroups`), `<main>` with an editor/preview split.
- Contexts: `DirtyContext` (unsaved-changes guard), `TenantContext` (`useTenant`),
  `PreviewContext` (`usePreview` — `refresh()` to reload the preview).
- Editors: `ClientHome`, `OwnerClientsOverview`, `ProfileEditor`, `CardEditor`,
  `ProjectsEditor`, `ProjectEditForm`, `LinksEditor`, `AppearanceEditor`,
  `AnalyticsEditor`, `AccountEditor`.
- Owner/domain admin: `TenantAdminSection` (prop `part`: `'workspace'` under Account,
  `'domains'` as its own tab), `DomainManager`, `DnsInstructions`.
- Shared: `SaveBar` (detects save-success → calls `usePreview().refresh()`),
  `Field`, `ImageUpload`, `CropperModal`, `MultiImageUpload`, `IconPickerModal`,
  `SidebarUser`, `TenantSelector`, `NavItem`, `NavGroup`, style blocks.

**Module-level helpers in admin.js:** `adminRedirectUrl()`, `loadProfile(tenant,cols)`,
`persistProfile(tenant,fields)`, `tenantStoragePath(tenant,name)`, `computeSetup(...)`,
`checkDomainDns(domain)` (8s AbortController timeout), `domainStatusMeta(status,ar)`,
`uploadError(file)`, dialog builders `unsavedDialog/removeDialog/deleteDialog`,
constants `RESERVED_SLUGS`, `VERCEL_A_RECORD='76.76.21.21'`,
`VERCEL_CNAME='cname.vercel-dns.com'`, `MAX_UPLOAD_BYTES=5MB`.

---

## 6. ARCHITECTURE FACTS A NEW CHAT MUST KNOW

- **Tenant resolution is client-side** in `index.js` via `resolveTenant`. `/{slug}`
  renders that tenant; `/` uses host or singleton. No SSR/getServerSideProps.
- **Live preview** = an iframe of the REAL public site at `${origin}/${slug}?preview=1`.
  Refresh mechanism is a **query-param bump** on the SAME iframe element (not
  postMessage, not remount, not router.refresh — Pages Router has none). ONE iframe,
  reused. Chosen so public rendering is never touched.
- **Save → preview refresh** is wired through the shared `SaveBar`: it detects a
  successful save (`saving` true→false while `dirty` stays clear) and calls
  `usePreview().refresh()`. **No editor knows the preview exists** — do not add refresh
  calls into editors.
- **Analytics/preview guard:** `index.js` skips the `page_view` insert when
  `?preview=1` or when embedded in an iframe. This is the ONE deliberate touch to the
  public page for telemetry hygiene (so owner preview loads don't inflate a tenant's
  analytics).
- **Light theme** is driven by `document.documentElement[data-admin-theme="light"|
  "dark"]` set by Dashboard, with tokens in `globals.css`. Set at ROOT so overlays
  (toasts, dialogs) rendered outside `.dashboard` inherit it. The dark theme also
  locally overrides `--accent` to `#4f6ef2` inside `.dashboard`.
- **safeUrl** guards all public link sinks (social anchor, CTA `window.open`, project
  external_url, lightbox). Applied at RENDER, not at save (input is still stored raw).
- **Async handlers** all use try/catch/finally so a network throw never leaves a
  button stuck (fixed in Phase 6). EXCEPTIONS: two read-only loaders lack it — see §8.
- **adminRedirectUrl()** returns one canonical origin for reset/invite emails:
  `NEXT_PUBLIC_ADMIN_URL` → else localhost (dev) → else hardcoded vercel URL. See §7#1.

---

## 7. NOT DONE — "NEEDS YOU" (manual/external, no code). As of 2026-07-26.

**Section F IS APPLIED (2026-07-26)** — `supabase/sections/section-f-owner-admin-parity.sql`.
`is_tenant_admin()` now recognises platform owners, `admin_usernames` has its missing
SELECT policy, a trigger + backfill enrols every platform owner on every workspace
(`tenant_admins` 5 -> 7 rows), and `assign_tenant_admin` takes `p_role`. Verified in
production: as f9f9, `is_tenant_admin()` returns true for a nonexistent tenant uuid,
which can only be the owner branch. **The DB is now AHEAD of production**: the admin's
Client-admin screen sends `p_role`, which the deployed build does not yet do — harmless
in that direction, but push and redeploy so the two agree.

**THE ONE BLOCKER FOR LAUNCH: email does not send.**

1. **Resend DNS is not resolving.** SMTP was set up on 2026-07-26 to escape
   Supabase's built-in mailer (a few messages per hour, "not meant for production"
   per their docs). The three records are SAVED and CORRECT in the GoDaddy UI —
   `resend._domainkey` TXT, `send` TXT (SPF), `send` MX priority 10 — but GoDaddy's
   own nameserver returns **NXDOMAIN** for those names. Not NODATA: the names are
   absent from the zone it serves. `_dmarc.designakum.com` (a GoDaddy default, same
   zone, same 1h TTL) resolves fine, so this is not propagation lag, and there is no
   CNAME shadowing them. Cause unknown from outside; likely GoDaddy not publishing.
   Check with: `dig +short TXT resend._domainkey.designakum.com` — empty means still
   broken. Then re-save a record in GoDaddy to force a republish, or open a support
   ticket quoting the NXDOMAIN from ns05.domaincontrol.com.

   **WORKAROUND — verified 2026-07-26, do this instead of waiting on GoDaddy.**
   All three Resend records ARE live and resolving on **`designakum.site`**:
   `resend._domainkey` (DKIM), `send` TXT (`v=spf1 include:amazonses.com ~all`), and
   `send` MX (`10 feedback-smtp.ap-northeast-1.amazonses.com`). Same registrar, but
   `.site` is served by ns47/ns48.domaincontrol.com while the broken `.com` zone is on
   ns05/ns06 — which supports "GoDaddy is not publishing that one zone" rather than a
   mistake in the record values. So: verify **designakum.site** in Resend and set the
   Supabase SMTP sender to `noreply@designakum.site`. No code change is needed — nothing
   in the repo hardcodes a sender address; it lives only in the Supabase SMTP fields.
   `.site` is also where auth redirects already point (2db4bae), so sender and links
   finally agree. Fixing the `.com` zone stays a nice-to-have, not a launch blocker.
   Until this resolves: **client invites return 400 and password resets never
   arrive.** Both draw on the same exhausted quota. Not a code bug — verified in the
   auth logs (`over_email_send_rate_limit`) and the edge-function logs (six
   consecutive 400s from `invite_failed`).
2. **Supabase → Auth → SMTP Settings** — confirm the custom SMTP fields are actually
   saved: host `smtp.resend.com`, port 465, user `resend`, password = the `re_` key,
   sender `noreply@designakum.com`. Could not be verified from here (no MCP tool
   reads auth config). Every `mail.send` in the last 24h still came from
   `noreply@mail.app.supabase.io`, so as of the last check this had not taken effect.
3. **`NEXT_PUBLIC_ADMIN_URL`** is still UNSET in Vercel. The code fallback is now
   `https://designakum.site` (2db4bae), so reset/invite links point there. Setting the
   env var requires a REDEPLOY — it is inlined at build time.
4. **Supabase → Auth → URL Configuration:** `https://designakum.site/admin` must be in
   Redirect URLs. Supabase silently drops an unrecognised redirect and falls back to
   the Site URL — that is exactly the bug c835317 fixed once already. Keep the old
   vercel.app entry until a reset is confirmed working from the new domain.
5. **Supabase → Auth: enable leaked-password protection.** Still OFF — confirmed by the
   advisor on 2026-07-26. This is the password setting that actually matters; the
   20-character maximum is a product decision by the owner and does not improve security.
   NOT doable from a session: there is no MCP tool for auth config, and the dashboard
   needs an interactive login. Click path:
   Dashboard -> Authentication -> Sign In / Providers -> Password section ->
   "Prevent use of leaked passwords" -> Save. Re-run the security advisor to confirm
   `auth_leaked_password_protection` has cleared.
6. **The storage-isolation proof — DONE 2026-07-26, and it found two things.**
   Proven at the authorization layer by evaluating `can_write_media()` under simulated
   JWT claims for `fghj` (a real CLIENT, mapped only to f9designer). Own-tenant prefix
   -> true; another tenant's prefix -> false; flat path -> false; null -> false. All
   three write policies on `storage.objects` (INSERT/UPDATE/DELETE) are gated on that
   function, so the isolation holds. This is a proof of the policy logic, not an
   end-to-end HTTP upload — that still wants a real client session one day.

   a) **Path traversal accepted, now FIXED (F5).** `t-<own>/../t-<other>/x.png`
      returned TRUE, because only the first path segment was checked. Not reachable
      through the app and no object name contains '..', so it was hardening rather
      than an incident. `can_write_media` now rejects '..' outright.

   b) **OPEN DECISION — all 135 objects in `media` are legacy FLAT paths.** Not one
      uses the `t-<tenant-id>/` prefix; the newest upload is 2026-07-03, well before
      Section E. So tenant isolation currently protects nothing that exists — it only
      governs future uploads. Consequence: `can_write_media` returns false for flat
      paths, so a CLIENT cannot replace or delete any existing media (all of it is
      f9designer's). Platform owners still can. Migrating those 135 objects under
      `t-4e75be11-…/` means renaming storage objects AND rewriting every stored URL in
      `profile.banners`, `profile.brand_logo`, `projects.cover_image`, `projects.images`
      — a real migration with a broken-image failure mode. Deliberately NOT attempted.
7. **Full manual QA pass** — nobody has clicked through the live product. The 3
   critical security tests: (a) a link saved as `javascript:alert(1)` must be inert on
   the public page; (b) a client must not see the Clients screen or another tenant's
   data; (c) repeated owner saves must NOT increment that tenant's analytics.
8. **Backups:** confirm Supabase daily backups are ON + retention. DB backups do NOT
   include Storage (`media` bucket).

**Live domains (2026-07-26):** `designakum.com` → the `designakum-marketing` Vercel
project (working). `designakum.site` + `www` → the `portfolio-platform` project,
mapped in `tenant_domains` to the `designakum` tenant, status `active` (working, but
that tenant has NO content yet — it will render the "needs setup" state).
`f9designer.site` → the `f9designer` tenant. `ahmad-demo.com` has no DNS at all.
Both domains are registered at GoDaddy; the Vercel A record in use is `216.198.79.1`,
NOT the `76.76.21.21` the in-app DNS instructions still print.

---

## 8. NOT DONE — DEFERRED (safe after launch) & TECH DEBT

- **OPEN SECURITY ISSUE — `get_email_for_username` leaks emails to anonymous callers.**
  The RPC is `SECURITY DEFINER` and `GRANT EXECUTE ... TO anon`
  (`supabase-complete.sql:287-304`), so anyone can POST a username to
  `/rest/v1/rpc/get_email_for_username` and get that account's real email back, with no
  auth and no rate limit. It also confirms which usernames exist (email vs null). This
  defeats the generic "invalid credentials" / "if an account exists" wording on the
  login and forgot-password screens, which is otherwise done correctly. Not fixable by
  tightening the frontend — the RPC is callable directly. Real fix: move the
  username→email resolution server-side (an Edge Function that takes username+password
  and signs in), then revoke `anon` execute. Deferred because it is an auth-flow
  refactor, not a one-line change. Interim mitigation: Supabase Auth rate limits.
- **Two loaders lack try/finally** (stuck-on-skeleton if the fetch throws):
  `ClientHome` (~admin.js:2909) and `OwnerClientsOverview` (~admin.js:3012). Both are
  read-only; self-heal on reload. Low risk. Left because Phase 7 brief was blockers-only.
- **`analytics_events` query is unbounded** — `AnalyticsEditor.load()` selects all rows
  for the range with no limit. Fine early; needs server-side aggregation before a
  high-traffic tenant. NOT fixable without schema/RPC work.
- **No client-side error reporting** — production errors go to `console.error` only,
  invisible to you. Highest-value observability gap.
- **No ESLint** configured (`next lint` only offers to scaffold).
- **Dead code:** `components/ui/Input.js` (Input+Hint), `SkeletonText`, `ICON_NAMES`,
  and the unused `CardHeader` import in admin.js. Tree-shaken, zero runtime cost.
- **`pages/admin.js` is 3551 lines** — splitting it is a real refactor, out of scope
  every phase so far.
- **No focus trap** in `IconPickerModal`/`CropperModal` (they DO have Escape + roles +
  labels as of Phase 7; `ConfirmDialog` has a full trap).
- **Restore drill** never done — test restoring a backup into a scratch project once.

---

## 9. WHAT HAS BEEN DONE — by commit (newest first)

```
8ec5458 fix(admin): refuse to act when no tenant is selected
        (loadProfile/persistProfile/tenantStoragePath/delete-portfolio all fell
        back to profile.id = 1 — a real client's row. The reset's singleton
        branch deleted analytics_events and projects with .neq('id', 0), which
        matches EVERY row: a platform-wide wipe, not one profile.)
3a01d6f feat(storage): tenant-scope media writes  (Section E — can_write_media(),
        3 scoped policies, bucket 5 MB + image-only. The 3 DROP POLICY lines were
        run by hand on 2026-07-26; isolation is now ACTIVE and verified.)
137607c fix(mt): 404 instead of serving another tenant's portfolio
        (DEFAULT_TENANT -> NO_TENANT. An unmapped domain pointed at Vercel used
        to serve whichever client owned profile.id = 1.)
6d1cddf fix(auth): accept email or username at sign-in; cap passwords at 20 chars
        (sign-in did a username-only lookup and returned "invalid credentials"
        WITHOUT checking the password, so typing your own email always failed and
        the reset link became the only way in. Also removed a timing oracle.
        20-char max is the owner's explicit product decision, not a security win.)
c768d1a docs: add feature-workflow skill
a559ff2 Create HANDOFF.md
31f8658 chore: launch readiness QA pass       (Phase 7: a11y labels on ~17 icon
        buttons + move_up/move_down keys; Escape/role/aria on IconPicker+Cropper
        modals; fixed live-preview cropped-scale bug across the 1024px breakpoint;
        removed duplicate "add link" control on empty Links.)
398bea3 chore: production hardening            (Phase 6: safeUrl XSS guard +6 tests;
        try/catch/finally across ~12 async handlers; 8s DNS-verify timeout;
        analytics range-switch race guard.)
977f45b feat: add live preview builder         (Phase 5D: PreviewPane iframe of real
        site; SaveBar→PreviewContext refresh; editor/preview split; ?preview=1
        analytics guard in index.js.)
a53a637 chore: production qa and polish pass   (Phase 5C: tokenised status colours
        for light mode; Projects/Links loading skeletons vs empty-state flash;
        focus rings on small row controls.)
6dedc96 feat: redesign admin navigation architecture  (Phase 5B-4: grouped sidebar
        IA in lib/admin-nav.js +9 tests; components/ui/Icon.js SVG set replacing
        emoji; Domains split into its own tab; sidebar site-identity card; owner
        badge. "Home"→"Overview" to avoid clash with "Home Page".)
0c42789 feat: refactor admin screens onto ui primitives   (Phase 5B-3.)
8df9eeb feat: replace native dialogs with app UI          (Phase 5B-2: all
        alert()/confirm()/prompt() → Toast/ConfirmDialog.)
07d1e29 feat: add UI design system primitives             (Phase 5B-1: tokens +
        components/ui/*. Light theme moved to [data-admin-theme].)
b9fb42c feat(saas): Phase 4 client domain experience
c835317 fix(auth): one canonical admin URL for reset+invite redirects
ad8a484 feat(saas): Phase 3 client onboarding experience
68d6480 feat(saas): Phase 2 owner vs client dashboard split
b842c4c feat(saas): Phase 1 owner-only client invite Edge Function
6c09358 feat(saas): Phase 1a owner/client permission foundation (RLS)
df38961 docs(mt): Section C complete + verified in production
```
Earlier work (before this doc): SQL grants for public reads, analytics tenant
stamping, public lightbox UX, Section C migration executed+verified, demo tenants.

---

## 10. HOW TO WORK / VERIFY (the harness pattern)

The dev server needs Supabase creds. There is no `.env.local`, and placeholder creds
mean data-driven screens fail (they show skeletons/empty states — useful for UI QA,
useless for data QA).

To visually inspect the ADMIN (which needs a session) without real login, a
**temporary harness** was used repeatedly: inject a `qaMode` state that renders
`<Dashboard session={fakeSession} .../>` when the URL has `?qa`, verify in the Browser
pane, then REMOVE the harness before building/committing. Make it hydration-safe
(gate on a `useEffect`-set state, not `window.location` read during render) or you get
a hydration mismatch that blocks the client render. ALWAYS grep for `TEMP HARNESS` /
`fakeSession` / `qaMode` and confirm zero before committing.

Browser-pane probes can return a STALE context after navigation — screenshot to
confirm, and re-run JS probes against the live DOM.

Always finish a change with: build (placeholder env) + `npm test`, then review the
diff. Commit messages end with the Co-Authored-By line. Commit/push only when asked;
on `main`, work is committed directly here (that's how every phase ran) and pushed
when the user says so.

---

## 11. EXTERNAL ARTIFACTS & FILES (outside the repo)

- **Verified data backup:** `~/Downloads/portfolio-backups/20260724-142901/`
  (tenancy.json, profile.json, projects.json, verify.txt, README.md). Signatures were
  verified against the live DB. Does NOT include Storage or analytics_events (anon
  cannot read analytics — correct RLS behaviour).
- **Arabic QA checklist (artifact):**
  `https://claude.ai/code/artifact/11526ddb-2591-43be-a6b7-962e9e6b144a`
- **Project map (artifact):**
  `https://claude.ai/code/artifact/7a2e4684-bd39-4f8d-a6e4-feac1a418ebe`

---

## 12. GUARDRAILS (do not violate without explicit ask)

Do NOT: add dependencies · add Tailwind/framework · change DB schema/RLS/auth/tenant
resolver/routing · touch the Marketing Site or its `marketing-site-v2/` · touch the
Financial Manager / Supabase project `jswxevbghmbqumlccpfy` · redesign or rewrite the
admin · start mobile bottom-nav or AI features · commit the temp harness.
The product itself (this repo) is what you build; infra is settled on the
`stavioagency` GitHub account.
```
