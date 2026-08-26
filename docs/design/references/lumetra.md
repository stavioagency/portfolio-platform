# Lumetra

The nearest structural analogue to the Console: an operations product for a
small team managing a portfolio of client relationships.

**A full principle-by-principle translation already exists** in
[`../../product/console-blueprint.md`](../../product/console-blueprint.md) §4,
with the exact UI decision each one forces. This file holds the reasoning
behind it; that file holds the commitments. Read this to understand, that to
implement.

## What makes this product feel premium?

Not polish — **appropriateness.** It behaves like a tool built by someone who
does the job, so nothing is present that an operator would not want on the
tenth visit. Premium here reads as *nothing is wasting my time*.

## Layout principles

The daily screen is the useful screen. There is no ceremonial home page that
reports state you must then navigate to act on — reading and acting are the
same gesture.

The client record is **one scrolling page, not tabs**, because at their scale
everything fits and a click is a real cost. Only the rarely-wanted block —
technical detail — collapses. This is scale-dependent reasoning, and it applies
to us for the same reason: fourteen clients, not fourteen thousand.

## Information hierarchy

**Attention is the scarce resource, and the product names it.** The primary
screen is not organised by data type but by *what is waiting on a human*.
Success is defined as an empty screen. That inverts the usual dashboard
instinct, where a full screen looks like value.

Cognitive load is reduced by reusing the same components at two scopes — all
clients, and one client. Learning one screen teaches the other, and the
component count halves.

## Interaction patterns

Roles are **separate dashboards, not a runtime conditional.** Entering a
client's context replaces the entire product, and the fact that you are in
someone else's context is marked more than once, persistently. The operator is
never uncertain which product they are in.

The client-facing projection is *simpler* than the internal one, never
different: internal stages collapse, but nothing is invented and nothing
contradicts.

## Motion principles

Very little, and invisible until you look for it. In an operations tool motion
is a cost paid on every single visit, so the budget is spent almost nowhere.

## Typography usage

Text does the work that chrome does elsewhere. States carry a definition **and
an exit condition** — a state that names what clears it cannot decay into
wallpaper. Absence is worded: "no sign-in", "nobody assigned yet". A blank cell
is a bug you cannot see.

## Colour usage

Colour is a signal, not a surface treatment. It marks state and little else,
which is what keeps a state legible at a glance.

## What should Designakum learn?

1. **The home screen is the attention queue.** Empty is the goal, and it says
   so in words.
2. **Every state defines itself and names its exit.**
3. **Human vocabulary, never schema.** The words are the product's model of the
   world; a schema word forces the reader to translate.
4. **One component, several scopes.** Fewer things to learn, fewer to maintain.
5. **Role separation is structural**, not conditional rendering.
6. **Meaningful empty states everywhere.** Absence is information.
7. **Progressive disclosure by frequency** — collapse only what is rarely
   wanted.

## What should Designakum NOT copy?

- **Its density.** Their operator lives in the tool eight hours a day; our
  client visits for ten minutes a month.
- **Its dark-first palette and four themes.** We sell a premium creative
  product; light is the theme to perfect first.
- **Its boot theatre and demo-data mode.** For us an empty workspace is a real
  and common state — that effort belongs in first-run instead.
- **Its visual identity, entirely.** Recolouring Designakum into their maroon
  should produce something obviously not Designakum.
- **Its all-operator worldview.** Half our product is a *creative* workspace,
  where calm and restraint alone would read as cold.
