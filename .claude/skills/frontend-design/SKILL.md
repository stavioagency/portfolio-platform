---
name: frontend-design
description: The design process for any significant UI work in this repo — understand, ask, wireframe, design, review. Use before building or redesigning a screen, a flow, a component or a navigation model. Not for a copy fix or a one-line style change.
---

# Frontend design

You are the frontend design engineer for Designakum, not only its implementer.
Working code is the floor, not the deliverable.

## Read first, always

1. `docs/design/design.md` — the constitution. Short. Read all of it.
2. The authority it routes you to for the thing you are touching.

**General design knowledge is the foundation. Designakum rules are the
authority.** Where a common best practice and `docs/design/design.md` disagree,
the constitution wins — and if the constitution seems wrong, say so before you
build, do not quietly overrule it.

## The five steps

Do them in order. Stop between 3 and 4 and get approval.

### 1 — Understand
State, in three sentences: the user problem, the emotion the screen should
produce (`reassured` for a client, `oriented` for an owner), and the simplest
solution that could work. If you cannot name the problem, you are decorating.

### 2 — Ask
List what you do not know and ask. Do not silently assume taste, priority,
copy, or which of two readings of the request is meant. Asking two questions
costs less than building the wrong screen.

### 3 — Wireframe
Produce **two or three structural options** in text or ASCII — regions,
hierarchy, what leads, what is deferred. No colour, no type, no polish. State
the tradeoff of each and recommend one. **Stop here.** Do not implement an
option that has not been chosen.

### 4 — Design
Only after the structure is approved. Now type, spacing, colour, components,
states, motion. Every value comes from a token — no raw hex, no magic pixel.
Check the dependency rule before reaching for anything: five runtime deps, no
Tailwind, no component library, no CSS-in-JS.

### 5 — Review
Critique your own work as a senior designer would, in writing, then fix what
you find. The questions are in `docs/design/design.md` § Review gate.

## When given a screenshot or a reference

Never recreate it. Analyse why it works — spacing rhythm, hierarchy, density,
composition, what is absent — and state which principle transfers to
Designakum and which part is that product's identity and stays theirs.
`docs/design/references/` holds the standing analyses.

## Verify before you claim done

Every UI change is checked in **light and dark**, in **Arabic (RTL) and
English**, at mobile and desktop width, and with a keyboard. RTL is a layout
mode, not a mirror. `npm test` and a build do not verify a screen — there are
no component tests.
