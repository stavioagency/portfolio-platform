# Designakum — Designer Handoff

**For the designer joining the platform redesign.** Written 2026-08-14.

You own logo evolution, brand extensions, the illustration system and future
visual exploration. This document tells you what already exists, what is locked,
and what the engineering system can actually build — **so that beautiful work
does not arrive unbuildable.**

If a constraint here blocks something you believe the product needs, say so.
Several of these are decisions, not laws, and they are marked as such. But
please raise them **before** designing against them, not after.

---

# 1. Product overview

## What Designakum.site is

A **bilingual (Arabic-first) SaaS platform** where creative freelancers run a
professional portfolio presence, and an owner runs the platform behind it.

Each customer gets a **public portfolio site** plus a **private dashboard** to
maintain it. Subscriptions are sold through PayPal. There are currently
**13 live tenants**; several are complimentary accounts.

> **Positioning, and it matters for every screen you draw:**
> Designakum sells **a professional presence, not a website builder.** The
> customer wants to be findable and credible; they do not want to operate
> software. **We provide the frame. Their work is the picture.**

**Not a website builder.** Clients do not lay out pages, drag elements or edit
structure. They manage **work, identity, presentation and publishing**.
Appearance is theme selection within bounds.

## Who uses it

**The client** — an Arabic-speaking creative freelancer, primarily Saudi/Gulf.
Designers, photographers, filmmakers. Mobile-heavy. **Opens the dashboard for
about ten minutes a month.** They are not power users and should never need to
be.

**The owner** — the platform operator. Onboards clients, grants complimentary
access, watches subscriptions, fixes problems. In the tool far more often.

## The two products

This split is the single most important thing to design for. They are currently
one screen, and that is the defect the redesign exists to fix.

|  | `/console` — Owner | `/studio` — Client |
|---|---|---|
| **Sentence** | *"Keep the business healthy."* | *"Make my presence better."* |
| **First question** | **What needs me today?** | **Is my page live and working?** |
| **Feels like** | An operating system for the business | A creative workspace |
| **Leads with** | Attention and actions — **not charts** | Status and the client's own work |
| **Density** | Tighter — an operator scanning many objects | Roomier — larger targets, more air |
| **Never shows** | — | Another client, or any internal vocabulary |

**The governing rule:**

> **`/console` never edits content. `/studio` never shows another person's data.**

An owner who needs to fix a client's page enters `/studio` **explicitly and
visibly**, from that client's record, with a persistent banner and an exit
always on screen. Design that state; do not let it be ambiguous.

**A client must never see:** tenant IDs, the words *tenant*, *workspace*,
*slug*, *username*, *environment*, another client, or anything named after a
database table.

---

# 2. Brand foundation

## 2.1 The mark

The logo is an **Arabic wordmark — ديزاينكم**. Read from the asset files:

- **Geometric Kufic construction** — straight strokes, flat planes, sharp
  corners, near-monoline weight. Constructed, not written.
- **The i'jam (dots) are diamonds** — squares rotated ≈45°, sharp corners.
- **The diamonds are tilted slightly off true 45°.** That tilt is where the
  brand's sense of movement lives. A perfect diamond looks static.
- **Chiselled terminals. Not one rounded corner exists in the mark.**
- **Completely flat** — one colour, no gradient, glow, shadow or outline.

## 2.2 Wordmark vs monogram

> **The wordmark says who we are. The monogram says where you are.**

A **standalone Kufic monogram already exists** in four variants. An earlier
version of our documentation said no icon-only mark existed — that was wrong,
and a proposal to invent a "diamond mark" has been **cancelled**. Use the real
monogram.

| | Use for | Never use for |
|---|---|---|
| **Wordmark** | Sign-in · sign-up · password reset · email headers · receipts · sidebar (desktop) · marketing | Favicons · avatars · square frames · **anything under ~120px wide** — it is 3.91:1 and the diacritics merge |
| **Monogram** | Favicon · app icon · collapsed icon rail · compact chrome · loading · avatar fallback · email footer | Replacing the wordmark in primary brand moments |

**Restraint inside the product.** `/studio` and `/console` are where the
*customer's* work leads. **The portfolio preview carries no Designakum branding,
ever** — a portfolio product that decorates its dashboard with its own logo is
competing with its user.

**Decoration scales inversely with seriousness.** A welcome email may carry the
pattern band; a failed-payment email gets the wordmark and nothing else.

## 2.3 Colour

**Primary: `#2A6BCE`** — measured directly from the logo asset. **Locked.**

Do not introduce `#2C6FE0` (retired), the social-tile gradient blues, or any
competing accent. **Five near-identical blues were in circulation; that is now
one.**

> **The brand colour must not become every UI colour.** In the interface,
> **blue means *act here* and nothing else.**

| Role | Colour | Rule |
|---|---|---|
| **Primary action** | `#2A6BCE` | **One per screen.** The only blue in the interface |
| **Secondary action** | Surface + border | Never blue |
| **Information / neutral** | **Grey** | **Never blue** — it would collide with the primary action |
| **Success** | Green | Live, published, paid |
| **Warning** | Amber | **Only when the user can act on it.** Otherwise grey |
| **Danger** | Red | Failed, overdue, destructive |

**Surfaces.** Light theme ships first: a cool tinted ground with white panels,
so **a card separates by surface alone and needs no border**. Dark surfaces use
brand navy `#0C1530`, not neutral black.

**Flat.** No gradients in the product. No coloured glows. The mark has none.

## 2.4 Typography

Four families are already loaded in a single request. **Do not specify a new
font** — the performance work to get to one request was deliberate.

| Role | Family | Notes |
|---|---|---|
| **Arabic display / headings / eyebrows** | **Reem Kufi** | A Kufi face — the closest loaded match to the mark's construction. Loaded at 400–700 |
| **Arabic body** | **IBM Plex Sans Arabic** | Humanist, legible. Correct for prose — **never use Reem Kufi for body** |
| **Latin display** | **Manrope 800** | Geometric grotesque, flat terminals |
| **Latin body** | Manrope 400/500 | |
| **Numbers** | Manrope tabular figures | Money, dates, counts |

**The hierarchy problem to solve.** The current scale tops out at 26px with 14px
body — a lead-to-body ratio of **1.86×**. Premium products run **~3×**. We are
adding 34px and 44px display sizes. **Widen from the top; do not shrink the
body** — this audience is not sitting in the tool all day.

**Weight carries hierarchy before size does.** A 12px/600 label is assertive; a
14px/400 label is a form field.

## 2.5 Arabic considerations

**Arabic is the brand's native register — the logo is an Arabic wordmark.**

- **Never letter-space Arabic.** It is cursive; tracking severs the joins between
  letterforms. This is broken typography, not a style choice.
- **Never uppercase Arabic.** There is no case.
- **Latin numerals in both languages**, always.
- **Arabic needs more line height** than Latin (~1.75 vs ~1.55) — diacritics
  collide otherwise.
- **The eyebrow device changes in Arabic.** Latin eyebrows use uppercase +
  tracking; neither is available in Arabic, so Arabic eyebrows use **weight and
  a brand-tinted colour** instead. Design both.

**One asset needs a fence.** A decorative calligraphy asset exists —
*"أهلاً وسهلاً بكم"*. It is beautiful and it is the **opposite register** to the
Kufic mark: cursive, ornamental, hand-drawn. **Do not use it as a model for the
product's Arabic typography** — it belongs in a welcome email and nowhere else.
Placed beside the wordmark at similar size, the clash is obvious.

---

# 3. Visual principles

## Designakum should feel

**Premium** — through restraint and confirmation, not ornament. The product
never leaves you wondering what happened.

**Creative** — the customer's work is visible and celebrated. Imagery is present.

**Structured** — geometric, aligned, deliberate. Everything sits on a scale.

**Calm** — one thing leads per screen. Nothing competes.

**Professional** — the customer is showing this to *their* clients. It must make
them look credible.

## Designakum should NOT feel

| Avoid | Why |
|---|---|
| **A generic SaaS dashboard** | The founder's own word for the current product is *generic* |
| **Excessive gradients** | The mark is flat. A gradient makes a claim about material the brand does not make |
| **Noisy** | A card with a border *and* a shadow *and* a fill is three separations doing one job |
| **Over-decorated** | The pattern is an **edge treatment**, never a field behind content |
| **Playful** | No bounce, no wobble, no emoji as iconography |
| **Rounded and soft** | The mark has no rounded terminals. Surfaces may be comfortable; brand elements are sharp |
| **Project-management software** | There are no pipelines, assignees or task boards. One client, one site, one subscription |
| **A website builder** | Clients manage content, not layout |

## The operating rule for any screen

> **One thing leads** — a number or a sentence at display size.
> **One action is coloured.**
> **Everything else is type and space.**
>
> If a screen has two leads or two coloured actions, it is two screens.

## The test

If a Designakum screen could be recoloured into a competitor's palette and be
indistinguishable, the brand has been painted on rather than applied. The Arabic
wordmark, the Kufic monogram, Reem Kufi display type and the flat royal blue are
what should make that impossible.

---

# 4. Required designer assets

## 4.1 Required before implementation — these block engineering

| # | Asset | Spec |
|---|---|---|
| **A1** | **SVG wordmark**, 2 variants (blue `#2A6BCE`, white) | Trimmed to artwork. Current files are 6250px PNGs with the artwork filling 11–24% of frame. Define clear space and minimum width |
| **A2** | **SVG monogram**, 2 variants (blue, white) | Trimmed. **It is 1.77:1 landscape — please specify how it is framed inside a square, and confirm it holds at 16px** |
| **A3** | **~12 status icons** | See 4.4. Extends an existing set |
| **A4** | **Favicon set** — 16 / 32 / 48px + apple-touch-icon | From the monogram. **16px legibility must be verified, not assumed** |

**Why these block:** every current brand asset is a PNG, most at 6250×6250, one
at 4.3 MB. A 6250px PNG cannot go in a sidebar, an email header or a favicon.
**Format conversion is a prerequisite, not polish.**

## 4.2 Recommended — improves the experience, does not block

- **6–8 portfolio placeholder thumbnails.** The product sells portfolios and
  currently ships **no example content**. These must be **obviously
  placeholders** — never fake portfolios presented as real customers.
- **Light-theme watermark** (navy at ~8%). The only watermark that exists is
  white, invisible on the light theme that ships first.
- **Seamless pattern tile.** The existing pattern is a fixed-width strip that
  cannot repeat.
- **OG / social share images** for published portfolios.
- **Avatar fallback system** — client initials on brand tints.

## 4.3 Later

Empty-state illustrations *(only if they stay geometric and restrained — a
cheerful illustration style would contradict the brand; ghost UI may be better
than illustration)* · marketing and campaign graphics · brand motion for the
monogram · receipt letterhead · a Latin lockup **only if you judge it necessary**
*(we would caution: the Arabic-first mark is the differentiator, and a Latin
lockup risks becoming the default and diluting it)*.

## 4.4 Icon specification

**An icon system already exists** — 22 icons covering navigation (`home`,
`users`, `folder`, `chart`, `settings`, `globe`, `link`, `receipt`, and so on).
**Extend it; do not replace it, and do not introduce an icon library.**

Missing, roughly 12: `alert` · `alert-triangle` · `clock` · `pause` · `play` ·
`refresh` · `credit-card` · `calendar` · `trend-up` · `trend-down` · `image` ·
`eye`.

| Property | Value | Why |
|---|---|---|
| Grid | 24×24 | Matches the existing set |
| Stroke | 2px monoline | The mark is near-monoline |
| **Caps** | **butt** | Chiselled terminals |
| **Joins** | **miter** | Sharp corners |
| Corner radius | **0** | There are none in the mark |
| Colour | Monochrome, inherits | Never multicolour |
| Pairing | **Always beside a word** | |

> **One caution against literalism:** butt caps on a 2px stroke can read frail at
> 16px, and miter joins on acute angles produce spikes. Check optically at the
> smallest size actually used. **The goal is the mark's character, not a
> doctrine** — accept square caps where butt looks thin.

**These icons replace 31 emoji currently used as interface elements**, including
🔴🟡🟢 as status indicators. Emoji survive only in genuinely expressive copy.

---

# 5. Screen design priorities

Ranked by what unblocks engineering. **Please design in this order.**

## Priority 1 — Application shell

The chrome both products share. **Everything else depends on it.**

- Sidebar: **full → icon rail (≤1200px) → bottom bar (≤720px)**
- Brand block: wordmark (desktop) / monogram (rail); role shown for owners only
- Page header: **eyebrow + title + one primary action**
- Navigation active state — including a **travelling indicator** if you want one
- Operator-mode banner: persistent, with the exit inside it
- **The standard screen skeleton:** header → optional tip → summary band → work

## Priority 2 — Owner Console

- **Home: what needs me today.** 3–4 summary tiles over an attention queue.
  **Tiles are buttons** — reading and acting are one gesture
- **Attention screen** grouped by *reason*, each with a definition and a **"what
  clears it"** line. *An empty screen is the goal — design that state as a
  success, not a void*
- **Clients** — a card grid of objects, with a ghost "add client" card
- **Client record — ONE scrolling page, no tabs.** Confirmed by research at this
  data volume; tabs hide what an owner wants at a glance

## Priority 3 — Client Studio

- **Home: status before controls.** Is my page live, is it complete, is anyone
  visiting, am I paid up — **with the client's own work visible**
- **Setup rail** for first run. The content already exists: seven steps, each
  with what to do, why it matters, how, and what "good" looks like
- **Editors** — see the constraint below
- **Entitlement made legible** — an unpaid client can browse but not save.
  Today they discover this through a **refused save with no explanation**. State
  it before they type
- **Empty states**: new client · no projects · no analytics · no billing history
  · complimentary account

> **Editor layout preference:** avoid tab-heavy layouts. **One long structured
> page beats many hidden tabs.** There is an open decision (§9) about whether
> two current editors merge — please design for one page with clearly-titled
> sections.

## Priority 4 — Billing experience

- Plan selection and checkout
- **The pending-payment moment** — currently a warning box. It is the moment a
  person becomes a customer and should read as confirmation
- Receipts and invoices
- **Cancellation as three beats:** what you keep → one honest alternative offered
  once → confirm. **No dark patterns, no fake urgency**
- **Five transactional emails**: receipt, renewal, payment failed, cancelled,
  welcome-to-paid

---

# 6. Technical constraints

**Please read this section before designing. Several of these invalidate common
approaches, and a design that assumes them cannot be built here.**

## What the product is built with

- **React (Next.js), plain JavaScript.** No TypeScript.
- **Styling is CSS custom properties + component-scoped CSS.**
- **No Tailwind. No PostCSS. No component library** (no Radix, no shadcn, no MUI).
- **No animation library** (no Framer Motion).
- **Five runtime dependencies total**, and adding one requires explicit approval.

## What this means for you

| You can rely on | Reasoning |
|---|---|
| CSS custom properties, `color-mix()`, `clamp()` | Already in use |
| Flexbox, Grid, container queries, logical properties | Fine |
| CSS transitions and keyframe animations | Fine |
| The four already-loaded fonts | No new request |
| SVG icons and marks | Inline, inherit colour |

| Please avoid | Because |
|---|---|
| **A new typeface** | Fifth family on the critical path |
| **Designs that need a component library** | There isn't one, and one will not be added |
| **Complex physics or scroll-linked animation** | No animation library |
| **Effects needing a canvas or WebGL** | Out of scope |
| **Blur-heavy treatments** | Expensive on mobile GPUs; the audience is mobile-heavy |

**This is not a poor system.** It is a deliberately small one, and it can build
everything in the design direction. The constraint is on *dependencies*, not on
ambition. **If something genuinely requires a new dependency, raise it as its own
conversation before the design depends on it** — not at implementation.

## Motion

- **Precise, geometric, controlled. Never bouncy.**
- **Press must be faster than entrance** — press ~110ms, entrances ~300ms.
  Conflating them is why interfaces feel laggy *and* abrupt at once.
- Slight overshoot on things that appear is fine; **exaggerated spring is not.**
- **No boot sequences, no ambient background motion.** A client visiting ten
  minutes a month experiences a brand animation as latency.
- **Every animation must answer "what just happened?" or "where did this come
  from?"** If it answers neither, it goes.
- **Reduced motion must be honoured** — but *less movement, not no feedback*. A
  skeleton that stops shimmering reads as broken.

---

# 7. Component thinking

> **Please design a system, not a set of screens.**

Every screen will be built from shared components. A one-off treatment on one
screen becomes either an inconsistency or an expensive special case.

## What we need specified

**Buttons** — primary, secondary, ghost, destructive · default / hover / active /
focus / disabled / loading. **Destructive should be outlined, not filled** —
filled red is disproportionately loud for an action that should feel deliberate.

**Cards** — one treatment, plus a modifier for emphasis. *We learned that
emphasis is best done with a border and one ink colour, not a second surface
treatment.* Please define when a card is **not** appropriate.

**Forms** — labels, hints, errors, success, disabled, focus rings.
**A disabled control must be able to explain itself** — an unexplained disabled
save is the most frustrating pattern in the current product.

**Tables and rows** — two densities (owner / client), numeric alignment, hover
actions, **and what happens on mobile** (stacked rows, never a horizontally
scrolling table).

**Navigation** — three sidebar states, active state, badges, group labels.

**Status** — chips carrying **state and quantity together** (`Payment failed · 4
days left`). A chip that needs a legend has failed.

**Empty states** — the most important components in the product. Every one must
say **what this is · why it matters · what happens next.** For a new client,
**empty is the first thing they ever see.**

**Loading states** — skeletons matching real layouts. **No full-screen spinners.**

**Modals** — a modal interrupts and must earn it. Please define when *not* to use
one.

## Two things worth knowing

**Components must work at two scopes.** The same summary tile serves "all
clients" and "one client". Designing it once, scope-agnostic, halves the system.

**Absence is always worded.** "No projects yet", "No custom domain", "Nobody
assigned" — **never a blank, never a dash.**

---

# 8. Arabic / RTL requirements

**Arabic is not an afterthought and not a translation layer. It is the primary
audience and the brand's own register.**

## Requirements

1. **RTL is a layout mode, not a mirror.** The sidebar sits on the **right**. It
   is not "the left sidebar flipped".
2. **Every screen must be designed or reviewed in Arabic before it is done** —
   not after. A layout that only works in English is not finished.
3. **Mixed content is normal.** An Arabic interface routinely contains Latin
   strings — URLs, emails, domain names, plan codes. These stay LTR **inside** an
   RTL line. Please show how they are handled.
4. **Latin numerals in both languages.** Always. Dates, money, counts.
5. **No letter-spacing, no uppercase on Arabic** (§2.5).
6. **Arabic runs longer than English**, often 20–30%. Buttons, chips and labels
   must tolerate it — **please design the longer case, not the convenient one.**
7. **Line height is higher in Arabic** (~1.75 vs ~1.55).
8. **Directional icons flip; object icons do not.** An arrow flips. A camera
   does not.
9. **Directional motion mirrors.** A panel entering from the right in English
   enters from the left in Arabic.
10. **Every breakpoint needs an Arabic check**, not just every screen — collapse
    order reverses.

## Two useful notes

**The monogram needs no RTL flip** — it is a mark, not a direction.

**Reem Kufi is display-only.** It carries headings and eyebrows; **IBM Plex Sans
Arabic carries all body text.** Please do not set paragraphs in the display face.

---

# 9. Open decisions — your input is wanted

Not yet decided. Each changes what gets designed.

| # | Question | Context |
|---|---|---|
| **E1** | **Should "Profile" and "Home Page" merge into one editor?** | *Profile* = identity (name, title, photo, bio). *Home Page* = what shows on the public page (logo, banners, stats, CTA buttons). **For:** a client thinks "my page", not two records. **Against:** merging gives one very long editor and loses the identity/presentation distinction. **Our leaning: one page, two clearly-titled sections.** Your call is wanted |
| **E2** | **Density split** — should `/console` run tighter than `/studio`, from the same components? | One density token already exists |
| **E3** | **Client body text — 14px or 16px?** | Follows E2. The client visits rarely and is mobile-heavy |
| **E7** | **How is the 1.77:1 monogram framed inside a square, and does it hold at 16px?** | Blocks the favicon and the icon rail. A craft question, yours |

---

# 10. Working agreement

**You own:** logo evolution, brand extensions, the illustration system, future
visual exploration, and every judgement above marked as yours.

**Engineering will not:** invent a mark, choose brand colours, design an
illustration system, produce final SVGs, or decide logo lockups. **If an asset
is missing, the phase waits.**

**Please preserve:** the Arabic wordmark and its Kufic construction · the diamond
i'jam and their slight tilt · the monogram · `#2A6BCE` · flatness · the pattern's
derivation from the mark.

**Please do not:** replace or Latinise the wordmark · round any corner or
terminal · add gradients or glows to the mark · introduce a second brand colour ·
use the calligraphy as a typographic system · design logo-as-wallpaper.

**The reference product we studied is a UX reference only.** Its hierarchy,
role separation, attention system and state discipline are worth learning from.
**Its visual identity, density and personality are not ours** — and a Designakum
that looks like it recoloured would be a failure of this brief.
