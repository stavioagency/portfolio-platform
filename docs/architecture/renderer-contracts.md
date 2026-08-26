# Renderer contracts — frozen

**FROZEN 2026-08-21. Phase P1 of [renderer-migration.md](renderer-migration.md).**

Nothing here is implemented. No public page changed, no snapshot table exists,
no SQL was applied and no tenant was migrated. This document is the thing P2
builds against, and the point of freezing it now is that **after the first
snapshot exists, every key in it costs a data migration to change.**

Everything below was checked against **real tenant data** — `f9designer`, eight
pieces, the largest portfolio in the system — not against
`lib/studio/mock-portfolio.js`. §7 records the seven places the real data
disagreed with the mock, and four of those changed a decision.

---

## 1. The adapter boundary

```
   published snapshot document          stored, immutable, one JSONB row
              │
              ▼
   lib/portfolio-view.js                PURE. The only layer that knows about
   toPortfolio(doc, ctx)                routes, storage and environment
              │
              ▼
   renderer props                       { portfolio, lang, dir, appearance }
              │
              ▼
   shared components                    WorkGrid · NextStep · Footer
```

### 1.1 What the renderer must never know

Frozen, and enforced by `tests/portfolio-renderer-contract.test.mjs`:

| Never | Because |
|---|---|
| tenant id | it renders a portfolio, not *a tenant's* portfolio |
| slug | a slug is an address; addresses are routing |
| routing | it cannot build a URL, read a router, or know where a link goes |
| storage paths | a path is meaningless without a bucket and a host |
| storage buckets | same |
| environment values | no `process.env`, ever |
| database access | it takes data as props, or it cannot have two callers |
| publishing state | it must not be able to tell draft from published |

**The corollary that makes this testable:** the prop set is **closed**. Exactly
`portfolio`, `lang`, `dir`, `appearance` — and a fifth prop is the signal that
one of the rules above is being broken, whatever it is called.

### 1.2 What the stored document contains

Per [published-snapshot.md](published-snapshot.md) §2, with `mark` and `favicon`
added at amendment 1:

```
v · lang · name · title · bio · shortLine · mark
appearance { accent, font, density }
action { destination }
links[]  { id, label, url }
pieces[] { id, name, description, link, media[] { path, w?, h?, caption } }
seo { title, description } · favicon { path } · footer
```

**Paths, never URLs. Ordering, never flags. No `cover` field** — the cover is
`media[0]`.

### 1.3 What the renderer receives

The same tree, with exactly three differences — all of them things the renderer
is forbidden to compute:

| | Document | Renderer props |
|---|---|---|
| media | `path` | **`src`** |
| pieces | — | **`href`**, already built |
| seo, favicon | present | **absent.** They never reach the renderer |

### 1.4 What happens only in the adapter

Frozen list. Anything not on it does not belong here.

1. `path` → `src`, against a configured media base.
2. piece `href` construction, including the readable slug segment.
3. `mark.path` → `mark.src`.
4. **link label derivation** — see §7.2 F1, this is new.
5. dropping `seo` and `favicon`, which are the host's.

**The adapter is pure.** No Supabase client, no `fetch`, no `document`, no
environment read at call time — context arrives as an argument:

```
toPortfolio(doc, { origin, slug, mediaBase })
```

Both hosts call it: the public page with a snapshot, the Studio preview with a
draft-shaped document. **The Studio supplies hrefs too**, so markup and focus
order are identical to production; its host calls `preventDefault`.

---

## 2. Media transformation rules

### 2.1 Draft media

| Rule | |
|---|---|
| **Stable ids** | every draft image carries an id assigned at upload and kept for as long as the image is in the piece |
| **Replacement keeps position** | the replacement sits exactly where the old image sat |
| **Replacement keeps the caption** | the caption describes *that place in the story*, not that file |

**Why the id has to exist.** Identifying an image by index breaks the moment
anything before it moves; identifying it by URL breaks precisely when the URL
changes — which is the one operation replacement *is*. A replacement inherits
the id of the image it replaces, and that is what makes "in place" mean anything.

**This does not exist in the data today.** `projects.images` is an array of bare
URL strings with no ids. Assigning them is P2 editor work.

### 2.2 Published media

| Rule | |
|---|---|
| **`media[]` is immutable** | a publish writes a new document; it never edits one |
| **`media[0]` is the cover** | there is no cover field, and ordering already expresses it |
| **`path` is stored, not URL** | signed URLs expire, public URLs embed a host that may change |
| **The adapter converts `path` → `src`** | a pure string join against a configured base |

Published media identity is **positional**, deliberately. The document is never
edited, so nothing can move underneath a reference. Draft ids do not travel into
the snapshot.

### 2.3 Assembling `media[]` — decided against the real data

> **`media[] = [cover_image, ...images]`.**

This was not obvious and the mock hid it. In the live data **`cover_image` is a
distinct uploaded file that does not appear in `images[]`**:

```
project 8   cover_image  project-8-cover-1779730968865.png
            images[]     project-8-1779730689022.png
                         project-8-1779730694911.png
                         project-8-1779730699744.png
                         project-8-1779730704448.png     → media[] has FIVE items
```

Dropping `cover_image` would delete an image the client uploaded and chose to
lead with. Prepending it makes `media[0]` the cover, which is exactly what the
model says the first item is.

**Deduplicate by path when assembling** — a client who set the cover from an
existing gallery image must not get it twice.

### 2.4 `URL → path` normalisation

Every media field in the live database holds a **full public URL**, because
`pages/admin.js` stores `getPublicUrl(...).publicUrl`. The document specifies
`path`. Promotion normalises.

**Supported format** — exactly one, and anything else is a failure:

```
https://<project>.supabase.co/storage/v1/object/public/media/<path>
                                                            ^^^^^^^ this is `path`
```

**Failure behaviour:**

| Case | Behaviour |
|---|---|
| Parses to a `t-<uuid>/…` path | store the path |
| Parses to a **flat legacy path** | store it. It renders; it is permanently excluded from cleanup |
| **Does not parse** | **the publish FAILS, loudly** |

> **A required media path that cannot be derived fails the publish. It never
> stores null and continues.**

Storing null yields a published portfolio with missing images — a silent,
visitor-facing defect the client discovers. A refused publish is a message to an
operator who can fix it. Publishing is already all-or-nothing; this keeps it so.

**"Required" means:** any `media[]` entry of a piece being published, and `mark`
and `favicon` when present. An **absent** field is not a failure — an
unparseable one is.

**The legacy case is the normal case, not the edge case.** All 20 media objects
of the largest portfolio in the system are at flat paths.

### 2.5 `w` / `h` are OPTIONAL — changed by evidence

[published-snapshot.md](published-snapshot.md) §2 presents intrinsic dimensions
as stored deliberately, so the page can reserve the box before the image loads.
**There is no source for them.**

Verified: `storage.objects.metadata` carries `eTag`, `size`, `mimetype`,
`cacheControl`, `lastModified`, `contentLength`, `httpStatusCode` — **no width,
no height**. Postgres cannot decode an image header, so a SQL promotion function
cannot populate these fields.

**Frozen decision:** `w` and `h` are **optional**. When present the renderer
reserves the box; when absent it renders as it does today and the page may
settle. Populating them is media-pipeline work, not promotion work.

**This is a real quality regression against the stated intent, and it is
accepted rather than hidden.** The alternative — blocking the migration on a
media pipeline — is worse.

---

## 3. Identity media

| | Where | Frozen |
|---|---|---|
| **`mark`** | **renderer**, as `mark.src` | ONE optional field. Replaces choosing between logo and photo |
| **`favicon`** | **host only** | carried in the document, never passed to the renderer |
| **OG / share image** | **host only** | metadata, same reasoning |

**`mark = brand_logo || profile_image`**, the resolution the current public page
already performs. The client is never asked which slot their image belongs in.

**The collapse is not hypothetical.** `f9designer` has **both** a `brand_logo`
and a `profile_image`; the rule picks the logo. Six tenants hold identity media —
more than hold any feature being removed.

**`favicon` is in the document and not in the props.** Both halves matter: it
must be carried or it dies at P6 when the host loses its draft read; it must not
reach the renderer, which may not write `<head>`.

**The identity-height rule becomes load-bearing** the moment `mark` renders —
hierarchy §5 requires the identity block to be no taller than the first row of
work, currently asserted in CSS commentary with no test.

---

## 4. Naming — frozen

> **Schema key: `shortLine`. Interface label: "In short" / «باختصار».**

**The key does not change.** `shortLine` is already the key in the snapshot
spec, in `lib/studio/draft.js`, and in the renderer. It describes the *shape* —
one short line — not the claim, which is what a schema word should do. Renaming
it buys nothing and is free only until the first snapshot exists.

**"Credibility line" is internal vocabulary and a client must never meet it.**
The label names the register — *brief* — rather than the concept
([../design/credibility-line.md](../design/credibility-line.md) §5).

| Layer | English | Arabic |
|---|---|---|
| Schema / document key | `shortLine` | `shortLine` |
| Design documents | the credibility line | — |
| **Interface** | **In short** | **باختصار** |
| Placeholder | Photographing since 2014, mostly editorial | التصوير منذ 2014، غالبًا تحريري |

**The separation is currently violated, in one place.** `lib/studio/draft.js`
renders `'your short line'` / `'السطر المختصر'` in the publish confirmation —
schema vocabulary leaking into interface copy. Held as a **separate scheduled
code change**; it is not a P1 edit, and it does not block the freeze because the
key is unaffected.

---

## 5. `PieceRenderer` and the component boundary

```
components/portfolio/
  ├── PortfolioRenderer.js   Identity · WorkGrid · Intro · NextStep · Links · Footer
  ├── PieceRenderer.js       BackLink · piece body · NextStep · WorkGrid · Footer
  ├── WorkGrid.js            SHARED — the band, natural ratios, lead treatment
  ├── NextStep.js            SHARED — one destination, product-owned label
  └── Footer.js              SHARED — the client's line + a host-filled slot
```

### 5.1 Which are shared

`WorkGrid`, `NextStep` and `Footer` — **one copy each**, used by both renderers.
`PortfolioRenderer` and `PieceRenderer` are compositions, not implementations.

**They are extracted BEFORE `PieceRenderer` exists.** Building the piece page
first and factoring afterwards is how the grid acquires a second copy that
drifts — invisibly, until someone puts two pages side by side.

### 5.2 Props

| Component | Props |
|---|---|
| `PortfolioRenderer` | `portfolio` · `lang` · `dir` · `appearance` — **closed** |
| `PieceRenderer` | `portfolio` · `piece` · `lang` · `dir` · `appearance` |
| `WorkGrid` | `pieces` · `lang` · `lead` (bool) |
| `NextStep` | `destination` · `lang` |
| `Footer` | `text` · `lang` · `children` (the host's legal slot) |

`PieceRenderer` takes the whole `portfolio` **and** the `piece` because it
renders the rest of the work, the shared next step and the footer — all of which
live on the portfolio, not on the piece.

### 5.3 How duplication is avoided

| Concern | Where it lives once |
|---|---|
| the grid, bands, ratios, lead emphasis | `WorkGrid` |
| the single action and its product-owned label | `NextStep` |
| the client's footer line | `Footer` |

**`WorkGrid` on a piece page renders *the rest* of the work** — current piece
excluded, `lead={false}`. That is a prop, not a second grid. The exclusion is
the caller's job: `PieceRenderer` passes a filtered list.

### 5.4 The contract is a rule about the directory

Every file in `components/portfolio/` obeys §1.1 and exposes a closed prop set.
Written that way, a new renderer cannot opt out of the rules by being new.

---

## 6. Tests

Added in P1, before anything is wired:

| Test | Enforces |
|---|---|
| no storage or database imports | §1.1 — adapter and every renderer file |
| no routing leaks | §1.1 — no router import, no URL construction in components |
| no tenant context leaks | §1.1 — no `slug`, `tenantId`, `baseUrl`, `bucket` |
| **closed prop set** | exactly `portfolio, lang, dir, appearance` |
| fixture shape stability | the fixture matches §1.2, so a rename fails a test not a page |

The adapter's own purity tests **skip while `lib/portfolio-view.js` does not
exist** and enforce the moment it does — so `npm test` stays green through P1
and the contract is armed for P2.

---

## 7. The real-tenant fixture

`tests/fixtures/f9designer.doc.json` — derived from `f9designer`, read
2026-08-21. **Nothing was migrated, published, or written back.**

### 7.1 What it proves

| | |
|---|---|
| real bilingual fields | Arabic-primary, English frequently empty or a placeholder |
| real media shape | 8 pieces, **20 media objects**, cover distinct from gallery |
| real ratios | none declared — no `w`/`h` anywhere (§2.5) |
| real links | 4, **all with empty labels** (§7.2 F1) |
| real appearance | a custom dark theme that the new model cannot express (§7.2 F2) |

Unmappable values are written as `"UNMAPPED"` / `"UNDECIDED"` rather than
guessed. **Nothing in the fixture is invented.**

### 7.2 Seven findings from real data

**F1 — every link label is empty.** All four `custom_links` carry `icon` and
`href` with `label: {ar:"", en:""}`. The renderer renders `link.label`, so a
faithful conversion produces **four invisible links**. → **The adapter derives
the label from `id`/`icon`** when none is written. Added to §1.4.

**F2 — appearance cannot be mapped mechanically.** Stored:
`{theme:'midnight', radius:'pill', density:'comfortable', font_body:'plexar',
tokens:{bg:'#9fa7ff', surface:'#000000', text:'#ffffff', accent:'#9FA7FF'}}`.
`density:'comfortable'` is not `tight|roomy`; `font_body:'plexar'` is not
`manrope|reem`; the accent is not near any of the four named accents. **And the
whole dark surface scheme has no expression at all** in a model with fixed
surfaces. This is larger than "map the accent" and belongs in that tenant's P5
conversation.

**F3 — the cover is a separate file.** §2.3.

**F4 — every piece is named "New Project" in English.** The default was never
edited, on all 8. Under the new model a piece name becomes a caption, a URL
segment, an `og:title` and generated alt text — so this yields eight pages
titled "New Project". **A placeholder name is worse than no name**, because the
`noindex`-if-unnamed rule (piece-detail §3.4) does not fire on it. Needs a rule,
and does not have one.

**F5 — the English display name is Unicode-styled text**, not ASCII:
`𝗙𝗔𝗜𝗦𝗔𝗟`. Slug derivation, `og:title` and screen readers all degrade. The
readable URL segment should be **omitted** rather than transliterated, per
piece-detail §3.1 — this is the case that rule was written for.

**F6 — `footer` is `{text:{ar,en}, color}`**, not the bilingual field the
document spec assumes. Promotion maps `footer.text` → `footer`; `footer.color`
is dropped, because appearance is ours now.

**F7 — `seo.og_image` is populated.** The killed custom social-image field is
live data. It is **not** carried into the document (§1.2), and the interim
`og:image` policy uses `pieces[0].media[0]` instead
([renderer-migration.md](renderer-migration.md) §1.12).

---

## 8. Still open after P1

**Placeholder piece names (F4).** No rule covers "named, but with the default".
It affects titles, URLs, alt text and indexing. Needs a decision before P5.

**Appearance mapping for custom themes (F2).** Per-tenant, human, and larger
than the accent list.

**Draft media ids (§2.1).** Frozen as a requirement; assigning them is P2 editor
work and the mechanism is not designed.

**`w`/`h` population (§2.5).** Deferred to the media pipeline. Optional until
then.

**Held deliberately:** `shortLine` interface strings in `lib/studio/draft.js`
(separate scheduled code change) · piece-card eager vs lazy generation (P7) ·
physical language-switcher placement (P3 composition).
