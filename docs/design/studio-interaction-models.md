# Studio — structure and interaction models

**Status: approved.** The §7 decisions are resolved and the working prototype
is [`../ux/prototype/studio-home.html`](../ux/prototype/studio-home.html),
which is the source of truth for Studio Home. Structure and UX only; polish
deliberately absent. Once a model is chosen this folds into
[`../product/designakum-blueprint.md`](../product/designakum-blueprint.md) §6
and this file is deleted — it is a decision document, not a second blueprint.

Checked against [`design.md`](design.md), [`references/`](references/), and the
constraints in blueprint §8 (live preview) and §9 (content model).

---

## 1. What the premise changes

The new premise: **AI has already produced initial portfolio directions before
the client's first Studio screen.** AI generation is treated as an existing
capability — nothing here designs the infrastructure.

This replaces two stages of the approved journey:

| Stage | Was | Becomes |
|---|---|---|
| 4 · Empty dashboard | "the most important screen": a blank portfolio and a three-step ask — name → photo → first project | **Intake, then a choice of directions.** The blank state is never shown |
| 5 · Portfolio creation | fill fields beside a live preview, from empty | **Refinement of a populated draft.** The user changes what exists; they never assemble it |

Stages 1–3 and 9–15 are unaffected. Publishing, payment, cancellation and the
live-preview architecture all stand.

**The blank-page problem is not solved by the AI. It is moved.** Previously the
user faced an empty portfolio. Now they face a choice between directions — a
much better problem, but only if the choice is small, concrete and reversible.
Six directions is a new blank page.

---

## 2. What a "direction" is — the definition that decides everything

Without a precise definition this becomes a theme picker, which is a CMS
pattern.

> **A direction is a complete presentational and editorial treatment of the
> client's own material.** It decides layout, type pairing, colour, density,
> image treatment, section order, *and the written voice* of the tagline and
> bio.

Two consequences:

**It is not a template, and not a theme.** A theme is a skin over fixed
content. A direction is applied *to the user's actual work* and rewrites the
words to match its own register. "Quiet editorial" and "Bold studio" do not
differ only in colour; they differ in what the bio sounds like.

**It is presentation, never content.** Per design.md §1, the client owns
content and emphasis; Designakum owns structure and presentation. The AI may
propose words; the client's work, name and facts are theirs and are never
invented. A direction that fabricates a project is a defect, not a feature.

**Three directions, never more.** Three is a choice; six is a decision the user
did not want to make (design.md principle 2). Each carries a name in human
language and a one-line reason it might suit them — not a feature list.

---

## 3. The flow — five screens

### Screen 1 · Intake

The only screen that asks before it gives. Every field must earn itself.

```
┌──────────────────────────────────────────────────────────┐
│  ◇  Designakum                                    ع / EN  │
│                                                           │
│         Let's build your portfolio.                       │
│         Three questions, then we'll show you              │
│         three ways it could look.                         │
│                                                           │
│    Your name        [ Noura Al-...            ]           │
│    What you do      [ Photographer         ▾  ]           │
│    Your work        ┌──────────────────────────┐          │
│                     │  drop 3–6 pieces here    │          │
│                     │  or choose files         │          │
│                     └──────────────────────────┘          │
│                     ▣ ▣ ▣ ▣                               │
│                     Four added. Three is enough.          │
│                                                           │
│                     [  Show me the directions  ]          │
│                     I'll add work later →                 │
└──────────────────────────────────────────────────────────┘
```

Notes:
- **Profession is a chosen noun, not free text.** It drives the direction set,
  the placeholder vocabulary and the section order. A free-text field here
  produces "Creative Enthusiast ✨" and a worse portfolio.
- **The work upload is the pivotal decision** — see §7 decision 1. As drawn,
  directions are rendered with the client's real images, which is what makes
  the next screen land.
- No account fields. Signup already happened (stage 1).
- Progress is not a stepper. Three questions on one screen is not a wizard.

### Screen 2 · Directions

The moment the product earns its price.

```
┌──────────────────────────────────────────────────────────┐
│  ◇  Designakum                                    ع / EN  │
│                                                           │
│  Three directions for your portfolio.                     │
│  Pick one to start. You can change everything later.      │
│                                                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐          │
│  │ ▨▨▨▨▨▨▨▨▨▨ │  │ ▨▨▨▨▨▨▨▨▨▨ │  │ ▨▨▨▨▨▨▨▨▨▨ │          │
│  │ ▨ REAL   ▨ │  │ ▨ REAL   ▨ │  │ ▨ REAL   ▨ │          │
│  │ ▨ WORK   ▨ │  │ ▨ WORK   ▨ │  │ ▨ WORK   ▨ │          │
│  │ ▨▨▨▨▨▨▨▨▨▨ │  │ ▨▨▨▨▨▨▨▨▨▨ │  │ ▨▨▨▨▨▨▨▨▨▨ │          │
│  ├────────────┤  ├────────────┤  ├────────────┤          │
│  │ Quiet      │  │ Bold       │  │ Editorial  │          │
│  │ Lets the   │  │ Big covers │  │ Reads like │          │
│  │ work speak │  │ , short    │  │ a magazine │          │
│  │            │  │ words      │  │            │          │
│  │ [ Preview ]│  │ [ Preview ]│  │ [ Preview ]│          │
│  └────────────┘  └────────────┘  └────────────┘          │
│                                                           │
│           Start with this one  ▸                          │
└──────────────────────────────────────────────────────────┘
```

Rules:
- **Each card is the real portfolio, rendered small** — same renderer, real
  images, real name. Not an illustration of a layout.
- **Preview** opens that direction full-screen, at real size, before committing.
  Choosing is the hard step; it deserves a real look (Framer).
- **The reason line is about them, not about the design.** "Lets the work
  speak", not "minimal grid layout with generous whitespace".
- Nothing here is permanent, and the screen says so once, quietly.
- No "generate more" button. It converts a choice into an infinite lobby.

### Screen 3 · The draft arrives

The client lands **inside their finished-looking portfolio**, not in a
dashboard. One line of orientation, then it gets out of the way.

```
┌──────────────────────────────────────────────────────────┐
│ ◇  Noura Al-…    Quiet          ⟳ Saved      [ Publish ]  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│   This is your portfolio. Change anything by              │
│   clicking it.                              [ Got it ]    │
│                                                           │
│   ┌────────────────────────────────────────────────┐     │
│   │                                                │     │
│   │        NOURA AL-…                              │     │
│   │        Photographer, Riyadh                    │     │
│   │                                                │     │
│   │        [bio the AI wrote, in her register]     │     │
│   │                                                │     │
│   │   ▨▨▨▨▨▨▨▨   ▨▨▨▨▨▨▨▨   ▨▨▨▨▨▨▨▨              │     │
│   │   her work   her work   her work               │     │
│   │                                                │     │
│   └────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

- **No tour, no modal, no checklist.** One sentence, dismissible, never again.
- The AI-written words are **marked as suggestions on first view only** — a
  quiet underline and "we wrote this — change it". Once edited or accepted, the
  mark is gone forever. Permanent AI badges tell the client their portfolio
  isn't theirs.
- Missing things are **worded, not blank** (design.md principle 9). A client who
  skipped upload sees framed placeholders saying what belongs there.

### Screen 4 · Refinement

The three candidate models are §4. All share:
- A live preview rendered by the component intended to become the public page
  (blueprint §8.2a — one *final* renderer, not a premature extraction).
- Explicit save state, never ambiguous (§6.4).
- A language toggle that switches the whole surface, chrome included.
- **Changes offered as choices wherever a choice is possible**: a tagline shows
  three alternatives and an edit box, not an empty field. This is the mechanism
  that makes refinement not-building.

### Screen 5 · Publish

Unchanged from the approved journey, stages 10–12. The direction chosen in
screen 2 has no effect on the publishing model.

---

## 4. Three interaction models

Each corresponds to a prototype already in `docs/ux/prototype/`, so none of
these is theoretical.

### Model A — Editor beside the live page
*(`studio-trial.html`; the currently approved blueprint §6.3)*

```
┌──────────────────────────────────────────────────────────┐
│ ◇  Noura      Quiet         ● 3 changes      [ Publish ]  │
├───────────┬──────────────────────────────────────────────┤
│ PORTFOLIO │  ┌────────────────────────────────────┐      │
│  Overview │  │                                    │      │
│ ▸ Profile │  │      NOURA AL-…                    │      │
│  Home     │  │      Photographer, Riyadh          │      │
│  Projects │  │                                    │      │
│  Links    │  │   ▨▨▨▨   ▨▨▨▨   ▨▨▨▨              │      │
│  Look     │  │                                    │      │
│           │  └────────────────────────────────────┘      │
│ INSIGHTS  │        ▣ desktop   ▢ mobile                  │
│  Visitors ├──────────────────────────────────────────────┤
│           │  Name    [ Noura Al-…              ] ع/EN    │
│ SETTINGS  │  Title   [ Photographer            ]         │
│  Address  │  Bio     [ ...                     ]         │
│  Plan     │          ↻ three other ways to say this      │
│  Account  │  Photo   [ ▣ replace ]                       │
└───────────┴──────────────────────────────────────────────┘
```

**Strengths.** Every field has an obvious home. Bilingual pairs fit naturally on
one control. Long-form editing (a bio) is comfortable. Compatible with the
approved preview architecture as-is. Cheapest to build — the shell exists.

**Weaknesses.** It is the shape of a CMS, and that shape is what the founder
called *generic*. The user's attention is in a form; the portfolio is a picture
of a result. Nav + section list + form is three levels of chrome before the
work. Two columns collapse badly below 1100px.

### Model B — Direct manipulation on the portfolio
*(`studio-canvas.html`)*

The portfolio is the only surface. Click your name, type. Click a project,
a small control appears beside it. Appearance lives in one tray.

```
┌──────────────────────────────────────────────────────────┐
│ ◇  Noura                    ● 3 changes      [ Publish ]  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│        NOURA AL-…                                        │
│        ┌ Photographer, Riyadh ┐  ← selected, editing      │
│        └──────────────────────┘                           │
│           ↻ rewrite   ع add Arabic   ⌫                    │
│                                                           │
│        [bio]                                              │
│                                                           │
│   ▨▨▨▨▨▨▨▨   ▨▨▨▨▨▨▨▨   ▨▨▨▨▨▨▨▨                        │
│                                                           │
│                                    ┌──────────────┐       │
│                                    │ ◱ Look       │  tray │
│                                    │ accent ●●●●  │       │
│                                    │ paper  ●●●   │       │
│                                    └──────────────┘       │
└──────────────────────────────────────────────────────────┘
```

**Strengths.** Strongest "I created something" feeling of the three — there is
no software between the user and their portfolio. No form shapes at all. One
surface, so mobile is the same product rather than a degraded one. Best
expression of Apple's direct-manipulation lesson.

**Weaknesses, and one is severe.**

> **Architectural conflict.** Blueprint §8 renders the preview as the *real
> public page in an iframe*, and §8.6 explicitly **rejects** rendering the
> public page inside the Studio's React tree. Pure Model B needs editing
> affordances inside that page — which means either breaking that rejection, or
> an overlay positioned over the iframe, which must survive scroll, resize,
> font loading, RTL mirroring and every responsive breakpoint. The existing
> prototype avoids this by rendering the site directly, i.e. by taking the
> rejected option.

Also: bilingual editing has no natural home (where does the Arabic version of a
selected line live?); long text in situ is awkward; and discoverability depends
on the user knowing things are clickable — one dismissible sentence is thin
support for that. Settings that are not part of the visible page — address,
plan, account — have nowhere to go and need a second surface anyway.

### Model C — Guided refinement
*(`studio-first-screen.html`)*

The product proposes the next improvement, one at a time. The user answers or
skips. Refinement is a queue, not a surface to explore.

```
┌──────────────────────────────────────────────────────────┐
│ ◇  Noura      Quiet         ● 3 changes      [ Publish ]  │
├──────────────────────────────────────────────────────────┤
│   ┌────────────────────────────────────────────────┐     │
│   │        NOURA AL-…                              │     │
│   │        Photographer, Riyadh                    │     │
│   │   ▨▨▨▨▨▨▨▨   ▨▨▨▨▨▨▨▨   ▨▨▨▨▨▨▨▨              │     │
│   └────────────────────────────────────────────────┘     │
│                                                           │
│   A few things waiting                                    │
│                                                           │
│   ┌──────────────────────────────────────────────┐       │
│   │ Your bio suggestion is ready.                 │       │
│   │ [ keep it ]  [ another way ] [ write mine ]  │       │
│   └──────────────────────────────────────────────┘       │
│   ┌──────────────────────────────────────────────┐       │
│   │ Three pieces could use names.                │       │
│   │ [ name them ]                        skip →  │       │
│   └──────────────────────────────────────────────┘       │
│                                                           │
│   Everything else →                                       │
└──────────────────────────────────────────────────────────┘
```

**Strengths.** Removes the most decisions of the three — the user never asks
"what should I do next", which is the emotional core of the whole product.
Directly implements Lumetra's attention-queue principle and design.md
principle 8 (summaries are navigation). Excellent on mobile. Empty queue is a
meaningful, satisfying state: *"Ready when you are."*

It also **de-risks staged publishing**: the blueprint's objection to staged
changes was that a client edits for a week and forgets to publish. A home
screen that is an attention queue carries that item persistently, so the two
decisions hold each other up.

**Weaknesses.** Poor for the returning client who knows exactly what they want
to change — a queue is an obstacle when you have an intent. It cannot be the
only surface; "everything else" has to lead somewhere, which means one of A or
B exists underneath it regardless. Risk of feeling like a nag if the queue
never empties, so the queue must be finite and must genuinely empty.

### Tradeoffs at a glance

| | A · Editor | B · Direct | C · Guided |
|---|---|---|---|
| Feels like a product, not a dashboard | weak | **strong** | strong |
| "I created something professional" | weak | **strong** | medium |
| Decisions removed | few | few | **most** |
| Bilingual editing | **natural** | poor | natural |
| Mobile | poor | **good** | **good** |
| Returning user with an intent | **good** | good | poor |
| Discoverability | **high** | low | **high** |
| Fits approved preview architecture | **yes** | **conflicts** | yes |
| Build cost | **low** | high | medium |
| Risk of becoming a builder | medium | **high** | low |

---

## 5. Recommendation

**C over A, with one borrowed gesture from B. Not B as the primary surface.**

Concretely:

1. **Overview is the refinement queue (C).** It is the Studio's home and
   answers "what should I do next?" — never a dashboard of metrics.
2. **"Everything else" opens the editor (A)**, with the section list. This is
   where a returning client with an intent goes directly, and where bilingual
   pairs and long text live comfortably.
3. **The preview is clickable, and selection scrolls the editor to that field
   (B's gesture, without B's architecture).** Click the tagline in the preview,
   the editor scrolls to the tagline and focuses it. This needs only a
   coordinate-free message from the iframe naming which field was clicked —
   which the §8.3 draft channel already carries, in the opposite direction. The
   user gets "I touched the thing itself"; we keep one renderer and add no
   overlay.
4. **Appearance stays the small defensible set** — accent, banner treatment,
   display font, density. Unchanged from blueprint §6.3, and it is where "not a
   website builder" is won or lost.

Why not B, despite it scoring highest on feel: it is the only option that
requires reopening a settled architectural decision, and it is the option most
likely to slide into a builder — once things are directly manipulable, "let me
just move that" is the next request, and the answer has to be no.

This composite adds one genuinely new surface (the queue) and one new message
type. It does not require a second renderer, a draft table, or a dependency.

---

## 6. Checked against the constitution

| Rule | How this satisfies it |
|---|---|
| One screen, one question | Intake: *who are you*. Directions: *which way*. Overview: *what next*. Editor: *change this* |
| Remove decisions, not capability | Three directions. Choices before fields. A finite queue |
| Confidence over comprehensiveness | The draft arrives finished; depth is reached through "everything else" |
| Premium is restraint | The wow is the client's own work rendered well, not effects |
| Every state names its exit | Queue items say what clears them; empty queue says "it's ready" |
| Numbers are sentences | "Four added. Three is enough." |
| Summaries are navigation | Every queue item is the link to the field it names |
| Arabic is the home register | Language toggle switches chrome and content; bilingual pairs on one control — the reason B was not chosen outright |
| Forbidden: dashboard overload | Overview is a queue, not tiles |
| Forbidden: technical language | No slug, tenant, draft, entitlement anywhere in these screens |
| Forbidden: too many options | Three directions, no "generate more", appearance stays small |
| Motion | One flourish, once: the activation moment. Nothing here adds another |

| Reference | Applied |
|---|---|
| Lumetra — attention over dashboards | Overview **is** the queue; empty is the goal |
| Lumetra — meaningful empty states | Missing work is framed and worded, never blank |
| Apple — the product is the frame | Chrome recedes; the client's work is the largest thing |
| Apple — reversibility over confirmation | "You can change everything later", said once and meant |
| Apple — depth is reached, not displayed | "Everything else →" |
| Linear — act in place | Queue items resolve from the row |
| Linear — perceived speed | Draft channel, no save-to-see |
| Framer — never start from nothing | The entire premise |
| Framer — choosing a direction is a real step | Screen 2, with full-size preview before committing |
| Framer — **the boundary** | Directions are presentation. No canvas, no layers, no breakpoints, no page tree |

---

## 7. Decisions — resolved

All four were settled by the owner. Kept here as reasoning; the binding
statements live in the blueprint.

1. **Intake encourages work, never requires it.** "Show us your work", with a
   visible skip that is honest about the cost — real work makes better
   directions.
2. **AI generates both languages, always as a suggestion.** The client owns the
   final wording, Arabic is held to the same standard as English, and nothing
   AI wrote is published without a deliberate human act. The publish
   confirmation surfaces suggestions the client has not looked at.
3. **Direction may be changed later — presentation only.** Typography, colour,
   layout, density, section order. It writes zero content fields, so no
   "user edited this" flag is needed anywhere; new wording arrives as a
   suggestion in the queue instead.
4. **Staged publishing: edit → draft → preview → publish.** Draft and published
   are separate states and the draft renderer is the source of truth for
   preview. This overturned the earlier save-is-live recommendation — see
   blueprint §8.5.

### The questions as originally posed

**1 — Does intake require uploading work?** *(the important one)*
Directions rendered with the client's real images are the difference between a
genuine moment and a stock-photo trick that collapses when their own work lands
in it. But it is a heavier first step and will cost some completions. The
wireframes assume **yes, 3–6 pieces, with a visible skip** that leads to
directions shown with framed placeholders and honest wording.

**2 — Does the AI write both languages?**
A direction rewrites the tagline and bio. If it writes English only, every
client starts half-empty in the language the brand is built on, and Arabic
becomes the translation layer the product says it is not. If it writes both,
the Arabic must be good enough to ship — Arabic that reads as translated is
worse than none. Recommendation: **generate Arabic first, English second**, and
if quality cannot be assured, generate neither and keep the fields honestly
empty rather than shipping bad Arabic.

**3 — Can the client change direction after choosing?**
Recommendation: **yes, from Appearance, and it re-treats presentation only —
never their edited words.** Once a client has rewritten their bio, no direction
change may overwrite it. This needs to be true in the content model, not just
in the UI.

**4 — Confirm blueprint §8.5 stands** — save is live for a published portfolio.
Nothing here depends on staged changes, but the queue's wording changes if a
staging model is ever adopted.
