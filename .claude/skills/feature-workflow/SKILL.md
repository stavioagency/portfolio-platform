---
name: feature-workflow
description: The required process for building any feature in this project — analyze first, then frontend, backend, security, and QA as separate sections, one at a time, with a final audit. Use whenever adding or changing a feature, not for one-line fixes.
---

# Feature workflow

Split every feature into independent sections and finish them **one at a time**.
Never mix responsibilities. Stop at the end of each section and report before
starting the next.

## Step 0 — Analyze (no code)

Before writing anything, state: what the feature is, every file affected, the
frontend changes, the backend changes, the database changes, the security
implications, the testing requirements, and the implementation plan.

Do not start coding until this is done and the plan is stated.

## Section 1 — Frontend

UI only: pages, components, layout, styling, responsiveness, RTL, dark mode,
animations, loading/empty/error states, forms, accessibility, icons, UX.

Do NOT touch the backend, the database, or API logic. Use mock data if needed.
Build every screen exactly as it should look.

Verify before stopping: responsiveness, dark and light mode, Arabic and English,
accessibility. **Then stop.**

## Section 2 — Backend

Functionality: business logic, validation, authentication, authorization,
database queries, storage, uploads, performance.

Do NOT redesign the frontend. Keep the existing UI intact. Keep it clean, avoid
duplicated logic, reuse utilities. **Then stop.**

## Section 3 — Security & reliability

Audit and fix: authentication, authorization, RLS, tenant isolation, input
validation, XSS, CSRF, SQL injection, rate limiting, secrets, environment
variables, permissions, file uploads, error handling, edge cases, loading
failures, race conditions, timeouts, retry logic. **Then stop.**

## Section 4 — QA & polish

Polish only: responsiveness across mobile/tablet/desktop, RTL and LTR, light and
dark, accessibility, keyboard navigation, performance, skeletons, empty states,
toasts, dialogs, animations, consistency, design-system usage.

Remove dead code, duplicate code, unused imports, unused CSS, unused components.
Optimize without changing behavior. Run the build and tests. **Then stop.**

## Final audit

Report per section — frontend (what was built, screens, components, UX), backend
(APIs, logic, database, performance), security (found, fixed, remaining), QA (bugs
fixed, responsive, accessibility, performance, polish). Then answer: is it
production ready, blockers, risks, confidence score 0–10, recommended next feature.

## Global rules

One section at a time. Reuse existing code. No duplicate components or logic. Keep
changes minimal. Preserve existing functionality. Do not modify unrelated files.
Explain architectural decisions. Leave the project cleaner than you found it.

---

# How this maps onto THIS repo

Four steps above have no direct equivalent here. Do not invent one.

**There is no type check.** This is plain JavaScript — no TypeScript, no
`tsconfig.json`, and no ESLint config. In Section 4, "build + type check + tests"
means `npm test` and the build only. Do not scaffold ESLint or add TypeScript as
part of a feature; that is its own decision.

**"Backend" does not mean Next.js.** There is no `pages/api`, no
`getServerSideProps`, and no server actions — every page is static and talks to
Supabase directly from the client. So Section 2 means: SQL and RLS policies in
`supabase/`, the `invite-client` Edge Function, and the client-side query layer.
Anything that must not be client-visible belongs in an Edge Function, because the
anon key ships to the browser and RLS is the only real boundary.

**Section 1 "don't touch the backend" is hard here.** `pages/admin.js` is a single
~3,550-line file where each editor component owns its own Supabase calls inline.
A pure UI pass usually means editing the same file you will edit again in Section
2. That is expected — keep the two passes as separate commits rather than trying
to avoid the file. When adding pure logic, put it in `lib/<name>.js` with a
matching `tests/<name>.test.mjs` so it is testable; `admin.js` cannot be imported
by the test runner.

**Build and test commands:** see the `verify` skill. A bare `npm run build` fails
with `supabaseUrl is required` — that is expected, not a bug.

**Reuse these before building new ones:** `components/ui/` has Button, Card, Badge,
Input, Skeleton, EmptyState, Toast, ConfirmDialog, Icon. Bilingual strings go in
`lib/translations.js` (both `ar` and `en`, Latin numerals in both). Any
user-entered URL rendered publicly must go through `lib/safe-url.js`.

**Scope guardrail:** this repo is the multi-tenant SaaS, NOT the older copy in
`~/Downloads/portfolio-platform-main`. See `HANDOFF.md`.
