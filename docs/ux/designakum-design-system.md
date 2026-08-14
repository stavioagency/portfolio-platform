# Designakum — Visual Design System & Premium UX Principles

**Written 2026-08-14.** The second half of the UX preparation phase. The
structural audit (roles, IA, navigation) lives in
[designakum-ux-blueprint.md](designakum-ux-blueprint.md); this document owns the
**visual system** — type, space, colour, motion, components — and ends with the
principles implementation is judged against.

This document **owns** the visual system. Blueprint §9 is superseded by
§§1–8 here and should be read as the summary of it.

---

## 0. Method, and what is actually evidenced

Honesty about provenance matters more than volume here, because a design system
built on half-remembered impressions is how products drift.

| Label | Meaning |
|---|---|
| **[MEASURED]** | Read out of Lumetra's live stylesheet this session, with the value quoted |
| **[OBSERVED]** | Seen rendered on screen — 2026-08-14 authenticated audit (blueprint §3), or the sign-in page this session |
| **[REPO]** | Verified against this repository, file named |
| **[INFERRED]** | Follows from a measured rule, but the screen was not seen rendered |
| **[PREFERENCE]** | A design judgement. The owner is the authority on taste |

### What happened this session

**Two passes, in order.**

**Pass 1 — stylesheet, unauthenticated.** The in-app browser has its own cookie
jar, so it landed on the magic-link gate. That mattered less than expected: the
sign-in page **ships the entire application stylesheet** — 1,073 rules, both
themes, every token, all 25 keyframes and all 15 breakpoints, including rules
for screens only a signed-in user ever sees. The *system* was fully measurable
from the gate.

**Pass 2 — the authenticated application, via the owner's own Chrome session.**
Signed in as **Feras · Owner** on `portal.lumetraadvisors.com`. Screens reached:
Board (summary + Lanes), Attention, Clients, the Ali Habib client record, the
account menu, and — through it — **a client dashboard** (Ali Habib) and its
Updates screen. Read-only throughout: nothing was created, moved, assigned,
edited or deleted, and impersonation was exited via **Leave** at the end.

**Findings from pass 2 are in [Appendix A](#appendix-a--authenticated-application-audit),
which also corrects three claims in §§2–5 that the rendered screens disproved.**

**One caveat that survives.** The browser window would not actually resize
(`innerWidth` stayed 1470 — the window is maximised, and the resize call
succeeds without effect). **Responsive behaviour is therefore [MEASURED] from
the breakpoint CSS, never [OBSERVED] rendered.** §8 stands as written; it
describes rules, not appearances.

### Repository state, verified

Repo `/Users/feras/Documents/GitHub/portfolio-platform`, branch `main`, clean,
**synchronised with `origin/main` (0 ahead / 0 behind)**. No `production` branch
exists — `main` is the deploy branch. The blueprint is present but **untracked**.
Latest commit `477ba11` "Write the UX context handoff and close the stabilisation
phase".

> **Note on where this session started.** The working directory given was
> `/Users/feras/Downloads/portfolio-platform-main`, which is the **old,
> non-git copy** and contains no `docs/`. All work here is against the GitHub
> repo above. Worth correcting in whatever launches these sessions.

---

## 1. Typography

### 1.1 What Lumetra actually does

The measured numbers overturn the intuitive story, so they come first.

**Font stack** [MEASURED]: `Archivo` (400/500/600/700) + `Archivo Black` for the
lettermark + **`JetBrains Mono`** (400/500/700). Three faces, one Google Fonts
request.

**33 distinct font sizes** [MEASURED], including half-pixel values (7.5, 8.5,
9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5px). This is *not* a clean modular
scale. It is a hand-tuned one.

The distribution is the finding:

| Band | Rule count | What lives there |
|---|---|---|
| 7.5–11.5px | ~105 | eyebrows, labels, badges, meta, footers |
| 12–14px | ~85 | body, rows, cards — **the bulk of the interface** |
| 15–19px | ~10 | sub-heads |
| 22–54px | ~10 | titles and the lead number |

**Median size is ~12.5px.** The body copy is *small*.

**Weight** [MEASURED]: `700` in **96** rules, `600` in 27, `500` in 5, `800` in
4, `400` in **2**. Bold is the default; regular weight barely exists.

**Letter-spacing** [MEASURED]: 23 distinct values, and they are a *function of
size*:

| Size | Tracking | Example selector |
|---|---|---|
| ~8–11px uppercase | **+0.10 to +0.42em** | eyebrows, group labels |
| 12–16px | +0.01 to +0.04em | body, rows |
| 25px | −0.01em | `.h1` |
| 34px | −0.02em | `.s-n` (stat number) |
| 38px | −0.025em | `.pc-n` |
| **54px** | **−0.03em** | `.fin-hero-n` (the lead figure) |

**Monospace is used in 43 selectors** [MEASURED], and every one is *data*:
`.t-num` (numeric table cells), `.fin-amt` (money), `.rel-when` (timestamps),
`.n-badge` (nav counts), `.host` (domains), `.keys b` (keyboard hints),
`.kb-n`, `.gauge-n`, `.dvg-peak`. Nothing prose is set in mono.

### 1.2 Why it works

**The premium signal is the ratio, not the size.** This is the single most
important correction to the existing blueprint, which says the 26px cap is "the
mechanical reason nothing on a page can lead."

That is half right. The real number is the **lead-to-body ratio**:

- Lumetra: `54px / 12.5px` ≈ **4.3×** (typical screen: 34 / 12.5 ≈ **2.7×**)
- Designakum: `26px / 14px` = **1.86×** [REPO: `styles/globals.css`]

Designakum's problem is not that 26px is small in absolute terms. It is that
**14px body is large relative to it**. Raising the ceiling alone would help;
raising the ceiling while holding body copy where it is gets you most of the way
there for free.

**Tracking as an optical system.** Tight display type reads as *designed*;
loose micro-caps read as *labelled*. Together they create hierarchy at a glance
without a single border. Designakum has essentially no letter-spacing system —
this is a cheap, high-yield gap.

**Bold-at-small is what makes it feel confident.** A 12px/700 label is
assertive; a 14px/400 label is a form field. Lumetra is dense *and* legible
because weight carries what size would otherwise have to.

**Mono for figures does three jobs at once**: columns align, dates stop reading
as prose, and a figure becomes visually a *fact*. In a bilingual product it does
a fourth — see below.

### 1.3 How Designakum should adapt it

**Adopt: widen the ratio, not the whole scale.** Add two sizes to
`styles/globals.css`; change nothing existing.

```
  --text-3xl: 34px    page titles
  --text-4xl: 46px    the one number or sentence that leads a screen
```

Ratio becomes 46/14 ≈ **3.3×**. One `--text-4xl` per screen; if a screen needs
two, it is two screens.

**Adopt: a tracking scale, sized.** This does not exist today at all.

```
  --track-eyebrow:  0.12em    /* Latin only */
  --track-tight:   -0.02em    /* --text-3xl */
  --track-lead:    -0.03em    /* --text-4xl */
```

**Adopt: tabular figures — but not by adding a mono webfont.**

Lumetra loads JetBrains Mono. Designakum already loads four families (Manrope,
IBM Plex Sans Arabic, Reem Kufi, Cairo) via a single `<link>` in
`pages/_document.js`, and that file carries a comment explaining how hard-won
that single request was. **Adding a fifth family taxes the thing the codebase
already fought for.**

Manrope is a variable font with **tabular figures available as an OpenType
feature**. The whole benefit — aligned columns, figures reading as data — is
reachable with zero network cost:

```
  --numeric: 'Manrope', system-ui;    /* + font-feature-settings: "tnum" 1 */
```

Apply to money, dates, counts, analytics, nav badges. **This directly serves
the Latin-numerals-in-both-locales rule** — a tabular Latin figure renders
identically inside an Arabic RTL line, which is exactly the behaviour that rule
exists to guarantee.

*If* a true monospace is wanted later for domains and technical strings, use the
**system mono stack** (`ui-monospace, SFMono-Regular, Menlo, monospace`) — still
zero requests.

**Adopt: weight before size.** Both Manrope and IBM Plex Sans Arabic are
variable. Prefer 600/700 at a small size over 400 at a larger one.

**Do NOT adopt: the density.** Lumetra's 12.5px median suits an operator in the
tool all day. A Designakum client is in their dashboard **ten minutes a month**.
Body copy stays at `--text-md: 14px`; the *client* portal should arguably float
to 15–16px. Widen the ratio from the top, never by shrinking the bottom.

**Do NOT adopt: half-pixel sizes.** 33 sizes with 10 half-pixel values is a
hand-tuned system maintained by someone who holds it all in their head. Six
sizes plus two new ones is a system a second person can use correctly.

### 1.4 The Arabic constraint — the one place copying does damage

`letter-spacing` and `text-transform: uppercase` on Arabic are **broken
typography**, not a stylistic choice: Arabic is cursive, and tracking severs the
joins between letterforms. Lumetra's eyebrow — the load-bearing element of its
entire hierarchy — is `+0.12em` uppercase.

**Arabic needs a different eyebrow device carrying the same signal.** Weight and
colour instead of case and tracking:

```css
.eyebrow {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--track-eyebrow);
  text-transform: uppercase;
  color: var(--text-tertiary);
}
html[dir="rtl"] .eyebrow {
  letter-spacing: 0;
  text-transform: none;
  font-weight: 700;
  font-size: var(--text-sm);   /* +1 step to hold presence without tracking */
  color: var(--accent);        /* colour replaces case as the signal */
}
```

Written **once**, globally. This is currently patched per-component [REPO:
blueprint P12], which is how it drifts.

---

## 2. Spacing and layout

### 2.1 What Lumetra does [MEASURED]

```
--side:        214px    sidebar
--content-max: 1500px   content column
--gutter:      28px     page margin
--r-xs 9 · --r-sm 13 · --r-md 15 · --r 19 · --r-lg 23 · --r-xl 28 · --r-pill 999
```

Radii are **not** on a 4px grid — 9/13/15/19/23/28 is roughly ×1.2 growth,
optically tuned so a 13px radius on a small chip and a 19px radius on a large
card *look* like the same curvature.

A second radius set exists under `body[data-glass]` — 12/16/19/26/30/36, about
1.35× larger. That is one of the four selectable themes the blueprint already
ruled out.

**Structure** [OBSERVED]: every screen is the same skeleton — fixed sidebar,
pinned header (eyebrow + title + search + **one** primary action), optional tip,
**summary band**, then the work. Their own changelog names it: *"Every screen is
really two things stacked."*

### 2.2 Why it feels premium

**Consistency beats generosity.** Their gutter is 28px — respectable, not
lavish. What reads as premium is that it is *the same on every screen*, and that
the summary band is *always* in the same place. The eye stops re-learning the
page. Most of the "cheap" feeling in dashboards is layout variance, not tight
spacing.

**One skeleton, two scopes.** The Board (all clients) and the client record use
**the same tiles component**, rescoped [OBSERVED]. Learning one screen teaches
the other, and it halves the component count. That is a maintenance win
disguised as a design win.

**Real empty space at the bottom** of short screens, rather than stretching
content to fill [OBSERVED]. Stretched content is the single clearest tell of a
generic admin panel.

**Optically-tuned radii.** A linear radius ramp makes small elements look
over-rounded and large ones under-rounded. Designakum's 8/12/20/28 [REPO] jumps
1.5×, 1.67×, 1.4× — serviceable, slightly lumpy at `--radius-md`.

### 2.3 What Designakum should do

**Adopt the two-part screen skeleton** as the standard for both portals. This is
the highest-leverage layout change available and requires no new tokens — it is
a `PageHeader` primitive plus a convention.

**Adopt `--measure`.** One column of content, max ~720px, per editor.
[REPO: the current editors already trend this way; make it a token.]

**Adopt: vertical rhythm from `--space-*` only.** The 4px scale
(`--space-1`…`--space-10`) is sound [REPO]. The drift is hand-picked margins
inside `<style jsx>` blocks — the most common inconsistency in the current file.

**Adopt: reveal-on-hover, gated by capability.** Lumetra hides row actions until
hover, but only where hover exists [MEASURED]:

```css
@media (hover: hover) {
  .row .actions { opacity: 0; transition: opacity var(--transition); }
  .row:hover .actions, .row:focus-within .actions { opacity: 1; }
}
@media (hover: none) { .row .actions { opacity: .7; } }
```

Note `:focus-within` — the keyboard path is not an afterthought. **Designakum
has no `(hover: hover)` query anywhere** [REPO]. Doing this wrong is how a touch
user loses access to a control entirely.

**Do NOT adopt the density** (§1.3). Same reasoning; more air, larger targets.

**[PREFERENCE] Consider a client/owner density split.** One token,
`--density`, already exists [REPO: "admin Appearance editor overrides this"].
The owner portal can run tighter than the client portal from the same
components. This is nearly free and it is the honest resolution of "Lumetra is
too dense" — it is too dense *for a client*, and about right *for an operator*.

---

## 3. Colour system

### 3.1 What Lumetra does [MEASURED — both themes read from source]

**Dark (default):**

```
--bg #07090C · --bg-2 #0C1218 · --panel #0F161D · --panel-2 #17212B
--line #1A2733 · --line-2 #2B3E4D
--txt #F1EFE9 · --sub #A9B6C1 · --mute #82919D · --dim #7C8A97
--hi #780000      brand maroon        --hi-2 #DE2130   alarm red
--alert #E84A57 · --alert-c #FFA0A8 · --alert-d rgba(232,74,87,.15)
--warn  #8FC6EC · --warn-c  #8FC6EC · --warn-d  rgba(143,198,236,.15)
--info  #4E9BD8 · --info-c  #51A1E1 · --info-d  rgba(78,155,216,.15)
--safe  #7E8F9B · --safe-c  #7E8F9B · --safe-d  rgba(126,143,155,.12)
```

**Light:** background is **warm cream `#F7F1E6`**, not white. Panels `#FFFFFF`.
Text `#16191D`. Brand `#9E0F1A`, alarm `#C1121F`.

Three findings, all confirmed by the token values themselves:

**1. Brand red and alarm red are two different values.** `--hi #780000` (deep
maroon, the sign-in button [OBSERVED]) vs `--hi-2 #DE2130` (bright). Their
changelog states the reason: *"A colour that is always on cannot mean look
here."* The sign-in screenshot confirms it — the primary action is the *muted*
maroon, saving the bright red for urgency.

**2. Every status colour is a triad: `X` / `X-c` (ink) / `X-d` (dim fill).**
And the ink is **contrast-corrected per theme, in opposite directions**:

| | fill | ink | direction |
|---|---|---|---|
| dark | `--alert #E84A57` | `--alert-c #FFA0A8` | ink is **lighter** |
| light | `--alert #C1121F` | `--alert-c #9E0F1A` | ink is **darker** |

This is the single most technically useful finding in the audit. A colour
saturated enough to fill a 4px bar is *not* readable as 11px text, and the
correction flips sign between themes.

**3. `--warn` is blue.** `#8FC6EC` — not amber. And `--safe` is grey `#7E8F9B`,
not green. They have deliberately **refused to spend a hue** on states that do
not need urgency, leaving red as the only alarming colour in the product. Their
app-wide rule: *blue = work in flight, red = needs a decision, everything else
is ink.* **Two meaningful colours.**

### 3.2 Designakum's current state [REPO: `styles/globals.css`]

```
--accent #9FA7FF (dark) / #4f57d8 (light)
--accent-gradient linear-gradient(180deg, #6d86ff, #4f6ef2)
--success #6ee7a8 · --warning #f5c56b · --danger #ff8080   (+ -bg, -border)
```

**The brand blue `#2C6FE0` appears in no application CSS at all.** Confirmed
again this session. The product does not currently use its own brand colour —
the emails do, the app does not.

And Designakum has **three saturated status hues plus an accent**: green, amber,
red, indigo. Four colours competing, versus Lumetra's two.

### 3.3 Principles Designakum should follow

**Fix the accent — the one urgent change.** Set `--accent: #2C6FE0` in both
themes and rebuild the gradient and glow from it. One token block; it propagates
everywhere through existing tokens. Check the light theme for contrast: `#2C6FE0`
on `#ffffff` is ~4.7:1 — fine for the ≥14px bold button text it will carry, and
the button is a *filled* surface with `--accent-fg: #ffffff` (~4.5:1) so this is
about the fill, not fine print. Do not use it for body text.

**Add the missing ink value per status.** The triads exist as fg/bg/border but
there is no readable text colour for a chip [REPO]:

```
--success-ink · --warning-ink · --danger-ink
```

Defined **per theme, in opposite directions** — lighter than the fill in dark,
darker in light. Purely additive; breaks nothing.

**Two meanings, then stop.** `--accent` = the primary action and work in flight.
Status colours = state, only. Everything else is ink and surface.

**And check the accent is not also doing the "urgent" job** — the exact trap
Lumetra had to fix in v5.2. Designakum's risk is milder (blue does not read as
alarm the way red does), but the discipline holds: **if the accent is on more
than one thing per screen, it has stopped meaning "act here."**

**[PREFERENCE] Reconsider amber.** `--warning #f5c56b` is the weakest of the
three — in practice "warning" states in this product (payment retrying, DNS
pending, invite unclaimed) are *informational*, not urgent. Lumetra's answer —
make the non-urgent state blue or grey, reserve one colour for alarm — would
give Designakum a sharper red. This is a taste call and yours to make.

**Do NOT adopt: the dark-first palette.** Lumetra is near-black by default.
Designakum sells a premium personal-brand product to creatives; **perfect the
light theme first.** Note the light theme's `--on-bg: 12, 21, 48` is already
exactly the brand navy [REPO].

**[PREFERENCE] Steal one thing from their light theme: the warm ground.**
`#F7F1E6` cream instead of pure white, with panels in white. Pure-white
backgrounds with white cards force you to draw a border around everything, which
is the main reason the current dashboard reads as busy. A slightly tinted ground
lets a white card separate itself **by surface alone, with no border at all.**
Designakum's `--bg-secondary: #f3f5fb` is already a cool version of this
instinct — the tokens are there, the *usage* is not.

---

## 4. Motion and animation

**The prior audit recorded nothing here.** This section is entirely new, and it
is where the largest measurable gap sits.

### 4.1 What Lumetra has [MEASURED]

**Eleven named easing curves and eight duration tokens:**

```
--ease         cubic-bezier(.22,1,.36,1)      --t-ui      .28s
--ease-ui      cubic-bezier(.22,.92,.28,1.06) --t-press   .11s
--ease-launch  cubic-bezier(.16,1,.3,1)       --t-pop     .34s
--ease-glide   cubic-bezier(.17,.87,.24,1.04) --t-jelly   .44s
--ease-data    cubic-bezier(.16,1,.3,1)       --tab-dur   .4s
--ease-tab     cubic-bezier(.32,.72,0,1)      --pill-dur  .52s
--spring       cubic-bezier(.34,1.56,.64,1)   --stag-step .07s
--spring-pill  cubic-bezier(.32,1.42,.58,1)   --stag-run  .78s
--ease-jelly   cubic-bezier(.24,1.44,.36,1)
--ease-pop     cubic-bezier(.2,1.12,.34,1)    --stag-blur 14px
--ease-stag    cubic-bezier(.21,.96,.31,1.13)
```

**25 keyframes**, and the names disclose the system: `navGlide`, `navNudge`,
`dealStag`, `pop`, `okFlash`, `ddIn`/`ddInUp`, `blindUp`/`blindDn`,
`comeL`/`comeR`, `capIn`, `rise`, `fade`, `rgIn`, `linCome` — plus a six-part
branded boot sequence (`bootUp`, `bootHush`, `bootWash`, `bootMark`,
`bootRule`, `bootFade`) and three ambient background drifts (`aurDrift1/2/3`).

**Reduced motion is handled properly** [MEASURED] — not just a blanket rule but
targeted downgrades:

```css
@media (prefers-reduced-motion: reduce) {
  .navpill { transition: opacity .2s linear; }   /* downgraded, not killed */
  .boot    { display: none; }                    /* removed entirely */
  .chart-bar, .gauge-arc { transition: none; }
  *, ::before, ::after { animation-duration:.001ms!important;
                         transition-duration:.001ms!important; }
}
```

### 4.2 What creates the premium feeling

**Overshoot, used selectively.** Four curves exceed 1.0 on their third control
point (`--spring` 1.56, `--ease-jelly` 1.44, `--spring-pill` 1.42, `--ease-pop`
1.12) — these overshoot and settle. Physical, not mechanical. Critically, they
are reserved for **things that appear** (pills, pops, dropdowns), never for
things that merely change colour.

**Distinct press timing.** `--t-press: .11s` versus `--t-ui: .28s`. A press
responds in ~110ms — under the ~100–150ms threshold where input feels
*instant* — while entrances take 280ms. Using one duration for both is the most
common reason a UI feels sluggish *and* cheap at the same time: the button feels
laggy, the panel feels abrupt.

**Staggered entrance with blur.** `--stag-step: .07s`, `--stag-run: .78s`,
`--stag-blur: 14px`. Cards arrive 70ms apart, sharpening from 14px blur. This is
the most "expensive-feeling" effect in the product, and it is ~6 lines of CSS.

**`okFlash`.** A dedicated success-confirmation animation. Feedback that an
action *worked* is a premium signal wildly out of proportion to its cost.

**Motion that encodes direction.** `comeL`/`comeR`, `blindUp`/`blindDn`,
`ddIn`/`ddInUp` — paired directional variants, so a panel enters *from where it
came from*. This is what makes navigation feel spatial rather than arbitrary.

### 4.3 What is unnecessary

**The boot sequence.** Six keyframes for a branded intro. For an operator who
opens the portal once a day, it is a moment of theatre. **For a Designakum
client visiting ten minutes a month it would be an obstacle**, and for an owner
checking a failed payment it is pure latency. Their own reduced-motion block
`display:none`s it — they know.

**Ambient aurora drift.** `aurDrift1/2/3` are continuously-running background
animations [OBSERVED on the sign-in gate]. Perpetual motion costs battery and
compositor time on mobile, and it is decoration with no informational job.
Acceptable on a marketing gate; wrong inside a working dashboard.

**Eleven easing curves is more than a system needs.** Several are near-identical
(`--ease-launch` and `--ease-data` are *the same value*, `cubic-bezier(.16,1,.3,1)`).
That is drift, visible in the source.

### 4.4 What Designakum has [REPO]

```
--transition:      0.2s cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
```

**One easing curve** — the Material standard — and two durations. Against
Lumetra's eleven and eight.

And the tokens are **not actually used consistently**. In `pages/admin.js`
alone, hardcoded transition durations appear as `0.25s` (×3), `0.2s` (×2),
`0.4s`, `.3s` — four different values, none of which reference the tokens that
exist.

**Animations are worse.** 20 `@keyframes` blocks across the codebase, with the
same effects redefined independently:

| Effect | Defined as | Where |
|---|---|---|
| fade in | `fadeIn` ×2, `ui-fade`, `cpFade`, `chIn`, `bootFade`-equivalents | `index.js` ×2, `admin.js`, `ConfirmDialog.js`, `CredentialsHandoff.js` |
| spin | `spin`, `ui-spin`, `co-spin`, `vf-spin` | `index.js`, `Button.js`, `subscribe.js`, `signup/verify.js` |
| skeleton sweep | `skelSweep`, `ui-skel-sweep` | `index.js`, `Skeleton.js` |
| slide up | `slideUp` ×2, `cpIn`, `ui-pop` | `index.js` ×2, `admin.js`, `ConfirmDialog.js` |

**This is a confirmed technical issue, not a matter of taste.** Four spinners
that can spin at different speeds is a bug the user perceives as sloppiness.

Reduced motion *is* handled [REPO], with a single blanket rule. Adequate, and
notably less careful than Lumetra's targeted version.

### 4.5 What Designakum should adopt

**A small motion token set** — five curves, four durations, no dependency:

```
  --t-press:  .11s    /* button/press feedback   */
  --t-ui:     .22s    /* hover, colour, opacity  */
  --t-enter:  .30s    /* panels, modals, toasts  */
  --t-stag:   .06s    /* per-item stagger step   */

  --ease:      cubic-bezier(.22, 1, .36, 1);     /* default, decelerating */
  --ease-pop:  cubic-bezier(.2, 1.12, .34, 1);   /* appears — slight overshoot */
  --ease-exit: cubic-bezier(.4, 0, 1, 1);        /* leaves — accelerating */
```

Keep `--transition` / `--transition-slow` as aliases so nothing breaks.

**Consolidate the keyframes into `styles/globals.css`.** One `fade`, one `rise`,
one `pop`, one `spin`, one `sweep` — globally, deleted from the twenty local
definitions. This is a **cleanup, not a redesign**, it is independently
shippable, and it removes real inconsistency.

**Adopt: separate press timing from entrance timing.** Cheapest single
improvement to perceived quality in this list.

**Adopt: `okFlash`.** Designakum's client saves profile edits and gets a toast.
A brief confirmation flash on the saved object itself is more reassuring than a
notification, and it directly serves "money is silent" — a successful payment
should feel *acknowledged*.

**Adopt: staggered entrance, restrained.** For the client's project grid and the
owner's client cards — 60ms step, no blur (blur is expensive on mobile GPUs and
the effect survives without it). One rule, high impact.

**Adopt: directional motion for the operator banner.** Entering and leaving
another dashboard should move in opposite directions. It makes impersonation
*feel* like entering and leaving somewhere.

**Do NOT adopt: boot sequences or ambient drift.** For a portfolio SaaS these
cost trust, not build it. If any brand moment is wanted, it belongs on the
public site — which is the customer's brand and out of scope [blueprint §6.1].

**Upgrade reduced-motion to targeted downgrades.** Blanket 0.01ms currently
kills the toast's slide *and* the skeleton sweep — but a skeleton that does not
shimmer reads as *broken*, not as calm. Reduced motion means less movement, not
no feedback.

**RTL note.** Directional motion must respect `dir`. A panel entering from the
right in Arabic should enter from the *left*. Use logical directions or flip
under `html[dir="rtl"]` — otherwise every entrance animation fights the reading
direction.

---

## 5. Component language

### 5.1 The repeated patterns [OBSERVED + MEASURED]

| Pattern | How Lumetra builds it |
|---|---|
| **Card / panel** | One treatment, differentiated by **surface**, not border weight. Dark panels for work; **one lighter panel** for the thing worth reading first |
| **Summary tile** | Icon in a tinted round chip · tiny uppercase eyebrow · **very large number** · noun phrase · qualifying footer. **The whole tile is a button** |
| **Badge / chip** | Icon + phrase, often **combining state and quantity**: `Overdue 1d`, `$1,250 outstanding` |
| **Table** | Numeric cells in mono (`.t-num`); group headers; dense |
| **Timeline / rail** | Progress as labelled dots filled to current stage |
| **Row** | Actions revealed on hover, `:focus-within` honoured, always visible on touch |
| **Side panel / sheet** | `540px`, `--r` radius, `max-height: calc(92vh / var(--zoom))` |
| **Icons** | One stroke weight, monochrome, **always paired with a word**. No emoji |
| **Empty state** | Worded, never blank |

### 5.2 The component philosophy Designakum should hold

**One panel treatment. Differentiate by surface, never by adding chrome.**
Blueprint §9.4 states the corollary and it is worth repeating as law: *a card
with a border AND a shadow AND a background on a background is three separations
doing one job.* Pick one. This is the largest single contributor to the current
dashboard reading as busy.

**Exactly one panel per screen is emphasised.** Lumetra's v4.6 note: *"Six
identical panels read as six of the same thing, with nowhere to look."* This
solves "everything has similar weight" more directly than any typographic
change, and it costs one class.

> **Corrected by Appendix A.2.** I previously wrote — following the prior
> audit — that the odd panel out is distinguished by sitting on a *lighter
> surface*. Measured on screen, that is wrong. **The whole summary band is
> light; all four tiles are `#FFFFFF`.** The odd one out is marked by a red
> **border** and a red **number** only. The principle holds; the mechanism is
> cheaper and better than described.

**Components are scope-agnostic.** The same `StatTile` serves the owner's
console (all clients) and one client's record (rescoped). Build each component
once and pass it a scope. Half the components, twice the consistency.

**Every component states absence in words.** "No projects yet", "No custom
domain", "Not published yet" — never a blank, never `—`, never `null`.

**Chips carry state *and* quantity.** `Payment failed · 4 days left`,
`120 SAR · renews 4 Mar`. A chip that needs a legend has failed.

**Icons never travel alone, and never as emoji.** `pages/admin.js` currently
contains **31 emoji** [REPO], including 🔴 🟡 🟢 used *as status indicators*.
That is the worst case: an emoji cannot inherit `currentColor`, cannot respond
to the theme, cannot be recoloured for the light palette, and renders as a
different glyph on every platform. Also present: 👋 ×4, 🎉 ×4, 🎨, 🌐, 📷, 📁,
👤, 🔍, ★ ×3, ✓ ×9, ⚠.

Replace all functional ones via `components/ui/Icon.js` [REPO: already exists
and is used by the nav]. **Emoji survive only in genuinely expressive copy** —
the 🎉 on completion is fine; the 🎨 as an icon is not; the 🔴 as a status dot
is a defect.

**The existing primitives are the right set.** Button, Card, Badge, Input, Icon,
Toast, ConfirmDialog, EmptyState, Skeleton, BrandGlyph [REPO] — extend, do not
replace. The additions the blueprint names (`PageHeader`, `StatTile`,
`StatusLine`, `DataRow`, `RecordHeader`, `Checklist`, `Thumbstrip`, `Callout`,
`OperatorBanner`) are all plain React + `<style jsx>`. **No new dependency is
required by anything in this document.**

---

## 6. Empty states and onboarding moments

### 6.1 What Lumetra does [OBSERVED]

Empty is **always worded, and the wording says what would fill it**:
"Nothing here. Drag a card in to move it to Editing." · "nobody assigned yet" ·
"no sign-in" · "No footage link yet" · "Nobody yet". Empty lanes **keep their
headers and their explanatory subtitles** — the structure stays visible so you
learn the system from its empty state.

A dashed **ghost "Add a client" card** ends the client grid — the empty slot
*is* the call to action.

**The next action lives on the object**, with a verb that changes by state: a
Waiting card says `Pick this up →`; a Picked-up card says `Start editing →`. The
card teaches the process.

And the Attention screen states how to feel about emptiness outright:
**"An empty screen is the goal."**

### 6.2 Why this matters more for Designakum than for Lumetra

Lumetra's empty states are an edge case — a working agency portal is full.

**For Designakum, empty is the first thing every single customer sees.** A
brand-new portfolio has no projects, no analytics, no billing history, and quite
possibly no entitlement yet. The empty state *is* the onboarding experience, and
it is currently the least-designed part of the product.

This inverts the priority: Lumetra can treat empty states as polish. Designakum
cannot.

### 6.3 How Designakum should handle each

**A new client, first sign-in.** Not a blank editor. A **setup rail** — ordered,
with state, each step naming its reward:

```
  1  Add your name and photo          → "so people know whose page this is"
  2  Add your first project           → "your page needs one thing to show"
  3  Choose your look                 → "colours and fonts"
  4  Publish                          → "your page goes live at your address"
```

Progress persists; the rail collapses to a quiet strip once complete. This
replaces the flat checklist in blueprint §7.4.

**An empty portfolio / no projects.** Keep the grid structure visible with a
ghost "Add your first project" card. **Show what it will look like** — the
`PreviewPane` [REPO] already exists and is the strongest asset the product has
for this. *A portfolio product whose empty state shows the customer nothing is
failing at its own pitch.*

**No analytics yet.** "No visits yet — your page went live 2 days ago. Numbers
appear here once people arrive." Names the reason and the exit condition. Never
an empty chart, never a zero without a cause.

**No billing history.** For a comped client this must **not** read as an error.
"You're on a complimentary plan — nothing to pay. Invoices appear here if that
changes." Seven of the current workspaces are comps [REPO: context §1]; a
billing screen that treats comp as "missing data" insults the most valued
customers on the platform.

**Not yet entitled.** The blueprint's §6.3 problem — today a client just meets a
refused save. State it *before* the attempt, as a `Callout` with the exit
condition: "Your page is saved but not published yet. Choose a plan to put it
live." Entitlement gates **writes, not reads** [REPO], so the client can explore
freely — the UI should make that feel like a preview, not a malfunction.

**The rule, general:** every empty state names **what it means**, **what fills
it**, and **who fills it**. And where emptiness is *good* — no failed payments,
no clients needing attention — say so: "Nothing needs you today."

**Cost: frontend only.** `EmptyState` exists [REPO] and the codebase's instinct
here is already sound; it needs extending and applying consistently, plus
bilingual copy for every string [REPO: `lib/translations.js`].

---

## 7. Dashboard psychology

### 7.1 What Lumetra makes a user feel

**In control, and specifically: unsurprised.**

The mechanism is that **every screen answers one question, and the screen says
which question it is answering.** The eyebrow does this literally —
`NEEDS A DECISION / Attention`, `EVERYTHING THAT HAPPENED / Activity`,
`THE COMPANY / Finance` [OBSERVED]. Before reading any data you know what the
data is *for*.

Then the four Board tiles resolve the whole situation in four numbers, each
phrased as a sentence with a subject: *1 job is stuck · 9 jobs land this week ·
$15 left over · 1 editor working* [OBSERVED]. Five seconds, complete read.

Three psychological devices worth naming:

**Qualified numbers prevent false confidence.** "$15 left over" would be good
news; its footer "1 of 2 payments in" is why it is not. The big number hooks,
the small line tells the truth. A dashboard that shows only headline figures
manufactures confidence it has not earned.

**Every stuck thing names what clears it.** *"OVERDUE — the due date has passed
and it is not finished. What clears it: move it on, or push the date out so the
board stops lying."* This is the difference between a notification and a task.
Notifications create anxiety; tasks create agency.

**The product tells you how to feel about a screen.** "An empty screen is the
goal." Almost no product does this, and it converts an empty list from *"is it
broken?"* into *"good."*

The net emotion is **calm, not excitement.** Premium here reads as *nothing is
hiding from me.*

### 7.2 What Designakum currently makes a user feel

Judged against the same criteria, with the founder's own words alongside:

| Criterion | Designakum today |
|---|---|
| Does each screen answer one question? | **No.** One route, one 6,550-line file, both roles [REPO: context §3]. The founder: *"confusing admin/client separation"* |
| Does the screen say what it is for? | **No eyebrows, no page-level framing.** *"feels generic — like a settings panel"* |
| Do numbers arrive as sentences? | **No.** Labels and values |
| Does anything lead the eye? | **No.** 1.86× lead-to-body ratio, no display size, uniform weight. *"everything has similar weight, so nothing leads"* |
| Does a stuck state name its exit? | **No.** An unentitled client meets a **refused save with no explanation** [REPO: context §4] |
| Is the user told what needs them? | **No.** The owner must *know* which failures exist and go looking |
| Is money acknowledged? | **No.** No receipt, no renewal notice, no failure warning [REPO: context §4] |

**The emotion produced today is mild uncertainty.** Not overwhelm — the product
is not that dense — but the absence of confirmation. The user is never *told*
they are fine. A client pays and hears nothing. A client saves and it silently
fails. An owner opens the dashboard and cannot tell whether anything is wrong.

**This is the single most important finding in this document:**

> Lumetra does not feel premium primarily because of how it looks. It feels
> premium because **it never leaves you wondering.** Roughly half of Designakum's
> premium gap is not visual at all — it is the missing billing emails, the
> unexplained entitlement refusal, and the absent attention queue. **No amount
> of typography fixes a product that goes quiet when you give it money.**

The visual work in §§1–5 is real and worth doing. It should not be mistaken for
the whole job.

### 7.3 The target emotion, per role

**Client — reassured.** *"My page is live, it looks good, someone visited it,
and I'm paid up."* Status first, editor one deliberate step behind. A client
should be able to open the dashboard, learn everything is fine, and close it.

**Owner — oriented.** *"Here is what needs me today; nothing else does."* The
absence of alarm must be as legible as alarm. An empty attention queue is the
owner's best possible screen and should feel like one.

---

## 8. Responsive and mobile behaviour

### 8.1 What Lumetra does [MEASURED — 15 breakpoints]

**The sidebar has three states**, which is the headline finding:

| Viewport | Behaviour |
|---|---|
| > 1400px | Full sidebar, `--side: 214px`, labels visible |
| ≤ 1400px | **Icon rail**, `--side: 66px` — brand text hidden, nav centred, labels gone |
| ≤ 720px | **Bottom bar** — `position: fixed; inset: auto 0 0`, horizontal row, `.app` becomes `flex-direction: column`, brand and group labels removed |

Note ≤1400px is a *laptop*, not a tablet. They collapse to icons early, buying
content width on the most common real screen.

**Content reflow by component** [MEASURED]:

- `.stats` 4 columns → **2** at ≤1180px (never 1 — two numbers side by side stay comparable)
- `.kb` kanban → columns stack vertically at ≤1180px, cards become
  `repeat(auto-fill, minmax(250px, 1fr))` — **the lane becomes a grid**, which
  keeps density instead of producing an endless single column
- `.wrow` two-column work row → single column at ≤1080px
- `.fin-hero` → single column at ≤900px
- `--gutter` 28px → **14px** at ≤720px
- `.navpill` (the floating nav pill) → `display: none` at ≤720px

**Scaling up, not just down.** Unusual and worth reporting:

| Viewport | `--content-max` | `--zoom` |
|---|---|---|
| default | 1500px | 1 |
| ≥1800px | 1680px | **1.06** |
| ≥2200px | 1860px | **1.13** (gutter → 38px) |
| ≥2700px | 2100px | **1.22** |

Applied as `body { zoom: 1.13 }`, with every viewport unit compensated —
`min-height: calc(100vh / var(--zoom))` on `.app`, `.side`, `.gate`, `.sheet`.
Rather than a separate large-screen type scale, they scale the entire interface.

**Honest caveat:** `zoom` is a non-standard property (widely supported now, but
it interacts badly with fixed positioning and viewport units — hence the
`calc(… / var(--zoom))` on every single one). It works, and it is a maintenance
tax paid on every new full-height element. I would not recommend it.

**Touch is handled** via `(hover: hover)` / `(hover: none)` (§2.3) — the only
capability queries in the sheet.

### 8.2 What Designakum should adopt

**Adopt the three-state sidebar** — full → icon rail → bottom bar. It is the
right model, and the bottom bar in particular matters: **Designakum's clients
are Arabic-speaking creative freelancers, who skew heavily mobile.** A client's
three or four destinations fit a bottom bar naturally.

**Adopt: collapse to the icon rail early**, around 1200–1400px.

**Adopt: 4 → 2, never 4 → 1** for summary tiles. Two numbers side by side remain
comparable; stacked, they become a list and lose the at-a-glance read that is
the entire point.

**Adopt: reduce the gutter on mobile** (`--gutter` equivalent, 28 → 14px) rather
than shrinking content.

**Adopt: `(hover: none)` fallbacks** wherever hover reveals an action. Designakum
has none today [REPO]. On a mobile-heavy audience this is close to a correctness
bug, not a polish item.

**Do NOT adopt: `body { zoom }` for large screens.** The `calc(100vh / var(--zoom))`
tax lands on every full-height element forever. If large-screen scaling is
wanted later, a `clamp()` on the root font size achieves most of it without
breaking viewport units.

**Two additions Lumetra cannot teach us, because it is English-only and LTR:**

1. **Every breakpoint must be checked in Arabic.** A bottom bar, an icon rail
   and a collapsing grid all have RTL implications — the collapse *order* of a
   two-column row reverses. Logical properties (`margin-inline-start`) make this
   mostly automatic; `grid-column` and explicit `left`/`right` do not.
2. **Touch targets.** Lumetra's density is tuned for a mouse. Designakum's
   client portal needs ≥44px targets throughout, which interacts directly with
   the density decision in §2.3.

---

## 9. Designakum Premium UX Principles

The foundation for implementation. Ten principles, then the four buckets
requested.

### The principles

1. **Every screen answers one question, and names it.** Eyebrow + title on every
   screen, in both portals. A screen serving two questions is two screens.
2. **One thing leads.** One `--text-4xl` element, one coloured action, one
   lighter panel — per screen. Everything else is type and space.
3. **Numbers are sentences.** A figure arrives with a noun phrase and a
   qualifying footer. `1 payment failed` — not `Failed: 1`.
4. **Summaries are navigation.** Reading and acting are one gesture. Every
   summary tile is a button.
5. **The client's model is a true projection of ours** — simpler, never
   different. Map platform state to customer language in one pure, tested
   module, the shape of `lib/billing-status.js` [REPO]. It **reads**
   entitlement; it never restates the rule.
6. **Every state names its exit.** Stuck things say what clears them, empty
   screens say what they mean, absent values are worded, never blank. Where
   emptiness is good, say so.
7. **Two meanings in colour, then stop.** Accent = act here. Status = state.
   Everything else is ink and surface.
8. **Separate by surface, not by chrome.** Never a border *and* a shadow *and* a
   contrasting fill.
9. **Motion confirms, never performs.** Press is fast (~110ms), entrances are
   soft (~300ms), success is acknowledged. No boot sequences, no ambient drift.
10. **Arabic is a layout mode and a first-class review gate.** No tracking or
    uppercase on Arabic, Latin numerals in both locales, logical properties
    throughout — **and every screen reviewed in Arabic before it is called
    done**, not after.

### A) Principles to adopt

| # | Principle | Source |
|---|---|---|
| A1 | Eyebrow + title + one primary action, every screen | §2.1 |
| A2 | Summary band over work area — the standard skeleton | §2.1 |
| A3 | Widen the lead-to-body ratio to ~3× (`--text-3xl`, `--text-4xl`) | §1.3 |
| A4 | Tracking as a function of size; Arabic gets weight + colour instead | §1.3–1.4 |
| A5 | Tabular figures via Manrope `tnum` — **not** a new mono webfont | §1.3 |
| A6 | Set `--accent` to brand `#2C6FE0`; one accent, primary action only | §3.3 |
| A7 | Add `-ink` per status colour, contrast-corrected per theme | §3.3 |
| A8 | Motion token set; consolidate 20 keyframes into ~5 global ones | §4.5 |
| A9 | Separate press timing from entrance timing | §4.5 |
| A10 | One panel treatment; exactly one lighter panel per screen | §5.2 |
| A11 | Same components at two scopes (all clients / one client) | §2.2 |
| A12 | Worded absence everywhere; empty states name what fills them | §6.3 |
| A13 | Remove all 31 functional emoji; extend `Icon` | §5.2 |
| A14 | Three-state sidebar: full → icon rail → bottom bar | §8.2 |
| A15 | `(hover: hover)` / `(hover: none)` gating on every hover-reveal | §2.3, §8.2 |
| A16 | 4 → 2 tile collapse, never 4 → 1 | §8.2 |
| A17 | Write the one-sentence reason for each design rule when decided | §0 |

### B) Things that do NOT fit Designakum

| # | Rejected | Why |
|---|---|---|
| B1 | The density (12.5px median, 700 weight everywhere) | Operator-all-day vs client-10-min-a-month. Widen the ratio from the top, never shrink the body |
| B2 | 33 font sizes with half-pixel values | Unmaintainable by a second person |
| B3 | Dark-first palette | Designakum sells a premium personal brand to creatives — perfect the **light** theme first |
| B4 | Four selectable themes (`body[data-glass]` etc.) | Maintenance liability across a bilingual product that already has light + dark |
| B5 | Boot sequence (6 keyframes) and ambient aurora drift | Latency and battery cost with no informational job. Brand moments belong on the public site |
| B6 | Eleven easing curves (two of them identical) | That is drift, not a system. Five is enough |
| B7 | `body { zoom }` large-screen scaling | Forces `calc(100vh / var(--zoom))` on every full-height element, forever |
| B8 | "Test look" / demo-data mode | For Designakum an empty workspace is a **real and common state** — effort belongs in first-run and empty states |
| B9 | Uppercase + letter-spaced eyebrows applied to Arabic | Breaks cursive joins. The one place copying Lumetra visually does real damage |
| B10 | Their visual language — maroon, lettermark, Archivo | That is Lumetra's brand. Ours is `#2C6FE0`, `#0C1530`, the diamond motif |
| B11 | Becoming a CRM | The owner portal manages the platform, not customer relationships [blueprint §5.5] |

### C) Things requiring backend changes

Everything in §§1–5 and §8 is frontend. These are the exceptions, and none of
them is a prerequisite for the visual work.

| # | Item | Backend impact | Risk |
|---|---|---|---|
| C1 | **Billing emails** — receipt, renewal, failure, cancellation | New Edge Function work; the webhook **already recognises every trigger** [REPO: context §4] | Low, additive. **Highest user-value item in this document** (§7.2) |
| C2 | **Activity feed** | No event log exists. `billing_events` is the model; a general `activity_events` table + writes at each action is a **real project** — its own phase | Medium |
| C3 | **Engagement brief** (per-client commercial notes) | Additive column or small table; existing `is_tenant_admin()` pattern. **Owner-visible only** — contains terms the client must never read | Low, but RLS must be written deliberately |
| C4 | **Client-chosen password at invite** | New token flow in `invite-client`; today it generates and relays [REPO: context §7] | Medium — touches auth |
| C5 | **Removing slug/username from onboarding** | Slug is a real constraint (reserved list, uniqueness, becomes `/{slug}`); username drives sign-in resolution. **Neither can simply be dropped** — this is a vocabulary fix, not a field removal | Medium |
| C6 | **Per-tab URLs** | New routes; tab state is currently internal [REPO: context §3] | Low, but it is the Phase 1 gate for everything else |

**Not backend, and must never be described as such:** the read-only operator
default (§4 of the blueprint) is a **UI default**, not a security boundary. RLS
is the boundary. Hiding a control is not.

**Never touched by any of this:** the entitlement predicate
(`environment IS DISTINCT FROM 'sandbox'` — GRANDMASTER 4b), the tenant
resolver, RLS policies, sandbox/live separation, comp support.

### D) Things that are purely visual

Shippable independently, revertible independently, **zero backend risk** —
this is where implementation should start.

| # | Change | Effort | Blast radius |
|---|---|---|---|
| D1 | `--accent: #2C6FE0` + rebuild gradient/glow | **One token block** | Propagates everywhere through existing tokens |
| D2 | Add `--text-3xl` / `--text-4xl` | Additive | Nothing breaks |
| D3 | Add tracking tokens + one global `.eyebrow` (with the RTL override) | Small | Replaces per-component patches |
| D4 | Add `-ink` status values per theme | Additive | Nothing breaks |
| D5 | Add `--numeric` + `tnum`, apply to money/dates/counts | Small | Zero network cost |
| D6 | Motion tokens; consolidate keyframes; replace 4 hardcoded durations in `admin.js` | Medium | **Cleanup — removes existing inconsistency** |
| D7 | Targeted `prefers-reduced-motion` (keep the skeleton shimmer) | Small | Accessibility improvement |
| D8 | Remove 31 emoji; extend `Icon` | Medium, mechanical | Visible quality jump |
| D9 | Add `--measure`; enforce space-scale rhythm | Medium | Removes drift |
| D10 | `(hover: hover)` / `(hover: none)` gating | Small | Fixes a latent touch issue |
| D11 | `PageHeader`, `StatTile`, `StatusLine`, `Callout`, `EmptyState` extensions | Medium | Plain React + `<style jsx>` |

**No item in this document requires a new dependency.** Verified against the
five-runtime-dependency rule [GRANDMASTER §4.2]: everything here is CSS custom
properties, `<style jsx>`, and plain React — including the tabular figures
(§1.3), which is specifically why the Manrope `tnum` route is preferred over
JetBrains Mono.

### The suggested first move

**D1 + D2 + D3 in one change.** Accent, type ceiling, eyebrow. It is one token
block plus one class, it is trivially revertible, and it is the smallest change
that will visibly answer *"the product doesn't feel premium."* It also forces
the Arabic eyebrow decision (§1.4) early, where it is cheap, rather than after
thirty components have been built on a Latin-only assumption.

---

## Open questions for the owner

Each changes the work materially, and none can be answered from the repository.

1. **Amber.** Keep `--warning` as a third saturated hue, or follow Lumetra and
   make non-urgent states blue/grey so red is the only alarm? (§3.3)
2. **Warm ground.** A slightly tinted light background (cream or the existing
   cool `#f3f5fb`) so white cards separate without borders — or stay pure white?
   (§3.3)
3. **Density split.** One density, or a tighter owner portal and a roomier client
   portal from the same components via `--density`? (§2.3)
4. **Client body size.** Hold 14px, or float the client portal to 15–16px given
   the ten-minutes-a-month usage pattern? (§1.3)
5. **Rendered responsive check.** The authenticated screens were observed
   (Appendix A). What remains unverified is **responsive behaviour as
   rendered** — the browser window would not resize (§0). If how the collapse
   *feels* matters, that needs a real narrow viewport.

---

# Appendix A — Authenticated application audit

**Observed 2026-08-14, signed in as Feras · Owner**, via the owner's own Chrome
session. Screens reached: Board (summary + Lanes), Attention, Clients, the Ali
Habib client record, the account menu, and — through it — a **client dashboard**
and its Updates screen. Read-only: nothing created, moved, assigned, edited or
deleted; impersonation exited via **Leave**.

Where a claim in §§1–8 changed, it is marked **CORRECTION**.

---

## A.1 Typography, measured on the rendered app

| Element | Measured |
|---|---|
| Page eyebrow (`ALL CLIENTS`) | **10.5px / 700 / tracking 2.1px (0.2em) / uppercase** |
| Page title (`Board`) | **Archivo Black, 25px, −0.25px** |
| Tile number (`1`, `$15`) | **Archivo Black, 38px, −0.95px (−0.025em)** |
| Tile eyebrow (`NEEDS YOU`) | 10.5px / 700 / 1.365px (0.13em) / uppercase |
| Tile noun phrase (`job is stuck`) | 12px / 600 |
| Tile footer | 11.5px / **400** |
| Sidebar nav item | 14px / **600 inactive → 700 active** |
| Sidebar group label | 10px / 700 / 1.4px (0.14em) / uppercase |
| Nav badge (`21`, `6`) | **JetBrains Mono 11px** |
| Card title | 13.5px / 700 |
| Card client label | 9.5px / 700 / 0.38px / uppercase |
| Card action (`Pick up →`) | 11px / 700 |

**[MEASURED] The eyebrow is brand-tinted, not grey.** Its colour resolves to
`--hi-lab` = `color-mix(in srgb, var(--hi) 46%, var(--txt))` — a muted rose
derived from the brand maroon. **This is a better idea than a grey eyebrow** and
costs one `color-mix()`: every screen carries a whisper of brand without
spending a saturated colour.

> **For Designakum:** `color-mix(in srgb, #2C6FE0 40%, var(--text-primary))`.
> No dependency, supported everywhere the app targets. **This also solves the
> Arabic eyebrow problem in §1.4** — colour substitutes for tracking, and here
> is a colour that is already the system's own.

**[OBSERVED] Two display faces.** Titles and tile numbers are **Archivo Black**,
a heavier family than the UI's Archivo. Designakum's `--font-heading` already
permits this split but the app does not exploit it. **[PREFERENCE]** A distinct
display weight for `--text-3xl`/`--text-4xl` makes titles feel deliberate rather
than merely large.

**[MEASURED] Confirms §1.2 on the live DOM:** lead 38px against an 11.5–13.5px
working band ≈ **2.8–3.3×**.

---

## A.2 The summary band — **CORRECTION**

**[MEASURED] All four Board tiles are `rgb(255,255,255)`**, text `#16191D`,
muted `#525B63` — light-theme values, on an app whose `body[data-mode="dark"]`
and whose sidebar is `#0C1218`.

The v5.0 note *"summary on white, work on dark"* is literal: **the summary band
is a light island inside a dark application.** It is *not* a theme scope —
`.papers` does not redefine the theme properties (they still resolve dark); the
light values sit on the tile component itself.

**The odd one out (`.pc.link.is-hot`) differs in exactly two ways:**

| | siblings | `is-hot` |
|---|---|---|
| border | `rgba(11,18,25,.13)` | **`#D26D6B`** (red-tinted) |
| number colour | `#16191D` | **`#C1121F`** (`--alert`, light) |

Background, padding `15px 17px 14px`, radius 19px, shadow
`0 12px 30px rgba(0,0,0,.38)` and 287px width are identical.

**Why this is better than what I first described.** Distinguishing by *surface*
means maintaining a second panel treatment. Distinguishing by **border + one
text colour** makes emphasis a modifier class on one component — same effect, a
fraction of the system.

**[MEASURED]** Every tile is `role="button"`, `tabindex="0"`, `cursor:pointer`.
"Summaries are navigation" is real, and keyboard-reachable. Grid: 4 × 287.25px,
`gap:14px`.

---

## A.3 Motion — the mechanism, observed and measured

**[OBSERVED] I accidentally captured the entrance animation.** My first
screenshot, taken immediately after load, shows the tiles **still dark and the
chart bars at zero height**; a capture seconds later shows white tiles and grown
bars. The summary band genuinely animates from the dark resting state into the
light one, and bars grow from zero. This is the `dealStag` / `--ease-data`
system in §4, and it is the largest contributor to the "expensive" first
impression.

**[MEASURED] The sliding active indicator — the best single idea in the product.**

```css
.navpill { position:absolute; background:var(--hi); border:1px solid var(--hi-2);
           border-radius:var(--r-sm);
           transition: width .26s var(--ease-ui), height .26s var(--ease-ui),
                       left .26s var(--ease-ui), top .26s var(--ease-ui); }
.navpill.glide { animation: navGlide var(--nav-dur,.52s) both; }

.nav.on { background:var(--hi); border-color:var(--hi-2); color:var(--hi-txt); }
.side:has(> .navpill.ready) .nav.on {
  background:transparent; border-color:transparent;
  transition: color .18s var(--ease-ui) var(--ink-delay, 0s);
}
```

Three things worth stealing outright:

1. **One pill, moved** — not a background per item. The active state *travels*.
2. **`:has()` as progressive enhancement.** Without the pill, or without `:has()`
   support, `.nav.on` keeps its own maroon background — **the static version is
   the fallback.** Nothing breaks if the enhancement doesn't apply.
3. **`--ink-delay`** — the label's colour change is *delayed* so the text flips
   as the pill arrives under it, not before. The kind of detail that reads as
   quality without anyone being able to name it.

Also: `.nav.on .n-badge` drops its filled chip for an inset ring, so the badge
does not fight the pill it now sits on.

**[MEASURED] Hover and press, exactly:**

```css
.nav:hover    { background:var(--panel); color:var(--txt); transform:translateX(2px); }
.nav.on:hover { transform:none; }                    /* active does not nudge */
.btn:hover    { background:var(--panel-2); transform:translateY(-1px); }
.btn:active   { transform:translateY(0) scale(.97); }
```

**And the press rule, which is the one to copy verbatim:**

```css
.btn:active, .nav:active, .seg:active, .back:active, .acct-btn:active,
.mi:active, .cpy:active, .stat.link:active, .pc.link:active, .card:active,
.tab:active, .dd:active   /* ~20 selectors */
  { transition-duration: var(--t-press); }
```

**One rule swaps every interactive element to 110ms on press** while hover keeps
280ms. This is §4.5's "separate press timing from entrance timing" as a single
shared declaration rather than per-component — which is how Designakum should do
it, since it then covers every future component for free.

**[OBSERVED] Restraint worth noting:** the active nav item explicitly does *not*
nudge on hover. Motion is withheld from the thing you are already on.

---

## A.4 Owner surfaces

### Attention [OBSERVED]

Eyebrow `NEEDS A DECISION`. Tip: *"Everything here is waiting on a person, not a
process. Each group says why it is stuck and what clears it. **An empty screen
is the goal.**"*

Four reason-tiles: `OVERDUE 1` · `CHANGES CAME BACK 0` · `NOBODY PICKED IT UP 0`
· `STOPPED MOVING 0`.

- **Zero tiles read "nothing here"** in the footer slot, and their **numbers stay
  ink, not red** — zero is never alarming.
- **The icon chip is tinted by whether the count is non-zero** (red on OVERDUE,
  grey on the three zeros). Colour reports state, not category.
- **The non-zero tile's footer *is* the exit condition**: "Move it on, or push
  the date out so the board stops lying."

Below, **only the non-zero group renders as a block** — red left edge, group
name, its **definition** ("The due date has passed and it is not finished."), a
count badge, then a separate row: `→ What clears it: …`. Zero groups exist only
as tiles. **The screen shows only what needs action.**

The item row carries avatar · title · `Ali Habib · updated 18h ago` · a **stage
rail of 7 dots** reading "**Waiting to start** stage 1 of 7" · then every action
that could clear it: `Overdue 1d` (red chip), `Waiting to start ▾` (*a chip that
is a dropdown*), `Assign`, `Pick this up →`, `Details`, and **`No source link
yet`** rendered as a chip rather than omitted.

### Clients [OBSERVED]

Eyebrow `OVERVIEW`. **The primary action is per-screen, not global** — `+ New
video` on the Board becomes **`+ Add client`** here, and reverts on the client
record. One action slot, contextually bound.

3-column card grid: real client logo/photo · name · one-line descriptor · three
icon facts (`⚡ 12 being worked on`, `✓ 0 finished`, `👥 avatars` or **"nobody
assigned yet"**) · a red **`⚠ 1`** corner badge where attention is needed ·
full-width `Open →` plus pencil and a **red-outlined trash**. The grid ends with
a dashed ghost **"+ Add a client"** card.

> **[OBSERVED] Honest counter-example.** Kenny Construction's descriptor renders
> as a literal **`-`**. The worded-absence rule is a good rule that even its
> author does not enforce everywhere. Designakum should enforce it **at the
> component level** — an empty-value primitive that cannot render a dash —
> rather than relying on discipline at every call site.

### Client record [OBSERVED]

`CLIENT / Ali Habib`, with `← All clients` as a pill **above** the record header.
Then, in one scroll, **no tabs**:

1. **Record header** — photo, name, "Nature instagram content · client since 3d
   ago", assigned editor avatar, `+ New video`, `Edit`, red trash.
2. **Four tiles on a light band** — VIDEOS 12 · BEING WORKED ON 12 · FINISHED 0 ·
   **NEEDS ATTENTION 1** (red number, red chip, pink wash). **The same `.pc`
   component as the Board**, rescoped — and **without footers**, because at
   single-client scope there is nothing to qualify.
3. **Master document** — an external doc as a first-class row: `Open`, `Copy the
   document link`, edit.
4. **The engagement brief** — a violet-bordered panel, four columns with icon
   chip headers: `PAYMENT` · `WHAT IT COSTS US` · `THEIR GOALS` · `LUMETRA DOES`.
   Payment is structured (`$1,250` in mono, "a month", "due on the 14th",
   "3 months", chip `$1,250 outstanding`); **the other three are free prose**,
   complete with the author's own typos. It reads as a brief, not a form.
5. **A pinned objective** on its own strip: *"we want ali nature doing 7-10k
   views average per post"*.
6. **The same Work-by-stage / On-time / Who-has-what cards and the same
   Lanes/Track/Table pipeline**, retitled `Videos 12` instead of `Pipeline 21`.

**Confirms the blueprint's "drop the tabs" call.** One scrolling page works
because each block is visually distinct enough to act as a landmark.

### Lanes and cards [OBSERVED + MEASURED]

Three lanes — `TO DO 21` / `IN PROGRESS 0` / `DONE 0` — each with an icon chip, a
count, and **a subtitle defining what belongs there**: "In the hub, or picked up
but not started" · "Being cut, waiting on review, or changes came back" ·
"Signed off or already live". The seven stages are grouped into three lanes for
scanning, while the stage rail keeps all seven.

**Empty lanes keep their header and subtitle** and render a dashed box —
[MEASURED] `1.5px dashed`, radius 13px, 11.5px text, `padding:22px 10px`:

```html
Nothing here.<br>Drag a card in to move it to <b>Editing</b>.
```

**The destination is bolded** — the empty state names the action *and* where it
leads.

**[OBSERVED] The card's verb changes with its state** — a Waiting card offers
`Pick up →`, a Picked-up card offers **`Start →`**. Also: a coloured **left edge
per client**, and an unassigned slot rendered as a **`?` avatar** rather than
left blank.

---

## A.5 The client dashboard — the most useful screen for Designakum

**[OBSERVED] Opening a client dashboard replaces the product:**

| | Owner | Client |
|---|---|---|
| Brand block | `LUMETRA / OWNER` | **`LUMETRA / CLIENT`** |
| Sidebar | Board · Clients · Team · Finance · Attention · Activity | **My videos · Send footage · Updates** |
| Primary action | `+ New video` | **`Send footage`** |
| Header eyebrow | `ALL CLIENTS` | **the client's own descriptor** |
| Summary tiles | **4** | **3** |

**[OBSERVED] What the client's tiles drop matters as much as what they keep.**
`THE MONEY` and `WHO IS CARRYING IT` are **gone** — the client sees neither the
agency's margin nor its staffing. What remains is rephrased into outcomes:

| Owner | Client |
|---|---|
| NEEDS YOU · *1 job is stuck* | IN PRODUCTION · *12 videos with us* |
| NEXT SEVEN DAYS · *9 jobs land* | NEXT SEVEN DAYS · *5 jobs land* |
| THE MONEY · *$15 left over* | — |
| WHO IS CARRYING IT · *1 editor working* | DELIVERED · *0 videos approved* |

**[OBSERVED] The footers turn reassuring rather than operational.** The owner's
qualifier is triage — "1 already overdue · oldest first on the triage screen".
The client's is **"All moving normally."** Same data, opposite emotional job.

**[OBSERVED] The 7→5 projection, confirmed on screen.** The client's rail shows
exactly five labelled dots — **Received → Editing → In review → Approved →
Posted**. The job the owner sees as "Waiting to start · stage 1 of 7" the client
sees as **"Received"**, first dot filled. *Waiting to start*, *Picked up* and
*Changes needed* are collapsed away, and nothing shown is untrue.

**[OBSERVED] Honesty is preserved where it matters.** The client still sees
`Overdue 1d`. Lateness is not hidden — only internal mechanics are.

**[OBSERVED] Client-facing language throughout:** "sent in yesterday · last
update 18h ago" (relative, human), "No footage link yet", and a tip that teaches
the visual language — *"Each row shows where your video is. The filled dots are
the stages already done."*

### Operator mode, marked twice [OBSERVED + MEASURED]

1. A **quiet chip** near the header naming the client being viewed, and
   `read only`.
2. A **persistent floating pill**, `.pvbar` — [MEASURED] `position:fixed`,
   `z-index:80`, 18px from the bottom, centred, `border-radius:999px`,
   `background:var(--panel)`, **`border:1px solid #780000`** (brand maroon),
   `box-shadow:0 14px 40px rgba(0,0,0,.5)`. It names whose dashboard this is,
   who you actually are, that it is read-only, and carries a **`← Leave`**
   button inside it.

**The exit lives inside the marker** — operator mode cannot be entered and
forgotten. [MEASURED] At ≤560px it goes full-width (`left:16px; right:16px`).

**[OBSERVED] The account menu** groups destinations by role under `OPEN ANOTHER
DASHBOARD`: `OWNER` · `EDITOR` · `CLIENT`, each entry with its avatar. You pick
*a person or a client*, not a row.

---

## A.6 The leak — a caution, not a pattern

**[OBSERVED] The client's Updates feed leaks the vocabulary the rest of the
client UI carefully hides.** Its rows report that a staff member *"moved this
from **Picked up** to **Waiting to start**"*.

Those are **owner-internal stage names** — two of the exact three states the
client's own progress rail collapses away. The feed also names internal staff,
whom the client's tiles deliberately omit.

**[INFERRED]** The projection is applied in the component that renders status,
not at the data layer — so every *new* surface has to re-apply it, and the
activity feed did not.

**This is the most valuable negative finding in the audit**, because Designakum
is about to build the same thing (bucket C2, Activity feed) under the same rule
(§9 principle 5, *"the client's model is a true projection of ours"*).

> **Design law for Designakum:** the projection belongs in **one pure module**
> mapping platform state → customer language, and **every** client-facing
> surface must pass through it — dashboards, feeds, emails, receipts. If an
> event log stores raw internal state and a view renders it verbatim, the
> projection is defeated no matter how careful the main UI is.

This raises the bar for billing emails (C1) too: a receipt reading
`subscription environment: live` or `tenant status: active` is the same defect
in a different channel.

---

## A.7 What this changes in the recommendations

**Nothing is withdrawn.** Three items sharpen, one is added:

| # | Change |
|---|---|
| **A2 → sharpened** | The summary band is a **light island**; emphasis inside it is **border + number colour**, not a second surface (§5.2 correction) |
| **A8 / A9 → sharpened** | Adopt the **shared `:active { transition-duration: var(--t-press) }` rule** across all interactive selectors rather than per-component — and add the **sliding active indicator** with its `:has()` fallback and delayed ink |
| **A4 → sharpened** | The Arabic eyebrow's replacement device is now concrete: **`color-mix(in srgb, #2C6FE0 40%, var(--text-primary))`**, mirroring Lumetra's own `--hi-lab` |
| **A18 → new** | **The client-language projection must be one shared module applied to every client-facing surface**, including the future activity feed and all billing email. Lumetra's own feed proves how easily this is lost |

**New for bucket B (does not fit):** nothing.

**New for bucket D (purely visual):** the sliding nav indicator — pure CSS, no
dependency, and it degrades to the current static active state.

---

# Appendix B — Brand translation

**Written 2026-08-14 from the actual brand assets in this repository**, not from
a description of them. Everything in B.0 was read off the files.

The goal is stated by the requirement itself: **the interface should feel like
Designakum, not Lumetra with different colours.** So this appendix does not
recolour Appendix A. It works from the mark outward, and where that contradicts
something earlier in this document, it says so (B.11).

---

## B.0 What the asset actually is

Files: `public/logo.png` (white, 900×230), `public/logo-light.png` (blue,
900×230), `public/favicon.png` (white, 512×512).

**[OBSERVED] It is an Arabic wordmark — ديزاينكم — and nothing else.** There is
no Latin lockup and no icon-only mark in the repository. Read directly:

1. **Geometric Kufic construction.** Straight strokes, flat planes, sharp
   corners, near-monoline weight. It is *constructed*, not written — the
   opposite of a calligraphic Naskh or Thuluth.
2. **The i'jam (dots) are diamonds** — squares rotated ≈45°, with **sharp,
   unrounded corners**. Verified at pixel level. This is the documented "diamond
   motif", and it is the only ornamental decision in the entire mark.
3. **The diamonds are not perfectly axis-aligned.** The upper one sits a few
   degrees off true 45°. Small, deliberate, and it is where the *movement*
   comes from — a perfect diamond is static; a tilted one is in motion.
4. **Terminals are chiselled, never rounded.** Stroke ends are cut flat, several
   on a slight diagonal shear. **There is not one rounded corner in the mark.**
5. **It is flat.** One solid colour. **No gradient, no glow, no shadow, no
   outline.**
6. **The favicon is the same wordmark**, centred in a square with wide dead
   margins — not a mark.

**[MEASURED] The logo's blue is `#2A6BCE`.** Sampled from the opaque pixels of
`logo-light.png`: 54,973 of 64,839 opaque pixels are exactly `#2A6BCE`, the
remainder anti-aliasing.

---

## B.1 The colour discrepancy — resolve this first

**The documented brand blue and the actual logo blue are not the same colour.**

| Source | Value |
|---|---|
| `docs/ux/designakum-ux-context.md` §6.3, and the emails | `#2C6FE0` |
| **`public/logo-light.png`, measured** | **`#2A6BCE`** |
| The application today | neither — `#9FA7FF` / `#4f57d8` |

`rgb(44,111,224)` vs `rgb(42,107,206)`: the logo is **darker and slightly less
saturated**. Side by side — logo in the sidebar, button beneath it — the
mismatch is visible. This is the Lumetra v5.2 trap in a different form: two
values that are almost the same colour, which is worse than two that are plainly
different.

**Recommendation: standardise on the logo's own `#2A6BCE`.**

Three reasons, in order:

1. **The asset is the artefact that ships.** Documentation describes; the PNG
   renders. When they disagree, the file wins.
2. **It has better contrast.** On white, `#2A6BCE` measures **5.13:1** against
   `#2C6FE0`'s **4.71:1**. Both clear AA for large text and for a filled button
   with white ink; only `#2A6BCE` has real headroom, and it clears 4.5:1 for
   normal-size text with room to spare.
3. **It is the more serious blue.** `#2C6FE0` is brighter and reads slightly
   toward "tech startup". `#2A6BCE` reads closer to the trust register the brief
   asks for.

**This is the owner's call, not mine** — it is a brand decision, not a UI one.
But it must be *made*, because the two values cannot both be the brand. If you
prefer `#2C6FE0`, the logo files should be regenerated to match; leaving both in
circulation is the one option with no upside.

> Everything below is written as `--brand`, so the decision resolves in one
> token whichever way it goes.

---

## B.2 The four qualities, translated

The brief names four qualities. Each gets a **mechanism**, not an adjective —
something a reviewer can check.

| Quality | Where it is in the mark | UI mechanism |
|---|---|---|
| **Trust** | Flat, even weight; no effects; high contrast | One accent with one job · semantic colours that never bluff · **AA contrast as a hard floor** · the product acknowledges every action, especially money (§7.2) |
| **Precision** | Sharp corners, chiselled terminals, constructed geometry | **Butt caps and miter joins** on icons · figures on a tabular grid · alignment to the space scale, never hand-picked · nothing approximate |
| **Movement** | Diamonds tilted off true 45°; sheared terminals | Motion that **travels and settles** — a sliding indicator, a slight overshoot, directional entrances that respect `dir` |
| **Modern technology** | Geometric Kufic — engineered letterforms | Geometric type · flat surfaces · **no skeuomorphic gradient or glow** · restraint as the signal of confidence |

**The one-line test:** if a screen could be recoloured into Lumetra's maroon and
be indistinguishable, the brand has not been translated — it has been painted
on.

---

## B.3 Primary brand colour usage

**`--brand` has exactly one job: *act here*.**

| Use `--brand` for | Never use `--brand` for |
|---|---|
| The single primary action per screen | A second button on the same screen |
| The active navigation indicator | Section headings or body text |
| Focus rings | Informational/neutral states — see B.4 |
| The Arabic eyebrow tint (§A.1) | Card borders or dividers as decoration |
| Progress already achieved (filled rail nodes) | Large filled areas or page backgrounds |
| Selection and checked states | Hyperlinks inside prose *(use underline + inherit)* |

**The discipline that makes it read as premium:** on any screen, count the
brand-coloured elements. **The answer should be one, or one plus the nav
indicator.** If it is three, the colour has stopped meaning anything and the
screen has no focal point — which is precisely the "everything has similar
weight" complaint the redesign exists to fix.

**Tints, for when blue must appear at low intensity:**

```
--brand:        #2A6BCE;                                   /* the decision */
--brand-ink:    color-mix(in srgb, var(--brand) 82%, #0C1530);  /* text on light */
--brand-soft:   color-mix(in srgb, var(--brand) 12%, transparent); /* fills */
--brand-line:   color-mix(in srgb, var(--brand) 28%, transparent); /* borders */
--brand-eyebrow:color-mix(in srgb, var(--brand) 40%, var(--text-primary));
```

`color-mix()` needs no dependency and no build step, and it means the whole
brand layer re-derives from one value — including if the owner picks `#2C6FE0`
after all.

---

## B.4 Semantic colours — and the collision the brand creates

**A royal-blue brand makes "info blue" unusable.** This is the single most
important consequence of the palette and it is easy to miss.

Almost every UI convention paints informational states blue. If Designakum does
that, an *informational* chip and the *primary action* are the same colour, and
the accent stops meaning "act here" — Lumetra hit exactly this and had to split
their reds (v5.2).

**So the semantic set must route around blue:**

| State | Colour | Rationale |
|---|---|---|
| **Act here** | `--brand` blue | The only blue in the interface |
| **Success / live / paid** | green | Unambiguous, never confused with the accent |
| **Attention / pending / retrying** | amber | See the §3.3 open question — this is the one to reconsider |
| **Failure / overdue / refused** | red | The only alarming colour |
| **Informational / neutral / comped** | **grey — not blue** | Because blue is spent |

**This resolves the amber question from §3.3.** I asked whether to follow
Lumetra and make non-urgent states blue or grey. **The brand answers it: they
must be grey, not blue.** Lumetra could afford a blue "warn" because their brand
is maroon. Designakum cannot.

Each semantic colour still needs the fill / ink / border triad from §3.3, with
the ink contrast-corrected per theme.

**A comped workspace is the case to get right.** It is not success, not warning,
not failure — it is a *neutral fact about the relationship*, and seven of the
current workspaces are comps. Grey, worded plainly, never styled as a problem.

---

## B.5 Neutrals, and dark / light surfaces

**The neutrals must be cool, because the brand is cool.** Navy `#0C1530` is
already documented as the text and dark-surface colour, and the light theme's
`--on-bg: 12, 21, 48` is exactly it [REPO].

**Light theme — the one to perfect first.** Ground slightly tinted, panels
white, so a card separates by surface alone and needs no border (§3.3's
reasoning, with the brand's own hue):

```
--bg-primary:   #FFFFFF;   /* panels, cards            */
--bg-secondary: #F3F5FB;   /* the ground — already exists, already correct */
--bg-elevated:  #E9EDF7;
--text-primary: #0C1530;   /* brand navy, not black    */
```

`--bg-secondary: #f3f5fb` is already a cool navy-tinted off-white [REPO]. **The
tokens are right; the usage is not** — panels currently sit on the same value
they are made of, which is why borders are doing work surface should do.

**Dark theme — and here is a real finding.** The current dark palette is
`--bg-primary: #0a0a0c`, `--bg-secondary: #131318`, `--bg-elevated: #1a1a22`
[REPO]. Those are **neutral near-blacks with a faint warm cast. There is no navy
in the dark theme at all** — which matches the finding that the brand blue
appears nowhere in application CSS.

Rebuild the dark ramp on the brand navy instead:

```
--bg-primary:  #080C1A;   /* navy-black, derived from #0C1530 */
--bg-secondary:#0C1530;   /* the brand navy itself            */
--bg-elevated: #131E3D;
```

This costs one token block and it is the difference between "a dark theme" and
"Designakum's dark theme". **Note this also separates us from Lumetra**, whose
`#07090C` is deliberately neutral near-black.

> **[PREFERENCE] Revision to §3.3.** I earlier suggested stealing Lumetra's warm
> cream ground (`#F7F1E6`). **Withdrawn.** Warm cream under a cool royal blue
> goes muddy — the blue turns violet against a yellow-tinted ground. The
> *instinct* (a tinted ground so cards need no borders) was right; the
> temperature was wrong. Use the cool `#F3F5FB` that the repo already has.

---

## B.6 Gradients — the verdict

**The mark is flat. One colour, no gradient, no glow, no shadow.**

The application currently ships:

```
--accent-gradient: linear-gradient(180deg, #6d86ff, #4f6ef2);
--accent-glow:     0 4px 14px rgba(79, 110, 242, 0.25);
```

[REPO] — a gradient and a glow, in colours that are not the brand, on the
primary button.

**Recommendation: drop both. The primary action is a flat `--brand` fill.**

This is not minimalism for its own sake. A gradient on a button is a claim about
depth and material; the brand makes no such claim, and the mismatch is exactly
how a product ends up looking like a template. Flat also solves a practical
problem: a gradient cannot be derived from one token, so every future accent
change means re-authoring two stops and a shadow.

**Where a gradient is still legitimate — sparingly:**

- **A brand wash behind a first-run or empty state**, at very low intensity
  (`--brand-soft` → transparent). This is the one place the product needs
  warmth, because the screen is otherwise empty.
- **Never** on buttons, cards, chips, badges, nav, or headers.

**Elevation replaces the glow.** `--shadow-sm/md/lg` already exist and are
neutral [REPO]. A coloured glow around a button is the most dated thing in the
current UI.

---

## B.7 Typography personality

The mark is **geometric Kufic**. The type system should agree with it — and
here the repository is already holding the answer without using it.

**Arabic — use Reem Kufi for display.** `styles/globals.css` loads Manrope, IBM
Plex Sans Arabic, **Reem Kufi** and Cairo, all four, on every page — the header
comment says so explicitly, because clients pick display faces for their public
pages [REPO]. But the admin's `--font-heading` is
`'Manrope', 'Cairo', 'IBM Plex Sans Arabic'` — **Reem Kufi is loaded and never
used in the product's own chrome.**

Reem Kufi is a *Kufi* face: geometric, constructed, flat-terminalled — the
closest thing already on the machine to the logo's own construction. IBM Plex
Sans Arabic is humanist and reads warmer and rounder; it is right for body text
and wrong for a heading that should echo the mark.

```
--font-display-ar: 'Reem Kufi', 'Cairo', system-ui;   /* headings + eyebrows */
--font-body-ar:    'IBM Plex Sans Arabic', system-ui; /* body — unchanged    */
```

**Zero network cost — the face is already in the single `<link>`.**

**Two cautions, because Reem Kufi is a display face:**
- **Display sizes only** — `--text-3xl`, `--text-4xl`, and the Arabic `.eyebrow`.
  Never body, never form labels, never long prose.
- Its weight range is narrower than Plex's. Check that the heading weights you
  want actually exist before relying on them.

**Latin — keep Manrope.** It is a geometric-leaning grotesque with flat
terminals and near-circular bowls; it is already the right neighbour for a
geometric Kufic mark. No change, and no new font request.

**The personality rule:** *engineered, not handwritten.* Tight tracking on
display sizes (§1.3), generous tracking on Latin micro-caps, and — per §1.4 —
**never tracking on Arabic**, where the mark's own presence comes from
construction and weight rather than spacing.

---

## B.8 Icon style

The mark has **sharp corners and chiselled, flat-cut terminals. Not one rounded
corner exists in it.**

**[REPO] The current icon renderer contradicts this in one line.**
`components/ui/BrandGlyph.js` draws every stroke glyph with:

```jsx
strokeLinecap="round"
strokeLinejoin="round"
```

Round caps and round joins are the *softest* possible terminal — the exact
opposite of the mark's chiselled cut. This is a genuine, checkable
brand mismatch, and it is a two-word change.

**The icon specification:**

| Property | Value | Why |
|---|---|---|
| Grid | 24×24 | matches the existing `viewBox` [REPO] |
| Stroke | 2px, monoline | the mark is near-monoline |
| **Caps** | **`butt`** | chiselled terminals |
| **Joins** | **`miter`** | sharp corners |
| Corner radius | **0** | there are none in the mark |
| Colour | `currentColor`, monochrome | never multicolour |
| Pairing | **always beside a word** | §5.2 |

**Two cautions against literalism.** Miter joins on acute angles produce long
spikes — set `stroke-miterlimit` or soften the angle in the path. And **`butt`
caps on a 2px stroke can read as slightly frail at 16px**; check optically at
the smallest size actually used, and accept `square` where `butt` looks thin.
The goal is the mark's *character*, not a doctrine.

**Delete the emoji** (§5.2, 31 in `admin.js` [REPO]) — a colour emoji is
categorically incapable of any of the above.

---

## B.9 Motion personality

The movement in the mark is **a tilt, not a bounce** — diamonds a few degrees off
true, terminals sheared on a diagonal. Quiet, directional, controlled.

**The motion personality: things travel and settle. Nothing springs.**

Revising §4.5's curves toward the brand:

```
--ease:      cubic-bezier(.22, 1, .36, 1);      /* default — decisive settle  */
--ease-pop:  cubic-bezier(.2, 1.06, .32, 1);    /* appears — 6% overshoot     */
--ease-exit: cubic-bezier(.4, 0, 1, 1);         /* leaves  — accelerate away  */

--t-press: .11s   --t-ui: .22s   --t-enter: .30s   --t-stag: .06s
```

**Note the overshoot is dialled back** from Lumetra's `1.12`–`1.56` to **1.06**.
Their springs are playful; a precision-and-trust brand overshoots just enough to
feel physical and stops. **A bouncy Designakum would contradict its own mark.**

Where motion should carry the brand:

- **The nav indicator travels** (§A.3) — the clearest expression of *movement*,
  and it should carry a diamond (B.10).
- **Directional entrances**, `dir`-aware — in Arabic a panel enters from the
  side it came from, which in RTL is the mirror of the Latin case.
- **`okFlash` on save and on payment** — *trust* is confirmation.
- **Staggered entrance** at 60ms, **no blur.** Lumetra's 14px entrance blur is
  expensive on mobile GPUs and reads as softness — off-brand for precision.

**What the brand forbids:** bounce, elastic, wobble, spin-for-decoration, and
anything ambient or perpetual. No boot sequence, no aurora drift (§4.3).

---

## B.10 The diamond — the missing mark, and the biggest opportunity

**There is no icon-only mark** (B.0). The favicon is the wordmark shrunk into a
square, which at 16–32px is an illegible smudge — and §8/A recommends an
**icon-rail sidebar at ≤1400px**, for which there is currently nothing to put in
the rail.

**The diamond solves this, and it is already the brand's own atom.** It is the
mark's single ornamental decision, it is unmistakable at 12px, and it is
distinct from every convention in the reference product — Lumetra's rails,
bullets and nodes are all circles.

Proposed system use — one shape, many jobs:

| Use | Form |
|---|---|
| **App mark / favicon / icon rail** | The diamond alone, in `--brand` |
| **Progress rail nodes** | Diamonds — filled = done, outlined = to come |
| **Setup-rail step markers** | Diamond, filling as each step completes |
| **List bullets** in prose | Small diamond instead of a disc |
| **The nav indicator's tip** | A diamond on the leading edge of the sliding pill |
| **Empty-state motif** | One large, very low-opacity diamond as the ghost |

**Why this is the strongest available differentiator.** Every recommendation in
§§1–8 makes Designakum a well-built dashboard; several would be at home in any
premium SaaS. **The diamond is the one element no competitor can borrow**, it
costs nothing (an SVG path with no dependency), and it converts a brand
ornament into a functional system.

**Constraints.** Keep the slight tilt off true 45° — that is where the movement
lives, and a perfectly axis-aligned diamond looks static and generic. Sharp
corners, no rounding. And it must be **mirror-safe**: a diamond is symmetric, so
it needs no RTL flip at all — which is a small, real advantage over any
arrow-derived mark.

**This is a design proposal, not a settled decision.** The mark is the owner's,
and inventing a logo is not a UX task — B.10 should be confirmed before anything
is built on it.

---

## B.11 What this appendix revises

| Where | Revision |
|---|---|
| **§3.3, warm ground [PREFERENCE]** | **Withdrawn.** Warm cream under royal blue goes muddy. Use the cool `#F3F5FB` already in the repo (B.5) |
| **§3.3, the amber question** | **Answered by the brand:** informational/neutral states must be **grey, not blue**, because blue is spent on the primary action (B.4) |
| **§3.3 / A.7, `--accent: #2C6FE0`** | **Superseded pending the owner's call** — the logo measures `#2A6BCE` (B.1). One token either way |
| **§4.5, easing curves** | Overshoot reduced from `1.12` to `1.06`; entrance blur dropped (B.9) |
| **§5.2, icons** | Adds the concrete spec, and identifies a live mismatch: `strokeLinecap/Linejoin="round"` in `BrandGlyph.js` (B.8) |
| **§1.3, typography** | Adds `Reem Kufi` for Arabic display — already loaded, never used in the product's chrome (B.7) |
| **Bucket D** | Adds: flat primary button (drop gradient + glow), navy dark ramp, icon caps/joins, Reem Kufi display token, the diamond mark |

**Nothing here requires a new dependency.** `color-mix()`, four already-loaded
font families, SVG paths, and CSS custom properties.

### Open brand decisions for the owner

1. **`#2A6BCE` or `#2C6FE0`?** (B.1) — the one blocking decision; everything
   else derives from it.
2. **Is the diamond available as the app mark?** (B.10) — needed before the
   icon-rail sidebar can be built.
3. **Drop the gradient and glow on the primary button?** (B.6) — visible change,
   trivially revertible.
4. **Rebuild the dark theme on navy?** (B.5) — currently neutral near-black with
   no brand in it at all.
