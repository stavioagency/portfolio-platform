# Target RLS policies — proposed, for review

**PROPOSED. Nothing is applied. No DDL has been executed and no migration has
been written.** This is phase **P0.2** of
[renderer-migration.md](renderer-migration.md): write the target policies down,
get them reviewed, and apply them at the phase each one names.

Verified read-only against the live database on **2026-08-21**, the same pass
that produced the refreshed `supabase/SCHEMA.sql`. Every "current" column below
is what `pg_policies` actually returns today, not what a document claimed.

---

## 0. The rules this document does not get to change

Three things are settled elsewhere and are inherited, not re-decided:

**Authorisation runs through `can_edit_tenant()`.** It is
`is_platform_owner() OR (is_tenant_admin(tid) AND tenant_has_active_subscription(tid))`,
and it already gates every content write. Nothing here introduces a second
entitlement predicate. Where a new policy needs entitlement, it composes
`tenant_has_active_subscription()` — the same function `can_edit_tenant()` calls.

**Publish intent and published content are separate.**

| | Where it lives | What it means | Cleared by |
|---|---|---|---|
| **Intent** | `tenants.published_at` | the client has *chosen* to be public | unpublishing, and nothing else |
| **Content** | a `published_snapshots` row | *what* the public should see | never — a new publish adds a row |

Conflating them is the trap ([published-snapshot.md](published-snapshot.md) §3).
It is also what makes an expiring subscription reversible: entitlement stops the
site being *served*, nothing clears the intent, so paying again restores the site
with no further action. **Billing must never write `published_at`.**

**Snapshots have no client write path.** Promotion is a `SECURITY DEFINER`
function. §4 below states that as a policy decision rather than an omission.

### What does not exist yet

Confirmed against the live database, because two of these policies are written
against objects that are not there:

| Object | Exists today? | Created in |
|---|---|---|
| `published_snapshots` | **no** | P4 |
| `tenants.published_at` | **no** | P4 |
| `tenants.public_renderer` | **no** | P3 (scaffolding, dropped in P6) |

So §3 and §4 are policies for a table that will exist at P4. §1, §2 and §5 are
changes to policies that exist now.

---

## 1. `profile` — reads

### Current

```sql
-- policy "Public can read profile", role public
SELECT USING (true)
```

### Why it is insufficient

**An unpublished tenant's content is world-readable.** `lib/tenant.js` gates
*rendering* — an unresolvable request 404s — but the row is still fetchable
through PostgREST by anyone who knows the project URL and a tenant id. That is
UI standing in for a data boundary, which the blueprint forbids in principle
("hiding a control is not a security boundary").

Concretely: a workspace created but never launched, a client's draft rewrite of
their bio, and a portfolio whose subscription lapsed are all readable today.

### Proposed

```sql
-- replaces "Public can read profile"
CREATE POLICY profile_select_admin ON public.profile
  FOR SELECT TO authenticated
  USING (is_tenant_admin(tenant_id));
```

| | |
|---|---|
| **Who can read** | the tenant's own admins, and platform owners (`is_tenant_admin()` includes `is_platform_owner()`) |
| **Who can write** | unchanged — `can_edit_tenant(tenant_id)` for ALL |
| **Roles** | `authenticated` only. **anon loses access entirely** |

### Why it is safe under the staged migration

**It is only safe once no public page reads this table**, which is exactly why it
is not applied earlier. Through P5 the legacy renderer serves every tenant that
has not yet cut over, and it reads `profile` as anon. Narrowing during the
cutover window would take those sites down.

The cutover window is therefore the exposure window, accepted deliberately in
exchange for per-tenant rollback ([published-snapshot.md](published-snapshot.md)
§10.6, as amended).

### Applied in

**P6**, after the last tenant leaves the legacy renderer. Not per tenant — there
is no per-tenant form of this change, because one policy serves every row.

---

## 2. `projects` — reads

### Current

```sql
-- policy "Public can read projects", role public
SELECT USING (true)
```

### Why it is insufficient

Identical to §1, and slightly worse in one respect: `projects` rows carry
`cover_image` and `images[]`, so an unpublished project's media URLs are
enumerable from the row itself. The bucket then serves them (§5).

### Proposed

```sql
-- replaces "Public can read projects"
CREATE POLICY projects_select_admin ON public.projects
  FOR SELECT TO authenticated
  USING (is_tenant_admin(tenant_id));
```

| | |
|---|---|
| **Who can read** | the tenant's own admins, and platform owners |
| **Who can write** | unchanged — `can_edit_tenant(tenant_id)` for ALL |
| **Roles** | `authenticated` only. **anon loses access entirely** |

### Why it is safe under the staged migration

Same reasoning as §1, and **the two must land in the same change**. Narrowing
`profile` while `projects` stays open leaves the work readable without the
identity, which closes nothing.

### Applied in

**P6**, together with §1.

---

## 3. `published_snapshots` — reads

### Current

No policy, because no table. Today the public reads draft tables directly, which
is the arrangement this replaces.

### Why the current arrangement is insufficient

It cannot distinguish *published* from *present*. A row exists as soon as a
client types anything, so "what the public may see" has no representation in the
data at all — only in the rendering layer.

### Proposed

```sql
-- reads: the tenant's own people at any time, or genuinely public
CREATE POLICY published_snapshots_select ON public.published_snapshots
  FOR SELECT TO public
  USING (
       is_tenant_admin(tenant_id)
    OR tenant_is_public(tenant_id)
  );
```

where `tenant_is_public()` is a new `STABLE SECURITY DEFINER` helper:

```sql
-- proposed; composes the existing entitlement predicate, does not replace it
CREATE FUNCTION public.tenant_is_public(tid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.tenants t
     where t.id = tid
       and t.status = 'active'            -- the operator's decision
       and t.published_at is not null     -- the client's INTENT
  ) and public.tenant_has_active_subscription(tid);   -- entitlement
$$;
```

**Checked against the three conditions required:**

| Required | Where it is enforced |
|---|---|
| active subscription | `tenant_has_active_subscription(tid)` — the existing function, unchanged |
| published intent | `tenants.published_at IS NOT NULL` |
| snapshot exists | **structural, not a predicate.** A row-level policy filters rows; if the tenant has no snapshot there is nothing to return. No `EXISTS` check is needed and adding one would be a tautology |

Plus one condition the brief did not list and the model requires: **`tenants.status = 'active'`**, the operator's kill switch, which must gate serving independently of billing.

| | |
|---|---|
| **Who can read** | anyone, for a tenant that is active + published + entitled · the tenant's own admins and platform owners, for their own snapshots at any time, published or not |
| **Who can write** | **nobody.** See §4 |
| **Roles** | `public` — deliberately, because anon must read published portfolios. `is_tenant_admin()` returns false for anon (`auth.uid()` is null), so the admin branch cannot leak to visitors |

### Why a `SECURITY DEFINER` helper rather than inline subqueries

[published-snapshot.md](published-snapshot.md) §6 sketches this policy with
inline `SELECT … FROM tenants` subqueries. That form works only while `tenants`
stays anon-readable, which couples this policy to a table whose grants we may
want to tighten in the same phase — and it makes the policy's correctness depend
on privilege semantics inside policy expressions that should be **verified at
implementation rather than assumed here**.

A definer helper removes the question: it evaluates with its own rights, it
matches the pattern `is_tenant_admin()` / `can_edit_tenant()` /
`tenant_has_active_subscription()` already use, and it composes the entitlement
function rather than reimplementing it. **It introduces no second entitlement
rule.**

> **UNVERIFIED — confirm at P4, do not assume.** The helper is a *proposal*, and
> the reasoning above rests on how Postgres evaluates privileges and RLS inside a
> policy expression versus inside a `SECURITY DEFINER` function. That was not
> tested against this database and must be, before either form is applied:
>
> * that `tenant_is_public()` returns correctly for **anon**, whose `auth.uid()`
>   is null and whose access to `tenants` may by then be narrowed;
> * that it is not defeated by RLS on `tenants` when called from a policy;
> * that `STABLE` is the right volatility for a predicate consulted per row;
> * and that the inline form in [published-snapshot.md](published-snapshot.md) §6
>   genuinely has the coupling this section claims — if it does not, the simpler
>   inline version wins and the helper should be dropped.
>
> Whichever form survives, it must still **compose**
> `tenant_has_active_subscription()` rather than restate it.

### Why it is safe under the staged migration

**Snapshots are readable from the moment the table exists (P4), and nothing
reads them until P5.** That is the point of the split: the pipeline can be
inspected against live pages while every visitor is still served by the legacy
renderer. A wrong policy at P4 is discovered by an operator, not a visitor.

### Two consequences worth stating before this is applied

**Retention exposes two versions, and RLS is the wrong layer to fix that.**
Retention is current + previous (§10.5) and this policy filters by *tenant*, not
by version, so a permitted reader sees both rows. Nothing private is exposed —
both were published. **RLS decides whether rows are visible; the host decides
which one is served**, and public rendering must always take the highest
version. Serving the previous one is a **correctness bug in the host**, not a
policy hole, and tightening RLS in response would be treating the wrong layer.
The rule is recorded in [published-snapshot.md](published-snapshot.md) §6 and
implemented at the `loadPortfolioDoc()` seam.

**The admin branch admits two different kinds of reader, and the difference
matters.** `is_tenant_admin()` includes `is_platform_owner()`:

- **client admins — their own tenant only.** 12 of the 42 memberships, held by 12
  distinct users, at most one tenant each.
- **platform owners — every tenant, deliberately.** The other 30 memberships,
  created by `trg_enroll_platform_owners` on each tenant. **Operator access**, of
  a piece with the access they already have to `profile` and `projects`.

**The rule that still holds without qualification:** another tenant's
unpublished work is never readable by **anon** or by **another client's admin**.
Now stated in full in [published-snapshot.md](published-snapshot.md) §6, which
previously carried only the client half.

### Applied in

**P4**, with the table.

---

## 4. `published_snapshots` — writes

### Current

No policy, because no table.

### Why an ordinary write policy would be insufficient

A snapshot is not a row a client edits; it is the *result* of a promotion that
must be atomic, must re-check authorisation, and must compose the document from
draft rows at a single instant. A write policy would let a client `INSERT` a
document of their own construction — bypassing the content gate, the version
sequence, retention pruning, and `published_at`.

### Proposed

```sql
ALTER TABLE public.published_snapshots ENABLE ROW LEVEL SECURITY;
-- and no INSERT, UPDATE or DELETE policy is created. Deliberately.
```

Every write goes through:

```sql
publish_tenant(tid uuid)   -- SECURITY DEFINER
  1. can_edit_tenant(tid)        else refuse   ← the existing authorisation path
  2. has_public_content(tid)     else refuse   ← re-derived, see below
  3. build doc from draft rows (imageless pieces excluded)
  4. INSERT published_snapshots (version = max+1)
  5. prune version max-1 downward to retention
  6. tenants.published_at = coalesce(published_at, now())   ← first publish only
```

| | |
|---|---|
| **Who can read** | §3 |
| **Who can write** | **nobody, through RLS.** Only `publish_tenant()`, which re-checks `can_edit_tenant()` against the caller's own identity |
| **Roles** | n/a — there is no policy for any role. `service_role` bypasses RLS as always |

This mirrors the billing tables exactly: `subscriptions`, `payments`,
`invoices`, `billing_customers` and `billing_events` all have **SELECT policies
only**, and every write is a function or an edge function. Confirmed in the
refreshed `SCHEMA.sql`. `published_snapshots` follows an established pattern
rather than inventing one.

**`has_public_content()` must be re-derived, not lifted.** The browser mirror in
`lib/profile-content.js` still counts banners, stats, `cta_buttons` and
`custom_fields` — all removed — and counts raw project rows, which no longer
means "has work" now that an imageless piece is excluded from the document. The
SQL version counts only what survives. Recorded in
[published-snapshot.md](published-snapshot.md) §10.2.

### Why it is safe under the staged migration

It adds a capability and removes none. Through P4 nothing calls it in anger; the
internal verification pass promotes every tenant into snapshots that nothing
reads, which is where a wrong document shape is supposed to surface.

### Applied in

**P4**, with the table.

---

## 5. Storage `media` — current exposure, deliberately not redesigned

### Current

```sql
-- policy "Public can view media", role public
SELECT USING (bucket_id = 'media')

-- INSERT / UPDATE / DELETE, role authenticated
WITH CHECK / USING (bucket_id = 'media' AND can_write_media(name))
```

`can_write_media()` rejects `..`, then requires platform owner **or** a
membership whose tenant matches the `t-<tenant_id>/` first path segment **and**
that tenant is entitled.

### Why it is insufficient

**Every object in the bucket is readable by anyone with the URL, published or
not.** An image uploaded to a draft — work the client has not chosen to show —
is served to anyone who has the link. Narrowing §1 and §2 does not fix this:
those policies stop the *URL* being discoverable through the API, not the object
being served once a URL is known.

Live figures from the same read-only pass: **157 objects, 22 under a
`t-<tenant>/` prefix, 135 at flat legacy paths**, newest upload 2026-07-29.

### Proposed

**No policy change is proposed in this document, and that is the decision.**

Narrowing it properly means signed URLs for drafts and public URLs for published
objects — a media-pipeline design, not a policy tweak. It also collides directly
with a decision already taken: the adapter converts a storage `path` to a `src`
**synchronously and purely**
([renderer-migration.md](renderer-migration.md) §1.5). Signing is asynchronous.
If published media ever has to be signed, the signing happens in
`getServerSideProps` — never in the adapter, and never in the renderer — and
that is a change to the host, not to this table.

**Two constraints the snapshot migration adds, which must not be lost:**

1. **Legacy flat paths are permanently excluded from cleanup.** 135 objects
   cannot be attributed to a tenant, so a sweep must never consider them
   deletable. Deleting one is unrecoverable.
2. **Uploads are immutable.** "Replace" writes a *new* object and swaps the
   reference; overwriting a path would silently change what a published page
   shows, which is what staged publishing exists to prevent.

### The exact point where this remains unresolved

> **Draft media is world-readable, the snapshot model does not fix it, and P6
> does not close it.** After P6 the *rows* are private and the *objects* are
> not. Anyone holding an object URL — including one obtained before P6 — can
> still fetch unpublished work.

Recorded as known gap 4 in `supabase/SCHEMA.sql`. It needs an owner and a
decision at the media pipeline, and it must not be described as fixed by the
snapshot migration.

### Applied in

**Not scheduled.** Deliberately outside P0–P7.

---

## 6. Dependencies these policies rest on — unchanged, and why

### `tenants` — reads stay open

```sql
-- policy "Public can read tenants", role public
SELECT USING (true)
```

The resolver needs it before anyone is authenticated: `lib/tenant.js` selects
`id, slug, status` from `tenants`, and `domain` plus the nested tenant from
`tenant_domains`. Anon cannot resolve a host or a slug without it.

**It stays as-is.** [published-snapshot.md](published-snapshot.md) §10.6 says
"narrowed to what the resolver needs", which is a **column-privilege** change
(`REVOKE`/`GRANT` on specific columns), not a row policy — the row set the
resolver needs is "all of them". Today anon can also read `name`,
`handed_over_at` and `created_via`, which are operator state and not needed by
any public page.

Proposed as **optional hardening in P6**, not required by the snapshot model:
restrict anon column access to `id, slug, status, published_at`. Listed here so
it is a decision rather than an oversight.

### `tenant_domains` — reads stay open

Same reason: host resolution happens before authentication.

### Content write policies — unchanged

`profile`, `projects` and `tenant_domains` keep `ALL … can_edit_tenant(tenant_id)`.

Note for the record: this is where the paywall currently sits — at **writing**,
not at publishing — which the locked model wants moved
([publishing-boundary.md](publishing-boundary.md)). **Moving it is out of scope
for this document and for the renderer migration.** Changing `can_edit_tenant()`
would change who may edit, which is a product decision with its own sequencing.

---

## 7. Summary — what changes, and when

| Object | Change | Roles affected | Phase |
|---|---|---|---|
| `profile` SELECT | `USING (true)` → `is_tenant_admin(tenant_id)` | anon loses access | **P6** |
| `projects` SELECT | `USING (true)` → `is_tenant_admin(tenant_id)` | anon loses access | **P6** |
| `published_snapshots` SELECT | new — admins always, public when active + published + entitled | anon gains published only | **P4** |
| `published_snapshots` writes | **no policy**, ever. `publish_tenant()` only | nobody | **P4** |
| `tenant_is_public()` | new definer helper composing existing entitlement | — | **P4** |
| storage `media` | **unchanged.** Exposure documented, unresolved | — | not scheduled |
| `tenants` columns | optional anon column narrowing | anon loses operator state | **P6**, optional |
| content writes | unchanged (`can_edit_tenant`) | — | — |

**The order that matters:** P4 adds, P6 removes. Nothing is taken away from anon
until every public page has stopped depending on it.
