# Designakum — the master blueprint

**Realignment before further implementation.** Written 2026-08-14 against `main`
at `613f96d` — clean tree, 539 tests, build green. No product code.

This is the authority. Where any earlier document disagrees, this wins.

---

## 0. What was wrong, what was right, what is new

Precision matters more than contrition here, so this separates the three.

### 0.1 The drift was positioning, not mechanism

I described the model as a **free tier** — in `designakum-blueprint.md`, in
`publishing-model.md`, and it leaked into UI copy as the client state
*"Free — building"*.

The mechanism I designed is the journey you describe: account → build → Studio →
pay → published, with payment gating publication. **That part is unchanged and
still correct.** What was wrong is the frame around it, and a frame becomes real
the moment it reaches a label.

| | "Free tier" *(wrong)* | "Build, then subscribe" *(right)* |
|---|---|---|
| Implies | a permanent free product with an upgrade path | one product, one price, and a beginning |
| The unpaid state is | a plan somebody chose | the first part of the journey |
| The customer is | a free user we hope converts | a customer who has not finished signing up |
| The UI says | "Free — building", "Upgrade" | "Not published yet", "Publish" |
| Marketing could say | "Free plan available" | "Build it, then publish it" |

**The correction is absolute in vocabulary and unchanged in architecture.**
Nothing in `publishing-model.md` §1–§8 changes: `published_at`, the resolver
gate, the split edit predicate, `can_write_media`, the publish RPC. Only the
words around them.

### 0.2 The words that must disappear

| Retired | Replacement |
|---|---|
| Free tier, free plan, free account, free user | *(no noun — it is not a plan)* |
| "Free — building" *(Console)* | **Building** |
| "Free — building" *(Studio)* | **Not published yet** |
| Upgrade | **Publish** — the action, not a tier change |
| Trial | *(unused — we do not run one)* |
| Freemium | *(never)* |

There is no word for the unpaid state because it is not a thing you are on. It
is a thing you have not done yet.

### 0.3 One question this sharpens

*"Does an unpaid account hold its address forever?"* Under a free tier, yes —
they are a user. Under this frame, an account that never subscribes is an
**abandoned signup**, and holding `designakum.site/noura` indefinitely for
somebody who left is a cost with no counterpart. **Recommendation:** state a
period (90 days without publishing and without edits), warn by email, then
release the address. Decision D3 in §9.

### 0.4 What is genuinely new

**Complimentary portfolios as an owner capability** (§4). This is not the free
tier under another name and must never share its plumbing.

### 0.5 Priority, confirmed

1. Console · 2. Studio · 3. Publishing/payment boundary · 4. Client-facing.

This matches the current plan with one adjustment: publishing moves *after*
Studio, so the Studio is designed whole and then given its paywall, rather than
built around one.

### 0.6 One thing I will push back on

My Console blueprint said motion in the Console should be near-absent, and
banned `--ease-pop` there outright. **That was over-corrected.** "Calm" and
"lifeless" are different, and §7 replaces it: the Console gets full feedback and
full state-change continuity. What it does not get is *celebration* — the
overshoot on a panel that arrives, yes; a flourish for finishing a list, no.

---

## 1. Product philosophy

**Designakum is a portfolio management platform.** The client brings the work;
Designakum provides the structure, the presentation and the publishing.

Two products, one company:

- **Console** — internal operations. How Designakum is run.
- **Studio** — *the product itself*. Where the customer's portfolio is made.

The Console makes the business legible. The Studio is what people pay for. Both
are judged by one question: **does the person always know what is happening, why
it matters, and what to do next?**

### The three questions every screen answers

1. **What is happening?** — stated as a sentence, not a status code.
2. **Why does it matter?** — the consequence, in the same breath.
3. **What should I do?** — one obvious action, or an honest *nothing*.

A screen that cannot answer all three is not finished.

### Information restraint

The interface is confident because it shows less. Before any element ships:
**does this change a decision?** If not, it is decoration, and decoration in an
operations tool is noise the operator pays for on every visit.

---

## 2. Console architecture

### 2.1 Navigation and titles

Short nouns in the sidebar; a human sentence as the screen's lead. The nav is
for finding; the lead is for orienting.

| Nav | Lead | Support |
|---|---|---|
| **Today** | *What needs you today.* | "Five things do." / "Nothing does." |
| **Clients** | *Everyone trusting Designakum.* | "Fourteen people have a portfolio with us." |
| **Finance** | *Where the money is safe, and where it needs attention.* | "Nine paying, two at risk." |
| **Activity** | *Everything that happened.* | "The last seven days." |
| **Settings** | *How Designakum itself is set up.* | — |

> I have kept your phrasings. One caution worth recording: *"Everyone trusting
> Designakum"* is warm and is right for a fourteen-client business — it would
> read as precious at four hundred. Revisit it then, not now.

### 2.2 Screens

**Today** — the attention queue, grouped by consequence, each group carrying a
definition and an exit condition. Rows are links; the one blue button per row is
the action that *clears* it. Empty is the goal, and the empty state is a
finished screen.

**Clients** — one roster, filtered by state. Not two lists. Each row: who, their
address, one state sentence, and the single number that matters *for that
state*. Ends with the ghost **+ Add a client** row, which opens §4's fork.

**Client record** — one page, no tabs: header · needs-you · portfolio · money ·
access · domain · notes · **Technical details** (collapsed). One object, one URL,
everything.

**Finance** — sentences, not tiles. At-risk first, renewals next, complimentary
listed separately and never in revenue. No charts at this scale.

**Activity** — what happened, newest first, filterable by client.

### 2.3 Terminology

Full tables live in [`console-blueprint.md`](console-blueprint.md) §3 and stand,
with §0.2 above applied. The rule: the Console may be more *precise* than the
Studio; neither may be *technical*. `tenant`, `slug`, `workspace`, `comped`,
`past_due`, `entitlement` and `environment` appear only inside **Technical
details**.

---

## 3. Studio architecture

**The Studio is not an admin panel. It is a creative workspace**, and it is the
thing being sold. Figma's simplicity, Framer's preview confidence, Lumetra's
restraint.

### 3.1 Layout

```
┌──────────────┬────────────────────────────┬──────────────────────────┐
│  Navigation  │  Editor                    │  Live preview            │
│  264px       │  one column, 640px         │  real renderer, framed   │
│              │  generous vertical rhythm  │  desktop / mobile        │
└──────────────┴────────────────────────────┴──────────────────────────┘
```

The preview is **not a panel you can close and forget**. It is half the product.
Below 1180px it becomes a toggle rather than a squeezed frame — a preview too
small to judge is worse than none.

### 3.2 Sections, in the order a visitor reads

| Section | Contains |
|---|---|
| **Overview** | what to do next; the publish surface |
| **Profile** | name, title, bio, photo |
| **Home page** | banner, tagline, stats, call to action |
| **Projects** | the work — cover, title, description, link, order |
| **Links** | where to find them |
| **Appearance** | a small, defensible set: accent, banner, font, density |
| **Visitors** | who came |
| **Address** · **Plan** · **Account** | settings |

**Appearance is deliberately small.** It is where "not a website builder" is
kept or lost. Every option must be one we would defend in an agency
presentation.

### 3.3 Draft and published, made unmistakable

The single largest source of confusion in a product like this is *"is what I
see what the world sees?"* It is answered in three places at once:

1. **A persistent state marker** in the header: `Not published` / `Live` /
   `Live · unsaved changes`.
2. **The preview's own caption**: *"Only you can see this"* / *"This is your
   live portfolio"*.
3. **The save control**, which never leaves the screen and never lies (§7.4).

---

## 4. Complimentary portfolios

An **owner-granted exception**, for partnerships, showcase clients, friends,
early adopters and marketing examples. It is not a tier, it is not a plan, and
it must never share plumbing with subscriptions.

### 4.1 The journey

```
  Console · + Add a client
        ↓
  Name · email · portfolio address
        ↓
  ┌─────────────────────────────┬──────────────────────────────┐
  │  Standard customer          │  Complimentary               │
  │  they subscribe to publish  │  we sponsor it               │
  └─────────────────────────────┴──────────────────────────────┘
        ↓                              ↓
  Branded invite email           Branded invite email
  "Build your portfolio"         "We've set one up for you"
        ↓                              ↓
  Studio: builds                 Studio: builds
        ↓                              ↓
  They publish (pays)            Publishes — no payment, ever
```

Both branches produce the same account, the same Studio and the same portfolio.
**Only entitlement differs**, and only the owner can grant it.

### 4.2 Why it must not be a subscription row

Today a comp *is* a subscription: `status='comped'`, `plan_code='comped'`,
`provider='none'`. In `publishing-model.md` §1.2 I recommended leaving that
alone — the risk of migrating the entitlement path of seven live client sites
outweighed a modelling preference.

**That recommendation is now outdated, and I am revising it.** A product
requirement has arrived that the old shape cannot carry cleanly:

- a distinct creation flow with its own invite;
- a distinct reason recorded (*partnership · showcase · friend · early adopter*);
- an owner control to sponsor or withdraw sponsorship independently of billing;
- the standing rule that comps never touch revenue.

Modelling all of that as a fake subscription means every one of those becomes a
special case inside billing. The requirement changed the calculus; the risk did
not go away, so the migration is **additive-first and never a cutover**.

### 4.3 Shape

```sql
comp_grants
  tenant_id     uuid  PK -> tenants
  granted_at    timestamptz
  granted_by    uuid  -> auth.users        who sponsored it
  reason        text  partnership | showcase | friend | early_adopter | other
  note          text  free text, owner-visible only
  ends_at       timestamptz NULL           null = indefinite
```

Entitlement becomes a union, and this is the whole safety story:

```sql
tenant_has_active_subscription(tid) :=
      has_comp_grant(tid)          -- new
   OR has_paid_subscription(tid)   -- exactly today's rule, minus 'comped'
```

**Migration, in order, each step reversible:**

1. Create `comp_grants`. Nothing reads it.
2. Backfill the 7 existing comps into it, **leaving their subscription rows in
   place**.
3. Switch entitlement to the union. It now returns true via *both* paths for
   those 7 — belt and braces, and the moment to verify all seven sites still
   resolve.
4. Only then, delete the `status='comped'` subscription rows. Entitlement is
   already coming from the grant, so this changes nothing observable.
5. `paying_subscriptions` becomes the plain table, and revenue maths stops
   needing a filter it must remember.

Step 3 is the one to watch: it is the only step where seven live sites depend on
a function change.

### 4.4 In the interface

**Console** — complimentary clients appear in Clients like anyone else, with the
state **Complimentary · partnership**. Finance lists them separately, never in
revenue. The record's Money block reads *"Sponsored by Designakum since March —
partnership"* with **Withdraw sponsorship** as a quiet action.

**Studio** — the client sees **Live**. They are never told they are a comp, and
never shown a price. §0.2's rule holds: the client's model is simpler, never
different.

---

## 5. The customer journey

Unchanged from the locked model; restated with §0.2's vocabulary.

| # | Stage | What the customer sees |
|---|---|---|
| 1 | Signup | One card. *"Build it, then publish when you're ready."* No card, no plan choice |
| 2 | Verify | *"Check your inbox"* — sender and subject named so it can be searched |
| 3 | First open | The Studio, on the first task. Not a tour |
| 4 | Building | Editor and live preview. Everything saves. Marker reads **Not published yet** |
| 5 | Ready | Overview becomes *"Your portfolio is ready."* Publish is the obvious next step |
| 6 | Publish → pay | The paywall, reached only from Publish. Two plans, one difference. *"Your work stays saved either way"* |
| 7 | Live | The URL, large and copyable. The one celebratory moment in the product |
| 8 | Maintaining | Same Studio, **Live** marker, address in the header |
| 9 | Cancelling | *"Your portfolio stays live until 1 September."* Already the shipped behaviour |
| 10 | Lapsed | Studio still opens, everything still editable. *"Your portfolio is offline. Your work is safe."* |

The paywall is not a wall in the middle of the work. It is the last step, and it
arrives when there is something worth publishing.

---

## 6. Preview architecture

**The signature experience.** Where Designakum wins, and the one real
architectural change in the whole plan.

### 6.1 The rule

> **One renderer.** Draft state feeds the preview. Published state feeds the
> public website. Both are the same code. There is never a second renderer, and
> never a fake preview.

### 6.2 How

```
   Editor keystroke
        ↓  in memory — never persisted
   Draft state
        ↓  postMessage, exact origin, coalesced to one frame
   iframe  /{slug}?preview=1
        ↓  public page renders from draft instead of its fetch
   Exactly what a visitor would see
```

- **Handshake**: the frame announces itself on mount; the Studio replies with
  the full draft. No race, and reloads recover.
- **Sequence numbers**: an older message can never overwrite a newer view.
- **Accepted only when** `?preview=1`, framed, and `event.origin ===
  location.origin`. `targetOrigin` is the exact origin, **never `'*'`** — a
  draft is unpublished content.
- **Access** is `is_tenant_admin(tid)`, checked in Postgres, **failing closed**.
  The URL carries no capability, so it is not a shareable preview link.
- **Images appear before upload** via object URLs, which work because the frame
  shares the origin. Revoked on discard.

### 6.3 What this replaces

Today the preview reloads the iframe by bumping a query parameter **after a
save**. That is incompatible with the requirement and is deliberately reversed.
What survives is the half that mattered: one renderer, so the preview cannot
drift from production.

### 6.4 The question this leaves

For an already-published portfolio, the public page reads the rows the editor
writes — so **saving is publishing**. Either we accept that and say so
(*"Changes go live when you save"*), or we build staged changes, which is a
content-versioning system. Recommendation and trade-offs in D1, §9.

---

## 7. Motion

Motion is not decoration on top of the layout; it is how the product tells the
truth about what just happened. All values are existing tokens.

```
  --t-press  110ms   press feedback — inside the window where input feels instant
  --t-ui     220ms   hover, colour, opacity
  --t-enter  300ms   panels, modals, entrances
  --t-stag    60ms   per-item stagger
  --ease             decisive settle
  --ease-pop         6% overshoot — things that ARRIVE
  --ease-exit        accelerate away
```

### 7.1 Immediate feedback — every action acknowledges itself

| Interaction | What moves | Timing |
|---|---|---|
| Button press | compress to `scale(.985)` + colour step | `--t-press`, `--ease` |
| Hover | colour and border only — never size | `--t-ui` |
| Toggle / switch | knob travels; track colour crosses with it | `--t-ui`, `--ease` |
| Focus | ring appears at full opacity immediately | 0ms — a focus ring that fades in is a focus ring you miss |

A press that takes longer than ~110ms to acknowledge stops feeling like a press.
This is one global `:active` rule; every component inherits it without knowing.

### 7.2 State changes are continuous, never teleports

- **An attention row resolved** — the row fades and collapses its own height
  (`--t-enter`, `--ease-exit`), the group count ticks down (`--t-ui`), and if the
  group empties it is replaced by its "nothing here" line. The operator *sees*
  the queue shorten, which is the reward for clearing it.
- **A project added** — the row enters with a 6px rise; the preview grows its
  tile in the same beat.
- **A list reordered by drag** — positions animate via transform, `--t-ui`. Never
  a jump.
- **A status changing** — the chip cross-fades its colour and label together.
  Colour and words must not change on different frames.

### 7.3 Navigation

Content changes with a fade plus a 4px rise (`--t-enter`, `--ease`). The
navigation itself does not move — the destination changed, not the furniture.
Stagger is available at `--t-stag` for lists arriving, capped at the first six
items; beyond that it reads as slow.

### 7.4 Saving — never a spinner swap

```
  Save   →   Saving, with the label filling left-to-right   →   ✓ Saved   →   Saved · just now
           (progress the button makes itself)                  (700ms)        (persists)
```

The button never disappears, never becomes a spinner, and never leaves the
question open. On failure it becomes **Could not save** with the reason and the
work still in the box.

### 7.5 The preview is exempt

**Edits reach the preview with zero animation.** The point of the signature
experience is that the page responds like a page — animating a text change would
add latency to the one interaction that must feel instant.

The only exception: a **newly added block** enters with a rise, because
something appearing from nowhere is disorienting. Changing content is instant;
arriving content moves.

### 7.6 Budget and restraint

- **One animated thing per user action.** If two things want to move, one of
  them is decoration.
- **Nothing loops** except the skeleton shimmer, which is exempt from reduced
  motion because a skeleton that stops moving reads as broken.
- **`--ease-pop` is for arrival**, not for celebration — panels, modals, toasts.
  The single celebratory moment in the product is the live URL at stage 7.
- **Reduced motion** removes movement, never feedback: colour and opacity still
  respond.

---

## 8. Visual trials

Two interactive pages. Not wireframes, not screenshots — they run, so motion can
be judged rather than described.

| File | Shows |
|---|---|
| `docs/ux/prototype/studio-trial.html` | The Studio: **type in a field and watch the preview change**, save with real progress, add a project, draft and live states. Light/dark, EN/AR |
| `docs/ux/prototype/console-trial.html` | The Console: attention queue with **rows that resolve and animate away**, the roster, a client record, Finance, and the **+ Add a client** fork with the complimentary branch. Light/dark, EN/AR |

---

## 9. Decisions requiring approval

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| **D1** | **Save-is-live, or staged changes?** For a published portfolio, saving currently publishes | The whole editor | **Save is live**, said plainly in the header. Staged changes is a versioning system and the largest uncertain thing in the plan |
| **D2** | Storage limit for accounts that have not published | Opening building-before-paying | A stated cap. The only item with a direct cost |
| **D3** | Does an unpaid account hold its address forever? (§0.3) | Signup copy | Release after 90 days without publishing or edits, warned by email |
| **D4** | `comp_grants` migration — approve §4.3? | Complimentary portfolios | Yes, additive-first. Step 3 is the one to watch |
| **D5** | Appearance option set | The Appearance section | Accent, banner, font, density. Nothing else until the designer says otherwise |
| **D6** | Marketing alignment: designakum.com must not advertise a free plan (§0.1) | Out of scope here, but it is the same promise | Flagged for the marketing site |

---

## 10. Implementation order

Nothing below is built.

**Console** — 1. state→sentence mapping module (pure, tested) · 2. Today,
read-only · 3. Clients roster · 4. Client record · 5. inline actions
*(first writes)* · 6. Finance · 7. Add-a-client with the complimentary fork ·
8. Activity.

**Studio** — 9. draft state + preview channel *(the signature)* · 10. editors
onto draft state · 11. save with real feedback · 12. draft/published clarity.

**Boundary** — 13. `published_at` + resolver gate · 14. `can_edit_content` split
+ `can_write_media` · 15. publish/unpublish RPC · 16. paywall surfacing.

**Then** — 17. `comp_grants` migration · 18. retire `/admin`.

Steps 1–4, 6 and 8 are read-only, which is what makes the Console phase safe:
almost all of it can be built before anything writes.
