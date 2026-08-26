# The published snapshot — proposed model

**Reviewed and decided. No migration, no code, nothing applied.**
Decisions are in §10; the model above is what they settled on.

Step 1 of the publishing sequence (blueprint §8.5) — **phase P4** in
[renderer-migration.md](renderer-migration.md), the authoritative execution
sequence; see its §5.1 for the full mapping. It answers what "published"
*is*, so that promotion, the public renderer and share images have something
real to build against.

Supersedes the publishing mechanism in
[publishing-model.md](publishing-model.md), which assumed save-is-live.

---

## 0. What the audit found

Read out of `supabase/SCHEMA.sql` and `docs/architecture/database.md`, not
assumed:

| Fact | Consequence for this model |
|---|---|
| `profile` is **one row per tenant**, all content JSONB `{ar, en}` | The draft already lives in one place per tenant |
| `projects` carries `tenant_id` and `display_order` | Ordering is already data, not layout |
| **Public reads are `USING (true)`** on `profile`, `projects`, `tenants` | Today the public reads the **draft tables directly**. This is what the model must end |
| There is **no `published_at`**, and no snapshot of any kind | Nothing to migrate from; this is greenfield |
| Media are **URLs inside JSONB**; bucket `media`; writes gated by `can_write_media` requiring a `t-<tenant_id>` prefix | Media are referenced, not owned, by content rows |
| **135 legacy objects sit at flat paths**, outside any tenant prefix (known gap 2) | Cleanup cannot attribute them to a tenant. §4 |
| `can_edit_tenant()` = owner OR (admin AND entitled) gates every content write | Publishing must reuse it, not invent a new rule |
| `tenant_has_active_subscription()` is anon-callable and gates public rendering | Serving a snapshot must gate on the same rule |

### The finding worth raising on its own

**Today, an unpublished tenant's content is world-readable.** `profile` and
`projects` are `USING (true)` for anon, and `lib/tenant.js` gates *rendering*.
So the page 404s while the row is still fetchable through PostgREST.

That is UI gating standing in for data gating, which the blueprint already
forbids in principle ("hiding a control is not a security boundary"). The
snapshot model is the opportunity to close it, and §6 does.

---

## 1. Source of truth

| | Where it lives | Mutable? |
|---|---|---|
| **Draft** | the existing `profile` + `projects` rows | Yes — the Studio writes them continuously |
| **Published** | a snapshot row, one JSONB document | **No.** Immutable once written |
| **Media** | storage objects | Immutable once uploaded (§4) |

**The draft tables stay exactly as they are.** No new draft schema, no mirrored
"draft" columns. The Studio already writes them, and §8.5's storage note
promised this: *"the editor keeps writing to `profile` and `projects` — those
rows are the draft."*

### What is copied, and what is referenced

**Copied into the document:** every piece of text, every ordering, appearance,
links, the action destination, SEO, footer — the whole rendered shape.

**Referenced, never copied:** media. The document holds a storage **path**, not
bytes. This is the only pointer that leaves the document, and §4 is what makes
it safe.

**Immutable:** the document, entirely. A publish writes a *new* snapshot; it
never edits an existing one. Immutability is what lets the share-image hash key
on a snapshot's content, what makes "the published page cannot change under a
visitor" true rather than intended, and what makes rollback possible at all.

---

## 2. The shape — the renderer's own input

> **The snapshot document *is* what `PortfolioRenderer` already receives.**

The renderer takes a `portfolio` object; the Studio preview already sends
exactly that object across the draft channel. Making the snapshot the same
shape means the public page and the preview consume one structure, which is the
one-renderer rule expressed in data.

```jsonc
{
  "v": 1,                          // document version, for migrations
  "lang": "ar",                    // the portfolio's default language
  "name":      { "ar": "…", "en": "…" },
  "title":     { "ar": "…", "en": "…" },
  "bio":       { "ar": "…", "en": "…" },
  "shortLine": { "ar": "…", "en": "…" },
  "mark":       { "path": "t-<uuid>/mark.png", "w": 512, "h": 512 },
  "appearance": { "accent": "royal", "font": "manrope", "density": "roomy" },
  "action":     { "destination": "…" },
  "links":      [ { "id": "instagram", "label": "Instagram", "url": "…" } ],
  "pieces": [
    {
      "id": 4,                     // the draft projects.id — stable, URL-authoritative
      "name":        { "ar": "…", "en": "…" },
      "description": { "ar": "…", "en": "…" },
      "link": "…",
      "media": [
        { "path": "t-<uuid>/abc123.jpg", "w": 3000, "h": 2000,
          "caption": { "ar": "…", "en": "…" } }
      ]
    }
  ],
  "seo":     { "title": {…}, "description": {…} },
  "favicon": { "path": "t-<uuid>/favicon.png" },
  "footer":  { "ar": "…", "en": "…" }
}
```

> **AMENDED at P1: `w` and `h` are OPTIONAL.** No source for them exists —
> `storage.objects.metadata` carries no dimensions, and Postgres cannot decode
> an image header, so a SQL promotion function cannot populate them. The
> intent below stands; the guarantee does not. See
> [renderer-contracts.md](renderer-contracts.md) §2.5.

**`w` and `h` are stored deliberately.** The layout renders every image at its
natural ratio; carrying the intrinsic dimensions lets the page reserve the right
box before the image loads, which is the difference between a portfolio that
settles and one that jumps. They are also part of a media object's identity for
the share-image hash.

**Fields the current public page has and the new renderer does not yet** — SEO
and footer — are carried anyway. The snapshot is the contract for the eventual
migration, and a snapshot that cannot express the page it replaces would force a
second migration later.

**`mark` and `favicon` are carried, and this is not optional.** `mark` is the
identity photo or brand mark the hierarchy permits above the work
(public-portfolio-hierarchy.md §3, §5); `favicon` is a Keep decision from the
feature review. Both are read from `profile` today — and the moment the draft
tables stop being anon-readable, a host that has to fetch them from `profile`
cannot. **A document that cannot express them would delete two live features at
the security change**, one phase after the per-tenant rollback has been removed.
That is exactly the second migration this section warns about.

`favicon` is carried for the host, not for the renderer: it becomes a `<link>`
in `<head>`, which the renderer may never write. `mark` is portfolio content and
reaches the renderer as identity. **One field, not two** — the draft's
`brand_logo` and `profile_image` collapse into it at promotion, the way the
current public page already resolves them (`brand_logo || profile_image`).

**Deliberately absent:** `banners`, `stats`, `cta_buttons` (plural),
`custom_fields`, `sections`, `top_ticker`. All removed by the feature decisions.
A snapshot that carried them would keep them alive.

---

## 3. Tables

```
tenants                                     (exists)
  └── published_snapshots                   (new)
        tenant_id     uuid   → tenants(id) ON DELETE CASCADE
        version       bigint                monotonic per tenant
        doc           jsonb                 the document above
        published_at  timestamptz           when this snapshot went live
        published_by  uuid   → auth.users   who promoted it
        share_image   text   NULL           storage path; NULL until generated
        PRIMARY KEY (tenant_id, version)

tenants.published_at   timestamptz NULL     (new column) — INTENT
```

**Two things are being tracked, and conflating them is the trap.**

| | Means | Cleared by |
|---|---|---|
| `tenants.published_at` | the client has **chosen** to be public | unpublishing, and nothing else |
| a snapshot row | **what** the public should see | never — a new publish adds a row |

Keeping intent on the tenant is what makes an expiring subscription reversible:
entitlement stops the site being *served*, but nothing clears the intent, so
paying again restores the site with no further action — the behaviour promised
in journey stage 15. **Billing must never write `published_at`** (publishing-model
§7, unchanged).

**`share_image` is nullable on purpose.** It is filled after the snapshot
commits, so a generation failure leaves a valid published snapshot with no card
rather than an unpublished portfolio (§5).

---

## 4. Media — the part that needs a rule, not a convention

A snapshot points at storage paths. Three questions follow.

### How does the snapshot reference media?

By **path**, plus intrinsic dimensions. Not by signed URL (they expire), not by
public URL (it embeds a host that may change), not by copying bytes (a portfolio
of ten images would duplicate on every publish).

### What happens when draft media changes after publishing?

> **Uploads are immutable. "Replace" writes a NEW object and swaps the
> reference; it never overwrites a path.**

This is the rule the whole model rests on, and it is not obvious. The piece
model says replacement happens *in place* — meaning **in place in the client's
list**, keeping order and caption. At the storage layer it must be the
opposite: overwriting the same path would silently change what the published
page shows, which is precisely what staged publishing exists to prevent.

So a replace is: upload `t-<tenant>/<new-id>.jpg` → point the draft at it →
the published snapshot still points at the old object → both exist until
promotion.

### How does cleanup know an object is still referenced?

An object is deletable only when **no draft row and no retained snapshot**
references it:

```
   referenced = paths(draft profile + projects)
              ∪ paths(every retained snapshot doc)
   deletable  = objects under t-<tenant>/ − referenced
```

Extracting paths from a JSONB document is a query, not a service. At this scale
— fourteen tenants — a sweep is cheap, and it runs after publish rather than
during it.

**Legacy flat paths are excluded from cleanup, permanently.** The 135 objects
outside any `t-<tenant>/` prefix cannot be attributed to a tenant, so a sweep
must never consider them deletable. Migrating them is separate work; deleting
one by accident is unrecoverable.

---

## 5. The publish flow

```
  client presses Publish
        │
        ▼
  ┌──────────────────────────────────────────────┐
  │ publish_tenant(tid)      SECURITY DEFINER     │
  │  1. can_edit_tenant(tid)      else refuse     │  ← owner OR (admin AND entitled)
  │  2. hasPublicContent(draft)   else refuse     │  ← nothing to publish
  │  3. build doc from draft rows                 │
  │     — pieces with no media are EXCLUDED       │
  │  4. INSERT published_snapshots (v = max+1)    │
  │  5. tenants.published_at = coalesce(it, now())│  ← first publish only
  └──────────────────────────────────────────────┘
        │  ONE transaction. It either committed or it did not.
        ▼
  the portfolio is live
        │
        ▼  separately, and after the commit
  ┌──────────────────────────────────────────────┐
  │ share image generation      (Edge Function)   │
  │   success → UPDATE snapshot SET share_image   │
  │   failure → leave NULL, log, do not retry     │
  │             into the publish path             │
  └──────────────────────────────────────────────┘
```

**A piece with no images is not published.** The piece content model already
says such a piece is "not reachable and not shown"
(../design/piece-content-model.md §5); **step 3 of the publish flow above** —
not the "step 3" of §10.3, which is a different sequence — is where that becomes
true, by leaving it out of the document.

**It is filtered at promotion and nowhere else.** Not in the adapter, and not in
the renderer — the renderer's imageless-piece branch is a *fixture* affordance
so the persona layouts can be exercised without images, and it must never be
reachable from published data. Filtering at the source means neither of the two
layers downstream needs a rule, and a coloured placeholder box can never reach a
visitor.

**The consequence for §10.2:** a tenant whose pieces all lack images publishes a
document with an empty `pieces` array, so the publish gate cannot count raw
project rows.

**The dotted line is the requirement.** Share-image generation is *after* the
commit and in a different unit of work, so it cannot roll a publish back. A
snapshot with `share_image IS NULL` is a fully valid published portfolio; the
page falls back to the previous card or omits `og:image`
(share-image.md §7).

### Lifecycle states

| State | How it is detected |
|---|---|
| **Never published** | no snapshot row for the tenant |
| **Published, unchanged** | latest snapshot exists, and `diff(draft, doc)` is empty |
| **Draft ahead of published** | latest snapshot exists, and the diff is non-empty |
| **Failed publish** | **not a state.** The transaction either committed or it did not; a failure leaves the previous snapshot serving and the draft untouched |
| **Offline** | published, but entitlement or `tenants.status` stops it being served |

These are the same five the Studio already models in `lib/studio/draft.js`,
which computed them against a `published` object. That object becomes
`snapshot.doc` — the UI does not change.

---

## 6. Multi-tenant safety

**Writes:** no INSERT or UPDATE policy on `published_snapshots` at all. The only
way in is `publish_tenant()`, SECURITY DEFINER, which re-checks
`can_edit_tenant()`. This mirrors the billing tables, which already work this
way.

**Reads:** and here the model does better than today.

```sql
-- proposed, not applied
SELECT USING (
      is_tenant_admin(tenant_id)          -- my own, at any time
   OR (                                   -- or genuinely public:
        (SELECT status FROM tenants t WHERE t.id = tenant_id) = 'active'
    AND (SELECT published_at FROM tenants t WHERE t.id = tenant_id) IS NOT NULL
    AND tenant_has_active_subscription(tenant_id)
      )
)
```

### Who the admin branch actually admits

`is_tenant_admin()` includes `is_platform_owner()`, so "tenant admins" in every
policy in this document means **admins and operators**. Stated precisely, because
the unqualified version of this claim was wrong:

- **A client admin reads their own tenant, and nothing else.** Verified against
  live data: of 42 memberships, 12 are held by 12 distinct client users, **at
  most one tenant each** — and a unique index enforces one self-signup workspace
  per person. Of every other tenant they see only what is already public on the
  open internet.
- **Platform owners retain cross-tenant visibility, deliberately.** The other 30
  memberships belong to the two platform owners, enrolled on every tenant by
  `trg_enroll_platform_owners`. They can read any tenant's snapshots, published
  or not.
- **That is operator access, not client access and not public access.** It is the
  same access owners already have to `profile` and `projects`, and it is what
  makes recovery, verification and rollback possible at all.

**The security rule is unchanged and holds:** another tenant's unpublished work
is never visible to **anon** or to **another client's admin**. Only the tenant's
own people, and the operators, can see it before it is published.

This closes the gap in §0: today a draft-only tenant's `profile` row is
fetchable by anyone. Under this policy an unpublished, unentitled or disabled
tenant's snapshot is readable only by its own admins and the platform owners.

### Which snapshot is served — a host rule, not an RLS rule

Retention keeps the current snapshot **and the previous one** (§8), and the read
policy filters by **tenant**, not by version. So a permitted reader — anon
included — can see both retained rows. Nothing private is exposed: both were
published, and both were public. But it means the two layers answer different
questions, and only one of them answers this one.

| Layer | Decides |
|---|---|
| **RLS** | *whether* a tenant's snapshot rows are visible at all |
| **The host query** | *which* of the visible rows is served |

> **Public rendering must always select the highest version for that tenant.**
> `order by version desc limit 1`, every time, on the portfolio page and on every
> piece page.

**Previous snapshots exist only for operational rollback** — an escape hatch for
an operator, never a client-facing feature, and never something a visitor can
reach by asking for it.

**Serving the previous version is a correctness bug in the host, not an RLS
hole.** No policy change can prevent it, and tightening RLS in response would be
treating the wrong layer: the row is legitimately visible, it is simply the wrong
one to render. The host implementation of this rule lives at the
`loadPortfolioDoc()` seam
([renderer-migration.md](renderer-migration.md) §1.8).

> **The draft tables' `USING (true)` read policies must be narrowed too** —
> moving the public to snapshots achieves nothing if `profile` is still
> world-readable beside it. That narrowing is **phase P6**, after the last tenant
> leaves the legacy renderer; see §10.6, which corrects an earlier claim that it
> happens in the same change as the cutover.

---

## 7. Piece pages

`/{slug}/work/{id}-{name}` resolves with **no extra query**: the snapshot is
already loaded for the portfolio, and the piece is found by `id` within
`doc.pieces`.

- **The id is the draft `projects.id`**, carried into every snapshot, so a URL
  survives renames, re-ordering and republishing.
- The `-{name}` part is ignored for lookup; if it does not match the current
  name, the page **redirects to the canonical spelling** rather than 404ing.
- A piece removed from a later snapshot is genuinely gone from the published
  portfolio, and its page shows the portfolio with a plain line
  (piece-detail.md §3.5) — never a 404 shell.

**Confirmed against the live database (§10.4):** `projects.id` is
`bigint DEFAULT nextval('projects_id_seq')` — one global sequence shared by
every tenant. It is stable, which is what a URL needs, and enumerable, which is
why lookup must happen **inside the tenant's snapshot document** and never as a
global `select … from projects where id = …`.

---

## 8. Rollback and history

**A new publish adds a row. The previous snapshot is not deleted.**

**Retention: the current snapshot plus the previous one.** Older rows are
pruned, and pruning is what releases their media for cleanup.

The reasoning, in both directions:

- **Why keep one** — an operator escape hatch. If a publish goes out wrong, the
  fix is to re-point at the previous version, which takes a moment and needs no
  archaeology.
- **Why not keep many** — retained snapshots pin their media forever. Ten
  versions of a photography portfolio is ten generations of large images that
  can never be deleted, and the client is paying for the storage.
- **Why it is not a feature** — the Studio explicitly refuses version history,
  revisions and diff views (blueprint §8.5). Rollback here is an *operational*
  capability, not a client-facing one. If it ever appears in the interface, that
  is a product decision, not a consequence of this table existing.

**The retained previous version is never served by the public site.** It is
visible to any reader the policy admits, so not serving it is the host's job:
public rendering selects the highest version, always (§6).

**Restoring is a new publish**, not a mutation: it copies the old document into
a new version. Snapshots stay immutable, and the history stays honest about
when each thing went live.

---

## 9. Evidence from the live database

Queried directly, not inferred. This is the ground the decisions in §10 stand
on.

| | |
|---|---|
| Tenants | **15** total, **11** active |
| Profiles | **15** |
| Tenants with any work at all | **2** |
| Projects | **9**, ids `3 … 27` — sparse, one shared sequence |
| `projects.id` | `bigint DEFAULT nextval('projects_id_seq')` |
| `projects.title / description / full_description` | **jsonb** — already bilingual |
| `projects.cover_image` | populated on **9 / 9** |
| `projects.images` (jsonb array) | populated on **8 / 9**, up to **4** per project |
| `projects.client / year / role` | exist, and are **empty on every row** |

**Two of these change decisions.**

`projects.images` **already exists and already holds up to four images per
project.** The multi-image piece model is not a new capability; it is exposing
one the database has carried all along. The ten-image ceiling is comfortable.

`client`, `year` and `role` are **undocumented columns** — absent from
`SCHEMA.sql` — and empty on every row. Nothing renders them and nothing writes
them.

### What the renderer swap will actually cost

| Feature being removed | Tenants using it |
|---|---|
| Call-to-action buttons (a list) | **4** |
| Stats | **3** |
| Banners | **2** |
| Top ticker | **2** |
| Custom fields | **0** |
| Custom links | 4 — *kept* |

The blast radius is small and enumerable, which makes a hand-checked migration
realistic rather than aspirational. Custom fields cost nothing at all: the
feature is unused.

---

## 10. Decisions

### 10.1 Promotion happens in the database — **A**, with B around it

**The snapshot is composed and inserted by one `SECURITY DEFINER` Postgres
function, in one transaction.**

- **Atomicity is free and exact.** A function runs against a single MVCC
  snapshot, so the document is the draft *at one instant* by construction. An
  Edge Function reading `profile`, then `projects`, then writing has a window in
  which the draft can change — and "publish represents one moment" is a stated
  requirement, not a nicety.
- **The authorisation rule already exists in SQL.** `can_edit_tenant()` gates
  every content write today. Reusing it is safer than an Edge Function
  re-implementing the check against its own JWT — a pattern this codebase has
  already had to get right three times, and got wrong once.
- **It matches the existing shape.** The billing tables have no write policies
  at all; every write is a function. `published_snapshots` follows that.

**Rejected: Edge Function orchestration of the promotion itself.** Its stated
advantage is testability, and here that is partly illusory — the repo has no
database test harness, and its tests cover *pure* `lib/` modules. An Edge
Function talking to Supabase is no more unit-testable than SQL is, and the last
time a test double was more capable than the thing it replaced, it hid a real
bug through 458 passing tests.

**But the orchestration around it is B.** Publishing also has to trigger share
image generation, which is not SQL. So: the client calls an Edge Function; the
function calls the RPC (atomic promotion); the function then fires generation
after the commit. Atomic where it must be, orchestrated where SQL cannot reach.

### 10.2 `hasPublicContent` becomes database-owned — and is a *publish* gate, not a read gate

**A `SECURITY DEFINER` function, called by the publish function.** The browser
mirror in `lib/profile-content.js` stays, for deciding whether to offer the
Publish action.

The important refinement: **it is not consulted when serving.** Because publish
refuses without public content, *a snapshot existing already implies content*.
Reads gate on tenant status, intent and entitlement (§6) and never re-derive
completeness.

That shrinks the mirroring cost to the smallest version of a problem this
codebase has already solved once: `tenant_has_active_subscription()` in SQL,
`lib/billing-status.js` in the browser, **the database authoritative where they
disagree.** Same pattern, same rule.

**Rejected: application-only.** The RPC is callable directly; a check that lives
only in the browser is not a check.

#### It must be re-derived before it becomes the gate

`lib/profile-content.js` today counts **banners, stats, `cta_buttons` and
`custom_fields`** as public content. All four are removed by the feature
decisions. It also counts `projectCount > 0`, which under the piece model is no
longer the same question as "is there work" — a piece with no images is not
shown, and §5 excludes it from the document.

Left as it is, the gate would accept two portfolios that render as nothing:

| Tenant state | Old gate | Reality after migration |
|---|---|---|
| Content is only stats or CTA buttons | passes | an empty page |
| Projects exist, none has an image | passes | an empty work section |

**That is the exact failure this function was written to prevent** — the
nameless "?" card that designakum.site once served. So the rule for the SQL
version and its browser mirror is: **count only what survives** — name, title,
bio, credibility line, `mark`, links, the action destination, and **pieces that
have at least one image**. Re-deriving it is part of freezing the document
shape, not a follow-up.

### 10.3 Existing tenants — backfill, but **at** the renderer swap

> **Step 3 is not a data change. It is the renderer migration.**

> **Numbering note.** The "steps" in this section are this document's own, and
> they predate the phased plan. **Step 3 is phase P5**, not P3, in
> [renderer-migration.md](renderer-migration.md) — which is the authoritative
> execution sequence, and whose §5.1 maps every number in this document to a
> phase. Steps 1–2 are P4; the draft RLS closure in §10.6 is P6.

This is the review's most consequential finding. The snapshot deliberately does
not carry banners, stats, CTA lists or the ticker. So the public page **cannot**
be moved onto snapshot reads while it still renders those things: the moment it
reads a snapshot, four tenants lose their calls to action, three lose stats and
two lose banners.

Therefore:

1. **Steps 1–2 ship without touching public reads.** Snapshots are created and
   written on publish; nothing public consumes them. This is safe, reversible
   and observable — snapshots can be inspected against live pages before
   anything depends on them.
2. **Step 3 happens when `PortfolioRenderer` is approved as the public
   renderer** (blueprint §8.2a) — the data flip and the renderer swap are one
   event, per tenant.
3. **Backfill is a publish**, not a special path: for each tenant, run the same
   promotion function. No second code path means no second set of bugs.

**Rejected: B, snapshot reads for new tenants only.** Two renderers and two read
paths, permanently — the exact thing "one renderer" exists to prevent.

**Rejected: C, a compatibility layer carrying legacy fields.** It keeps removed
features alive in the data model and makes their removal a later migration
instead of this one. A snapshot that can express a ticker will eventually render
one.

### 10.4 `projects.id` — use it directly

`bigint`, one sequence shared by all tenants. **Stable, which is what a URL
needs**; ids never change, so a shared link survives renaming, reordering and
republishing.

Enumerable, which is fine **because lookup is scoped to the document**: a piece
is found in `doc.pieces`, so an id belonging to another tenant is simply not
there. The rule that makes this safe is worth stating as a rule:

> **Never resolve a piece with a global `select … from projects where id = …`.**
> Load the tenant's snapshot, then find the piece inside it.

A global lookup would render one tenant's work under another tenant's slug —
the same family as the singleton-tenant bug that once served a client's site to
strangers.

**Rejected: introducing a public-facing uuid or slug for pieces.** It adds a
column, a uniqueness constraint and a second identity to keep in step, to hide
integers that are already public information once the work is published.

### 10.5 Retention: current + one previous, pruned at publish

**In the database model, as rows.** Pruning happens inside the publish
transaction: inserting version *n* deletes version *n − 2*.

- **Deterministic, and no scheduler.** Retention is a property of publishing
  rather than a job that can fail silently or drift.
- **Media lifetime is the reason for the number.** Every retained snapshot pins
  its media (§4). Current + 1 means at most two generations of images survive
  per tenant; ten versions of a photography portfolio would be ten generations
  nobody can delete, on storage the client pays for.
- **Not a client-facing feature.** The Studio refuses version history
  (blueprint §8.5). This is an operator escape hatch, and restoring is a *new
  publish* that copies the old document forward.

### 10.6 The RLS changes

| Object | Who reads | Who writes |
|---|---|---|
| `profile`, `projects` (**drafts**) | `is_tenant_admin(tenant_id)` — **anon loses access** | `can_edit_tenant(tenant_id)`, unchanged |
| `published_snapshots` | `is_tenant_admin(tenant_id)` **OR** (tenant active **AND** `published_at IS NOT NULL` **AND** entitled) | **nobody.** No policy; only the publish function |
| `tenants` | narrowed to what the resolver needs | `is_platform_owner()`, unchanged |
| storage `media` | unchanged for now — see the blocker below | `can_write_media(name)`, unchanged |

**The draft read change is the security fix**, and it can only land once the
public page has stopped reading `profile` and `projects`. Doing it earlier
breaks every live site; doing it later leaves unpublished work world-readable.

> **AMENDED. This section originally said the draft read change and the renderer
> swap were "one change". They are not, and the staged sequence in
> [renderer-migration.md](renderer-migration.md) is authoritative.**

Cutover is **per tenant**, selected by `tenants.public_renderer` so that a
rollback is one row update rather than a deploy. That makes a single atomic flip
impossible: every tenant still on the legacy renderer needs the anon read to
keep working, so the policies can only narrow **once, after the last tenant has
cut over** — phase P6.

The cost is stated plainly rather than hidden: **the cutover window is the
exposure window**, and the gap this fix closes stays open for its duration. That
is accepted deliberately, because a staged migration with per-tenant rollback is
worth more here than atomicity — but it is what makes P6 a dated phase rather
than cleanup, and it is why the last tenant should be sequenced deliberately
instead of being whoever is left.

---

## 11. Blockers before schema design

**1 — The renderer swap is a visible change to live client sites.** Four
tenants lose a list of calls to action, three lose stats, two lose banners, two
lose a ticker. That is a product decision already taken (feature decisions), but
it has not been decided *how it reaches those clients*: announced, staged per
tenant, or accompanied by someone moving the content into the fields that
survive. Nothing should ship on step 3 — **phase P5** — until that is answered.

**2 — Unpublished media stays publicly readable.** The `media` bucket is
`USING (bucket_id = 'media')` for anon, so an image uploaded to a draft is
fetchable by anyone holding the URL, published or not. The snapshot model does
not fix this, and narrowing it properly means signed URLs for drafts and public
URLs for published objects — a media-pipeline design, not a snapshot one. It
should be **recorded as a known limitation now** and solved with the media
pipeline, not silently carried.

**3 — `SCHEMA.sql` drift.** It is already two migrations behind (billing,
signup), and this review found three more undocumented columns
(`client`, `year`, `role`). Anyone designing the schema from it will be working
from a partial picture. It should be refreshed from the live database **before**
snapshot DDL is written, not after.

---

## 12. Still open

**Document version (`v`) policy.** Whether a shape change migrates old snapshots
or teaches the renderer to read `v1` and `v2`. It decides whether old snapshots
stay readable forever, and it does not need answering until the second version
exists — but the field must be present from the first, which it is.

**Legacy flat-path media.** 135 objects outside any tenant prefix, permanently
excluded from cleanup (§4). Migrating them is separate work, and it is worth
scheduling before the media pipeline rather than after.
