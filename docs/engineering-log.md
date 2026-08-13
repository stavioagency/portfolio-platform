# Engineering log

**Investigation history. Newest first.**

What belongs here: what was examined, what was found, what was ruled out, and
what was decided *not* to do. This is the one place in `docs/` where "what
happened on a given day" is the point.

What does NOT belong here: architecture and current truths. Those go in the
document that owns them — a log entry should link to the doc it changed, not
restate it. If a future session can only learn something by reading this file,
it is in the wrong file.

Every entry: date, what was investigated, what was concluded, what changed.

---

## 2026-08-13 — UX context handoff written; stabilisation phase closed

**Wrote** `docs/ux/designakum-ux-context.md`, a self-contained brief for a
fresh session starting the redesign. No UI code touched and no design proposed.

Grounded in the codebase rather than recollection, and three facts in it are
worth surfacing here because they will shape the redesign more than anything
the founder listed:

  * **pages/admin.js is ~6,550 lines and is BOTH portals**, switched by role at
    runtime on a single `/admin` route. Tab state is internal, so nothing in
    the dashboard is linkable. The "generic feeling" the founder describes has
    a structural cause: the information architecture is a conditional, not a
    structure.
  * **The dependency rule is a hard design constraint, not a preference.** Five
    runtime deps, no Tailwind, no TypeScript, no component library. A blueprint
    assuming a modern component stack is not implementable here, and that has
    to be known before the design exists rather than discovered at build time.
  * **The onboarding friction is vocabulary, not step count.** "+ Add client"
    is already one form; what makes it feel manual is being asked for a slug
    and a username. Neither can simply be deleted — the slug becomes the public
    URL and the username is used by sign-in resolution.

Closes the stabilisation phase. The one launch blocker (the live checkout has
never run end to end) is a verification task and does not block UX work.

---

## 2026-08-13 — Foundation checkpoint: stabilisation merged to main, sandbox webhook removed

**Merged** `stabilization/foundation-2026-08` into `main` with `--no-ff`
(`340bb91`). No conflicts. Pre-merge audit: clean tree, no secrets in the full
branch diff, no env files, and the only application change outside docs/tests
was 49 purely additive lines in `admin.js` confined to `SubscribersOverview`.
Post-merge: 473/473 tests, production build compiled, and the deployed
`billing-subscription` v11 bundle diffed byte-for-byte against `main` — all
seven files match, so **production and the repository are now in sync**.

**Sandbox webhook deleted by the owner.** The endpoint pointing at the
production `billing-webhook` is gone from the sandbox PayPal app. The
consequence worth recording: a `signature verification FAILED` log line is no
longer expected noise, it is a real incident signal — almost certainly the live
`PAYPAL_WEBHOOK_ID` no longer matching. Our own evidence (no failures since) is
corroborating rather than proof, since no sandbox event may have been sent.

**Verified live, by query rather than assumption:** the sandbox guard is
present in `tenant_has_active_subscription()`, zero sandbox rows entitle, zero
comps are broken (all 7 still entitled), and both sandbox subscriptions sit at
`expired`.

**Added** a launch checklist to `workflows/launch-readiness.md` splitting
blockers from important-before-marketing from redesign-era work. There is
exactly **one blocker: the live checkout has never run.**

---

## 2026-08-13 — Billing safety phase: grant_comp confirmed live, sandbox entitlement closed

**grant_comp is LIVE — deployed by the owner, not by this session.**
`billing-subscription` was found at **v11** with a CLI-style entrypoint,
updated after the previous session ended. Verified rather than assumed: all
seven bundle files diffed byte-for-byte against the working tree and matched,
`verify_jwt: true`, the `grant_comp` branch present and sitting above the
`no_subscription` 404, owner check present, INSERT-only with the 23505 guard,
and `paypal.ts` identical to git HEAD (PayPal logic untouched). The CLI route
worked exactly as predicted — deploying from disk removed the transcription
risk that blocked three sessions.

**Sandbox entitlement closed.** `section-o-sandbox-entitlement.sql` added
`environment is distinct from 'sandbox'` to
`tenant_has_active_subscription()`. Blast radius was measured before applying
and matched exactly after: 7 comps still entitled, 2 sandbox rows no longer
entitled, 2 live `pending` rows unchanged. Applied while there were **zero real
paying customers**, which is what made a change to the entitlement authority
cheap.

**Sandbox rows expired, tenants kept.** `zz-signup-live` and `niggatesting`
set to `status='expired'` with `canceled_at` stamped. They could not be
cancelled at PayPal — verification fails closed while `PAYPAL_ENV=live` — so a
database write was the only route. Tenants deliberately NOT deleted: the
cascade destroys billing history with no archive, and that is the owner's call.
Rollback values recorded (both were `active`, period ends 2026-09-06 and
2027-08-07, subscription ids `I-2GNFETA9WR0C` / `I-D3EHXR0FH8M9`).

**Webhook review — no changes needed, and none made.** Verification happens
before any database write, uses the current environment's API and webhook id,
refuses a missing webhook id, hostname-checks `cert_url`, and treats an errored
verification as a failure. Cross-environment events therefore cannot affect
production. 31 events recorded, all `paypal`, none since 2026-08-11 —
consistent with sandbox events being rejected. Secrets untouched; nothing
required a change.

**Still open:** deactivate the sandbox webhook at PayPal so those events stop
arriving at all.

---

## 2026-08-13 — invite-client v19 shipped; billing-subscription blocked on the DEPLOY CHANNEL, not the code

**Deployed:** `invite-client` v18 → **v19**, `verify_jwt: true` preserved. The
paged `findUserByEmail()` is live and `_shared/find-user.ts` is in the bundle.
Pre-deploy the live v18 was diffed against `git show HEAD:` and matched exactly
— nothing production-only to preserve. Post-deploy the bundle was read back and
compared to the v18 capture: exactly two differences, both intended.

**`billing-subscription` was NOT deployed, for the third session running, and
the reason is worth fixing rather than repeating.**

The MCP `deploy_edge_function` tool takes file contents *inline*. A function's
bundle must include every file it imports, so shipping `grant_comp` means
re-emitting `paypal.ts`, `provider.ts`, `grant.ts`, `http.ts` and
`billing-db.ts` — ~62KB, most of it payment code this change does not touch.
Hand-copying that is the same risk class that already put a paraphrased
`signup-start` into production, and it cannot honestly be called "deploy the
exact source files".

**THE CLI IS AVAILABLE AFTER ALL.** `npx supabase@latest --version` returns
**2.114.0** on this machine — no install needed. What is missing is only a
credential: no `~/.supabase/access-token`, no `SUPABASE_ACCESS_TOKEN`. Earlier
notes recorded "the CLI is not available on this Mac"; that is now WRONG and
should not be trusted again. The blocker was never the tool, only the token.

With a token the deploy is exact by construction — the CLI uploads the files
from disk, so transcription drift becomes structurally impossible and the whole
class of bug this log keeps recording disappears. That is the fix; it is two
minutes of the owner's time and it unblocks every future billing deploy:

```
export SUPABASE_ACCESS_TOKEN=<a personal access token>
npx supabase@latest functions deploy billing-subscription \
  --project-ref gphrzvjlstznhypcfgre
```

`verify_jwt` stays true (the CLI default) — do NOT pass `--no-verify-jwt` for
this one. Verify afterwards by diffing the deployed bundle against the repo,
the same way this session did for `invite-client`.

**Rollback, if ever needed:** the v10 bundle was captured verbatim before any
of this and can be redeployed.

---

## 2026-08-13 — Controlled deployment: signup-start shipped, two held

**Deployed:** `signup-start` v7 → **v8**, `verify_jwt: false` preserved. This
was the one of the three that was actively wrong in production: the broken
`listUsers({ email })` lookup meant a returning customer looked brand-new, so
the "you already have an account" branch was unreachable. Smoke-tested — a
non-JSON body answers `invalid_json`, a bad address `email_invalid`, and slug
`admin` `slug_reserved`, which together prove boot, `_shared` resolution and
that the bundled rules are live. No account was created by any of them.

**Pre-deploy drift check, and what it found.** Deployed bundles were diffed
mechanically against `git show HEAD:` rather than by eye. `signup-start` and the
whole `billing-subscription` bundle matched the repo **except**
`billing-subscription`'s copy of `_shared/billing-db.ts`, which predates
section-n and lacks `environment` on `SubscriptionPatch`. Nothing prod-only was
found that a deploy would regress. This is the per-function `_shared` bundling
hazard: each function carries its own copy and they age independently.

**Held, deliberately: `invite-client` and `billing-subscription`.**

`invite-client`'s fix is latent — at 25 accounts a bare `listUsers()` still
returns every user, so deploying it changes no behaviour today.

`billing-subscription` is the valuable one and was held for a mechanical
reason: the MCP deploy tool takes file contents inline, so its bundle means
hand-copying `paypal.ts`, `provider.ts` and `grant.ts` — ~62KB of PayPal
integration that this change does not touch. That is exactly how a paraphrased
`signup-start` reached production once before. **A deploy that cannot be done
verbatim should not be done at all**; do it from a fresh session with the
budget to emit the bundle exactly, and diff it afterwards the same way.

---

## 2026-08-13 — Grant Complimentary Access (implements the audit's one gap)

**Built:** `grant_comp` on `billing-subscription`, plus a "Grant free access"
button on Subscribers. This is the single missing business action the audit
below identified, and nothing else from it.

**Smallest safe implementation, and why it stayed small.** No schema change was
needed and none was made: `status = 'comped'` was already in the CHECK
constraint, `subscriptions_tenant_id_key` was already UNIQUE on `tenant_id` (so
duplicate prevention was already enforced by the database), and
`tenant_has_active_subscription()` already treated `comped` as entitled. The
change is one INSERT helper, one action branch, one button, one error string.

**Decisions worth keeping:** INSERT rather than upsert, so a mis-click cannot
overwrite a paying subscription; `environment` left null, so grants stay out of
the PayPal environment migration; `tenants.status` untouched, so granting access
and publishing a site remain separate decisions. Full write-up in
[architecture/billing.md](architecture/billing.md) §10a.

**Not done, deliberately:** no CRM, no lifecycle management, no "ungrant", no
onboarding changes, no PayPal changes, no entitlement-rule changes. The
environment predicate from §10b is still open and still belongs inside the live
migration.

**Verified:** 473/473 tests (14 new in `tests/billing-comp-grant.test.mjs`),
build green. **STILL NOT DEPLOYED as of 2026-08-13** — `billing-subscription` in
production is v10 and has no `grant_comp`. Granting a comp is still SQL until it
ships. See the deployment entry below for why it was held.

---

## 2026-08-13 — Owner onboarding and comped-client workflow (audit only)

**Asked:** is owner-side client onboarding good enough to carry the company to
the UX redesign, or is it missing functionality?

**Examined:** `invite-client`, `signup-start`, `billing-subscription`, the
"+ Add client" flow in `admin.js` (~line 3255), section-K entitlement
enforcement, and the live `tenants` / `subscriptions` tables.

**Concluded — the workflow is mostly built, and has one hole in it.**

Onboarding is genuinely one form, not a manual sequence: the admin orchestrates
tenant insert → profile insert → `invite-client` (auth user, username,
`tenant_admins` mapping, credentials email) from a single submit. The founder's
sense that this is "manual" is largely a UX problem — the form asks for a slug
and a username, which are platform concepts, not business ones.

The hole is real and it is on the live path: **nothing in the product can grant
a comp.** A client onboarded through "+ Add client" gets no subscription row, so
they are unentitled, and section K makes entitlement gate *writes* — they can
sign in and read, and cannot save anything. Every existing comp came from one
bulk SQL backfill on 2026-08-06; the first workspace created after it
(`ggghsj`) is not entitled. Written up in
[architecture/billing.md](architecture/billing.md) §10a.

Also found, unrelated to onboarding: `tenant_has_active_subscription()` ignores
`subscriptions.environment`, so a sandbox subscription grants production
entitlement (§10b). Two test workspaces are entitled this way today.

**Changed:** documentation only. No code, no schema, no behaviour — this was an
audit and the two fixes it implies (a `grant_comp` action; the environment
predicate) both touch billing and were deliberately left for scheduled work.

---

## 2026-08-13 — Password reset delivered nothing (fixed)

**Reported:** reset emails never arrive; `request-password-reset` returns
`{ok:true}`; `password_reset_tokens` empty. Suspected Resend key, domain
verification or Edge Function secrets.

**Concluded: none of those.** Resend, the domain, the secrets and the deployed
code were all healthy. `admin.auth.admin.listUsers({ page, perPage, email })`
has **no email filter** — the SDK drops the argument — so with `perPage: 1` the
lookup compared the requested address against the single newest account in the
project and returned "no such account" for the other 24. The endpoint's
unconditional `{ok:true}` (correct, anti-enumeration) made it invisible.

458 tests passed throughout because `tests/helpers/fake-supabase.mjs`
implemented the filter the real SDK lacks and ignored paging.

**Changed:** added `_shared/find-user.ts`; fixed the lookup in
`request-password-reset` (deployed v7, verified live — first token row ever
written, Resend accepted the send), `signup-start` and `invite-client`;
corrected the fake; added a regression test that buries an account behind a page
boundary. Full write-up in [architecture/auth.md](architecture/auth.md) §7.4.
