# Linear

Studied for **opinion, speed, and treating state as vocabulary** — the closest
model for how the Console should feel to operate.

## What makes this product feel premium?

**Speed treated as a design feature, not an engineering metric.** Interactions
resolve instantly; the interface responds optimistically rather than making the
user watch a request. A product that never makes you wait feels expensive in a
way that no amount of visual polish achieves.

Second: it is **opinionated**. It has a view of how the work should be done and
does not hedge with configuration. Fewer options, better defaults, a coherent
whole.

## Layout principles

Persistent, shallow structure. A small number of destinations, always in the
same place, so navigation never becomes a decision. Dense but never cramped —
the density is legible because the type scale and the spacing rhythm are
strict.

Lists are the primary surface, and a list row is designed as a real component:
scannable, actionable in place, identical wherever it appears.

## Information hierarchy

**State is the organising principle.** Status, priority and assignment are
first-class, visible on the row, and encoded consistently enough that an
experienced user reads the list without reading the words.

Filtering and grouping are how you get a view, rather than a separate reporting
screen — you reshape the thing you are already looking at.

## Interaction patterns

**The keyboard is the primary interface**, with the pointer as the fallback.
The command palette puts the entire product one keystroke away, which removes
the need to surface everything in navigation.

Actions happen **in place** — change status from the row, not from a detail
page you had to open. Fewer round trips; the user's focus is never relocated to
perform a small edit.

## Motion principles

Short, functional, nearly invisible. Transitions confirm that a thing changed
and where it went. Nothing eases slowly enough to be perceived as an animation;
duration is treated as latency and minimised.

## Typography usage

One family, tight scale, heavy reliance on weight and colour-value contrast
rather than size. Small text used confidently and legibly, which is what makes
the density work rather than merely look tight.

## Colour usage

Neutral canvas, colour reserved for state and for the single primary action.
Because the canvas is quiet, a coloured dot carries real information at 8px.

## What should Designakum learn?

1. **Perceived speed is a design responsibility.** Optimistic UI, no spinner
   where a state change would do.
2. **Be opinionated.** Configuration is a design failure exported to the user.
3. **The list row is a first-class component** — design it once, reuse at every
   scope.
4. **Act in place.** The Console's attention queue should clear items from the
   row.
5. **A quiet canvas makes small colour signals readable.**
6. **State encoded consistently** becomes readable without reading.

## What should Designakum NOT copy?

- **Its density.** Built for people living in it all day; the Studio is visited
  briefly by someone who is not a power user.
- **Keyboard-first as the primary interface.** Our client is a creative
  freelancer on a laptop or a phone, not an engineer with shortcuts memorised.
  A command palette in the Studio would be ornament.
- **Its dark-first identity.**
- **Its vocabulary of engineering workflow** — cycles, triage, backlog. Ours is
  portfolio and publishing language, in two languages.
- **Its visual language**, which is strongly associated with developer tools —
  the opposite of the creative register we sell.
