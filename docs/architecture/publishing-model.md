# The publishing model — architecture recommendation

> ## ⚠ PARTIALLY SUPERSEDED — read this first
>
> This document was written when **saving was publishing**: publish flipped
> `tenants.published_at`, and the public page then served the live rows the
> editor writes. The owner has since decided the opposite —
> **draft and published are separate states, and the flow is
> edit → draft → preview → publish**.
>
> **The authority on what publishing *does* is
> [designakum-blueprint.md](../product/designakum-blueprint.md) §8.5, and the
> snapshot model that replaces §5 here is
> [published-snapshot.md](published-snapshot.md).**
>
> What survives here, unchanged and still correct: §0 (cancellation already runs
> to period end), §2 (RLS split, `can_write_media`), §3 (resolver gates and fail
> direction), §4 (preview stays private through the session, no shareable token),
> §7 (billing must never write `published_at`).
>
> What is superseded: the idea that publishing is a **one-time flag** and that
> visitors read live rows. `published_at` still records *whether* a portfolio has
> ever been published, but publishing now also promotes the draft into a
> published snapshot, and the public page reads that snapshot. §5.2's
> `publish_tenant` therefore does more than set a timestamp.
>
> Do not implement §5 as written without reading blueprint §8.5 first.

**Recommendation only. Nothing here is built.** Written 2026-08-14 against the
locked decisions: free creation, paid publishing, preview only inside the
authenticated Studio, cancellation runs to period end, comps stay a separate
internal path.

Reality this is measured against: [phase-1-audit.md](phase-1-audit.md).
This document **supersedes** the sketch in
[publishing-boundary.md](publishing-boundary.md) — where they differ, this one
is later and better informed, and §4 says exactly what changed and why.

---

## 0. What is already correct, and must not be broken

Two of the locked decisions need no work at all. Recording that is worth more
than restating them as tasks.

**Cancellation already runs to period end.** Entitlement includes:

```sql
or (s.status = 'canceled' and s.current_period_end is not null
                          and s.current_period_end > now())
```

Cancel on 15 August with a period ending 1 September and the site serves until
1 September, then stops — no sweep, no cron, nothing that can go stale. The
locked example is the shipped behaviour.

> **The load-bearing detail.** PayPal *drops* `next_billing_time` once a
> subscription is cancelled, so `getSubscription()` reports
> `currentPeriodEnd: null` for anything cancelled, permanently. Entitlement
> requires `current_period_end IS NOT NULL`, so **writing that null is a
> revocation** — the site would go dark the moment the customer cancels, which
> is precisely the locked decision inverted. `keepPeriodEnd()` exists to stop
> that and every re-read goes through it. Any future work near the webhook must
> not regress it. This is the single most fragile thing behind the cancellation
> promise.

**Comp analytics are already separated from revenue.** The Subscribers screen
computes `paying = derived.filter(r => r.billing.entitled && r.billing.state !== 'comped')`
and MRR sums only that. Comps do not inflate revenue today.

---

## 1. Database changes

### 1.1 `tenants.published_at timestamptz NULL` — required

The user's *intent*, and the only genuinely new state. Nullable timestamp rather
than a boolean because "when did this go live" is a question the product will
ask, and rather than a new `tenants.status` value because `status` is the
operator's axis and already carries two meanings too many (audit F5).

**Backfill `now()` for all 14 existing tenants.** The gate is then a no-op on
day one: every tenant that renders today still renders, because the other two
gates are unchanged. Any other backfill silently unpublishes somebody.

> Alternative considered and rejected: backfill only the 7 currently-renderable
> tenants. It looks tidier, but it means a lapsed customer who repays comes back
> *unpublished* and has to discover a button to return to where they were. Intent
> and capability are different axes — that is the whole point of splitting them.

### 1.2 Comp separation — recommended, not required, and not urgent

The locked decision says comps stay a separate internal entitlement path and
must not be converted into fake subscriptions. **They already are fake
subscriptions**: all 7 live in `subscriptions` with `status='comped'`,
`plan_code='comped'`, `provider='none'`, `environment IS NULL`.

So the decision is, strictly, already violated by the schema — but the harm it
exists to prevent (comps polluting customer billing) is mostly absent, because
the revenue maths already excludes them (§0).

Two honest options:

| | Move comps to a `comp_grants` table | Leave them, enforce the boundary |
|---|---|---|
| Cost | migrating 7 rows that gate 7 live client sites; every reader of `subscriptions` changes; `tenant_has_active_subscription` becomes a union | a comment, a view, and the exclusion that already exists |
| Benefit | the model matches the decision | the *behaviour* matches the decision |
| Risk | an error here darkens live client sites | drift returns if a future reader forgets the exclusion |

**Recommendation: leave the rows where they are for now**, and make the boundary
explicit rather than conventional — a `paying_subscriptions` view that filters
`status <> 'comped'`, used by every revenue reader, so the exclusion is
structural instead of a filter someone has to remember. Revisit the table split
only if comps grow a lifecycle of their own (expiry, conversion, invoicing).

This is a deliberate disagreement with the strictest reading of the decision,
flagged rather than silently taken: migrating the entitlement path of seven live
sites to satisfy a modelling preference is real risk for no behavioural gain.

### 1.3 Nothing else

No new tables required for publishing. No schema change to `subscriptions`,
`profile` or `projects`.

---

## 2. RLS changes

**Three sites, and only two are findable by grepping `can_edit_tenant`.** This
is the part most likely to be got wrong.

### 2.1 Split the edit predicate — required

```sql
-- NEW: content editing. Membership only. This is the free tier.
can_edit_content(tid) := is_platform_owner() OR is_tenant_admin(tid)

-- UNCHANGED: still requires entitlement.
can_edit_tenant(tid)  := is_platform_owner()
                      OR (is_tenant_admin(tid) AND tenant_has_active_subscription(tid))
```

Repoint the policies:

| Table | Predicate | Why |
|---|---|---|
| `profile` | `can_edit_content` | portfolio content — free |
| `projects` | `can_edit_content` | portfolio content — free |
| **`tenant_domains`** | **`can_edit_tenant` — unchanged** | a custom domain *is* a live public URL. It is the paid feature |

> `tenant_domains` is the trap. It sits in the same list as `profile` and
> `projects` and reads like content, but relaxing it hands free users the exact
> thing the paywall sells. Keep it on entitlement.

### 2.2 `can_write_media()` — required, and easy to miss

Uploads are gated **inline**, not through `can_edit_tenant`:

```sql
exists (select 1 from tenant_admins ta
         where ta.user_id = auth.uid()
           and (storage.foldername(object_name))[1] = 't-' || ta.tenant_id::text
           and public.tenant_has_active_subscription(ta.tenant_id))   -- <-- here
```

Changing `can_edit_tenant` alone leaves free users able to create a project and
unable to put an image in it. Drop that clause; keep the path-traversal guard
and the tenant-folder check exactly as they are.

> **Open decision this forces: storage quota.** Free accounts uploading
> unlimited media is a cost and abuse surface with nothing in front of it today.
> Not a blocker for the model, but it should not be discovered after launch. A
> per-tenant object count or byte cap is the cheapest answer.

### 2.3 `tenants` UPDATE — unchanged

Stays `is_platform_owner()`. Publishing does not loosen it; see §4.

---

## 3. Resolver changes

`resolveTenant()` goes from two gates to three:

```
  1. operator     tenants.status <> 'disabled'
  2. intent       tenants.published_at IS NOT NULL      <-- new
  3. entitlement  tenant_has_active_subscription(tid)
```

Both paths — explicit slug and host match — apply all three. An unpublished
tenant behaves exactly like an unentitled one today: `NO_TENANT` by slug,
`BLOCKED_TENANT` by host. No new caller shapes.

`resolveTenantByHost()` stays host mapping only and gains nothing.

### 3.1 Fail direction

Gate 3 fails **open** on an RPC error, deliberately, and that stays.

Gate 2 must fail **closed**: `published_at` is read in the same query that
already fetches the tenant row, so there is no separate call to fail — but if a
future refactor makes it one, an error must mean *not published*. Failing open
on intent would publish a portfolio its owner never published, which is a
disclosure, not a downgrade.

---

## 4. Preview — Option A, and how it stays private

**Decision: preview lives only inside the authenticated Studio. No public
preview links.**

The mechanism that satisfies this and costs least:

> The preview iframe already shares an origin with the Studio, so the signed-in
> user's session is available inside it. The public page can therefore ask *"am
> I an admin of this tenant?"* and, when the answer is yes, skip the intent and
> entitlement gates.

```sql
-- SECURITY DEFINER, reads auth.uid(). anon always gets false.
can_preview_tenant(tid) := is_tenant_admin(tid)   -- already includes owners
```

```js
resolveTenant({ supabase, host, slug, preview })
```

When `preview` is set, and only then, call `can_preview_tenant`. If true, skip
gates 2 and 3 — **never gate 1**. An operator-suspended workspace stays hidden
from its own client: a suspension you can preview around is not a suspension.

**This must fail CLOSED** — the opposite of entitlement. An error means no
preview and the normal gates apply. Failing open here would serve unpublished
portfolios to the public, which is the one outcome the whole design exists to
prevent.

**Why it satisfies "no public preview links":** the URL carries no capability.
`/{slug}?preview=1` sent to anyone not signed in as an admin of that tenant
resolves through the normal three gates and 404s. There is nothing to leak,
nothing to expire, and no token to revoke.

**Why this replaces the signed-token sketch** in `publishing-boundary.md` §4:
a token *is* a shareable public preview link — exactly what Option A rules out —
and it would need minting, TTL policy, a `k` claim and a revocation story. The
session answers the same question with none of that, and keeps the invariant
that the preview is the real public page rather than a second renderer.

`index.js` already suppresses analytics and `localStorage` writes under
`?preview=1` or when framed. Both must stay: a previewing owner must not inflate
their own analytics, and the iframe writes to the Studio's own storage.

---

## 5. Publish action design

### 5.1 A Postgres RPC, not an Edge Function

`publishing-boundary.md` recommended an Edge Function. **That was wrong**, and
the reason is worth stating: an Edge Function is for work needing the
`service_role` key or a provider secret. Publishing needs neither — it needs the
caller's own identity, which Postgres already has via `auth.uid()`.

A `SECURITY DEFINER` function is smaller, has no deploy step, cannot drift from
a bundled `_shared` copy, and puts the rule in the same place as every other
authority in this system.

```sql
publish_tenant(tid uuid)   returns text   -- '' on success, else a reason code
unpublish_tenant(tid uuid) returns text
```

### 5.2 `publish_tenant` — the checks, in order

| # | Check | Refusal |
|---|---|---|
| 1 | `is_tenant_admin(tid)` — re-checked against the caller's own JWT | `not_permitted` |
| 2 | `tenants.status <> 'disabled'` | `workspace_suspended` |
| 3 | **`tenant_has_active_subscription(tid)`** | `not_entitled` ← **the paywall** |
| 4 | has publishable content | `no_content` |

Then `update tenants set published_at = now() where id = tid and published_at is null`.

Idempotent: publishing an already-published workspace succeeds and changes
nothing. Ordering matters — check permission before existence-shaped facts, so
a stranger cannot learn whether a workspace is suspended.

**Check 4 needs a decision.** `hasPublicContent()` is JavaScript in
`lib/profile-content.js` and is the existing authority on "would a visitor see a
portfolio here". Re-implementing it in SQL creates a second copy that will drift.
Options: (a) a minimal SQL check — name present — accepting that it is weaker
than the JS one; (b) the client refuses via `canPublish()` and SQL does not
check content at all. **Recommend (a)**: the client is not an authority, and
publishing a nameless page is the exact broken state `hasPublicContent()` was
written to catch.

### 5.3 `unpublish_tenant` — membership only

**No entitlement check.** A lapsed customer must always be able to take their
own site down, and unpublishing can never be the harmful direction. Requiring
entitlement to unpublish would trap someone whose card expired.

### 5.4 `canPublish()` — the browser mirror

```js
canPublish({ isOwner, isMember, entitled, suspended, hasContent })
// -> { ok: true }
// -> { ok: false, reason: 'not_permitted' | 'workspace_suspended'
//                       | 'not_entitled'  | 'no_content' }
```

Same discipline as `billing-status.js`: pure, unit-tested, and **not the
authority** — it exists so the UI can explain *why not* instead of offering a
button the database will refuse. Same reason codes as the RPC, so the two are
comparable in a test.

---

## 6. Studio UX states

Eight states, each with one reason code driving it. This is the full matrix the
Studio must render — the publish surface is where free and paid meet, so
guessing here produces the states nobody designed.

| # | Content | Published | Entitled | Studio shows |
|---|---|---|---|---|
| 1 | empty | no | no | *Build your portfolio.* Publish disabled — `no_content` |
| 2 | some | no | no | **The conversion moment.** "Ready to publish" + subscribe CTA — `not_entitled` |
| 3 | some | no | yes | Publish enabled |
| 4 | some | yes | yes | **Live**, with the URL and an unpublish control |
| 5 | some | yes | cancelled, in period | Live, *"stays live until 1 September"* — the locked cancellation promise, said out loud |
| 6 | some | yes | lapsed | **Offline.** Content intact, "resubscribe to bring it back". `published_at` stays set |
| 7 | any | any | any, suspended | Suspended — contact support. No publish, no preview |
| 8 | empty | no | yes | Publish disabled — `no_content`, not a billing problem |

State 6 carries a decision: **when entitlement returns, the site returns
automatically**, because `published_at` was never cleared. Intent survives a
lapse; capability is what came back. The alternative — forcing a re-publish —
is a worse experience and needs the customer to notice a button.

State 5 is the one most likely to be skipped and is the visible half of a locked
decision. It needs the real date, from `current_period_end`.

Preview is available in states 1–6 and never in 7.

---

## 7. Billing interaction points

**One new invariant, stated in the same form as the existing one:**

> **Billing must never write `published_at`.** Exactly as billing never writes
> `tenants.status`. Entitlement changes what a workspace *may* do; it must not
> silently change what its owner *chose*. State 6 is what this buys.

| Event | Effect on publishing |
|---|---|
| Checkout completed → webhook `ACTIVATED` | entitlement flips true; already-published sites return by themselves. No publishing write |
| Cancellation | nothing. Entitlement carries the period end (§0) |
| Period end passes | site stops rendering. `published_at` untouched |
| Comp granted | entitlement true, same as paid |
| Operator disables a tenant | gate 1; publishing untouched |

**Entry into checkout from the Studio needs no billing change.** Door 1 of
`/subscribe` requires a real session plus admin rights on the named tenant — a
free user in the Studio has exactly that, having signed up and verified. The
state-2 CTA links to `/subscribe?plan=…&tenant=…&lang=…`. Nothing about checkout
is loosened, and `/subscribe` remains non-public.

---

## 8. Migration plan

Each step is independently revertible and independently observable. No existing
tenant is dark for a single deploy.

| # | Step | Live effect | Risk |
|---|---|---|---|
| 1 | `published_at` + backfill `now()` for all 14 | none — nothing reads it | none |
| 2 | `can_preview_tenant()`, `publish_tenant()`, `unpublish_tenant()`, `can_edit_content()`; `canPublish()` + tests in `lib/` | none — nothing calls them | none |
| 3 | Resolver reads the intent gate | **live moment.** Safe only because of step 1's backfill | low |
| 4 | Resolver preview path; Studio iframe passes `preview` | preview only | low |
| 5 | `signup-verify` creates `status='active', published_at=NULL` | new signups only; also unpicks audit F5 | low |
| 6 | Repoint `profile` + `projects` to `can_edit_content`; drop entitlement from `can_write_media`. **Leave `tenant_domains`** | **the free tier opens** | the RLS moment — ship alone |
| 7 | Publish/unpublish wired into the Studio | the paywall lands on publishing | low |
| 8 | Studio UX states 1–8 | — | none |

**Why 6 before 7 is safe:** after step 5, new workspaces have
`published_at = NULL` and nothing exists that can set it. So between 6 and 7 a
free user can build and simply has no way to publish — the correct end state,
reached by omission. The reverse order would leave free users still unable to
edit, which is the bug the whole plan exists to fix.

**Step 6 for existing users:** a lapsed customer regains editing and loses
nothing — their site is already dark, and nothing here grants publishing. That
is a deliberate improvement: today a lapsed customer is locked out of their own
content, which is a retention problem as much as a UX one.

### Tests that should exist before step 6

- entitlement unchanged for all four classes (comped, paying, lapsed, free)
- `can_edit_content` true for a free member, false for a stranger
- **`tenant_domains` still refuses a free member** — the §2.1 trap
- `can_write_media` allows a free member into their own folder only, and still
  refuses `..`
- resolver: unpublished → 404 by slug, blocked by host
- resolver: preview bypasses intent and entitlement, **never** `status`
- `canPublish()` reason codes match the RPC's, case for case

---

## 9. Open decisions

Product calls, not engineering ones. None blocks steps 1–5.

1. **Storage quota for free accounts** (§2.2). The one with a cost attached.
2. **Does a free user keep holding their slug indefinitely?** They claim it at
   verification today and never pay for it.
3. **Content check on publish** — the SQL/JS duplication in §5.2.
4. **Comp separation** — accept the §1.2 recommendation, or take the migration.
