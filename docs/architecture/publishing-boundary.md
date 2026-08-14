# Where the paywall belongs

> **SUPERSEDED, 2026-08-14, by [publishing-model.md](publishing-model.md).**
> Written before the publishing decisions were locked. Two of its
> recommendations are now known to be wrong and are corrected there:
>
> * it proposed an **Edge Function** for the publish action. Publishing needs no
>   service_role key and no provider secret — only the caller's own identity,
>   which Postgres already has. A SECURITY DEFINER RPC is smaller, has no deploy
>   step, and cannot drift from a bundled `_shared` copy.
> * it proposed a **signed preview token**. A token *is* a shareable public
>   preview link, which the locked Option A rules out. The same-origin session
>   answers the question with nothing to leak, expire or revoke.
>
> It also missed `can_write_media()` and the `tenant_domains` trap entirely.
> Kept for the reasoning that still holds; read the newer document first.

**A recommendation, not an implementation.** Nothing here is built. It exists so
the Phase 1 UI is designed against the boundary the product is moving to, rather
than the one it has.

Reality it is based on: [phase-1-audit.md](phase-1-audit.md), §2 and §3.

---

## 1. The problem in one line

The locked model puts the paywall at **publishing**. The code puts it at
**writing**.

```
                     today                          locked model
  create account     free                           free
  dashboard          free   (is_tenant_admin)       free
  edit profile       PAID   (can_edit_tenant)       free
  upload projects    PAID   (can_edit_tenant)       free
  private preview    PAID   (resolveTenant gate)    free
  public URL         PAID   (resolveTenant gate)    PAID
```

Only the last row agrees. Everything above it has to move, and all of it moves
in the database, not the interface.

---

## 2. Three questions currently answered by one predicate

`can_edit_tenant()` conflates three things that the free tier needs separated:

| Question | Should depend on | Today |
|---|---|---|
| May this person change this workspace? | membership | membership **and** entitlement |
| Is this workspace meant to be public? | an explicit choice by the user | nothing — there is no such state |
| May it actually be served? | entitlement | entitlement |

The recommendation is to split them, one predicate each, and to keep the
existing mirror discipline: the database is the authority, `lib/` mirrors it for
the UI, and a unit test pins the two together — the arrangement
`billing-status.js` already uses for entitlement.

### The proposed predicates

```
is_tenant_admin(tid)                 -- unchanged. membership only.
tenant_has_active_subscription(tid)  -- unchanged. entitlement only.

can_edit_tenant(tid)   := is_platform_owner() OR is_tenant_admin(tid)
                          -- entitlement REMOVED

tenant_can_publish(tid) := tenant_has_active_subscription(tid)
                           -- may this workspace be public at all

tenant_is_published(tid) := tenants.published_at IS NOT NULL
                            -- has the user chosen to publish
```

and the render gate in `resolveTenant()` becomes three, not two:

```
  operator:   tenants.status <> 'disabled'
  intent:     tenants.published_at IS NOT NULL      <-- new
  entitlement: tenant_has_active_subscription(tid)
```

`canPublish()` in `lib/` is the browser-side mirror — it answers "may this
person press Publish", so the UI can explain *why not* instead of offering a
button the database will refuse:

```js
canPublish({ isOwner, isMember, entitled, hasContent })
//  -> { ok: true }
//  -> { ok: false, reason: 'not_a_member' | 'not_entitled' | 'no_content' }
```

`hasContent` reuses `hasPublicContent()`, which already exists and already
decides whether a page renders as a portfolio or as "setup needed". Publishing
an empty portfolio should be refused for the same reason that screen exists.

---

## 3. Why `published_at` rather than reusing `tenants.status`

`status` is the operator's axis, and `billing.md` is emphatic that billing never
writes it. Overloading it with the user's own publish choice would put two
actors on one column and make "why is this site dark?" unanswerable — which is
already happening in a small way (audit F5: every self-signup workspace is
created `disabled`, so the column currently means both things).

A separate nullable timestamp keeps the three axes independent, and a timestamp
rather than a boolean because "when did this go live" is a question the product
will ask.

**Constraint that shapes this (audit F4):** `tenants` is `UPDATE … USING
is_platform_owner()`. A client cannot write their own tenant row. So publishing
needs one of:

- **a narrow column-scoped policy** letting a tenant admin update only
  `published_at` on their own row — smallest change, but Postgres has no
  column-level RLS, so it needs a trigger or a `WITH CHECK` that pins every other
  column to its current value; or
- **an Edge Function** `publish` / `unpublish` using the service role, checking
  membership and entitlement itself — consistent with how every other
  privileged write in this system already works, and the recommended option.

The Edge Function is the better fit: publishing is exactly the kind of action
that should be one auditable place, and the pattern (`billing-subscription`,
`signup-verify`) is established.

---

## 4. Private preview (audit F3)

Preview must stop being a public request. Two options:

**A. A signed preview token, resolver skips entitlement when valid.** Keeps the
load-bearing invariant that *the preview is the real public site* — the single
most valuable property of the current design, because it means preview cannot
drift from production. The token machinery already exists twice
(`signup-token.ts`, the billing grant): short TTL, HMAC, a `k` claim so it
cannot be spent elsewhere. **Recommended.**

**B. Render preview from the admin's loaded state.** Breaks that invariant and
creates a second renderer. `overview.md` already warns there is deliberately no
second renderer. Not recommended.

Note the gate to skip is **entitlement only**. Identity stays fail-closed, and
`tenants.status='disabled'` should still hide a suspended workspace from its own
client — a suspension they can preview around is not a suspension.

---

## 5. Migration order

Ordered so that no existing tenant is ever dark for a single deploy. Each step
is independently revertible and independently observable.

| # | Step | Risk |
|---|---|---|
| 1 | Add `tenants.published_at`, **backfilled to `now()` for every existing tenant** | none — nothing reads it yet |
| 2 | Add `tenant_can_publish()` / `tenant_is_published()`; add `canPublish()` + tests in `lib/` | none — nothing calls them |
| 3 | `resolveTenant()` reads the intent gate | **this is the live moment.** Safe only because step 1 backfilled every existing tenant to published |
| 4 | `signup-verify` creates new workspaces `status='active', published_at=NULL` instead of `status='disabled'` | new signups only; also unpicks F5 |
| 5 | Preview token, resolver skips entitlement for a valid one | preview only |
| 6 | **Drop entitlement from `can_edit_tenant()`** — the free tier opens | the RLS change. Widens write access; do it alone, with the comp/lapsed cases explicitly tested |
| 7 | Publish action (Edge Function) enforces entitlement | the paywall lands on publishing |

Steps 6 and 7 must ship together or in that order. Reversed, a free user could
publish; separated by a gap, a lapsed customer could edit but not publish, which
is the intended end state anyway and therefore a safe place to pause.

### What step 6 changes for existing users

A lapsed customer regains the ability to *edit* and loses nothing else — their
site is already dark. That is a deliberate improvement: today a lapsed customer
is locked out of their own content, which is a poor experience and a retention
problem. Nothing about it grants publishing.

---

## 6. Open questions for the operator

These are product decisions, not engineering ones. They are listed because the
Phase 1 UI cannot be finished without answers, but none of them blocks the shell
work.

1. **Does a free portfolio get a URL at all?** A private preview link that can be
   shared is a different product from one that cannot.
2. **What happens to a published site when a subscription lapses?** Today: dark
   immediately at period end. Options: dark, or revert to unpublished so the
   customer must re-publish after paying.
3. **Do free users get a subdomain slug reserved?** They hold `tenants.slug`
   today from the moment they verify, which reserves the name indefinitely
   without payment.
4. **Are comps published by default?** All seven current comps would be
   backfilled published by step 1, which preserves today's behaviour — confirm
   that is wanted.
