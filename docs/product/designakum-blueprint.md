# The Designakum Product Blueprint

**The single source of truth for the redesign.** Written 2026-08-14, against
`main` at `4803e6d` — clean tree, 539 tests passing, build green.

Everything before this is input. Where an earlier document disagrees with this
one, this one wins and §0.2 says why.

---

## 0. Authority

### 0.1 What this is built on

| Source | Role now |
|---|---|
| `ux/designakum-ux-blueprint.md` | the research, incl. the Lumetra teardown. Principles stand; §6.3 superseded |
| `ux/designakum-design-system-final.md` | type, colour, spacing, motion. Brand value superseded |
| `ux/designakum-brand-asset-audit.md` | what assets exist. Diamond conclusion superseded |
| `ux/designakum-execution-plan.md`, `-implementation-roadmap.md`, `-designer-handoff.md` | sequencing and designer scope |
| `architecture/phase-1-audit.md` | **measured** reality of the running system |
| `architecture/publishing-model.md` | the publishing architecture, already accepted |
| `styles/globals.css` | the implemented token layer — the real authority on values |

### 0.2 Conflict register — resolved here

Seven conflicts exist between the older UX documents and what is now locked or
built. Each is resolved, not averaged.

| # | Conflict | Resolution |
|---|---|---|
| 1 | Docs say brand is `#2C6FE0` (7 files) | **`#2A6BCE`.** Measured from `logo-light.png` — 54,973 of 64,839 opaque pixels. The asset ships; the document was wrong |
| 2 | Docs describe a **diamond motif** as the mark (9 files) | **No diamond.** Use the existing wordmark and monogram. Nothing invented; the designer owns final iconography |
| 3 | Design system defines gradient tokens | **No gradients anywhere in product UI.** `--accent-gradient` and `--accent-glow` are already deleted; the primary button is a flat `--brand` fill |
| 4 | Blueprint §6.3: unpaid users "can look around, but changes will not save" | **Inverted.** Free users create and save. The paywall is publishing. §6.3's banner, its copy and its disabled SaveBar are void |
| 5 | `overview.md`: "entitlement gates WRITES, not reads" | Becomes **"entitlement gates PUBLISHING, not writing."** The invariant survives in form; its subject changes |
| 6 | `PreviewPane`: "no postMessage into the public page"; refresh is a save-driven URL bump | **Reversed deliberately.** The locked requirement is an instant live draft. §8 designs the replacement and keeps the one-renderer rule that actually mattered |
| 7 | Phase 0 checklist: "the existing 22 icons" | The set is **39**. The old count predates the foundation work |

Nothing in this table is a matter of taste. Each is a measurement or a locked
decision overriding an assumption.

---

## 1. What Designakum is

> **A portfolio management platform.** The client brings their work. Designakum
> provides the structure, the presentation and the publishing.

The client is an Arab freelance creative — a designer, photographer,
illustrator, video editor — who needs a professional presence and does not want
to build a website. They are not short of taste. They are short of time, and of
patience for tools that ask them to make a hundred decisions before showing
anything.

**Squarespace's simplicity, agency-quality presentation, portfolio management
underneath.** Not Wix. Not WordPress. Not a builder.

### 1.1 What this rules out

| We do not ship | Because |
|---|---|
| A canvas, a grid editor, drag-and-drop layout | Layout is our job. A client who can produce a bad layout will |
| Unlimited theming | A small set of good choices beats infinite mediocre ones. It is also what makes every Designakum site recognisably good |
| Plugins, blocks, custom CSS | Every escape hatch is a support burden and a way to break the presentation we are selling |
| A page tree | There is one portfolio. Sections, not pages |

**The line:** the client controls **content and emphasis**. Designakum controls
**structure and presentation**. Every feature request gets sorted into one of
those two boxes before it gets designed.

### 1.2 The one-sentence promise

> Bring your work. Have a portfolio you are proud to send, in an afternoon.

---

## 2. Locked decisions

**Business.** Free account, free dashboard, free creation, free private
preview. Payment unlocks publishing and the live URL. Cancellation runs to the
end of the paid period. Comps are a separate internal entitlement path.

**Preview.** Option A — inside the authenticated Studio only. No public preview
links, and never a shareable URL. It is the **real portfolio renderer running
on draft data** (§8.2, §8.5): not a thumbnail, not a screenshot, not a mock
card. Typography, spacing, responsive behaviour, RTL and first-paint entrances
are all the real page's. The draft it renders **is persisted** — superseding
the original "not a saved version", which assumed save-is-live.

**Publishing.** Draft and published are separate states:
**edit → draft → preview → publish**. See §8.5.

**Brand.** `#2A6BCE`. Flat. No gradients, no glow, no fake depth. Premium
through spacing, typography, hierarchy and restraint. Existing wordmark and
monogram; the designer delivers final SVGs and iconography.

**Type.** Manrope for Latin UI. Reem Kufi for Arabic display — headings and
eyebrows only; Arabic body stays IBM Plex Sans Arabic. Latin numerals in both
languages. Arabic is a layout mode, not a mirror.

**Products.** `/console` for the operator, `/studio` for the client. `/admin`
keeps working until it is empty.

---

## 3. The five design laws

From the Lumetra teardown, stripped of Lumetra's visual language. These are the
acceptance criteria for every screen in this document.

1. **Every screen answers one question, named in its own eyebrow.** If a screen
   needs two leads, it is two screens.
2. **Numbers are sentences.** A figure arrives with a noun phrase and a
   qualifier. Never a bare `12`.
3. **Summaries are navigation.** Reading and acting are one gesture. No
   dashboard that reports something you then have to go find.
4. **The client's model is a true projection of the operator's** — simpler,
   never different. The Studio may hide a fact; it may never contradict one.
5. **Every state names its exit.** Stuck things say what clears them. Empty
   screens say what they mean. Absent values are worded, not blank.

### 3.1 What we deliberately do not take from Lumetra

Its density (our client visits for ten minutes a month, not eight hours a day),
its dark-first palette (we sell a premium creative product; **light is the
theme to perfect first**), its four themes, its demo-data mode — for us an empty
workspace is a real and common state, so that effort goes into first-run — and
its visual identity entirely.

### 3.2 The vocabulary rule

The Studio never says: tenant, slug, workspace ID, environment, subscription
status, entitlement, RLS, row, sandbox, `published_at`, comped, `past_due`.

| System fact | What the client reads |
|---|---|
| `tenants.slug` | "Your address" — `designakum.site/noura` |
| entitled = false | "Your portfolio is not published yet" |
| `status='past_due'` | "There's a problem with your payment — 4 days to fix it" |
| `published_at IS NULL` | "Not published yet" |
| `status='canceled'`, in period | "Live until 1 September" |
| `tenants.status='disabled'` | "Paused — contact us" |
| `comped` | "Your account is active" — never "you are a comp" |
| `projects` (the table) | **"work"** collectively, **"piece"** singly. "Projects" is a schema word and stays in the schema |
| draft ahead of published | "Your latest changes aren't live yet" — never "unpublished revisions" |

The Console may use the real words. It is an operator tool and precision beats
gentleness there.

---

## 4. Business model and the publishing boundary

Full architecture in [publishing-model.md](../architecture/publishing-model.md).
The product-facing summary:

```
  create account ........ free
  dashboard ............. free
  edit profile .......... free
  upload your work ...... free
  private preview ....... free
  ──────────────────────────────  the line
  public URL ............ paid
  custom domain ......... paid
```

**The custom domain sits on the paid side and is easy to get wrong** — it lives
in the same policy list as content and reads like a setting, but a domain *is*
a live public URL.

**The emotional design of the line.** The paywall is not a wall in the middle of
the work. It is the last step, and it arrives when the client has something they
are proud of. The moment reads:

> **Your portfolio is ready.** Activate it when you are.

Not "upgrade to continue". Nothing is taken away, nothing is locked mid-task,
and the work is already done and saved. This is the single most important
sentence in the product and it is the reason free creation exists at all.

---

## 5. The complete user journey

Fifteen stages. For each: goal, emotion, UI, the confusion we expect, and the
answer.

### 1 · Signup
**Goal** get in and see if this is for me · **Emotion** mild scepticism; every
tool asks for a card
**UI** one card, four fields: email, password, name, address. Live address
preview `designakum.site/noura`. No plan choice, no card, no pricing.
**Confusion** "am I about to be charged?"
**Solution** the form says *free to build — pay only when you publish*, before
the button, not after.

### 2 · Email verification
**Goal** finish signing up · **Emotion** impatience; a detour
**UI** "Check your inbox" with the address shown and a resend that is throttled
and says so.
**Confusion** mail is slow or filtered; the user retries and thinks it broke.
**Solution** name the sender and the subject line on screen so it can be
searched; the link is valid 24h and **reusable**, so a scanner pre-fetching it
does not burn it.

### 3 · First login
**Goal** start · **Emotion** curiosity, a little pressure
**UI** land directly in the Studio. Not a tour, not a modal.
**Confusion** "where do I begin?"
**Solution** the empty state *is* the first task — see stage 4.

### 4 · Empty dashboard
**Goal** understand what this will become · **Emotion** the blank-page problem
**UI** **the most important screen in the product.** Not a dashboard: a single
question, "Let's start with your name", and three steps visible —
name → photo → first project. The preview panel is already there, already
showing the real empty portfolio.
**Confusion** an empty portfolio looks broken.
**Solution** the preview shows the frame with placeholders, never a 404 and
never a nameless card. Empty is a designed state.
> Why name first: an unnamed portfolio does not render at all. It is the one
> field with a structural consequence, so it is the one we ask for first.

### 5 · Portfolio creation
**Goal** put myself into it · **Emotion** flow, if we do not interrupt
**UI** the editor column beside a live preview. Fields grouped as the visitor
reads them: who you are → what you do → your work → how to reach you.
**Confusion** "is this saved?"
**Solution** an explicit save state that is always visible and never a mystery —
see §6.4. Never autosave silently; never leave "Saved" ambiguous.

### 6 · Adding first project
**Goal** show the work · **Emotion** pride, and perfectionism
**UI** one project = cover image, title, description, optional link. Order by
drag, and order is the only layout control they get.
**Confusion** "how many do I need? what if it's not finished?"
**Solution** the empty state says three to six is a portfolio, and that they can
add more later. Answer the real question, which is *is this enough*.

### 7 · Uploading media
**Goal** get my images in, looking right · **Emotion** anxiety about quality
**UI** drop or pick; crop to the frame the presentation needs; the preview
updates **before the upload finishes**.
**Confusion** heavy files, slow connections, "did it work?"
**Solution** compress before upload and show the local file instantly in the
preview (§8.4). If compression fails, the original is uploaded — an upload is
never blocked by an optimisation.

### 8 · Editing content
**Goal** get it right · **Emotion** iterative, fiddly
**UI** edit, see it, adjust. Bilingual fields are two inputs on one control, not
two screens; the language toggle switches the whole surface.
**Confusion** "which language am I editing?"
**Solution** the toggle changes the chrome as well as the content, so the
question cannot arise. Arabic-empty and English-filled is a visible state, not a
silent one.

### 9 · Live preview
**Goal** see the real thing · **Emotion** this is the moment of delight
**UI** a real device frame, desktop and mobile, updating as they type. §8.
**Confusion** "is this what visitors see, or an approximation?"
**Solution** it *is* the public page, rendered by the same code. The panel says
so: **"This is your live portfolio"** / after publishing, the real URL.

### 10 · Publishing
**Goal** go live · **Emotion** pride, then a beat of doubt
**UI** one primary action. Before it: a short summary of what will become
public. After: the URL, copyable, with a link to open it.
**Confusion** "can I undo this? who can see it?"
**Solution** unpublish is always available and never charges anything; the
confirmation names the address and says it can be taken down at any time.

### 11 · Payment wall
**Goal** publish · **Emotion** the decision point
**UI** reached only from Publish. Two plans, one difference — monthly or yearly
with the saving stated as money, not a percentage. The riyal is the official
symbol image, never spelled out. Latin numerals.
**Confusion** "what am I actually buying? what happens to my work if I don't?"
**Solution** two lines: *publishing and your live address*; *your work stays
saved either way*. The second sentence is why the free tier exists — say it
here.

### 12 · Successful activation
**Goal** confirm it is real · **Emotion** relief and pride — **the peak**
**UI** the live URL, large, copyable, with "open" and "share". A moment, then
the Studio returns to normal with a small persistent "Live" marker.
**Confusion** "is it really live? will people find it?"
**Solution** open the real URL in a new tab from here. Do not simulate it.
> This is the one place motion earns a flourish: a single 300ms entrance on the
> URL card. `--ease-pop`, 6% overshoot, once. Nothing else in the product moves
> like this, which is what makes it register.

### 13 · Managing a live portfolio
**Goal** keep it current · **Emotion** low-stakes maintenance
**UI** the same Studio, with a persistent live marker and the address in the
header.
**Confusion** **"when do my edits appear on the real site?"**
**Solution** settled by §8.5: **when you publish.** Editing changes the draft
only; visitors see the published state until the client promotes it. The
interface says so in one sentence — *"Your latest changes aren't live yet"* —
and the Studio home carries the unpublished item until it is cleared.

### 14 · Cancellation
**Goal** stop paying · **Emotion** either "too expensive" or "done with it"
**UI** cancel is findable, not buried. The confirmation states the real date:
*"Your portfolio stays live until 1 September."*
**Confusion** "does my site vanish now? do I lose my work?"
**Solution** it stays live to the period end — already the shipped behaviour —
and the content is never deleted. Both said in the confirmation, not in a help
page.
> Structurally protected: PayPal drops `next_billing_time` on cancellation, and
> writing that null would take the site dark immediately — the promise exactly
> inverted. `keepPeriodEnd()` is what prevents it. Do not regress it.

### 15 · Expired subscription
**Goal** understand what happened; maybe come back · **Emotion** embarrassment,
or indifference
**UI** the Studio still opens. Everything is still editable. One calm banner:
*"Your portfolio is offline. Your work is safe. Reactivate to bring it back."*
**Confusion** "have I lost it?"
**Solution** nothing is deleted, the publish intent is remembered, and paying
restores the site with no further action. Editing stays free because they are
already a customer we would like back.

---

## 6. Studio blueprint

The client-facing product. Roomy variant of the shell: 264px nav, 960px content
column, generous vertical rhythm.

### 6.1 Navigation

Derived from `lib/shell-nav.js`, which derives from `lib/admin-nav.js`. One IA.

```
  YOUR PORTFOLIO          ← eyebrow (Reem Kufi in Arabic, tracked caps in Latin)
    Overview
    Profile
    Home Page
    Work
    Links
    Appearance

  INSIGHTS
    Visitors

  SETTINGS
    Address
    Plan
    Account
```

Three renames from the current admin, all applying law 5 and the vocabulary
rule: **Projects → Work** (see §3.2 — "projects" is a schema word, and the
client's output is a shoot, a collection, a case study or a piece),
**Analytics → Visitors** (a noun the client cares about), **Workspace →
Address** (what it actually is). *Subscription → Plan.*

### 6.2 Overview — the home screen

Answers one question: **what should I do next?**

| Client state | The screen is |
|---|---|
| Empty | The three-step first run. Nothing else on the page |
| Building | "Your portfolio so far" — the preview, plus the two or three things that would most improve it, each a link to the field |
| Ready, unpublished | **The activation moment.** "Ready when you are." + Publish |
| Live, up to date | The address, a copy button, recent visitors as one sentence, and "what to add next" |
| Live, changes not yet live | *"Your latest changes aren't live yet"* + Publish. The queue carries the same item until it is cleared — this is what stops a client editing for a week and never publishing |
| Offline | The calm reactivation banner, then normal Overview beneath it |

Law 3: every item here is the link to the thing it names. Nothing reports a
problem you then have to go find.

### 6.3 The editor

Two columns on desktop: editor left, preview right. Below 1100px the preview
collapses to a toggle — never a shrunken unusable frame.

Sections, in visitor-reading order:

| Section | Contains |
|---|---|
| Profile | name, title, bio, photo — the fields with structural consequence |
| Home Page | the card a visitor lands on: banner, tagline, stats, call-to-action |
| Work | the pieces themselves. Cover, name, description, link, order |
| Links | social and contact, as brand glyphs |
| Appearance | the small, safe set: accent, banner treatment, display font, density |

**Appearance is deliberately small.** It is where "not a website builder" is
either honoured or lost. Every option must be one we would defend in an agency
presentation.

### 6.4 Save and publish — two states, never conflated

Since §8.5 separated draft from published, **"Saved" no longer implies "live"**,
which removes the ambiguity this section was originally written to fight.

Saving concerns the client's work being kept:

```
  ● Unsaved changes      brand dot, live count      "3 changes"
  ✓ Saved                quiet, for 3 seconds then persists as a timestamp
  ! Could not save       what failed, what to do, and the work still in the box
```

Publishing concerns what visitors can see, and is a **separate, adjacent**
indicator — never merged with the one above:

```
  Only you can see this.              never published
  ● Your latest changes aren't live yet   draft is ahead of published
  ✓ up to date                        draft and published agree; no Publish button
```

**A count is not shown at rest.** "3 changes" answers a question nobody asked
while they are working. The count belongs to the publish confirmation, where it
is about to mean something — see §8.5.

An RLS-filtered write reports success having changed zero rows. Every save path
must inspect affected rows or a blocked save says "Saved" and discards the work.
This has happened.

### 6.5 Empty states — one law, applied five times

| Screen | Says |
|---|---|
| No work | "Your work goes here. Three to six pieces is a portfolio." + Add |
| No visitors yet | "Nobody has visited yet. Share your address to change that." + copy address |
| Not published | "Only you can see this." + Publish |
| No links | "Add the places people can find you." |
| Offline | "Your portfolio is offline. Your work is safe." + Reactivate |

Never: a blank panel, a spinner that ends in nothing, or the word "empty".

---

## 7. Console blueprint

The operator product. Tighter: 232px nav, 1280px content, compact rows.

**Attention over analytics. Action over charts.** The Console's job is to tell
one person what needs them today.

### 7.1 Dashboard — the attention queue

Not a metrics wall. A single ordered list of things that need a human, each row
a link to the thing:

```
  NEEDS YOU
    2  payments failed — grace ends in 3 and 5 days
    1  workspace created 6 days ago, never handed over
    2  sites not resolving — active workspace, subscription never activated
    1  domain added, DNS not pointing here for 9 days

  QUIET
    7  live and paid   ·   3 building   ·   1 offline
```

The second block is the whole business in one line — law 2, numbers as
sentences. If nothing needs attention, the queue says so in words and the screen
is mostly empty. That is a feature.

> The "sites not resolving" row is a real, currently-invisible condition: two
> owner tenants are `active` with a `pending` subscription, so their public
> sites 404 and nothing surfaces it.

### 7.2 Clients

A list that is a working surface, not a table dump. Per row: name, address,
state as a word, and the one number that matters for that state. Filter by
state; search by name or address.

### 7.3 Client record

One object, one place. Panels: Overview · Portfolio · Subscription · Access ·
Domain · Activity. Opening a client's portfolio opens **their Studio** — the
operator uses the client's product rather than a second copy of every editor.
That is the entire reason for the split.

### 7.4 Billing

Subscribers, revenue, failures. **Comps are counted separately and never in
revenue** — already true in the MRR calculation, and made structural by a
`paying_subscriptions` view.

### 7.5 Activity and Settings

Activity: what happened, newest first, filterable by client. Settings: platform
owners, plan catalogue, email templates.

---

## 8. Live preview architecture

The most important feature and the one genuine architectural change.

### 8.1 The requirement, and the conflict

Required: edit → see it instantly. No save, no refresh, no wait.

Today: `PreviewPane` iframes the real public page and reloads it by bumping a
query parameter **after a successful save**, explicitly with "no postMessage
into the public page". That is incompatible with the requirement, and the
requirement wins.

### 8.2 What must survive the change

The valuable half of the current design is not the reload mechanism — it is
**one renderer**. When the preview and the public page render from one
component, the preview cannot drift from production, cannot lie about type,
spacing, RTL or responsive behaviour, and costs nothing to keep in sync. Any
design that introduces a second *permanent* renderer is rejected on that ground
alone.

#### 8.2a When the two converge — decided 2026-08-20

> **One renderer means one final shipped renderer, not premature extraction of
> a legacy implementation.**

The audit that produced this decision found that `components/portfolio/PortfolioRenderer.js`
and today's `pages/index.js` are **not two versions of the same portfolio** —
they are two different products. The public page renders a ticker, a banner
slider, stats, CTA buttons, an About block with custom fields, social glyphs and
two modals, from `profile` + `projects` rows. The renderer renders a name, a
role, an introduction, links and a work grid, from a different data shape
entirely.

Forcing them together now would mean one of two bad trades: either the public
site changes (forbidden — the redesign of the customer's output is explicitly
out of scope, §6.1), or the Studio previews today's design instead of the one
being built.

**So the sequence is:**

1. `pages/index.js` stays **untouched**. It remains the public renderer, and it
   serves every client site through `pages/[slug].js`.
2. `PortfolioRenderer` continues to evolve as the **intended future** public
   renderer, previewed in the Studio.
3. Its contract stays compatible with **both** inputs — draft data from the
   Studio and published data from the public pages — so the migration is a
   change of caller, never a rewrite. Enforced by
   `tests/portfolio-renderer-contract.test.mjs`.
4. The migration happens **only** once `PortfolioRenderer` is feature-complete
   and approved as the new public portfolio. It is a shipping decision, not a
   refactor.

Until step 4, "one renderer" is a rule about where this is going, not a
description of today. Anything that claims the preview *is* the public page is
describing the destination.

### 8.3 The design — a draft channel into the same-origin iframe

```
   Studio editor
        │  every keystroke / choice
        ▼
   DraftContext          the working copy, in memory. Never persisted.
        │  postMessage, targetOrigin = exact origin
        ▼
   iframe  /{slug}?preview=1
        │  public page, preview mode: render from draft, not from fetch
        ▼
   The visitor's exact portfolio, live
```

**Mechanism**

1. **`DraftContext`** in the Studio holds the in-memory working copy, seeded
   from the **persisted draft** (§8.5) rather than from published content.
   Editors write to it; saving persists it; publishing promotes it. Note the
   change from the original design: the working copy is in memory, but the
   draft beneath it **is persisted** — a client must be able to close the
   laptop mid-edit and come back to unpublished work.
2. **Handshake.** The iframe posts `designakum:preview-ready` on mount; the
   Studio replies with the full draft. This removes the race where a message
   arrives before the page can receive it, and covers any reload.
3. **Updates** are posted on change, coalesced to one animation frame. The
   perceptual budget is `--t-press` (110ms) — beyond that it stops feeling like
   typing into a page.
4. **Sequence numbers** on every message; the receiver ignores anything older
   than what it has rendered, so out-of-order delivery cannot regress the view.
5. **The public page accepts a draft only when all of:** `?preview=1`, it is
   framed, `event.origin === location.origin`, and the message shape validates.

**Security — the part that must not be got wrong**

- `targetOrigin` is the exact origin. **Never `'*'`.** A draft is unpublished
  content; `'*'` would hand it to whatever managed to frame the page.
- The receiver checks `event.origin` too. Both sides, every message.
- Draft state is never persisted by the preview. The existing suppression of
  analytics and `localStorage` under `?preview=1` stays — a previewing owner
  must not inflate their own numbers, and the iframe shares the Studio's
  storage.
- Access to preview an unpublished portfolio is `can_preview_tenant(tid)` =
  `is_tenant_admin(tid)`, checked in Postgres and **failing closed**. The URL
  carries no capability, so it is not a shareable preview link — which is what
  makes Option A hold.

### 8.4 Media before upload

A chosen image must appear instantly, before it is uploaded. `URL.createObjectURL(file)`
produces a blob URL scoped to the origin — and the iframe shares the origin, so
it renders. On save, the file uploads and the blob URL is swapped for the
storage URL. **`revokeObjectURL` on discard or replace**, or a long editing
session leaks every image the client tried.

### 8.5 What "publish" means — decided

**Decided: draft and published are separate states.** Editing writes to the
draft; visitors see the published state; publishing promotes one to the other.
The client can always see changes before visitors do.

This **supersedes** the earlier recommendation of save-is-live. Publishing is
repeatable, not a one-time activation. The flow is
**edit → draft → preview → publish**.

**One renderer, two inputs.** One component renders both (§8.2, and the
sequencing decision below).
Preview feeds it the draft over the §8.3 channel; the public page reads the
published state. Two inputs, never two renderers. **A second renderer is
rejected however convenient it looks** — including at component level: the
Studio home preview and the editor preview are one component at two sizes.

**No preview mode.** The Studio shows the draft continuously, so "see it before
visitors do" is already satisfied. A preview *mode* would add a surface for
nothing.

**Storage.** The editor keeps writing to `profile` and `projects` — those rows
*are* the draft. Publishing serialises the current state into a published
snapshot per tenant, which the public page reads. One column and one function;
no existing write path is rewritten. Rejected: per-field draft columns (doubles
every write path) and a full version-history table (that is a versioning
system, and nothing here needs one).

**Media.** Never delete a storage object still referenced by the published
snapshot. Cleanup runs at publish, over objects referenced by neither the draft
nor the new snapshot. Deleting an image in the draft must not take the live
site's image dark.

**Entitlement.** Expiry gates whether the snapshot is **served**, never whether
it exists. Clearing published state on expiry would destroy the client's
published work. `keepPeriodEnd()` behaviour is unaffected.

**The forgotten-publish risk** — a client edits for a week and never publishes
— is answered by the Studio home being an attention queue (§6.2), which carries
the unpublished item persistently until it is cleared.

**Build order, decided 2026-08-20.** Everything built so far is frontend
against mock data; this is the first backend work, and it has one viable
sequence:

| # | Step |
|---|---|
| 1 | Define the published snapshot model |
| 2 | Implement promotion from draft to snapshot |
| 3 | Move the public renderer to snapshot reads |
| 4 | Generate share images ([../design/share-image.md](../design/share-image.md)) |

Share images come **last** and depend on all three: there is nothing to
generate from until a snapshot is real. Step 3 is also the point at which
"published" stops being a design and becomes a state.

**The count belongs to the confirmation, not the chrome.** At rest the header
says *"Your latest changes aren't live yet."* The publish confirmation names
what will change in plain language — *"your bio, and 2 pieces"* — plus any AI
suggestions the client has not looked at. It is not a diff view; a diff is a
builder pattern.

### 8.6 Rejected alternatives

- **Render the public page inside the Studio's React tree.** No second renderer
  in principle, but the public page's globals and behaviour would run inside the
  Studio, and the device frame would stop being a real viewport. Rejected.
- ~~**Persist a draft row per tenant.**~~ **This rejection is void.** It was
  argued from save-is-live, where a draft was merely unsaved work. §8.5 now
  separates draft from published, so a persisted draft is required — and the
  adopted design inverts the original objection: the existing rows are the
  draft, and it is the *published* copy that is serialised.
- **Keep save-then-refresh.** Fails the requirement.

---

## 9. Content model

What a portfolio *is*, independent of screens. Already the shape in `profile`
and `projects`; stated here so the redesign does not invent a second one.

```
Portfolio
├── Identity      name · title · bio · photo          bilingual {ar,en}
├── Home card     banner · tagline · stats · CTA      bilingual
├── Projects[]    cover · title · description · link · order
├── Links[]       platform · handle · url             brand glyph, not emoji
├── Appearance    accent · banner style · font · density
├── Address       slug, and optionally a custom domain
└── Publication   published_at · live URL
```

**Rules.** Every client-authored string is `{ar, en}` and read through
`pick(field, lang)`. Latin numerals in both languages. Every public link passes
`safeUrl()` **at render**, never at save — input is stored raw. An empty
portfolio is a valid portfolio; `hasPublicContent()` decides whether the public
page renders content or the "not set up" state, and it counts *what a visitor
would recognise as a portfolio* — not whether any field is populated.

---

## 10. Brand and UI system

Values are in `styles/globals.css`, which is the authority. What matters here is
how they are used.

**Colour.** `--brand: #2A6BCE` means one thing: *act here*. Primary buttons,
active navigation, focus rings, links. It is never decoration and never a
status. Status is `--success` / `--warning` / `--danger` / `--neutral`, and
informational states are **grey on purpose** — an informational chip sharing the
accent stops the accent meaning anything.

**Flat.** No gradient, no glow, no fake depth. Elevation is `--shadow-*` on
things that genuinely float — modals, menus. A button does not float.

**Type.** One lead per screen at `--text-4xl` (44px); if a screen needs two, it
is two screens. Page titles `--text-3xl`. Tracking tightens as size grows
(`--track-tight`, `--track-lead`) and only Latin eyebrows are tracked and
uppercased — **Arabic eyebrows use Reem Kufi, no tracking, no case change, one
size up, brand-tinted.** Uppercase and letter-spacing damage Arabic, which is
the one place copying the reference visually would have hurt us.

**Arabic is a layout mode.** `dir="rtl"` flips the shell, the navigation, the
active rule and every logical property. What does **not** mirror: numbers,
Latin-script credentials, the play triangle, brand glyphs, and charts read
left-to-right. Body line-height is 1.75 in Arabic against 1.55 in Latin.

**Motion.** `--t-press` 110ms for press, `--t-ui` 220ms for hover and colour,
`--t-enter` 300ms for entrances. `--ease-pop` overshoots 6% — enough to feel
physical, not enough to be playful. Precise, calm, geometric. Reduced motion is
respected, with the skeleton shimmer exempt: a skeleton that stops moving reads
as broken, not as calm.

**Density.** Console tight, Studio roomy. Both from the same tokens.

---

## 11. Visual trial

`docs/ux/prototype/studio-trial.html` — a self-contained mockup of the desktop
Studio using the real tokens, with light/dark, English/Arabic, and the
unpublished and live states. Not production code; a thing to look at and
approve or reject.

---

## 12. Decisions requiring approval

Ordered by how much they block.

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| 1 | **Save-is-live vs staged changes** (§8.5) | the entire editor and stages 10, 13 | **A — save is live**, stated plainly in the UI |
| 2 | **Storage quota for free accounts** | opening the free tier | a per-tenant cap before launch; the only item with a direct cost |
| 3 | **Does a free user hold their address indefinitely?** | signup copy | expire an unpublished, untouched address after a stated period, or accept the squatting |
| 4 | **Appearance option set** | the Appearance section | keep it to accent, banner, font, density until the designer says otherwise |
| 5 | **Comp separation** (`publishing-model.md` §1.2) | nothing | a `paying_subscriptions` view; do not migrate seven live rows |
| 6 | **Content check on publish** — SQL or client | the publish RPC | minimal SQL check for a name; the client is not an authority |
| 7 | **Two owner sites currently 404ing** | nothing — but it is live | confirm whether the `monthly` one is intentional |

---

## 13. What happens next

Not implementation — the order implementation should take once this is
approved.

1. Approve or amend this blueprint, and answer decision 1.
2. Publishing model steps 1–5 (`published_at`, predicates, resolver gate,
   preview access, signup change) — all invisible to users.
3. The live draft channel (§8), behind the existing preview panel.
4. RLS step 6, alone: the free tier opens.
5. Publish/unpublish, and the Studio states.
6. Migrate screens into `/studio` one at a time, Account first — self-contained,
   present in both products, no preview or billing coupling.
7. `/console`, same method.
8. Retire `/admin` when it is empty.
