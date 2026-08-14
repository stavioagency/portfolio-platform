# Designakum — UX Architecture Blueprint

**Written 2026-08-14, before any implementation.** It is the deliverable
`docs/ux/designakum-ux-context.md` §10.4 asks for: role separation, information
architecture, navigation model, key screens, design-system direction and a
sequenced roadmap — checked against the dependency rule.

**This document proposes. It does not describe what exists** — for that, read
the context handoff. Where a recommendation would touch RLS, entitlement,
billing or the tenant resolver, it is called out as its own decision and not
smuggled in as a UX change.

Two conventions used throughout:

- **[CONFIRMED]** — verified against the code or the docs in this session, with
  the file named.
- **[PREFERENCE]** — a design judgement. Arguable, and the owner is the
  authority on taste.

---

## 1. Product vision

### What the product is

Designakum sells a **professional presence**, not a website builder. The
customer is an Arabic-speaking creative freelancer who wants to be findable and
credible, and who does not want to operate software to get there.

The platform around that presence has exactly two jobs, and they belong to two
different people:

> **A client comes here to make their presence better.**
> **An owner comes here to keep the business healthy.**

Every screen in the redesign should be answerable to one of those two
sentences. A screen that serves both is the bug this redesign exists to fix.

### The design thesis

Three principles, in priority order. When they conflict, the earlier one wins.

**1. Objects, not tables.** An owner should operate on *a client* — a person
with a site, a plan, an address and a history — not on rows scattered across a
Sites screen, a Subscribers screen and a Workspace tab. A client should operate
on *their page*, not on `profile`, `card`, `links` and `appearance` as four
separate records that happen to render together.

**2. State before controls.** The current dashboard leads with editors. The
redesign leads with *status* — is my site live, is it complete, is anyone
visiting, am I paid up — and puts the editor one deliberate step behind it. This
is the whole difference between "a settings panel" and "a product", and it is
what the founder is describing when they say the product feels generic.

**3. Show the money, quietly.** The single largest confirmed gap in the product
is that **money is silent** — no receipt, no renewal notice, no failed-payment
warning [CONFIRMED: `docs/ux/designakum-ux-context.md` §4]. A premium product is
one where the customer never wonders what they were charged or whether it
worked. Half of "premium" here is not visual at all.

### What premium means here, concretely

Not gradients and glass. In this product, premium is:

- **Fewer, larger, more decisive surfaces.** One page answers one question.
- **Typography doing the hierarchy work** instead of borders and boxes. The
  current scale tops out at 26px [CONFIRMED: `styles/globals.css`], which is why
  nothing on a page can lead.
- **Imagery present.** A portfolio product that never shows the customer their
  own work in the dashboard is failing at its own pitch.
- **Real Arabic.** RTL as a layout mode, no letter-spaced or uppercased Arabic,
  Latin numerals in both locales.
- **Nothing technical leaking.** Not slug, not username, not tenant, not
  workspace, not environment — to a client, ever.

---

## 2. Current UX audit

### 2.1 Route and role map, as it stands

| Route | Serves | Role |
|---|---|---|
| `/` | owner's own public portfolio | public |
| `/{slug}` | a client's public portfolio | public |
| **`/admin`** | **owner administration AND client dashboard** | authenticated |
| `/signup`, `/signup/verify` | self-serve signup | public |
| `/subscribe` | checkout (not public) | authenticated |
| `/reset-password` | password reset | public |
| `/privacy`, `/terms` | legal | public |

[CONFIRMED: `pages/`]

`pages/admin.js` is **6,552 lines** and contains both products. `pages/index.js`
is 1,551 lines and renders every public site. Together they are ~79% of the
application's page code [CONFIRMED: `wc -l pages/*.js`].

### 2.2 Confirmed technical problems

These are facts about the code, not opinions about it. Each is independently
actionable.

**P1 — The role split is a runtime conditional, not a structure.**
`Dashboard` holds `isOwner` and `activeTab` in local state and renders one of
twelve editors by `&&` chain [CONFIRMED: `pages/admin.js:1094-1105`]. Six of the
twelve lines carry an explicit `isOwner === true` or `isOwner === false` guard.
The information architecture is therefore an expression, not an artefact —
except in `lib/admin-nav.js`, which is the one place it exists as data.

**P2 — Nothing in the dashboard is linkable.** Tab state is internal. There is
no `/admin/projects`, no deep link to a client record, no shareable URL for
anything. Consequences: no bookmarks, no back button, no "look at this client"
link between the two owner accounts, no way for an email to land a customer on
the screen it is talking about — which is a precondition for the billing emails
in §7.

**P3 — Owner administration is spread across three places for one object.**
Sites (`OwnerClientsOverview`), Subscribers (`SubscribersOverview`) and the
Workspace tab (`TenantAdminSection part="settings"`) each hold part of the same
client. `lib/admin-nav.js` documents the reasoning — Subscribers "answers a
different question … read at a different time" — and that reasoning is sound for
a *list*. It does not hold for the *record*: an owner asking "what is going on
with Layla" currently visits three screens.

**P4 — Owner-as-client is unlabelled impersonation.** Opening a client from
either list runs `switchTenant(id); navigate('profile')`
[CONFIRMED: `pages/admin.js:1095-1096`]. The owner is now inside the client
editor, with no persistent indication that these are somebody else's words about
themselves. This is the mechanical root of "confusing admin/client separation".

**P5 — Onboarding asks for platform vocabulary.** The invite form collects a
workspace **slug** and a **username**
[CONFIRMED: `pages/admin.js:3198-3240`, `TenantAdminSection`]. Both are
permanent, collision-prone and meaningless to the person being onboarded. The
code already knows this — the comment says slug is derived from the name "so the
common case is two fields, not four" — but the field is still labelled and
errored in slug language ("That slug is reserved — pick another").

**P6 — Credential relay is manual and the resend is destructive.** The owner
reads a generated password off screen and passes it on. `send_welcome` silently
invalidates a working password [CONFIRMED: `docs/features/planned.md` §6].

**P7 — Money is silent.** No billing emails of any kind exist. Every trigger is
already recognised by the webhook [CONFIRMED: `docs/ux/designakum-ux-context.md`
§4]. This is the highest customer-visible gap in the product.

**P8 — Entitlement is invisible until it refuses.** Writes are gated by
`can_edit_tenant()`; reads are not. So an unentitled client browses a fully
interactive editor and discovers the truth when a save fails
[CONFIRMED: `docs/architecture/database.md` §3].

**P9 — Sandbox and live subscriptions are indistinguishable to an owner.**
`environment` is not surfaced in the Subscribers list, and both live
subscription rows are currently `pending`
[CONFIRMED: `docs/ux/designakum-ux-context.md` §4, §8].

**P10 — The application's accent colour is not the brand colour.** The brand is
royal blue `#2C6FE0`. `grep` finds it in **every email template and in the docs
— and in no application CSS at all**. The app ships `--accent: #9FA7FF` (dark),
`#4f57d8` (light) and a `#6d86ff → #4f6ef2` button gradient
[CONFIRMED: `styles/globals.css`; `grep -rni 2c6fe0`].

> This inverts a recorded finding. The handoff lists "two signup emails are
> off-brand (`#4f6ef2`)" — but `#4f6ef2` is precisely the app's own button
> gradient token. Those two emails are not off-brand relative to the product;
> **the product is off-brand relative to the brand.** Fixing the emails without
> fixing the tokens would make the inconsistency worse. This is one token
> change, and it is the cheapest premium-feel win available.

**P11 — Emoji are load-bearing in the client's first screen.** `ClientHome`
renders its four quick actions as `👤 📁 🎨 🌐`
[CONFIRMED: `pages/admin.js:3905-3910`] while a 173-line `components/ui/Icon.js`
sits unused for exactly this. Emoji render as a different typeface at a
different weight on every platform, and they are the single most "not premium"
element on the screen a customer sees first.

**P12 — Ad-hoc RTL correctness.** `.ch-label` carries a hand-written
`html[dir="rtl"] { text-transform: none; letter-spacing: normal; }` override
[CONFIRMED: `pages/admin.js`]. The rule is right; being written per-component is
how it eventually gets forgotten. There is no shared eyebrow/label primitive.

**P13 — Styling is invariant-bound.** Every editor must wrap in
`<div className="editor">` and mount `<AdminStyles />` or it renders as unstyled
native controls [CONFIRMED: `docs/architecture/overview.md` §4]. Any component
extraction must preserve this or it will look like a broken page.

### 2.3 UX preferences and opportunities

Not defects. Judgement calls, listed separately so the roadmap can drop any of
them without breaking anything.

- **[PREFERENCE]** Five client editors (Profile, Card, Projects, Links,
  Appearance) is a database-shaped division. A client thinks in "about me", "my
  work", "how it looks" — three things, not five.
- **[PREFERENCE]** "Overview / Home / Home Page" needed a code comment to
  disambiguate [CONFIRMED: `lib/admin-nav.js:38-41`]. When naming needs a
  comment, the naming is the problem.
- **[PREFERENCE]** Analytics is a numbers screen. For this audience it should
  answer "is anyone looking at my work, and which work" — closer to a feed than
  a dashboard.
- **[PREFERENCE]** No first-run state exists as a designed thing. A brand-new
  portfolio is empty, and that emptiness is the first impression.
- **[PREFERENCE]** The owner has no "how is the business doing" screen at all.
  There is a list of clients and a list of subscribers, and no top.

### 2.4 What is already good and must survive

Worth stating, because a redesign destroys these by accident.

- **`lib/admin-nav.js`** — IA as pure, unit-tested data. The correct place to
  express the new structure, and the reason this redesign has a cheap first step.
- **The billing status vocabulary.** `deriveBilling()` produces one state
  (`past_due`, `pending`, `canceling`, `comped`, …) consumed by the list, the
  filters, the tiles and the CSV [CONFIRMED: `pages/admin.js:5601-5606`]. That
  is a design system already, in the hardest domain. Extend it; do not restate it.
- **Honest empty and loading states.** The skeleton-instead-of-em-dash reasoning
  in `ClientHome`, the "could not load ≠ zero revenue" distinction in
  `SubscribersOverview`. This is craft, and it should set the bar.
- **`PreviewPane`** — a live iframe of the real public site, with editors
  deliberately unaware it exists. Keep that ignorance.
- **Bilingual content as JSONB `{ar, en}` with one shared language toggle.**

---

## 3. Reference portal insights — Lumetra teardown

**Audited 2026-08-14, inside the authenticated portal**, signed in as `Feras`,
role **Owner**, on `portal.lumetraadvisors.com` (v5.2). Screens reached: Board,
Clients, one client record (Ali Habib), Team, Finance, Attention, Activity, the
Settings modal, the account menu, and — through the account menu — a **client**
dashboard and its Updates screen. Read-only throughout: nothing was created,
moved, assigned or deleted. Every observation below was seen on screen.

**What Lumetra is, so the comparison stays honest.** It is an internal
production portal for a video agency: an owner runs jobs through stages, editors
pick work up, clients watch their videos progress. It is **not** a self-serve
SaaS. That mismatch matters in one place only — §3.6 — and is stated there
rather than papered over.

### 3.0 The single most valuable artefact: their changelog

The portal opened on **"9 updates while you were away"** — a versioned,
in-product release log, newest first, written in plain English, reachable any
time from Settings → *What's new*. It is not a marketing feed; it states design
*decisions* and the reasoning behind them. Six that matter here:

| Version | The decision | The reasoning, as they state it |
|---|---|---|
| v5.2 | Brand red and alarm red split into two values | "A colour that is always on cannot mean *look here*" |
| v5.0 | "Summary on white, work on dark" | Every screen is two things stacked — a summary band and the work itself |
| v4.9 | Deleted a "Momentum" metric; gave money its place on the board | The board is the overview of everything; a vanity metric was occupying it |
| v4.8 | Status colours split into a **fill** and an **ink** | A colour bright enough to fill a bar is not readable as text |
| v4.6 | "One box per screen is not the same as the others" | Six identical panels read as six of the same thing, with nowhere to look |
| v4.5 | Two colours app-wide: **blue = work in flight, red = needs a decision, everything else is ink** | The old blue "was so grey it failed to read as a colour at all" |

**Why it works.** Publishing the reasoning forces the reasoning to exist. Three
of the six entries above are *removals* or *restrictions* — that is what a
disciplined system looks like from the inside.

**What Designakum borrows.** Not a changelog UI. The **habit**: when a design
rule is decided, write the one sentence that justifies it. This repo already
does this well in code comments (`lib/admin-nav.js` explains why Subscribers is
its own screen); the design system should be held to the same standard.
**Frontend only** — and mostly documentation, not code.

---

### 3.1 Dashboard / home screen — the Board

**What it does.** A pinned header (eyebrow `ALL CLIENTS` · title **Board** ·
`⌘K` search · one red primary action `+ New video` · avatar). Then a dismissible
tip. Then **four summary tiles**, then three analysis cards, then the pipeline.

The four tiles are phrased as **questions, not metric names**:

| Tile | Reads | Footer |
|---|---|---|
| NEEDS YOU | **1** job is stuck | "1 already overdue · oldest first on the triage screen" |
| NEXT SEVEN DAYS | **9** jobs land | "1 already past its date" |
| THE MONEY | **$15** left over, a month | "1 of 2 payments in" |
| WHO IS CARRYING IT | **1** editor working | "8 waiting in the hub with nobody on them" |

Each tile is a **button** — their accessible names are literally "Open the
triage screen", "Open the finance screen", "Open the team screen".

**What the user understands in five seconds.** One thing is wrong and it is
overdue; nine things are due this week; the business barely broke even; one
person is carrying everything. That is a complete situational read, and it is
four numbers.

**Why it works.**
- **Number + noun phrase, not number + label.** "1 job is stuck" is a sentence
  with a subject. "Stuck jobs: 1" is a database field. The first is understood
  without being parsed.
- **Every tile has a footer that qualifies the headline.** The big number is the
  hook; the small line is the truth ("1 of 2 payments in" is why $15 is not a
  cause for celebration).
- **Summary tiles are navigation.** Reading and acting are the same gesture.
- **The odd box out.** `NEEDS YOU` is rendered on a lighter surface with red
  accents while its three siblings are dark. Their v4.6 note names the rule:
  identical panels give the eye nowhere to land.

**What Designakum borrows.** My §5.1 attention queue is right in intent but too
plain. Replace it with **three or four question-tiles above the queue**, each
navigable, each with a qualifying footer — for an owner: *who needs you* (failed
payments, stalled handovers), *what is renewing*, *what is coming in*, *who is
live*. And exactly one tile visually distinguished.

**Cost.** **Frontend only.** Every number is already computable from
`tenants`, `subscriptions` and `tenant_domains`. Making tiles navigable requires
the Phase 1 routes and nothing else.

---

### 3.2 Navigation

**What it does.** A fixed sidebar, brand block at top reading **`LUMETRA` /
`OWNER`** — the wordmark carries the role. Two groups:

```
  Board       21          ← counts as badges
  Clients      6
  Team         1
  Finance
  KEEPING TRACK           ← the only group label
  Attention    1          ← badge turns red when non-zero
  Activity
  ⋯
  Settings
  Sign out
```

Four naming decisions worth stealing:

1. **Nouns from the business, never from the schema.** Board, Clients, Team,
   Finance, Attention, Activity. No "Management", no "Dashboard", no "Records".
2. **"Keeping track" as the second group's name** — it says what the group is
   *for*, not what it contains.
3. **"Attention" over "Alerts" or "Issues".** It names the resource being spent.
4. **The page title carries a contextual eyebrow that changes per screen**:
   `ALL CLIENTS / Board` · `OVERVIEW / Clients` · `CLIENT / Ali Habib` ·
   `THE COMPANY / Finance` · `NEEDS A DECISION / Attention` ·
   `EVERYTHING THAT HAPPENED / Activity`. The eyebrow is simultaneously a
   breadcrumb, a scope indicator and a definition.

**How roles are handled — the most important finding in this audit.**

Roles are **separate dashboards**, not a conditional inside one. The account
menu holds:

```
  Feras · Owner
  Settings & themes
  Test look
  Download a backup
  Sign out
  ─────────────────────
  OPEN ANOTHER DASHBOARD
    OWNER    Murtaza · Adem
    EDITOR   YASH RAO
    CLIENT   Lumetra Marketing · ALIYY · Ali Habib ·
             Averra Cafe & Diner · Grow media · Kenny Construction
```

Opening a client dashboard **replaces the entire product**: the sidebar drops
from six destinations to three (`My videos`, `Send footage`, `Updates`), the
brand block reads `LUMETRA / CLIENT`, the primary action changes from "New
video" to "Send footage", and the header eyebrow becomes that client's own
descriptor ("NATURE INSTAGRAM CONTENT / My videos").

Impersonation is marked **twice**: a quiet "Viewing as Ali Habib · read only"
near the header, and a persistent floating pill at the bottom of the viewport —

```
        Ali Habib's dashboard
        You are Feras · read only          [ ← Leave ]
```

Leaving confirms with a "✓ Back to your dashboard" toast.

**Why it works.** The role question is answered structurally rather than by
hiding controls. "Open another dashboard" is honest about what is happening,
grouped by role so the operator knows *what kind* of thing they are entering,
and the read-only framing sets expectations before the first click. The exit is
always on screen — impersonation cannot be entered and forgotten.

**What Designakum borrows.** This validates the §4.3 rule and the
`OperatorBanner`, and improves both:

- Make it **"Open another dashboard"**, listed and grouped by role, not a tenant
  switcher dropdown. An owner picks *Layla's workspace*, not a row.
- **Two indicators, not one** — one in the chrome, one persistent and floating
  with the exit inside it.
- **Consider read-only as the default** operator mode, with editing a deliberate
  second step. Designakum's owners genuinely do need to edit client sites, so
  ours cannot be read-only-only — but *entering* read-only and choosing to edit
  is a better default than landing inside someone's profile editor.
- Put the **role in the brand block**: `Designakum / Owner` vs `Designakum / …`
  — for a client, show nothing, since a client has no other mode to be confused
  with.

**Cost.** **Frontend only.** RLS already permits owners on every tenant via the
Section F trigger; `is_tenant_admin()` remains the authority. This changes the
labelling and the entry point, not the permission. Read-only operator mode
*would* be backend work if enforced server-side — as a UI default it is not, and
it must not be described as a security boundary.

---

### 3.3 Client management

**The list.** A grid of client cards: logo, name, one-line descriptor, then
three facts with icons — *N being worked on*, *N finished*, and either assignee
avatars or the words **"nobody assigned yet"**. A red `⚠ 1` badge sits in the
corner of any client that needs attention. Actions are a full-width **`Open →`**
plus two icon buttons (edit, delete). The grid ends with a dashed **"Add a
client"** ghost card.

**The record.** `CLIENT / Ali Habib`, with a `← All clients` back affordance
above it. Then, in order:

1. **Record header** — avatar, name, "Nature instagram content · client since 3d
   ago", assigned editor's avatar, and actions `+ New video`, `Edit`, delete.
2. **Four summary tiles on a light surface** — VIDEOS 12 · BEING WORKED ON 12 ·
   FINISHED 0 · NEEDS ATTENTION 1 (red). Same component as the Board's, rescoped
   to one object.
3. **Master document row** — an external doc as a first-class object, with
   `Open`, `Copy the document link`, and edit.
4. **The engagement brief** — a four-column panel with chip headers: `PAYMENT`
   ($1,250 a month · due on the 14th · 3 months · chip "$1,250 outstanding") ·
   `WHAT IT COSTS US` · `THEIR GOALS` · `LUMETRA DOES`. Beneath it, a pinned
   objective: *"we want ali nature doing 7-10k views average per post"*.
5. **The same Work-by-stage / On-time / Who-has-what cards** as the Board,
   filtered to this client.

**Why it works.**
- **One object, one URL, everything.** Commercial terms, delivery state, the
  working agreement and the numbers are on one page. Nobody has to remember
  which of three screens holds the answer.
- **The same components at two scopes.** Board = all clients; record = one
  client. Learning the dashboard teaches you the record for free, and it halves
  the component count.
- **The commercial relationship is content, not a table.** `THEIR GOALS` and
  `LUMETRA DOES` are free text. A CRM would have made these fields and lost the
  nuance; here the panel is a brief you could hand to a new employee.
- **Absence is worded.** "nobody assigned yet", "no sign-in", "No footage link
  yet" — never a blank, never a dash.

**What Designakum borrows.**
- §5.2's client record is confirmed. **Change one thing:** I proposed six
  *panels* (Overview / Site / Subscription / Access / Domain / Activity). Lumetra
  puts everything on one scrolling page with no tabs, and it works because each
  block is visually distinct. For fourteen clients with less per-client data than
  this, **drop the tabs and use one page.** Tabs hide things an owner wants to
  see at a glance and cost a click each.
- **Steal the engagement brief** as a per-client free-text block: what they are
  paying, what we owe them, what they want. Designakum has comps, partner deals
  and hand-shaken arrangements that live nowhere today.
- **Steal the ghost "Add a client" card** and the worded-absence rule.
- **Reuse the Board's tiles inside the record**, rescoped. This is the cheapest
  way to make two screens feel like one product.

**Cost.** Mostly **frontend**. The engagement brief is the exception: free-text
per-client notes need a column or a small table (`tenant_notes`, or JSONB on
`tenants`). That is **additive** — no RLS change beyond the existing
`is_tenant_admin()` pattern, and it must be **owner-visible only**, because it
contains commercial terms the client should never read.

---

### 3.4 Workspace experience — how complexity is hidden

**The finding.** The owner's pipeline has **seven** stages: Waiting to start,
Picked up, Editing, In review, Changes needed, Approved, Posted. The Attention
screen shows a job as "stage 1 of 7".

The **client's** view of the same job shows **five**: Received → Editing → In
review → Approved → Posted.

*Waiting to start*, *Picked up* and *Changes needed* — the three internal,
slightly embarrassing states — are collapsed away. The client sees "Received"
where the operator sees "nobody has picked this up yet".

**Why it works.** This is the cleanest example of hiding complexity without
lying. The backend keeps the full seven-state model; the client is shown a
five-state projection that is still *true* — their footage genuinely has been
received. Nothing is invented and nothing internal leaks.

**Supporting patterns.**
- **Three views of one dataset** — Lanes (drag), Track (one row per job, stage
  on a rail), Table (dense) — with a tip that says *why* each exists: "Lanes to
  drag it along, Track for how far each job has got, Table to scan everything at
  once."
- **The next action is on the card.** A Waiting card carries `Pick this up →`; a
  Picked-up card carries `Start editing →`. The verb changes with the state, so
  the card teaches the process.
- **Progress as a rail of dots**, filled to the current stage, labelled.

**What Designakum borrows.**
- **The projection rule, stated as a design law:** *the client's model of their
  own state may be simpler than ours, but never different from ours.* This is
  precisely the discipline needed for §6.3 (entitlement) and §7.1 (the address).
  A client should see "Live" / "Not published yet" / "Paused" where we hold
  `tenants.status`, `can_edit_tenant()`, `tenant_has_active_subscription()`,
  `cancel_at_period_end` and `current_period_end`.
- **The next action on the object**, with a verb that changes by state — for
  Designakum, a client-record row saying `Resend invite` when the invite is
  unclaimed and `Reset password` once they have signed in.
- A **setup rail** for the client's first run, replacing my flat checklist.

**Cost.** **Frontend only**, and it is a mapping function — the exact shape of
`lib/billing-status.js`, which already mirrors a database rule into UI
vocabulary. One pure, testable module: platform state → customer sentence.
It must **read** entitlement, never restate the rule.

---

### 3.5 Attention and Activity — the two screens Designakum has no equivalent of

**Attention** (`NEEDS A DECISION`). The tip states the philosophy outright:

> "Everything here is waiting on a person, not a process. Each group says why it
> is stuck and what clears it. **An empty screen is the goal.**"

Four reason-tiles — OVERDUE 1, CHANGES CAME BACK 0, NOBODY PICKED IT UP 0,
STOPPED MOVING 0 — with zero states reading "nothing here". Below, each non-zero
group expands with a **definition** and, critically, an exit condition:

> **OVERDUE** — The due date has passed and it is not finished.
> **What clears it:** Move it on, or push the date out so the board stops lying.

Each row then carries the object, its stage rail, and every action that could
clear it: `Assign`, `Pick this up →`, `Details`.

**Activity** (`EVERYTHING THAT HAPPENED`). "This is what to read after a few days
away." Three tiles (in the last day / notes left / total events), then events
grouped by day with per-day counts, each row reading
"**Adem** moved this from Picked up to Waiting to start / nature process clip ·
Ali Habib / 18h ago".

**Why it works.** Attention is a **queue with a stated exit condition per
category** — it tells you not just what is wrong but what "fixed" means, which
is the difference between a notification and a task. "An empty screen is the
goal" tells the user how to feel about the screen, which almost no product
bothers to do. Activity answers the returning-user problem directly.

**What Designakum borrows.** Both, nearly wholesale — and they are additive, so
they carry little risk:

- An **Attention** screen grouping by *reason*, each with a definition and a
  "what clears it" line: **payment failed** (clears when PayPal retries or they
  update the funding source), **handover not confirmed** (clears when you mark
  it done), **DNS not verified**, **invite never claimed**, **workspace disabled
  but paying**. Designakum's owner currently has to *know* these exist.
- An **Activity** feed. Nothing like it exists today, and it is the honest answer
  to my own §5.2 "Activity panel" — better as a platform-wide screen that can
  also be filtered to one client.

**Cost.** Attention: **frontend only** — every state is derivable from
`subscriptions`, `tenants.handed_over_at`, `tenant_domains.status` and the
invite state. Activity: **backend work.** There is no event log in Designakum
today. `billing_events` exists and is the model to copy, but a general
`activity_events` table plus writes at each meaningful action is a real project.
Scope it as its own phase, not as part of the owner portal.

> **A defect worth learning from.** The client's Updates feed leaks the internal
> vocabulary the client's own progress rail hides: it reads "Adem moved this from
> **Picked up** to **Waiting to start**" to a client who is never shown those two
> stages anywhere else. The projection was applied to one surface and forgotten
> on another. **If Designakum builds an activity feed, the client-facing
> vocabulary mapping must be applied at the point where events are rendered, not
> per screen** — otherwise the same leak is guaranteed.

---

### 3.6 Billing / payment experience — **partially answerable, and the gap is structural**

**State this plainly: Lumetra has no pricing page, no checkout, no plan
selection, no subscription management, no payment-state machine and no customer
invoices.** It never charges anybody through the product. There is nothing here
to reverse-engineer for Designakum's §8, and I will not manufacture it.

What exists is **Finance** (`THE COMPANY / Finance`) — the agency's own books,
visible to owners only:

- **Four cadence cards** — One off / Weekly / Monthly / Yearly — each showing
  "N lines · counts every month" above a **tick chart that draws its own
  rhythm** (one mark for a one-off, many for weekly). Their v4.6 note: the
  paragraph that used to explain the four cadences became four small charts.
- **The odd box out**, on a light surface: **LEFT OVER, A MONTH · $15** with
  "1% of everything that comes in stays", an In/Out bar ($1,785 / $1,770), and a
  settled-payments bar reading "1/2 payments in".
- **`WHAT IS COMING` — "Everything not yet settled, by the week it falls due"** —
  a five-week in/out bar chart.
- **`WHO IT IS WITH`** — "Where it comes from" / "Where it goes", proportional
  bars per counterparty with avatars.
- **`THE BOOKS` — "Every line, in and out"** — two columns, Money in (2) and
  Money out (4). Each line reads: title, then a meta sentence
  *"Ali Habib · a month · due today"* or *"ALIYY · a month · paid 11 Aug"*, an
  amount (blue in, red out), and a proportional bar.

**Why it works, and what genuinely transfers.**

1. **Payment status is a phrase in a sentence, not a badge.** "· due today", "·
   paid 11 Aug", "· no date". Legible without a legend, and it degrades
   gracefully when a date is missing.
2. **One headline number with its own qualifier.** "$15 left over" is meaningless
   until "1% of everything that comes in stays" reframes it. Designakum's
   Subscribers screen leads with counts and no interpretation.
3. **Sections carry a subtitle that defines their scope** — "A month, from the
   recurring lines only" pre-empts the "why doesn't this add up" question.
4. **Charts replace prose.** The cadence tick-charts are the strongest example.
5. **In and out are one screen, two columns**, with proportional bars making
   relative size readable without arithmetic.

**What Designakum borrows.** All five, on the **owner** side — `/console/revenue`
should read like The Books: each subscriber a line reading
*"Layla Hassan · yearly · renews 4 Mar 2027"* or *"· payment failed 9 Aug"*, an
amount, a proportional bar, and one headline number with a qualifier above it.

**What Designakum cannot borrow, and must design alone.** Everything
customer-facing in §8: pricing presentation, the SAR/USD dual display, checkout,
the pending→active moment, plan changes, receipts, cancellation, and the five
billing emails. **The largest gap in the Designakum product has no answer in the
reference portal.** If that is the area you most want reference for, nominate a
second product — a self-serve SaaS with a real checkout.

**Cost.** Owner-side borrowings are **frontend only** — `deriveBilling()` already
produces every state these phrasings need; this is presentation over an existing
vocabulary.

---

### 3.7 Settings and account

**What it does.** Settings is **one modal**, not a section of screens:

- **SIGNED IN AS** — avatar, name, "Owner · izoiswild@gmail.com", Sign out.
- **Photo** — a drop zone stating the mechanic ("Centre-cropped to a 128px square
  automatically") and the *purpose*: "Shows on the header, the account menu, and
  anything you have signed. The ring around it is yours — it is how the three of
  us tell each other apart at a glance. Only you can change this photo."
- **APPEARANCE** — Auto / Light / Dark, with "Auto follows your device."
- **COLOUR THEME** — four named themes, each with a plain-English descriptor and
  four swatches: *Fiery Ocean* (Navy-black · brand red), *Deep Current* (Midnight
  ocean · steel blue), *Ivory & Maroon* (Near-black · warm parchment), *Aurora*
  (Black ground · blue and red drift).
- **EDITORS** and **CLIENTS** rosters — each row an avatar, a name, and a meta
  line. The client rows read **"12 videos · no sign-in"** or
  **"7 videos · mutaalau@gmail.com"**.
- **HELP** — "What's new" and **"Show the tips again"**, plus "You are on v5.2."
- **YOUR DATA** — Back up / Restore, explained honestly: "The board lives in the
  database, not in this browser — clearing browsing data does not touch it. A
  backup is a file you keep yourself, for the case the database cannot cover:
  something deleted on purpose that turned out to be needed."

**Why it works.**
- **Settings is a modal because settings are not work.** It never takes over the
  screen you were on, and you return exactly where you were.
- **Every control says what it affects.** The photo copy explains *where the
  photo appears* — the reason to bother uploading one.
- **Themes are named and described**, not swatch grids. "Navy-black · brand red"
  tells you what you are choosing before you choose it.
- **"Show the tips again" is the missing half of every dismissible tip.** Almost
  every product ships the dismiss and forgets the restore.
- **`no sign-in` as a first-class state.** The access model — this client can log
  in, that one cannot — is legible in a roster row, with no jargon.

**What Designakum borrows.**
- **Make Settings a modal**, reachable from anywhere. Today `account` is a tab,
  which means the language toggle and password change interrupt whatever the
  client was doing.
- **"Show the tips again"** — trivial, and it makes dismissible guidance safe to
  add.
- **`no sign-in` / `signed in as <email>`** as the phrasing for the Access panel
  in §5.2. It is exactly the state Designakum's invite flow needs to express, in
  words a person can say on the phone.
- **The honest data explanation.** Designakum has a comparable confusion to
  pre-empt — clients ask whether their site is "saved" — and this is the tone to
  answer it in.
- **Named themes with descriptors**, if theming survives. Note this is a
  *platform* theme for the operator's own comfort, and must not be confused with
  the client's site appearance, which is a customer feature (§6.1 of the context
  handoff).

**Cost.** **Frontend only**, all of it. The photo/roster patterns read existing
data; "show the tips again" is a stored flag.

---

### 3.8 Visual system

**Layout.** A fixed sidebar, a pinned page header, and a scrolling work area.
Every screen follows the same skeleton: **eyebrow + title + search + one primary
action**, then an optional tip, then a **summary band**, then the work. Their
v5.0 note names it: "Every screen is really two things stacked — a summary across
the top and the actual work underneath."

**Colour.** Two meanings, app-wide: **blue = work in flight, red = needs a
decision, everything else is ink.** Two refinements they had to make:

- **Brand red ≠ alarm red.** The same value was lighting the sidebar's selected
  item *and* an overdue invoice; the brand red went deep maroon so the bright red
  could mean urgency alone.
- **Status colours split into a fill and an ink** — the value that fills a
  progress bar is not the value that prints readable text on a chip.

**Typography.** A geometric sans throughout. Hierarchy comes from three moves,
not many sizes: a **small uppercase letter-spaced eyebrow**, a **heavy title**,
and a **very large number** (the tile figures dwarf everything). Numbers and meta
lines are set in a **monospace** — "$1,250.00", "2026-08-13", "18h ago" — so
columns of figures align and dates read as data.

**Spacing.** Generous and consistent: cards on a wide gutter, one clear band per
concern, and real empty space at the bottom of short screens rather than stretched
content.

**Cards.** One panel treatment, used everywhere, differentiated by *surface*
rather than by border weight: dark panels for work, a **light panel for the one
thing worth reading first**. Elevation is subtle; nothing has a border *and* a
shadow *and* a contrasting fill.

**Icons.** One stroke weight, monochrome, always paired with a word. In the
summary tiles the icon sits in a **tinted round chip** whose colour carries the
tile's meaning (red chip on NEEDS ATTENTION). No emoji anywhere in the interface.

**Empty states.** Worded, never blank: "nothing here", "Nothing here. Drag a card
in to move it to Editing.", "nobody assigned yet", "no sign-in", "No footage link
yet", "Nobody yet". Empty lanes keep their headers and their explanatory
subtitles.

**Status indicators.** Small chips pairing an icon with a phrase — `Overdue 1d`,
`Due tomorrow`, `Waiting to start ▾`, `Received`, `$1,250 outstanding`. Note that
several **combine a state and a quantity in one chip**, which is what makes them
readable without a legend.

**What Designakum borrows.**

| Pattern | Designakum action | Cost |
|---|---|---|
| Two meaningful colours, everything else ink | Confirms §9.1 and sharpens it: brand blue `#2C6FE0` = the primary action and work in flight; status colours reserved for state. **And check that the brand blue is not also doing the "urgent" job** — the exact trap Lumetra had to fix | Frontend, one token block |
| Fill vs ink per status colour | Add a second value per status token. `--success` / `--success-bg` / `--success-border` exist; a readable **`--success-ink`** for text on chips does not | Frontend, additive tokens |
| Eyebrow + title + one action, every screen | The `PageHeader` primitive in §9.4, with a required eyebrow | Frontend |
| Summary band over work area | Adopt as the standard screen skeleton for both portals | Frontend |
| One lighter panel per screen | Solves "everything has similar weight" better than any type change | Frontend |
| Monospace for numbers, dates, money | Directly serves the Latin-numerals-in-both-locales rule — a monospace figure reads identically in an RTL layout | Frontend, one token |
| Icons always paired with a word, in tinted chips | Extend `Icon`, delete the emoji (P11) | Frontend |
| Worded empty states everywhere | Extend `EmptyState`; the codebase's instinct here is already good | Frontend |
| Chips combining state **and** quantity | "Overdue 1d" → "Payment failed · 4 days left"; "$1,250 outstanding" → "120 SAR · renews 4 Mar" | Frontend |

**One caution.** Lumetra is English-only and left-to-right. Its uppercase
letter-spaced eyebrows are a core part of its hierarchy and **must not be applied
to Arabic** — no letter-spacing, no uppercase (§9.2, and the existing
`html[dir="rtl"]` override in `ClientHome`). The Arabic eyebrow needs a different
device: weight and colour rather than case and tracking. This is the single place
where copying the reference visually would damage Designakum.

---

### 3.9 What NOT to take

- **The density.** Lumetra is an operations tool for someone in it all day.
  Designakum's client uses their dashboard for ten minutes a month and needs more
  air, larger touch targets, and fewer things per screen.
- **The dark-first palette.** Lumetra is near-black by default. Designakum sells a
  premium personal-brand product to creatives and the light theme is the one to
  perfect first.
- **Four selectable themes.** Charming for three colleagues; a maintenance
  liability across a bilingual product with a light and dark mode already. One
  light, one dark, done well.
- **"Test look" (demo data).** Genuinely useful for a portal with six clients and
  three staff — but for Designakum, an unpaid or unpopulated workspace is a real
  and common state, so effort belongs in **first-run and empty states** (§7.4)
  rather than a fake-data mode.
- **The visual language itself.** Deep maroon, the lettermark, the geometric
  display face — that is Lumetra's brand. Designakum's is royal blue `#2C6FE0`,
  deep navy `#0C1530`, and the diamond motif.

---

### 3.10 The five decisions underneath all of it

Stripped of visual style, these are what make the portal read as professional:

1. **Every screen answers one question, named in its own eyebrow.**
2. **Numbers are sentences.** A figure always arrives with a noun phrase and a
   qualifying footer.
3. **Summaries are navigation.** Reading and acting are the same gesture.
4. **The client's model is a true projection of the operator's** — simpler,
   never different.
5. **Every state names its exit.** Stuck things say what clears them; empty
   screens say what they mean; absent values are worded, not blank.

Designakum's redesign is judged against these five, not against how Lumetra
looks.

---

## 4. Future information architecture

### 4.1 The split

Two portals, one codebase, one Supabase project. Separating them is an **IA
decision, not a repository split** [CONFIRMED: context handoff §6.6].

```
PUBLIC                          designakum.site/            owner's portfolio
                                designakum.site/{address}   a client's portfolio
                                /signup  /signup/verify     become a customer
                                /privacy /terms             legal

CLIENT PORTAL    /studio        "make my presence better"
OWNER PORTAL     /console       "keep the business healthy"

SHARED           /signin  /reset-password  /subscribe
```

**Route naming — [PREFERENCE], and a real decision to make.**

| Option | Client | Owner | Trade-off |
|---|---|---|---|
| **A (recommended)** | `/studio` | `/console` | Warm for a creative audience; unambiguous; neither word appears in the current product |
| B | `/dashboard` | `/console` | Plainer, but `dashboard` is the generic word the redesign is running away from |
| C | `/me` | `/admin` | Shortest; keeps `/admin` muscle memory for the two owner accounts |

I recommend **A**. `/studio` frames the client's space as a place where work
gets made rather than a settings panel, and it survives translation
(استوديو). `/console` reads as operational and will never be mistaken for a
customer surface.

> **Backend implication, and it is a hard one.** A tenant slug becomes a
> top-level route, so **every new top-level segment must be added to
> `RESERVED_SLUGS` before the route ships** [CONFIRMED: `lib/reserved-slugs.js`].
> `dashboard`, `account`, `billing`, `settings`, `status` and `health` are
> already reserved; **`studio`, `console`, `signin` and `me` are not.** Reserving
> them is a one-line change with no migration — but it must land *first*, and it
> must be checked against existing slugs, because a customer who already owns
> `studio` would be silently shadowed by a static route and their site would
> simply stop resolving.

### 4.2 Section-by-section

#### Marketing experience — out of scope, one interface point

Separate repository, separate Supabase project, separate owner account. Nothing
in this repo may reference it [CONFIRMED: GRANDMASTER §2].

The one contract: **marketing links to `/signup`, never `/subscribe`**, and it
must carry `?lang=ar` or `?lang=en` [CONFIRMED: `docs/architecture/billing.md`
§2]. A visitor sent to `/subscribe` has no session and hits `invalid_token`.

#### Client portal — `/studio`

| Route | Purpose | User goal | Key actions | Components |
|---|---|---|---|---|
| `/studio` | Home | "Is my site live, is it finished, is anyone looking?" | Continue setup · View live site · Share | `StatusHeader`, `StatTile`, `SetupChecklist`, `ActivityStrip` |
| `/studio/page` | About you + home page (today: Profile + Card) | "Say who I am well" | Edit, save, preview | `EditorShell`, `BilingualField`, `ImageUpload`, `SaveBar`, `PreviewPane` |
| `/studio/work` | Projects | "Show my best work first" | Add, reorder, edit, delete | `WorkGrid`, `ProjectEditForm`, `MultiImageUpload` |
| `/studio/links` | Links | "Make me contactable" | Add, reorder, pick icon | `LinkRow`, `IconPickerModal` |
| `/studio/style` | Appearance | "Make it feel like me" | Theme, colour, density, fonts | `ThemePreview`, `StylePicker` |
| `/studio/audience` | Analytics | "Is anyone looking, and at what?" | Range, read, share | `TrendTile`, `BarChartCard`, `TableCard` |
| `/studio/address` | Domain | "Give it a proper address" | Connect domain, verify DNS, set primary | `AddressCard`, `DnsInstructions`, `DomainStatusBadge` |
| `/studio/plan` | Billing | "Am I paid up, what did I pay?" | Subscribe, change plan, receipt, cancel | `PlanCard`, `PlanPicker`, `PaymentHistory`, `CancelFlow` |
| `/studio/account` | Account | "My login and language" | Email, password, language, sign out | `AccountForm`, `PasswordField` |

Nine destinations, grouped into three sidebar sections:
**Your site** (page · work · links · style) · **Insights** (audience) ·
**Settings** (address · plan · account), with Home above the groups.

That is **five current tabs collapsed into four** — Profile and Card merge into
`page` [PREFERENCE], on the grounds that a client does not distinguish "my
profile" from "my home page"; they have one page.

#### Owner portal — `/console`

| Route | Purpose | User goal | Key actions | Components |
|---|---|---|---|---|
| `/console` | Business health | "What needs me today?" | Triage | `HealthTile`, `AttentionList`, `RevenueStrip` |
| `/console/clients` | All clients | "Find a client, see everyone's state at a glance" | Search, filter, add client | `ClientList`, `StatusPill`, `FilterBar` |
| `/console/clients/[id]` | **One client, everything** | "What is going on with this person?" | Every per-client action | `ClientRecord` + tabbed panels |
| `/console/revenue` | Subscriptions | "Who pays, what failed, what is comped?" | Filter, export, payment link, grant comp | `SubscriberTable`, `EnvBadge`, `CompDialog` |
| `/console/onboarding` | Handover queue | "Who is half-onboarded?" | Add client, resend, mark done, release account | `PendingQueue`, `OrphanList`, `CredentialsHandoff` |
| `/console/health` | Platform | "Is anything broken?" | Inspect webhooks, DNS, anomalies | `EventLog`, `DriftList` |

`/console/clients/[id]` is the structural fix for **P3**. One object, one URL,
one place — with Overview / Site / Subscription / Access / Domain / Activity as
panels *within* the record, not as sibling destinations.

#### Billing experience — spans both

- Client-facing: `/studio/plan` and `/subscribe`.
- Owner-facing: `/console/revenue` and the Subscription panel of a client record.
- Out of the app entirely: **every billing email** (§7). This is where most of
  the billing experience currently does not exist.

#### Account experience — shared shell

`/signin`, `/reset-password`, and the `must_set_password` gate. One auth shell,
one card, one decision per screen. The gate must wrap **both** portals — it is
currently layered over `Admin` [CONFIRMED: `pages/admin.js:220`] and a split
that forgets it lets someone owing a password into `/studio`.

### 4.3 The rule that resolves the whole confusion

> **`/console` never edits content. `/studio` never shows another person's data.**

An owner who needs to fix a client's page enters `/studio` **explicitly and
visibly**, from that client's record, with a persistent banner:

```
  ⚠  Operator mode — you are editing Layla Hassan's site.        [ Leave ]
```

This is not a new capability. It is what `switchTenant()` already does
[CONFIRMED: `pages/admin.js:1095`], made legible. RLS is unchanged: platform
owners are tenant admins on every tenant via the Section F trigger, and
`is_tenant_admin()` is what actually permits the write. **Labelling it changes
nothing about who is allowed to do it** — which is exactly why it is safe to add
as a UX change.

---

## 5. Owner portal design

The owner's mental model is a person, a plan and a site. Everything below is
in service of that.

### 5.1 `/console` — the answer to "what needs me today?"

Not a metrics wall. An **attention queue**, with health as context.

```
┌──────────────────────────────────────────────────────────────┐
│  Good morning, Feras                          [ + Add client ]│
│                                                               │
│  NEEDS YOU  ·  3                                              │
│  ⚠  Layla Hassan — payment failed, 4 days left    [ Open ]    │
│  ⚠  Omar Q. — waiting on handover since 12 Aug    [ Open ]    │
│  ⚠  studio-nine.com — DNS not verified            [ Open ]    │
│                                                               │
│  ─────────────────────────────────────────────────────────    │
│   14 clients      9 paying      5 comped      2 not live      │
│   Renewing in the next 30 days: 6                             │
└──────────────────────────────────────────────────────────────┘
```

**Why an attention queue rather than a dashboard.** At fourteen clients, a
"business health" chart is decorative — the owner can hold the whole business in
their head. What they cannot hold is *which three things changed since
yesterday*. Charts become worth building somewhere around fifty clients; the
queue is worth building today. Revisit when the client list stops fitting on one
screen.

Every row is a **[link to a client record]**, which requires P2 to be fixed
first. That dependency is why IA comes before everything else in the roadmap.

**Deliberately absent:** revenue-over-time charts, funnel visualisations, a
CRM. The context handoff is explicit that the owner portal must not become a CRM
[CONFIRMED: §5]. Notes, tags, pipelines and lifecycle stages are out.

### 5.2 `/console/clients/[id]` — the client record

The centrepiece. Everything about one person, on one URL.

```
┌──────────────────────────────────────────────────────────────┐
│  ← Clients                                                    │
│                                                               │
│  [ph]  Layla Hassan                              ● Live       │
│        designakum.site/layla-hassan  ·  layla.co  ↗           │
│        Yearly · 120 SAR · renews 4 Mar 2027    ● Paid         │
│                                                               │
│  [ Open her site ]  [ Edit as operator ]  [ ⋯ ]               │
│                                                               │
│  Overview │ Site │ Subscription │ Access │ Address │ Activity │
└──────────────────────────────────────────────────────────────┘
```

| Panel | Holds | Replaces today |
|---|---|---|
| **Overview** | Completion, last edit, last visit, at-a-glance flags | scattered |
| **Site** | Live/suspended toggle, public URL, preview thumbnail, content stats | Workspace tab |
| **Subscription** | Plan, status, period end, payments, comp, payment link, **environment badge** | Subscribers screen |
| **Access** | Sign-in email, sign-in name, invite state, resend, rotate password, release | Sites + orphan list |
| **Address** | Custom domain, DNS state, instructions, primary | `DomainManager` |
| **Activity** | Edits, sign-ins, billing events, operator actions | does not exist |

Three answers this delivers directly:

- **How does an owner manage clients?** By opening a person, not by choosing
  between three screens. (Fixes P3.)
- **How does an owner grant access?** In the Access panel, next to the invite
  state that explains why it is needed. Grant-comp lives in Subscription, where
  it is visibly a *billing* act. (Fixes part of P6.)
- **How does an owner monitor activity?** Activity panel, per client. The
  platform-wide view lives in `/console/health`.

**Environment badge — do this early.** A `Sandbox` pill on any subscription
whose `environment = 'sandbox'`, in the record and in the list. This is a
**read-only column render** and touches nothing else. **Never** change the
entitlement predicate, which is
`environment IS DISTINCT FROM 'sandbox'` and must never become `= 'live'`
[CONFIRMED: GRANDMASTER §4b — `= 'live'` would revoke every comped client at
once, because comps carry a NULL environment]. Fixes P9.

### 5.3 `/console/revenue`

Keep `SubscribersOverview`'s substance — the derived-once billing vocabulary,
the filters, the CSV export are all good. Change three things:

1. Add the environment badge (above).
2. Make every row link to the client record instead of switching tenant into the
   profile editor. (Fixes P4 at its origin.)
3. Lead with the three numbers an owner actually re-checks — paying, comped, at
   risk — rather than a table header.

### 5.4 `/console/onboarding`

The handover queue is currently the strongest owner screen in the product and
mostly needs relocating rather than redesigning: pending handovers, unattached
logins, the release-account path, and every recovery route from a botched
handover [CONFIRMED: `pages/admin.js:3974`, `PendingRow`].

Two changes: it becomes a destination instead of a section inside a list, and
the credential handoff changes shape (§6).

### 5.5 What the owner portal must *not* become

- Not a CRM. No notes, tags, pipelines, deal stages.
- Not a content editor. Editing is `/studio`, entered visibly.
- Not a database browser. No ids, no raw JSON, no table names on screen.
- Not a support inbox.

---

## 6. Client portal design

### 6.1 `/studio` — Home

The client's whole product in one screen, and the first thing they see after
every sign-in.

```
┌──────────────────────────────────────────────────────────────┐
│  Your site is live                                            │
│  designakum.site/layla-hassan            [ View ]  [ Share ]  │
│                                                               │
│  ██████████████░░░░░░  70% complete                           │
│  Next: add two more projects                     [ Continue ] │
│                                                               │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                │
│  │ 128 visits │ │ 9 projects │ │ Yearly     │                │
│  │ last 30 d  │ │ published  │ │ renews Mar │                │
│  └────────────┘ └────────────┘ └────────────┘                │
│                                                               │
│  Your work                                    [ Manage → ]    │
│  [img] [img] [img] [img] [img] [img]                          │
└──────────────────────────────────────────────────────────────┘
```

Four changes from `ClientHome` today, in order of impact:

1. **Show their work.** A strip of project thumbnails. It is the only element
   that makes the dashboard feel like a portfolio product rather than a form,
   and the images already exist.
2. **One next action, not four quick actions.** `computeSetup()` already knows
   the ordered remaining steps [CONFIRMED: `pages/admin.js`, `WebsiteGuide`].
   Surface the first as a single primary button; keep the full checklist below.
3. **Replace the emoji with `Icon`.** Fixes P11.
4. **Status as a sentence, not a badge.** "Your site is live" reads as
   reassurance; a green pill reads as a database field.

### 6.2 Answering the required questions

**How does a client understand their portfolio status?** Home leads with a
sentence, an address and a completion bar. Three states, plainly worded: *live*,
*not published yet* (setup incomplete), *paused* (unpaid or suspended).

**How does a client manage content?** Three destinations instead of five —
`page` (who I am), `work` (what I have made), `style` (how it looks) — plus
`links`. Editor shell and `SaveBar` unchanged; `PreviewPane` beside it.

**How does a client see analytics?** `/studio/audience`, reframed from a metrics
panel to a story: *how many people came*, *which projects they opened*, *which
links they clicked*. Same underlying `analytics_events`; different headline.
Note the existing constraint — the query is unbounded and has no retention
policy [CONFIRMED: `docs/architecture/overview.md` §7]. Do not design a
long-range comparison view onto it without server-side aggregation.

**How does a client manage domains?** `/studio/address`. Never the word
"domain" as the primary label — "Your web address", with the free
`designakum.site/name` address shown as already-working, and a custom domain as
an upgrade rather than a requirement. `DnsInstructions` stays, one step at a
time, with the verification state honest about drift.

**How does a client access settings?** `/studio/account`: sign-in email,
password, language, sign out. Nothing else. `/studio/plan` is money and
deliberately separate.

### 6.3 Entitlement, made legible (fixes P8)

The rule: **entitlement gates writes, not reads.** So an unpaid client can
browse everything and save nothing. Today they find out when a save fails.

The redesign states it before they type:

```
┌──────────────────────────────────────────────────────────────┐
│  ⏸  Your site is paused                                       │
│     You can look around, but changes will not save until your │
│     subscription is active. Your work is safe.  [ Reactivate ]│
└──────────────────────────────────────────────────────────────┘
```

Persistent at the top of every editor while unentitled, with `SaveBar` disabled
and carrying the same reason.

Two rules this must obey:
- **Read the state, do not reimplement it.** `lib/billing-status.js` mirrors
  `tenant_has_active_subscription()`, and where they disagree the database wins
  [CONFIRMED: `docs/architecture/database.md` §3].
- **Hiding a control is not a security boundary.** RLS stays the authority; the
  banner is courtesy, not enforcement.

### 6.4 Never visible to a client

Tenant id · the word "tenant" · the word "workspace" · the word "slug" · the
word "username" (see §6.5) · another client · any billing environment ·
`platform_owners` · anything named after a table.

### 6.5 A note on "username"

Sign-in currently accepts email **or** username, resolved by
`get_email_for_username`, which must stay anon-callable because it runs before
authentication [CONFIRMED: `docs/architecture/overview.md` §7]. So the concept
cannot be deleted.

It can, however, stop being a *thing the user manages*. In the redesign, sign-in
asks for "email", the resolver keeps accepting a username silently for the
clients who already have one, and the field is never labelled "username"
anywhere a client can see. Owners see it as "sign-in name" in the Access panel,
because they still have to say it out loud on the phone occasionally.

---

## 7. Onboarding redesign

### 7.1 The vocabulary problem (fixes P5)

The friction is **vocabulary, not step count** [CONFIRMED: context handoff §4].
Neither slug nor username can be dropped: the slug becomes `/{slug}` and is
constrained by the reserved list, and the username feeds sign-in resolution
[CONFIRMED: `lib/reserved-slugs.js`, `lib/resolve-login.js`].

So hide the concept, keep the constraint.

**Slug → "web address", shown as a URL, derived, editable.**

```
   Their name
   ┌────────────────────────────────────────┐
   │ Layla Hassan                           │
   └────────────────────────────────────────┘

   Web address
   designakum.site/layla-hassan     ✓ available     [ Change ]
```

The field is a **preview of a URL with an inline edit affordance**, not a text
input labelled "slug". `suggestSlug()` already derives it, and `slugError()`
already returns codes rather than sentences precisely so the caller picks the
wording [CONFIRMED: `lib/reserved-slugs.js`]. So this is a **presentation
change over an unchanged validator** — the cheapest fix in this document
relative to its impact.

Error copy moves from platform language to plain language:

| Code | Today | Proposed |
|---|---|---|
| `slug_reserved` | "That slug is reserved — pick another" | "That address is taken by Designakum — try `layla-hassan-design`" |
| duplicate | "That slug is already taken" | "Someone already has that address. `layla-h` is free." |
| `slug_invalid_characters` | "Enter a valid workspace slug" | "Addresses use English letters, numbers and hyphens." |

Note the honest constraint behind the last one: the slug is deliberately ASCII,
because an Arabic slug punycodes into something nobody can read back or dictate
over the phone [CONFIRMED: `lib/reserved-slugs.js`]. That reasoning should
appear in the interface, in one sentence — the Lumetra door does exactly this
and it is the one pattern I can transfer with confidence. `suggestSlug()`
reduces an Arabic name to nothing by design, so the Arabic-name case must be
designed for explicitly, not treated as an error.

**Username → derived, not asked.** Drop the field from the owner's invite form.
Derive from the email local part with a numeric suffix on collision. Surface it
read-only in the client record's Access panel. The invite form goes from four
fields to three: name, email, language.

> **Backend implication.** `invite-client` currently takes `username` from the
> request body [CONFIRMED: `pages/admin.js`, the `functions.invoke` call].
> Deriving it means either the client derives and sends, or the function derives
> — the function is right, because collision detection needs the database. That
> is an Edge Function change and its own piece of work.

### 7.2 Credential relay (fixes P6)

Today: the function generates a password, returns it, the owner reads it off
screen and relays it by hand. There is no non-destructive resend.

**Target:** the client sets their own password from an emailed invite link, and
the owner never sees a password at all. This is a **new token flow in
`invite-client`** [CONFIRMED: context handoff §7] and is genuinely backend work
— it should be scheduled as such, not assumed.

**Interim, cheap, and worth doing first** — from `docs/features/planned.md` §6:
warn at the moment of clicking a resend, and when `last_sign_in_at IS NULL`
there is no working password to protect, so re-issue without destroying
anything. That removes the top source of "the client says their password
stopped working" without a new flow.

### 7.3 Self-serve signup

The flow works [CONFIRMED: context handoff §3]. Two UX changes:

1. **`/signup` asks for the address in the same reframed language as §7.1.** One
   validator, two surfaces — it is already shared between the form and the Edge
   Function.
2. **The unpaid gap is a designed moment, not a tab.** Today: verify → land in
   `/admin` → find the Billing tab → checkout. Proposed: verify → land in
   `/studio` where the *whole home screen* is "Your site is ready — activate it
   to publish", with the plan choice inline. The `?plan=` preselection from
   marketing already works and must be preserved [CONFIRMED: `BillingEditor`,
   `planFromQuery`].

### 7.4 First-run

A brand-new portfolio is empty and that is the first impression. Design it as a
state, not an absence: a short guided sequence (your name → your photo → your
first project) that ends by showing them their live page. `computeSetup()` and
`WebsiteGuide` already model this; it needs to be the screen rather than a
section within a screen.

---

## 8. Billing experience

### 8.1 What already works — do not rebuild it

- **Two plans, resolved server-side.** Prices live in `provider_plans`, never
  hardcoded in the UI.
- **Dual currency, stated openly.** 12 SAR / 3.20 USD monthly, 120 SAR / 32 USD
  yearly; customers are quoted SAR and PayPal debits USD, and checkout tells them
  both, deliberately, because a surprise USD figure on a statement is how a
  payment becomes a dispute [CONFIRMED: `docs/architecture/billing.md` §2].
  **Keep that.**
- **Cancellation is built and correct.** Access continues to
  `current_period_end`; `cancel_at_period_end` is set and `status` is left to the
  webhook.
- **The status vocabulary.** `deriveBilling()` → `pending` / `past_due` /
  `canceling` / `comped` / `active`, with the right action attached to each — the
  past-due message points at PayPal because the funding source lives there and
  nothing this screen could collect would fix it. That reasoning is correct and
  should be preserved verbatim.
- **PayPal cancellation is terminal**, so the UI offers a *new* subscription
  rather than a "resume" that would fail.

### 8.2 The gaps, in priority order

**Gap 1 — no billing emails at all (P7).** The highest-value work in this
document. Every trigger is already recognised by the webhook; what is missing is
the send. Five emails, bilingual, brand blue, in the existing Resend
infrastructure:

| Email | Trigger | Says |
|---|---|---|
| Receipt | `PAYMENT.SALE.COMPLETED` | what you paid, for what, until when |
| Renewal notice | 7 days before `current_period_end` | what will be charged, when, how to change it |
| Payment failed | `PAYMENT.SALE.DENIED` | what happened, days remaining, how to fix at PayPal |
| Cancelled | cancellation recorded | **your site stays live until X** |
| Welcome-to-paid | `SUBSCRIPTION.ACTIVATED` | you are live — here is your address |

> **Backend implication.** Four are webhook-driven and land naturally in
> `billing-webhook`. The renewal notice is the odd one out: nothing currently
> runs on a schedule, so it needs a cron or a scheduled function. Scope it
> separately, or ship the other four first — they are worth more.

**Gap 2 — the pending moment is an alert, not a moment.** After approving at
PayPal, the client waits on our webhook while `BillingEditor` polls, correctly
distinguishing "confirming your payment" from "finish approving"
[CONFIRMED: `pages/admin.js`, `polling`]. The logic is right and the presentation
is a warning box. Make it a full-screen confirmation — this is the moment the
customer becomes a customer, and it currently looks like an error.

**Gap 3 — receipts are a payments list.** An `invoices` table exists
[CONFIRMED: `docs/architecture/database.md` §2] and the UI reads `payments`. Give
each row a printable receipt (name, address, amount in both currencies, period,
date). `lib/credentials-pdf.js` shows a dependency-free PDF is already possible
in this codebase.

**Gap 4 — cancellation is not a designed flow.** Today it is an action. It
should be three beats: *what you keep* ("your site stays live until 4 March
2027") → *the cheaper alternative* (monthly → yearly is dramatically more
efficient to collect, since PayPal's fixed fee is most of the cost on a 3.20 USD
charge [CONFIRMED: `docs/architecture/billing.md` §2]) → *confirm*. No dark
patterns, no fake urgency; one honest alternative offered once.

**Gap 5 — the riyal symbol.** Client-supplied image, never the letters "SAR"
spelled out. `formatAmount()` is the one place to change it.

### 8.3 Owner-side billing

Covered in §5.2 and §5.3: the environment badge, the client-record Subscription
panel, comp grants shown as billing acts. Two known traps to design around
rather than into:

- A **comped workspace cannot check out** — `billing-checkout` refuses
  `already_subscribed` (409), so a mistakenly comped workspace has no way to buy
  out of it [CONFIRMED: `docs/features/planned.md` §4]. Until that is decided,
  the comp dialog should warn at the point of granting.
- **`tenant_domains.status` is set by hand and drifts** [CONFIRMED:
  `docs/architecture/overview.md` §7]. Do not build a client-facing "verified"
  badge on a column known to lie; either verify live or word it honestly.

---

## 9. Design system direction

**The constraint, restated because it invalidates most published advice:** five
runtime dependencies, no devDependencies, no TypeScript, **no Tailwind, no
PostCSS, no component library** [CONFIRMED: GRANDMASTER §4.2]. Styling is CSS
custom properties in `styles/globals.css` plus co-located `<style jsx>`.
Everything below is implementable with exactly that, and adds nothing.

### 9.1 Colour — the one urgent fix

Set `--accent` to the brand royal blue **`#2C6FE0`** in both themes, and rebuild
the gradient and glow from it. Today the app uses `#9FA7FF` / `#4f57d8` /
`#6d86ff→#4f6ef2` and the brand blue appears in **no application CSS at all**
(P10). This is one token block, it propagates everywhere through the existing
tokens, and it aligns the product with the emails rather than the reverse.

Discipline to add with it: **one accent, on the primary action only.** Status
colours (`--success` / `--warning` / `--danger`, already paired fg/bg/border) are
the only other saturated colour permitted, and only to report state.

Deep navy `#0C1530` stays what it is — text and dark surfaces — and the light
theme's `--on-bg: 12, 21, 48` is already exactly that.

### 9.2 Typography

The scale is 11 / 12 / 14 / 16 / 20 / 26px [CONFIRMED: `styles/globals.css`].
There is no display size, which is the mechanical reason nothing on a page can
lead. **Additive change, breaks nothing:**

```
  --text-3xl: 34px     page titles
  --text-4xl: 44px     the one number or sentence that leads a screen
```

Rules:
- One `--text-4xl` per screen. If a screen needs two, it is two screens.
- Weight carries hierarchy before size does; the fonts are already variable.
- **Arabic never gets `letter-spacing` or `text-transform: uppercase`.** This is
  currently patched per-component (P12). Make it one global rule under
  `html[dir="rtl"]` and one `.eyebrow` class, written once.
- Latin numerals in both locales, everywhere, always.

### 9.3 Spacing and layout

The 4px scale (`--space-1` … `--space-10`) is sound. Add three layout
principles:

1. **One column of content, max ~720px, per editor.** The current editors
   already trend this way; make it a token (`--measure`).
2. **A shared page shell**: title, optional subtitle, optional action, then
   content. Every screen in both portals uses it, which is what makes them feel
   like one product.
3. **Vertical rhythm from the space scale only.** No hand-picked margins in
   `<style jsx>` blocks. This is the most common drift in the current file.

### 9.4 Components

Existing primitives — Button, Card, Badge, Input, Icon, Toast, ConfirmDialog,
EmptyState, Skeleton, BrandGlyph — are the right set and should be extended, not
replaced.

**To add** (all plain React + `<style jsx>`, no dependencies):

| Component | Job | Used by |
|---|---|---|
| `PageHeader` | title · subtitle · primary action | every screen |
| `StatTile` | one number, one label, optional trend | both homes |
| `StatusLine` | a *sentence* of status + optional action | client home, plan |
| `DataRow` | avatar/thumb · primary · secondary · state · action | client list, revenue |
| `RecordHeader` | identity + status + actions above panels | client record |
| `PanelTabs` | in-record navigation | client record |
| `Checklist` | ordered steps with done state | first run, setup |
| `Thumbstrip` | horizontal image row | client home, client record |
| `Callout` | info / warning / paused, with an action | entitlement, billing |
| `OperatorBanner` | persistent impersonation notice | operator mode |

**Icons.** `components/ui/Icon.js` exists and is used by the nav
[CONFIRMED: `lib/admin-nav.js` icon keys]. Extend it and **remove every emoji
from the interface** (P11). One stroke weight, one grid, monochrome, inheriting
`currentColor`. Emoji stay only in genuinely expressive copy (the 🎉 on
completion is fine; a 🎨 as an icon is not).

**Cards.** One elevation for content, one for overlays. `--shadow-sm/md/lg`
already encode this. Resist per-card borders — a card with a border, a shadow
and a background on a background is three separations doing one job, and it is
the main reason the current dashboard reads as busy.

### 9.5 Visual hierarchy — the operating rule

On any screen, in order: **one thing leads** (a sentence or a number, at
`--text-4xl`), **one action is coloured**, **everything else is type and
space.** If a screen has two leads or two coloured actions, split it.

### 9.6 RTL

Not a mirror — a layout mode. Logical properties (`margin-inline-start`, not
`margin-left`) throughout, `dir="ltr"` islands for URLs, emails and technical
strings (already done in several places [CONFIRMED: `pages/admin.js`, `.ch-url`,
`.bl-card-exp`]), icons that imply direction flipped, icons that imply an object
not flipped. **Every screen in this blueprint must be reviewed in Arabic before
it is called done**, not after.

---

## 10. Engineering roadmap

Sequenced so each phase is independently shippable and independently
revertible. **No phase requires a new dependency.** Nothing here touches RLS,
entitlement, billing logic or the tenant resolver — where a change would, it is
called out as its own decision.

### Phase 1 — Information architecture

**Goal:** structure becomes an artefact instead of an expression. No visual
change ships in this phase, deliberately.

1. Reserve the new top-level segments in `lib/reserved-slugs.js` **first**, and
   check them against every existing slug. *(Hard prerequisite — §4.1.)*
2. Extend `lib/admin-nav.js` into two explicit models, `clientNav()` and
   `ownerNav()`, with routes attached. It is pure and unit-tested; this is where
   the new IA is agreed cheaply.
3. Introduce real routes: `/studio/[...section]` and `/console/[...section]`,
   both mounting the existing `Dashboard` and mapping the segment to the current
   `activeTab`. Behaviour identical; URLs now exist.
4. `/admin` becomes a redirect that routes by `isOwner`. Never remove it — the
   two owner accounts have it memorised and it is in old emails.
5. Extract components out of `pages/admin.js` **with no behaviour change**,
   preserving the `<div className="editor">` + `<AdminStyles />` invariant (P13).

**Backend:** none. **Database:** none. **Risk:** the reserved-slug check is the
one genuinely dangerous step — a missed collision silently unresolves a live
customer site. Verify against production slugs before merging.

### Phase 2 — Design system

6. `--accent` → `#2C6FE0` in both themes; rebuild gradient and glow (P10).
7. Add `--text-3xl` / `--text-4xl` and `--measure`.
8. One global RTL rule for letter-spacing and case; one `.eyebrow` class (P12).
9. Add `PageHeader`, `StatTile`, `StatusLine`, `DataRow`, `Callout`.
10. Extend `Icon`; remove every emoji used as an icon (P11).

**Backend:** none. **Risk:** low and visible. The accent change touches every
screen at once — review both themes and both directions in one pass.

### Phase 3 — Owner portal

11. `/console` attention queue.
12. `/console/clients` list on `DataRow`, rows linking to records.
13. **`/console/clients/[id]` — the client record**, absorbing the Workspace tab,
    `DomainManager` and the per-client half of Subscribers (P3).
14. `OperatorBanner` + explicit "Edit as operator" entry into `/studio` (P4).
15. Environment badge on every subscription surface (P9).
16. `/console/revenue` and `/console/onboarding` relocated.

**Backend:** none required. **Database:** none — the environment badge is a
read of an existing column. **Risk:** the client record touches every owner
workflow at once. Ship it behind the old screens rather than replacing them, and
delete the old ones only once the record is proven.

### Phase 4 — Client portal

17. `/studio` home: work thumbstrip, one next action, `StatusLine`.
18. Merge Profile + Card into `/studio/page`.
19. Entitlement `Callout` + reasoned `SaveBar` disable (P8) — **reading**
    `lib/billing-status.js`, never reimplementing the rule.
20. `/studio/audience` reframed; `/studio/address` in address language.
21. First-run sequence on `computeSetup()` / `WebsiteGuide`.

**Backend:** none. **Risk:** the Profile/Card merge is the only structurally
risky item — two editors, one `SaveBar`, one dirty-state context. Do it last in
the phase, or split it out.

### Phase 5 — Billing and customer experience

22. **Billing emails** — receipt, activated, payment failed, cancelled. Resend,
    bilingual, brand blue. *(Highest customer value in this document.)*
23. Renewal notice — **needs a schedule; nothing runs on one today.** Its own
    decision.
24. Post-checkout confirmation as a moment, not an alert.
25. Cancellation as a three-beat flow.
26. Printable receipts.
27. Riyal symbol in `formatAmount()`.
28. Invite → client-chosen password (§7.2). **New token flow in
    `invite-client`** — its own piece of work, not a UX change.

**Backend:** substantial. Four new email senders in `billing-webhook`, one
scheduled function, one auth-flow change. **Database:** none for the emails;
the invite flow may need a token table alongside `password_reset_tokens`.
**Risk:** the highest in the roadmap, because it is the only phase that touches
billing and auth. One item at a time, never two at once
[CONFIRMED: GRANDMASTER §4.3].

### Phase 6 — Polish

29. Full Arabic review of every screen, in RTL, on a real device.
30. Empty and error states across both portals.
31. Motion: one duration, one easing — `--transition` already exists.
32. Mobile: the owner portal is desktop-first; the client portal is not, and a
    freelancer will edit their portfolio on a phone.
33. Reconcile the two signup emails with the corrected tokens (P10).

### Cross-cutting risks

| Risk | Why it bites | Mitigation |
|---|---|---|
| **New route shadows a customer slug** | Next.js resolves the static route first and the tenant becomes silently unreachable | Reserve segments in Phase 1 step 1; verify against live slugs |
| **Extraction breaks editor styling** | Input styling is scoped under `.editor`; a component outside it renders as unstyled native controls | Preserve the wrapper + `AdminStyles` in every extraction; it has already happened once |
| **Preview iframe state corruption** | The preview shares an origin with the admin, so the public page's `localStorage` writes land on the admin's behalf | Do not touch the `?preview=1` / in-iframe guards in `index.js` |
| **An RLS-filtered write reports success** | PostgREST returns success having changed zero rows | Every new write path must inspect affected rows, as `persistProfile` does |
| **UI drifts from the entitlement rule** | `lib/billing-status.js` mirrors a database function | Read it; never restate the rule. Where they disagree, the database is right |
| **Bookmarks and old links** | `/admin` is memorised and appears in sent emails | Keep it as a permanent redirect |
| **Bilingual debt** | Every new string needs `ar` and `en`, parity-tested | Add both at authoring time; the parity test will catch omissions |
| **Sandbox entitlement predicate** | `= 'live'` would revoke every comped client at once | Surface `environment` read-only; never touch the predicate (GRANDMASTER §4b) |

### What is deliberately not in this roadmap

- Redesigning `/` or `/{slug}` — the customer's brand, not ours.
- Any repository split.
- Any new dependency.
- Any RLS, entitlement, tenant-resolver or billing-logic change presented as UX.
- Analytics retention and aggregation — real, known, and its own project.
- The live-checkout end-to-end verification — the one launch blocker, and a
  verification task, not a design one.

---

## 11. Open decisions for the owner

Ordered by how much downstream work they unblock.

1. **Route names.** `/studio` + `/console`, or something else? Phase 1 cannot
   start without this, because the reserved-slug change depends on it.
2. **The Lumetra teardown** — §3 is blocked on screenshots or a recording, and
   other reference products are welcome.
3. **Merging Profile and Card into one "page" editor** — the largest IA change
   to the client's editing model.
4. **Renewal-notice scheduling** — nothing in the platform runs on a schedule
   today; introducing one is an infrastructure decision.
5. **Does `comped` belong in the checkout refusal list?** Not a UX question, but
   it shapes how the comp dialog must warn.
6. **Attention queue vs. charts on `/console`.** I recommend the queue at
   fourteen clients. If growth is expected to be fast, say so and the shape
   changes.
