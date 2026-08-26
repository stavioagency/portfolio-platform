# Designakum Design Constitution

**The rules every frontend decision is checked against.** Read this before any
significant UI work — then read only the one authority it routes you to.

This file is deliberately short. It does not restate the design system; it
states the law and points at the detail.

| You need | Read |
|---|---|
| Tokens, type scale, motion tokens, component specs, RTL rules | [`../ux/designakum-design-system-final.md`](../ux/designakum-design-system-final.md) + `styles/globals.css` |
| What exists today, and why it feels generic | [`../ux/designakum-ux-context.md`](../ux/designakum-ux-context.md) |
| Studio structure, the user journey, the five design laws | [`../product/designakum-blueprint.md`](../product/designakum-blueprint.md) |
| Console structure, attention queue, operator vocabulary | [`../product/console-blueprint.md`](../product/console-blueprint.md) |
| How to run a design task | [`.claude/skills/frontend-design/SKILL.md`](../../.claude/skills/frontend-design/SKILL.md) |
| Why a reference product works | [`references/`](references/) |

---

## 1. Product identity

**Designakum is a premium portfolio platform for Arab creative freelancers.**
The client brings the work; Designakum provides the structure, the presentation
and the publishing.

> Bring your work. Have a portfolio you are proud to send, in an afternoon.

**Designakum is not** Wix, Webflow, WordPress, Squarespace, a CMS, a page
builder, a dashboard product, or a settings panel with a logo on it.

The line that decides every feature request:

> The client controls **content and emphasis**. Designakum controls
> **structure and presentation**.

The feeling to produce is *"I created something professional"* — never
*"I configured software."* If a screen makes the user feel like an operator of
software rather than the author of their own work, it has failed regardless of
how it looks.

**The product is the frame, never the picture.** The customer's portfolio is
the beautiful thing. Our interface is what makes it effortless.

---

## 2. Design principles

Every element on every screen must answer: **why does this exist?** If the
answer is "it looked empty" or "other products have one", delete it.

1. **One screen, one question.** If a screen needs two leads, it is two
   screens. Name the question in the screen's own eyebrow.
2. **Remove decisions, not capability.** A small set of good choices beats
   infinite mediocre ones. Every option offered is a decision charged to the
   user; charge only for the ones they actually want to make.
3. **Confidence over comprehensiveness.** Show the one right next action, not
   everything that is possible. Depth is reached, not displayed.
4. **Whitespace is structure, not leftover.** Space separates and groups; it is
   how hierarchy gets built before a border or a card is considered.
5. **Calm.** The interface should be quiet when nothing is wrong. The absence
   of alarm must be as legible as alarm.
6. **Premium is restraint.** It comes from spacing, typography, hierarchy and
   exactness — never from ornament, depth effects or motion.
7. **Numbers are sentences.** A figure arrives with a noun and a qualifier.
   Never a bare `12`.
8. **Summaries are navigation.** Reading and acting are one gesture. Never
   report something the user then has to go find.
9. **Every state names its exit.** Stuck things say what clears them. Empty
   regions say what they mean. Absent values are worded, never blank.
10. **Arabic is the home register.** RTL is a real layout mode, not a mirror.
    Latin numerals in both locales. No letter-spacing and no uppercase on
    Arabic.
11. **Arabic never addresses the client with a gendered verb.** Arabic verbs
    aimed at a person carry gender — «انشري» speaks to a woman, «انشر» to a
    man — and the product collects no gender, nor should it. Copy is written
    in neutral, state-based phrasing: a verbal noun instead of a command
    («النشر»), a statement of state instead of an instruction («هذه التغييرات
    ظاهرة لك فقط»), the passive where it reads naturally («لم تُراجَع بعد»).
    A masculine default is not an acceptable shortcut. Enforced by
    `tests/studio-arabic-voice.test.mjs`.

---

## 3. Visual language

Full specification in
[`../ux/designakum-design-system-final.md`](../ux/designakum-design-system-final.md).
The governing rules:

**Colour.** One brand blue, `#2A6BCE`, derived through `color-mix()` from a
single token. **No raw hex outside the token block.** Blue means *act here* and
nothing else — informational states are grey, never blue. Amber is reserved for
things that are time-bounded *and* actionable; if the user cannot act on it, it
is grey. Light is the theme to perfect first; dark must work, not lead.

**Typography.** Manrope for Latin UI. Reem Kufi for Arabic display only
(headings, eyebrows); IBM Plex Sans Arabic for Arabic body. Hierarchy comes
from size, weight and space — not from colour and not from borders.

**Spacing.** Every value from the scale. Generous and consistent beats tight
and clever. Where the current admin uses a border to separate, the redesign
uses space.

**Density.** Low. The client visits for ten minutes a month, not eight hours a
day. Fewer, larger, more decisive surfaces.

**Components.** Flat. The mark is flat, so the product is flat: no gradients,
no glows, no fake depth, no shadow used as decoration. A card must earn itself
(§4). Build on `components/ui/` primitives; do not invent a second button.

---

## 4. Forbidden patterns

These are rejections, not preferences. Each has a reason.

| Forbidden | Why |
|---|---|
| **A card around everything** | A card is a boundary. Boundaries used decoratively stop meaning anything, and the screen becomes a grid of equal weights with no lead |
| **Dashboard overload** — tiles, charts and counters as the home screen | The owner's home is what needs a human today; the client's home is reassurance. Neither is a metrics wall. Four summary figures is the ceiling |
| **Settings sprawl** | Every setting is an unanswered design question pushed onto the user |
| **Technical language reaching a client** | tenant, slug, workspace, environment, entitlement, RLS, `past_due`, comped, `published_at` — never. The Console may use real words; the Studio never does |
| **Schema words that sound friendly** | "projects" is the table, not the product. Client-facing copy says **work** (collective) and **piece** (singular). The same trap applies to "revisions", "records" and "items" |
| **A preview that is not the real thing** | No thumbnail, screenshot or mock card standing in for the portfolio. The preview is the real renderer on draft data — typography, spacing, responsive and RTL behaviour all genuine |
| **Too many options presented at once** | See principle 2. Progressive disclosure, and only what is rarely wanted gets collapsed |
| **Decorative gradients, glows, ambient background motion** | The brand is flat and retired its gradient tokens |
| **Motion without meaning** | §5 |
| **Emoji as iconography, confetti, bounce, wobble** | Designakum is an instrument, not a toy |
| **Copying a trend** | If you cannot state which principle it serves here, it is costume |
| **A CRM shape for the Console** | It manages a platform, not a sales pipeline |
| **Redesigning the client's public site** | `/` and `/{slug}` are the customer's brand, not ours |
| **Hiding a control as a security measure** | RLS is the boundary. UI never is, and must never be described as one |

---

## 5. Motion principles

Motion exists to communicate one of four things. If it communicates none of
them, remove it.

1. **Feedback** — the system received the input.
2. **Progress** — something is happening and roughly how far along it is.
3. **Transition** — where this came from and where it went.
4. **Relationship** — this panel belongs to that row; this detail expanded from
   that summary.

Tokens (`--t-ui`, `--t-press`, `--t-enter`, `--ease-*`) are specified in the
design system. Rules:

- Things **travel and settle.** Nothing loops, nothing pulses, nothing idles.
- **The Console never celebrates.** No overshoot anywhere in the operator
  product — a tool that congratulates itself on its own list is a tool you stop
  trusting. Overshoot is reserved for the Studio's one activation moment.
- **Motion is a cost paid on every visit.** In a tool people use daily, the
  right amount is nearly invisible.
- **`prefers-reduced-motion` is honoured**, and the reduced path must still
  communicate the same four things through instant state change.

---

## 6. The two products

They are different products with different jobs and must never share a screen.

### Console — the operator's product

The question it answers: **"What needs my attention?"**
Not: a metrics dashboard, not a CRM.

An empty Console is the goal. Every attention group defines itself and names
what clears it. Precision beats gentleness here; real vocabulary is allowed.

### Studio — the client's creative workspace

The question it answers: **"Help me create and refine my portfolio."**
Not: a website builder.

The shape of the experience:

1. The client gives identity, profession, work.
2. **The first draft is created for them** — they never start from nothing.
3. They choose a direction from a small set of good ones.
4. The Studio opens on something already beautiful.
5. They refine, see changes live, and publish with confidence.

Explicitly not: a canvas, drag-and-drop layout, a page tree, custom CSS,
plugins, unlimited theming, or endless settings.

**Publishing is staged: edit → draft → preview → publish.** Editing changes the
draft; visitors see the published state until the client promotes it. The
client can always see changes before visitors do. A count of pending changes
never appears at rest — it belongs to the publish confirmation. Blueprint §8.5.

**The preview is the real portfolio renderer on draft data**, in its own
document, never a picture of the portfolio. The renderer takes data and nothing
else, so the same component can serve draft data to the Studio and published
data to visitors — which is where this is going, not where it is today: the
public site still runs its own implementation until the new renderer is
feature-complete and approved for shipping. **One renderer means one final
shipped renderer, not premature extraction of a legacy implementation**
(blueprint §8.2a). This holds at component level too: home and editor share one
preview component at two sizes.

**The client's model is a true projection of the operator's — simpler, never
different.** The Studio may hide a fact; it may never contradict one.

---

## 7. Review gate

No UI work is finished until it has been critiqued in writing against these,
and the findings fixed:

- Does this feel **premium** — through restraint, or only through decoration?
- Is anything here **unnecessary**? What can be deleted without loss?
- Is the **hierarchy obvious** at a glance, before reading?
- Is the user doing **work the product should have done**?
- Does it feel like a **product**, or like a dashboard and a settings panel?
- Does it respect the **forbidden patterns** list, honestly?
- Does it work in **light and dark, Arabic and English, mobile and desktop,
  and by keyboard**?
- Does every value come from a **token**, and did it add **no dependency**?

## 8. The quality bar

Compare against Apple, Linear, Framer, Stripe and Lumetra — for **quality, not
appearance.** Never clone their visual language; take the principle and let it
come out looking like Designakum. Analyses live in
[`references/`](references/).

Three questions before anything ships:

> Would a premium company ship this?
> Would this be obvious to a first-time user?
> Does this reduce effort?
