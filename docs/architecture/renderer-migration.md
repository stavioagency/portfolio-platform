# The renderer migration — plan

**Decided. Nothing is built, no schema is applied, and no public page has
changed.** This is the sequence by which `PortfolioRenderer` becomes the only
portfolio renderer and `pages/index.js` stops being one.

Follows the audit of the current state, and depends on three documents that are
already decided and are not reopened here:

- [published-snapshot.md](published-snapshot.md) — what "published" is
- [../design/public-portfolio-hierarchy.md](../design/public-portfolio-hierarchy.md) — what leads
- [../design/piece-content-model.md](../design/piece-content-model.md) — what a piece is

Blueprint §8.2a is the rule this plan executes: *"one renderer means one final
shipped renderer, not premature extraction of a legacy implementation."* This
document is how the two implementations finally converge.

> **This document is the authoritative execution sequence.** Three documents
> describe this migration and two of them number it differently — the snapshot
> model in "steps 1–3", the share image in "steps 1–4". Those numbers are
> **not** the phase numbers here, and the mapping is in §5.1. Where any
> document's sequencing disagrees with the phases below, the phases win.

---

## 0. Where this starts

`pages/index.js` is 1548 lines and does five jobs at once: it resolves a tenant,
reads the **draft tables directly**, applies appearance tokens to
`document.documentElement`, injects a favicon, owns language persistence and
analytics, and renders a portfolio — client-side, in `useEffect`.

`components/portfolio/PortfolioRenderer.js` is 456 lines and does one job,
purely, from props. It is complete for identity, the work layout, the
introduction, the credibility line, the single next step, appearance and RTL. It
is missing functional links, a footer, the real `media[]` model, intrinsic
dimensions, piece descriptions, piece links, identity media — and it has never
rendered a real tenant's row.

The destination:

```
   host page                              PortfolioRenderer
   ─────────────────────────────          ────────────────────────────
   resolves the tenant                    receives portfolio props
   reads the published snapshot           renders the portfolio
   owns SEO, OG, favicon, analytics,      and nothing else
   language, and page states
```

---

## 1. The decisions

Settled before any phase begins. Everything after §1 is reasoning and sequence.

### 1.1 The renderer stays pure — four prohibitions, restated

They already hold, and every decision below is shaped to keep them holding.

| The renderer has no… | Which means it never… |
|---|---|
| **routing knowledge** | builds a URL, knows a slug, or reads a router |
| **storage knowledge** | knows a bucket, a host, or how a path becomes a URL |
| **tenant knowledge** | knows whose portfolio it is, or whether it is live |
| **document effects** | writes `document`, storage, or the network |

`tests/portfolio-renderer-contract.test.mjs` enforces this and is widened in
§1.3 to cover the whole renderer directory rather than one file.

### 1.2 The adapter boundary

> **The stored snapshot document and the renderer's props are not the same
> object. One pure function converts one into the other, and it is the only
> place that knows about routes, storage or environment.**

```
   snapshot document  →  adapter  →  renderer props  →  shared components
     (stored, immutable)   pure       (portfolio, lang,     (WorkGrid,
                          lib/         dir, appearance)      NextStep, Footer)
```

`lib/portfolio-view.js`. It takes no Supabase client, performs no I/O, and is
unit-testable with `node --test` like every other pure module in `lib/`. Both
hosts call it: the public page with a snapshot, the Studio preview with a draft.

**Why one boundary rather than three fixes.** Piece hrefs, media URLs and
identity media are the same problem wearing three coats — the renderer needs
something derived from context it may not have. Solved separately, each one
opens its own smuggling route into the component. Solved once, the renderer's
prop surface stays closed and the knowledge lives somewhere testable.

**Rejected: passing `slug` (or `baseUrl`, or `bucket`) to the renderer.** None
of those names appears on the contract test's denylist, which is exactly why
they are dangerous — they read as ordinary props and are the same breach as
`tenantId`. They are also wrong in both hosts at once: the Studio preview has no
slug and no route to send a visitor to.

### 1.3 `PieceRenderer` belongs to the same renderer system

> **A piece page is not a second implementation of the portfolio. It is the
> same components, composed differently.**

Read what a piece page contains ([piece-detail.md](../design/piece-detail.md)
§3.2): a back link, the piece's name and description, its images, its own link,
**the portfolio's next step**, **the rest of the work as the same grid**, and the
footer. Three of those already live inside `PortfolioRenderer`, and two of them
must be identical across both pages or the product has two portfolios.

```
   components/portfolio/
     ├── PortfolioRenderer.js   Identity · WorkGrid · Intro · NextStep · Links · Footer
     ├── PieceRenderer.js       BackLink · piece body · NextStep · WorkGrid · Footer
     ├── WorkGrid.js            the band, natural ratios, lead treatment — ONE copy
     ├── NextStep.js            one destination, product-owned label — ONE copy
     └── Footer.js              the client's line, plus a slot the host fills
```

**The shared components are extracted before `PieceRenderer` exists**, not
during it. Building the piece page first and factoring afterwards is how the
grid acquires a second copy that drifts — invisibly, until someone puts two
pages side by side.

**The contract becomes a rule about the directory, not about one file.** Every
file in `components/portfolio/` obeys §1.1 and exposes a closed prop set.
Written that way, a new renderer cannot opt out of the rules by being new.

**One consequence, accepted deliberately:** `WorkGrid` on a piece page renders
*the rest* of the work — the current piece excluded, and no lead emphasis. That
is a prop, not a second grid.

### 1.4 Piece URLs — resolved by the adapter, never built by the renderer

Each piece arrives with `href` already built. The renderer wraps the figure in
an anchor when one is present and renders a bare figure when it is not — the
same content-decides-presence rule the rest of the component runs on.

**The readable part of the URL is derived, never stored.** Only the id is
authoritative ([piece-detail.md](../design/piece-detail.md) §3.1); the name part
may change freely, so freezing it into the snapshot would guarantee it goes
stale.

**The Studio supplies hrefs too**, so the markup, focus order and hover
behaviour are identical to production — which is the entire reason the renderer
is shared. Its host calls `preventDefault` in the click delegation it already
has.

### 1.5 Media — two conversions, in opposite directions

**Reading (adapter): `path → src`.** A pure string operation against a
configured base. No storage client, no async, no fetch in the render path.
Intrinsic `w`/`h` pass straight through so the box can be reserved before the
image loads.

This is only synchronous while published media is served from a public bucket.
**If the media-privacy work ever concludes that published media must be signed,
signing happens in `getServerSideProps` — never in the adapter, and never in the
renderer.**

**Writing (promotion RPC): `URL → path`. And this one is a real migration
problem, not a formality.**

Every media field in the live database holds a **full public URL**, not a path.
`pages/admin.js` uploads and immediately stores `getPublicUrl(...).publicUrl`
for `cover_image`, `images[]`, `profile_image`, `brand_logo`, `favicon_url` and
`seo.og_image`. The snapshot document specifies `path`. Something has to
normalise, and it is the promotion function.

**It applies to every path the document carries**, not only to piece media:
`media[]`, `mark` (from `brand_logo || profile_image`) and `favicon`. Only
`seo.og_image` is exempt, because it is not carried at all — the custom
social-image field is removed (§1.12).

| Case | Behaviour |
|---|---|
| URL parses into a `t-<uuid>/…` path | Normal. Store the path |
| URL parses into a **flat legacy path** (the 135 objects outside any tenant prefix) | Store it. It renders correctly, and it stays permanently excluded from cleanup — see [published-snapshot.md](published-snapshot.md) §4 |
| URL does not parse at all | **Fail the publish, loudly.** |

The failure mode is the decision that matters. Storing a null and continuing
produces a published portfolio with missing images — a silent, visitor-facing
defect discovered by the client. A refused publish is a message to an operator
who can fix it. Publishing is already all-or-nothing by design; this keeps it
that way.

### 1.6 Identity media — three things, two destinations

| | Where | Why |
|---|---|---|
| **Favicon** | **Carried in the snapshot, consumed by the host only** | It is a `<link>` in `<head>`. §1.1 forbids document effects, and a favicon means nothing inside a component that may render in an iframe — but it must be **in the document**, or it dies at P6 when the host loses its draft read ([published-snapshot.md](published-snapshot.md) §2) |
| **Profile photo / brand mark** | **Renderer**, as one `mark` field | Portfolio content. The hierarchy permits "a small photo or mark" in identity |
| **OG / share image** | **Host only** | Metadata, same reasoning as the favicon |

**Photo and logo collapse into one field.** The current page already does this
in effect (`brand_logo || profile_image`), and asking a client to choose which
slot their image belongs in is a decision the product should make for them. A
photographer uploads a face, a studio uploads a mark, and neither is asked.

**The identity-height rule becomes load-bearing the moment `mark` exists** —
hierarchy §5 requires the identity block to be no taller than the first row of
work, and that is currently asserted in CSS commentary with no test behind it.
It gets one.

### 1.7 The host is server-rendered

`getServerSideProps`, anon key, RLS enforced server-side.

**Not a preference — a defect being fixed.** Today's page fetches in
`useEffect`, so its `<Head>` — including every OG tag — is populated after
hydration. Link unfurlers do not run JS. **Share previews are already unreliable
and nobody has noticed**, because nothing yet depends on them. The share-image
work in P7 does, and would silently produce nothing.

### 1.8 `loadPortfolioDoc()` — the seam that makes the switch survivable

The host loads its document through **one function with two implementations over
the life of this migration**:

```
   P3   loadPortfolioDoc(tenant)  →  composed from profile + projects  (draft)
   P5   loadPortfolioDoc(tenant)  →  the tenant's latest snapshot      (published)
   P6   the draft implementation is deleted
```

**The snapshot implementation carries one rule that cannot be delegated to RLS:
it must select the HIGHEST version for the tenant.** Retention keeps the current
snapshot and the previous one, and the read policy filters by tenant rather than
by version — so both are legitimately visible and choosing between them is the
host's job. `order by version desc limit 1`, on the portfolio page and on every
piece page. Serving the previous version is a correctness bug here, not a policy
gap ([published-snapshot.md](published-snapshot.md) §6).

Switching a tenant from draft reads to snapshot reads is then a change of data
source behind a stable seam — not a rewrite of the host, and not a rewrite of
anything the renderer touches. It also means the new host can be built and
exercised on real tenant data **before any snapshot infrastructure exists**,
which is where most of the risk in this plan is retired.

### 1.9 Cutover is per tenant, and reversible in one row

`tenants.public_renderer` — `'legacy' | 'v2'`, default `'legacy'`. The host
reads it and chooses.

Rollback is a single row update: immediate, per tenant, no deploy and no revert.
It is **scaffolding with a scheduled death** — deleted in P6, in the same change
that removes the legacy path it selects between.

### 1.10 Existing tenants get snapshots at their own cutover

> **Generated by an operator running the same promotion function, per tenant, at
> the moment that tenant switches. Not a bulk job, and not "after the client's
> first publish."**

- **Waiting for the client is unsafe.** These are live, paid sites. An owner who
  does not log in for a month would go dark — or would have to keep being served
  from draft tables, which means P6 never lands.
- **A bulk backfill is untimely.** Snapshots created at a moment unrelated to
  when each page starts reading them can disagree for days.
- **Per tenant, using the real RPC, means one code path.** No special backfill
  logic, therefore no second set of bugs. §10.3 of the snapshot model already
  frames backfill as a publish; this only fixes *when* it runs.

### 1.11 Share images never block publishing

Generation happens **after** the publish transaction commits, in a different
unit of work. `share_image` stays nullable, and a generation failure leaves a
fully valid published portfolio with no card rather than an unpublished
portfolio. This is [published-snapshot.md](published-snapshot.md) §5 unchanged,
restated because P7 sits after the cutovers and the temptation to fold it
forward will be real.

### 1.12 The interim `og:image` policy

Tenants cut over in P5; share images arrive in P7. For that window, and decided
now rather than discovered then:

```
   pieces[0].media[0]   the first published image, used directly
   else                 omit og:image entirely
```

**That is the whole policy. There is no third branch.**

**Why the first piece's first image.** It is the same *content* the generated
card will use — [../design/share-image.md](../design/share-image.md) §4 names
`pieces[0].media[0]` as the default source — so the interim preview is correct
and only uncomposed. When P7 lands, the image stops being raw and starts being
contained on the surface colour; nothing about which image it is changes.

**Why not `seo.og_image`.** It was in an earlier draft of this section and it is
wrong. `share-image.md` §5 is explicit: *"There is no banner, no separate upload,
and no custom social-image field."* The moment a client can supply an image that
appears nowhere on their portfolio, the product has a banner again — one nobody
reviews, that represents them everywhere they are shared. The field is also
absent from the snapshot document, so it would not survive the cutover it was
meant to cover. `pages/admin.js` still writes it; that is legacy, and it dies
with the legacy page.

**Why not `mark` either.** An identity photo is not the client's work. Falling
back to it would send a portrait as the preview of a portfolio, which
misrepresents what is behind the link — and `share-image.md` §4 handles the
no-work case as a typeset identity card, which does not exist until P7.

**Never a placeholder, never a gradient, never a platform-branded card.** An
omitted tag renders a plain text preview, which is a smaller loss than a wrong
image — the same trade `share-image.md` §7 already makes when generation fails.

### 1.13 The language switcher is host chrome

Nothing rendered it before, and both P2 and P3 could be completed without it
existing — which is how a visible control goes missing.

> **The host renders it. The renderer never does.**

It reads and writes a stored preference and it changes the language of a
document — storage and document effects, both forbidden by §1.1. It is also the
one control that must work when the portfolio is empty, and a renderer that
returns nothing for an empty portfolio cannot carry it.

This does not contradict hierarchy §5, which permits it above the work: it is
*"minimal chrome"* there, explicitly distinguished from anything that competes,
and above-the-work is measured in weight rather than in pixels. The host owning
it is what keeps it quiet — it is not part of the composition the client is
previewing.

**Its position stays compositional and undecided** (hierarchy §7), constrained
by §4 (quiet) and §5 (permitted above). What is decided here is only who owns
it, so that neither phase assumes the other did it.

### 1.14 P6 is a phase, not cleanup

Narrowing the draft tables' read policies is **the security fix this whole
migration exists to make possible**, and it is the phase most likely to slip
because it lands after everything visible is done.

Today `profile` and `projects` are `USING (true)` for anon: an unpublished
tenant's content is world-readable, and `lib/tenant.js` gates only *rendering*.
That is UI standing in for a data boundary. It cannot be fixed before the public
pages stop reading those tables, and it must not be left unfixed after they do.

**It gets a date, not a backlog slot.**

---

## 2. The phases

### P0 — Security, documentation, tenant communication

*No renderer work. Nothing is applied.*

| | |
|---|---|
| **Entry** | none |
| **Exit** | `SCHEMA.sql` regenerated from the live database and its drift recorded · target RLS policies written and reviewed, **not applied** · media-bucket exposure recorded as a known limitation with a named owner · four tenant conversations complete, each with a written note of what replaces what |

**0.1 — Refresh `supabase/SCHEMA.sql`.** It is behind by the billing and signup
migrations, and the audit found three columns absent from it entirely
(`projects.client`, `.year`, `.role`). Anyone designing snapshot DDL from it is
working from a partial picture.

**0.2 — Draft security: write it now, apply it in P6.** Narrowing the draft
tables breaks every live site until its host reads snapshots instead. The media
bucket (`USING (bucket_id = 'media')` for anon, so draft uploads are fetchable
by anyone with the URL) cannot be fixed without the media pipeline. Both are
recorded and owned here; neither is applied here.

**0.3 — The four conversations.** Eleven active tenants; the losses are
enumerable, which is what makes this a handful of conversations rather than a
migration programme:

| Feature | Tenants affected |
|---|---|
| CTA lists | 4 |
| Stats | 3 |
| Banners | 2 |
| Ticker | 2 |
| Custom fields | 0 |

Not a broadcast and not a changelog. A person looks at each live page first and
arrives with what replaces what already prepared. **This gates P5 only** —
everything through P4 proceeds regardless, and should.

### P1 — Freeze the renderer contracts

*Design and pure modules. Nothing public changes.*

| | |
|---|---|
| **Entry** | P0.1 complete (the shape is designed against a true schema) |
| **Exit** | `lib/portfolio-view.js` contract and tests exist · the snapshot document shape is frozen and written down · URL→path normalisation specified including its failure behaviour · the directory-wide renderer contract is written · a **real-tenant fixture** is committed and asserted against |

Decisions closed here: §1.2 adapter boundary · §1.3 `PieceRenderer` and the
shared components · §1.4 piece hrefs · §1.5 both media conversions · §1.6
identity media · §1.7 SSR · and the `shortLine` / *credibility line* naming
question, which becomes a data migration the moment the first snapshot exists.

**On the fixture.** It is captured from a real tenant's rows and normalised into
the frozen shape. It proves **shape** — that real data survives the mapping. It
cannot prove **behaviour**: real Arabic at real lengths, real image proportions
and real load timing are runtime properties a JSON file does not exercise. It is
the cheaper half of the answer, and P3 supplies the other half.

### P2 — Build the renderer surface

| | |
|---|---|
| **Entry** | P1 exit |
| **Exit** | every acceptance criterion in hierarchy §6 passes against the fixture, in both languages, including the identity-height rule · `PieceRenderer` renders a piece page from the fixture · **the Studio can preview a piece page** · the directory contract test passes over every file |

Order within the phase, cheapest and least contentious first:

```
   links → footer → media[] → dimensions → descriptions
         → WorkGrid / NextStep / Footer extraction
         → piece hrefs → mark → PieceRenderer
```

**Links first**, because they are the one place the renderer currently looks
finished and is not: the list is filtered on `url` and the url is then never
used, so the section renders labels that do nothing. Anchors, `safeUrl` at
render, `BrandGlyph` from the existing `lib/brand-icons.js`.

**`media[]` replaces `cover` rather than joining it.** The locked piece model
has no cover field — the cover *is* the first image, because ordering already
expresses it. `mock-portfolio.js` moves to the new shape in the same change, or
the Studio silently regresses.

**`ratio` and `tone` leave the production path.** They exist so fixtures without
images can exercise the layout; once `media[]` carries `w`/`h`, nothing real
depends on them. **They are never reachable from published data** — an imageless
piece is excluded at promotion ([published-snapshot.md](published-snapshot.md)
§5), so a placeholder box cannot reach a visitor.

**The Studio must be able to preview a piece page.** `piece-detail.md` §4 states
the reason plainly: a piece page is a whole page of the client's portfolio, and
if the Studio can only ever show the main page, they will publish something they
have never seen.

It is not free, and it is why this sits in P2 rather than being assumed. The
preview host intercepts every click to open an editor panel — a visitor's click
navigates, a client's click edits, and that divergence is deliberate and already
built. So previewing the piece *page* needs its own affordance rather than
falling out of clicking: the piece panel gains a quiet "see this piece as a
visitor" that switches the preview to that piece. The shape is sketched in
`piece-detail.md` §4 and is not yet designed.

### P3 — Extract the public host

| | |
|---|---|
| **Entry** | P2 exit |
| **Exit** | the new host serves real tenant data through the adapter, behind the flag, with **every tenant still on `legacy`** · no visitor-facing page has changed · `tenants.public_renderer` exists |

Extraction order, chosen so each step leaves the live site working and is
independently revertable:

1. **Page states** — skeleton, 404, not-set-up. Self-contained, no data
   dependency, and they give the new host a working shell to grow into.
2. **`<Head>` / meta** — into a pure builder taking
   `{ seo, name, title, mark, shareImage, canonical }`. Still fed from `profile`
   at this stage.
3. **Favicon**, as a host effect. **The appearance-token effect is deleted, not
   moved** — named appearance is scoped inside the renderer and this global
   write to `document.documentElement` has no successor.
4. **Language ownership** — `readLang`, `isPreviewContext`, persistence. The
   fiddliest code in the file, and already the site of one real bug where the
   persist effect clobbered the stored preference. **Move it intact. Do not
   rewrite it during the move.**
5. **Analytics** — `page_view` stays a host effect; `link_click` and
   `project_view` become `data-field` delegation, the pattern
   `pages/studio/preview.js` already demonstrates. Decide the event mapping
   here: with piece pages existing, `project_view` is arguably a `page_view` on
   the piece route, and double-counting corrupts the one number clients want.
6. **The SSR host page**, reading through `loadPortfolioDoc()` (§1.8) in its
   draft-composed form.
7. **`pages/[slug].js`**, which imports `Home` today and changes with the host,
   not after it.
8. **The piece route** — `/{slug}/work/{id}-{name}`, a second host over the same
   `loadPortfolioDoc()` seam and the same adapter, rendering `PieceRenderer`.
9. **`tenants.public_renderer`** (§1.9).

**The piece route carries three rules that are easy to omit and hard to notice**
— all three are decided in [../design/piece-detail.md](../design/piece-detail.md)
and none of them lives in the renderer:

| Rule | Behaviour | Source |
|---|---|---|
| **Canonical redirect** | Only the id resolves. A stale or absent name part redirects to the current spelling rather than 404ing, so a link already sent survives a rename | §3.1 |
| **Deleted piece** | The portfolio, with a plain line saying the piece is no longer there. **Never a 404 shell** | §3.5 |
| **`noindex` on an unnamed piece** | It still resolves — a link already sent must not break — but it is not offered to search. A page with an id for a title is a thin page | §3.4 |

**Lookup is inside the document, never a global query.** The piece is found in
`doc.pieces` after the tenant's document is loaded. A
`select … from projects where id = …` would render one tenant's work under
another tenant's slug — the same family as the singleton-tenant bug
([published-snapshot.md](published-snapshot.md) §10.4).

Per-piece meta (`og:title`, `og:description`, `og:image` from that piece's own
first image) is specified in [../design/share-image.md](../design/share-image.md)
§3 and follows the interim policy in §1.12 until P7.

**Step 8 is deliberately in this phase, not P2.** P2 builds the piece *renderer*;
routing, redirects and `noindex` are host concerns, and putting them here keeps
every routing decision in one phase with the rest of the host.

**Step 6 is the cheapest large risk reduction in the plan.** The audit's
sharpest finding is that the renderer has only ever seen fixtures. Feeding it
real rows on a route nobody is served converts the plan's central unknown into a
small one, before any database change is at stake.

### P4 — Snapshot infrastructure

| | |
|---|---|
| **Entry** | P1 exit (the document shape is frozen) |
| **Exit** | `published_snapshots` exists with **no write policies** · `publish_tenant()` promotes atomically · the read policy is applied · **every tenant has been promoted into a snapshot that nothing reads, and each document diffed against what its live page renders today** |

Per [published-snapshot.md](published-snapshot.md) §5 and §10, unchanged:
promotion is one `SECURITY DEFINER` transaction that re-checks
`can_edit_tenant()`, refuses without public content, inserts at `max+1`, prunes
`n−2`, and sets `tenants.published_at` on first publish only. Writes reach the
table through that function and nowhere else.

**Internal verification is a deliverable, not a habit.** Promote everyone,
serve nobody, then diff. Missing media, failed URL→path conversions and empty
required fields all surface here — on production data, with zero visitor impact,
and before a single page depends on it. **A tenant whose document does not
reconcile does not proceed to P5.**

Share-image generation is explicitly out of this phase (§1.11).

### P5 — Tenant migration

| | |
|---|---|
| **Entry** | P0.3 complete · P3 exit · P4 exit, including the reconciliation |
| **Exit** | every tenant on `v2`, each verified against a screenshot taken before its cutover |

Per tenant, in this order:

```
   review  →  promote  →  flip the flag  →  verify
```

**The review is editorial and is done by a person.** Two transformations are
genuinely lossy:

| From | To | Tenants |
|---|---|---|
| `cta_buttons[]` | `action.destination` | 4 |
| `appearance.{tokens, accent_color, font_*, radius}` | `{accent, font, density}` | up to 11 |

**No migration UI.** Four tenants does not justify building an interface, and an
automatic choice is wrong because *which of five buttons is the next step* is a
question about the client's business. Instead: a proposal generated by rule,
shown beside a screenshot of the live page, confirmed or overridden one tenant
at a time.

Proposed CTA rule, in order — a `mailto:`/email destination wins; otherwise the
first button with an `href`; `action: 'open_projects'` buttons are discarded
outright, because the work is now the page. Appearance is mapped to the nearest
of four accent names **by eye**: with eleven tenants a person looking is both
cheaper and better than colour-distance arithmetic.

**Stats → credibility line is a conversation, not a transformation.** A tile
reading `500+` cannot be mechanically turned into a sentence, and
[credibility-line.md](../design/credibility-line.md) explicitly rejects
generating one. For the three affected tenants the line is written by the client
during P0.3, or it is empty. **Empty is a complete portfolio.**

Everything else is removed by omission — the promotion function simply does not
read `banners`, `stats`, `custom_fields`, `top_ticker`, `sections`,
`profile.links`, `projects.full_description`, or `client`/`year`/`role`. There
is no removal step, because there is nothing to remove: those fields stop
existing at the moment a page starts reading a document instead of a row.

The interim `og:image` policy (§1.12) is in force for the whole of this phase.

### P6 — Security closure

| | |
|---|---|
| **Entry** | every tenant on `v2` |
| **Exit** | anon reads of `profile` and `projects` return nothing · `tenants.public_renderer` is dropped · the draft-composed `loadPortfolioDoc` implementation and the legacy page are deleted |

This is the phase the migration exists to reach (§1.14). Two operational notes:

- **Every tenant still on `legacy` holds the gap open**, so the cutover window
  in P5 is the exposure window. Keep it short.
- **Sequence the hardest tenant deliberately**, rather than leaving whoever is
  most complicated until last and discovering that P6 waits on them.

### P7 — Share images

| | |
|---|---|
| **Entry** | P6 exit |
| **Exit** | cards generated from published snapshots · `og:image` verified **in the server response** |

Generated after the commit, in a separate unit of work, never able to roll a
publish back (§1.11). Verification is a `curl` against the server response —
which works only because the host is server-rendered (§1.7), and is the check
that proves the client-side OG defect is actually gone.

---

## 3. Acceptance tests

Each lands with the phase that earns it, not batched at the end.

**Architecture**

1. The six existing contract tests keep passing, unchanged. *(P1)*
2. **The renderer's prop surface is a closed set.** The current test checks that
   four documented props exist; it cannot catch a fifth being added. This is
   what would catch `slug`, `baseUrl` or `bucket`. *(P1)*
3. The contract applies to **every file** in `components/portfolio/`. *(P2)*
4. The adapter is pure: no Supabase, no `fetch`, no `document`, no environment
   read at call time. *(P1)*
5. Adapter output and renderer input are pinned by a shared fixture, so a rename
   fails a test rather than a page. *(P1)*
6. No public page reads `profile` or `projects`. *(P6)*

**Visual** — hierarchy §6, currently written as checkable and unenforced

7. 375 × 812: at least one real piece partially visible without scrolling. *(P2)*
8. Desktop: the entire first row of work visible without scrolling. *(P2)*
9. **Identity block no taller than the first row** — load-bearing once `mark`
   exists. *(P2)*
10. Natural ratios preserved across all four persona fixtures, ratio error 0, no
    overflow. *(P2)*
11. All of the above in Arabic RTL, mirrored and not reordered. *(P2)*
12. Piece pages, composition: the next step appears once, and the page ends on
    more work rather than on the ask. *(P2)*
12a. Piece pages, routing: canonical redirect on a renamed piece; a removed
    piece shows the portfolio with a plain line, never a 404 shell; an unnamed
    piece resolves but is `noindex`. *(P3)*
13. OG tags present **in the server response**, not after hydration. *(P3, and
    again at P7)*

**Security**

14. Anon read of `profile` / `projects` returns nothing. *(P6)*
15. Anon read of another tenant's unpublished snapshot returns nothing. *(P4)*
16. A piece id belonging to another tenant is not found — lookup is scoped to
    the document, never a global `select … from projects where id = …`. *(P2)*
17. The media-privacy limitation is recorded with an owner and re-checked before
    the media pipeline ships. *(P0, re-checked at P6)*

---

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Per-tenant staging holds the draft-read gap open** for the whole cutover window | **High** | §1.14. Short window, deliberate sequencing, P6 dated rather than backlogged |
| **The renderer has never seen real data** — every quality claim rests on fixtures | High | P1 fixture proves shape; P3 step 6 proves behaviour, before any schema change |
| **Live clients visibly lose features**, and they are paying | High | P0.3 gates P5. Screenshot before, verify after, one tenant at a time |
| **URL→path normalisation fails silently**, producing portfolios with missing images | High | §1.5: a publish that cannot normalise **refuses** |
| **Media privacy is not fixed by any of this** | Medium | Recorded and owned in P0. Do not let snapshot work imply it was addressed |
| **`slug` or `baseUrl` creeps into the renderer** when piece pages get hard | Medium | The adapter (§1.2) plus the closed-prop-set test. The test is the half that survives someone being in a hurry |
| **A second work grid appears** inside `PieceRenderer` | Medium | §1.3: shared components extracted **before** the piece page exists |
| **Signed URLs would break the synchronous adapter** | Medium | §1.5: sign in `getServerSideProps`, never in the adapter |
| **Link previews regress at cutover**, before P7 | Medium | §1.12 interim policy, decided now |
| **Analytics double-counting** once piece pages emit their own `page_view` | Low | Event mapping decided in P3 step 5 |
| **`projects.id` is enumerable across tenants** | Low, severe failure mode | Test 16. Same family as the singleton-tenant bug |
| **The Studio still runs on mocks**, so `media[]` regressions land invisibly | Low | `mock-portfolio.js` moves in the same change as the renderer |

---

## 5. Order

### 5.1 The other documents' numbering, mapped

Two documents were written before these phases existed and number the same work
their own way. **Neither is wrong and neither is renumbered** — renumbering
approved documents to match a plan is churn that breaks every existing
reference. This table is the whole reconciliation:

| Their number | This plan | What it actually is |
|---|---|---|
| [published-snapshot.md](published-snapshot.md) **Step 1** | **P4** | The snapshot model and the `published_snapshots` table |
| [published-snapshot.md](published-snapshot.md) **Step 2** | **P4** | Promotion — the `publish_tenant()` RPC |
| [published-snapshot.md](published-snapshot.md) **Step 3** | **P5** | Public reads move to snapshots — the per-tenant cutover |
| [published-snapshot.md](published-snapshot.md) §10.6, the draft RLS closure | **P6** | Anon loses access to `profile` and `projects` |
| [../design/share-image.md](../design/share-image.md) §10 **Step 4** | **P7** | Share images generated from the published snapshot |

> **"Step 3" is P5, not P3.** P3 is the extraction of the public host, which
> changes no public read at all. This is the one collision worth memorising:
> acting on "step 3" at P3 would narrow the draft policies two phases early and
> take down every tenant still on the legacy renderer.

`share-image.md` steps 1–3 are the same publishing pipeline as
`published-snapshot.md` steps 1–3, so they map identically: P4, P4, P5.

**P0 through P3 have no counterpart in either document.** They are frontend and
extraction work that both were written to assume had already happened.

### 5.2 The sequence

```
 P0  refresh schema · write RLS · contact 4 tenants   ◄── slowest, start first
      │                                                    (gates P5 only)
 P1  adapter contract · document shape · URL→path ·
     directory contract · real-tenant fixture
      │
 P2  links → footer → media[] → dimensions →
     descriptions → shared components →
     piece hrefs → mark → PieceRenderer
      │
 P3  states → meta → favicon → language → analytics →
     SSR host + loadPortfolioDoc(draft) → [slug] →
     piece route (redirect · noindex) → flag
      │   ── real tenant data through the renderer, served to nobody ──
 P4  table · promotion RPC · read policy ·
     promote everyone · diff against live · serve nobody
      │
 P5  per tenant ×11:  review → promote → flip → verify
      │
 P6  narrow draft RLS · drop the flag · delete the legacy path
      │
 P7  share images · OG verified in the server response
```

Two notes on the sequence, because both deviate from the obvious reading:

**P4 promotes every tenant but serves none of them.** The snapshot pipeline is
proven against production data one phase before anything depends on it. This is
where a bad `URL → path` conversion is supposed to be found.

**P0 starts first and finishes last.** It is the only item whose duration is not
controlled here, and it gates P5 rather than the whole plan. Start it now; build
everything else while it runs.

---

## 6. Still open

**Document version (`v`) policy** — whether a shape change migrates old
snapshots or teaches the renderer to read `v1` and `v2`. Inherited from
[published-snapshot.md](published-snapshot.md) §12; it does not need answering
until a second version exists, and the field is present from the first.

**Legacy flat-path media** — the 135 objects outside any tenant prefix.
Permanently excluded from cleanup, renderable, and worth migrating before the
media pipeline rather than after.

**The `project_view` analytics event** — whether it survives piece pages or is
replaced by a `page_view` on the piece route. Decided in P3 step 5; recorded
here because it changes a number clients look at.
