---
name: verify
description: Build and test this portfolio platform correctly. Use whenever verifying a change, running the build, running tests, or checking the repo is release-ready — especially if `npm run build` just failed with "supabaseUrl is required".
---

# Verify this repo

Run both checks from the repo root. Expected on a clean tree: **732 tests, 730 passing,
0 failing, 2 skipped; the build exits 0 and compiles all 14 routes with no warnings.**
Verified at commit `ee15970`. If your counts are lower than this, suspect a stale
checkout before you suspect a regression.

## Tests

```bash
npm test
```

Node's built-in runner over `tests/*.test.mjs` — 58 files, about a second end to end.
Run `npm install` first: the suite is no longer dependency-free, because at least one
test (`modal-containment.test.mjs`) reads a type declaration out of `node_modules`, and
without it you get a spurious ENOENT failure.

The suite is now two kinds of test, and the difference matters when you read a result:

- **Behavioural tests** that import and execute a pure module — roughly 32 modules under
  `lib/`, covering tenant resolution, auth links, billing (plans, status, polling,
  export, comps), credentials, password policy and pwned-password checks, studio draft
  and editor logic, storage cleanup, and translations.
- **Guard tests** that read source files off disk as *text* and assert on their
  contents — 30 of the 58 files. These pin decisions that no unit test could hold:
  design tokens and their WCAG contrast (`design-tokens.test.mjs`), the DS-3 semantic
  alias mapping including its two deliberate omissions (`semantic-conversion.test.mjs`),
  icon sets, label association, focus ownership, modal containment, styled-jsx
  integrity, and Arabic typography. They parse `styles/globals.css`, `components/ui/*`,
  and `pages/admin.js` rather than importing them.

Read the guard tests for what they are: they prove a *file still says what it said*, not
that anything renders. There is still **no DOM or component test environment** in this
repo — no jsdom, no testing-library, nothing that mounts a React tree. So a green suite
still does not mean the admin UI works, and you must never report "tests pass" as if it
were a QA pass.

## Build — read this before running it

A bare `npm run build` **FAILS**, and the failure is not a code problem:

```
Error: supabaseUrl is required.
Build error occurred: Failed to collect page data for /
```

There is no `.env.local` in this repo (it is gitignored). Next.js compiles fine, then
dies at "Collecting page data" because the Supabase client is constructed at module
load with `undefined` credentials. Build with placeholder credentials instead:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="x" npx next build
```

Placeholders are sufficient because no page does server-side data fetching — tenant
resolution is entirely client-side. Never "fix" this failure by committing a
`.env.local`, hardcoding a fallback URL into `lib/supabase.js`, or adding real
credentials to make the build pass.

## Adding a testable helper

Follow the existing convention rather than putting logic in `pages/admin.js`: pure
logic goes in `lib/<name>.js` with a matching `tests/<name>.test.mjs`. `admin.js` is
a single ~6700-line file that cannot be imported by the test runner, so logic left
inline there can never be *executed* by a test — at best a guard test can assert on its
source text, which catches deletions and drift but proves nothing about behaviour.

## Scope guardrail

This repo is the **multi-tenant Portfolio Platform SaaS**. It is NOT the older
single-tenant copy in `~/Downloads/portfolio-platform-main`, which is off-limits.
See `docs/GRANDMASTER.md` for full orientation; it routes to database details
(`docs/architecture/database.md`) and open launch items
(`docs/features/planned.md`).
