---
name: verify
description: Build and test this portfolio platform correctly. Use whenever verifying a change, running the build, running tests, or checking the repo is release-ready — especially if `npm run build` just failed with "supabaseUrl is required".
---

# Verify this repo

Run both checks from the repo root. Expected on a clean tree: **37 tests pass, build
compiles all 7 routes.**

## Tests

```bash
npm test
```

Node's built-in runner over `tests/*.test.mjs`. No dependencies, runs in ~100ms.
Tests only cover pure helpers in `lib/` (`tenant.js`, `admin-nav.js`, `safe-url.js`,
`password-policy.js`). There are **no component or end-to-end tests** — a green suite
does not mean the admin UI works, so never report "tests pass" as if it were a QA pass.

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
a single ~3550-line file that cannot be imported by the test runner, so anything left
inline there is permanently untestable.

## Scope guardrail

This repo is the **multi-tenant Portfolio Platform SaaS**. It is NOT the older
single-tenant copy in `~/Downloads/portfolio-platform-main`, which is off-limits.
See `HANDOFF.md` for full orientation, database details, and open launch items.
