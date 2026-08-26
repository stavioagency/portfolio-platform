# Studio editor — interaction model

**Status: approved, with the decisions in §11 resolved. No implementation
yet.** Folds into
[`../product/designakum-blueprint.md`](../product/designakum-blueprint.md) §6.3
once approved, and this file is deleted.

The question it answers:

> How does someone improve their portfolio without feeling like they are
> filling out a website?

---

## 1. What the prototypes already proved

Four trials exist in `../ux/prototype/`. Three of them tested this exact
question and the answers are more useful than anything invented fresh.

### studio-trial.html — nav → forms → preview

The classic arrangement. **Worked:** bilingual pairs and long text are
genuinely comfortable in real form controls; the publish surface (before and
after payment) is well handled. **Failed:** it is the CMS shape. Three layers
of chrome — nav, section list, form — stand between the client and their work,
and the portfolio is reduced to a picture of a result. This is the shape the
founder called *generic*.

### studio-trial-2.html — the structural inversion

Its own header states the three rules it existed to prove:

> 1. **The canvas is the page.** Not in a card, not scaled, not a rail. There
>    is no section nav, because you navigate by looking at your own site.
> 2. **Editing is on the object.** Structural objects borrow an inspector and
>    only ever show their own fields. **At rest, zero form fields are visible.**
> 3. **Publishing is ambient.** One pill, loud only at the moment itself.

**This is the closest thing to right that exists**, and the model below is
Trial 2 corrected rather than a new idea.

### studio-canvas.html — pure direct manipulation

Edit in place, drag to reorder, appearance tray. Its own header concedes it is
a hypothesis. **Worked:** the feeling — nothing between the client and their
site. **Failed:** three ways. Drag-to-reorder is builder creep. In-situ editing
has nowhere to put a bilingual pair or a long introduction. And it renders the
site directly in the Studio's own tree, which blueprint §8.6 rejects, because
that is a second renderer.

### studio-home.html — shipped

Proved the parts this model depends on: the real renderer in an iframe on draft
data, click → field mapping with no overlay, draft and published as separate
states, and a queue that empties.

---

## 2. The recommended model — the canvas and the focus panel

> **The editor is not a separate destination. It is Studio Home with a panel
> open.**

One screen, three states:

| State | What is on screen |
|---|---|
| **Resting** | The portfolio, and *a few things waiting*. This is Studio Home, already built |
| **Editing** | The portfolio, and one focus panel for one region. The queue steps aside |
| **Index** | Four or five destinations, listing what can be changed — the backstop for anyone who does not guess the canvas is clickable. Not navigation, and it does not grow (§11.3) |

**The two states have different shapes, and that is deliberate.** At rest the
portfolio preview dominates and the queue sits beneath it; only while editing
does the portfolio move beside a panel. They answer different questions:

> Home asks **"does my portfolio exist, and does it look good?"**
> The editor asks **"what happens when I change this?"**

A permanent split layout would answer neither. It would also turn Studio Home
back into a dashboard — a screen of panels sitting side by side, which is the
exact shape this model was built to escape. The split is earned by an edit and
released when the panel closes.

The **device switcher** — desktop, tablet, phone — belongs to both states. It
is named for what a *visitor* is holding rather than for a screen-size class,
because the client is previewing someone else's experience, not managing
breakpoints.

Why this refines rather than builds: **there is no global form, no section
tree, no page list, and nothing to assemble.** The only thing a client can do
is improve something already in front of them. Builder creep has nowhere to
enter, because there is no surface that represents *structure*.

### The two corrections to Trial 2

**Editing is not literally in the page.** Trial 2 and the canvas trial both put
editing affordances inside the portfolio. That requires the renderer to know
about the Studio, which breaks the contract in
[`../product/designakum-blueprint.md`](../product/designakum-blueprint.md) §8.2
and the rejection in §8.6. Corrected: clicking a region in the preview opens
the focus panel **outside** the frame, scrolled to that region and focused on
the right field. The client still touches the thing itself; the renderer stays
pure. This mechanism is already shipped and working on Studio Home.

**The inspector handles text too.** Trial 2 reserved its inspector for
structural objects and edited text in situ. Bilingual pairs and a long
introduction need a real control, so all editing happens in the panel.

---

## 3. Why the three named models were rejected

Judged on the criteria that were asked for, not on looks.

| | **A** editor beside preview | **B** direct manipulation | **C** guided only | **Canvas + panel** |
|---|---|---|---|---|
| Simplicity | poor — three chrome layers | high, until bilingual | highest | high |
| Mobile | poor — two columns collapse | good | good | good |
| **Arabic** | good | **poor** | good | good |
| Maintenance | low | **high** | low | low–medium |
| **Builder creep** | medium | **highest** | lowest | low |
| Confidence | medium | high | poor when returning | high |

**A fails on its own terms now.** The constraints for this phase rule out a
left sidebar with many sections and endless forms — which is what A *is*. Its
virtue, a real control for real text, survives inside the panel.

**B fails on Arabic and on maintenance.** In-situ editing has no home for the
second language, and an Arabic value inside an English interface needs its own
direction, which an in-place caret cannot express. Maintenance is worse: either
editing lives inside the renderer, or an overlay must survive scrolling,
resizing, font loading, every breakpoint and RTL mirroring. And it is the model
most likely to slide — once things are directly manipulable, *"let me just move
that"* is the next request, and the answer has to be no.

**C cannot be the only surface.** A queue is an obstacle to a returning client
who knows exactly what they want to change. It stays as the resting state,
which is the job it is good at.

---

## 4. The focus panel

**Four scopes. Not five, not a growing list.** They mirror the content model in
blueprint §9, so a new panel would mean a new kind of content, which is a
product decision rather than a UI one.

| Panel | Holds |
|---|---|
| **You** | name, title, introduction, photo — cropped in the panel, never in a modal (§11.4) |
| **This piece** | cover, name, description, link |
| **Links** | where people can find you |
| **Look** | accent, banner, font, density — the small defensible set (§4a) |

Rules:

- **One panel at a time.** Opening another closes the first.
- **A panel shows only its own fields.** At rest, zero fields are visible —
  Trial 2's rule, kept.
- **No save button.** The rule, decided:

  > **Draft changes save automatically. Publishing is the deliberate action
  > that makes changes visible to visitors.**

  A quiet *saved* tick confirms the work is kept. Nothing else about saving
  appears anywhere in the Studio.
- **Never a modal.** No backdrop, nothing that hides the portfolio. If the
  client cannot see the effect, the panel has failed.
- **Closing** is Esc, clicking the canvas, or the panel's own close.

> **This reverses blueprint §6.4's "never autosave silently", and the rewrite
> is approved.** The old rule existed because saving *was* publishing, so a
> silent save was a silent broadcast. Staged publishing removed the danger: the
> draft is private, and the deliberate act the client must never be confused
> about is now *publish*. §6.4 is rewritten to the rule above when this folds
> into the blueprint.

### 4a. Naming the fourth panel

The panel holds accent, banner treatment, display font and density. Four names
were considered, and **Arabic decides it**.

| English | Arabic | Verdict |
|---|---|---|
| **Look** | «المظهر» | **Chosen.** Short, plain, in the product's register |
| Appearance | «المظهر» | Same Arabic word. Correct but bureaucratic — it is the vocabulary of a system settings pane, and it is the current admin's word |
| Style | «النمط» / «الأسلوب» | **Rejected.** In English it is the builder's word — every page tool has a Styles panel — and it implies CSS-level control we do not offer. Neither Arabic option fits: «النمط» is technical (pattern/mode), «الأسلوب» means manner, and reads as *writing* style |
| Feel | «الإحساس» | **Rejected.** Vague as a destination — it does not say what you will change — and the Arabic means emotion or sensation, which is simply wrong on a control |

**The useful finding: Arabic collapses "Look" and "Appearance" into one word,
«المظهر», which is the natural term either way.** So the choice is purely an
English one and costs nothing bilingually.

**Chosen: "Look" / «المظهر».** Its one weakness is that *look* can read as an
imperative — a worry only in a list, and the Index reads as nouns throughout:
*You · Work · Links · Look*. If the imperative reading ever grates in use,
"Appearance" is a drop-in replacement with identical Arabic.

**A near miss worth recording so it is not re-proposed.** *"Direction"* is
attractive in English — it ties the panel to the moment the client chose a
direction, and changing direction is explicitly allowed. It **fails in
Arabic**: «الاتجاه» is the everyday word for text direction, RTL versus LTR.
Naming a colour-and-font panel "Direction" in an Arabic-first product would
collide with the one piece of vocabulary that must stay unambiguous.

---

### Bilingual fields

- **One control carries both languages**, switched on the field itself — never
  a page-level toggle that silently changes what you are editing.
- **Text direction follows the field's language, not the interface's.** An
  Arabic value is RTL while the surrounding interface is English. This is what
  "Arabic is a real mode" means at the level of a single input.
- **The empty second language is visible, not silent** — a quiet marker, never
  an error, and never a blocker on publishing.

---

## 5. Suggestions

The client owns every word. A suggestion is an offer that expires on contact.

**Where.** Attached to the field it concerns, inside the panel. Never floating,
never a separate review screen, never in the portfolio itself.

```
  Introduction
  ┌──────────────────────────────────────────────┐
  │ I photograph people the way they actually    │
  │ are — unhurried, in their own light.         │
  └──────────────────────────────────────────────┘
  ◇ Suggestion   [ Keep this ]  [ Try another way ]  [ Write mine ]
```

**Rules.**

- The words **"AI"** and **"generated"** never appear. It is a *suggestion*.
- **It never silently changes published content.** It lives in the draft; the
  publish confirmation names how many suggestions were never looked at.
- **It disappears permanently** once kept or rewritten. A standing badge would
  tell the client their portfolio is not theirs.
- It is **never styled as a problem** — no amber, no warning icon, no count of
  "unresolved" anything. It is grey and quiet, and ignoring it forever is a
  legitimate outcome.
- *Try another way* replaces the suggestion in place. It does not open a
  gallery of variants to choose between — that is a decision the client did not
  ask to make.

---

## 6. Publishing, from inside the editor

Unchanged, and deliberately so. The header keeps the one sentence — *"Your
latest changes aren't live yet"* — and the Publish action. The panel never has
its own publish, and never its own save.

The client's mental model, in one line the interface actually says:

> **Only you can see this until you publish.**

**Not built:** version history, revisions, restore points, a diff view, or any
comparison of draft against published beyond the plain-language summary in the
publish confirmation.

---

## 7. Wireframes

### The first editor screen — desktop, a piece selected

```
┌──────────────────────────────────────────────────────────────────┐
│ ◇  Noura Al-Harbi          ● Your latest changes aren't live yet │
│                                                     [ Publish ]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────┐  ┌────────────────────┐  │
│  │                                    │  │ This piece      ✕  │  │
│  │      NOURA AL-HARBI                │  │                    │  │
│  │      Photographer, Riyadh          │  │  Cover             │  │
│  │                                    │  │  ┌──────────────┐  │  │
│  │      [introduction]                │  │  │   ▨  replace │  │  │
│  │                                    │  │  └──────────────┘  │  │
│  │   ▨▨▨▨▨▨   ▨▨▨▨▨▨   ▨▨▨▨▨▨        │  │                    │  │
│  │   ▔▔▔▔▔▔ selected                  │  │  Name       ع EN   │  │
│  │                                    │  │  [ Layla, at h…]   │  │
│  │                                    │  │                    │  │
│  └────────────────────────────────────┘  │  Description       │  │
│    Only you can see this until you       │  [              ]  │  │
│    publish.              ▣ desk ▢ mobile │                    │  │
│                                          │  Link              │  │
│                                          │  [              ]  │  │
│                                          │                    │  │
│                                          │  ← earlier  later →│  │
│                                          │  ✓ saved           │  │
│                                          └────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

The portfolio does not shrink into a thumbnail when the panel opens — it keeps
the majority of the width, and the selected region is outlined *in the
portfolio*, so the connection between control and effect is visible rather than
remembered.

### Resting — no panel

Studio Home, unchanged and already built: portfolio, *a few things waiting*,
address, *everything else*.

### Mobile — a piece selected

```
┌───────────────────────┐
│ ◇ Noura      [Publish]│
├───────────────────────┤
│                       │
│   NOURA AL-HARBI      │   the portfolio stays visible
│   Photographer        │   and scrolls itself so the
│                       │   selected piece is in view
│   ▨▨▨▨▨▨▨▨▨▨▨▨       │
│   ▔▔▔▔▔ selected      │
│                       │
├───────────────────────┤
│  This piece        ✕  │   sheet, ~55% height
│                       │
│  Name         ع EN    │
│  [ Layla, at home  ]  │
│                       │
│  Description          │
│  [                 ]  │
│                       │
│  ✓ saved              │
└───────────────────────┘
```

---

## 8. The flows

**First visit, after choosing a direction.** The canvas opens on a finished
draft. One line, dismissible, never shown again: *"This is your portfolio.
Click anything to change it."* No tour, no checklist, no modal. The queue
carries the two or three offers.

**Returning.** The canvas, the publish state, and the queue. A client with an
intent clicks the thing they came to change; a client without one reads the
queue. Neither is made to navigate.

**Clicking an element.** The region outlines, the panel opens on it, the first
field takes focus. Clicking a different region swaps the panel's contents
rather than opening a second one.

**Making a change.** The portfolio updates as they type — same channel, same
renderer, no save, no reload. Entrances do not replay: the page must not twitch
while someone is typing into it.

**Reviewing a suggestion.** It sits under the field it concerns. Keep it, try
another way, or write your own. Then it is gone.

**Publishing.** From the header, wherever they are. The confirmation names what
will change in plain language and how many suggestions were never looked at.
Afterwards the header goes quiet: *up to date*.

---

## 9. Mobile behaviour

- **One column, always.** No side-by-side, ever — a two-column editor on a
  phone is two unusable columns.
- The portfolio is **full width at the top and stays visible** while the sheet
  is open. It scrolls itself so the selected region sits above the sheet.
- The sheet takes roughly **55% of the height**, dismissed by swiping down or
  its own close.
- **Live update while typing is the point** — if the sheet ever covers the
  thing being edited, the design has failed.
- Reordering uses **move earlier / move later**, which needs no drag target and
  works with a thumb. Ordering is curation, not layout control (§11.1).

---

## 10. Arabic and RTL

- The canvas renders **RTL as a real layout**, not a mirror — it is the same
  renderer that serves Arabic visitors.
- The panel opens on the **inline-end** side and mirrors wholesale: its close
  affordance, its field alignment, its *earlier/later* arrows.
- **Per-field direction**, as in §4: an Arabic value is RTL inside an English
  interface.
- Reem Kufi for display only, **no letter-spacing on Arabic**, no uppercase,
  **Latin numerals in both locales**.
- Arabic copy is written to be natural in Arabic, not translated from the
  English — the pattern already set in `lib/studio/strings.js`.

---

## 11. Decisions — resolved

**1 — Ordering: kept, dragging removed.**

> **Ordering is curation, not layout control.**

The client sequences their work with **move earlier** and **move later** on the
piece panel. This settles the conflict with blueprint §5 stage 6, which had
said *"order by drag"*: the capability survives, the gesture does not. Explicit
actions also work with a thumb, need no drop target, and are announceable to a
screen reader — a drag handle is none of those things, and it invites the
builder expectations this whole model exists to avoid.

**2 — Autosave: rewrite approved.** The rule is in §4:

> Draft changes save automatically. Publishing is the deliberate action that
> makes changes visible to visitors.

Blueprint §6.4 is rewritten to this when the model folds in.

**3 — The Index: kept, and fenced.**

It exists only as a lightweight way to find editing areas. The fence, which is
the part that matters:

- **It is not navigation.** It does not persist, does not highlight a "current"
  location, and nothing routes to it.
- **No sidebar**, in any state, at any width.
- **Four or five destinations. Never more.** *You · Work · Links · Look*.
- **It does not grow.** A fifth or sixth entry is not a UI decision — it means
  a new kind of content exists, which is a product decision made deliberately
  and elsewhere.

If this list ever needs a scrollbar, a group heading, or a second level, we are
rebuilding the section nav we removed, and the right response is to stop.

**4 — Cropping: inside the panel.**

`react-image-crop` is already one of the five runtime dependencies, so no new
dependency is implied. The crop happens **in the You panel, with the portfolio
still visible** — the frame updates as the crop is adjusted, so the client
sees the result rather than imagining it. **No modal**, because a modal would
be the single place in the Studio where the portfolio is hidden, and it would
be hidden at the exact moment the client is judging how they look.

---

## 12. The last two rules

**Work is not a destination.** Choosing *Work* in the Index does not open a
management screen and does not open a panel. It **reveals and focuses the work
in the portfolio**, and editing proceeds through the click-preview interaction
that already exists. There is no list of pieces anywhere, because a list of
pieces is the first step towards a content manager.

> **The portfolio remains the navigation surface.**

**Direction is not an editing control.** The Look panel opens on the individual
presentation controls — accent, banner, font, density. It does **not** present
the three directions as its default content.

*Change direction* is a separate, deliberate action inside the panel, and only
when the client takes it do the directions appear. The reason: **choosing a
direction is a creative reset, not a normal edit.** Putting three whole-portfolio
alternatives in front of someone who came to adjust one colour invites them to
second-guess a decision they already made well — and a reset offered casually
stops reading as a reset.
