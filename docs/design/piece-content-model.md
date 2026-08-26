# The piece content model

**Approved. Nothing is built yet.**

Settles what a piece *is*, now that pieces have their own pages
([piece-detail.md](piece-detail.md)) and may carry more than one image.

> **A piece is a document, never a carousel and never a gallery viewer.**

---

## 1. The model — the DRAFT shape

```
Piece                              ← as the client edits it: projects rows
├── id           stable. Authoritative in the URL, survives every rename
├── name         { ar, en }
├── description  { ar, en }        the words that go with the work
├── media[]      ORDERED. The first is the cover
│   ├── id       stable per image, for the lifetime of the draft — §1a
│   ├── url
│   └── caption  { ar, en }        optional; renders only when written
└── link         one external URL, optional
```

That is the whole shape. Everything below is a consequence of it.

### 1a. Draft and published are two shapes, deliberately

This diagram is the **draft**. What a visitor is served is the **published**
shape in
[../architecture/published-snapshot.md](../architecture/published-snapshot.md)
§2, and the two differ in exactly two ways:

| | Draft (here) | Published (snapshot §2) |
|---|---|---|
| Media location | `url` — a full public URL, as `pages/admin.js` stores it today | `path` — a storage path, plus intrinsic `w` and `h` |
| Media identity | `id`, stable per image | **positional.** The document is immutable, so its order *is* its identity |

Neither is wrong and neither supersedes the other. **The conversion happens at
promotion** (`URL → path`), and it is specified — including what happens when a
URL does not parse — in
[../architecture/renderer-migration.md](../architecture/renderer-migration.md)
§1.5.

**Why the draft needs stable media ids and the snapshot does not.** §7a requires
that replacing an image keeps its position *and* its caption. Identifying an
image by its index breaks that the moment anything before it moves, and
identifying it by URL breaks it precisely when the URL changes — which is the
one operation §7a is about. So a draft image carries an id assigned at upload
and kept for as long as the image is in the piece; a replacement inherits the id
of the image it replaces, which is what makes "in place" mean anything.

The published document needs none of this. It is never edited, so nothing can
move underneath a reference.

---

## 2. Cover versus additional media — there is no separate cover

> **The cover is the first image. It is not a field.**

The alternative — a `cover` alongside a `media[]` — was rejected. It adds a
concept, a control ("set as cover"), and a decision the client can get wrong,
to express something ordering already expresses.

This is the same rule the portfolio already runs on, one level down:

| Level | Ordering decides |
|---|---|
| The portfolio | which piece leads, and appears first |
| **A piece** | **which image is the cover** |

A client who has learned to move a piece earlier has already learned how to
change a cover. Nothing new to teach, nothing new to get wrong.

**The consequence has to be said out loud**, because it is not obvious: moving
an image to the front of a piece changes what that piece looks like in the
portfolio grid — and if it is the *first* piece, it changes the share image
too. The editor should say so at the moment it happens rather than leaving the
client to discover it.

---

## 3. A document, not a builder

Images stack down the piece page at their natural proportions — same rules as
everywhere: no crop, no forced ratio, no carousel, no lightbox, no prev/next.

**The structure is fixed:** name, description, then the images in order, then
the link. There is exactly one place text can sit beside an image, and it is a
**caption**.

> **No interleaved text blocks.** A case study that lets the client place a
> paragraph, then an image, then two paragraphs, then three images is a page
> builder wearing a case-study costume. It is the single most likely way this
> feature turns into the thing the product exists to avoid.

The caption is the pressure valve: it lets a client annotate a specific image
without acquiring a block editor. If captions ever grow — rich text, headings,
multiple paragraphs — that is the builder arriving, and the answer is to stop.

---

## 4. Ordering

**Move earlier / move later**, exactly as pieces order within the portfolio.
No drag: it invites builder expectations and it is the one control that must
work under a thumb.

---

## 5. Empty states

| Case | Behaviour |
|---|---|
| Piece with no images | **Not reachable and not shown.** A piece with nothing to show is not a piece yet. In the Studio it is something waiting, not an error |
| Piece with one image | Entirely legitimate. Most pieces will be this |
| Piece with images, no description | The page is the work and its name. Common, and fine |
| Image with no caption | Nothing renders. No empty caption line, no placeholder |
| All captions empty | The page has no captions. It is not "missing" them |
| Ten images already added | The way to add another is simply not offered, with one sentence saying why (§6a) |

Nothing here produces a prompt, a nudge, or a completion meter.

---

## 6. Editor implications

The piece panel becomes: **images (ordered) · name · description · link ·
where it sits in your work.**

**The risk is a media manager**, and it is a real one. Three constraints keep
it a panel rather than a library:

- **A piece's images and nothing else.** No shared library, no folders, no
  reuse of one image across pieces, no browsing what has been uploaded before.
- **Short lists.** If a piece routinely holds twenty images, this stops being a
  portfolio piece and the model needs revisiting — not the panel.
- **No bulk operations.** No multi-select, no batch delete. One image at a time
  is a portfolio-sized problem.

**Two orderings now live in one panel**, and that is a genuine confusion risk:
the images within the piece, and the piece within the work. They need labels
that cannot be mistaken for each other — *"the order of these images"* against
the existing *"where it sits in your work"* — and they must not sit adjacent.

**Adding an image requires the media pipeline**, which does not exist yet. Per
the standing rule, no disabled control appears until it does.

### 6a. Three decisions about the panel

**Ten images per piece, expressed as guidance rather than a quota.**

There is no `7 / 10`, no progress bar, no meter. A counter turns a portfolio
into a form to complete and invites the client to fill it — the opposite of
curation, and the same failure as a completion percentage.

Instead: below ten, nothing about the limit is mentioned at all. At ten, the
way to add another is simply **not offered**, with one plain sentence in its
place — *"Ten images is the most a piece holds."* A statement of how the
product works, not a refusal and not an error.

**The description is labelled "About this piece".**

| Layer | Word |
|---|---|
| Interface, English | **About this piece** |
| Interface, Arabic | **عن هذا العمل** |
| Database | `description` — unchanged |

The vocabulary rule as usual: schema words stay in the schema. "Description" is
what a database calls it; "About this piece" is what a person asking would say.

**There is no alt-text field.** See §6b.

### 6b. Alt text — generated, never asked for, never required

Alt text is **generated** and **never blocks publishing**. No field appears in
v1, nothing in the queue mentions it, and no state is ever "incomplete" for
lacking it.

It is derived from the most specific text the client has already written, and
it never invents a description of an image nobody has read:

```
   1  the image's caption, if written
   2  the piece's name
   3  the client's name — a last resort, and rare
```

**Why this order.** A caption is a human sentence about that exact image, which
is what alt text is supposed to be. A piece name is weaker but true. Anything
below that is a label rather than a description, and the honest position is
that it is a floor, not a solution.

**What this deliberately is not.** Generated alt text is *better than nothing
and worse than real alt text*. Five images inheriting one piece name is a poor
experience for a screen-reader user, and this model does not pretend otherwise.
It is chosen because the alternative — a required field on every image — is
effort spent on something the client never sees, and would be filled with
whatever clears it fastest, which is worse than the name.

An override belongs in a later version, at the point it can be asked for
well — attached to an image the client is already looking at, optional, and
never a gate.

> **To verify at implementation, not assume:** when an image has both a caption
> and generated alt, a screen reader may announce the same sentence twice. That
> is a real pattern question and it needs testing with an actual screen reader
> rather than a rule invented here.

---

## 7. Publishing implications

**Media belongs to the published snapshot.** Adding, removing or reordering
images changes the draft; visitors see none of it until the client publishes.

**Storage cleanup extends per image.** The existing rule — never delete a
storage object still referenced by the published snapshot — now applies to
every image in a piece, not just a cover. An image removed from the draft stays
on disk while the live page still shows it.

**One piece is one change.** Adding three images to a piece counts as a single
change to that piece, exactly as several appearance knobs count as one. The
publish confirmation says *"your bio, and 2 pieces"*, never *"7 changes"*.

**The share image follows the first image of the first piece**, and therefore
only changes at publish ([share-image.md](share-image.md) §6).

---

### 7a. Replacing an image — DECIDED

> **Replacement happens in place.**

Removing an image and adding another is not the same gesture: it loses the
image's position and its caption, and asks the client to redo work they already
did. Replacement keeps both.

| What happens | Why |
|---|---|
| **Order is kept.** The replacement sits exactly where the old image sat | Position is curation. If replacing the second image silently moved it to the end, the client would have to re-order every time they swapped a file |
| **The caption stays attached** | The caption describes *that place in the story*, not that file. A better crop of the same photograph should not cost the client their sentence |
| **It is a draft change** | Like every other edit. Visitors see nothing until publish |
| **The published snapshot keeps serving the old object** | Until promotion, the live page must not change under a visitor. The old file stays reachable because something published still points at it |
| **Cleanup follows the existing media rules** | An object is deleted only when neither the draft nor the published snapshot references it — the rule already written for covers, unchanged (§7) |

**The consequence worth stating:** replacing the *first* image of the *first*
piece changes both the portfolio grid and the share image — and, like every
other change, only at publish. Same as reordering (§2), for the same reason.

---

## 8. The primary action on a piece page — DECIDED

> **The same next step, repeated. Not a second call to action.**

A visitor who arrives from a shared link may never see the portfolio's version,
so the piece page must carry it. But it is the **same action** — one label, one
destination, defined once on the portfolio:

- **Not configurable per piece.** A per-piece action would be a second ask, and
  the feature decisions allow exactly one.
- **Not a different label.** If the client changes the next step, it changes
  everywhere, because there is only one of it.
- **Placed after the work and the context**, as on the portfolio (hierarchy
  §3b) — the piece page shows the images and the description first, and only
  then suggests a step.

### Where it sits in the page

```
   ← Noura Al-Harbi
   Layla, at home
   the description

   the images, in order

   View the full project ↗          the piece's own link, if any
   ─────────────────────────
   [ the next step ]                the portfolio's single action

   More of Noura's work             the rest, as the same grid
   ┌──────┐ ┌──────┐ ┌──────┐
```

**The page ends on the work, not on the ask.** The next step comes once the
visitor has seen this piece; the remaining work follows, so the last thing
offered is more to look at rather than a demand. That is the same reason
prev/next was refused: browsing, not flipping — and a page that closes with a
call to action closes the portfolio.

---

## 9. Resolved

**Alt text** — generated, never asked for, never required. §6b.

**How many images** — **ten per piece**, as guidance rather than a quota. §6a.
The number is a judgement about what a portfolio piece is: past ten, the client
is building a photo gallery, and the right response is to revisit the model
rather than raise the number.

**The credibility line does not appear on a piece page.** It is identity-level,
and a piece page is not the portfolio. A visitor who lands there from a shared
link gets the work, the words about it, and one next step — a claim about the
client's experience belongs where the client is introduced, not where a single
project is shown.

---

## 10. Still open

Nothing. Every question this model raised is answered above; what remains is
implementation, and the media pipeline it depends on.
