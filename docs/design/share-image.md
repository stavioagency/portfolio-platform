# The share image

**Rules and the generation model. Approved; nothing is built.**

The banner was removed from the public portfolio (hierarchy §0, feature
decisions). What survived of the idea is this: **one image, for the places the
portfolio itself cannot be seen.**

> A banner on the page competes with the work. A share image never can, because
> it never renders on the page.

**Three rules govern everything below:**

1. **The card contains the work and nothing else** — no baked text, no platform
   branding, no ornament.
2. **The words come from `og:title` and `og:description`**, rendered by the
   platform as real text, never rasterised into the picture.
3. **Nothing about it can prevent a portfolio from publishing.**

---

## 1. Why it exists

Designakum clients are found by **being sent a link** — WhatsApp, email, an
Instagram bio. Every one of those surfaces renders a preview card before the
portfolio has loaded, and that card is the only moment where an image is needed
and **the work cannot be seen at all**.

That is the whole justification. It is not decoration, it is not a header, and
it is not shown to anyone who has actually arrived.

---

## 2. Default source — no decision required

> **The share image is the first image of the first piece of the client's
> published work** — `pieces[0].media[0]`, in the published snapshot.

The cover is the first image (piece-content-model.md §2), so this is the same
curation doing a second job: the client already chose which piece leads, and
which image leads it.

Zero settings, zero prompts, zero empty states. The client already chose which
piece leads by ordering their work; the share image is that same curation doing
a second job. **A control the client cannot get wrong is one they never see.**

This is what keeps the banner from returning: there is no upload, so there is
nothing to fill with a gradient or a stock photograph.

---

## 3. Composition — contained, and without baked-in text

Preview cards want a wide frame (1200 × 630). The client's work is whatever
shape it is, and cropping to fit would break the rule the whole layout was
rebuilt around. So it does not crop — and it does not letter it either:

```
   ┌──────────────────────────────────────┐
   │            ┌──────────────┐          │
   │            │  the piece   │          │   contained, never re-cut,
   │            │  uncropped   │          │   never overlaid with text
   │            └──────────────┘          │
   └──────────────────────────────────────┘
        a plain surface. no accent, no ornament
```

**The surface is neutral, not the client's accent.** Two reasons: the work
should be the only colour on a card that exists to show the work, and a card
tinted by appearance would have to regenerate every time a client tried a
different accent — churning a URL that social platforms have cached, for a
change nobody looking at the card would notice.

### The text does not go in the image

> **Text is rendered from real fonts. It is not generated into the image.**

A preview card is not only a picture: every platform renders a **title** and a
**description** beside it, as live text in its own typeface. Those come from
`og:title` and `og:description` — so the client's name and words are already
being shown, correctly shaped, in text the platform lays out.

Baking the same words into the picture would:

- **duplicate** what the platform already renders beside it;
- put Arabic through an image rasteriser, which is where shaping and
  right-to-left ordering break silently — and a card with disconnected letters
  would go out with **every** share, in the one artefact the client never sees
  before sending it;
- force a **language choice** into a bilingual portfolio, since one image
  cannot be both.

So the card is the work, and the words are metadata. **The rules differ by
page**, because a visitor arrives for different reasons.

### The portfolio page — `/{slug}`

| Tag | Source |
|---|---|
| `og:title` | the client's name |
| `og:description` | the short line · else the first line of the bio · else the one-line title |
| `og:image` | the portfolio card — `pieces[0].media[0]` |
| `og:image:alt` | the client's name |
| `og:type` | `profile` |
| `og:url` | the canonical portfolio URL |
| `twitter:card` | `summary_large_image` |

### A piece page — `/{slug}/work/{id}-{name}`

| Tag | Source |
|---|---|
| `og:title` | **the piece's name · the client's name** |
| `og:description` | the piece's "About this piece" · else the client's short line · else the client's title |
| `og:image` | **that piece's own card** — `piece.media[0]` |
| `og:image:alt` | the piece's name, else the client's name |
| `og:type` | `article` |
| `og:url` | the canonical piece URL, in its id-authoritative form |
| `twitter:card` | `summary_large_image` |

**The piece leads its own title**, and that is the point of the page existing:
someone who was sent a link to *this project* should see the project named
first, not the portfolio it belongs to.

**Every piece page generates its own card** from that piece's first published
image. A piece page whose preview showed the portfolio's leading piece would be
advertising the wrong work to the person the client chose to send it to.

**An unnamed piece** falls back to the client's name for `og:title`, and is
`noindex` (piece-detail.md §3.4) — it stays reachable, because a link already
sent must never break.

**No description is ever empty and none is ever invented.** The chains above
end at something the client has already written; the product does not author a
sentence about them.

**The one place text is unavoidable** is the identity-only fallback (§4), where
there is no work to show. There, and only there, the name is typeset **with the
real font files** — Reem Kufi or IBM Plex Sans Arabic for Arabic, Manrope for
Latin — with correct shaping and RTL, and it must be verified against a real
Arabic name before it ships.

---

## 4. Fallback, in order

| Situation | The card |
|---|---|
| Published work exists | `pieces[0].media[0]`, contained on the surface colour. No text |
| **No published work** | Identity only: the name, typeset with real fonts (§3). **Never placeholder artwork**, never a stock photo, never a gradient |
| No name | The portfolio does not publish. There is nothing to share |
| Generation fails | See §7 — the publish still succeeds |

---

## 5. An override — only if it is a choice between their own pieces

Not in the first version. If it is ever added, one shape is permissible and one
is not:

| Permissible | Forbidden |
|---|---|
| "Use this piece instead", chosen from work they already have | An upload field |
| No new asset, nothing to get wrong | Anything accepting a file the portfolio never shows |

**There is no banner, no separate upload, and no custom social-image field.**
The moment a client can upload an image that appears nowhere on their
portfolio, the product has a banner again — one nobody reviews, that can be a
gradient, and that represents them everywhere they are shared.

---

## 6. Generated from the published snapshot, and only from it

**Generated at publish, from published content, stored with the published
snapshot** (blueprint §8.5).

**Draft changes never affect it.** Reordering images, swapping the first piece,
replacing a file — none of it reaches the card until the client publishes. If
the card were generated from the draft, a link shared today could preview work
that is not live. Visitors see the published state, and someone who only ever
sees a preview card is still a visitor.

### Deterministic hashed filenames

```
   share-{hash}.jpg
```

> **Hash exactly what is drawn — never the snapshot.**

The inputs are the card's **visual dependencies** plus the **composition
version**, and nothing else:

| Card | Hash inputs |
|---|---|
| Portfolio | the identity of `pieces[0].media[0]` · composition version |
| Piece | the identity of that piece's `media[0]` · composition version |
| Identity-only fallback | the name as drawn · its language · composition version |

**Hashing the whole snapshot would be wrong**, not merely wasteful. A client
who fixes a typo in their bio, renames a link, changes their next step or tries
a different accent has changed nothing a card shows — but every one of those
would produce a new filename, discarding a warm platform cache and, on the
platforms that cache hardest, showing nothing at all for a while. The card must
only change when the card changes.

**Deterministic, not random.** The same drawn content produces the same
filename, so republishing an unchanged portfolio costs nothing. Any change to
what is drawn produces a different name, so a stale card can never be served.

This is the answer to the platform-cache trap: social platforms cache preview
images hard, some for days, and a client who republishes and keeps seeing the
old card will report it as a bug. A new URL is the only reliable way to bust
it.

**`composition version` is in the hash on purpose.** When the card's layout
changes, every card must regenerate — otherwise portfolios published before the
change keep serving the old design forever.

---

## 7. Failure never blocks publishing

> **A card that cannot be generated must not stop a portfolio going live.**

Publishing is the thing the client came to do; the card is a courtesy to
whoever they send the link to. If generation fails:

1. keep the **previous** card if one exists — a slightly stale card beats none;
2. otherwise **omit `og:image`** entirely. Platforms fall back to text-only
   previews, which is a smaller loss than a broken image;
3. **never** substitute placeholder artwork, and never block the publish.

---

## 8. No platform branding — decided

**The card carries no Designakum mark, name, watermark or colour.**

The product is the frame, never the picture. A card is the client's work
representing the client; putting our mark on it turns every portfolio they
share into our advertising, using their work to do it. That is a trade a
premium product does not make on its customer's behalf.

Practically it is also the wrong surface: platforms crop cards unpredictably,
so a mark lands wherever it lands, and it competes with the one image the card
exists to show.

---

## 9. Where it runs

**In an Edge Function, at publish.** The repo already has thirteen; this one
composes an image and writes it to storage.

**It is the first real need for image tooling**, and that is worth naming
before it arrives: GRANDMASTER rule 2 caps the *app* at five runtime
dependencies, and nothing here changes that. Composition happens in the Deno
function, never in the Next bundle — the app must not gain an image library to
serve a file it only ever links to.

**Cleanup follows the existing media rules.** A generated card is deleted only
when no published snapshot references it.

---

## 10. Build order — this comes last

> **Do not implement share images before snapshots exist.**

There is nothing to generate from until the published snapshot is real. The
sequence:

| # | Step | Why it must come first |
|---|---|---|
| 1 | **Define the published snapshot model** | The card is generated *from* it |
| 2 | **Implement promotion from draft to snapshot** | The card is generated *at* that moment |
| 3 | **Move the public renderer to snapshot reads** | Until then "published" is a design, not a state |
| 4 | **Generate share images** | Everything above is its input |

Steps 1–3 are the publishing pipeline (blueprint §8.5), and they are also the
first backend work in this whole effort — everything built so far is frontend
against mock data.

**Numbering note.** These steps are this document's own. In the phased plan —
[../architecture/renderer-migration.md](../architecture/renderer-migration.md),
the authoritative execution sequence — steps 1 and 2 are **P4**, step 3 is
**P5**, and **step 4 is P7**. Its §5.1 carries the full mapping.

---

## 11. Open

**When piece cards are generated** — at publish alongside the portfolio card,
or lazily on first request. A cost question rather than a rule: fourteen
clients with six pieces each is eighty-four cards. The *content* of a piece
card is decided (§3); only the timing is not.

**Which language the identity-only fallback uses** when a portfolio has both.
It matters only for the rare no-work case, and it is the one place a card
cannot be language-neutral.
