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

Read out of the running page, not eyeballed.

### Page
```
background: linear-gradient(#050507 0%, #0a0a14 55%, #6a70ab 100%)
font-family: Tajawal, sans-serif
```
A violet glow rising from the bottom of an almost-black page. The current build
is flat dark with no gradient, and uses Manrope / Cairo / Reem Kufi — **Tajawal
is not currently loaded at all.**

### The card — `.main-container.card-section`
```
width:         330px          (narrow, and that is the point)
border-radius: 35px           (current build: 14–20px)
padding:       25px
background:    rgba(255,255,255,0.05)
border:        1px solid rgba(255,255,255,0.08)
box-shadow:    0 25px 50px rgba(0,0,0,0.5)
```

### Structure, top to bottom
1. **Icon row inside the card** — share button at one end, social glyphs and a
   circular brand monogram at the other. Contact lives at the TOP, as icons.
2. **Name**, large. **Subtitle** under it: `F9 Designer | مصمم جرافيك`.
3. **Banner** with carousel arrows (`❯ ❮`, 50% radius, `rgba(0,0,0,0.5)`).
4. **Stats row, three cells:** `لا / متفرغ` · `+300 / الأعمال` · `★ 4.9 / التقييم`
5. **ONE call to action** — `تواصل معي عبر واتساب`, WhatsApp glyph, full width:
   ```
   border-radius: 18px · background: rgba(255,255,255,0.08)
   color: #fff · 14px / 700
   ```
6. **Footer** — one copyright line.

### What the current build does differently
| | Original | Current |
|---|---|---|
| Card width | 330px | wider |
| Radius | 35px | 14–20px |
| Font | Tajawal | Manrope / Cairo / Reem Kufi |
| Page | violet gradient | flat dark |
| Contact | icons at the top | three stacked buttons at the bottom |
| CTAs | exactly one | up to three, plus a links row |

**The three stacked buttons are the biggest visual difference** and the likely
source of "hot mess": the original had ONE thing to press.

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
