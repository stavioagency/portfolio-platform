# Designakum — Design System Specification

**Status: the design authority.** Written 2026-08-14. Where this document and any
earlier UX document disagree, **this one wins**.

It consolidates four bodies of research: the structural UX blueprint, the Lumetra
portal teardown, the authenticated Lumetra observations, and the brand asset
analysis — checked against what this repository can actually build.

**Superseded by this document** (keep for reasoning and history, do not follow
for decisions):

| Document | Standing |
|---|---|
| `designakum-ux-context.md` | **Still authoritative on facts** — what exists, what is constrained. Not superseded |
| `designakum-ux-blueprint.md` | Authoritative on **information architecture**. Its §9 (design system direction) is superseded here |
| `designakum-design-system.md` | Superseded entirely. Its Appendices A and B remain the **evidence record** |

**Verified before writing:** repository `~/Documents/GitHub/portfolio-platform`,
branch `main`, working tree clean, synchronised with `origin/main` (0 ahead /
0 behind), HEAD `477ba11`. `designakum-ux-blueprint.md` and
`designakum-design-system.md` are **untracked** — they have never been committed.

**Evidence labels** used throughout: **[MEASURED]** read from a file or a live
DOM, with the source named · **[OBSERVED]** seen rendered · **[REPO]** verified
in this codebase · **[INFERRED]** follows from evidence · **[PREFERENCE]** a
judgement, the owner is the authority · **[OPEN DECISION]** genuinely unresolved.

---

## 0. Contradictions found, and how they are resolved

Consolidation is only worth doing if it settles things. Six real conflicts
existed across the four sources.

| # | The conflict | Resolution | §|
|---|---|---|---|
| **C1** | **Brand blue.** Docs and emails say `#2C6FE0`; the logo asset measures `#2A6BCE`; the app uses neither (`#9FA7FF` / `#4f57d8`) | **Recommend `#2A6BCE`** — with the full comparison, because this one is the owner's call | §2.1 |
| **C2** | **Ground temperature.** The design-system doc first proposed stealing Lumetra's warm cream `#F7F1E6`; Appendix B withdrew it | **Cool ground.** Warm cream under a cool royal blue goes muddy. `#F3F5FB` already exists in the repo | §2.4 |
| **C3** | **How emphasis works.** The teardown recorded "one tile on a lighter surface, three dark"; the authenticated audit measured **all four tiles white**, the odd one marked by border + number colour | **Border + ink, not a second surface.** Cheaper, and it is what the product actually does | §6.2 |
| **C4** | **Numerals.** Lumetra uses JetBrains Mono in 43 selectors; adding a fifth font family contradicts the single-`<link>` performance work in `_document.js` | **Manrope `tnum`.** Same benefit, zero network cost | §3.4 |
| **C5** | **Warning colour.** §3.3 of the old doc asked whether amber should survive; Appendix B answered part of it via the blue collision | **Amber survives, narrowed.** Amber = time-bounded and actionable. Grey = informational and neutral. Blue is spent | §2.3 |
| **C6** | **Client record layout.** Blueprint §5.2 proposed six tabbed panels; the teardown and the authenticated audit both found one scrolling page | **One page, no tabs.** Confirmed on screen at a comparable data volume | §7.2 |

Two further alignments, not conflicts but drift:

- **`--text-4xl`** was `44px` in the blueprint and `46px` in the design-system
  doc. **Settled at 44px** (§3.3) — no reason to diverge from the earlier number.
- **Route names** `/studio` and `/console` remain **[OPEN DECISION]** and are the
  one item blocking Phase 1 (§7.4).

---

# Section 1 — Brand Foundation

## 1.1 What the brand actually is

Derived from the assets in `public/`, not invented. Full evidence in
`designakum-design-system.md` Appendix B.0.

**[MEASURED]** The mark is an **Arabic wordmark — ديزاينكم — and nothing else.**
There is no Latin lockup and no icon-only mark in the repository.

Four properties, read off the file:

1. **Geometric Kufic construction.** Straight strokes, flat planes, near-monoline
   weight. Constructed, not written — the opposite of calligraphic Naskh.
2. **The i'jam are diamonds** — squares rotated ≈45°, sharp corners, verified at
   pixel level. The only ornamental decision in the mark.
3. **The diamonds are tilted off true 45°**, by a few degrees. This is where
   movement lives. A perfect diamond is static.
4. **Chiselled terminals, no rounding anywhere, and completely flat** — one
   solid colour, no gradient, glow, shadow or outline.

## 1.2 Personality

**Designakum is an instrument, not a toy.**

| Quality | In the mark | In the product |
|---|---|---|
| **Trust** | Even weight, no effects, high contrast | It never leaves you wondering. Every action is acknowledged, especially money |
| **Precision** | Sharp corners, chiselled cuts, constructed geometry | Nothing approximate. Figures align, spacing comes from a scale, states are exact |
| **Movement** | Diamonds tilted off true; sheared terminals | Things travel and settle. Motion carries meaning, never decoration |
| **Modern technology** | Engineered letterforms | Flat surfaces, restraint, confidence expressed as *less* |

**Creative professionalism** is the register: the customer is a working
creative — a designer, filmmaker, photographer — who wants to look credible to
their own clients. The product is the **frame**, never the picture.

## 1.3 Emotional positioning

Two users, two target emotions. They are not the same, and a screen that serves
both is the defect this redesign exists to fix.

> **Client — reassured.** *"My page is live, it looks good, someone visited it,
> and I'm paid up."* A client should open the dashboard, learn everything is
> fine, and close it.

> **Owner — oriented.** *"Here is what needs me today; nothing else does."* The
> absence of alarm must be as legible as alarm.

## 1.4 What it should feel like

- **Composed.** Fewer, larger, more decisive surfaces. One page answers one question.
- **Legible at a glance.** Hierarchy does the work borders currently do.
- **Native in Arabic.** The brand *is* an Arabic wordmark. RTL is the home register, not a port.
- **Quietly premium.** Premium here is restraint and confirmation, not ornament.
- **Its own.** Recolouring this into Lumetra's maroon should produce something obviously not Designakum.

## 1.5 What it must NOT feel like

- **A settings panel.** The founder's own word is *generic*. Leading with editors instead of state is what causes it.
- **A database with a skin.** No slug, username, tenant, workspace or environment reaching a client — ever.
- **Playful.** No bounce, no wobble, no confetti-as-personality, no emoji as iconography.
- **Decorated.** No gradient buttons, no coloured glows, no ambient background motion. The mark is flat; the product is flat.
- **A CRM.** The owner portal manages a platform, not a sales pipeline.
- **Lumetra.** Their density, dark-first palette, four themes and boot theatre are theirs.

---

# Section 2 — Brand Tokens

**Rule: no raw hex outside the token block.** Every colour in a component
references a token. This is the mechanism that makes C1 resolvable in one place
whichever way the owner decides.

## 2.1 The primary brand blue — the decision

Three values are in circulation:

| Source | Value | Standing |
|---|---|---|
| `docs/ux/designakum-ux-context.md` §6.3, and the transactional emails | `#2C6FE0` | Documented |
| **`public/logo-light.png`, measured** | **`#2A6BCE`** | **The shipping asset** |
| `styles/globals.css` today | `#9FA7FF` (dark) / `#4f57d8` (light) | Neither. The brand appears in no application CSS |

**[MEASURED]** 54,973 of 64,839 opaque pixels in `logo-light.png` are exactly
`#2A6BCE`; the remainder is anti-aliasing.

### Full comparison

| Criterion | `#2A6BCE` (logo) | `#2C6FE0` (docs) | Winner |
|---|---|---|---|
| **Logo consistency** | Identical to the mark | Visibly brighter beside it | **`#2A6BCE`** |
| **Accessibility — white ink on the fill** | **5.13:1** | 4.71:1 | **`#2A6BCE`** — both pass AA; only one has headroom |
| **Accessibility — as ink on white** | **5.13:1**, clears AA for body text | 4.71:1, clears AA but with no margin | **`#2A6BCE`** |
| **UI usage — as a filled button** | Both clear the 3:1 non-text threshold | Both clear | Tie |
| **Dark mode — fill against navy `#0C1530`** | 3.51:1 | **3.83:1** | `#2C6FE0` — but see below |
| **Email consistency** | Would require re-authoring templates | Already used | `#2C6FE0` |
| **Long-term brand** | The asset defines the brand | Documentation describes it | **`#2A6BCE`** |

### Recommendation

**Adopt `#2A6BCE`.** Three reasons, in order:

1. **The asset is what ships.** Documentation describes; the PNG renders. When
   they disagree, the file is the brand. The alternative — regenerating the logo
   to match the docs — is legitimate but is a *brand* change, not a UI fix.
2. **It is the more accessible value** in the two places that matter most: white
   text on the button, and blue text on white.
3. **It is the more serious blue.** `#2C6FE0` reads brighter, slightly toward
   "tech startup". `#2A6BCE` sits in the trust register §1.2 asks for.

**The dark-mode figure is not an objection.** No dark theme should paint the
light-mode accent onto a dark ground — accents lighten in dark themes as a rule,
and the ink on them flips. That is handled by derivation (§2.2), not by picking
a brighter brand constant.

**What must not happen: both values staying in circulation.** Two colours that
are *almost* the same is worse than two that are plainly different — it reads as
a mistake rather than a decision. This is Lumetra's v5.2 lesson in another form.

> **[OPEN DECISION — D1]** This is a brand call and it is Feras's. If `#2C6FE0`
> is preferred, **the logo files must be regenerated to match** and this
> document updated. Everything below derives from `--brand`, so either choice
> costs one line.

## 2.2 Brand tokens

```css
/* THE SOURCE. Change this one value to change the brand. */
--brand:        #2A6BCE;

--brand-hover:  color-mix(in srgb, var(--brand) 88%, #0C1530);  /* darker on hover */
--brand-ink:    #FFFFFF;                    /* text ON a brand fill (light theme) */
--brand-soft:   color-mix(in srgb, var(--brand) 12%, transparent);  /* tinted fills */
--brand-line:   color-mix(in srgb, var(--brand) 28%, transparent);  /* tinted borders */
--brand-eyebrow:color-mix(in srgb, var(--brand) 40%, var(--text-primary));
--brand-focus:  color-mix(in srgb, var(--brand) 55%, transparent);  /* focus ring */
```

**Dark theme overrides** — the accent lightens, and the ink flips to navy:

```css
[data-theme='dark'] {
  --brand:       color-mix(in srgb, #2A6BCE 78%, #FFFFFF);   /* ≈ #598CD9 */
  --brand-hover: color-mix(in srgb, #2A6BCE 88%, #FFFFFF);
  --brand-ink:   #0C1530;                   /* dark ink on a light fill */
}
```

**Why `color-mix()`.** No dependency, no build step, no preprocessor — it is
plain CSS and it satisfies the constraint in §10. It also means the entire brand
layer re-derives from one value, which is the whole point of C1.

> **[MEASURED] Verify at implementation.** The derived dark values above are
> computed, not yet rendered. `#598CD9` measures **5.30:1** against `#0C1530`,
> and **3.40:1** for white ink — which is *why* the ink flips to navy. Check
> each derived pair against its real background before shipping.

**Backwards compatibility.** `--accent` and its relatives are referenced
throughout `pages/admin.js` [REPO]. Do **not** rename them in a design pass.
Alias instead, so nothing breaks and the migration is incremental:

```css
--accent:       var(--brand);
--accent-hover: var(--brand-hover);
--accent-fg:    var(--brand-ink);
```

**`--accent-gradient` and `--accent-glow` are retired** (§2.6).

## 2.3 Semantic colours — and the collision the brand creates

**A royal-blue brand makes "info blue" unusable.** Convention paints
informational states blue; if Designakum does that, an info chip and the primary
action are the same colour and the accent stops meaning *act here*.

**This resolves C5.** The semantic set routes around blue:

| State | Hue | Used for | Never for |
|---|---|---|---|
| **Act here** | `--brand` | The one primary action; active nav; focus | Anything that is not an action |
| **Success** | green | Live, published, paid, verified | "Nothing is wrong" — say that in words |
| **Warning** | amber | **Time-bounded and actionable only** — payment retrying, grace period ending, DNS pending | Anything the user cannot act on |
| **Danger** | red | Failed, refused, overdue, destructive actions | Emphasis |
| **Neutral** | **grey — not blue** | Informational, comped, draft, not-published-yet | — |

**Amber survives, narrowed.** The earlier doubt was well founded: most states in
this product that *looked* like warnings are actually informational. The test is
now explicit — **if the user cannot act on it, it is grey, not amber.**

**A comped workspace is the case to get right.** It is not success, not warning,
not failure — it is a neutral fact about a relationship, and **seven of the
current workspaces are comps** [REPO]. Grey, worded plainly, never styled as a
problem or as a missing value.

### Every semantic colour is a four-part set

Today the tokens are fg/bg/border triads [REPO] — with **no readable text
colour for a chip**. A colour saturated enough to fill a bar is not legible as
11px text, and the correction **flips direction between themes**.

```css
--success · --success-bg · --success-border · --success-ink
--warning · --warning-bg · --warning-border · --warning-ink
--danger  · --danger-bg  · --danger-border  · --danger-ink
--neutral · --neutral-bg · --neutral-border · --neutral-ink
```

- **Light theme:** `-ink` is **darker** than the base.
- **Dark theme:** `-ink` is **lighter** than the base.

Adding `-ink` is purely additive and breaks nothing.

## 2.4 Backgrounds and surfaces

**This resolves C2: the ground is cool, because the brand is cool.** Warm cream
under a cool royal blue pushes the blue toward violet.

**Light theme — the one to perfect first:**

```css
--bg-base:     #F3F5FB;   /* the page ground — ALREADY IN THE REPO */
--bg-surface:  #FFFFFF;   /* cards, panels                          */
--bg-raised:   #E9EDF7;   /* wells, inset areas                     */
--bg-hover:    #DFE4F1;
```

**[REPO] The tokens are already right; the usage is not.** `--bg-secondary:
#f3f5fb` is exactly this cool tinted off-white. The problem is that panels
currently sit on the same value they are made of — which is why borders are
doing work that surface should do.

> **The rule this enables: a card on a tinted ground needs no border.** One
> separation per boundary — surface, *or* border, *or* shadow. Never two, never
> three. This is the single largest contributor to the current dashboard reading
> as busy.

**Dark theme — rebuilt on the brand navy.** [REPO] The current dark ramp is
`#0a0a0c` / `#131318` / `#1a1a22`: neutral near-blacks with a faint warm cast.
**There is no navy in the dark theme at all**, which matches the finding that the
brand appears nowhere in application CSS.

```css
--bg-base:    #080C1A;   /* navy-black, derived from #0C1530 */
--bg-surface: #0C1530;   /* the brand navy itself            */
--bg-raised:  #131E3D;
--bg-hover:   #1A2749;
```

This also separates Designakum from Lumetra, whose `#07090C` is deliberately
neutral.

**Sequencing:** light theme is the priority. The dark ramp is specified here so
it is not invented ad hoc later.

## 2.5 Borders and text hierarchy

```css
--border:        rgba(12, 21, 48, 0.10);   /* light theme */
--border-strong: rgba(12, 21, 48, 0.18);
--border-focus:  var(--brand-focus);
```

**Text — four steps, and they must stay four.**

```css
--text-primary:   #0C1530;                  /* brand navy, not black */
--text-secondary: rgba(12, 21, 48, 0.72);
--text-tertiary:  rgba(12, 21, 48, 0.50);
--text-muted:     rgba(12, 21, 48, 0.36);
```

[REPO] This ramp is already correct in the light theme and mirrors the dark
theme's 1 / .72 / .5 / .36. A previous version of the admin's light theme set
all four to the same colour, collapsing hierarchy entirely — **do not
reintroduce that.**

**Contrast floor: AA is a hard requirement, not a goal.** 4.5:1 for body text,
3:1 for large text and UI components. `--text-muted` at 0.36 is below AA and is
**decorative only** — never for content a user must read.

## 2.6 Gradients — retired

**The mark is flat.** One colour, no gradient, no glow, no shadow.

The app currently ships `--accent-gradient: linear-gradient(180deg, #6d86ff,
#4f6ef2)` and `--accent-glow: 0 4px 14px rgba(79,110,242,0.25)` [REPO] — a
gradient and a coloured glow, in colours that are not the brand, on the primary
button.

**Both are retired. The primary action is a flat `--brand` fill.**

A gradient on a button is a claim about depth and material; the brand makes no
such claim. It is also underivable — every future accent change would mean
re-authoring two stops and a shadow.

**The one permitted exception:** a very low-intensity brand wash
(`--brand-soft` → transparent) behind a **first-run or empty state**, where the
screen is otherwise bare. Never on buttons, cards, chips, badges, nav or headers.

**Elevation replaces the glow.** `--shadow-sm/md/lg` already exist and are
neutral [REPO]. One elevation for content, one for overlays.

---

# Section 3 — Typography System

## 3.1 The performance constraint, stated first

[REPO] `styles/globals.css` carries a comment explaining that four `@import`
rules were collapsed into **one `<link>` in `pages/_document.js`**, because
`@import` serialised: the browser could not discover a font stylesheet until it
had downloaded and parsed the CSS, then had to open two origins while rendering
was blocked on all four families.

**Four families are loaded today, in one request:**

| Family | Script | Currently used for |
|---|---|---|
| **Manrope** | Latin | everything Latin |
| **IBM Plex Sans Arabic** | Arabic | everything Arabic |
| **Reem Kufi** | Arabic | *client public pages only — never the product's own chrome* |
| **Cairo** | Arabic | client public pages only |

**Therefore: no new family is specified in this document.** Every
recommendation below uses one of the four already in that request.

**On IBM Plex Sans (Latin):** the brief asks it to be considered. **Rejected** —
it is *not* currently loaded (only the Arabic sibling is), so adopting it means
a fifth family and more weight on the critical path. Manrope is already a
geometric-leaning grotesque with flat terminals and near-circular bowls, which
is the correct neighbour for a geometric Kufic mark. **The gain does not justify
the request.**

## 3.2 The families, assigned

### Latin

| Role | Family | Reasoning |
|---|---|---|
| **Display** (`--text-4xl`, `--text-3xl`) | **Manrope 800** | Weight, not a new face, creates display presence |
| **Heading** | Manrope 700 | — |
| **Body** | Manrope 400/500 | — |
| **Numeric** | Manrope + `tnum` | §3.4 |

### Arabic

| Role | Family | Reasoning |
|---|---|---|
| **Display** (`--text-4xl`, `--text-3xl`, eyebrows) | **Reem Kufi** | A *Kufi* face — geometric, constructed, flat-terminalled. **The closest thing already loaded to the logo's own construction** |
| **Heading** | Reem Kufi, or Plex Arabic 700 if weights are insufficient | See caution below |
| **Body** | **IBM Plex Sans Arabic** | Humanist, warm, highly legible at small sizes. Correct for prose |

**The Reem Kufi finding is the most valuable in this section.** [REPO] It is
loaded on every page already, and used **only** on client public pages — the
product's own `--font-heading` is `'Manrope', 'Cairo', 'IBM Plex Sans Arabic'`.
The face that most resembles the brand mark is sitting in the request, unused by
the brand.

> **[MEASURED] Weight range verified this session.** The single `<link>` in
> `pages/_document.js` requests:
>
> ```
> Cairo:wght@400;500;600;700;900
> IBM+Plex+Sans+Arabic:wght@400;500;600;700
> Manrope:wght@400;500;600;700;800
> Reem+Kufi:wght@400;500;600;700
> ```
>
> **Reem Kufi ships 400/500/600/700 — enough for display *and* headings.** No
> fallback to Plex Arabic 700 is needed, and **Manrope's 800 is present**, which
> is what §3.3 assigns to display sizes. Nothing in this section requires a new
> or widened font request.
>
> **One caution remains.** Reem Kufi is a display face: use it for
> `--text-3xl`/`--text-4xl`, headings and the Arabic eyebrow. **Never body,
> never form labels, never long prose** — Plex Arabic keeps that job.

```css
--font-display-ar: 'Reem Kufi', 'Cairo', system-ui;
--font-body-ar:    'IBM Plex Sans Arabic', system-ui;
--font-display:    'Manrope', system-ui;          /* Latin */
--font-body:       'Manrope', system-ui;
```

## 3.3 Scale, weights, line heights

**The problem, mechanically stated.** [REPO] The scale is 11 / 12 / 14 / 16 /
20 / 26px, with no display size. The **lead-to-body ratio is 26/14 ≈ 1.86×**.

[MEASURED] Lumetra's rendered ratio is **2.8–3.3×** — a 38px lead over an
11.5–13.5px working band. **The premium signal is the ratio, not the size.**
Their body copy is *smaller* than Designakum's; the difference is entirely at
the top.

**Additive change. Nothing existing moves:**

```css
--text-xs:   11px;    /* meta, badges                     */
--text-sm:   12px;    /* labels, captions                 */
--text-md:   14px;    /* body — DEFAULT                   */
--text-lg:   16px;    /* emphasised body, client portal   */
--text-xl:   20px;    /* sub-heads                        */
--text-2xl:  26px;    /* section titles                   */
--text-3xl:  34px;    /* page titles              [NEW]   */
--text-4xl:  44px;    /* the one lead per screen  [NEW]   */
```

Ratio becomes **44/14 ≈ 3.1×**. (This settles the 44 vs 46 drift — 44px, per the
original blueprint.)

**Weights.**

| Weight | Use |
|---|---|
| 400 | body prose only |
| 500 | dense body, table cells |
| **600** | **labels, nav, chips — the workhorse** |
| 700 | headings, active nav, card titles |
| 800 | `--text-3xl` / `--text-4xl` display only |

**[MEASURED] Bold-at-small is what makes Lumetra read as confident** — `700`
appears in 96 rules, `400` in 2. A 12px/600 label is assertive; 14px/400 is a
form field. **Weight carries hierarchy before size does**, and both Manrope and
Plex Arabic are variable, so this is free.

**Line heights** — Arabic needs more, because of ascenders, descenders and
diacritics:

```css
--leading-tight:  1.15;   /* --text-3xl / --text-4xl        */
--leading-snug:   1.35;   /* headings, card titles          */
--leading-normal: 1.55;   /* body — Latin                   */
--leading-arabic: 1.75;   /* body — Arabic. NOT the same    */
```

**Setting Arabic at the Latin line height is the most common bilingual mistake
in this codebase's category.** Diacritics collide and the text reads cramped.

## 3.4 Numerals — resolving C4

**Requirement:** Latin numerals in both locales, always [REPO, GRANDMASTER].
Money, dates and counts must align in columns and read as *data*.

[MEASURED] Lumetra achieves this with **JetBrains Mono across 43 selectors** —
all of them data: numeric table cells, money, timestamps, nav badges, hostnames.
None of it is prose.

**Designakum does not copy this.** Adding JetBrains Mono is a fifth family on the
critical path, against the explicit performance work in `_document.js` (§3.1).

**Manrope is a variable font with tabular figures available as an OpenType
feature.** The entire benefit at zero network cost:

```css
--numeric: var(--font-body);
/* applied with: font-feature-settings: "tnum" 1; font-variant-numeric: tabular-nums; */
```

Apply to: money, dates, counts, analytics figures, nav badges, table numeric
cells.

**This also directly serves the bilingual rule** — a tabular Latin figure renders
identically inside an Arabic RTL line, which is exactly the behaviour
"Latin numerals in both locales" exists to guarantee.

> If a true monospace is ever wanted for domains or technical strings, use the
> **system stack** (`ui-monospace, SFMono-Regular, Menlo, monospace`) — still
> zero requests.

## 3.5 Tracking rules

[MEASURED] Lumetra's tracking is a **function of size** — from `+0.2em` on an
8–11px uppercase eyebrow to `−0.03em` at 54px. Designakum has no tracking system
at all.

```css
--track-eyebrow:  0.12em;    /* LATIN ONLY — see 3.6      */
--track-normal:   0;
--track-tight:   -0.02em;    /* --text-3xl                */
--track-lead:    -0.03em;    /* --text-4xl                */
```

**Tight display type reads as designed; loose micro-caps read as labelled.**
Together they produce hierarchy without a single border.

## 3.6 RTL behaviour — non-negotiable

**Arabic is a layout mode, not a mirror**, and the brand *is* an Arabic wordmark.

**Absolute rules:**

1. **Never `letter-spacing` on Arabic.** Arabic is cursive; tracking severs the
   joins between letterforms. This is broken typography, not a style choice.
2. **Never `text-transform: uppercase` on Arabic.** There is no case.
3. **Latin numerals in both locales**, always.
4. **Logical properties throughout** — `margin-inline-start`, not `margin-left`.
5. **`dir="ltr"` islands** for URLs, emails and technical strings. [REPO] Already
   done in several places (`.ch-url`, `.bl-card-exp`).
6. **Icons that imply direction flip; icons that depict an object do not.**
7. **Every screen is reviewed in Arabic before it is called done** — not after.

**The eyebrow needs a different device in Arabic**, because tracking and case are
both unavailable. **Weight and colour replace them** — and §2.2 supplies a colour
that is already the brand's own:

```css
.eyebrow {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--track-eyebrow);
  text-transform: uppercase;
  color: var(--text-tertiary);
}
html[dir="rtl"] .eyebrow {
  font-family: var(--font-display-ar);   /* Reem Kufi — construction carries it */
  font-size: var(--text-sm);             /* +1 step to hold presence            */
  letter-spacing: 0;
  text-transform: none;
  color: var(--brand-eyebrow);           /* colour replaces case                */
}
```

**Written once, globally.** [REPO] This is currently patched per-component, which
is how it drifts.

---

# Section 4 — Motion System

## 4.1 Philosophy

> **Motion confirms. It does not perform.**

The movement in the mark is **a tilt, not a bounce** — diamonds a few degrees off
true, terminals sheared on a diagonal. Controlled, directional, quiet.

Three rules follow:

1. **Every animation answers "what just happened?" or "where did this come
   from?"** If it answers neither, delete it.
2. **Things travel and settle.** Nothing springs, wobbles, or overshoots
   visibly.
3. **Response is instant; arrival is soft.** These are different durations and
   conflating them is why interfaces feel simultaneously laggy and abrupt.

**Adapted from Lumetra, deliberately not copied.** [MEASURED] They ship **11
easing curves and 8 durations**, with overshoots up to `1.56` — springy and
playful, correct for their brand. Designakum takes the *structure* (a token
set, press/enter separation, a travelling indicator) and **rejects the
personality**: overshoot drops from `1.12–1.56` to **`1.06`**, and the boot
sequence and ambient drift are refused outright.

## 4.2 The current state — a confirmed defect

[REPO] This is not a matter of taste.

- **Two duration tokens and one easing curve** exist: `--transition: 0.2s
  cubic-bezier(0.4,0,0.2,1)` and `--transition-slow: 0.4s`.
- **They are not used consistently.** `pages/admin.js` alone hardcodes `0.25s`
  (×3), `0.2s` (×2), `0.4s` and `.3s` — none referencing the tokens.
- **20 `@keyframes` blocks** across the codebase redefine the same effects:
  **four spinners** (`spin`, `ui-spin`, `co-spin`, `vf-spin`), four fades, four
  slide-ups, two skeleton sweeps.

Four spinners that can rotate at four different speeds is a defect the user
perceives as sloppiness.

## 4.3 Tokens

```css
/* Durations */
--t-press:  .11s;   /* press feedback — must feel instant   */
--t-ui:     .22s;   /* hover, colour, opacity               */
--t-enter:  .30s;   /* panels, modals, toasts, entrances    */
--t-stag:   .06s;   /* per-item stagger step                */

/* Easing */
--ease:      cubic-bezier(.22, 1, .36, 1);      /* default — decisive settle */
--ease-pop:  cubic-bezier(.2, 1.06, .32, 1);    /* appears — 6% overshoot    */
--ease-exit: cubic-bezier(.4, 0, 1, 1);         /* leaves — accelerate away  */
```

**Three curves. Not eleven.** [MEASURED] Two of Lumetra's are byte-identical
(`--ease-launch` and `--ease-data`) — that is drift, visible in their source.

**Keep `--transition` and `--transition-slow` as aliases** so no existing rule
breaks.

**Consolidate the 20 keyframes into five global ones** in `styles/globals.css`:
`fade`, `rise`, `pop`, `spin`, `sweep`. Delete the local copies. **This is a
cleanup, independently shippable, and it removes existing inconsistency rather
than adding anything.**

## 4.4 Interaction behaviour

**Press must be faster than hover.** [MEASURED] Lumetra implements this as a
single shared rule across ~20 selectors, and it is the pattern to copy verbatim
because it covers every future component for free:

```css
.btn:active, .nav:active, .card:active, .tile:active, /* … */ {
  transition-duration: var(--t-press);
}
```

**Hover — restrained, and capability-gated:**

| Element | Hover | Press |
|---|---|---|
| Button | surface lightens; `translateY(-1px)` | `translateY(0) scale(.98)` |
| Nav item | surface lightens; `translateX(2px)` toward content | — |
| **Active nav item** | **no transform** | — |
| Card / tile | border strengthens; shadow one step | `scale(.995)` |
| Row | reveals its actions | — |

**Motion is withheld from the thing you are already on** — [OBSERVED] Lumetra's
`.nav.on:hover { transform: none }`. Small, and it reads as deliberate.

**The 2px nav nudge must be direction-aware.** In RTL it moves the other way, or
it fights the reading direction. Use a logical transform or flip under
`html[dir="rtl"]`.

**Hover reveals must be capability-gated.** [REPO] Designakum has **no
`(hover: hover)` query anywhere**. On a mobile-heavy Gulf audience this is close
to a correctness bug, not a polish item:

```css
@media (hover: hover) {
  .row .actions { opacity: 0; transition: opacity var(--t-ui) var(--ease); }
  .row:hover .actions, .row:focus-within .actions { opacity: 1; }
}
@media (hover: none) { .row .actions { opacity: .75; } }
```

Note `:focus-within` — the keyboard path is not an afterthought.

## 4.5 Entrances

**Staggered, restrained:** `--t-stag: .06s` per item, `--ease-pop`, opacity plus
a 4–6px rise. Applies to the client's project grid and the owner's client cards.

**No entrance blur.** [MEASURED] Lumetra animates a 14px blur (`--stag-blur`).
It is their most expensive-feeling effect and it is **rejected**: blur is costly
on mobile GPUs, and softness contradicts precision (§1.2).

**Directional entrances.** Panels enter from the side they came from. Operator
mode enters and leaves in opposite directions, so switching *feels* like going
somewhere and coming back. **All of it `dir`-aware.**

## 4.6 Loading states

**Three cases, three treatments:**

| Case | Treatment |
|---|---|
| **Content arriving** | Skeleton matching the real layout — never a spinner |
| **An action in flight** | In-button spinner; the button stays its own width |
| **A page-level wait** | The layout shell renders immediately; regions fill as they resolve |

**Never a full-screen spinner.** [REPO] `Skeleton.js` exists and is the right
primitive.

**The pending-payment moment is explicitly not a loading state.** [REPO] It is
currently presented as a warning box while the webhook confirms. It is the
moment a person becomes a customer and it should read as confirmation, not as
an error (§8.3).

## 4.7 Page transitions

**Keep them nearly invisible.** Content fades and rises 4px over `--t-enter`;
the shell — sidebar, header — does not move at all.

**The one exception, and it is the brand's best motion moment: the navigation
indicator travels.** [MEASURED] Lumetra implements a single pill that animates
its position between nav items, with a genuinely elegant guard:

```css
.nav.on { background: var(--brand); }          /* the fallback IS the static state */
.side:has(> .navpill.ready) .nav.on {
  background: transparent;
  transition: color .18s var(--ease) var(--ink-delay, 0s);
}
```

Three things worth adopting exactly:

1. **One indicator that moves**, not a background per item. The active state
   *travels* — the clearest possible expression of §1.2's *movement*.
2. **`:has()` as progressive enhancement.** Without the indicator, or without
   `:has()` support, the item keeps its own fill. **Nothing breaks.**
3. **A delayed ink flip**, so the label's colour changes as the indicator arrives
   beneath it rather than before. This is the detail that reads as quality
   without anyone being able to name it.

**Designakum's version carries a diamond on the indicator's leading edge**
(§9.3) — which is what makes it ours rather than theirs.

## 4.8 Reduced motion

[REPO] Designakum has a single blanket rule setting everything to `0.01ms`.
Adequate, and less careful than it should be.

**Upgrade to targeted downgrades:**

```css
@media (prefers-reduced-motion: reduce) {
  .navpill      { transition: opacity var(--t-ui) linear; }  /* downgraded, not killed */
  .stagger > *  { animation: none; opacity: 1; }
  /* the skeleton sweep SURVIVES — see below */
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```

**Reduced motion means less movement, not no feedback.** A skeleton that does not
shimmer reads as *broken*, not as calm. Keep the sweep, or replace it with a
static tone.

## 4.9 What the brand forbids

Bounce · elastic · wobble · spin-as-decoration · parallax · ambient or
perpetual motion · boot sequences · entrance blur.

[MEASURED] Lumetra ships six `boot*` keyframes and three `aurDrift*` ambient
animations. For an operator opening a portal once a day that is a moment of
theatre. **For a Designakum client visiting ten minutes a month it is an
obstacle, and for an owner checking a failed payment it is pure latency.** Their
own reduced-motion block sets `.boot { display: none }` — they know.

---

# Section 5 — Layout Philosophy

## 5.1 The question every screen answers

> **What is happening? · Why? · What do I do next?**

A screen that cannot answer all three is not finished. This is the operating
test, and it is why the standard skeleton exists.

## 5.2 The standard screen skeleton

Every screen in both portals, without exception:

```
┌─────────────────────────────────────────────────┐
│  EYEBROW              ← what this screen is for │
│  Title                        [ one action ]    │
├─────────────────────────────────────────────────┤
│  (optional tip — dismissible)                   │
├─────────────────────────────────────────────────┤
│  SUMMARY BAND    ← the state, in 3–4 figures    │
├─────────────────────────────────────────────────┤
│  THE WORK                                       │
└─────────────────────────────────────────────────┘
```

**[OBSERVED] "Every screen is two things stacked — a summary across the top and
the actual work underneath."** Consistency is what reads as premium here, not
generosity: their gutter is a respectable 28px, but it is *the same on every
screen*, and the summary is *always* in the same place. The eye stops re-learning
the page.

**One primary action per screen, and it is contextual.** [OBSERVED] `+ New video`
on the board becomes `+ Add client` on the clients list and reverts on a record.
One slot, bound to the screen's purpose.

## 5.3 Spacing

[REPO] The 4px scale is sound and stays:

```css
--space-1: 4px    --space-2: 8px     --space-3: 12px   --space-4: 16px
--space-5: 24px   --space-6: 32px    --space-8: 48px   --space-10: 64px
```

**Three additions:**

```css
--measure:  720px;   /* max width of one editor column */
--gutter:   28px;    /* page margin — 16px below 720px */
--content-max: 1280px;
```

**Vertical rhythm comes from the scale only.** [REPO] Hand-picked margins inside
`<style jsx>` blocks are the most common drift in the current file. A value not
on the scale is a bug.

**Radii** [REPO] `8 / 12 / 20 / 28px` stay. They are softer than the mark, and
that is correct: **surfaces are comfortable, brand elements are sharp** (§9.3).
The diamond, focus rings and indicators carry the precision; a card does not
need to.

## 5.4 Density

**[PREFERENCE] Two densities from one component set**, via the `--density`
multiplier that already exists [REPO]:

| Portal | Density | Reasoning |
|---|---|---|
| **`/console` (owner)** | Tighter | An operator scanning many objects |
| **`/studio` (client)** | Roomier — body at `--text-lg` | **Ten minutes a month.** More air, larger targets |

**This is the honest resolution of "Lumetra is too dense".** [MEASURED] Their
12.5px median suits someone in the tool all day. It is too dense *for a client*
and about right *for an operator*.

**Touch targets ≥44px throughout the client portal.** Non-negotiable on a
mobile-heavy audience.

## 5.5 Responsive

> **[MEASURED] from Lumetra's breakpoint CSS, never [OBSERVED] rendered** — the
> browser window would not resize during the audit. These are rules, not
> verified appearances.

**The sidebar has three states:**

| Viewport | Behaviour |
|---|---|
| **> 1200px** | Full sidebar with labels |
| **≤ 1200px** | **Icon rail** — labels drop, icons remain |
| **≤ 720px** | **Bottom bar** — fixed, horizontal, 3–5 destinations |

Lumetra collapses at 1400px; **1200px is proposed for Designakum** because its
sidebars are shorter and its clients need less chrome.

**Content reflow:**

- Summary tiles **4 → 2, never 4 → 1**. Two figures side by side stay
  comparable; stacked they become a list and lose the at-a-glance read that is
  the entire point.
- Two-column work rows → one column at ~1080px.
- `--gutter` 28px → 16px at ≤720px. **Reduce the gutter, never the content.**

**The bottom bar matters most.** The client portal has three or four
destinations and an audience that skews heavily mobile — it fits naturally, and
it is the single most important responsive decision in the product.

**No `body { zoom }` for large screens.** [MEASURED] Lumetra scales the whole UI
at ≥1800px, which forces `calc(100vh / var(--zoom))` on every full-height
element forever. **Rejected.** If large-screen scaling is wanted, a `clamp()` on
the root font size achieves most of it without breaking viewport units.

## 5.6 RTL layout rules

Beyond the typographic rules in §3.6:

1. **Logical properties everywhere.** `padding-inline`, `margin-inline-start`,
   `inset-inline-start`. Physical `left`/`right` is a bug.
2. **Grid collapse order reverses.** A two-column row that collapses with the
   sidebar first in LTR must be checked in RTL — `grid-column` and explicit
   ordering do not flip automatically.
3. **The sidebar sits on the right** in Arabic. It is not "the left sidebar".
4. **Directional motion mirrors** (§4.4).
5. **The diamond needs no flip** — it is symmetric (§9.3).
6. **Every breakpoint reviewed in Arabic**, not just every screen.

---

# Section 6 — Component Philosophy

## 6.1 The five laws

1. **One panel treatment.** Differentiate by **surface**, never by adding chrome.
   A card with a border *and* a shadow *and* a contrasting fill is three
   separations doing one job — and it is the main reason the current dashboard
   reads as busy.
2. **Exactly one thing leads per screen** — one `--text-4xl`, one brand-coloured
   action, one emphasised panel. Two leads means two screens.
3. **Components are scope-agnostic.** The same tile serves "all clients" and
   "one client", rescoped. Half the components, twice the consistency.
4. **Absence is always worded.** Never blank, never `—`, never `null`.
5. **Extend the existing primitives; do not replace them.** [REPO] Button, Card,
   Badge, Input, Icon, Toast, ConfirmDialog, EmptyState, Skeleton, BrandGlyph are
   the right set.

## 6.2 Emphasis — resolving C3

[MEASURED] All four Lumetra summary tiles are `#FFFFFF`. The odd one out differs
in **exactly two properties**: a red-tinted border and a red number. Background,
padding, radius, shadow and width are identical.

**This is better than a second surface treatment**, which would have to be
maintained. **Emphasis is a modifier class changing a border colour and an ink
colour.** Nothing else.

```
.tile            → --border,       --text-primary
.tile.is-urgent  → --danger-border, --danger-ink
```

## 6.3 Buttons

| Variant | Fill | Ink | Border | When |
|---|---|---|---|---|
| **Primary** | `--brand`, **flat** | `--brand-ink` | none | **One per screen.** The screen's purpose |
| **Secondary** | `--bg-surface` | `--text-primary` | `--border-strong` | Alternative actions |
| **Ghost** | transparent | `--text-secondary` | none | Tertiary; toolbars; icon buttons |
| **Destructive** | transparent | `--danger-ink` | `--danger-border` | Delete, cancel, revoke |

**Rules:**

- **One primary per screen.** If a screen has two, it has two purposes — split it.
- **Destructive is outlined, never filled.** A filled red button is
  disproportionately loud for an action that should feel deliberate. It escalates
  to a filled red only inside a confirmation dialog, where it is the point.
- **Destructive always confirms.** [REPO] `ConfirmDialog` exists.
- **Loading keeps the button's width.** A button that shrinks to a spinner moves
  the layout under the cursor.
- **Never a gradient** (§2.6).
- **Minimum target 44px** in the client portal.

## 6.4 Cards

**Use a card when** the contents are **one object** a user can act on — a client,
a project, a plan.

**Do NOT use a card when:**

- It contains a single value → that is a stat, not a card.
- Everything on the screen would be a card → nothing leads; use sections.
- It wraps a form → use a section heading and `--measure`.
- It exists only to draw a border → the border was the goal; use spacing.

**One elevation for content, one for overlays.** [REPO] `--shadow-sm/md/lg`
already encode this.

**On a tinted ground, a card needs no border** (§2.4).

## 6.5 Navigation

**Sidebar structure:**

```
[diamond] Designakum
          Owner                ← the ROLE lives in the brand block
──────────────────────
  Board            12          ← counts as badges, tabular figures
  Clients           6
  ...
  KEEPING TRACK               ← group label: what it is FOR
  Attention         1          ← badge turns --danger when non-zero
  ...
──────────────────────
  Settings
  Sign out
```

**Naming law: nouns from the business, never from the schema.** No "Management",
no "Dashboard", no "Records", and never a table name. A group label says what the
group is *for*.

**Active state:**

- Weight 600 → **700**, colour → `--text-primary`.
- A **travelling indicator** carries the fill (§4.7), with the static fill as its
  `:has()` fallback.
- The badge on the active item drops its filled chip for an inset ring, so it does
  not fight the indicator.

**The client's sidebar shows no role** — a client has no other mode to be
confused with. Only operators see `Owner`.

## 6.6 Status

**The absolute rule: never use `--brand` for generic information.** Blue is spent
on *act here* (§2.3). An informational chip is grey.

**Chips carry state AND quantity.** [OBSERVED] `Overdue 1d`, `$1,250
outstanding`. A chip that needs a legend has failed.

For Designakum: `Payment failed · 4 days left` · `120 SAR · renews 4 Mar` ·
`Live` · `Not published yet` · `Complimentary`.

**Every status uses its four-part token set** — fill, background, border, **ink**
(§2.3). The chip's text uses `-ink`, never the base value.

**Zero is not alarming.** [OBSERVED] A count of 0 renders in normal ink with a
grey icon chip; only a non-zero count earns the semantic colour.

## 6.7 Forms

| State | Treatment |
|---|---|
| **Default** | `--border`; label above, 12px/600 |
| **Focus** | `--border-focus` + 2px `--brand-focus` ring. **Never remove the outline** |
| **Error** | `--danger-border`, message **below** in `--danger-ink`, icon paired |
| **Success** | Confirmation on the *object*, not a red-green flip of the field |
| **Disabled** | `--text-muted`, reduced surface, `cursor: not-allowed` — **and a reason** |

**Three rules:**

1. **An error says what to do, not what went wrong.** "Enter an email address" —
   not "Invalid input".
2. **A disabled control must explain itself.** [REPO] An unentitled client meets a
   *refused save with no explanation*. A disabled save must carry its reason
   (§7.3, §8.2). **A disabled control with no explanation is the single most
   frustrating pattern in the current product.**
3. **Validate on blur, not on keystroke.** Errors that appear while typing read
   as scolding.

**Success is acknowledgement.** A brief confirmation flash on the saved object
plus a toast — trust is built by confirmation (§1.2).

## 6.8 Tables

**Prefer object rows over dense tables.** A table is right when a user needs to
*compare across many rows*; a card or row is right when they need to *act on
one thing*.

| Rule | Detail |
|---|---|
| **Density** | Owner: compact (36–40px rows). Client: comfortable (48px+) |
| **Numerics** | Right-aligned, tabular figures (§3.4) |
| **Hierarchy** | Primary column 600 weight; everything else 400/`--text-secondary` |
| **Borders** | Horizontal rules only, `--border`. **Never a full grid** |
| **Actions** | Revealed on hover, capability-gated (§4.4) |
| **Mobile** | Tables become stacked rows. Never a horizontal scroll of a full table |

## 6.9 Modals

**A modal interrupts. It must earn the interruption.**

**Use for:** destructive confirmation · a short focused decision that blocks
progress · a genuinely modal moment (checkout confirmation).

**Do NOT use for:** editing content — that is a page or a panel · anything
needing more than one screen of scrolling · showing information the user could
read in place · anything a user might want to link to or return to.

**Rules:** one primary action · `Esc` and scrim both close (**except** during a
destructive confirm) · focus trapped, focus returned on close · never nest a
modal in a modal · enter with `--ease-pop`, leave with `--ease-exit`.

---

# Section 7 — Portal Architecture Rules

## 7.1 The governing principle

> **Client experience is a projection of the owner's workflow, not a separately
> invented workflow.**

The client's model of their own state may be **simpler** than the platform's, but
**never different from it**. Nothing is invented, nothing internal leaks.

[OBSERVED] Lumetra proves this works: the owner sees seven pipeline stages, the
client sees five — *Waiting to start*, *Picked up* and *Changes needed* are
collapsed into "Received". Nothing shown to the client is untrue.

**And [OBSERVED] their own product proves how easily it is lost.** The client's
activity feed reports *"moved this from **Picked up** to **Waiting to start**"* —
the exact internal vocabulary the progress rail hides — because the projection
lives in the status component rather than at the data layer.

> **Design law.** The projection lives in **one pure, tested module** mapping
> platform state → customer language. **Every** client-facing surface passes
> through it: dashboards, feeds, emails, receipts. [REPO]
> `lib/billing-status.js` is exactly this shape and is the model to follow —
> it **reads** the rule, it never restates it.

## 7.2 The split

```
PUBLIC          /                     the owner's portfolio
                /{address}            a client's portfolio
                /signup  /signup/verify  /privacy  /terms

CLIENT PORTAL   /studio               "make my presence better"
OWNER PORTAL    /console              "keep the business healthy"

SHARED          /signin  /reset-password  /subscribe
```

**The rule that resolves the confusion:**

> **`/console` never edits content. `/studio` never shows another person's data.**

**Owner portal — `/console`.** Purpose: *what needs me today?* Navigation is
**attention-first**, not object-first. It manages a **platform**, not customer
relationships — **it must not become a CRM.**

- **Home** answers "what needs me today" with 3–4 question-tiles, each navigable,
  each with a qualifying footer, and an attention queue beneath.
- **Attention** groups by *reason*, each with a definition and a **"what clears
  it"** line: payment failed · handover unconfirmed · DNS unverified · invite
  never claimed · disabled but paying.
- **Clients** is a card grid of objects — not a table of rows.
- **A client record is ONE scrolling page. No tabs** (resolving C6). Tabs hide
  what an owner wants at a glance and cost a click each.

**Client portal — `/studio`.** Purpose: *is my presence good, and is it working?*

- **State before controls.** Status leads; the editor is one deliberate step
  behind. **This is the whole difference between "a settings panel" and "a
  product".**
- **Fewer concepts.** [OBSERVED] Lumetra's client sees 3 destinations against the
  owner's 6, and 3 summary tiles against 4 — money and staffing removed entirely.
- **Imagery present.** A portfolio product that never shows customers their own
  work in the dashboard is failing at its own pitch. [REPO] `PreviewPane` exists.

**Never visible to a client:** tenant id · the words *tenant*, *workspace*,
*slug*, *username*, *environment* · another client · `platform_owners` · anything
named after a table.

## 7.3 Operator mode

**Explicit, visible, impossible to confuse.**

An owner needing to fix a client's page enters `/studio` **from that client's
record**, deliberately. Marked **twice**, per [OBSERVED] practice:

1. A **quiet marker in the chrome** — naming the client and `read only`.
2. A **persistent floating pill**, brand-bordered, with the **exit inside it**:

```
        Layla Hassan's studio
        You are Feras · read only          [ ← Leave ]
```

**Entry is grouped by role** — "Open another dashboard", listing people and
clients, not a tenant dropdown. **An owner picks *Layla's studio*, not a row.**

**[PREFERENCE] Read-only is the default**, with editing a deliberate second step.
Designakum's owners genuinely need to edit client sites, so it cannot be
read-only *only* — but landing inside someone's profile editor is the wrong
default.

> **Security, stated once and clearly.** This is **labelling, not enforcement.**
> [REPO] Platform owners are already tenant admins on every tenant via the
> Section F trigger, and `is_tenant_admin()` is what permits the write. **RLS is
> the security boundary. Hiding or disabling a control is never one.** Read-only
> operator mode is a UI default and **must never be described as a security
> feature** unless it is enforced server-side — which would be its own decision.

## 7.4 The route-name decision

> **[OPEN DECISION — D2] `/studio` + `/console`, or something else?**
>
> **This is the only item blocking Phase 1.** [REPO] A tenant slug becomes a
> top-level route, so **every new top-level segment must be added to
> `RESERVED_SLUGS` before the route ships** (`lib/reserved-slugs.js`).
> **[MEASURED] Checked against `lib/reserved-slugs.js` this session:**
> `dashboard`, `account`, `billing`, `settings`, `status`, `health`, **`signin`**,
> `sign-in` and `login` **are already reserved**. **`studio`, `console` and `me`
> are NOT.**
>
> (An earlier draft listed `signin` as unreserved. It is reserved — corrected.)
>
> Reserving them is a one-line change with no migration — **but it must land
> first, and it must be checked against existing slugs**, because a customer who
> already owns `studio` would be silently shadowed by a static route and their
> site would simply stop resolving.

---

# Section 8 — Billing Experience Principles

**Principles only. No billing logic is touched, and none is designed here.**

## 8.1 The premise

> **Roughly half of Designakum's premium gap is not visual.**

[REPO] The product takes a payment and **sends nothing** — no receipt, no renewal
notice, no failed-payment warning, no cancellation confirmation. And an
unentitled client meets a refused save with no explanation.

**No amount of typography fixes a product that goes quiet when you give it
money.** Lumetra does not feel premium mainly because of how it looks; it feels
premium because it never leaves you wondering.

## 8.2 The two governing rules

1. **Every state explains itself** — in customer language, through the §7.1
   projection. Never `past_due`, never `environment`, never a status enum.
2. **Every problem names its exit condition.** [OBSERVED] *"OVERDUE — the due
   date has passed and it is not finished. **What clears it:** move it on, or push
   the date out."* This is the difference between a notification and a task.
   **Notifications create anxiety; tasks create agency.**

## 8.3 State principles

**Payment states.** [REPO] `deriveBilling()` already produces `pending` /
`past_due` / `canceling` / `comped` / `active` **with the right action attached
to each** — the past-due message points at PayPal because the funding source
lives there and nothing this screen could collect would fix it. **That reasoning
is correct and must be preserved verbatim.** The UI translates the vocabulary; it
does not re-derive the rule.

**The pending moment is a milestone, not an alert.** [REPO] After approving at
PayPal the client waits on the webhook while the UI polls, correctly
distinguishing "confirming your payment" from "finish approving". The logic is
right and the *presentation* is a warning box. **This is the moment a person
becomes a customer and it currently looks like an error.**

**Entitlement, made legible.** Entitlement gates **writes, not reads** — an
unpaid client can browse everything and save nothing. Say so *before* they type:

```
⏸  Your page is saved but not published yet
   You can look around, but changes will not save until your
   subscription is active. Your work is safe.     [ Choose a plan ]
```

**Comped is neutral, never an error.** Seven of the current workspaces are comps.
A billing screen that treats a comp as missing data insults the most valued
customers on the platform. *"You're on a complimentary plan — nothing to pay."*

**Cancellation is three beats, not an action:** *what you keep* ("your page stays
live until 4 March 2027") → *one honest alternative offered once* → *confirm*.
**No dark patterns, no fake urgency.**

**Renewal, receipts, failure.** Each answers: what was charged, for what, until
when, and — on failure — how many days remain and where to fix it.

**Dual currency stays.** [REPO] Customers are quoted SAR and PayPal debits USD,
and checkout states both **deliberately**, because a surprise USD figure on a
statement is how a payment becomes a dispute. **Keep it.**

**The riyal symbol is a client-supplied image**, never the letters "SAR" spelled
out. `formatAmount()` is the one place to change it.

## 8.4 Two traps to design around

- [REPO] **A comped workspace cannot check out** — `billing-checkout` refuses
  `already_subscribed` (409), so a mistakenly comped workspace has no way to buy
  out of it. Until that is decided, **the comp dialog must warn at the point of
  granting.**
- [REPO] **`tenant_domains.status` is set by hand and drifts.** **Do not build a
  client-facing "verified" badge on a column known to lie** — either verify live
  or word it honestly.

## 8.5 Emails are part of the design system

Five emails, bilingual, brand-tokened, in the existing Resend infrastructure:
receipt · renewal notice · payment failed · cancelled · welcome-to-paid.

**They obey every rule in this document** — the projection (§7.1), the semantic
palette (§2.3), Latin numerals, and real Arabic. A receipt reading
`tenant status: active` is the same defect as a leaking activity feed.

> **Backend implication.** Four are webhook-driven and land naturally where the
> webhook already recognises their triggers. **The renewal notice is the odd one
> out — nothing in the platform runs on a schedule**, so it needs a cron or
> scheduled function. Scope it separately; ship the other four first.

---

# Section 9 — Brand Asset Rules

## 9.1 The assets

[REPO] `public/`:

| File | What it is | Size |
|---|---|---|
| `logo-light.png` | The wordmark in `#2A6BCE` — **for light backgrounds** | 900×230 |
| `logo.png` | The same wordmark in **white** — for dark backgrounds | 900×230 |
| `favicon.png` | **The same wordmark again**, white, centred in a square with wide dead margins | 512×512 |

## 9.2 Logo usage

**Light backgrounds** → `logo-light.png`. **Dark backgrounds** → `logo.png`
(white). Both exist; neither is optional.

**Clear space:** a minimum margin equal to the **height of one diamond** on all
sides. The wordmark is horizontally long (≈3.9:1) and crowds easily.

**Minimum legible width: ~120px.** Below that the diacritics merge and the
diamonds stop resolving. **This is why the favicon does not work** (§9.3).

**Prohibited, without exception:**

- ❌ Recolouring to anything but `--brand` or white
- ❌ Gradients, glows, shadows, strokes or outlines on the mark
- ❌ Stretching, condensing, skewing, or rotating
- ❌ Rebuilding the wordmark in a different typeface
- ❌ Adding a Latin transliteration lockup **as if it were the logo**
- ❌ Placing it on a busy image without a solid plate
- ❌ Using it as a decorative background element or watermark
- ❌ Using it where an icon is needed — that is §9.3

**On the missing Latin lockup:** [MEASURED] there is none, and **this document
does not invent one.** Where Latin branding is needed, set "Designakum" in
Manrope 800 beside the mark — as *typography*, never presented as the logo.

## 9.3 The diamond as a UI primitive — yes, with a caveat

> ## ⚠ CORRECTED 2026-08-14 — a symbol mark exists
>
> **This section's premise was wrong.** The brand asset audit
> ([designakum-brand-asset-audit.md](designakum-brand-asset-audit.md)) found a
> **standalone Kufic monogram in four finished variants** — blue and white, on
> transparent and on tiles. It was absent from `public/`, not from the brand.
>
> **Use the monogram as the app mark, favicon and icon-rail glyph.** It is
> consistent with the wordmark by construction, and it requires inventing
> nothing — which honours "do not invent a mark" better than the proposal below.
>
> **The diamond is demoted** to an optional typographic motif — bullets, rail
> nodes, step markers. It is no longer an identity element, and **D3 is
> withdrawn**. The open question that replaces it is smaller: the monogram is
> **1.77:1 landscape**, so how it is framed inside a square, and whether it holds
> at 16px, must be tested.
>
> The rest of this section is retained for its reasoning about *why* an icon-only
> mark is needed. Its conclusion is superseded.

**The problem (as understood before the asset audit).** [MEASURED] **There is no
icon-only mark in `public/`.** The favicon is the wordmark shrunk into a square,
illegible at 16–32px. And §5.5 specifies an **icon-rail sidebar at ≤1200px**, for
which there is currently nothing to put in the rail.

**The answer is already in the mark.** The diamond i'jam is its single ornamental
decision, unmistakable at 12px, and **distinct from every convention in the
reference product** — Lumetra's rails, bullets and nodes are all circles.

**Permitted system uses:**

| Use | Form |
|---|---|
| **App mark / favicon / icon rail** | The diamond alone, in `--brand` |
| **Progress rail nodes** | Diamonds — filled = done, outlined = to come |
| **Setup-rail step markers** | Diamond, filling as each step completes |
| **List bullets in prose** | Small diamond instead of a disc |
| **Navigation indicator** | A diamond on the indicator's leading edge (§4.7) |
| **Empty-state motif** | One large, very low-opacity diamond as a ghost |

**Construction rules — derived, not invented:**

- **Keep the slight tilt off true 45°.** That is where the movement lives. A
  perfectly axis-aligned diamond looks static and generic.
- **Sharp corners. No rounding.**
- **Flat fill.** No gradient, no glow.
- **It needs no RTL flip** — a diamond is symmetric, which is a real advantage
  over any arrow-derived mark.

**Why this matters more than anything else in this document:** most of §§2–6
makes Designakum a well-built dashboard, and several of those decisions would be
at home in any premium SaaS. **The diamond is the one element no competitor can
borrow**, and it costs an SVG path.

> **[OPEN DECISION — D3] Is the diamond available as the app mark?**
> Extracting a UI primitive from the logo is a **brand** decision, and inventing
> a logo is not a UX task. This document **derives** from an existing asset and
> proposes nothing new — but it needs Feras's sign-off before the icon rail,
> favicon or progress rails are built on it.

## 9.4 Iconography

The mark has **sharp corners and chiselled, flat-cut terminals — not one rounded
corner exists in it.**

**[REPO] The current renderer contradicts this in one line.**
`components/ui/BrandGlyph.js` draws every stroke glyph with
`strokeLinecap="round"` and `strokeLinejoin="round"` — the softest possible
terminal against a mark with none.

**Specification:**

| Property | Value | Why |
|---|---|---|
| Grid | 24×24 | matches the existing `viewBox` [REPO] |
| Stroke | 2px, monoline | the mark is near-monoline |
| **Caps** | **`butt`** | chiselled terminals |
| **Joins** | **`miter`** | sharp corners |
| Corner radius | **0** | there are none in the mark |
| Colour | `currentColor`, monochrome | never multicolour |
| Pairing | **always beside a word** | §6.6 |

**Two cautions against literalism.** Miter joins on acute angles produce long
spikes — set `stroke-miterlimit` or soften the path. And **`butt` caps on a 2px
stroke can read as frail at 16px**; check optically at the smallest size actually
used and accept `square` where `butt` looks thin. **The goal is the mark's
character, not a doctrine.**

**Delete every functional emoji.** [REPO] `pages/admin.js` contains **31**,
including 🔴 🟡 🟢 used *as status indicators* — an emoji cannot inherit
`currentColor`, cannot respond to the theme, cannot be recoloured for the light
palette, and renders as a different glyph on every platform. Also present: 👋×4,
🎉×4, 🎨, 🌐, 📷, 📁, 👤, 🔍, ★×3, ✓×9, ⚠.

**Emoji survive only in genuinely expressive copy** — a 🎉 on completion is fine;
a 🎨 as an icon is not; a 🔴 as a status dot is a defect.

---

# Section 10 — Implementation Constraints

**This section is binding.** [REPO, GRANDMASTER §4.2, `architecture/overview.md`
§1]

## 10.1 The stack, as it actually is

- **Next.js 14, Pages Router, plain JavaScript.** No TypeScript, no `tsconfig`.
- **styled-jsx** for all styling. **No Tailwind, no PostCSS.**
- **Five runtime dependencies, zero devDependencies:** `@supabase/supabase-js`,
  `next`, `react`, `react-dom`, `react-image-crop`.
- Design tokens are **CSS custom properties** in `styles/globals.css`.
- Tests are the Node built-in runner over pure `lib/` modules. **No React
  testing library.**

> **A redesign that assumes Tailwind, shadcn, Radix, Framer Motion or a CSS-in-JS
> runtime is not implementable here.**

## 10.2 Allowed without asking

- ✅ CSS custom properties — new tokens, new themes
- ✅ `color-mix()`, `clamp()`, logical properties, `:has()`, container queries
- ✅ `@media (hover)`, `(prefers-reduced-motion)`, `(prefers-color-scheme)`
- ✅ `@keyframes` and CSS transitions
- ✅ New React components using plain React + `<style jsx>`
- ✅ Extending the existing `components/ui/` primitives
- ✅ New pure modules in `lib/`, with tests
- ✅ SVG paths authored inline (including the diamond)
- ✅ OpenType features (`font-feature-settings`, `font-variant-numeric`)
- ✅ Using any of the **four already-loaded font families**

## 10.3 Requires explicit approval

- ⚠️ **Any new npm package**, without exception
- ⚠️ **A fifth font family**, or any additional font request
- ⚠️ TypeScript, in any form
- ⚠️ Tailwind, PostCSS, or any build-step CSS tooling
- ⚠️ App Router migration
- ⚠️ Splitting the repository
- ⚠️ Any change to RLS, entitlement, the tenant resolver, billing logic, or auth
- ⚠️ Anything running on a schedule (cron / scheduled functions)
- ⚠️ New database tables or columns — **including the activity log and the
  engagement-brief notes**

## 10.4 Guarantee

**Every design decision in this document is implementable with §10.2 alone.**

Specifically: the brand layer is `color-mix()`; tabular figures are an OpenType
feature on a loaded font; Reem Kufi is already in the request; the travelling
nav indicator is CSS with a `:has()` fallback; the diamond is an SVG path. **No
recommendation here requires a new dependency.**

**What is design-complete but backend-blocked** (specified, not scheduled):

| Item | Why it is blocked |
|---|---|
| Activity feed | No event log exists. Needs a table and writes — **its own project** |
| Engagement brief (owner-only client notes) | Needs a column or small table. **Owner-visible only** — it holds commercial terms |
| Billing emails ×4 | Edge Function work; triggers already recognised |
| Renewal notice | Needs a scheduler — nothing runs on a schedule today |
| Per-tab URLs | New routes; tab state is currently internal |
| Client-chosen password at invite | New token flow; touches auth |

## 10.5 Non-negotiable invariants

These are **not** design decisions and cannot be traded against aesthetics:

1. **RLS is the security boundary.** Hiding or disabling a control is never one.
2. **Entitlement gates writes, not reads.**
3. **The entitlement predicate is `environment IS DISTINCT FROM 'sandbox'`** —
   never `= 'live'`. Comps carry a NULL environment; `= 'live'` would revoke
   every comped client at once.
4. **A sandbox subscription never grants production access.**
5. **Comps exist and must remain supported.**
6. **Never reintroduce a default or singleton tenant.**
7. **Never expose tenant ids or internal identifiers to a client.**
8. **Prices resolve server-side**, never hardcoded in the UI.
9. **Latin numerals in both locales.**
10. **`npm test` and a build must pass** before anything ships.

---

# Section 11 — Final Decisions Table

## 11.1 Settled

| Decision | Status | Reason |
|---|---|---|
| **Brand blue = `#2A6BCE`** | **RECOMMENDED — needs D1** | Matches the shipping asset; better contrast (5.13:1 vs 4.71:1); the more serious blue |
| Single `--brand` token, all else derived via `color-mix()` | **SETTLED** | Resolves the conflict in one line either way |
| `--accent*` kept as aliases | **SETTLED** | Avoids a rename churn across `admin.js` |
| **Gradient and glow retired** | **SETTLED** | The mark is flat; a gradient is underivable from one token |
| **Semantic: blue = act here only; info = grey** | **SETTLED** | A blue brand makes "info blue" collide with the primary action |
| **Amber narrowed to time-bounded, actionable states** | **SETTLED** | Resolves C5. If the user cannot act on it, it is grey |
| `-ink` added to every semantic set | **SETTLED** | A fill colour is not legible as 11px text; correction flips per theme |
| **Cool ground `#F3F5FB`**, warm cream rejected | **SETTLED** | Resolves C2. Warm cream pushes royal blue toward violet |
| **Dark theme rebuilt on navy** | **SETTLED (light first)** | The current ramp is neutral near-black with no brand in it |
| **Type scale + `--text-3xl` 34 / `--text-4xl` 44** | **SETTLED** | Ratio 1.86× → 3.1×. Additive; nothing moves |
| **Manrope `tnum`, not JetBrains Mono** | **SETTLED** | Resolves C4. Same benefit, zero network cost |
| **Manrope kept for Latin; IBM Plex Sans rejected** | **SETTLED** | Not currently loaded; a fifth family is unjustified |
| **Reem Kufi for Arabic display** | **SETTLED** | Already loaded at 400–700, never used in the product's chrome; closest face to the mark |
| **Arabic line height 1.75, never Latin's** | **SETTLED** | Diacritics collide otherwise |
| **No tracking / no uppercase on Arabic, ever** | **SETTLED** | Cursive script; tracking severs letter joins |
| **3 easing curves, overshoot capped at 1.06** | **SETTLED** | Precision brand. Lumetra's 1.12–1.56 is their personality, not ours |
| **Press (110ms) separated from entrance (300ms)** | **SETTLED** | Cheapest single improvement to perceived quality |
| **20 keyframes consolidated to 5** | **SETTLED** | Cleanup — four spinners is a defect, not a preference |
| **No boot sequence, ambient motion, or entrance blur** | **SETTLED** | Cost with no informational job; blur contradicts precision |
| **`(hover: hover)` gating required** | **SETTLED** | Currently absent; close to a correctness bug on a mobile audience |
| **Two portals: owner ≠ client, not one page with hidden permissions** | **SETTLED** | The core finding of the entire audit |
| **Client experience is a projection, in one shared module** | **SETTLED** | Lumetra's own feed proves how easily this is lost |
| **Client record = one scrolling page, no tabs** | **SETTLED** | Resolves C6. Confirmed on screen at comparable data volume |
| **Operator mode: explicit, marked twice, exit inside the marker** | **SETTLED** | Cannot be entered and forgotten |
| **Read-only operator default is UI, never a security claim** | **SETTLED** | RLS is the boundary |
| **Emphasis = border + ink, not a second surface** | **SETTLED** | Resolves C3. Cheaper, and it is what the product actually does |
| **Icons: butt caps, miter joins, 2px, 24px grid** | **SETTLED** | The mark has no rounded corners; current code sets both to `round` |
| **All 31 functional emoji removed** | **SETTLED** | Cannot theme, cannot recolour, platform-dependent |
| **Sidebar: full → icon rail (1200px) → bottom bar (720px)** | **SETTLED** | Client audience skews mobile |
| **Summary tiles collapse 4 → 2, never 4 → 1** | **SETTLED** | Stacked figures stop being comparable |
| **No `body { zoom }` large-screen scaling** | **SETTLED** | Forces `calc(100vh / var(--zoom))` on every full-height element forever |
| **No new dependency; no Tailwind; no TypeScript** | **SETTLED** | GRANDMASTER §4.2. Every decision here honours it |

## 11.2 Open decisions — require Feras

| ID | Decision | Blocks | Why it cannot be settled here |
|---|---|---|---|
| **D1** | **`#2A6BCE` or `#2C6FE0`?** If `#2C6FE0`, the logo files must be regenerated to match | The entire token layer, and the emails | **A brand call, not a UI one.** Both values in circulation is the one option with no upside |
| **D2** | **Route names — `/studio` + `/console`?** | **Phase 1 entirely** — `RESERVED_SLUGS` must land before any route ships | Naming is the owner's; and it must be checked against existing slugs first |
| ~~D3~~ | ~~Is the diamond available as the app mark?~~ | — | **WITHDRAWN 2026-08-14.** A Kufic monogram already exists in four variants (brand asset audit). Use it. Replaced by **D11** |
| **D11** | **How is the 1.77:1 monogram framed inside a square, and does it hold at 16px?** | Favicon, app icon, icon rail | A craft question for the designer, not an invention |
| ~~D4~~ | ~~Reem Kufi's loaded weight range~~ | — | **CLOSED during writing.** Verified in `_document.js`: Reem Kufi ships 400/500/600/700, Manrope ships 800. No new font request needed |
| **D5** | **Density split — one density or two?** | Component sizing | [PREFERENCE] Owner tighter / client roomier is proposed, not settled |
| **D6** | **Client body size — 14px or 16px?** | Client portal type | Follows D5 |
| **D7** | **Attention queue vs charts on `/console`** | Owner home layout | Queue recommended at 14 clients; changes if fast growth is expected |
| **D8** | **Merging Profile and Card into one "page" editor** | Client editing model | The largest IA change; carried over unresolved from the blueprint |

**Nothing above is pretended to be solved. D1 and D2 are the two that block
work.**
