# GRANDMASTER — Designakum Platform

**Start here. Read this file, then read only the one or two documents it sends
you to.** You are not expected to read the whole `docs/` tree, and you should
not. The point of this system is that a session loads ~5 KB of map instead of
30 KB of handoff.

This is the **only** index. Do not create `CONTEXT.md`, `STATUS.md`,
`SESSION.md`, `NOTES.md`, `HANDOFF_V2.md`, `AUDIT_FINAL.md` or anything of that
shape. If something you learn is durable, edit the document that owns it.

There is **one** exception, added deliberately on 2026-08-13:
[engineering-log.md](engineering-log.md) holds investigation history — what was
examined, what was ruled out, what was decided against. It exists because
"we already checked that, and here is why it was not the cause" is expensive to
rediscover and belongs nowhere else. It is append-only and newest-first.
**Architecture and current truths still go in the owning document, never in the
log**, and never in this file.

---

## 1. What this is

A multi-tenant SaaS that builds **bilingual (Arabic / English) portfolio
websites** for freelancers. One Next.js app and one Supabase project serve every
client.

- Each client is a **tenant** with a public site and a private dashboard.
- Public sites render at `/{slug}`, or on the client's own custom domain.
- Tenant isolation is enforced by **Postgres RLS**, not by the UI.
- Arabic is first-class, not a translation layer. Latin numerals in both locales.

Systems: authentication · client workspaces · the admin dashboard · billing ·
PayPal subscriptions · client onboarding · email · password management · owner
tooling.

---

## 2. Environment separation — read before you deploy anything

There are **two products, two owners, two Supabase projects, two deploys.**
Mixing them is the most expensive mistake available in this codebase.

| | Platform (this repo) | Marketing (elsewhere) |
|---|---|---|
| Owner account | `izoiswild@gmail.com` | `designakum@outlook.com` |
| Supabase | `gphrzvjlstznhypcfgre` | its own project |
| Contains | accounts, auth, signup, billing, dashboards | landing pages, pricing, SEO |

**This repository is the Platform.** Nothing here may reference, import from or
serve the marketing site, and no marketing copy, pricing prose or sales content
belongs in it. If a task seems to concern the marketing site, stop and ask.

A **third** Supabase project on the same account (`jswxevbghmbqumlccpfy`, a
personal finance app) is unrelated. Never touch it.

Details: [environments/platform.md](environments/platform.md) ·
[environments/marketing.md](environments/marketing.md)

---

## 3. Which document do I read?

| Your task | Read |
|---|---|
| Anything at all, first time in a session | this file |
| PayPal, checkout, subscriptions, renewals, refunds, plans, prices | [architecture/billing.md](architecture/billing.md) |
| Login, signup, verification, password reset, `must_set_password` | [architecture/auth.md](architecture/auth.md) |
| An email did not arrive, or arrived in the wrong language | [architecture/emails.md](architecture/emails.md) |
| Tables, RLS, entitlement, "who can write this row" | [architecture/database.md](architecture/database.md) + `supabase/SCHEMA.sql` |
| What "published" is — snapshots, promotion, rollback | [architecture/published-snapshot.md](architecture/published-snapshot.md) |
| Changing `pages/index.js`, `PortfolioRenderer`, or the piece pages | [architecture/renderer-migration.md](architecture/renderer-migration.md) — public renderer migration plan: adapter boundary, snapshot transition, tenant cutover sequence |
| Writing the adapter, a shared portfolio component, or anything reading a snapshot | [architecture/renderer-contracts.md](architecture/renderer-contracts.md) — FROZEN contracts: document shape, media rules, component boundary, prop sets |
| Changing an RLS policy, or "who can read this row" after the migration | [architecture/rls-target-policies.md](architecture/rls-target-policies.md) — proposed target policies, not applied; each names the phase it lands in |
| Cutting a client over to the new renderer, or telling them what changes | [workflows/tenant-migration-comms.md](workflows/tenant-migration-comms.md) — who loses what, the operator workflow, and the cutover checklist |
| Routing, the tenant resolver, the admin's structure, styling | [architecture/overview.md](architecture/overview.md) |
| "Is this already built?" | [features/completed.md](features/completed.md) |
| "What should I work on?" | [features/planned.md](features/planned.md) |
| "Why on earth is it done this way?" | [decisions/decisions.md](decisions/decisions.md) |
| How to run, test and commit | [workflows/development.md](workflows/development.md) |
| Shipping code, SQL or a function | [workflows/deployment.md](workflows/deployment.md) |
| Something is broken and you are starting cold | [workflows/debugging.md](workflows/debugging.md) |
| "Has anyone looked at this before?" | [engineering-log.md](engineering-log.md) |
| Launching: manual tasks, the live checkout test, health checks | [workflows/launch-readiness.md](workflows/launch-readiness.md) |
| Building or redesigning any screen, flow or component | [design/design.md](design/design.md) — the design constitution, then the `.claude/skills/frontend-design` process |
| Anything about the UX redesign — start here, before designing | [ux/designakum-ux-context.md](ux/designakum-ux-context.md) |
| Colour, type, motion, icons — before adding a token or a hex value | [ux/designakum-design-system-final.md](ux/designakum-design-system-final.md) + `styles/globals.css` |
| What Phase 0 locked, and what is still blocked on the designer | [ux/designakum-phase-0-checklist.md](ux/designakum-phase-0-checklist.md) |

Files outside `docs/` that are still authoritative:

- **`supabase/SCHEMA.sql`** — the authority on the live database. Read back out
  of production, so it is what exists, not what someone intended. Documentation,
  never a migration; do not run it.
- **`CLIENT-GUIDE.md`** — written for clients, not engineers. Product surface.
  Keep it in customer language.
- **`supabase/EMAIL-TEMPLATES.md`** — the Supabase Auth template bodies.
- **`supabase/history/README.md`** — why those scripts must never be re-run.

---

## 4. Rules for AI agents working here

1. **Read this file, then the one relevant document. Not the whole tree.**
2. **Do not add a dependency.** Five runtime deps, no devDependencies. No
   TypeScript in the app, no Tailwind, no PostCSS.
3. **Do not change** the database schema, RLS, auth, the tenant resolver, routing
   or billing without an explicit request — and never two of them in one change.
4. **Never reintroduce a default or singleton tenant.** See
   [decisions/decisions.md](decisions/decisions.md); this one served a real
   client's site to strangers.
4b. **A sandbox subscription never grants access, and the predicate is
   `environment IS DISTINCT FROM 'sandbox'` — never `= 'live'`.** Comps carry a
   NULL environment; `= 'live'` would revoke every comped client at once.
   Decided and applied 2026-08-13 in `section-o-sandbox-entitlement.sql`;
   reasoning in [architecture/billing.md](architecture/billing.md) §10b.
5. **Never replace Supabase Auth with custom password storage**, and never write
   custom password hashing.
6. **Verify claims against the database before acting on them.** More than one
   reported failure here turned out to be correct behaviour observed at the
   wrong moment.
6b. **Never look up a user with `listUsers({ email })`.** It has no email
   filter and silently ignores the argument, returning whatever page you asked
   for. Use `_shared/find-user.ts`. This shipped a password reset that worked
   for exactly one account in the project; the full account is in
   [architecture/auth.md](architecture/auth.md) §7.
6c. **A test double must never be more capable than the thing it replaces.**
   The bug above passed 458 tests because the Supabase fake implemented a
   filter the real SDK does not have. When a test and production disagree,
   suspect the fake.
7. **Finish with `npm test` and a build**, then read the diff.
8. **Update documentation only when architecture or a decision changed.** A bug
   fix that leaves the design intact needs no doc edit. Resist the urge to
   record what you did today.

---

## 5. Where things live

```
pages/          index.js (public site) · [slug].js · admin.js (the whole admin)
                signup.js · signup/verify.js · subscribe.js · reset-password.js
components/     PreviewPane + ui/ primitives
lib/            tenant resolver, billing helpers, auth helpers, i18n, policies
supabase/
  SCHEMA.sql    the live database, documented
  sections/     applied migrations — new changes go here
  history/      superseded scripts. DO NOT RUN.
  functions/    13 Edge Functions (Deno)
tests/          Node test runner; pure lib modules only
docs/           this system
```

---

## 6. The working loop

Every feature or bug fix happens in a **fresh session**:

1. Read `docs/GRANDMASTER.md`.
2. Identify the one relevant document from the table above.
3. Read only that, plus the files it names.
4. Do the work.
5. Update docs **only** if architecture or a decision changed.

Do not carry chat history between tasks. The repository is the memory.
