# Architecture — overview

How the pieces fit, and the invariants that are load-bearing. Read this before
changing routing, the admin's structure, or anything about how a page gets its
data.

---

## 1. Stack and hard constraints

- **Next.js 14, Pages Router, plain JavaScript.** No TypeScript, no tsconfig.
- **styled-jsx** for all styling. No Tailwind, no PostCSS config. Design tokens
  are CSS custom properties in `styles/globals.css`.
- **Five runtime dependencies, no devDependencies:** `@supabase/supabase-js`,
  `next`, `react`, `react-dom`, `react-image-crop`. Do not add to this without
  an explicit request.
- **Supabase**: Postgres + Auth (GoTrue) + Storage + RLS + Edge Functions (Deno).
- **Tests**: the Node built-in runner. `npm test` → `node --test tests/*.test.mjs`.

The build needs Supabase env vars or it fails on `supabaseUrl is required`.
Placeholders are enough to build or test:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="x" npm run build
```

---

## 2. Frontend structure

```
pages/
  index.js          The public portfolio, client-side rendered. Resolves the
                    tenant, loads its data, renders the site. Also serves "/".
  [slug].js         Per-tenant public route. Reuses <Home> from index.js and
                    passes the slug. There is NO second renderer.
  admin.js          THE ENTIRE ADMIN — every editor, the shell, nav, contexts,
                    modals. One very large file; see section 4.
  signup.js         Public self-service signup form.
  signup/verify.js  Lands the emailed verification token.
  subscribe.js      Checkout page. NOT public — see architecture/billing.md.
  reset-password.js Collects a new password against a reset token.
  privacy.js · terms.js · _app.js · _document.js

components/
  PreviewPane.js    Live-preview iframe (device frame, scaling, refresh, retry).
  ui/               Button, Card, Badge, Icon, Input, EmptyState, Skeleton,
                    Toast (ToastProvider/useToast), ConfirmDialog
                    (ConfirmProvider/useConfirm), barrel index.js.
  billing/PlanPicker.js · CredentialsHandoff.js · LegalPage.js · ThemePreview.js
```

Notable `lib/` modules — each has a matching file in `tests/`:

| Module | Role |
|---|---|
| `tenant.js` | the public tenant resolver. Read section 3 before touching it. |
| `admin-nav.js` | `navGroups({isOwner, ar, t})` — the sidebar IA as pure data, so visibility rules are unit-testable. |
| `billing-status.js` | the UI's mirror of `tenant_has_active_subscription()`. |
| `billing-plans.js` | plan codes, the two prices per plan, `formatAmount()`. |
| `resolve-login.js` | `parseLoginIdentifier` — email vs username at sign-in. |
| `password-policy.js` | min 8 / max 20 chars + a 72-**byte** bcrypt backstop. |
| `pwned-password.js` | HaveIBeenPwned k-anonymity check. |
| `auth-link.js` | detects invite/recovery links and dead-link errors. |
| `safe-url.js` | `safeUrl()` XSS guard for every public link sink. |
| `image-compress.js` | downscale + WebP before upload; returns the ORIGINAL on any failure so an upload is never blocked. |
| `translations.js` / `i18n.js` | ar + en dictionaries (parity-verified); `pick` / `setLangValue` / `emptyBilingual`. |
| `reserved-slugs.js` | shared by the browser and the Edge Function, so one list. |

---

## 3. Backend and services

There is no backend of our own beyond Supabase. Three service surfaces:

- **Postgres + RLS** — the authority on who may read and write what, and on
  entitlement. See [database.md](database.md).
- **Edge Functions (Deno)**, in `supabase/functions/` — everything that needs the
  `service_role` key or a provider secret. Thirteen of them, grouped:
  onboarding (`invite-client`, `reset-client-password`, `client-recovery`),
  signup (`signup-start`, `signup-verify`), password reset
  (`request-password-reset`, `complete-password-reset`), billing
  (`billing-checkout`, `billing-webhook`, `billing-subscription`,
  `billing-plans-sync`), plus `_shared/`.
- **Resend** — every outbound email. See [emails.md](emails.md).

The `service_role` key lives only inside Edge Functions and never reaches the
browser.

---

## 4. `admin.js` internal structure

It is one very large file. Orientation:

- `Admin` (root) mounts `ToastProvider` + `ConfirmProvider`, and renders `SignIn`
  or `Dashboard` by auth state, with `SetPasswordGate` layered on top when a
  password is owed.
- `Dashboard` is the shell. It owns `tenant`, `tenants`, `isOwner`, `activeTab`
  and the preview state, and renders the grouped sidebar plus an editor/preview
  split.
- Contexts: `DirtyContext` (unsaved-changes guard), `TenantContext` (`useTenant`),
  `PreviewContext` (`usePreview().refresh()`).
- Editors: `ClientHome`, `OwnerClientsOverview`, `ProfileEditor`, `CardEditor`,
  `ProjectsEditor`, `ProjectEditForm`, `LinksEditor`, `AppearanceEditor`,
  `AnalyticsEditor`, `AccountEditor`, `WebsiteGuide`.
- Owner administration: `TenantAdminSection` with a `part` prop selecting the
  screen — `'onboard'` (inside the Clients modal) or `'settings'` (the Workspace
  tab). Plus `DomainManager`, `DnsInstructions`.
- Module-level helpers: `loadProfile`, `persistProfile`, `tenantStoragePath`,
  `computeSetup`, `adminRedirectUrl`, `checkDomainDns`, the dialog builders, the
  `RESERVED_SLUGS` and upload-limit constants.

**Every editor must wrap itself in `<div className="editor">` and mount
`<AdminStyles />`.** Input styling is scoped under `.editor`. A component
rendered outside that wrapper renders as unstyled native form controls — this has
happened and looked like a broken page.

---

## 5. Invariants — changing one of these has broken production

- **Tenant resolution is client-side**, in `index.js` via `resolveTenant`. An
  explicit `/{slug}` wins over the host; the host is only consulted when there is
  no slug. Anything unresolvable is a **404**, never a fallback to another
  tenant. **Never reintroduce a default tenant** — see
  [decisions/decisions.md](../decisions/decisions.md).

- **Two independent gates decide whether a public site renders**, and they must
  stay independent:
  1. `tenants.status === 'disabled'` — the **operator's** decision. Manual, and
     billing never writes it, in either direction.
  2. **entitlement** — `tenant_has_active_subscription()` over RPC, evaluated
     live at page load.

  Both must pass. No column, sweep or cron represents the second one, so a
  cancelled subscription serves until `current_period_end` and stops the moment
  it passes, with nothing to go stale. `resolveTenantByHost()` applies gate 1
  only — it answers *who owns this host*, not *may this render*, so anything
  deciding to render must go through `resolveTenant()`.

  **The entitlement gate fails OPEN**: an RPC error serves the site. Identity is
  still fail-closed. The asymmetry is deliberate — failing open serves the
  correct tenant who may not have paid, failing closed darkens every client site
  on one bad response. See [billing.md](billing.md).

- **An empty profile is not a missing profile.** A freshly created workspace has
  a profile row containing nothing; that is normal for every new client.
  `hasPublicContent()` decides whether the page renders or shows "setup needed".
  Checking only for the row's existence produced a nameless blank card.

- **Live preview is an iframe of the REAL public site** at
  `${origin}/${slug}?preview=1`. Refresh is a query-param bump on the same
  iframe, wired through the shared `SaveBar`, which detects a successful save and
  calls `usePreview().refresh()`. **No editor knows the preview exists** — do not
  add refresh calls inside editors.

- **The preview shares an origin with the admin**, so anything the public page
  persists to `localStorage` is written on the admin's behalf. `index.js`
  therefore suppresses both analytics and language persistence when `?preview=1`
  or when embedded in an iframe. Removing those guards silently corrupts the
  dashboard's own state and inflates tenant analytics.

- **An RLS-filtered write is not an error.** PostgREST reports success having
  changed zero rows. Every write helper must inspect the affected rows — see
  `persistProfile` and the `projects` handlers — or a blocked save reports
  "Saved" and silently discards the work.

- **`safeUrl()` guards every public link sink** (social anchors, CTA
  `window.open`, project URLs, lightbox). Applied at RENDER, not at save; input
  is stored raw.

---

## 6. Bilingual model

- **Admin chrome strings** live in `lib/translations.js`, keyed, ar/en parity
  verified by a test.
- **User content** is stored as JSONB `{ ar, en }` and read via `pick(field, lang)`.
- **One language toggle** controls both the admin chrome and which side of the
  bilingual content is being edited. Arabic flips the whole UI to RTL.
- **Latin numerals in both locales**, always.

Language *preference* resolution (which language a person gets) is a separate
question and is documented in [emails.md](emails.md) — the same chain is used by
the admin and by every mail sender.

---

## 7. Known gaps

- **`get_email_for_username` is callable by anon** and confirms which usernames
  exist. It must stay that way: sign-in resolves a username before anyone is
  authenticated, so revoking it breaks login for everyone. The real fix is moving
  username→email resolution server-side, which is an auth-flow refactor, not a
  grant change.
- **All existing objects in the `media` bucket use legacy FLAT paths.** Tenant
  storage isolation therefore governs only future uploads, and clients cannot
  manage pre-existing media. Migrating means renaming objects AND rewriting every
  stored URL in `profile` and `projects`; the failure mode is broken images on
  live sites.
- **`analytics_events` has no retention policy** and the admin query is
  unbounded. Fine at current volume; needs server-side aggregation before a
  high-traffic tenant.
- **`tenant_domains.status` is set by hand and drifts.** It only drives a
  coloured dot in the Clients list.
- **Leaked-password protection is a Supabase Pro feature** and cannot be enabled
  on the current plan. `lib/pwned-password.js` reimplements it client-side — a
  guardrail, not enforcement. The security advisor reports this permanently; it
  is not actionable.
- **Two read-only loaders lack try/finally** and can stick on a skeleton if a
  fetch throws. They self-heal on reload.
- **No client-side error reporting.** Production errors reach `console.error`
  only.
- **No ESLint configured.**
