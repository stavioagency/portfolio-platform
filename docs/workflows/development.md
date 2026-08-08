# Workflow — development

---

## 1. The session model

**Every feature or bug fix gets a fresh session.** No carried-over chat history.

1. Read [`docs/GRANDMASTER.md`](../GRANDMASTER.md).
2. Identify the **one** relevant document from its routing table.
3. Read only that, plus the files it names.
4. Do the work.
5. Update docs **only if architecture or a decision changed**.

Why: a session that loads a 5 KB map and one 8 KB document is faster, cheaper and
more accurate than one carrying months of conversation, and it cannot inherit a
contradiction from an old thread. The repository is the memory.

**Do not read the whole `docs/` tree "to be safe".** That defeats the entire
system. If the routing table sends you to the wrong file, fix the routing table.

---

## 2. Running it

```bash
npm install
npm run dev          # :3000
```

`.env.local` (gitignored) needs the two public Supabase values:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Without them the build fails on `supabaseUrl is required`. Placeholders are
enough to build or run tests; every data-driven screen will be empty.

Edge Functions locally:

```bash
supabase functions serve --env-file ./supabase/functions/.env
```

---

## 3. Finishing a change

Non-negotiable, in this order:

```bash
npm test
```

```bash
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="x" npm run build
```

Then **read the diff before committing.**

Tests cover pure `lib/` modules only — no React, no network. Anything touching
either is verified by running it, not by a unit test. If you add logic worth
testing, extract it into a `lib/` module with a matching `tests/*.test.mjs`;
that is the pattern the whole test directory follows.

There is a `verify` skill in `.claude/skills/` that spells out the build and test
mechanics in more detail.

For multi-part features, `.claude/skills/feature-workflow/` defines the staged
approach used on this project: **analyze → frontend → backend → security &
reliability → QA & polish → final audit**, one section at a time, stopping
between each.

---

## 4. Committing

- Work happens directly on `main`.
- **Commit or push only when asked.**
- Grep for any temporary test harness before committing — never commit one.

---

## 5. Guardrails

Do not, without an explicit request:

- add a dependency, or introduce TypeScript, Tailwind or any framework;
- change the database schema, RLS, auth, the tenant resolver, or routing;
- reintroduce a default or singleton tenant;
- modify billing, PayPal, subscriptions or tenants **while changing
  authentication** — and if auth consistency genuinely requires it, say so
  explicitly;
- touch the marketing project or the finance Supabase project;
- redesign or rewrite the admin wholesale;
- replace Supabase Auth with custom password storage, or write custom hashing.

---

## 6. Documentation discipline

**One documentation system.** `docs/GRANDMASTER.md` is the index.

Do **not** create `CONTEXT.md`, `STATUS.md`, `SESSION.md`, `NOTES.md`,
`HANDOFF.md`, `HANDOFF_V2.md`, `AUDIT_FINAL.md`, `NOTES_FINAL.md` or anything of
that shape. This repository has been through that once already — eleven SQL files
describing four overlapping states of one database, with no way to tell which was
true. The same thing happens to prose.

When you do update a doc:

- **Durable** (an architecture change, a new invariant, a decision and its
  reasoning) → edit the document that owns it.
- **Only true today** (what you did this session, a task list, a status) → it
  does not belong in the repo at all. The two exceptions are
  [features/planned.md](../features/planned.md), which is explicitly the
  time-sensitive list and must be pruned as items land, and
  [features/completed.md](../features/completed.md).
- A bug fix that leaves the design intact needs **no doc edit**.

Where a fact has one home, link to it rather than restating it. A fact written in
two places will be wrong in one of them within a month.
