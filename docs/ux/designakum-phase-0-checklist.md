# Designakum — Phase 0 Checklist

**Preparation and foundations. No UI redesign, no component migration, no route
creation.** Written 2026-08-14.

Phase 0 exists to make everything after it safe and cheap. It ends with the
**existing** product visibly improved — the brand appears in the application for
the first time — and with every prerequisite for Phase 1 in place.

**Authority:** `designakum-execution-plan.md` §6 (tasks) and §4 (tokens).
**Design authority:** `designakum-design-system-final.md`.

---

## The engineering rule that governs every commit

> ### Move → Verify → Restyle → Improve
>
> **Never move + redesign + refactor in one change.**
> **Every commit has one purpose.**

A regression must be attributable to a single change. This is what keeps a
multi-thousand-line migration reviewable — and it applies from Phase 0 onward,
including to token work.

---

# 1. Foundation work

## 1.1 Documentation protection ✅ DONE

- [x] Commit the six untracked UX documents — **`423d677`, 7,387 lines**
- [x] Verify clean tree, correct files, nothing accidental
- [x] Add this checklist and the designer handoff — **`73089c7`**
- [x] Record the locked decisions in `docs/decisions/decisions.md`:
      `#2A6BCE` · `/console` + `/studio` · monogram-not-diamond
- [x] Add the UX routing row to `GRANDMASTER.md`'s document table

> **Why decisions.md and not a handoff:** GRANDMASTER holds permanent
> architectural decisions; the process of reaching them does not belong there.
> A brand colour and a route split are architecture.

## 1.2 Route preparation — **prepare only, create nothing**

- [x] **Re-run the slug collision query** — **re-run 2026-08-14 against
      `gphrzvjlstznhypcfgre`, read-only: 13 tenants, 0 collisions** on
      `studio` / `console` / `me`, checked case- and whitespace-insensitively.
      Same 13 tenants as the earlier count, so nothing was claimed in between:
      ```sql
      SELECT slug FROM tenants WHERE slug IN ('studio','console','me');
      ```
      Incidental finding: exactly one tenant holds a word from the wider
      reserved list — `designakum`, the platform's own workspace. That is the
      empirical confirmation of why `admin.js`'s shorter list was not unified
      with the long signup list: doing so would begin refusing edits to it.
- [x] Add `studio`, `console`, `me` to `RESERVED_SLUGS` — **`51ae194`**, in all
      three copies: `lib/reserved-slugs.js`, the Edge Function's
      `_shared/signup-rules.ts`, and the operator's shorter list in `admin.js`.
      **Deployed 2026-08-14**: `signup-verify` v8 and `signup-start` v9, both
      ACTIVE with `verify_jwt: false` preserved. The reservation is now real —
      the server, not just the browser, refuses these three
- [x] Extend `tests/reserved-slugs.test.mjs` to assert all three are rejected
- [x] **Do NOT create `pages/console/` or `pages/studio/`** — nothing created

> **Why this is Phase 0 and not Phase 1.** A tenant slug becomes a top-level
> route. A customer owning `studio` would be **silently shadowed** — Next.js
> resolves the static route first and their site simply stops resolving. The
> reservation must land **before** any route exists.

## 1.3 Token migration

Ordered. Each is independently revertible. Full spec in execution plan §4.2.

- [x] **T1** Add `--brand` `#2A6BCE` + `--brand-hover/-ink/-soft/-line/-eyebrow/-focus`
      via `color-mix()`
- [x] **T1b** **Alias `--accent`, `--accent-hover`, `--accent-fg` onto `--brand`**
      — **do not rename existing tokens.** `--accent` is referenced throughout
      `pages/admin.js`; aliasing keeps the diff reviewable
- [x] **T2** Delete `--accent-gradient` and `--accent-glow`; primary button
      becomes a flat `--brand` fill
      *(Verified contained: 3 refs in `components/ui/Button.js`, 3 in
      `styles/globals.css`, **0 in `admin.js`**)*
- [x] **T3** Add `--text-3xl: 34px`, `--text-4xl: 44px` *(additive)*
- [x] **T4** Add `--track-eyebrow/-tight/-lead` + one global `.eyebrow` class
      **with its `html[dir="rtl"]` override** — see 1.4
- [x] **T5** Add `--font-display-ar: 'Reem Kufi'` *(already loaded at 400–700)*
- [x] **T6** Add `--numeric` + `font-variant-numeric: tabular-nums`
- [x] **T7** Add `--success-ink`, `--warning-ink`, `--danger-ink` + a full
      `--neutral` set — **per theme, corrections in opposite directions**
- [x] **T8** Add `--leading-tight/-snug/-normal` + **`--leading-arabic: 1.75`**
- [x] **T13** Add `--measure: 720px`, `--gutter`, `--content-max`
- [x] **T14** Dark ramp on brand navy — **specified now, light theme ships first**

## 1.4 Typography setup

- [x] Global `.eyebrow` class — **written once, not patched per component**
- [x] **`html[dir="rtl"] .eyebrow` override:** no tracking, no uppercase, one
      size step up, Reem Kufi, brand-tinted colour
- [x] Wire `--font-display-ar` into the Arabic heading path
- [x] Apply tabular figures to money, dates, counts and badges
- [x] Confirm **Latin numerals render in both locales**

> **Do 1.4 before any component uses an eyebrow.** Resolving the Arabic device
> now costs one class; resolving it after thirty components assume a Latin-only
> treatment costs thirty edits.

## 1.5 Motion tokens

- [x] **T9** Add `--t-press: .11s`, `--t-ui: .22s`, `--t-enter: .30s`,
      `--t-stag: .06s` + three easing curves *(`--ease`, `--ease-pop` at 1.06
      overshoot, `--ease-exit`)*
- [x] Keep `--transition` / `--transition-slow` as aliases
- [x] **T10** Consolidate `@keyframes` — **`5eb8761`, 20 local → 10.** Nine
      duplicates removed: four identical spinners → `spin` (plus `--t-spin`,
      since they ran at 0.8/0.8/0.8/**0.7**s and the odd one out was the shared
      `Button`), six identical opacity fades → `fade`. The premise that blocked
      this was wrong: styled-jsx scopes SELECTORS, not keyframe names — verified
      by reading `document.styleSheets` in the running app, where no keyframe
      name carried a jsx hash. The remaining 10 are genuinely different and each
      is documented beside the canonical set in `globals.css`
- [x] **T11** Replace the 4 hardcoded durations in `admin.js`
      (`0.25s ×3, 0.2s ×2, 0.4s, .3s`)
- [x] **T12** Targeted `prefers-reduced-motion` — **the skeleton sweep survives**
      *(a skeleton that stops shimmering reads as broken, not calm)*

## 1.6 Icon strategy

- [x] Confirm the existing 22 icons in `components/ui/Icon.js` cover navigation
- [x] Add ~12 status icons — **`bcbbb70`**, 13 added (22 → 35): `alert`,
      `alert-triangle`, `clock`, `pause`, `play`, `refresh`, `credit-card`,
      `calendar`, `trend-up`, `trend-down`, `image`, `eye`, `search`.
      Drawn on the existing 24×24 grid and stroke rather than waiting on A3 —
      they are the set's own missing states, not new brand artwork, and the
      emoji they replace were shipping in the meantime. **Re-check against A3
      when it arrives**
- [ ] **Fix `components/ui/BrandGlyph.js`:** `strokeLinecap`/`strokeLinejoin`
      `round` → `butt`/`miter` — **check optically at 16px first**.
      *Not done: the optical check is the gate, and it was not performed. These
      are the client's brand glyphs, where a mitred join is a visible change to
      a mark we do not own. Needs eyes, not a test*
- [x] **Replace 🔴🟡🟢 status emoji** — the highest-value emoji fix; an emoji
      cannot inherit colour, respond to theme, or render consistently
- [x] Leave 👋 and 🎉 in expressive copy
- [x] **Do not introduce an icon library**

## 1.7 Asset organisation

- [ ] Create `public/brand/` with the structure in execution plan §5.1 —
      *deferred with the SVGs: an empty directory tree plus a move of three
      referenced PNGs is churn until there is something to put in it*
- [ ] Land SVG wordmark ×2 and monogram ×2 **when A1/A2 arrive**
- [ ] Favicon set from the monogram **when A4 arrives**
- [x] **No PNG above 100 KB ships in the application** — verified: the only
      assets are `favicon.png` 14 KB, `logo.png` 27 KB, `logo-light.png` 51 KB
- [ ] Archive the current product screenshots with a date — they document the
      "before" state and become obsolete on ship
- [x] **Do not create a diamond mark, a replacement logo, or any generated mark**

## 1.8 Contrast testing

- [x] **Extend `tests/contrast.test.mjs` to assert every token pair meets AA in
      both themes** *(`lib/contrast.js` and its test already exist)*
- [x] Verify `--brand` `#2A6BCE` with white ink *(measured 5.13:1)*
- [x] Verify each semantic `-ink` value against its own background
- [x] Verify the four-step text ramp in both themes

> **This is the highest-value new test in Phase 0.** It converts "premium" from
> a matter of taste into a build failure.

## 1.9 Verification before Phase 0 closes

- [x] `npm test` green — **522 tests** (473 at baseline, +49 across Phase 0)
- [x] Build green — 11/11 static pages, `/admin` 81.6 kB
- [x] Contrast assertions green — including one **pinned known gap**: the light
      theme's `--text-tertiary` (3.44:1) and `--text-muted` (2.30:1). See
      `tests/contrast.test.mjs`; fixing it means re-spacing the light ramp,
      which is a Phase 1 design decision
- [x] Manual: **four passes done** on `/admin` (sign-in), plus `/signup` and
      `/subscribe`. Confirmed against computed style, not just by eye:
      `--brand` renders `#2A6BCE` in light and `#598CD9` in dark, `--brand-ink`
      flips white ↔ navy, `--accent*` resolve to the brand, no `background-image`
      on any button (the gradient is gone), 44px minimum touch target, `0.22s`
      = `--t-ui` transitions, Manrope throughout, RTL correct with
      `line-height: 28px` (the 1.75 Arabic token), credential inputs correctly
      pinned `dir="ltr"`, Arabic labels correctly dropping tracking and
      uppercase, and Latin numerals in the Arabic copy. No console errors
- [ ] ⚠️ Confirm `/{slug}` public sites still resolve — **still not verified.**
      `/` and `/{slug}` need a host that maps to a real tenant; the checked
      surfaces were the auth and checkout pages. `/privacy` was checked and
      correctly stays dark with a light preference stored, which covers the
      theme-scoping risk but not tenant resolution
- [x] **Theme flash — FIXED.** An inline script in `_document.js`'s `<body>`,
      before `<Main />`, sets `data-admin-theme` ahead of first paint. Scoped
      to the five pages that opt in, so the public portfolio stays dark-only.
      Re-verified with the method that reproduced it: reload `/signup` in light
      and screenshot immediately — light from the first frame. Guarded by
      `tests/theme-init.test.mjs`, which derives the route list from the pages
      themselves and fails on drift in either direction
- [x] `git status` clean

---

# 2. Safety rules

**Invariants. No design goal outranks them.**

## 2.1 Never, in Phase 0 or after

| Never | Why |
|---|---|
| **Rewrite or restructure the backend** | Phase 0 is CSS plus three strings in a pure `Set` |
| **Touch RLS casually** | **RLS is the security boundary.** Hiding or disabling a control is never one |
| **Alter entitlement logic** | It gates **writes, not reads**. The UI **reads** it via `lib/billing-status.js` and never restates the rule |
| **Change the entitlement predicate** | It is `environment IS DISTINCT FROM 'sandbox'`, never `= 'live'`. Comps carry NULL — `= 'live'` would revoke every complimentary client at once |
| **Change billing behaviour** | `deriveBilling()`, plan resolution and webhook state handling are correct and out of scope |
| **Replace Supabase Auth or write password hashing** | — |
| **Use `listUsers({ email })`** | It has no email filter and silently ignores the argument. Use `_shared/find-user.ts` |
| **Reintroduce a default or singleton tenant** | This once served a real client's site to strangers |
| **Let sandbox grant production access** | — |
| **Treat a comped workspace as an error state** | Several live workspaces are comps |
| **Expose tenant IDs or internal vocabulary to a client** | — |
| **Add a dependency** | Five runtime deps, zero devDependencies. Requires explicit approval |
| **Create `/console` or `/studio` routes in Phase 0** | Reservation first, routes in Phase 1 |

## 2.2 Process rules

1. **Never change two of {RLS, auth, tenant resolver, billing} in one change.**
2. **`npm test` and a build pass before anything ships.**
3. **Verify claims against the database before acting on them** — more than one
   reported failure here turned out to be correct behaviour observed at the
   wrong moment.
4. **A test double must never be more capable than the thing it replaces.** The
   `listUsers` bug passed 458 tests because the fake implemented a filter the
   real SDK does not have. **When a test and production disagree, suspect the
   fake.**
5. **Update documentation only when architecture or a decision changed.**
6. **Every screen reviewed in Arabic before it is called done.**

## 2.3 Marketing boundary

**`designakum.com` is a separate product** — different repository, different
Supabase project, different owner account. **Nothing in this repository may
reference or serve it.** If a task appears to concern the marketing site, stop
and ask.

---

# 3. Implementation dependency gate

**The check to run before Phase 1 coding begins.**

## 3.1 REQUIRED — must be true

| # | Requirement | Status |
|---|---|---|
| R1 | **UX documents committed and tracked** | ✅ **`423d677`** |
| R2 | Designer handoff + this checklist committed | ⏳ *this commit* |
| R3 | Locked decisions recorded in `decisions.md` | ⬜ Not started |
| R4 | **Slug collision re-verified at merge time** | ✅ Checked (13 tenants / 0 collisions) — **re-run before merge** |
| R5 | `RESERVED_SLUGS` updated + tested | ⬜ Not started |
| R6 | **Token migration T1–T14 landed** | ⬜ Not started |
| R7 | **Contrast test extended and green** | ⬜ Not started |
| R8 | Global `.eyebrow` + RTL override written | ⬜ Not started |
| R9 | Motion tokens + keyframe consolidation | ⬜ Not started |
| R10 | `npm test` 473 green + build green | ✅ Currently true — **re-verify after each step** |
| R11 | **SVG wordmark + monogram (A1, A2)** | 🔴 **BLOCKED — designer** |
| R12 | **Favicon set (A4)** | 🔴 **BLOCKED — designer** |

## 3.2 OPTIONAL — may arrive later

| # | Item | Needed by |
|---|---|---|
| O1 | Status icons (A3) | Phase 2 attention system |
| O2 | Light-theme watermark | Phase 3 empty states |
| O3 | Portfolio placeholders | Phase 3 empty states |
| O4 | Seamless pattern tile | Phase 5 email letterhead |
| O5 | OG / share images | Phase 3 |
| O6 | Avatar fallback system | Phase 2 client cards |
| O7 | Re-shot product screenshots | After Phase 4 |

## 3.3 BLOCKED — requires human input

| # | Blocked on | Blocks | Owner |
|---|---|---|---|
| **B1** | **SVG wordmark + monogram** | Phase 1 shell — the brand block and icon rail have nothing to render | **Designer** |
| **B2** | **Favicon set, 16px verified** | Phase 1 | **Designer** |
| **B3** | **How the 1.77:1 monogram frames square (E7)** | B2 | **Designer** |
| **B4** | **E1 — do Profile and Home Page merge?** | Phase 4 editor redesign | **Feras** |
| **B5** | **E2 / E3 — density split, client body size** | Phase 3 sizing | **Feras** |
| **B6** | **E4 — scheduler for the renewal notice** | Phase 5 *(the other four emails ship without it)* | **Feras** |
| **B7** | **E5 — does `comped` belong in the checkout refusal list?** | Phase 2 comp dialog | **Feras** |
| **B8** | Status icons (A3) | Phase 2 | **Designer** |

## 3.4 What can start immediately

**Everything in §1 except 1.6's icon additions and 1.7's SVG landing.**

Documentation, decisions, slug reservation, the entire token migration,
typography setup, motion tokens, keyframe consolidation, the emoji status fix,
and the contrast test are **all unblocked and independent of the designer.**

> **Phase 0 is roughly 80% executable today.** The blocked 20% — SVGs and the
> favicon — blocks *Phase 1*, not Phase 0.

---

# 4. Definition of done

Phase 0 is complete when:

1. All six research documents plus this checklist and the designer handoff are
   **committed**.
2. Locked decisions are recorded in `decisions.md`.
3. `studio`, `console`, `me` are **reserved and tested**.
4. Tokens T1–T14 are landed; `--accent` still works via alias.
5. The gradient and glow are **gone**; the primary button is a flat `--brand` fill.
6. `.eyebrow` exists globally **with its RTL override**.
7. Motion tokens exist; **20 keyframes are 5**; hardcoded durations are gone.
8. Status emoji are replaced.
9. **Contrast assertions are green.**
10. `npm test` 473 green, build green.
11. `/admin` and `/` verified in **light + dark × Arabic + English**.
12. **The brand colour is visible in the product for the first time.**

**Then, and only then, Phase 1 opens** — and only if B1 and B2 have arrived.
