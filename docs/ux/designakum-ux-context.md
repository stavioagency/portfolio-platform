# Designakum — UX context handoff

**Written 2026-08-13, at the end of the stabilisation phase, for a fresh session
starting the UX redesign.** It assumes no prior conversation. Read this, then
`docs/GRANDMASTER.md`, then only the documents either one sends you to.

**This document describes what exists and why. It does not propose a design.**
Where it records an intention rather than a fact, it says so.

---

## 1. Product overview

Designakum is a **multi-tenant SaaS that builds bilingual (Arabic / English)
portfolio websites for creative freelancers** — designers, filmmakers,
photographers. A customer signs up, fills in their profile and projects, and
gets a public portfolio site plus a dashboard to maintain it.

**Business model:** subscription. Monthly or annual, sold through PayPal.
Prices live in `provider_plans` (per environment) and are resolved server-side
at checkout — never hardcoded in the UI. There is also a **complimentary
("comped")** tier the owner grants manually to early and partner clients; seven
of the current workspaces are comps.

**Multi-tenancy:** one Next.js app and one Supabase project serve every client.
Each client is a **tenant** with a public site at `/{slug}` (or their own custom
domain) and a private dashboard. **Isolation is enforced by Postgres RLS, not by
the UI** — this matters for design, because hiding something in the interface is
never what makes it safe.

**Target users:** Arabic-speaking creative freelancers, primarily Saudi/Gulf.
Arabic is first-class, not a translation layer — RTL is a real layout mode, not
a mirror, and **Latin numerals are used in both locales**.

**Value proposition:** a professional portfolio presence without touching a
website builder. The positioning is a **personal brand**, not "a website tool".

---

## 2. User roles

There are exactly two, and the single most important thing to understand is
that **they currently share one screen** (see §3).

### Platform owner / admin

Two accounts, both platform owners. They sign in with **usernames**, not just
email. Owner status comes from the `platform_owners` table via
`is_platform_owner()` — checked server-side in every owner-only Edge Function,
never trusted from the client.

Responsibilities:
- Onboarding clients (creating a workspace and its login)
- Granting complimentary access
- Overseeing subscriptions — who is paying, what is failing
- Managing domains for clients
- Troubleshooting and account recovery
- Platform health

### Client

A freelancer with one workspace. Responsibilities:
- Editing their portfolio — profile, projects, links, appearance
- Reading their analytics
- Managing their own subscription
- Their account and password

### The difference that matters

An owner operates **the platform**; a client operates **their own presence**.
The current interface blurs this, because an owner is also a tenant admin on
every workspace (section F grants parity), so the same screen has to serve
"I am administering someone else's site" and "I am editing my own".

**A client must never see:** tenant ids, internal identifiers, other clients,
platform infrastructure, or anything framed in database vocabulary.

---

## 3. Current product structure

### Routes — the whole surface

| Route | What it is | Who |
|---|---|---|
| `/` | the owner's own public portfolio site | public |
| `/{slug}` | a client's public portfolio site | public |
| `/admin` | **the entire dashboard — owner AND client** | authenticated |
| `/signup` | public self-serve signup | public |
| `/signup/verify` | email verification landing | public |
| `/subscribe` | PayPal checkout return/approval | authenticated |
| `/reset-password` | password reset form | public |
| `/privacy`, `/terms` | legal | public |

**The structural fact that dominates any redesign:**

> `pages/admin.js` is **~6,550 lines** and is *both* the owner admin *and* the
> client dashboard, on one route, switched by role at runtime. `pages/index.js`
> is another ~1,550 lines rendering the public site. There is no `/dashboard`,
> no `/owner`, no per-tab route — tab state is internal, so **nothing in the
> dashboard is linkable or bookmarkable.**

That single file is why the product "feels generic": its information
architecture is a runtime conditional, not a structure.

### Current information architecture

From `lib/admin-nav.js` — a pure, unit-tested data model, which is the cleanest
existing artefact to redesign against:

| Group | Items | Visible to |
|---|---|---|
| **Platform** | Sites, Subscribers | owner only |
| **Website** | Overview *(client only)*, Profile, Card, Projects, Links, Appearance | both |
| **Insights** | Analytics | both |
| **Settings** | Workspace *(client only)*, Billing *(client only)*, Account | both |

Owners are deliberately denied the client-shaped tabs: Workspace and Billing
for an owner would act on "whichever workspace is selected", which is the exact
ambiguity the Sites and Subscribers screens exist to remove.

### The flows

**Self-serve signup** (public, live):
```
/signup → signup-start (creates unconfirmed account, Resend mail)
        → /signup/verify → signup-verify (confirms, creates tenant status='disabled')
        → /admin → Billing tab → checkout → /subscribe → PayPal
        → ACTIVATED webhook → subscription active AND tenant → 'active'
```

**Owner-led onboarding** (live): one form on Sites → "+ Add client" orchestrates
tenant insert → profile insert → `invite-client` (auth user, username, tenant
mapping, credentials email). The owner receives the client's temporary password
on screen and relays it.

**Marketing site is a SEPARATE product** — different repository, different
Supabase project, different owner account. Nothing in this repo may reference or
serve it. If a UX task seems to concern the marketing site, stop and ask.

---

## 4. Current UX problems

Recorded as the founder described them, plus what the audits confirmed.

**Founder's assessment:**
- The dashboard feels **generic** — like a settings panel, not a product.
- **Too text-heavy.** Words where symbols, imagery or hierarchy would do.
- **Poor visual scanning** — everything has similar weight, so nothing leads.
- **Confusing admin/client separation.**
- The owner dashboard **mixes platform management with client management**.
- **Lacks a premium feel** for something sold as a personal brand.

**Confirmed by audit, with specifics a redesign can act on:**

- **One file, one route, two products.** The owner/client split is a runtime
  conditional inside a 6,500-line component. Nothing is linkable.
- **Onboarding asks for platform vocabulary.** "+ Add client" requires a
  **slug** and a **username** — both permanent, collision-prone, and meaningless
  to the person filling them in. The founder experiences this as "manual", but
  the flow is already one form; the friction is *vocabulary*, not step count.
- **Credential relay.** The owner reads a generated password off the screen and
  passes it to the client by hand. There is no re-invite — re-running
  `invite-client` fails, and the recovery path silently invalidates a working
  password.
- **Money is silent.** There are **no billing emails at all** — no receipt, no
  renewal notice, no failed-payment warning, no cancellation confirmation. A
  customer pays and hears nothing.
- **Two signup emails are off-brand** (`#4f6ef2`, no card) while every other
  email uses the brand palette. They are the first two emails a customer sees.
- **Owners cannot see billing environment.** Sandbox and live subscriptions look
  identical in the Subscribers list.
- **A newly onboarded client used to be silently read-only** until granted a
  comp. Fixed functionally (`grant_comp`), but nothing in the UI *explains*
  entitlement — the client just couldn't save.

---

## 5. UX redesign goals

**Intent, as stated by the founder — direction, not specification.**

- A **premium** experience befitting a personal-brand product.
- **Visual-first**: imagery, symbols and hierarchy carrying meaning that words
  carry today.
- **Stronger hierarchy** — the eye should know where to go.
- **Clear role separation**: a client portal and an owner/operator portal as
  distinct products.
- The **client portal** covers website, portfolio, projects, images, analytics,
  domain, billing, account — and exposes **no** tenant concepts, internal ids or
  infrastructure.
- The **owner portal** covers platform health, workspaces, subscriptions,
  billing infrastructure, monitoring and troubleshooting — and does **not**
  become a customer-management CRM.
- **Reference products** may inspire architecture. See §6.

The customer should immediately understand: *"I can create and manage my
professional portfolio here."* Not: technical, database-shaped, or overloaded.

---

## 6. Important product decisions

These are settled. Do not relitigate them without asking.

1. **Client portfolio sites stay customisable.** The redesign targets the SaaS
   platform *around* them, not the output. Appearance/theming is a client
   feature and stays one.
2. **The redesign is the platform, not the product output.** `/` and `/{slug}`
   are the customer's brand, not ours.
3. **Designakum's own identity.** Royal blue `#2C6FE0` primary, deep navy
   `#0C1530` for text and dark surfaces. A diamond motif derives from the logo.
   Design tokens already exist in `styles/globals.css`.
4. **Reference portals inspire architecture, never copy.** Take information
   architecture and interaction patterns; do not clone a competitor's visual
   language.
5. **Arabic is first-class.** Every layout must work RTL as a real layout. No
   letter-spacing on Arabic, no uppercase Arabic, **Latin numerals in both
   locales**.
6. **Two products, one codebase** — separating client and owner portals is an
   IA decision, not necessarily a repository split. Decide deliberately.

---

## 7. Technical constraints

**Read this before proposing anything. Several of these are unusual and will
invalidate common approaches.**

### The dependency rule — the big one

> **Five runtime dependencies. No devDependencies. No TypeScript in the app, no
> Tailwind, no PostCSS, no component library.** GRANDMASTER rule 2.

The deps are `@supabase/supabase-js`, `next`, `react`, `react-dom`,
`react-image-crop`. **A redesign that assumes Tailwind, shadcn, Radix, Framer
Motion or a CSS-in-JS runtime is not implementable here.** Styling today is
CSS custom properties in `styles/globals.css` plus co-located `<style jsx>`.

If the redesign genuinely needs a dependency, that is a conversation with the
owner **before** the design depends on it — not a detail discovered at
implementation.

### What exists to build on

- **Design tokens**: `--bg-*`, `--text-*`, `--accent*`, `--radius-*`, `--font-*`
  in `styles/globals.css`. Light/dark aware.
- **UI primitives** in `components/ui/`: Button, Card, Badge, Input, Icon,
  Toast, ConfirmDialog, EmptyState, Skeleton, BrandGlyph.
- **`lib/admin-nav.js`** — navigation IA as pure testable data. The natural
  place to express a new structure.
- **`lib/i18n.js` / `lib/translations.js`** — every string is bilingual.
  New copy needs both languages.
- **`components/PreviewPane.js`** — live preview of the client's site.

### Stack facts

Next.js 14 (**pages router**, not app router) · React 18 · Supabase (Postgres +
Auth + Edge Functions + Storage) · Vercel · PayPal · Resend. Tests are
`node --test` over pure `lib/` modules — no React testing library.

### Where UX changes will touch the backend

| UX change | Backend impact |
|---|---|
| Splitting client/owner into separate routes | Routing + auth guards; **RLS is unchanged and remains the authority** |
| Per-tab URLs | New routes; tab state currently internal |
| Removing slug/username from onboarding | Slug is a real constraint (reserved list, uniqueness, becomes `/{slug}`); username is used by sign-in resolution — **neither can simply be dropped** |
| Client-chosen password at invite | New token flow in `invite-client`; today it generates and relays |
| Any billing email | New Edge Function work; webhook already recognises every trigger |
| Showing entitlement state to clients | Read `tenant_has_active_subscription()`; **do not** reimplement the rule in the UI |
| Surfacing `environment` to owners | Read-only column; **never** change the entitlement predicate (GRANDMASTER 4b) |

**Rules that constrain design directly:** never expose tenant ids or internal
identifiers to clients · never reintroduce a default/singleton tenant · hiding a
control is not a security boundary · entitlement gates **writes**, not reads, so
an unpaid client can browse but not save.

---

## 8. Current foundation status

**The platform is stable enough for a UX redesign.** Everything below is
deployed and verified in production, and the repository matches production.

| Area | Status |
|---|---|
| Password reset | Rebuilt on Resend, branded, bilingual. Live and verified |
| Auth user lookup | `listUsers({email})` bug fixed across three functions |
| Client onboarding | Audited; `invite-client` live |
| Complimentary access | `grant_comp` live — no longer requires SQL |
| Billing safety | Sandbox subscriptions no longer grant production access |
| PayPal environments | Strategy documented; sandbox webhook removed |
| Deployment | Supabase CLI from disk; drift class eliminated |
| Tests / build | 473 tests passing, build green |

**Known gaps that are NOT blockers** — full list and priority in
`docs/workflows/launch-readiness.md`:

- **One launch blocker: the live checkout has never run end to end.** Both live
  subscription rows are `pending`; every entitled workspace is a comp. This is a
  verification task, not a code task, and it does not block UX work.
- No billing emails.
- Health checks documented but not automated.
- Two signup emails off-brand.

---

## 9. Known future UX areas

1. **Client portal redesign** — the customer's product.
2. **Owner admin redesign** — platform operations, not a CRM.
3. **Onboarding experience** — both self-serve and owner-led; the vocabulary
   problem in §4 lives here.
4. **Payment experience** — checkout, plan selection, the unpaid→paid moment.
5. **Billing communication** — receipts, renewals, failures, cancellations.
6. **Navigation redesign** — starting from `lib/admin-nav.js`.
7. **Design system** — formalise tokens and primitives, within the dependency
   rule.
8. **Empty and first-run states** — a brand-new portfolio is empty, and that is
   the first thing every customer sees.
9. **Entitlement made legible** — a client should understand what they can do
   and why, rather than meeting a refused save.

---

## 10. Instructions for the next session

**Do this in order. Do not start with code.**

1. **Read** `docs/GRANDMASTER.md`, then this document, then
   `architecture/overview.md` for routing and admin structure.
2. **Audit the reference portal(s)** the owner nominates — extract information
   architecture and interaction patterns, not visual style. Ask which products
   they mean; do not assume.
3. **Analyse the current information architecture.** `lib/admin-nav.js` and the
   route table in §3 are the raw material. Map every current screen to a role
   and a job.
4. **Produce a redesign blueprint before any implementation**: role separation,
   IA, navigation model, key screens, and the design-system direction — checked
   against the dependency rule in §7.
5. **Then, and only then**, sequence implementation.

**Explicitly avoid:**
- Writing UI code before the IA is agreed.
- Proposing a stack that needs new dependencies without asking first.
- Touching RLS, entitlement, billing or the tenant resolver as part of a UX
  change. If a design seems to require it, raise it as its own decision.
- Redesigning the client's public portfolio output (§6.1).
- Treating this document as permission to skip asking the owner. It records
  intent as of 2026-08-13; the owner is still the authority on taste.

**Documentation discipline:** GRANDMASTER holds permanent architectural
decisions only — never daily history. Implementation truth goes in the owning
technical document. History goes in `docs/engineering-log.md`. If the redesign
produces durable decisions (a role split, a navigation model), those earn a
place in GRANDMASTER or `decisions/decisions.md`; the process of getting there
does not.
