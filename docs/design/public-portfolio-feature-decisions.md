# The public portfolio — feature decisions

**Decisions, not a plan.** Every feature the current public page ships, judged
against the Designakum philosophy. Nothing here says how anything is built, and
nothing is built until `PortfolioRenderer` is approved as the new public
portfolio (blueprint §8.2a).

Each feature is judged on three questions:

1. Does it help a creator **express their work**?
2. Does it **reduce effort**?
3. Does it belong in the **calm portfolio model**?

---

## The finding that reframes everything

The current public page is **not a portfolio. It is a link-in-bio card.**

Read its structure without the code: avatar, name, tagline, a collapsible
about, a scrolling ticker, an auto-advancing banner slider, stat tiles, a row
of call-to-action buttons, a row of social icons. That is the Linktree shape,
feature for feature — and **the work is not on it.** Projects live behind a
button, in a modal.

That is the opposite of the product's own promise:

> Bring your work. Have a portfolio you are proud to send.

A page where the work is one click away and the stat tiles are not is a page
about the *person's presence*, not their work. Most decisions below follow
from correcting that one inversion.

---

## Decisions

### Keep

| Feature | Why |
|---|---|
| **Name, tagline, photo / logo** | Identity is the frame around the work. Cheap to fill in, and the page does not render meaningfully without a name |
| **Bio** | The one piece of writing that makes a stranger trust a portfolio — but **not collapsed**, see redesign |
| **Social / contact links** | Real expression, near-zero effort, and how a visitor actually reaches the client. Brand glyphs, never emoji |
| **Language switcher** | Arabic is first-class. A visitor arriving in the wrong language is the one thing bilingualism exists to prevent |
| **Custom favicon** | Set once, never touched again, and it makes a shared link look like the client's. Effort-free personalisation is the good kind |
| **SEO fields** | Invisible, high value, and the one admin editability gap already on record. A portfolio nobody can find is not a portfolio |
| **Footer line** | One short line the client owns. Costs nothing, occasionally matters (a studio name, a credit) |
| **Legal links** | Platform obligation, not a client feature. Small, at the bottom, unchanging |
| **Skeleton, 404, and "not set up" states** | Page-level states, and the skeleton already mirrors the real card's geometry so nothing jumps. Keep the discipline, restate the copy in the new voice |
| **`page_view` analytics** | Invisible to the visitor, and it feeds the one number a client actually wants: did anyone look |

### Redesign

| Feature | Now | Should be |
|---|---|---|
| **The work** | Behind a button, in a modal with a lightbox and swipe | **The page.** The work is the portfolio; it opens on the page, and a piece expands to its own view. This is the single most important change |
| **Bio, behind a toggle** | A collapsible "About" the visitor must open | Visible. Hiding the sentence that explains who someone is, to save four lines, is effort spent to lose meaning |
| ~~**Banner slider**~~ | — | **Superseded: the banner is removed entirely**, see *Remove*. This row previously said "one image, or none"; the later banner review found that even one image above the work competes with the work, and that the "image that leads" role is already filled by the first piece |
| **Call-to-action buttons** | A list; the first is primary, the rest are ghost | **One action**, placed after the work and the introduction (hierarchy §3b). "Get in touch", or whatever the client names it. A page with five equal calls to action is a page with none, and the ordering rule ("first is primary") is a layout decision the client should never have to reason about |
| **Stats** | Free-form value/label tiles | **At most one credibility line, in words** — "Ten years, mostly editorial" — or nothing. Never a grid of tiles. Numbers are sentences (design.md 7), and a tile that reads `500+` invites invention |
| **Appearance controls** | Free accent, background, surface, text, border, font stack, radius | **The small defensible set already decided for Look:** accent, banner treatment, display font, density. Free colour and radius are unlimited theming — explicitly ruled out, and the fastest route to a portfolio that looks worse than the template |
| **Section visibility toggles** | `sections.bio`, `.custom_fields`, `.links`, `.lang_switcher`, `.projects` | **Deleted as a concept.** A section appears when it has content and does not when it does not. Every toggle here is a question the product should answer for the client |

### Remove

| Feature | Why |
|---|---|
| **The scrolling ticker** | A marquee. It moves continuously, communicates none of the four things motion may communicate, and cannot be read at a glance. It is the loudest element on a page selling calm, and it is decoration by definition |
| **Banner auto-advance** | Motion on a timer, on every visit, forever. The client cannot control what a visitor sees, and a visitor who looks away misses the image chosen to lead |
| **Custom fields** | Arbitrary key/value pairs on a public page. This is a CMS feature: it asks the client to invent structure, and structure is our job (blueprint §1). Whatever people genuinely put here should become a real field or nothing |
| **Multiple banners** | Follows from removing the carousel. A portfolio's images are its work, not its wallpaper |
| **The banner itself — all of it** | An image above the work competes with the work for the only currency that matters there, and a visitor reads it as the client's work when it is not. The role it claimed — one image that leads — is already filled by the first piece, chosen by the client through ordering. The `banners` array is gone and the **Look panel loses its banner control**, dropping from four settings to three. The concept survives only as a link-preview image: [share-image.md](share-image.md) |
| **The admin-only setup nudge** | The Studio's attention queue now does this properly, in the place the client is actually working. A hint rendered into the public page is the product talking to itself on the customer's site |

---

## What the decisions add up to

**Seven features removed, six redesigned, ten kept.** The removals are almost
entirely the link-card inheritance: ticker, carousel, custom fields, stat
tiles, CTA stacks, visibility toggles. What remains is identity, words, links,
and the work — which is what a portfolio is.

Three rules emerge that are worth keeping beyond this list:

1. **The work is the page.** Anything that pushes it below or behind something
   else has to justify itself against the promise the product makes.
2. **Presence of content decides presence of section.** Not a toggle. This
   deletes an entire settings surface and the questions that come with it.
3. **A control the client cannot get wrong, or no control.** Accent from a
   short list, yes. Free hex, radius and font stack, no — every one of those is
   a way to produce a portfolio worse than the one we gave them.

---

## What this does not decide

**What a piece looks like when it opens.** The current lightbox is a modal with
swipe and keyboard handling; the replacement is a design question — a detail
view, an expanded card, a full page — and it deserves its own pass with
wireframes, not a line in a table.

**Whether the one call to action is a button or a link.** Its *placement* is
settled — after the work and the introduction, never above the work (hierarchy
§3b) — but whether the next step reads as a button or as a line of text is
compositional and only makes sense against a real layout.

**Migration order.** Nothing here changes the sequencing in blueprint §8.2a:
the public page stays untouched until the new renderer is feature-complete and
approved for shipping.
