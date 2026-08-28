# The original portfolio — the design to go back to

**Live reference:** https://enchanting-palmier-b208ed.netlify.app/
(F9 Designer. Feras's own earlier build, not a competitor.)

Feras: *"i wanna use the old design for the portfolio, looked much better than
the hot mess that we have rn."* This file exists so the next session does not
have to guess what "the old design" meant, and does not waste a day looking for
a redesign that never happened.

## FIRST, THE THING THAT WILL WASTE YOUR TIME IF NOBODY SAYS IT

**No session redesigned the public portfolio.** `pages/index.js` changed in the
2026-08-26..28 work in exactly four ways, none of them a restyle:

* the data path — reads a published snapshot via RPC instead of the tables
* a green "Available now" badge (section-s)
* a "could not load, try again" screen replacing a false 404
* stat cells: 16 -> 18px padding and a min-height, because a two-line label clipped

The card people are unhappy with is the one that was already there. Its look
comes from `4683400`, `2185986`, `0588ac0`, `36542d4`. **Reverting means moving
toward the Netlify build above, not undoing recent commits.**

## Measured from the live reference, 2026-08-28

Read out of the running page with `getComputedStyle`, at 375px and at 1280px.
This supersedes the shorter list this section used to carry: several values
below were missing from it, and three of them changed the character of the card.

### Page
```
background:            linear-gradient(#050507 0%, #0a0a14 55%, #6a70ab 100%)
background-attachment: fixed          <-- the violet tracks the VIEWPORT
font-family:           Tajawal, sans-serif
padding:               50px 0
```

### The card — `.main-container.card-section`
```
width:         330px          (narrow, and that is the point)
border-radius: 35px
padding:       25px
background:    rgba(255,255,255,0.05)   <-- TRANSLUCENT. The page shows through.
backdrop-filter: blur(20px)
border:        1px solid rgba(255,255,255,0.08)
box-shadow:    0 25px 50px rgba(0,0,0,0.5)
```

### The rhythm
**Every block inside the card separates by `margin-top: 20px`.** One number, no
exceptions except the name block at 15px, where the mark's circle carries its
own optical space. That single gap is most of why the stack reads as composed.

### Top row — `.header-top`, `justify-content: space-between`
```
share button    32px, radius 10, rgba(255,255,255,0.10)
social glyphs   28px, radius 8,  rgba(255,255,255,0.08), gap 6, glyphs WHITE
the mark        55px circle, 2px solid #9FA7FF, padding 2
```
The mark and the glyphs travel together at the inline end; the share button sits
alone at the inline start.

### Name — `.info`, `margin-top: 15px`, `text-align: right`
```
h1   19px / 700 / #fff            <-- SMALL. Not a headline.
p    12px / 400 / rgba(255,255,255,0.5), margin-top 4
```

### The image band — `.slider-section`
```
height:        170px  FIXED (not an aspect ratio)
border-radius: 20px
border:        1px solid rgba(255,255,255,0.1)
img            object-fit: cover
arrows         32px circle, rgba(0,0,0,0.5), opacity 0 until :hover
dots           6px, gap 6; active 18x6, radius 10, #9FA7FF
```

### Stats — `.stats`
```
ONE container: radius 20, rgba(0,0,0,0.2), padding 12, space-between
value  14px / 700 / #9FA7FF       <-- THE ACCENT, not white
label  10px / 400 / rgba(255,255,255,0.6)
```
No dividers, no per-cell borders, no per-cell background. A single recessed
strip, not three tiles.

### The one action — `.unified-btn`
```
height:        52px
border-radius: 18px
background:    rgba(255,255,255,0.08)
border:        1px solid rgba(255,255,255,0.10)
14px / 700 / #fff, gap 10, justify-content: CENTER
```
The glyph and the label are centred **as a group**. There is no reserved icon
column — a column exists to align glyphs down a stack of buttons, and there is
no stack.

### The shine — `.glass-shine-effect`
On the share button, the image band and the action:
```
::after  40% wide, 200% tall, rotate(30deg)
         linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)
         left: -100%  ->  :hover  left: 150%   over 0.8s
```

### Footer
`12px / 500, opacity 0.8`, centred, `margin-top: 20px`.

---

## What was built, 2026-08-28

The card above is now what `pages/index.js` renders. Verified in the browser on
real tenant data, in Arabic and English, at 375px and desktop.

### Two things in the original that were deliberately NOT copied

* **`letter-spacing: 0.5px` on the Arabic `h1`.** Arabic is cursive and tracking
  severs the joins between letterforms. design.md §10, and it is product law.
* **The share button.** It is a single-tenant affordance. That corner now holds
  the language switch, which needed a home and is the right kind of quiet.

### Two things the original does that the constitution overrules

* **No auto-advance.** The image band does not step itself. Motion on a timer,
  forever, communicates none of the four things motion may communicate
  (design.md §5), and it takes the choice of which piece leads away from the
  client, who ordered them.
* **No page-background or radius control.** Both were tenant settings and both
  are presentation, not content. f9designer's own site rendered lilac from edge
  to edge because `appearance.tokens.bg` had been set to the accent. Only the
  accent is still a tenant value.

### The banner concept is gone — "the slider IS the work"

Approved 2026-08-28. What used to be a separate `banners` array — promotional
images above the portfolio, which a visitor reads as the client's work when it
is not — is now the client's actual pieces, drawn from `projects` in the order
they chose. Tapping one opens it full size.

**This was safe to do because no tenant has a banner without also having
pieces** — checked against all seven before it was written, not assumed.

It also deleted the auto-appended "open my portfolio" button: the work is on the
card, so a button whose job was to go and find it has nothing left to do.

### Removed from the render, and live for someone today

Each of these still exists in the database. Nothing was migrated or deleted.

| Removed | Was live on | Why |
|---|---|---|
| The ticker | `designakum`, `roza` | A marquee. Loudest thing on a page selling calm, and it sat above the work |
| CTAs 2..n | `roza` (6), `alihabibfilms` (4), `designakum` (3) | A page with five equal asks has none. Contact is the icon row at the top |
| The admin setup nudge | any signed-in owner | The product talking to itself on a customer's site |
| `sections.projects` | `f9designer`, `designakum` | It was hiding the only real work on the platform. Sections appear from content |

## THE STAR RATING ALREADY EXISTED

`★ 4.9 / التقييم` is in the original, as a stat whose value is the literal
string `★ 4.9`. When Feras said *"just do a star value"* he meant **this** — not
a new control.

A "Type: Text / Star rating" dropdown was added to the stat editor on
2026-08-28 and **reverted the same day**: it built an admin control before the
design existed, which is the exact ordering this plan corrects. Whatever a stat
looks like gets decided in the design pass; the control follows.

## The order of work, decided 2026-08-28

1. **Finalise the portfolio's look**, against the reference above.
2. **Then** expose in `/admin` whatever turned out to be customisable.

Not the reverse. Building the control first is what produced settings nobody
could explain.

## Constraints that do not move

* `profile` / `projects` shape stays — this is a restyle, not a data migration.
* The public page reads `get_public_portfolio()`. Do not go back to reading the
  tables; anon cannot, by design (section-q).
* Arabic is a layout mode. No `letter-spacing` and no `text-transform` on Arabic
  — `tests/arabic-typography.test.mjs` enforces it.
* Adding Tajawal means a fifth font family on the critical path. The single
  `<link>` in `pages/_document.js` already requests four. Decide deliberately.
