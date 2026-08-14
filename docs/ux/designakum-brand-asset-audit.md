# Designakum — Brand Asset Audit

**Written 2026-08-14**, before any redesign implementation. Source: 18 files in
`~/Downloads/Designakum Brand Assets/`.

**Every asset in this document was opened and looked at.** Colours, alpha
channels, bounding boxes and aspect ratios were measured, not estimated. Nothing
here is inferred from a filename.

**Scope.** `designakum.site` (the platform) is the target. `designakum.com`
(marketing) is a separate product; marketing assets are inventoried and mapped
to *crossover* only, never mixed into platform decisions.

**Constraints respected.** No replacement logo is proposed. No new mark is
invented. Logo evolution belongs to the human designer.

---

## The headline finding

> **A symbol mark already exists — and I previously reported that it did not.**

`designakum-design-system.md` §9.3 states *"There is no icon-only mark"*, based on
the three files in `public/`. That was true of the repository and **false of the
brand.** The asset set contains a **standalone Kufic monogram** in four
finished variants.

**Consequence: the diamond-as-app-mark proposal (D3) is withdrawn.** It existed
only to solve the missing-mark problem. The problem does not exist. **Using the
brand's own monogram is strictly better than deriving a new primitive from the
logo's diacritics**, and it honours "do not invent a mark" more faithfully than
my earlier proposal did.

The diamond survives **only** as a small typographic motif (bullets, rail nodes),
where it is an ornament rather than an identity — and even that is now optional.

---

# Phase 1 — Asset inventory

## 1.1 Summary

| # | Category | Count | Verdict |
|---|---|---|---|
| 1 | **Logos — wordmark** | 2 | Strong. Production-ready in form, wrong in format |
| 2 | **Logos — monogram** | 2 | **The most valuable finding.** Solves the icon problem |
| 3 | **Patterns** | 2 | Genuinely useful. One is a watermark, one a border |
| 4 | **Social / avatar tiles** | 4 | Mixed. One is unusable |
| 5 | **Calligraphy** | 1 | **Off-system.** Real brand risk |
| 6 | **Marketing graphics** | 2 | Out of platform scope, and about to go stale |
| 7 | **Product screenshots** | 4 | Documentation of the *current* product |
| 8 | Icons | **0** | **Missing** |
| 9 | Illustrations | **0** | **Missing** |
| 10 | Portfolio imagery | **0** | **Missing** |

**Format problem, stated once because it affects everything:**

> **All 18 assets are PNG. There is no SVG, and no asset is sized for interface
> use.** Twelve are 6250×6250 — a canvas in which the artwork occupies 11–48% of
> the frame. A 4.3 MB PNG cannot go in a sidebar, an email header, or a favicon.
> **Format conversion is a prerequisite to implementation, not a polish task.**

---

## 1.2 Logos — Arabic wordmark

### IMG_7850 — wordmark, brand blue, transparent

- **Type:** Primary logo, light-background variant
- **Measured:** 6250×6250 canvas · artwork 6118×1563 · **ratio 3.91:1** ·
  **`#2A6BCE`** (confirms the locked brand blue for the third time)
- **Current quality:** **Excellent.** Clean geometry, sharp chiselled terminals,
  diamond i'jam intact, no artefacts
- **Brand value:** **Highest.** Arabic-first identity is the single strongest
  differentiator Designakum has. No Western SaaS competitor can copy it
- **Best usage:** Sign-in and sign-up · email headers · the sidebar brand block
  (desktop) · billing documents and receipts · premium moments · marketing
- **Bad usage:** **Favicon · collapsed icon rail · avatars · any square frame · any
  container under ~120px wide.** At 3.91:1 the diacritics merge and the diamonds
  stop resolving
- **Needs modification:** **SVG conversion (blocking).** Trim the canvas to the
  artwork. Define clear space
- **Priority:** **P0**

### IMG_7849 — wordmark, white, transparent

- **Type:** Primary logo, dark-background variant
- **Measured:** artwork 4144×1059 · ratio 3.91:1 · pure `#FFFFFF`
- **Current quality:** Excellent, identical geometry
- **Brand value:** High — the dark-surface counterpart. Both variants existing is
  correct practice
- **Best usage:** Dark theme sidebar · dark email headers · the navy surfaces in
  §2.4 of the design system
- **Bad usage:** As above. Also **never** on a mid-tone or busy photo without a
  solid plate
- **Needs modification:** SVG. **Note it fills only 11% of its canvas** — the
  worst padding ratio in the set
- **Priority:** **P0**

## 1.3 Logos — monogram *(the key assets)*

### IMG_7853 — monogram, brand blue, transparent

- **Type:** **Symbol mark / lettermark**
- **Measured:** artwork 5778×3266 · **ratio 1.77:1** · `#2A6BCE`
- **Current quality:** **Strong.** Same construction language as the wordmark —
  angular Kufic strokes, sheared terminals, a strong diagonal. It reads as
  *derived from* the wordmark, not bolted on
- **Brand value:** **Very high, and previously unrecorded.** This is what makes an
  icon rail, an app icon and a favicon possible **without inventing anything**
- **Best usage:** **App icon · favicon · collapsed sidebar rail (≤1200px) ·
  avatar/profile marks · loading indicator · watermark source · email footer**
- **Bad usage:** As a replacement for the wordmark in primary brand moments —
  sign-in and email headers should carry the full name. Not on busy imagery
- **Needs modification:** **SVG (blocking).** **And note it is 1.77:1 — landscape,
  not square.** It needs deliberate centring and padding inside a square frame;
  it is not drop-in ready as an app icon. *(IMG_7865 already does this — see 1.5.)*
  **Legibility at 16–32px must be tested before it is committed to a favicon.**
- **Priority:** **P0**

### IMG_7852 — monogram, white, transparent

- **Type:** Symbol mark, dark-background variant
- **Measured:** artwork 4129×2334 · ratio 1.77:1 · `#FFFFFF`
- **Quality / value / usage:** As IMG_7853, for dark surfaces
- **Priority:** **P0**

## 1.4 Patterns

### IMG_7854 — geometric border strip

- **Type:** Decorative pattern — **the monogram tiled into a dense two-row band**
- **Measured:** artwork 6093×509 within a 6250² canvas — **a thin strip stranded
  in an enormous empty frame**
- **Current quality:** Good design, **bad packaging.** Derived from the mark, so
  it is authentically Designakum rather than generic Islamic-geometric filler
- **Brand value:** Medium-high. Adds craft and cultural specificity
- **Best usage:** **Edge treatments only** — email header/footer bands, sign-in
  page edge, receipt letterhead, certificate-style moments. It is used exactly
  this way in the marketing graphic (IMG_7867's lower edge), and it works there
- **Bad usage:** **As a page background field.** At full density it is visually
  loud and will fight content and text. **Never behind a data table, a form, or
  anything a user must read**
- **Needs modification:** SVG, **and a seamless horizontal tile** — currently a
  fixed-width strip that cannot repeat cleanly. Trim the dead canvas
- **Priority:** **P2**

### IMG_7855 — low-opacity watermark

- **Type:** Watermark texture
- **Measured:** **max alpha 28/255 (~11% opacity)**, white, covering 17% of pixels
- **Current quality:** **Deliberate and correct — not a broken file.** I checked
  precisely because it renders as blank; it is an intentional ghost layer
- **Brand value:** Medium. This is the mechanism behind the watermark visible in
  IMG_7851 and IMG_7864
- **Best usage:** Subtle texture on **dark** surfaces — sign-in background, empty
  states, email hero, `/console` page headers. At 11% it will not fight content
- **Bad usage:** **On light surfaces** — white at 11% on `#F3F5FB` is invisible.
  A light-theme equivalent does not exist and must be produced
- **Needs modification:** SVG; a **navy/blue version for light backgrounds**
- **Priority:** **P2**

## 1.5 Social / avatar tiles

All four are 6250² flattened compositions on a **blue gradient**.

### IMG_7865 — monogram, white, on blue gradient ✅ *best of the four*

- **Measured gradient:** `#2054A5` (top) → `#173D80` (bottom)
- **Quality:** Clean, centred, well-padded. **Effectively an app icon already**
- **Best usage:** App icon, social avatar, favicon source, OG image base
- **Needs:** **The gradient is not the brand blue** — see §3.1. Regenerate flat
  on `#2A6BCE`, or accept the gradient as a *social-only* treatment
- **Priority:** **P1**

### IMG_7863 — wordmark, white, on blue gradient

- **Quality:** Good, but the 3.91:1 wordmark inside a square leaves heavy dead
  space top and bottom
- **Best usage:** Social post base, OG image, presentation title card
- **Bad usage:** App icon or avatar — the wordmark is unreadable at small square sizes
- **Priority:** **P2**

### IMG_7864 — monogram on gradient **with watermark**

- **Quality:** Good; the watermark adds depth
- **Best usage:** Social, marketing crossover
- **Bad usage:** Favicon — the watermark becomes noise below ~64px
- **Priority:** **P3**

### IMG_7866 — monogram in `#2A6BCE` on a **darker blue gradient** ❌

- **Quality:** **Weak. The only asset I would not ship.** Tone-on-tone blue at
  low contrast — measured content `#2A6BCE` against a `#1E509E`/`#194288` ground.
  The mark barely separates from its background
- **Brand value:** **Negative.** A logo that struggles to be seen teaches viewers
  the brand is faint
- **Best usage:** **None in the platform.** At most a decorative full-bleed
  texture where the mark is not meant to be read
- **Needs modification:** Withdraw, or re-render the mark in white
- **Priority:** **P3 — do not use**

### IMG_7851 — monogram, white, on navy with watermark (transparent source)

- **Quality:** Good. A composition rather than a clean logo file
- **Best usage:** Dark hero panels, sign-in background
- **Bad usage:** **Not a logo file — do not use it where a logo is needed.** It
  carries its own background
- **Priority:** **P3**

## 1.6 Calligraphy — the one to handle carefully

### IMG_7869 — "أهلاً وسهلاً بكم" (*welcome*), white on blue gradient

- **Type:** Decorative Arabic calligraphy, 4688×3125
- **Current quality:** **Beautiful, and genuinely well-executed.** Flowing
  Diwani/Naskh-derived letterforms with full diacritics
- **Brand value:** **Ambiguous — and this is the most nuanced judgement in the audit.**

> **The problem.** The logo is **geometric Kufic**: constructed, flat-terminalled,
> angular, engineered. This calligraphy is its **opposite register** — cursive,
> flowing, ornamental, hand-drawn. Placed near each other they do not read as one
> brand; they read as two.
>
> The design system's §1.2 personality is *precision · structure · engineered,
> not handwritten*. **This asset is handwritten by definition.**

- **Best usage:** **Marketing and human moments only** — a welcome email hero, a
  seasonal or celebratory post, an onboarding "welcome" splash **used once**
- **Bad usage:** **Anywhere in the working product.** Not in `/console`, not in
  `/studio`, not as a heading style, and above all **not as a model for the
  product's Arabic typography.** It would fracture the personality the redesign
  is trying to establish
- **Needs modification:** None to the asset — it is well made. What it needs is a
  **usage rule**, which is §2.4 below
- **Priority:** **P3 — permitted, fenced**

## 1.7 Marketing graphics

### IMG_7867 (square, 4.3 MB) and IMG_7868 (banner, 4000×1363)

- **Type:** Promotional composites — Arabic headline *"ديزاينكم هي منصة تختصر على
  مشاهدينك الطريق"*, desktop + phone device mockups, an "أطلب الآن" CTA, and the
  IMG_7854 pattern as a lower edge band
- **Current quality:** Competent marketing design. Good use of the pattern as an
  edge treatment
- **Brand value:** Medium — **and depreciating**

> **⚠ These embed screenshots of the *current* product UI.** The moment the
> redesign ships, both graphics show a product that no longer exists. **They are
> time-bombed marketing collateral.**

- **Best usage:** `designakum.com` — **out of platform scope**
- **Bad usage:** **Anywhere in the platform.** Also: do not treat their layout as
  a design reference for `/studio` — they are ads, not product
- **Needs modification:** Re-shoot after Phase 4 of the roadmap. **4.3 MB is far
  too heavy for any web use**
- **Priority:** **P2 (marketing, post-redesign)**

## 1.8 Product screenshots

### IMG_7870 · IMG_7871 · IMG_7872 · IMG_7873 — current admin, Arabic RTL, dark

Not brand assets — **evidence**. And unusually useful evidence.

| Screenshot | Shows |
|---|---|
| IMG_7871 | Client overview: *"مرحبا بك في منشئ موقعك 👋"*, **14% completion meter**, site link, live status, quick actions, **"أكمل موقعك 1/7"** |
| IMG_7872 | **The 7-step onboarding checklist, expanded**, with per-step guidance and an "ابدأ الآن" CTA |
| IMG_7870 | Profile editor — SEO fields, image pickers |
| IMG_7873 | "الصفحة الرئيسية" (Home Page) editor — logo, banners, ticker toggle |

**Four things these confirm, and they matter beyond branding:**

1. **The onboarding checklist is already shipped**, not just written in `lib/`.
   IMG_7872 shows all seven `GUIDE_STEPS` rendered with their guidance text.
   **This strengthens the roadmap's classification of onboarding as LATER, not
   blocking** — the gap is presentation, not content.
2. **The current UI is dark-first**, near-black `#060912`. The design system
   specifies perfecting the **light** theme first — a real change of direction,
   correctly recorded, and these screenshots are what it is changing *from*.
3. **The 👋 emoji is visible in a page heading** — confirming the 31-emoji finding.
4. **The primary button is indigo-violet, not brand blue** — confirming that
   `#2A6BCE` appears nowhere in the application.

- **Best usage:** Internal documentation · before/after comparison · a regression
  reference while extracting editors in Phase 4
- **Bad usage:** **Marketing.** They will be obsolete
- **Priority:** **P1 as documentation — archive them with a date**

---

# Phase 2 — Product usage mapping

**The governing rule, because it prevents the most likely mistake:**

> **The wordmark says who we are. The monogram says where you are.**
>
> Brand *moments* — arriving, being welcomed, being billed — carry the full
> wordmark. Brand *presence* — chrome you see for hours — carries the monogram.
> **Neither is a decoration to be sprinkled.**

## 2.1 Authentication

The only place in the platform where a brand moment is appropriate at full
strength — the user is arriving, and nothing else competes for attention.

| Surface | Asset | Notes |
|---|---|---|
| **Sign-in** | Wordmark (IMG_7850 light / IMG_7849 dark), centred above the card | The single strongest brand moment in the product |
| **Sign-up** | Same | Consistency with sign-in reduces doubt at the highest-anxiety step |
| **Password reset** | Wordmark, smaller | Reassurance that the page is genuine — a real anti-phishing function |
| **Email verification landing** | Wordmark | — |
| **Background** | IMG_7855 watermark at 11%, **dark surfaces only** | Needs a light-theme equivalent (§5) |
| **Pattern** | IMG_7854 as a **single edge band**, optional | Never as a field behind the form |

**Do not use:** the calligraphy · the gradient tiles · any device mockup.

## 2.2 Client Studio (`/studio`)

**Restraint is the rule here.** This is the customer's workspace, and **the
customer's own work is the imagery.** Designakum's brand should be quiet inside
it — a portfolio product that decorates its own dashboard with its own logo is
competing with its user.

| Surface | Asset | Notes |
|---|---|---|
| **Sidebar (desktop)** | Wordmark, small | With no role label — a client has no other mode |
| **Sidebar (icon rail ≤1200px)** | **Monogram** | **This is why the monogram matters** |
| **Mobile bottom bar** | **No logo at all** | Space is for destinations |
| **Dashboard** | **None** | Status and the client's own work lead |
| **Portfolio editor** | **None** | — |
| **Portfolio preview** | **None — ever** | `PreviewPane` shows the *client's* brand. Ours must not intrude |
| **Publishing / success states** | Monogram, small, optional | A quiet confirmation mark |
| **Empty states** | **Monogram at low opacity, or the watermark** | The one legitimate decorative use — the screen is otherwise bare |

**Do not use:** the wordmark repeated on every screen · the pattern as a
background · the calligraphy · gradient tiles.

## 2.3 Owner Console (`/console`)

An operational tool. **Even more restraint than `/studio`** — an operator is here
for hours and brand furniture becomes noise.

| Surface | Asset | Notes |
|---|---|---|
| **Sidebar brand block** | Wordmark + role label (`Owner`) | The role lives here per the design system |
| **Icon rail** | Monogram | — |
| **Analytics / clients / billing** | **None** | Data leads |
| **Client avatars** | **The client's own logo**, monogram only as fallback | Lumetra does this and it is right |
| **Empty attention queue** | Monogram, low opacity, optional | *"Nothing needs you today"* is the message; the mark can carry it |

**Do not use:** patterns, gradients, or calligraphy anywhere in `/console`.

## 2.4 Emails

**The highest-value surface for these assets** — email is where a brand moment is
expected, where the pattern earns its place, and where the platform is currently
silent.

| Email | Assets |
|---|---|
| **Welcome / verification** | Wordmark header · IMG_7854 pattern as a **top edge band** · **calligraphy permitted here, once** |
| **Password reset** | Wordmark header only. **No decoration** — a security email should look plain and serious |
| **Receipt / invoice** | Wordmark header · pattern as a letterhead band · monogram in the footer |
| **Renewal notice** | Wordmark header, restrained |
| **Payment failed** | **Wordmark only. No pattern, no calligraphy.** A problem email must not look celebratory |
| **Cancellation** | Wordmark only, respectful |

**Rule:** decoration scales **inversely** with the seriousness of the message.

> **The calligraphy's one home.** IMG_7869 says *"welcome"*. Use it in the welcome
> email hero and nowhere else in the platform. It is a greeting, not a typeface —
> and it must never sit beside the Kufic wordmark at similar size, where the
> clash of registers becomes obvious.

## 2.5 Marketing crossover

**Out of platform scope**, recorded only for the boundary.

| Surface | Assets |
|---|---|
| Hero | Wordmark, gradient tiles, pattern |
| Trust sections | Screenshots — **must be re-shot post-redesign** |
| Social | IMG_7863/7864/7865 |
| Promotional | IMG_7867/7868 — **re-shoot after roadmap Phase 4** |

**The one contract:** marketing links to `/signup`, never `/subscribe`.
**Nothing in the platform repository may reference or serve marketing.**

---

# Phase 3 — Visual system review

## 3.1 Colour — the problem the assets reveal

**Measured across the asset set, at least five blues are in circulation:**

| Value | Where | Standing |
|---|---|---|
| **`#2A6BCE`** | Wordmark + monogram, both blue variants | **THE BRAND. Locked** |
| `#2C6FE0` | Old documentation, transactional emails | **Retired — do not reintroduce** |
| `#2054A5` → `#173D80` | Social tile gradients | Undocumented |
| `#1E509E`, `#194288`, `#1F52A1` | Gradient midtones across tiles | Undocumented |
| `#4f57d8` / `#9FA7FF` | The application today | Neither the brand nor the assets |

> **This is brand-colour sprawl, and it is the single most concrete finding in
> Phase 3.** Five blues that are all *nearly* the same is worse than two that
> differ plainly — it reads as carelessness rather than a palette.

**Resolution — no change to the locked decision, one addition:**

1. **`#2A6BCE` is the brand.** Confirmed for a third time by direct measurement
   of both blue logo variants.
2. **The gradient blues are a social-media treatment, not a brand palette.** They
   may stay on `designakum.com` and social tiles. **They must not enter the
   platform.** The platform is flat (design system §2.6).
3. **Any asset regenerated for platform use is rendered flat on `#2A6BCE`.**

**The role table stands, unchanged and now asset-verified:**

| Role | Colour | Rule |
|---|---|---|
| **Primary action** | `--brand` `#2A6BCE` | **One per screen.** The only blue in the interface |
| **Secondary action** | Surface + `--border-strong` | Never blue |
| **Information** | **Grey (`--neutral`)** | **Never blue** — it would collide with the primary action |
| **Warning** | Amber | Time-bounded and actionable only |
| **Success** | Green | Live, published, paid |
| **Neutral** | Grey | Comped, draft, not published |

> **The brand colour must not become every UI colour.** The assets make the
> temptation obvious — nearly every one is blue-on-blue. **A product is not a
> brand asset.** In the interface, blue means *act here* and nothing else.

**Backgrounds and surfaces** are unchanged: cool ground `#F3F5FB`, white panels,
navy `#0C1530` for dark surfaces and text. The gradients in the assets **do not
translate** to platform surfaces.

## 3.2 Typography

**The assets confirm the type direction, and surface one conflict.**

**Confirmed:** the wordmark and monogram are **geometric Kufic** — constructed,
flat-terminalled, angular. This is why **Reem Kufi** (already loaded at 400–700)
is the correct Arabic display face: it is the only loaded family built on the
same principle.

| Role | Face | Status |
|---|---|---|
| Arabic display / headings / eyebrow | **Reem Kufi** | Matches the mark |
| Arabic body | **IBM Plex Sans Arabic** | Humanist, legible — correct for prose |
| Latin display | **Manrope 800** | Geometric grotesque, flat terminals |
| Latin body | Manrope 400/500 | — |
| Numerals | Manrope `tnum` | Latin numerals in both locales |

**The conflict: IMG_7869.** The calligraphy is cursive and ornamental — the
opposite register to the mark. **It must not become a typographic reference.** If
a future designer treats it as "the Arabic voice", the product's Arabic
typography will drift away from its own logo.

**Does the type match the logo personality?** Yes — with Reem Kufi. Without it
(today's `Manrope, Cairo, IBM Plex Sans Arabic` heading stack) the product's
Arabic headings do **not** echo the mark.

**Does it work in RTL?** Yes, subject to the standing rules: **no letter-spacing
and no uppercase on Arabic**, Latin numerals in both locales, logical properties,
`--leading-arabic: 1.75`.

**Does it feel premium?** The mark does. The product will once the ratio widens
(1.86× → 3.1×) and Reem Kufi carries display.

## 3.3 Imagery

**The most important gap in the whole audit:**

> **There is no photography, no portfolio imagery, and no placeholder content —
> for a product whose entire pitch is showing the customer's work.**

Twelve of eighteen assets are the logo on a blue square. **A portfolio platform
cannot demonstrate itself with logo tiles.**

**Recommended visual language for the platform:**

1. **The customer's work is the imagery.** Designakum supplies the frame. This is
   the whole positioning — *personal brand, not website tool*.
2. **Editorial restraint.** Generous white space, one image doing the work,
   never a collage. Premium comes from what is left out.
3. **No stock photography.** A creative-professional audience recognises it
   instantly, and it would undermine the credibility the product sells.
4. **Real work only in mockups.** Placeholders must be visibly placeholders —
   never fake portfolios presented as real customers.
5. **Device mockups belong to marketing**, not the product. `PreviewPane` is the
   in-product equivalent and it shows the real thing.
6. **Thumbnails carry the product.** The client's project grid, a `Thumbstrip` on
   `/studio` home, and thumbnails in `/console` client cards are where imagery
   does its work — **not decorative headers.**

**What this means for empty states:** an empty portfolio must show the *shape* of
what will fill it — a ghost grid, the preview frame — **not an illustration of a
person at a laptop.** The product's job is to make the customer's absence of
work feel like a next step, not a deficiency.

---

# Phase 4 — Lumetra lessons

**Lumetra is a UX reference. It is not a visual reference.** Audited twice — its
design system from source, and its authenticated application.

## 4.1 What Designakum should learn

| Lesson | Why it transfers |
|---|---|
| **Separate products per role** | Owner and client are different jobs. This is the core finding of the whole audit, and it is structural, not visual |
| **Every screen answers one question, named in its own eyebrow** | Works in any brand |
| **Numbers are sentences** — a figure with a noun phrase and a qualifying footer | *"1 payment failed"* beats *"Failed: 1"* in any language |
| **Summaries are navigation** | Reading and acting as one gesture |
| **Every state names its exit condition** | The difference between a notification and a task |
| **The client's model is a true projection of the operator's** | The discipline Designakum needs most |
| **Explicit, doubly-marked operator mode with the exit inside the marker** | Cannot be entered and forgotten |
| **Emphasis by border + ink, not a second surface** | Cheap, and it solves "everything has similar weight" |
| **Press timing separated from entrance timing** | 110ms vs 300ms — pure perceived quality |
| **One travelling active indicator with a static fallback** | Motion that means something |
| **Worded absence everywhere** | *"nobody assigned yet"*, never a dash |
| **Premium spacing = consistency, not generosity** | Their gutter is an ordinary 28px; it is *always* 28px |

## 4.2 What Designakum should deliberately avoid

| Avoid | Why |
|---|---|
| **Their colours** | Deep maroon `#780000` and alarm red are their identity. Designakum is royal blue |
| **Their branding and lettermark** | Obviously |
| **Their dark-first palette** | Near-black `#07090C`. Designakum's dark surface is brand **navy** `#0C1530`, and the **light theme ships first** |
| **Their density** | 12.5px median type for an operator living in the tool. A Designakum client visits ten minutes a month |
| **Their agency assumptions** | Lumetra runs jobs through stages for staff. Designakum has **one client, one site, one subscription.** No pipelines, no assignees, no editors |
| **Their springs** | Overshoot to 1.56 is playful. The mark is precise — capped at 1.06 |
| **Boot sequences and ambient drift** | Six `boot*` keyframes and three ambient animations. Latency with no informational job |
| **Four selectable themes** | A maintenance liability across a bilingual product |
| **"Test look" demo data** | For Designakum an **empty workspace is a real and common state** — the effort belongs in first-run and empty states |
| **Becoming project-management software** | The single biggest risk of over-learning from Lumetra |

> **The test.** If a Designakum screen could be recoloured into Lumetra's maroon
> and be indistinguishable, the brand has not been applied — it has been painted
> on. The Arabic wordmark, the Kufic monogram, Reem Kufi display type and the
> flat royal blue are what make that impossible.

---

# Phase 5 — Missing assets

## 5.1 MUST HAVE — before redesign implementation

| # | Asset | Why blocking |
|---|---|---|
| **M1** | **SVG versions of the wordmark** (blue + white) | **6250² PNGs cannot go in a sidebar or an email.** Everything visual depends on this |
| **M2** | **SVG versions of the monogram** (blue + white) | Icon rail, favicon, app icon |
| **M3** | **Favicon set** — 16/32/48px, derived from the monogram, **legibility tested at 16px** | The monogram is 1.77:1 landscape; it needs deliberate square framing. **Untested at small sizes** |
| **M4** | **Trimmed, correctly-padded logo files** | Artwork occupies 11–48% of its canvas. Unusable without trimming |
| **M5** | **A UI icon set** — 24×24, 2px, butt caps, miter joins | **Zero icons exist.** 31 emoji are currently doing this job |
| **M6** | **Light-theme watermark** (navy at ~8%) | The only watermark is white — invisible on the light theme that ships first |
| **M7** | **Logo clear-space and minimum-size rules** | Otherwise every implementer guesses |

## 5.2 SHOULD HAVE — improves the experience

| # | Asset | Value |
|---|---|---|
| **S1** | **Portfolio placeholder set** — 6–8 neutral, obviously-placeholder thumbnails | Empty states and previews. **The product's biggest imagery gap** |
| **S2** | **Seamless tileable pattern** from IMG_7854 | Currently a fixed strip that cannot repeat |
| **S3** | **Email header/footer templates** using wordmark + pattern | Five billing emails are coming in Phase 5 |
| **S4** | **OG / social share images** for `/studio` and public portfolios | Sharing a portfolio is a core value moment |
| **S5** | **Flat `#2A6BCE` app icon** (no gradient) | IMG_7865 is gradient; the platform is flat |
| **S6** | **Avatar fallback system** — client initials on brand tints | `/console` client cards need it |
| **S7** | **Re-shot product screenshots** after roadmap Phase 4 | Current ones become obsolete on ship |

## 5.3 LATER — future polish

| # | Asset | Note |
|---|---|---|
| **L1** | Empty-state illustration system | **Only if it stays geometric and restrained.** A cheerful illustration style would contradict the brand. Ghost UI may be better than illustration |
| **L2** | Onboarding visuals | The checklist already ships and works |
| **L3** | Loading / brand animation | Must obey the 1.06 overshoot cap |
| **L4** | Certificate or receipt letterhead | Pattern band + wordmark |
| **L5** | Latin lockup | **Only if the designer judges it necessary.** The Arabic-first mark is the differentiator — a Latin lockup risks diluting it |
| **L6** | Motion identity for the monogram | Designer-owned |

---

# Phase 6 — Designer brief

**For the human designer who owns logo evolution, brand extensions, the
illustration system and future visual exploration.**

## 6.1 Context in one paragraph

Designakum is a bilingual (Arabic-first) SaaS platform where creative freelancers
in Saudi/Gulf run a professional portfolio presence, and an owner runs the
platform behind it. The product is being rebuilt as **two separate experiences** —
an owner console and a client studio. The brand must feel **premium, creative,
trustworthy, editorial, modern and intentional**, and must not feel like a generic
admin dashboard, project-management software, or a website-builder clone.

## 6.2 PRESERVE — what already works

1. **The Arabic wordmark.** It is the strongest asset in the set and the clearest
   differentiator against any Western SaaS competitor. **Do not Latinise it, do
   not replace it, do not "modernise" it.**
2. **The geometric Kufic construction** — flat terminals, sharp corners, no
   rounding, near-monoline weight.
3. **The diamond i'jam.** Tilted slightly off true 45°; that tilt is where the
   movement lives.
4. **The monogram.** Consistent with the wordmark, and it solves the icon problem
   without inventing anything.
5. **`#2A6BCE`.** Locked. Measured from the assets three times.
6. **Flatness.** The mark has no gradient, glow or shadow — and the product now
   follows it.
7. **The pattern's derivation from the monogram** — authentically Designakum
   rather than generic Islamic-geometric decoration.

## 6.3 IMPROVE — what needs refinement

| # | Item | The ask |
|---|---|---|
| **I1** | **Formats** | SVG for everything. Trimmed canvases. Defined clear space and minimum sizes |
| **I2** | **Monogram at small sizes** | **Test at 16/24/32px.** It is 1.77:1 landscape — decide how it is framed in a square, and whether it needs a simplified small-size variant |
| **I3** | **Blue sprawl** | Five blues in circulation. Consolidate to `#2A6BCE`; keep gradients as a **social-only** treatment |
| **I4** | **IMG_7866** | Low-contrast blue-on-blue. Withdraw or re-render in white |
| **I5** | **Pattern tiling** | Make it seamlessly repeatable; produce a lower-density variant for large areas |
| **I6** | **Watermark** | Produce the light-theme (navy, ~8%) counterpart |
| **I7** | **Icon set** | 24×24, 2px, **butt caps, miter joins, zero corner radius** — matching the mark's chiselled terminals. Replaces 31 emoji |

## 6.4 EXPLORE — opportunities, designer's judgement

1. **A small-size monogram variant** — the way many marks have a simplified form
   below 24px.
2. **Motion identity for the monogram** — precise and architectural, not bouncy.
   It could serve as the loading indicator.
3. **A geometric empty-state language** derived from the pattern, **instead of**
   conventional illustration.
4. **Editorial layout language** for premium moments — receipts, welcome emails,
   the published-portfolio confirmation.
5. **Avatar / initial system** for clients without a logo.
6. **Whether a Latin lockup is needed at all.** *We recommend caution:* the
   Arabic-first mark is the differentiator, and a Latin lockup risks becoming the
   default and diluting it.

## 6.5 AVOID — what would weaken the brand

| Avoid | Why |
|---|---|
| **Replacing or Latinising the wordmark** | It is the entire differentiation |
| **Rounding any corner or terminal** | The mark has none. Rounding reads as friendly, not precise |
| **Gradients, glows, bevels, shadows on the mark** | It is flat by design |
| **Using the calligraphy as a typographic system** | Opposite register to the Kufic mark. Fenced to welcome moments |
| **A second brand colour** | One blue, one job |
| **Cheerful illustration** | Would contradict *precision · structure · restraint* |
| **Stock photography** | A creative audience recognises it instantly |
| **Logo-as-wallpaper** | The pattern is an edge treatment, not a field |
| **Brand furniture inside the working product** | `/studio` and `/console` are where the *customer's* work leads |
| **Designing for Lumetra's shape** | Different brand, different audience, different business |

## 6.6 Non-negotiables the designer inherits

- **Arabic is a layout mode, not a mirror.** No letter-spacing, no uppercase on
  Arabic. **Latin numerals in both locales.**
- **AA contrast is a floor**, not a goal.
- **Flat, not decorated.**
- **The customer's work is the imagery.**
- **The platform ships light theme first.**

---

# Final output

## 1. Complete asset audit

18 assets, all opened and measured. **11 are usable in the platform after format
conversion · 4 are marketing/documentation · 2 need rework · 1 should not be
used** (IMG_7866, low-contrast blue-on-blue).

**The correction that matters:** a **symbol mark already exists**. My earlier
statement that it did not was true of `public/` and false of the brand.
**D3 — the diamond as app mark — is withdrawn.** The monogram is better, and it
requires inventing nothing.

## 2. Brand usage rules

1. **The wordmark says who we are; the monogram says where you are.**
2. **Brand moments** — sign-in, emails, receipts — carry the wordmark.
   **Brand presence** — chrome — carries the monogram.
3. **Restraint inside the product.** `/studio` and `/console` show the *customer's*
   work; the preview pane carries **no** Designakum branding, ever.
4. **One blue, one job.** `#2A6BCE` means *act here*. Information is grey.
5. **Flat.** Gradients are social-only and do not enter the platform.
6. **The pattern is an edge treatment**, never a field behind content.
7. **The calligraphy is a greeting, not a typeface** — welcome email only.
8. **Decoration scales inversely with seriousness.** A failed-payment email gets
   the wordmark and nothing else.
9. **Minimum sizes are enforced:** wordmark never below ~120px wide, never in a
   square frame; monogram for anything smaller.

## 3. Product placement recommendations

| Surface | Wordmark | Monogram | Pattern | Watermark | Calligraphy |
|---|---|---|---|---|---|
| Sign-in / sign-up | ✅ | — | edge only | ✅ dark | ❌ |
| Password reset | ✅ | — | ❌ | ❌ | ❌ |
| `/studio` sidebar | ✅ desktop | ✅ rail | ❌ | ❌ | ❌ |
| `/studio` dashboard | ❌ | ❌ | ❌ | ❌ | ❌ |
| Portfolio preview | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/studio` empty states | ❌ | ✅ low-opacity | ❌ | ✅ | ❌ |
| `/console` sidebar | ✅ + role | ✅ rail | ❌ | ❌ | ❌ |
| `/console` data screens | ❌ | ❌ | ❌ | ❌ | ❌ |
| Welcome email | ✅ | — | ✅ band | — | ✅ **once** |
| Receipt / invoice | ✅ | ✅ footer | ✅ band | — | ❌ |
| Payment-failed email | ✅ | — | ❌ | ❌ | ❌ |
| Marketing | ✅ | ✅ | ✅ | ✅ | ✅ |

## 4. Missing asset roadmap

**MUST (7)** — SVG wordmark · SVG monogram · favicon set (16px-tested) · trimmed
files · **UI icon set** · light-theme watermark · clear-space rules.
**SHOULD (7)** — portfolio placeholders · tileable pattern · email templates ·
OG images · flat app icon · avatar fallbacks · re-shot screenshots.
**LATER (6)** — empty-state illustration (only if geometric) · onboarding visuals ·
brand motion · letterhead · Latin lockup (cautioned) · monogram motion.

> **M1, M2 and M5 gate implementation.** Roadmap Phase 1 can land tokens and type
> without them, but **Phase 2's shell needs the SVGs, and Phase 6's emoji removal
> needs the icon set.**

## 5. Human designer brief

§6 above — Preserve (7) · Improve (7) · Explore (6) · Avoid (10), plus inherited
non-negotiables. **The designer owns logo evolution, brand extensions, the
illustration system and future exploration.** Nothing in this document proposes a
replacement mark, and the one invented primitive I had previously proposed has
been withdrawn in favour of an asset that already exists.

---

## What changed elsewhere because of this audit

| Document | Change |
|---|---|
| `designakum-design-system-final.md` §9.3 | **"No icon-only mark exists" is wrong.** A monogram exists in four variants |
| Same, **D3** | **Withdrawn.** The diamond is no longer needed as the app mark; it survives only as an optional typographic bullet/node motif |
| `designakum-implementation-roadmap.md` §Approvals | **D3 removed from the approval list.** Replaced by a smaller question: how the 1.77:1 monogram is framed square, and whether it holds at 16px |
| Roadmap Phase 2 | **Now has an asset dependency** — SVG wordmark + monogram (M1, M2) before the shell's brand block and icon rail |
| Roadmap Phase 6 | **Emoji removal depends on M5**, the icon set, which does not exist |
| Onboarding classification | **Reinforced as LATER** — IMG_7872 shows the seven-step checklist already shipped |

**No code was written. No implementation started. No branding invented.**
