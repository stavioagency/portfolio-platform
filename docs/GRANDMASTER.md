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

## 0. THE PRODUCT, AS IT ACTUALLY IS (2026-08-28)

Read this before anything else in `docs/`. Several documents below were written
for a product direction that was abandoned, and this section says which.

**Designakum lets clients create and manage their portfolio, while the owner has
a simple internal panel to manage those clients and their subscriptions.**

### The four surfaces, and there are only four

| Surface | Where | What it is |
|---|---|---|
| Marketing site | `designakum.com` | Separate repo. Do not touch. |
| Public portfolio | `designakum.site/<slug>` | What a client pays for |
| Client editor | `designakum.site/admin` | A client signs in and edits THEIR portfolio |
| Owner console | `designakum.site/console` | Client management: roster, money, reset password, change login email, grant/revoke free access, create a client, delete one |

`/admin` is now the CLIENT's editor only. Sites and Subscribers were removed
from it on 2026-08-27 and live in `/console`.

### The reference for the portfolio's look

`design/original-portfolio-reference.md` — the build Feras returned to, at
https://enchanting-palmier-b208ed.netlify.app/, measured off the running page
with `getComputedStyle` rather than described from memory. It carries the full
spec and every decision taken against it. **Read it before touching
`pages/index.js`.**

---

### WHERE THIS STANDS (end of 2026-08-28)

Everything below is shipped, pushed and applied unless it says otherwise.

**The public portfolio** is the original's design: a 330px card at 35px radius,
a violet page gradient, contact as icons at the top, one 170px image band, a
three-fact strip, up to three buttons, a footer. Verified in a browser on real
tenant data, in Arabic and English, at 375px and desktop.

**The client editor is five tabs**, down from ten: أعمالي، بطاقتي، التواصل،
الزيارات، حسابي.

**`/console`** is the owner's one screen: roster, search, invite, and a panel
per client (access, portfolio, editor, reset password, change email,
grant/renew/revoke free access, delete). Pinned dark.

#### What changed today, and why — the short version

| | |
|---|---|
| The band | Shows **banners** again. It briefly showed the client's projects; Feras reversed that — he wants an image he puts there directly |
| The strip | Three DEFINED facts, not free text: a rating (chosen from a list), a client count (a number, no label), and availability **derived from working hours** so it cannot go stale |
| Type | Manrope for Latin, Tajawal for Arabic. Tajawal was first, so every Latin glyph came from its secondary script |
| The glow | Takes the client's accent **hue only**, at pinned lightness. The default accent reproduces the measured original to within 0.35° of hue |
| Bilingual | Opt-in. Five of seven clients had no English and were being asked for it twice |
| Free access | Can expire. No end date still means forever, which is what all seven carry |
| Onboarding | Self-serve only. The owner types an email; the client signs themselves up onto a 30-day comp |

#### The database, as of tonight

```
tenants 7 · all comped, none with a deadline · payments 0 · invites 0
projects 9 · bilingual 2 (designakum, f9designer) · cron jobs 1
published snapshots carrying the new columns: 3 of 7
```

**Nobody has ever paid.** The revenue tiles in `/console` appear with the first
payment and are hidden until then.

**Four portfolios still have stale snapshots.** A snapshot is built from an
EXPLICIT column list, so the new fields only reach a live site when that client
presses Publish. Their cards are correct, just missing the newer parts.

#### Applied to production

Sections `t` `u` `v` `w` `x` (quick facts + the paywall date rule; free-access
invites; bilingual + the snapshot builder; expiry notices; unpublished-changes).
Edge Functions deployed: `signup-verify`, `billing-subscription`,
`delete-client`, `expiry-notices`. `invite-client` deleted. `pg_cron` job
`expiry-notices-daily` runs 06:00 UTC and was proven end to end (200, considered
0). `CRON_SECRET` is in Vault and in the function's secrets.

---

### THE FIVE THINGS THAT WILL WASTE YOUR DAY

1. **`next build` poisons a running dev server.** It writes `.next` with the
   placeholder credentials baked in, because `NEXT_PUBLIC_*` is a compile-time
   substitution. The symptom is `ERR_NAME_NOT_RESOLVED` for
   `placeholder.supabase.co` and a portfolio stuck on its retry screen.
   `rm -rf .next` and restart. See the `verify` skill.

2. **The preview shows the DRAFT; the public page shows the last PUBLISH.**
   Fields can be filled in, visible in the preview, and absent from the live
   card. That is the staging model, not a bug.

3. **A new profile column is invisible to the live site** until it is named in
   `build_snapshot()` (section-x). It will work perfectly in the preview and do
   nothing after Publish.

4. **You cannot sign in.** Entering a password is refused, so every signed-in
   screen is build-and-test verified only. To actually see an editor render,
   mount it on a scratch page against a stub `TenantContext` — that is how the
   `RATING_CHOICES` crash was reproduced.

5. **The guards bite, and they are right.** `npm test` will refuse: a JSX
   component or SCREAMING_SNAKE constant used and never declared; a backtick
   inside a styled-jsx template; an Arabic imperative aimed at a person; a
   `<label>` naming nothing; a sixth font family. Fix the code, or update the
   guard **with the reason recorded** — never lower a threshold to get green.

---

### What is live in the database

| Section | What it did |
|---|---|
| P | `tenants.published_snapshot`, `published_at`, `publish_tenant()` |
| Q | `get_public_portfolio()`; anon SELECT removed from `profile`/`projects` |
| R | `deleted_clients` archive |
| S | `profile.availability` — superseded by `profile.hours` (section-t) |
| T | `rating`, `client_count`, `hours`; comps can expire |
| U | `free_access_invites`, `claim_free_access()` |
| V | `profile.bilingual`; snapshot carries the new columns |
| W | `comp_expiry_notices`, `comps_needing_notice()`, the daily cron |
| X | `build_snapshot()`, `has_unpublished_changes()` |

**The paywall is enforced by the database**, not the UI:
`get_public_portfolio()` → `tenant_has_active_subscription()`. A comped row with
`current_period_end` in the past is no longer entitled; a NULL end date is
permanent.

### What was REMOVED, so nobody looks for it

`pages/studio/`, `components/studio/`, `components/shell/`, `lib/studio/`,
`lib/shell-nav.js`, `lib/shell-prefs.js` (2026-08-27) — an unbuilt second
product.

`components/CredentialsHandoff.js`, `lib/credentials.js`,
`lib/credentials-pdf.js`, `lib/handoff-store.js`,
`supabase/functions/invite-client` (2026-08-28) — the generated-password
handover. Clients sign themselves up; nobody sees a password.

`AppearanceEditor`, `ClientHome`, `BannerRow`'s tab, custom fields, the five
`sections.*` visibility toggles, the ticker (2026-08-28).

**Columns kept but unread:** `stats`, `top_ticker`, `custom_fields`,
`sections`, and most of `appearance`. Dropping them is a separate decision.

### Documents that describe the abandoned direction

Kept because tooling references them or they record real decisions, but they
describe a product that does not exist. Read their Studio/Console sections as
history:

`product/designakum-blueprint.md` (§8.5 publishing, Studio) ·
`architecture/published-snapshot.md` · `architecture/renderer-migration.md` ·
`architecture/renderer-contracts.md` · `design/design.md` §6 ·
`design/next-step.md` · `ux/designakum-design-system-final.md` §7

**Added 2026-08-28**, because a session lost time to the contradiction:

`design/public-portfolio-hierarchy.md` · `design/public-portfolio-feature-decisions.md`
· `design/credibility-line.md`

These three are marked **approved** and describe a **different page entirely**:
work-first, no image band, no stat row, the action below the work. They were
written for `PortfolioRenderer`, deleted 2026-08-27.

**The live data settles it.** Six of seven tenants have NO pieces at all. "The
work is the page" would render an empty page for everyone but f9designer. Read
them for their principles, not their layout.

Where they were RIGHT, and it was taken: one primary action, no ticker, no
custom fields, no visibility toggles, sections appear from content.

### What has never been verified by a human

**Every signed-in flow.** No session has been able to sign in. `/console`, the
five editor tabs, publish, the colour picker, the hours picker, invite,
grant/renew, reset password, change email and delete are build-and-test
verified only.

**Untested end to end:** the signup → invite → 30-day comp path, and
cancel-on-delete at PayPal (no live subscription has ever existed).

### What is open

* **Custom domains.** Wanted, not built, no `domains` table. The "Workspace"
  section in Account still shows a manager for it.
* **The next background step.** The glow follows the accent's hue; a short list
  of full background treatments is the next rung if that is not enough.
* **`profile.footer.color`** stores `rgba(var(--on-bg),0.3)` — a CSS variable
  written into the database and read back by the public page.
* **`docs/features/live-availability.md`** — option 1 (Discord presence) parked.
  WhatsApp and Telegram cannot provide presence; only Discord can.

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
