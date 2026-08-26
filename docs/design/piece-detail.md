# The piece detail view

**Approved. Nothing is built yet.** What a piece *contains* is settled separately in [piece-content-model.md](piece-content-model.md).

The work is now the core object of the portfolio, so what happens when a
visitor selects a piece is a product decision rather than an interaction
detail.

---

## 1. The options

### A · A dedicated piece page — `/{slug}/…`

| Criterion | Verdict |
|---|---|
| **Shareability** | **Strongest.** A real URL. "Look at this project" is a link, not an instruction to scroll |
| **SEO** | **Strongest.** A portfolio of six pieces becomes seven indexable pages with their own titles, descriptions and images, instead of one page and six invisible fragments |
| **Mobile** | Good. Full screen, and the system back button already means "back" |
| **Portfolio context** | **Weakest** — the visitor leaves the portfolio. This is the cost, and §3 is how it is paid |
| **Gallery-viewer risk** | **Lowest.** A page is a document. It invites a description and context, which is what a piece deserves |

### B · Inline expansion — the piece grows in place

| Criterion | Verdict |
|---|---|
| Shareability | None. There is nothing to send but the portfolio itself |
| SEO | Partial. The text is in the document but has no title, no description, no URL of its own |
| Mobile | **Poor.** In a single column, expanding reflows everything below the visitor's finger |
| Portfolio context | **Strongest** — never leaves |
| Gallery-viewer risk | Medium |

There is a second, structural objection: the work grid deliberately has
**natural ratios and even rows** (hierarchy §3a). Expanding one cell in place
breaks the row it sits in and shifts every piece after it. The layout the
portfolio was rebuilt around is the layout this option fights.

### C · A modal

| Criterion | Verdict |
|---|---|
| Shareability | None, unless the URL is synced — at which point it is a page pretending not to be one |
| SEO | None |
| Mobile | Poor. Cramped, needs its own close affordance and scroll locking |
| Portfolio context | Preserved visually, behind a scrim |
| Gallery-viewer risk | **Highest** |

**C is already excluded by a locked rule.** Hierarchy §5 lists *"any
interstitial — cookie banner, modal, overlay"* among the things that may never
sit above the work. A modal covering the portfolio is that, by definition.

It is also what the product does **today**: `ProjectsModal` is ~300 lines of
lightbox with swipe and keyboard handling. That is the gallery viewer this
brief asks us not to become, and it already exists — so choosing C is choosing
to keep it.

---

## 2. Recommendation — A

The deciding argument is the product's own distribution model. Clients are
found because **they send a link** (hierarchy §1). A dedicated page means the
thing they most often want to send — *one particular project* — is finally
sendable. B and C both make that impossible.

SEO is the second argument and it is not small: it converts a portfolio from
one thin page into a set of real pages, each about a specific piece of work.

---

## 3. The model

### 3.1 The URL, and surviving a rename

```
   /{slug}/work/{id}-{name}       designakum.site/noura/work/4-layla-at-home
                  ▲     ▲
                  │     └─ readable, and may change freely
                  └─────── authoritative, and never changes
```

**Only the id is authoritative.** The name part is decoration for humans and
for search engines: if the client renames a piece, the old link still resolves
and redirects to the new spelling. A shared link must survive an edit — a
client who renames a project should not silently break every message they have
already sent.

**Bilingual names.** The readable part comes from the Latin name where there is
one, and is otherwise omitted rather than transliterated. `/noura/work/4` is
honest; a mangled romanisation of an Arabic title is not.

### 3.2 What is on the page

The piece, at a size worth looking at, and the words that go with it:

```
   ← Noura Al-Harbi                        ← back, always, to the portfolio

   Layla, at home
   About this piece — what it was for, and
   who it was for.

   ┌────────────────────────────────┐
   │            image 1             │  natural ratio, as everywhere
   └────────────────────────────────┘
   ┌──────────────────┐
   │     image 2      │              up to ten, in the client’s order
   └──────────────────┘
     an optional caption

   View the full project ↗                 ← the piece’s own link, if any

   [ the next step ]                       ← the portfolio’s one action

   More of Noura’s work                    ← the rest, as the same grid
   ┌────────┐ ┌────────┐ ┌────────┐
```

Same rules as the portfolio: natural proportions, no crop, no forced ratio.

### 3.3 How context is paid back

The cost of a dedicated page is that the visitor leaves the portfolio. Two
things repay it, and one temptation is refused:

- **A visible way back**, always, naming the person rather than saying "back".
- **The rest of the work at the end**, rendered with the same grid — so the
  page returns the visitor to *browsing*.
- **No previous / next.** No arrows, no swipe between pieces, no keyboard
  paging, no fullscreen image mode.

> **Browsing, not flipping.** Prev/next is the gallery-viewer gesture: it turns
> considered work into a stack of slides and encourages skimming past the
> thing the page exists to show. Zooming is the browser's job, not ours.

### 3.4 Meta, per piece

The full set is specified once, in
[share-image.md](share-image.md) §3 — including the fallback chains and the
rule that a piece page leads with the piece's own name. In short:

| Tag | Source |
|---|---|
| `og:title` | piece name · client name |
| `og:description` | the piece's "About this piece", with fallbacks |
| `og:image` | **that piece's own card**, from its first published image |

**A piece with no name is `noindex`.** A page with an id for a title and no
description is a thin page; publishing six of them would make the portfolio
look worse to a search engine, not better. It still resolves — a link already
sent must not break — it simply is not offered to search.

### 3.5 Empty and edge cases

| Case | Behaviour |
|---|---|
| Piece has no description | The page is the work plus its name. Legitimate, and common |
| Piece has no images yet | Not reachable and not listed: a piece with nothing to show is not a piece yet |
| Piece deleted | The portfolio, with a plain line saying the piece is no longer there. Never a 404 shell |
| Portfolio unpublished | Same as the portfolio itself — the piece page follows the tenant's state, never its own |

---

## 4. What this means for the Studio

**The client must be able to preview a piece page.** It is a whole page of
their portfolio; if the Studio can only ever show the main page, they will
publish something they have never seen.

**Clicking a piece in the preview must keep opening the editor panel, not
navigating.** The preview host already intercepts clicks and reports the field
name (`piece:4`), so a visitor's click navigates while a client's click edits.
That divergence is deliberate and already built — but it means previewing the
piece *page* needs its own affordance rather than falling out of clicking.

The simplest shape, not yet designed: the piece panel gains a quiet "see this
piece as a visitor" that switches the preview to that URL.

---

## 5. Settled elsewhere, and what remains

**Resolved elsewhere.** A piece holds up to ten images, ordered, the first
being its cover, presented as a document and never a carousel
([piece-content-model.md](piece-content-model.md)). The piece page **does**
carry the primary action — the same one, never a second — placed after the
piece and before the rest of the work, because a visitor arriving from a
shared link never sees the portfolio's version. The credibility line does
**not** appear: it is identity-level, and a piece page is not the portfolio.

**Route shape** — `/{slug}/work/{id}` versus `/{slug}/{id}` — is a routing
detail with one real constraint: it must not collide with the reserved-slug
list or with future top-level routes.
