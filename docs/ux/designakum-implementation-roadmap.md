# Designakum — Implementation Roadmap

**Written 2026-08-14.** The execution plan for the redesign. Design authority is
[designakum-design-system-final.md](designakum-design-system-final.md); IA
authority is [designakum-ux-blueprint.md](designakum-ux-blueprint.md); facts
about what exists are in
[designakum-ux-context.md](designakum-ux-context.md).

**This document plans. It does not build.** No code was written and no file
outside `docs/ux/` was touched.

## Context verified before writing

| Check | Result |
|---|---|
| Repository | `~/Documents/GitHub/portfolio-platform` |
| Branch | `main` |
| Sync | **0 ahead / 0 behind `origin/main`** |
| Working tree | Clean except **three untracked UX documents** |
| HEAD | `477ba11` — "Write the UX context handoff and close the stabilisation phase" |

> **Flag, repeated because it has now survived three sessions:**
> `designakum-ux-blueprint.md`, `designakum-design-system.md` and
> `designakum-design-system-final.md` have **never been committed**. One
> `git clean` destroys the entire research phase. **Committing them is the
> zeroth task of Phase 0.**

## Decisions locked by the owner (this session)

These close two of the three blocking items from the design system's §11.2:

| Was | Now |
|---|---|
| **D1** — brand blue undecided | **LOCKED: `#2A6BCE`**, from the logo asset. `#2C6FE0` is retired and must not be reintroduced |
| **D2** — route names undecided | **LOCKED: `/console` (owner), `/studio` (client)**. Public portfolios stay separate |
| Scope ambiguity | **LOCKED: `designakum.site` is the target.** `designakum.com` (marketing) is out of scope — separate repo, separate Supabase project, separate owner account |

**With D1 and D2 locked, no decision blocks implementation planning.**

---

# Part I — Final research-gap assessment

Assessing only the three areas named. No new research was performed beyond
reading this repository.

## Gap 1 — Billing / customer payment experience

### What already exists

**More than the earlier documents implied.** [REPO] `lib/billing-status.js`
(270 lines, unit-tested) already implements a complete state machine:

```
none · comped · pending · trialing · active · canceling · canceled · past_due · expired
```

Each carries `needsAction`, `endsAt`, `renewsAt` and `planCode`. This is not a
sketch — it is a finished projection of `tenant_has_active_subscription()` with
its own test file, and the blueprint already judged its vocabulary and attached
actions correct.

Also present: `billing-plans.js` (334 lines, server-resolved prices, dual
currency), `billing-errors.js`, and **eight billing test files**.

### What is genuinely missing

| Missing | Kind of work |
|---|---|
| Five transactional emails (receipt, renewal, failure, cancellation, welcome-to-paid) | **Backend** — Edge Function work; triggers already recognised by the webhook |
| Renewal-notice **scheduling** | **Infrastructure** — nothing in the platform runs on a schedule today |
| Receipt document design | Design — `credentials-pdf.js` proves dependency-free PDF is possible |
| Cancellation as a three-beat flow | Design |
| The pending-payment moment as confirmation rather than a warning box | Design |

### Classification: **IMPORTANT — not blocking**

**Why not blocking.** Billing is Phase 5. Nothing in the missing list changes the
token system, the shell, the routing split, the console or the studio. The state
machine that everything else reads from already exists and is tested.

**Why important.** It is the largest *user-value* gap in the product — the
platform takes money and says nothing — and the email work has a real backend
tail that must not be discovered late.

**Do this during Phase 4, before Phase 5 opens.** It is copy and flow design over
an existing state machine, not research.

> **On Lumetra not being a billing SaaS:** correct, and it is why §8 of the design
> system took only two *principles* from it — *every state explains itself* and
> *every problem names its exit condition* — rather than any billing pattern.
> **No further reference-product research is warranted here.** The remaining work
> is Designakum-specific copy against a state machine that already exists.

## Gap 2 — Client onboarding experience

### What already exists

**This gap is substantially closed already, and the earlier documents did not
account for it.** [REPO] `lib/onboarding-guide.js` (214 lines, with
`tests/onboarding-guide.test.mjs`) contains `GUIDE_STEPS` — **seven steps**, each
carrying four fields:

```
title   what to do
why     what it changes for them, in one honest sentence
how     2–4 concrete actions, in order
tip     what "good" looks like, so they can judge their own work
```

Steps: `publish` → `photo` → `bio` → `project` → `links` → `theme` → `domain`,
each bound to a tab, **fully bilingual**, and — per its own header comment —
**ordered by how much each step changes the page for a visitor**, not by which
screen it lives on.

The module's reasoning is already correct: *"People who have never built a
portfolio do not get stuck on where the button is; they get stuck on what to put
in the box."*

### What is genuinely missing

Only **presentation**, not content:

- How the guide surfaces at first login — the design system proposes a **setup
  rail** (ordered, persistent, collapsing to a strip once complete).
- Where progress state is stored, and whether it is derived from data
  (does a project exist?) or tracked explicitly.
- The very-first-login moment before any data exists.

### Classification: **LATER — solve during implementation**

The hard part — knowing what to say to someone who has never built a portfolio —
is done, written in both languages, and tested. What remains is a Phase 4 design
task working from existing content.

**One recommendation:** derive completion from the data (a name exists, a project
exists) rather than storing checklist flags. It needs no schema change and it
cannot drift out of sync with reality.

## Gap 3 — Portfolio editing experience

### The strategic question is already answered

> **Is Designakum a website builder or a portfolio management system?**

**A portfolio management system with bounded appearance control.** This follows
from decisions already locked, not from new research:

- Positioning is **"a personal brand, not a website tool"** — the customer
  "does not want to operate software" [REPO: context §1].
- **Client portfolio sites stay customisable**; appearance/theming is a client
  feature and stays one [blueprint §6.1].
- **The redesign targets the platform around the sites, not the sites
  themselves** [blueprint §6.2].

So: the client composes **content into a fixed, well-designed frame**. They do
not lay out pages, position elements, or edit structure. `appearance` is theme
selection within bounds — **not a builder**.

### The current editing model

[REPO] `lib/admin-nav.js`, five client-editable surfaces:

| Tab | Label | What it is |
|---|---|---|
| `profile` | Profile / الملف الشخصي | Identity — name, title, photo, bio |
| `card` | **Home Page** / الصفحة الرئيسية | *"Everything that shows on your public page — logo, banners, stats, and call-to-action buttons"* |
| `projects` | Projects | The portfolio itself |
| `links` | Links | Social and contact |
| `appearance` | Appearance | Theme, colours, fonts |

### What is genuinely unresolved

**Only D8: should `profile` and `card` merge into one "page" editor?**

Now that the labels are visible, they are *not* obviously duplicative —
`profile` is **who you are**, `card` is **how the landing page is composed**. The
case for merging is that a client thinks in terms of "my page", not two records;
the case against is that merging produces one long editor and loses the
distinction between identity and layout.

### Classification: **IMPORTANT — not blocking**

**Why not blocking.** It affects the `/studio` editing IA in Phase 4 only. Phase
1 (tokens), Phase 2 (shell and routing) and Phase 3 (console) are all unaffected
— Phase 2 can map the existing five surfaces to routes, and a later merge is a
route change inside an established shell, not a re-architecture.

**Why important.** It is the largest remaining IA question in the client product
and it should be settled before Phase 4 detail design begins.

## Gap assessment — verdict

| Gap | Classification | When |
|---|---|---|
| Billing / payment experience | **IMPORTANT** | During Phase 4, before Phase 5 |
| Client onboarding | **LATER** | Inside Phase 4 — content already exists |
| Portfolio editing model (D8) | **IMPORTANT** | Before Phase 4 detail design |

> ## **No blocking gaps exist. Implementation planning proceeds.**

**No additional reference-product research is warranted.** Two of the three gaps
are further along in code than the documentation recorded, and the third is a
decision rather than a research question.

---

# Part II — The roadmap

# Section 1 — Current state

## 1.1 Architecture

[REPO, `docs/architecture/overview.md` §1]

- **Next.js 14, Pages Router, plain JavaScript.** No TypeScript, no `tsconfig`.
- **styled-jsx** for all styling; tokens are CSS custom properties in
  `styles/globals.css` (196 lines).
- **Five runtime dependencies, zero devDependencies:** `@supabase/supabase-js`,
  `next`, `react`, `react-dom`, `react-image-crop`.
- **Supabase** — Postgres + Auth + Storage + RLS + 13 Edge Functions (Deno).
- **Tests:** Node's built-in runner over pure `lib/` modules. **40 test files,
  473 tests passing.** No React testing library.
- Deployed on **Vercel**; email via **Resend**; payments via **PayPal**.

## 1.2 Routing, as it stands

| Route | What it is | Who |
|---|---|---|
| `/` | the owner's own public portfolio | public |
| `/{slug}` | a client's public portfolio | public |
| **`/admin`** | **the entire dashboard — owner AND client** | authenticated |
| `/signup`, `/signup/verify` | self-serve signup | public |
| `/subscribe` | PayPal checkout return | authenticated |
| `/reset-password` | password reset | public |
| `/privacy`, `/terms` | legal | public |

## 1.3 Code distribution — the shape of the problem

```
pages/admin.js            6,552 lines   ← both products, one file
pages/index.js            1,551 lines   ← the public site
pages/subscribe.js          423
pages/signup.js             341
components/  (15 files)   3,157 lines total
lib/         (~25 files)  3,897 lines total
styles/globals.css          196 lines
```

`pages/admin.js` is **35% of the application's front-end code** and contains
every editor, the shell, navigation, contexts and modals for **two different
products**.

## 1.4 Known issues

**Structural**

1. **One file, one route, two products.** The owner/client split is a runtime
   conditional inside a 6,552-line component.
2. **Nothing is linkable.** Tab state is internal — no `/admin/projects`, no
   bookmarking, no back button, no deep link from an email.
3. **Owner/client confusion.** An owner is also a tenant admin on every
   workspace, so one screen serves "administering someone else's site" and
   "editing my own".

**Design system**

4. **The brand appears nowhere in application CSS.** `--accent` is `#9FA7FF` /
   `#4f57d8`; `#2A6BCE` is in no stylesheet.
5. **No display type.** Scale caps at 26px; lead-to-body ratio 1.86×.
6. **Motion is ad hoc.** Two duration tokens, one easing curve, **four hardcoded
   durations in `admin.js` alone**, and **20 `@keyframes` blocks** redefining the
   same effects — four separate spinners.
7. **31 emoji used as interface elements**, including 🔴🟡🟢 as status
   indicators.
8. **No `(hover: hover)` gating anywhere** — hover-revealed actions are
   unreachable on touch.
9. **Duplicated styling decisions** — hand-picked margins in `<style jsx>`
   blocks instead of the space scale; `.btn-primary-inline` / `.ts-primary`
   existed in four copies before being tokenised.

**Product**

10. **Money is silent** — no billing email of any kind.
11. **Entitlement is invisible** — an unpaid client meets a refused save with no
    explanation.
12. **Onboarding asks for platform vocabulary** — slug and username.

## 1.5 What is good and must survive

Not everything needs replacing, and the redesign should not pretend otherwise:

- **`lib/admin-nav.js`** — navigation IA as pure, unit-tested data. The cleanest
  artefact in the codebase and the natural place to express the new structure.
- **`lib/billing-status.js`** — a correct, tested projection of a database rule
  into UI vocabulary. **The model for the whole data-translation layer** (§6).
- **`lib/onboarding-guide.js`** — bilingual guidance content, already written.
- **`lib/translations.js`** — every string bilingual, 879 lines.
- **`components/ui/`** — the right set of primitives.
- **`components/PreviewPane.js`** — live preview; the strongest asset for making
  the client's own work visible.
- **The test culture** — 40 pure-module test files. Preserve it.

---

# Section 2 — Migration strategy

## 2.1 The recommendation: **hybrid — strangle, don't rewrite**

**Build `/console` and `/studio` as new routes alongside `/admin`, migrating
surface by surface, and delete `/admin` only when both are complete.**

## 2.2 Why not a rewrite

A 6,552-line file that handles auth, tenant resolution, entitlement, nine
editors, image cropping and billing is **not documented by its own docs in full
detail** — much of what it knows is encoded in the code. A rewrite would:

- Lose undocumented edge-case handling discovered over months of production use.
- Produce one enormous, unreviewable, unrevertible change.
- Leave no working product during the transition.
- Put RLS, entitlement and billing at risk simultaneously — which
  [REPO, GRANDMASTER §4.3] explicitly forbids changing two of at once.

**The platform has thirteen live tenants and real subscriptions. A rewrite is
not a proportionate risk.**

## 2.3 Why not purely incremental (in place)

Refactoring `/admin` in place cannot deliver the core outcome: **the owner and
client experiences must stop being one conditional screen.** Incrementalism
inside one file preserves exactly the structure the redesign exists to remove.

## 2.4 The hybrid, concretely

```
Now         /admin  ──────────────────────────────────►  (unchanged, serving)

Phase 1     tokens land in globals.css — /admin inherits them, visibly improves
Phase 2     /console and /studio shells exist, auth-guarded, mostly empty
Phase 3     /console surfaces move over one at a time
Phase 4     /studio surfaces move over one at a time
Phase 5+    /admin redirects; deleted once nothing references it
```

**Five properties that make this safe:**

1. **`/admin` keeps working throughout.** No flag day.
2. **Phase 1 improves the existing product** — tokens are inherited by `/admin`
   immediately, so value lands before any migration.
3. **Every phase is independently revertible** — a route can be removed without
   touching anything else.
4. **No phase requires a schema, RLS, entitlement or billing-logic change.**
5. **Both products can be compared side by side** during migration, which is how
   behavioural regressions get caught.

## 2.5 The one hard prerequisite

> **`RESERVED_SLUGS` must include `studio` and `console` BEFORE either route
> ships.** [MEASURED] `lib/reserved-slugs.js` currently reserves `signin`,
> `dashboard`, `account`, `billing`, `settings`, `status` and `health` — but
> **not `studio`, `console` or `me`**.
>
> A tenant slug becomes a top-level route, so a customer owning `studio` would be
> **silently shadowed** by the static route: Next.js resolves the static path
> first and their site simply stops resolving.
>
> **It is a one-line change with no migration — and it must be checked against
> existing slugs first.** This is Phase 0.

---

# Section 3 — Implementation phases

Every phase is **independently shippable and independently revertible**. No phase
requires a new dependency. No phase changes RLS, entitlement, billing logic or
the tenant resolver.

**Risk scale:** 🟢 low (visual/additive, trivially revertible) · 🟡 medium
(structural, but no data or auth impact) · 🔴 high (touches auth, data or money).

---

## Phase 0 — Preserve and prepare

**Goal.** Stop the research from being one command away from deletion, and remove
the one hard blocker to Phase 2.

**Scope.**
1. **Commit the four UX documents.** They are untracked and have survived three
   sessions that way.
2. **Add `studio`, `console` and `me` to `RESERVED_SLUGS`** — after querying
   `tenants` to confirm no existing slug collides.
3. Record the locked decisions (`#2A6BCE`, `/console`, `/studio`) where they
   belong: architectural decisions in `decisions/decisions.md`, not in a handoff.

**Files.** `docs/ux/*` · `lib/reserved-slugs.js` · `tests/` (a case per new slug)
· `docs/decisions/decisions.md`

**Backend impact.** **None.** `RESERVED_SLUGS` is a pure module imported by the
signup form and the workspace-creating Edge Function. Adding entries changes what
*future* signups may claim; it does not touch existing rows.

> **[MEASURED] The collision check has been run — it passes.**
> `SELECT count(*) FILTER (WHERE slug IN ('studio','console','me')) FROM tenants`
> against `gphrzvjlstznhypcfgre`, 2026-08-14 (read-only):
>
> ```
> total_tenants: 13     collisions: 0
> ```
>
> **No live tenant owns `studio`, `console` or `me`.** The route names are safe
> and the reservation can proceed.
>
> **Re-run this immediately before the change lands** if any time has passed —
> self-serve signup is live, so a new customer could claim one of these words in
> the interim. It is a five-second query and it protects against silently
> unresolving a customer's site.

**Risk.** 🟢 — collision check run and clean.

**Testing.** `npm test`. Add assertions that the three slugs are rejected.

**Rollback.** `git revert`. No state to unwind.

---

## Phase 1 — Design system foundation

**Goal.** Give the product a visual identity and remove the mechanical causes of
"it feels generic". **Solves it for `/admin` immediately** — before any migration
— because the existing app inherits the tokens.

**Scope.**

| Change | Detail |
|---|---|
| **Brand tokens** | `--brand: #2A6BCE` + `--brand-hover/-ink/-soft/-line/-eyebrow/-focus` via `color-mix()`. `--accent*` becomes an alias so nothing breaks |
| **Retire gradient and glow** | `--accent-gradient`, `--accent-glow` removed; primary button becomes a flat fill |
| **Type scale** | Add `--text-3xl: 34px`, `--text-4xl: 44px`. Additive |
| **Tracking tokens** | `--track-eyebrow/-tight/-lead` + one global `.eyebrow` class **with its `html[dir="rtl"]` override** |
| **Arabic display** | `--font-display-ar: 'Reem Kufi'` — already in the font request at 400–700 |
| **Numerals** | `--numeric` + `font-variant-numeric: tabular-nums` |
| **Semantic `-ink`** | `--success-ink`, `--warning-ink`, `--danger-ink`, plus a `--neutral` set |
| **Line heights** | Including `--leading-arabic: 1.75` |
| **Motion tokens** | `--t-press/-ui/-enter/-stag`, three easing curves. `--transition*` kept as aliases |
| **Keyframe consolidation** | 20 blocks → 5 global (`fade`, `rise`, `pop`, `spin`, `sweep`); delete local copies |
| **Reduced motion** | Targeted downgrades; the skeleton sweep survives |
| **Dark ramp on navy** | Specified; **light theme is the priority** |

**Files.** `styles/globals.css` (the bulk) · `components/ui/*` (consume tokens) ·
`pages/admin.js`, `pages/index.js`, `pages/subscribe.js`, `pages/signup/verify.js`,
`components/CredentialsHandoff.js` (delete local keyframes, replace 4 hardcoded
durations)

**Backend impact.** **None whatsoever.** This is CSS.

**Risk.** 🟢 — but with one real trap: **`--accent` is referenced throughout
`admin.js`.** Aliasing rather than renaming is what keeps this low-risk. Do not
rename tokens in this phase.

**Testing.**
- `npm test` + a green build.
- **Contrast assertions** — [REPO] `lib/contrast.js` and `tests/contrast.test.mjs`
  already exist. **Extend them to assert every token pair meets AA.** This is the
  highest-value new test in the whole roadmap.
- Manual: `/admin` and `/` in **light and dark, Arabic and English** — four passes.

**Rollback.** Revert the commit. Tokens are additive and aliased; nothing depends
on their removal.

---

## Phase 2 — Application shell

**Goal.** End the structural problem: **owner and client stop being one screen.**
Give the product linkable, bookmarkable URLs.

**Scope.**
- Create `/console` and `/studio` route trees with a shared `AppShell`
  (sidebar, page header, content region).
- **Per-surface routes** — `/studio/projects`, `/console/clients` — replacing
  internal tab state.
- **Auth guards** on both trees. `/console` requires `is_platform_owner()`;
  `/studio` requires an authenticated tenant member.
- **Responsive shell**: full sidebar → icon rail (≤1200px) → bottom bar (≤720px).
- **Navigation from `lib/admin-nav.js`**, extended — not replaced.
- `/admin` continues to work, untouched.

**Files.** New: `pages/console/*`, `pages/studio/*`, `components/shell/*`.
Modified: `lib/admin-nav.js` (extend), `lib/reserved-slugs.js` (done in Phase 0).
**`pages/admin.js` is not modified in this phase.**

**Backend impact.** **Routing and auth guards only. RLS is unchanged and remains
the authority.** The guards are convenience, not security — a user who
hand-types `/console` is stopped by RLS regardless of what the route renders.

> **The `must_set_password` gate must be carried over.** [REPO] It is currently
> layered over `Admin`; a split that forgets it lets someone owing a password
> into `/studio`. **This is the single most likely correctness bug in Phase 2.**

**Risk.** 🟡 — new auth-adjacent surface area, no data changes.

**Testing.**
- Extend `tests/admin-nav.test.mjs` for the two-portal IA.
- New pure tests for route-to-role mapping.
- **Manual matrix, and it must be exhaustive:** owner → `/console` ✓, owner →
  `/studio` (operator mode), client → `/studio` ✓, client → `/console` **must be
  refused**, unauthenticated → both **must redirect**, `must_set_password` user →
  both **must be gated**.
- Verify `/{slug}` public sites still resolve — the reserved-slug change and new
  top-level routes both touch this.

**Rollback.** Delete the route directories. `/admin` never stopped working.

---

## Phase 3 — Owner Console

**Goal.** Answer *"what needs me today?"* — and stop the owner having to *know*
which failures exist and go looking.

**Scope.**
- **`/console` home** — 3–4 navigable question-tiles with qualifying footers, over
  an attention queue.
- **`/console/attention`** — grouped by *reason*, each with a definition and a
  **"what clears it"** line: payment failed · handover unconfirmed · DNS
  unverified · invite never claimed · disabled but paying.
- **`/console/clients`** — a card grid of objects, with the ghost "Add a client"
  card.
- **`/console/clients/[id]`** — **one scrolling page, no tabs.** Record header,
  rescoped summary tiles, subscription state, access, domain.
- **Billing overview** — read-only; surfacing `environment` to owners, which is a
  **read-only column** [REPO].
- **Operator mode** — explicit entry from a client record, marked twice, exit
  inside the marker.

**Files.** `pages/console/*`, `components/console/*`, new shared primitives
(`PageHeader`, `StatTile`, `DataRow`, `RecordHeader`, `Callout`,
`OperatorBanner`), `lib/attention.js` (new, pure, tested).

**Backend impact.** **Read-only.** Every attention state is derivable from
existing data: `subscriptions`, `tenants.handed_over_at`, `tenant_domains.status`
and invite state.

> **Two things explicitly NOT in this phase:** the **activity feed** (needs an
> event log — its own project) and the **engagement brief** (needs a column or
> table, and must be **owner-visible only** because it holds commercial terms).

> **[REPO] Do not build a client-facing "verified" badge on
> `tenant_domains.status`** — it is set by hand and drifts. Word it honestly or
> verify live.

**Risk.** 🟡 — reads production data across all tenants; no writes beyond what
`/admin` already does.

**Testing.** Pure tests for `lib/attention.js` (state → reason → exit condition).
Manual: operator mode entry/exit, and **confirm a client account cannot reach any
`/console` route**.

**Rollback.** Route-level. `/admin`'s owner surfaces remain until Phase 6.

---

## Phase 4 — Client Studio

**Goal.** Turn a settings panel into a product: **state before controls.** The
client should open it, learn everything is fine, and close it.

**Scope.**
- **`/studio` home** — is my page live, is it complete, is anyone visiting, am I
  paid up. **With imagery** — `PreviewPane` and a project thumbstrip.
- **Editors at their own routes** — `/studio/profile`, `/studio/projects`, etc.
- **Entitlement made legible** — a persistent `Callout` stating the state and its
  exit *before* the client types, with the save control carrying the same reason.
- **Onboarding setup rail** — rendering the existing `GUIDE_STEPS`, with
  completion **derived from data**, not stored flags.
- **Empty states throughout** — new client, no projects, no analytics, no billing
  history, comped.
- **No internal vocabulary** — no tenant, workspace, slug, username, environment.

**Files.** `pages/studio/*`, `components/studio/*`, `lib/client-language.js`
(new — the projection module, §6), `lib/onboarding-guide.js` (consumed, not
rewritten), `components/ui/EmptyState.js` (extended).

**Backend impact.** **Reads only.** Entitlement is **read** via
`billing-status.js`, never reimplemented. Deriving setup progress from existing
data needs no schema change.

> **Depends on D8** (merge `profile` + `card`?). Phase 4 can begin with the
> existing five surfaces mapped to routes; **the merge decision is needed before
> the editor IA is finalised**, not before the phase starts.

**Risk.** 🟡 — this is the customer-facing product for thirteen live tenants.
Behavioural parity with `/admin`'s editors matters more than visual polish.

**Testing.** Pure tests for `lib/client-language.js` — **including an explicit
assertion that no internal vocabulary can be emitted** (§6.4). Manual: a comped
client, an unentitled client, a brand-new empty workspace, and a fully populated
one — **each in Arabic and English**.

**Rollback.** Route-level.

---

## Phase 5 — Customer experience (billing communication)

**Goal.** Stop the product going silent when someone gives it money.

**Scope.**
- **Four webhook-driven emails** — receipt, payment failed, cancelled,
  welcome-to-paid. Bilingual, brand-tokened, through existing Resend
  infrastructure.
- **The renewal notice** — **separately scoped**, because it needs a scheduler.
- **The pending-payment moment** — full confirmation, not a warning box.
- **Printable receipts** — `credentials-pdf.js` proves this needs no dependency.
- **Cancellation as three beats** — what you keep → one honest alternative →
  confirm. **No dark patterns.**
- **Two off-brand signup emails** brought onto the token palette.

**Backend impact.** **This is the only phase with substantial backend work.**
Edge Function changes to send on triggers the webhook **already recognises**.

> **Explicitly out of scope: billing *logic*.** No change to
> `deriveBilling()`, the entitlement predicate, plan resolution, or the webhook's
> state handling. **Adding a send is not changing a rule.**

**Risk.** 🔴 — touches the billing webhook, the most consequential Edge Function
in the platform. **Mitigation: send-only changes, added after existing handling,
never inside it.**

**Testing.** Pure tests for email content selection and language. **Send to a
real inbox in both languages before shipping.** Verify the webhook still
processes correctly **when the email send fails** — a failed email must never
break entitlement.

**Rollback.** Feature-flag the sends, or revert the function. **Entitlement must
not depend on email success** — this is a design requirement, not a test.

---

## Phase 6 — Polish and retirement

**Goal.** Finish the system, and delete the thing the redesign replaced.

**Scope.**
- **Motion applied** — staggered entrances, the travelling nav indicator with its
  `:has()` fallback, `okFlash` confirmations.
- **Loading states** — skeletons matching real layouts; **no full-screen
  spinners**.
- **Empty states** everywhere, worded.
- **Remove all 31 emoji**; icons to butt caps / miter joins.
- **Accessibility pass** — AA contrast verified, focus visible everywhere,
  keyboard paths, `:focus-within` on hover-reveals, ≥44px targets in `/studio`.
- **Arabic/English refinement** — **every screen reviewed in Arabic**, every
  breakpoint too.
- **Retire `/admin`** — redirect, then delete once nothing references it.

**Files.** Broad but shallow. `pages/admin.js` finally deleted.

**Backend impact.** None.

**Risk.** 🟢, except the `/admin` deletion — 🟡. **Redirect for a full release
cycle before deleting.**

**Testing.** Full manual matrix: two portals × two roles × two languages × two
themes × three breakpoints. Contrast assertions green. `npm test` + build.

**Rollback.** Restore the redirect. Do not delete `/admin` until `/console` and
`/studio` have been in production without regression.

---

# Section 4 — Safety rules

**These are invariants, not preferences. No design goal outranks them.**

## 4.1 Must not break

| System | The rule | How a redesign could break it |
|---|---|---|
| **RLS** | **The security boundary. Hiding or disabling a control is never one** | Describing operator read-only mode as a security feature; assuming a route guard protects data |
| **Authentication** | Never replace Supabase Auth; never write custom password hashing | "Simplifying" the sign-in flow |
| **`must_set_password`** | Currently gates `Admin`. **Must gate `/console` and `/studio` too** | A portal split that forgets it — **the most likely Phase 2 bug** |
| **User lookup** | **Never `listUsers({ email })`** — it has no email filter and silently ignores the argument. Use `_shared/find-user.ts` | Any new auth-adjacent function |
| **Entitlement** | Gates **writes, not reads**. UI **reads** it via `billing-status.js` and never restates it | Reimplementing the rule to render a badge |
| **The predicate** | **`environment IS DISTINCT FROM 'sandbox'`** — never `= 'live'`. Comps carry NULL; `= 'live'` revokes every comped client at once | "Tidying" a query while surfacing environment to owners |
| **PayPal environments** | Sandbox must never grant production access | Test fixtures leaking into a shared path |
| **Comps** | Exist, are seven of the current workspaces, must remain supported | Treating comped as an error or missing state |
| **Tenant resolution** | **Never reintroduce a default or singleton tenant** — this once served a real client's site to strangers | A convenience fallback in a new shell |
| **Reserved slugs** | Every new top-level segment reserved **before** the route ships | Phase 2 shipping ahead of Phase 0 |
| **Email infrastructure** | Resend paths are live and branded. **Entitlement must never depend on an email succeeding** | Phase 5 sending inside webhook state handling rather than after it |
| **Prices** | Resolve server-side from `provider_plans` | Hardcoding a figure in a redesigned checkout |
| **Dual currency** | Quote SAR, PayPal debits USD, **state both** — a surprise USD figure becomes a dispute | "Cleaning up" the checkout copy |

## 4.2 Process rules

1. **Never change two of {RLS, auth, tenant resolver, billing} in one change.**
2. **`npm test` and a build pass before anything ships.** 473 tests today.
3. **Verify claims against the database before acting on them** — more than one
   reported failure here was correct behaviour observed at the wrong moment.
4. **A test double must never be more capable than the thing it replaces.** The
   `listUsers` bug passed 458 tests because the fake implemented a filter the
   real SDK lacks. **When a test and production disagree, suspect the fake.**
5. **Every screen reviewed in Arabic before it is called done.**

---

# Section 5 — Component migration strategy

## 5.1 Verdict per existing component

### KEEP — consume tokens, no structural change

| Component | Why |
|---|---|
| `ui/Toast.js` | Correct pattern; provider + hook |
| `ui/ConfirmDialog.js` | Provider + hook; destructive confirmation depends on it |
| `ui/Skeleton.js` | The right loading primitive |
| `ui/Input.js` | Needs focus-ring and error-state tokens only |
| `PreviewPane.js` | **Strategically valuable** — the client's own work, visible |
| `billing/PlanPicker.js` | Reads server-resolved prices correctly |
| `LegalPage.js` | Out of the redesign's path |

### MODIFY

| Component | Change |
|---|---|
| `ui/Button.js` | Flat primary (drop gradient/glow); add `destructive` and `ghost`; press timing; preserve width while loading |
| `ui/Card.js` | One elevation; **no border on a tinted ground**; add the `is-urgent` modifier (border + ink, not a second surface) |
| `ui/Badge.js` | Use `-ink` tokens; support state **and** quantity in one chip |
| `ui/Icon.js` | Butt caps, miter joins; absorb the emoji being deleted |
| **`ui/BrandGlyph.js`** | **`strokeLinecap`/`strokeLinejoin` `round` → `butt`/`miter`** — a two-word brand fix |
| `ui/EmptyState.js` | Extend for worded absence, ghost cards, "what fills this" |
| `CredentialsHandoff.js` | Tokens + delete its local keyframes |

### EXTRACT from `pages/admin.js`

**This is the real work of Phases 3–4.** Extract, do not rewrite — behaviour
first, appearance second.

| Extract | Into | Notes |
|---|---|---|
| The nine editors | `components/studio/editors/*` | One at a time, behaviour preserved |
| Shell / sidebar / header | `components/shell/*` | Shared by both portals |
| Owner Sites + Subscribers | `components/console/*` | Becomes clients + records |
| Tenant switching | `components/shell/OperatorMode.js` | [REPO] `switchTenant()` already exists — **made legible, not rebuilt** |
| Local keyframes | `styles/globals.css` | Phase 1 |
| Domain management | `components/console/DomainPanel.js` | Owner-side |

### ADD — new, plain React + `<style jsx>`

`PageHeader` · `StatTile` · `StatusLine` · `DataRow` · `RecordHeader` ·
`Checklist` (setup rail) · `Thumbstrip` · `Callout` · `OperatorBanner` ·
`AttentionGroup` · `Diamond` (pending D3)

### REPLACE — nothing

**No existing component is replaced wholesale.** The primitives are the right
set; the problem is that `admin.js` largely bypasses them.

## 5.2 Explicitly rejected

| Rejected | Why |
|---|---|
| **Tailwind** | GRANDMASTER §4.2. Every decision in the design system is implementable with CSS custom properties and `<style jsx>` |
| **TypeScript** | Same. The `lib/` modules are pure and well-tested; types would not have caught the bugs this codebase actually had |
| **A component library** (Radix, shadcn) | Ten primitives already exist and fit |
| **Framer Motion** | The motion system is four durations and three curves |
| **A fifth font family** | Reem Kufi is already loaded at 400–700; Manrope at 400–800 |
| **CSS-in-JS runtime** | styled-jsx is already there |

**Nothing in this roadmap requires a new dependency.**

---

# Section 6 — Data translation layer

## 6.1 The principle

> **The client sees outcomes, not internal machinery.** Their model of their own
> state may be **simpler** than the platform's, but **never different from it.**

[OBSERVED] Lumetra's owner sees seven pipeline stages; their client sees five —
three internal states collapsed into "Received". Nothing invented, nothing false.

**And their own product shows how this is lost:** the client's activity feed
reports *"moved this from Picked up to Waiting to start"* — the exact internal
vocabulary the progress rail hides — **because the projection lived in the status
component rather than at the data layer.**

## 6.2 The architectural rule

> **One pure module. Every client-facing surface passes through it.**

```
lib/client-language.js      platform state  →  customer sentence
```

Applies **without exception** to: `/studio` dashboard · activity/notifications ·
**all five billing emails** · receipts · entitlement callouts · empty states.

[REPO] **`lib/billing-status.js` is the model** — it mirrors a database rule into
UI vocabulary, is pure, and is unit-tested. `client-language.js` is the same
shape, one level up.

**It reads state. It never restates a rule.** Where it and the database disagree,
the database wins.

## 6.3 Translation table

| Platform state | Client sees | Never |
|---|---|---|
| `tenants.status = 'active'` + entitled | **Live** — "your page is online" | "active", "enabled" |
| `status = 'disabled'`, never published | **Not published yet** | "disabled", "inactive" |
| Entitled = false, has content | **Paused** — "changes will not save until your subscription is active. Your work is safe." | "unentitled", "no write access" |
| `deriveBilling → comped` | **Complimentary — nothing to pay** | "comped", "free tier", an error |
| `deriveBilling → pending` | **Confirming your payment** | "pending", a warning box |
| `deriveBilling → past_due` | **Payment failed — N days left**, fix at PayPal | "past_due" |
| `deriveBilling → canceling` | **Your page stays live until 4 March 2027** | "cancel_at_period_end" |
| `tenant_domains.status` | **honest wording only** — the column drifts | "Verified ✓" |
| `subscriptions.environment` | **never shown to a client** | anything |
| tenant id / slug / username / workspace | **never shown to a client** | anything |

## 6.4 The test that enforces it

**A pure test asserting the projection cannot emit internal vocabulary:**

```
for every platform state × both locales:
  assert output contains none of
    ['tenant','workspace','slug','username','environment','sandbox',
     'past_due','comped','entitle','RLS','null','undefined']
```

**This is the single highest-value test in the roadmap.** It is cheap, it runs in
the existing Node runner, and it makes the §6.1 principle mechanically
enforceable instead of a matter of discipline — which is exactly where the
reference product's own feed failed.

---

# Section 7 — First implementation milestone

## 7.1 Recommendation: **Phase 0 + Phase 1, as one branch**

**Commit the docs, reserve the slugs, then land the token system.**

## 7.2 Why this is the right first task

| Criterion | How it is met |
|---|---|
| **Validates the design system** | The tokens meet real screens immediately — `/admin`, `/`, signup, checkout — in four combinations (2 themes × 2 languages) |
| **Visible progress** | The brand appears in the product **for the first time**. The founder's "not premium" complaint is partly answered before any migration |
| **Avoids dangerous backend changes** | **Phase 1 is CSS.** Phase 0's only code change is adding strings to a pure `Set` |
| **Cheaply revertible** | One `git revert` |
| **Unblocks everything** | Phase 2 cannot ship without the reserved slugs; Phases 3–6 all consume the tokens |
| **Forces the hard question early** | The Arabic eyebrow (`html[dir="rtl"]`) is resolved **now**, not after thirty components assume a Latin-only device |

## 7.3 Definition of done

1. Four UX documents committed.
2. `studio`, `console`, `me` reserved — **after** a `tenants` collision query.
3. `--brand: #2A6BCE` live; `--accent*` aliased; **gradient and glow gone**.
4. `--text-3xl` / `--text-4xl`, tracking tokens, one global `.eyebrow` **with its
   RTL override**.
5. Reem Kufi wired as `--font-display-ar`; tabular figures on money/dates/counts.
6. `-ink` added to every semantic set; a `--neutral` set exists.
7. Motion tokens live; **20 keyframes → 5**; the four hardcoded durations in
   `admin.js` replaced.
8. **`tests/contrast.test.mjs` extended to assert AA for every token pair.**
9. `npm test` green, build green.
10. Manual: `/admin` and `/` in light + dark × Arabic + English.

## 7.4 What must NOT be in the first milestone

❌ New routes · ❌ component extraction from `admin.js` · ❌ any Edge Function ·
❌ any schema change · ❌ any RLS or entitlement change · ❌ the diamond
(pending D3) · ❌ renaming `--accent`

---

# Final output

## 1. Recommended implementation order

| # | Phase | Risk | Blocked by |
|---|---|---|---|
| **0** | Preserve and prepare | 🟢 | — |
| **1** | Design system foundation | 🟢 | Phase 0 (docs) |
| **2** | Application shell | 🟡 | **Phase 0 (reserved slugs — hard)** |
| **3** | Owner Console | 🟡 | Phase 2 |
| **4** | Client Studio | 🟡 | Phase 2; **D8 before editor IA** |
| **5** | Customer experience / billing comms | 🔴 | Phase 4; billing copy decisions |
| **6** | Polish and retirement | 🟢 / 🟡 | Phases 3 + 4 in production |

**Phases 3 and 4 may run in parallel** if two people are available — they share
only the Phase 2 shell. **Phase 5 must not start before Phase 4** or the emails
will be written against vocabulary that is still moving.

## 2. Remaining risks

| Risk | Severity | Mitigation |
|---|---|---|
| ~~A slug collides with `studio`/`console`~~ | ~~🔴~~ → 🟢 | **CHECKED 2026-08-14: 13 tenants, 0 collisions.** Re-run immediately before the change lands — signup is live |
| **`must_set_password` not carried into the new shells** | 🔴 | Explicit test case in the Phase 2 matrix |
| **The live checkout has never run end to end** | 🔴 | **Pre-existing, unrelated to the redesign.** Both live subscription rows are `pending`; every entitled workspace is a comp. A verification task that should not be conflated with UX work |
| **Behavioural regression extracting editors** | 🟡 | Extract before restyling; compare against `/admin` side by side |
| **Phase 5 touching the billing webhook** | 🟡 | Sends added *after* state handling, never inside. Entitlement must not depend on email success |
| **`/admin` deleted too early** | 🟡 | Redirect for a full release cycle first |
| **Scope creep into the activity feed or engagement brief** | 🟡 | Both need schema work. **Explicitly out of Phase 3** |
| **Two brand blues re-entering** | 🟢 | `#2C6FE0` is retired. One token, `color-mix()` derivations |

## 3. Remaining decisions

| ID | Decision | Needed by |
|---|---|---|
| **D8** | Merge `profile` + `card` into one "page" editor? | **Before Phase 4 editor IA** |
| **D3** | Is the diamond available as the app mark? | **Before Phase 2's icon rail** and the favicon |
| **D5/D6** | Density split, and client body size (14 or 16px)? | Phase 4 |
| **D7** | Attention queue vs charts on `/console` home | Phase 3 |
| **D9** | Renewal-notice scheduling — introduce a scheduler, or defer? | Phase 5 |
| **D10** | Does `comped` belong in the checkout refusal list? | Phase 3 comp dialog |

## 4. What requires Feras approval

**Before Phase 0 ships:**
1. ~~Confirmation that no live tenant owns `studio`, `console` or `me`.~~
   **RESOLVED — verified against the database 2026-08-14: 13 tenants, 0
   collisions.** No approval needed; re-run the query immediately before the
   change lands, since signup is live.

**Before Phase 2:**
2. ~~D3 — the diamond as app mark.~~ **WITHDRAWN — a Kufic monogram already
   exists** (see [designakum-brand-asset-audit.md](designakum-brand-asset-audit.md)).
   No approval needed to use the brand's own mark.
   **Replaced by an asset dependency, not a decision:** Phase 2's brand block and
   icon rail need **SVG versions of the wordmark and monogram** (audit M1, M2) —
   all current assets are 6250² PNGs. **Phase 6's emoji removal needs the icon
   set (M5), which does not exist at all.**

**Before Phase 4:**
3. **D8 — the editing model.** The last substantial IA question.
4. **D5/D6 — density and client body size.**

**Before Phase 5:**
5. **D9 — scheduler.** An infrastructure decision, not a UX one.
6. **Sign-off on billing email copy**, in both languages.

**Standing:**
7. **Any new dependency.** The answer is expected to be "no" — nothing in this
   roadmap needs one.

## 5. Is additional research required?

> **No.**

Two of the three assessed gaps are **further along in code than the
documentation recorded** — `lib/billing-status.js` is a complete, tested state
machine, and `lib/onboarding-guide.js` is finished bilingual guidance content.
The third (the editing model) is a **decision**, not a research question, and its
strategic half is already answered by locked positioning.

**What remains is design and engineering, not investigation.** Specifically:

- **No more reference-product audits.** Lumetra has been audited twice — its
  design system from the stylesheet and its authenticated application. The
  transferable principles are extracted and, where they conflict with
  Designakum's brand, **explicitly rejected**.
- **No more brand research.** The assets were measured; the palette is locked.
- **Billing copy and the D8 decision** are the only open design work, and both
  are scheduled inside phases rather than ahead of them.

**The next action is Phase 0, not another research session.**

