# Designakum — Execution Plan

**Written 2026-08-14. The engineering plan of record.** Research is closed; this
document converts it into work.

**Verified before writing:** repo `~/Documents/GitHub/portfolio-platform`, branch
`main`, clean apart from five untracked UX documents, synced with `origin/main`.

## Where authority lives

| Question | Document |
|---|---|
| What does it look like? | `designakum-design-system-final.md` |
| What is the information architecture? | `designakum-ux-blueprint.md` |
| What exists today, and why? | `designakum-ux-context.md` |
| What brand assets are usable? | `designakum-brand-asset-audit.md` |
| **How do we build it?** | **This document** |

`designakum-implementation-roadmap.md` is **superseded by this document** for
phasing and tasks. Its research-gap assessment (Part I) remains valid.

---

## Two corrections from reading the code

Both make the work **smaller and safer** than the planning documents assumed.

### Correction 1 — an icon system already exists

The brand asset audit reported *"Zero icons exist"*. That was true of the brand
**asset folder** and false of the **codebase**.

**[REPO] `components/ui/Icon.js` exports 22 icons** via `ICON_NAMES`:

```
home · users · user · card · receipt · folder · link · palette · chart · globe
settings · external · logout · menu · close · plus · copy · check · download
mail · message · key
```

**The navigation set is complete.** What is missing is a **status and attention
set** — roughly 12 additions, not a system from scratch. This moves the icon work
from *blocking* to *incremental*, and it means the 31 emoji can be replaced
progressively rather than all at once.

### Correction 2 — `admin.js` is already componentised

The planning documents describe 6,552 lines as if it were monolithic JSX. **It is
not.** [REPO] It contains **~40 top-level named function components** with clean
boundaries.

**This is the single most important engineering fact in the plan.** Migration is
*moving named functions into files and swapping their data source* — not
untangling JSX. Risk drops accordingly.

| Component | Lines (approx) | Destination |
|---|---|---|
| `OwnerClientsOverview` | 663 | `/console/clients` |
| `SubscribersOverview` | 534 | `/console/revenue` |
| `TenantAdminSection` | 552 | split: owner → `/console`, client → `/studio/workspace` |
| `BillingEditor` | 476 | `/studio/plan` |
| `AnalyticsEditor` | 320 | `/studio/analytics` |
| `CardEditor` (+3 rows) | 310 | `/studio` editor |
| `ProjectsEditor` (+form) | 261 | `/studio/projects` |
| `PendingRow` | 254 | `/console` onboarding |
| `LinksEditor` (+picker) | 182 | `/studio/links` |
| `ClientPanel` | 179 | `/console/clients/[id]` |
| `ProfileEditor` | 177 | `/studio` editor |
| `AccountEditor` | 176 | shared `/account` |
| `DomainManager` | 163 | both portals |
| `AppearanceEditor` | 139 | `/studio/appearance` |
| `ClientHome` | 139 | `/studio` home |
| `WebsiteGuide` | 85 | `/studio` setup rail |

**Owner-side ≈ 1,630 lines · client-side ≈ 1,900 lines.** The rest is shell,
auth and shared plumbing.

---

# 1 — Implementation roadmap

Seven phases. **Every phase is independently shippable and revertible. No phase
adds a dependency. No phase changes RLS, entitlement, billing logic or the tenant
resolver.**

| Phase | Goal | Risk | Ships |
|---|---|---|---|
| **0** | Foundations — docs, tokens, routes, assets, icons | 🟢 | Visible brand improvement to existing `/admin` |
| **1** | Application shell — `/console` + `/studio` skeletons | 🟡 | Linkable, role-separated routes |
| **2** | Owner Console | 🟡 | Attention system, client records |
| **3** | Client Studio | 🟡 | State-first dashboard, editors, entitlement legibility |
| **4** | Editor redesign | 🟡 | The one-page editor model |
| **5** | Billing & customer communication | 🔴 | Five emails, receipts, cancellation flow |
| **6** | Polish & retirement | 🟢/🟡 | Motion, empty states, a11y, `/admin` deleted |

**Phase 0 deliberately mixes tokens, assets and route prep** — they are all
prerequisites, all low risk, and shipping them together means one visible
improvement lands before any migration begins.

---

# 2 — Component architecture

## 2.1 Target tree

```
pages/
  console/
    index.js              home — attention-first
    attention.js
    clients/index.js
    clients/[id].js       ONE scrolling page, no tabs
    revenue.js
    onboarding.js
  studio/
    index.js              home — state before controls
    page.js               identity + home-page composition  ← OPEN DECISION E1
    projects/index.js
    projects/[id].js
    links.js
    appearance.js
    analytics.js
    workspace.js
    plan.js
  account.js              shared
  admin.js                UNTOUCHED until Phase 6

components/
  ui/                     PRIMITIVES — extend, never replace
    Button · Card · Badge · Icon · Input · EmptyState · Skeleton
    Toast · ConfirmDialog · BrandGlyph
    + PageHeader · StatTile · StatusLine · Callout · DataRow · Chip

  shell/                  SHARED BY BOTH PORTALS
    AppShell.js           sidebar + header + content region
    Sidebar.js            full → icon rail → bottom bar
    NavIndicator.js       travelling pill, :has() fallback
    BrandBlock.js         wordmark | monogram + role
    PageHeader.js         eyebrow + title + one action
    OperatorBanner.js     persistent, exit inside

  console/
    AttentionGroup.js     definition + "what clears it" + rows
    ClientCard.js
    ClientRecord/         RecordHeader · SubscriptionPanel · AccessPanel · DomainPanel
    RevenueTable.js

  studio/
    StatusHeader.js       "your page is live" — the lead
    SetupRail.js          renders GUIDE_STEPS
    Thumbstrip.js         the client's own work
    EntitlementCallout.js state + exit condition
    editors/              Profile · Page · Projects · Links · Appearance

lib/
  client-language.js      NEW — the projection module (§6 of design system)
  attention.js            NEW — pure: state → reason → exit condition
  admin-nav.js            EXTENDED — two-portal IA
  billing-status.js       UNCHANGED — the model to follow
  onboarding-guide.js     UNCHANGED — consumed by SetupRail
```

## 2.2 Layering rules

1. **`ui/` knows nothing about Designakum.** Primitives take props and tokens.
   No Supabase, no business logic, no copy.
2. **`shell/` knows about roles, not data.** It renders navigation from
   `admin-nav.js`; it does not fetch.
3. **`console/` and `studio/` never import from each other.** Anything shared
   moves to `shell/` or `ui/`. **This is the mechanism that keeps the two products
   from collapsing back into one.**
4. **Every client-facing string passes through `lib/client-language.js`.**
5. **`lib/` stays pure and tested.** No React, no fetch.

## 2.3 New primitives

| Component | Job |
|---|---|
| `PageHeader` | eyebrow + title + **one** action. Required on every screen |
| `StatTile` | number + noun phrase + qualifying footer. **Is a button** |
| `StatusLine` | a *sentence* of status, optional action |
| `Callout` | info / paused / warning, with an exit condition |
| `DataRow` | thumb · primary · secondary · state · actions (hover-gated) |
| `Chip` | state **and** quantity in one element |
| `SetupRail` | ordered steps, completion **derived from data** |
| `OperatorBanner` | persistent operator marker, exit inside |

All plain React + `<style jsx>`. **No dependency.**

---

# 3 — Migration strategy

## 3.1 Strangler, in five moves

```
1. Phase 0   tokens land in globals.css   → /admin inherits, visibly improves
2. Phase 1   /console + /studio shells exist, guarded, mostly empty
3. Phase 2-4 components move one at a time; /admin keeps working
4. Phase 5   /admin redirects
5. Phase 6   /admin deleted once nothing references it
```

## 3.2 The per-component migration recipe

Applied identically to all ~16 extraction targets:

```
1. Move the named function verbatim into its new file. No edits.
2. Import it into the new route. Confirm parity against /admin side by side.
3. THEN restyle to the token system.
4. THEN split owner/client concerns if the component served both.
5. Delete the copy in admin.js only after the new route is in production.
```

> **Never restyle and relocate in the same commit.** A regression must be
> attributable to one or the other. This is the rule that keeps a 3,500-line
> migration reviewable.

## 3.3 What makes this safe

- `/admin` never stops working — no flag day.
- Every phase reverts by deleting a route directory.
- Both products run side by side for behavioural comparison.
- **`must_set_password` is carried into both shells in Phase 1** — the single
  most likely correctness bug in the whole migration.
- No schema, RLS, entitlement or billing-logic change in phases 0–4.

---

# 4 — Token migration plan

## 4.1 Principle: alias, never rename

[REPO] `--accent` is referenced throughout `pages/admin.js`. **Renaming it in a
design pass would touch hundreds of call sites and make the diff unreviewable.**

```css
/* NEW — the source of truth */
--brand:        #2A6BCE;
--brand-hover:  color-mix(in srgb, var(--brand) 88%, #0C1530);
--brand-ink:    #FFFFFF;
--brand-soft:   color-mix(in srgb, var(--brand) 12%, transparent);
--brand-line:   color-mix(in srgb, var(--brand) 28%, transparent);
--brand-eyebrow:color-mix(in srgb, var(--brand) 40%, var(--text-primary));
--brand-focus:  color-mix(in srgb, var(--brand) 55%, transparent);

/* COMPATIBILITY — every existing call site keeps working, unchanged */
--accent:       var(--brand);
--accent-hover: var(--brand-hover);
--accent-fg:    var(--brand-ink);
```

**One line changes the entire product's accent.** New code uses `--brand`; old
code is migrated opportunistically, never in a dedicated churn commit.

## 4.2 Ordered steps

| # | Change | Notes |
|---|---|---|
| **T1** | Add `--brand*`, alias `--accent*` | The whole app changes colour |
| **T2** | **Delete `--accent-gradient`, `--accent-glow`** | **[REPO] Fully contained: 3 references in `components/ui/Button.js`, 3 in `styles/globals.css`, and *zero* in `admin.js`.** The primary button becomes a flat `--brand` fill in one component |
| **T3** | Add `--text-3xl: 34px`, `--text-4xl: 44px` | Additive |
| **T4** | Add `--track-eyebrow/-tight/-lead` + global `.eyebrow` **with `html[dir="rtl"]` override** | **Do this before any component uses an eyebrow** |
| **T5** | Add `--font-display-ar: 'Reem Kufi'` | Already loaded at 400–700 |
| **T6** | Add `--numeric` + `tabular-nums` | Money, dates, counts, badges |
| **T7** | Add `--success-ink` / `--warning-ink` / `--danger-ink` + full `--neutral` set | Per theme, opposite directions |
| **T8** | Add `--leading-*` incl. `--leading-arabic: 1.75` | |
| **T9** | Add `--t-press/-ui/-enter/-stag` + 3 easings; keep `--transition*` as aliases | |
| **T10** | Consolidate 20 `@keyframes` → 5 global | Delete local copies in 6 files |
| **T11** | Replace 4 hardcoded durations in `admin.js` | `0.25s ×3, 0.2s ×2, 0.4s, .3s` |
| **T12** | Targeted `prefers-reduced-motion` | **Skeleton sweep survives** |
| **T13** | Add `--measure: 720px`, `--gutter`, `--content-max` | |
| **T14** | Navy dark ramp | **Light theme is the priority; dark specified so it is not invented later** |

## 4.3 Verification

**Extend `tests/contrast.test.mjs`** — [REPO] `lib/contrast.js` and its test
already exist. Assert **every** foreground/background token pair meets AA in both
themes. **This is the highest-value new test in the plan**: it converts "premium"
from taste into a build failure.

---

# 5 — Asset integration plan

## 5.1 Pipeline

**Problem:** all 18 brand assets are PNG, twelve at 6250², artwork filling 11–48%
of frame. A 4.3 MB PNG cannot go in a sidebar.

```
public/brand/
  wordmark.svg           blue   — light surfaces
  wordmark-light.svg     white  — dark surfaces
  monogram.svg           blue
  monogram-light.svg     white
  pattern.svg            seamless tile (edge treatment only)
  watermark-dark.svg     white @ ~11%
  watermark-light.svg    navy  @ ~8%     ← does not exist yet
  favicon-16/32/48.png · apple-touch-icon.png · og-default.png
```

**Rules:**
- **SVG inline for the shell** (wordmark, monogram) so they inherit
  `currentColor` and need no network request.
- **Trim every canvas to artwork.** Padding is the layout's job.
- **Flat `#2A6BCE`.** Gradients are social-only and never enter the platform.
- **No PNG above 100 KB ships in the app.**

## 5.2 Icon strategy

**Extend `components/ui/Icon.js`. Do not introduce an icon library.**

Existing 22 cover navigation. **Add ~12 for status and attention:**

```
alert · alert-triangle · clock · pause · play · refresh
credit-card · calendar · trend-up · trend-down · image · eye
```

**Spec:** 24×24 grid · 2px monoline · **`butt` caps, `miter` joins, zero corner
radius** (matching the mark's chiselled terminals) · monochrome `currentColor` ·
always paired with a word.

> **[REPO] One-line brand fix:** `components/ui/BrandGlyph.js` currently sets
> `strokeLinecap="round"` and `strokeLinejoin="round"` — the softest terminal
> against a mark that has none.
>
> **Optical caution:** `butt` caps on a 2px stroke can read frail at 16px. Check
> at the smallest size actually used and accept `square` where `butt` looks thin.
> **The goal is the mark's character, not a doctrine.**

## 5.3 Emoji removal — incremental, not a big bang

31 emoji in `admin.js`. **Priority order:**

1. **🔴🟡🟢 used as status indicators** — worst case: cannot inherit
   `currentColor`, cannot respond to theme, platform-dependent glyphs. **Replace
   first.**
2. ⚠ ★ ✓ as pseudo-icons → `Icon`.
3. 🎨 🌐 📷 📁 👤 🔍 as nav/section icons → `Icon`.
4. 👋 🎉 in expressive copy → **keep**. A 🎉 on completion is fine; a 🎨 as an
   icon is not.

## 5.4 Portfolio imagery

**The product sells portfolios and ships no example content.**

- 6–8 **obviously-placeholder** thumbnails — geometric, neutral, never fake
  portfolios presented as real customers.
- Empty states show the **shape** of what will fill them — a ghost grid, the
  preview frame — **not an illustration of a person at a laptop**.
- **`PreviewPane` carries no Designakum branding, ever.** It shows the customer's
  brand.

---

# 6 — Phase-by-phase engineering tasks

## Phase 0 — Foundations 🟢

**Goal.** Lock the system and make the existing product visibly better before
migrating anything.

| # | Task | Detail |
|---|---|---|
| 0.1 | **Commit the five UX documents** | Untracked across four sessions. One `git clean` destroys the research phase |
| 0.2 | **Re-run the slug collision query** | `SELECT ... WHERE slug IN ('studio','console','me')` — **13 tenants / 0 collisions on 2026-08-14**, but signup is live, so re-check at merge time |
| 0.3 | Add `studio`, `console`, `me` to `RESERVED_SLUGS` + tests | Must land **before** any route ships |
| 0.4 | **Token migration T1–T14** | §4.2 |
| 0.5 | **Extend `contrast.test.mjs` to AA-assert every token pair** | §4.3 |
| 0.6 | Global `.eyebrow` + `html[dir="rtl"]` override | Before any component uses one |
| 0.7 | Consolidate 20 keyframes → 5; replace 4 hardcoded durations | |
| 0.8 | **SVG exports** — wordmark ×2, monogram ×2 | Designer dependency **A1** |
| 0.9 | Favicon set from monogram, **16px legibility tested** | Designer dependency **A2** |
| 0.10 | Add ~12 status icons to `Icon.js` | Designer dependency **A3** |
| 0.11 | Replace 🔴🟡🟢 status emoji | Highest-value emoji fix |
| 0.12 | Record locked decisions in `decisions/decisions.md` | `#2A6BCE`, `/console`, `/studio` |

**Backend impact:** none. `RESERVED_SLUGS` is a pure module.
**Tests:** `npm test` (473 green) + build + contrast assertions.
**Rollback:** `git revert`. No state to unwind.

## Phase 1 — Application shell 🟡

**Goal.** Owner and client stop being one screen. URLs become linkable.

| # | Task |
|---|---|
| 1.1 | `components/shell/AppShell.js` — sidebar + header + content |
| 1.2 | `Sidebar.js` — full → icon rail (≤1200px) → bottom bar (≤720px) |
| 1.3 | `NavIndicator.js` — travelling pill, `:has()` fallback, delayed ink |
| 1.4 | `BrandBlock.js` — wordmark desktop / monogram rail; role shown for owners only |
| 1.5 | `PageHeader.js` — eyebrow + title + one action |
| 1.6 | Extend `lib/admin-nav.js` to the two-portal IA + tests |
| 1.7 | Route trees `pages/console/*`, `pages/studio/*` |
| 1.8 | **Auth guards** — `/console` requires `is_platform_owner()`; `/studio` requires tenant membership |
| 1.9 | **Carry `must_set_password` into both shells** ⚠ |
| 1.10 | `OperatorBanner.js` + explicit entry from a client record |

**Backend impact:** routing and guards only. **RLS unchanged and remains the
authority** — a guard is convenience, not security.

**Tests:** nav IA unit tests; route→role mapping tests. **Manual matrix:**
owner→`/console` ✓ · owner→`/studio` (operator) ✓ · client→`/studio` ✓ ·
client→`/console` **refused** · unauthenticated→both **redirect** ·
`must_set_password`→both **gated** · `/{slug}` public sites **still resolve**.

**Rollback:** delete the route directories.

## Phase 2 — Owner Console 🟡

| # | Task |
|---|---|
| 2.1 | `lib/attention.js` — pure: state → reason → **exit condition**, + tests |
| 2.2 | `/console` home — 3–4 `StatTile`s over the attention queue |
| 2.3 | `/console/attention` — `AttentionGroup` with definition + "what clears it" |
| 2.4 | Extract `OwnerClientsOverview` (663) → `/console/clients` |
| 2.5 | Extract `ClientPanel` (179) → `/console/clients/[id]`, **one page, no tabs** |
| 2.6 | Extract `SubscribersOverview` (534) → `/console/revenue`; surface `environment` **read-only** |
| 2.7 | Extract `PendingRow` (254) → `/console/onboarding` |
| 2.8 | Split owner half of `TenantAdminSection` (552) |

**Attention reasons** — all derivable from existing data, no schema change:
payment failed · handover unconfirmed · DNS unverified · invite never claimed ·
disabled but paying.

**Explicitly NOT in this phase:** activity feed (needs an event log — its own
project) · engagement brief (needs a column, owner-visible only).

**Do not build a client-facing "verified" badge on `tenant_domains.status`** —
[REPO] it is set by hand and drifts.

## Phase 3 — Client Studio 🟡

| # | Task |
|---|---|
| 3.1 | **`lib/client-language.js`** — the projection module, + the leak test (§8) |
| 3.2 | `/studio` home — `StatusHeader` leads; `Thumbstrip` of the client's work |
| 3.3 | `SetupRail` rendering `GUIDE_STEPS`, completion **derived from data** |
| 3.4 | `EntitlementCallout` — state + exit **before** the client types |
| 3.5 | Extract editors → routes (Projects, Links, Appearance, Analytics) |
| 3.6 | Extract `BillingEditor` (476) → `/studio/plan` |
| 3.7 | Extract client half of `TenantAdminSection` → `/studio/workspace` |
| 3.8 | Empty states: new client · no projects · no analytics · no billing history · comped |
| 3.9 | Audit for leaked vocabulary — tenant, workspace, slug, username, environment |

**Entitlement is *read* via `billing-status.js`, never reimplemented.**

## Phase 4 — Editor redesign 🟡

**Goal.** The one-page editor model. **Gated on open decision E1.**

| # | Task |
|---|---|
| 4.1 | Resolve **E1** (merge Profile + Card?) — see §11 |
| 4.2 | Restyle `ProfileEditor` / `CardEditor` to the outcome |
| 4.3 | Replace tab-heavy layouts with one structured scrolling page |
| 4.4 | `SaveBar` carries its disabled reason |
| 4.5 | Apply `--measure` (720px) to every editor column |

## Phase 5 — Billing & customer communication 🔴

| # | Task |
|---|---|
| 5.1 | Four webhook-driven emails: receipt · payment failed · cancelled · welcome-to-paid |
| 5.2 | Renewal notice — **separately scoped, needs a scheduler (open decision E4)** |
| 5.3 | Pending-payment moment → full confirmation, not a warning box |
| 5.4 | Printable receipts — `lib/credentials-pdf.js` proves this needs no dependency |
| 5.5 | Cancellation as three beats: what you keep → one honest alternative → confirm |
| 5.6 | Bring two off-brand signup emails onto the token palette |

> **Out of scope: billing *logic*.** No change to `deriveBilling()`, the
> entitlement predicate, plan resolution or webhook state handling. **Adding a
> send is not changing a rule.**

**Risk control:** sends are added **after** existing state handling, never inside
it. **Entitlement must never depend on an email succeeding.**

## Phase 6 — Polish & retirement 🟢/🟡

Motion applied · loading skeletons · remaining emoji · full a11y pass ·
**every screen reviewed in Arabic** · `/admin` redirected, then deleted after a
full release cycle without regression.

---

# 7 — Dependencies and blockers

## 7.1 Hard blockers

| # | Blocker | Blocks | Status |
|---|---|---|---|
| **B1** | `RESERVED_SLUGS` must include `studio`/`console` before routes ship | Phase 1 | **Checked: 0 collisions.** Re-verify at merge |
| **B2** | **SVG wordmark + monogram** | Phase 1 shell (BrandBlock, icon rail) | **Designer — not started** |
| **B3** | Favicon set, 16px-tested | Phase 1 | **Designer — not started** |
| **B4** | ~12 status icons | Phase 2 attention system | **Designer — not started** |
| **B5** | Decision **E1** (Profile + Card) | Phase 4 | **Open** |

## 7.2 Soft dependencies

| # | Item | Note |
|---|---|---|
| S1 | Light-theme watermark (navy ~8%) | Phase 3 empty states; white watermark is invisible on light |
| S2 | Portfolio placeholders | Phase 3 empty states |
| S3 | Seamless pattern tile | Phase 5 email letterhead |
| S4 | Billing email copy, both languages | Phase 5 |
| S5 | Scheduler decision (**E4**) | Renewal notice only — the other four ship without it |

## 7.3 Pre-existing risk, explicitly not ours

> **The live checkout has never run end to end.** Both live subscription rows are
> `pending`; every entitled workspace is a comp. **This is a verification task
> that predates the redesign and must not be conflated with it** — but it should
> be closed before Phase 5 sends real receipts.

---

# 8 — Testing strategy

## 8.1 What the existing suite covers

[REPO] **40 test files, 473 tests**, Node's built-in runner over pure `lib/`
modules. **No React testing library, and none is proposed** — adding one would
breach the dependency rule for coverage the manual matrix already provides.

## 8.2 New pure tests

| Test | Asserts |
|---|---|
| `contrast.test.mjs` **(extended)** | **Every token pair meets AA in both themes** |
| `attention.test.mjs` | Every platform state maps to a reason **and an exit condition** |
| **`client-language.test.mjs`** | **The leak test — see below** |
| `admin-nav.test.mjs` **(extended)** | Two-portal IA; no owner item reachable by a client |
| `reserved-slugs.test.mjs` **(extended)** | `studio`, `console`, `me` rejected |

## 8.3 The leak test — the highest-value test in the plan

```
for every platform state × both locales:
  assert the client-facing string contains none of:
    tenant · workspace · slug · username · environment · sandbox
    past_due · comped · entitle · RLS · null · undefined
```

**This converts the projection principle from discipline into a build failure.**
It is precisely where the reference product's own activity feed failed — its
client feed leaked the internal stage vocabulary its progress rail hid.

## 8.4 Manual matrix

Run per phase. **Not optional.**

```
2 portals × 2 roles × 2 languages × 2 themes × 3 breakpoints
```

Plus the fixed cases: comped client · unentitled client · brand-new empty
workspace · fully populated workspace · `must_set_password` user · operator mode
entry and exit.

## 8.5 Standing rules

1. **`npm test` and a build pass before anything ships.**
2. **A test double must never be more capable than the thing it replaces.** [REPO]
   The `listUsers` bug passed 458 tests because the Supabase fake implemented a
   filter the real SDK does not have. **When a test and production disagree,
   suspect the fake.**
3. **Verify claims against the database before acting on them.**
4. **Never change two of {RLS, auth, tenant resolver, billing} in one change.**

---

# 9 — Designer handoff requirements

**The designer owns logo evolution, brand extensions and the illustration
system. Engineering owns none of it.** Full brief in
`designakum-brand-asset-audit.md` §6.

## 9.1 Blocking deliverables

| # | Deliverable | Spec | Blocks |
|---|---|---|---|
| **A1** | **SVG wordmark** ×2 (blue `#2A6BCE`, white) | Trimmed to artwork; defined clear space = one diamond height; min width ~120px | Phase 1 |
| **A2** | **SVG monogram** ×2 | Trimmed. **It is 1.77:1 landscape — specify how it is framed square, and confirm it holds at 16px** | Phase 1, favicon |
| **A3** | **~12 status icons** | 24×24, 2px monoline, **butt caps, miter joins, radius 0**, monochrome | Phase 2 |
| **A4** | **Favicon set** 16/32/48 + apple-touch | From the monogram | Phase 1 |

## 9.2 Non-blocking

A5 light-theme watermark (navy ~8%) · A6 6–8 portfolio placeholders ·
A7 seamless pattern tile · A8 OG/share images · A9 avatar fallback system ·
A10 re-shot product screenshots **after Phase 4**.

## 9.3 Constraints the designer inherits

- **`#2A6BCE` is locked.** One blue. No competing blues.
- **Flat.** No gradient, glow, bevel or shadow on the mark.
- **No rounded corners or terminals** — the mark has none.
- **Do not invent a new mark.** The monogram exists; the diamond proposal is
  cancelled.
- **The calligraphy asset is a greeting, not a typeface** — welcome email only,
  never a model for product Arabic typography.
- **Arabic:** no letter-spacing, no uppercase, **Latin numerals in both locales**.
- **AA contrast is a floor.**
- **The customer's work is the imagery.** Designakum supplies the frame.

## 9.4 What engineering will NOT do

Invent a mark · choose brand colours · design an illustration system · produce
final SVGs · decide logo lockups. **If an asset is missing, the phase waits.**

---

# 10 — What gets built first

> ## **Phase 0, as a single branch.**

**Why this and nothing else:**

| Criterion | How it is met |
|---|---|
| **Not UI polish** | Tokens, routes, assets, icons — foundations only |
| **Visible progress** | `/admin` inherits the tokens. **The brand appears in the product for the first time** |
| **No dangerous backend change** | CSS, plus three strings in a pure `Set` |
| **Unblocks everything** | Phase 1 cannot ship without reserved slugs; every later phase consumes the tokens |
| **Forces the hard question early** | The Arabic eyebrow is resolved **now**, not after thirty components assume a Latin-only device |
| **Cheaply revertible** | One `git revert` |

**Definition of done:** 0.1–0.12 complete · `npm test` green (473) · build green ·
contrast assertions green · `/admin` and `/` verified in **light + dark × Arabic +
English**.

**Explicitly NOT in the first branch:** new routes · component extraction · any
Edge Function · any schema, RLS or entitlement change · renaming `--accent`.

**Phase 0 can start today except for 0.8–0.10**, which wait on the designer.
Everything else — docs, slugs, tokens, contrast tests, keyframes, the eyebrow —
is unblocked.

---

# 11 — Open decisions

**Flagged, not decided.** Each changes what gets built.

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **E1** | **Should Profile and Card/Home Page merge into one editor?** | **Phase 4** | [REPO] They are not obviously duplicative: `profile` = identity; `card` = *"everything that shows on your public page — logo, banners, stats, CTA buttons"*. **For:** a client thinks "my page", not two records. **Against:** merging yields one very long editor and loses the identity/presentation distinction. **Recommendation: one page, two clearly-titled sections** — satisfies the no-tabs preference without pretending the two are the same thing |
| **E2** | Density split — owner tighter, client roomier? | Phase 2/3 | One `--density` token already exists |
| **E3** | Client body size — 14px or 16px? | Phase 3 | Follows E2 |
| **E4** | Renewal notice — introduce a scheduler, or defer? | Phase 5 only | Nothing in the platform runs on a schedule. **The other four emails ship without this** |
| **E5** | Does `comped` belong in the checkout refusal list? | Phase 2 comp dialog | [REPO] A comped workspace currently cannot check out (`already_subscribed`, 409) — so a mistakenly comped workspace cannot buy out of it |
| **E6** | Attention queue vs charts on `/console` home | Phase 2 | Queue recommended at 13 tenants; changes if fast growth is expected |
| **E7** | How is the 1.77:1 monogram framed square, and does it hold at 16px? | Phase 1 favicon | A craft question for the designer, not an invention |

**E1 and the designer assets (B2–B4) are the only items that will stall work.**
Everything else can be decided inside its phase.

---

## Summary

**Build order:** Phase 0 → 1 → (2 ∥ 3) → 4 → 5 → 6.
Phases 2 and 3 may run in parallel — they share only the Phase 1 shell.
**Phase 5 must not start before Phase 3**, or the emails get written against
vocabulary that is still moving.

**Nothing in this plan adds a dependency, changes RLS, entitlement, billing logic
or the tenant resolver.**

**No code has been written. Phase 0 is ready to start.**
