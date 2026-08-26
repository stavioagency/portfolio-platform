# The public portfolio — hierarchy

**Decisions about order and weight.** What a visitor meets, in what sequence,
and what is allowed to compete for their attention. Nothing here specifies
layout, and two things are deliberately left undecided (§7).

Companion to
[public-portfolio-feature-decisions.md](public-portfolio-feature-decisions.md),
which decided *what exists*. This decides *what leads*.

---

## 0. The locked principles

1. **The portfolio is judged by the work first.**
2. **At least one real piece must be visible on a 375px phone without
   scrolling.**
3. **Identity introduces the work, it does not replace it.**
4. **Work is the largest visual element.**
5. **Bio follows work.**
6. **Sections appear from content, never toggles.**
7. **RTL mirrors layout direction but never changes hierarchy.**
8. **Nothing above the work may compete with it.**
9. **Controls must not require design decisions.**
10. **No decorative motion, and no unnecessary choices.**

### The presentation rule

> **The work grid is not a gallery wall. Pieces are presented intentionally,
> not as a collection of thumbnails.**

A gallery wall is what you get by default: equal cells, equal weight, filled
left to right until the work runs out. It says *here is everything*, which is
the opposite of what a portfolio says.

Presented intentionally means the opposite of every one of those defaults:
pieces are **large enough to be looked at rather than counted**, they carry
their names, and they have room around them.

### What this rule does NOT mean

The first reading of it produced a full-width 21:9 lead image, and that was
**rejected**. Three corrections, so it is not read that way again:

**Featured work ≠ hero banner.** A portfolio is not a landing page and has no
hero composition. Giving the first piece cinematic framing borrows the grammar
of a marketing site, where a large image exists to set a mood. Here the images
*are* the content, and a portfolio that opens like a campaign page is making a
claim the work has not been given a chance to make.

**Emphasis ≠ forced crop.** A single imposed aspect ratio is a crop applied to
everyone's work — it turns a photographer's portrait frame into a landscape
one, and a square illustration into a strip. **Presentation depends on the type
of work and its natural proportions.** Whatever emphasis the first piece
receives, it may not come from re-cutting the image.

> This applies to the *existing* uniform ratio too, not only to the rejected
> lead treatment. Imposing 16:10 on every piece is the same mistake at a
> smaller angle. **§3a settles it: the work keeps its natural ratio, and no
> house ratio is imposed on anyone.**

**Preview framing belongs to the Studio, not to portfolio design.** The lead
image looked good *in the preview window*, and that is exactly the trap: the
preview is a window onto the page, so designing the page to fill the window
inverts the relationship. How the Studio frames a preview — its size, the
device it emulates, how much fits — is a Studio concern with no authority over
the portfolio's layout.

---

## 1. Who the first screen is for

Almost nobody arrives at a Designakum portfolio by searching. They arrive
because **the client sent them the link** — in WhatsApp, in an email, in an
Instagram bio — and they open it on a phone, standing up, with about five
seconds of patience.

That visitor is usually deciding one thing: *is this person any good?*

The page has to answer that **before it is read**, because it will be scanned
rather than read. Everything below follows from that.

---

## 2. The first five seconds

Three things must land, in this order:

| # | What lands | How |
|---|---|---|
| 1 | **Whose portfolio this is** | The name. Legible immediately, not large |
| 2 | **What they do** | One line. A noun, not a paragraph |
| 3 | **That the work is good** | **Real work, visible without scrolling** |

The third is the one that is normally got wrong, and it is the rule that
matters most:

> **At least one real piece of the client's work must be visible without
> scrolling — on a phone.**

A first screen made entirely of identity is a business card. The client did not
come to Designakum for a business card, and the visitor did not open the link
to read a title.

**The emotional target is recognition, not information.** The visitor should
form an impression of quality before they have consciously read anything. That
is only possible if an image is on screen.

**The hardest case is the only case that counts: 375px.** If the rule holds on
a phone it holds everywhere, and the phone is where the link is opened.

---

## 3. Section order

```
   1  Identity          name · what they do · photo or mark (small)
                        — and, optionally, quiet contact (§3b)
   2  THE WORK          the pieces, in the client's chosen order
   3  Introduction      the bio, in full
   4  The next step     the single primary action (§3b)
   5  Links             where else to find them
   6  Footer            the client's line, legal, quiet
```

**There is no banner.** The first piece is the visual lead. An image above the
work competes with the work, and a visitor reads it as the client's work when
it is not — so the concept moved to link previews, where an image is needed and
the portfolio cannot be seen: [share-image.md](share-image.md).

**Why the introduction sits after the work, and not before it.**

This is the one order that will look wrong to anyone used to the current page,
so the reasoning is worth stating plainly: a stranger judges a creative by
their work, and only then becomes curious about the person. Words placed before
the work ask to be read by someone who has not yet decided to care. The same
words placed after the work are read by someone who has.

This is **not** the collapsed "About" toggle returning under another name. The
bio is fully visible, unhidden, and complete — it is *sequenced*, not concealed.
Identity above already carries the one line a visitor needs to make sense of
what they are looking at.

**Order comes from content, never from settings.** A section with nothing in it
does not appear — no toggle, no empty heading, no placeholder. A portfolio with
no links simply ends after the introduction.

---

## 3a. How the work is presented — DECIDED

> **The work keeps its natural ratio. Hierarchy comes from position and scale,
> not cropping.**

**Nothing is ever cropped, packed or reordered.** Masonry and justified packing
were both rejected, and for the same reason in different clothes: masonry reads
down columns rather than across, and packing lets arithmetic decide which piece
is large. Both quietly overrule the client's sequence, and **ordering is
curation**.

### The mechanism

Each piece is drawn at its own proportions inside a **height band**:

- a piece **taller than it is wide** meets the band first and renders
  **narrower**, never taller — a 9:16 phone screenshot ends up phone-shaped,
  which is exactly what it should look like;
- a piece **wider** than the band allows is limited by its column instead, and
  its height comes down;
- so within a row every piece lands on the **same height**, and it is the
  **widths that vary** — expressing the shape of the work rather than hiding it.

That evenness falls out of the constraints. There is no measuring pass, no
packing algorithm, and no reordering.

**The band is measured in viewport WIDTH, not height.** A band that tracked
viewport height would be deciding how much horizontal room a piece gets, which
is a non sequitur — and inside the Studio's preview frame `vh` resolves against
the frame, so the same portfolio would render smaller in the preview than any
visitor would ever see it. It is tuned to roughly the column width ÷ 1.8, so
everything up to a 16:9 frame is bounded by height and rows stay even.

### The first piece

> **The first piece receives priority through position and rhythm, not forced
> size. Natural proportions always win over emphasis.**

On a wide screen it is allowed **slightly more room** — a taller band, about a
third more than the rest. That is breathing room, not a hero: a lead that fills
the screen turns a portfolio into a landing page, which §0 forbids. It also
gets a beat of extra separation before the rest of the work begins, which is
rhythm rather than scale and costs the image nothing.

**On a phone it gets no extra size at all.** In a single column every piece is
already full width, so a larger band could only ever be paid for by cropping or
distortion. Its hierarchy there comes from **appearing first**, from being the
**only work visible without scrolling**, and from **spacing and sequence**.

Giving the phone lead its own taller band — which the first implementation did
— was hero treatment under another name, and it is removed. **Full-bleed was
also considered and rejected**: it buys scale by breaking the page's margins,
which is the same gesture in different clothes.

### Verified against four disciplines

Measured in a browser, not argued:

| | photographer | UI designer | illustrator | branding |
|---|---|---|---|---|
| ratio error, desktop | 0 | 0 | 0 | 0 |
| ratio error, phone | 0 | 0 | 0 | 0 |
| rows even | ✓ | ✓ | ✓ | ✓ |
| lead band, desktop | 410px vs 307px | same | same | same |
| lead band, phone | **identical to the rest** | same | same | same |
| overflow | none | none | none | none |

The UI designer is the case that proves it: 9:16 phone screens sit beside 16:9
desktop mockups, at the same height, each its own width. A single house ratio
would have cropped both.

---

## 3b. The primary action — DECIDED

> **The primary action does not appear above the work.**

**Why.** The portfolio earns the visitor's intent before asking for action. A
call to action above the work recreates the link-in-bio hierarchy this product
is moving away from — a page that asks before it has shown anything is a page
about the person's availability, not their work.

**Where it goes.** After the visitor has seen, in this order:

1. the **work**
2. the **context** — who this is and how they think

Only then does the page suggest a next step. By that point the visitor either
wants it or does not, and the action is answering a question they have already
formed rather than interrupting to ask one.

**How it should feel.** *The next step* — not a request for permission. It
follows from what came before. It does not plead, does not repeat itself, and
does not appear more than once.

**There is exactly one.** Multiple calls to action were removed in the feature
decisions: a page with five equal asks has none.

### What identity may carry

Identity **may** include quiet contact information — an email, a handle — and
that is not a violation of §5, provided it does not compete with the work.

The test is whether it reads as *information* or as an *ask*:

| Permitted in identity | Not permitted |
|---|---|
| Contact as plain text, at tertiary weight | A filled or accented button |
| Something a visitor could choose to notice | Something that asks to be clicked |
| Sitting with the name and the one-line title | Sitting apart, styled to draw the eye |

If the contact in identity ever needs the accent colour, a border, or a verb
in the imperative, it has stopped being information and become the call to
action — and the call to action does not go above the work.

---

## 4. What earns attention

Attention is spent in two different currencies, and confusing them is what
makes pages shout.

**Area belongs to the work.** The pieces are the largest things on the page by
a wide margin. Nothing else may occupy comparable space.

**Typographic weight belongs to the name.** It is the heaviest *text* — and
still small. A name set as a headline competes with the work; a name set as a
label does not. Being the heaviest text on a page whose largest element is an
image costs nothing.

Everything else is secondary or tertiary: the one-line title, the bio, the
links, the footer, in that order of descending weight.

**Only one element may be loud at a time, and it is never chrome.** If the
language switch, a call to action and a heading are all competing, the visitor
looks at none of them.

**Nothing on a published portfolio may demand.** No pulse, no badge, no
counter, no animation that repeats, nothing that moves without being touched.
The page is finished work on display, not an interface asking for input.

---

## 5. What must never appear above the work

Only two things may sit above the work:

- **Identity** — name, one line, and optionally a small photo or mark.
- **Minimal chrome** — the language switch, quiet and out of the way.

Everything else goes below. Named explicitly, because each one has been above
the work at some point in this product's life:

| Never above the work | Why |
|---|---|
| A ticker or marquee | Removed entirely, and it was the loudest thing on the page |
| Stat tiles | A claim about the work, competing with the work itself |
| The bio, at full length | §3 |
| Custom fields | Removed entirely |
| Any empty state, hint or setup nudge | The product talking to itself on the customer's site |
| Any interstitial — cookie banner, modal, overlay | A page the visitor must dismiss before seeing anything is a page they close |
| **The primary call to action** | §3b. Quiet contact *information* in identity is allowed; an ask is not |

**Above the work is measured in weight, not only in pixels.** The language
switch may sit physically at the top and still not be *above* the work, because
it is quiet. A stat grid at the top is above the work in both senses.

**A concrete limit, so this is checkable:** the identity block must not be
taller than the first row of work. If identity needs more room than the work
gets, the hierarchy has inverted.

---

## 6. Acceptance criteria

Checkable, on a real page, in both languages:

1. On a **375 × 812** viewport, at least one piece of work is at least
   partially visible without scrolling.
2. On a desktop viewport, the **entire first row of work** is visible without
   scrolling.
3. The identity block is **no taller than the first row of work**.
4. Nothing above the work animates, repeats, or requires dismissal.
5. Every section on the page has content; no section is present and empty.
6. All of the above hold in **Arabic, RTL**, with the same order mirrored — not
   reordered.

---

## 7. Since decided, and what is still open

### Decided elsewhere

**The piece detail view — decided.** A visitor who opens a piece gets **its own
page** at `/{slug}/work/{id}-{name}`, not an expansion and not a modal. Inline
expansion was rejected because it breaks the row it sits in and reflows
everything below the visitor's finger; a modal is already excluded by §5, which
forbids interstitials above the work. See
[piece-detail.md](piece-detail.md), and
[piece-content-model.md](piece-content-model.md) for what a piece contains.

**Call-to-action placement — decided, §3b.** After the work and the
introduction, never above the work. §5 has gained the line that was waiting on
it.

**The form of the next step — decided by implementation.** It reads as a
bordered button: one destination, a product-owned label, and no styling controls
([next-step.md](next-step.md)). This was listed here as open while the renderer
had already shipped it; recorded now so the two do not disagree again.

**First-piece emphasis and aspect-ratio handling — decided, §3a.** Natural
ratios, a height band, and a slightly taller band for the lead on wide screens
only. Nothing is cropped and the phone lead gets no extra size.

**Who owns the language switch — decided.** It is **host chrome**, not part of
the renderer: it writes a stored preference and changes the language of a
document, neither of which a pure renderer may do. See
[../architecture/renderer-migration.md](../architecture/renderer-migration.md)
§1.13.

### Still open

**Where the language switch physically sits.** Constrained by §4 (quiet) and §5
(permitted above), but its position is compositional. Only its *position* is
open; its ownership is not.
