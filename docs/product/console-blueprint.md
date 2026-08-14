# Designakum Console — the product blueprint

**The source of truth for the Admin redesign.** Written 2026-08-14 against
`main` at `c7fed2b` — clean tree, 539 tests passing, build green. No code.

---

## 0. Verification, and what changed

### 0.1 State

Repository verified clean. `/console` and `/studio` shells exist and are empty
by design; `/admin` is untouched and remains the working product. The publishing
model is designed and unbuilt.

### 0.2 The priority has inverted, and it changes the plan

[`designakum-blueprint.md`](designakum-blueprint.md) §13 sequenced **Studio
first** — migrate Account, then the portfolio editors — and treated the Console
in one short section. **That order is now wrong.** The Console is the current
phase; the Studio is the next one.

This is more than a reordering, and one consequence is worth stating plainly
because it is good news:

> **The Console does not depend on the free-tier work.** Everything in
> `publishing-model.md` — `published_at`, the RLS relaxation, the publish RPC —
> serves the *client's* product. The Console reads state; it does not need the
> paywall to have moved. So the Console can be built now, in full, while the
> publishing decisions are still open.

The Studio blueprint stands as written for when its phase comes. Where the two
documents disagree about sequence, this one wins.

### 0.3 Conflicts found and resolved

| # | Conflict | Resolution |
|---|---|---|
| 1 | Earlier plan: Studio first | **Console first.** §0.2 |
| 2 | Brief suggests six destinations incl. *Portfolios* and *Content* | **Five.** A portfolio belongs to a client; a separate destination would split one object across two screens. §2 argues it |
| 3 | The admin surfaces `workspace`, `slug`, `tenant` in operator-facing copy today — verified in `translations.js` and `admin.js` | Replaced wholesale. §3 |
| 4 | Current owner nav carries **Sites** *and* **Subscribers** — two lists of the same fourteen objects | Merged into **Clients**, with money as a facet. §2 |
| 5 | Current owner nav carries the client's five portfolio editors, acting on "whichever workspace is selected" | Removed. Editing a portfolio opens *that client's Studio* in operator mode. §2, §5E |
| 6 | Everything before this assumed brand `#2C6FE0` and a diamond mark | `#2A6BCE`, no diamond. Already resolved in the Studio blueprint; restated so this document stands alone |

---

## 1. Product philosophy

> **The Console is the operating system of a portfolio business, run by one or
> two people.**

It is not a dashboard. A dashboard reports; an operating system is where the
work happens. The difference shows in a single test: **after using it, is
anything different?** A screen that only informs has failed.

### What it is

- **A queue with a business attached.** The primary question every morning is
  *what needs me today* — not *how are we doing*.
- **One object, one place.** A client is a person, a portfolio, a subscription,
  an address and a history. Those are five tables and **one screen**.
- **Precise, not raw.** The operator gets more detail than the client, in human
  words. Precision and jargon are not the same thing.

### What it is not

- **Not an analytics product.** Fourteen clients do not need charts. A number
  earns its place by changing a decision.
- **Not a CRM.** No pipelines, no lead stages, no fields nobody fills in.
- **Not a database front-end.** If a screen is a table of rows with an Edit
  button, it has failed.
- **Not the client's product with more buttons.** Role separation is structural.

### The feeling

*"I am running a professional portfolio business"* — which in practice means:
**opening it is calm, and closing it is clear.** The operator should be able to
open the Console, see that nothing needs them, and close it. An empty Console is
a success state, not a broken screen.

---

## 2. Information architecture

### 2.1 The current structure, challenged

Today the owner's navigation is:

```
  PLATFORM   Sites · Subscribers
  WEBSITE    Profile · Home Page · Projects · Links · Appearance
  INSIGHTS   Analytics
  SETTINGS   Account
```

Four problems, each structural rather than cosmetic:

1. **Sites and Subscribers are the same fourteen objects**, listed twice,
   answering "who are my clients" and "who is paying". That is one list with a
   facet, not two destinations.
2. **The five portfolio editors are the client's product**, carried in the
   operator's navigation and acting on whichever client happens to be selected.
   That ambiguity is the single largest source of operator error available.
3. **Nothing answers "what needs me".** The most important question has no
   screen.
4. **Nothing answers "what happened while I was away".** No activity record.

### 2.2 The structure

```
  Today            what needs me, right now
  Clients          everyone, and their state
  Finance          money, and what is at risk
  Activity         what happened
  ─────────
  Settings         the platform itself
```

Five destinations. Each justified:

| Destination | Exists because | Would fail if |
|---|---|---|
| **Today** | The operator's first question is never "how many clients do I have". It is "is anything on fire". This is the only screen opened daily | it became a metrics wall |
| **Clients** | The business is a roster of people. One list, filterable by state, is the whole roster | it split into Sites + Subscribers again |
| **Finance** | Money is a distinct question read at a distinct time — end of month, not every morning | it duplicated the client list with amounts |
| **Activity** | The read-after-a-few-days-away screen, and the audit trail when something looks wrong | it became a debug log |
| **Settings** | Platform-level: owners, plans, email templates, legal pages | it accumulated per-client settings |

### 2.3 What is deliberately NOT a destination

**Portfolios.** A portfolio has no independent existence — it belongs to exactly
one client. A Portfolios destination would mean every portfolio question is
answerable in two places, which is how the two of them drift. Portfolio state
lives on the client record; editing opens that client's Studio.

**Content.** There is no content the *operator* authors that is not either a
client's (theirs) or platform configuration (Settings). A Content destination
would be a drawer.

**Analytics.** Visitor numbers belong to the client whose visitors they are —
on the client record. A platform-wide analytics screen would be the vanity
metric this redesign exists to avoid.

### 2.4 Routes

```
  /console                     Today
  /console/clients             the roster
  /console/clients/[id]        one client — everything
  /console/finance             money
  /console/activity            history
  /console/settings            platform
  /studio?as=[id]              a client's portfolio, operator mode
```

### 2.5 The eyebrow rule

Every screen carries a contextual eyebrow that is simultaneously a breadcrumb, a
scope indicator and a definition — stolen directly from Lumetra:

```
  NEEDS YOU TODAY     / Today
  EVERYONE            / Clients
  CLIENT              / Noura Al-Otaibi
  THE BUSINESS        / Finance
  EVERYTHING THAT HAPPENED / Activity
```

---

## 3. Terminology system

The rule: **the interface never makes anyone think about the underlying system.**
The operator may see more precision than the client; neither sees the schema.

### 3.1 Objects

| Schema / today's UI | Console says | Studio says |
|---|---|---|
| tenant, workspace | **Client** | *(never named — it is "your portfolio")* |
| `tenants.slug` | **Portfolio address** | **Your address** |
| `tenant_domains` | **Custom domain** | **Your own domain** |
| `profile` + `projects` | **Portfolio** | **Your portfolio** |
| `tenant_admins` | **Access** | *(never shown)* |
| `platform_owners` | **Team** | *(never shown)* |
| `subscriptions` | **Plan** | **Your plan** |
| `provider_plans` | **Plans** | *(never shown)* |
| `analytics_events` | **Visitors** | **Visitors** |
| `billing_events` | *(never shown — use Activity)* | *(never)* |

### 3.2 States — the important half

| System truth | Console says | Studio says |
|---|---|---|
| entitled, published | **Live** | **Your portfolio is live** |
| `status='active'` | **Live · renews 1 Sep** | **Renews 1 September** |
| `status='comped'` | **Complimentary** | **Active** |
| `status='trialing'` | **Trial · 6 days left** | **Trial — 6 days left** |
| `status='past_due'` | **Payment failed · 4 days to fix** | **There's a problem with your payment** |
| `cancel_at_period_end` | **Ending 1 Sep** | **Live until 1 September** |
| `status='canceled'`, period passed | **Ended 1 Sep** | **Offline — reactivate any time** |
| `status='expired'` | **Lapsed** | **Offline — reactivate any time** |
| `status='pending'` | **Never finished checkout** | *(not shown — they are mid-flow)* |
| no subscription row | **Free — building** | **Not published yet** |
| `tenants.status='disabled'` | **Paused by us** | **Paused — talk to us** |
| entitled but 404ing | **Not resolving** | *(a fault — we fix it)* |
| `handed_over_at IS NULL` | **Login not delivered** | *(never shown)* |
| `must_set_password` | **Hasn't signed in yet** | *(never shown)* |
| `environment='sandbox'` | **Test payment** *(diagnostics only)* | *(never)* |
| domain `status='error'` | **Not pointing here yet** | **Not connected yet** |

### 3.3 Rules

1. **A state is a sentence, not a code.** "Payment failed · 4 days to fix"
   carries the state, the consequence and the deadline.
2. **Never show a raw date where a relative one is clearer**, and never a
   relative one where the exact date is the decision. "Ending 1 Sep", not "in 18
   days" — the operator will diarise it.
3. **Absence is worded.** "Nobody has visited yet", "No custom domain",
   "Login not delivered" — never a dash, never a blank cell.
4. **One diagnostics drawer** holds the raw truth: IDs, statuses, environment,
   period dates, event payloads. Collapsed by default, at the bottom of the
   client record, labelled **Technical details**. It exists so nobody is ever
   tempted to leak schema into the main interface.

---

## 4. Lumetra translation

Nine principles. For each: what they do, why it works, our translation, and the
exact UI decision it forces.

### 4.1 Attention over dashboards
**They do** — a screen called *Attention*, whose tip reads *"Everything here is
waiting on a person, not a process. An empty screen is the goal."*
**Works because** it names the scarce resource (the operator's attention) rather
than the data, and it defines success as emptiness.
**We translate** — the *home screen itself* is the attention queue. With fourteen
clients we do not need both a Board and an Attention screen; merging them means
the daily screen is the useful one.
**UI decision** — `/console` opens on a grouped list of things needing a human,
each row carrying the client, the reason, and the action that clears it. When it
is empty it says *"Nothing needs you today"* and shows the quiet line beneath.

### 4.2 Reduce cognitive load
**They do** — four summary tiles, never more, and the same four components
reused at two scopes (all clients / one client).
**Works because** learning one screen teaches the other, and the component count
halves.
**We translate** — the client record reuses the Today row and the Clients row
verbatim, rescoped.
**UI decision** — one row component across all three screens. A client in the
attention queue, in the roster, and at the top of their own record is the same
component with different scope.

### 4.3 Progressive disclosure
**They do** — one scrolling client record with visually distinct blocks and *no
tabs*, because tabs hide what an owner wants at a glance.
**Works because** at their scale everything fits, and a click is a cost.
**We translate** — confirmed for fourteen clients. Drop the six-panel tab design
proposed earlier.
**UI decision** — the client record is one page: header, state, portfolio,
money, access, domain, notes, then **Technical details** collapsed. Only the
last is hidden, because only the last is rarely wanted.

### 4.4 Human language
**They do** — Board, Clients, Team, Finance, Attention, Activity. Business
nouns, never schema. "Keeping track" names what a group is *for*.
**Works because** the vocabulary is the product's model of the world, and a
schema word forces the reader to translate.
**We translate** — §3, wholesale. Today, Clients, Finance, Activity, Settings.
**UI decision** — "workspace", "slug" and "tenant" do not appear in the Console.
The words currently in `translations.js` — *"Delete workspace permanently?"*,
*"Enter a valid slug"*, *"Client / workspace name"* — are rewritten.

### 4.5 Clear states
**They do** — each stuck group carries a definition *and an exit condition*:
*"OVERDUE — the due date has passed and it is not finished. **What clears it:**
move it on, or push the date out so the board stops lying."*
**Works because** a state that names its exit cannot become wallpaper.
**We translate** — every attention group defines itself and says what clears it.
**UI decision** — each group in Today has two lines of definition before its
rows. *"Payment failed — the card was declined and we retried. **What clears
it:** they update the card, or you grant time."*

### 4.6 Role separation
**They do** — roles are *separate dashboards*, not a conditional. Opening a
client's dashboard replaces the entire product; impersonation is marked twice,
including a persistent floating pill.
**Works because** the operator is never uncertain which product they are in.
**We translate** — `/console` and `/studio` are separate products, which the
shells already are. Editing a client's portfolio opens **their Studio**.
**UI decision** — operator mode enters **read-only by default** with an explicit
*Edit their portfolio* step, marked twice: a line under the header and a
persistent pill — *"Noura's portfolio · you are Feras · read only · [Leave]"*.
Leaving confirms with a toast. **This is a UI default, not a security
boundary**, and must never be described as one — RLS permits owners everywhere,
and that does not change.

### 4.7 Simple client/operator projection
**They do** — seven internal pipeline stages projected to five for the client.
The three internal, slightly embarrassing states collapse away. Nothing is
invented; nothing internal leaks.
**Works because** the client's model is *simpler, never different*.
**We translate** — the law from §3.2's two columns: every Studio state is a true
projection of a Console state.
**UI decision** — one pure module maps platform state → operator sentence →
client sentence, tested so the two columns cannot contradict each other. It
**reads** entitlement; it never restates the rule.

### 4.8 Meaningful empty states
**They do** — "nobody assigned yet", "no sign-in", "no footage link yet". A
ghost *Add a client* card ends the grid.
**Works because** absence is information, and a blank cell is a bug you cannot
see.
**We translate** — §3.3 rule 3, everywhere.
**UI decision** — every empty region carries a sentence and, where an action
exists, the action. Today's empty state is the strongest: *"Nothing needs you
today."*

### 4.9 Purposeful motion
**They do** — very little, and it is invisible until you look for it.
**Works because** motion in an operations tool is a cost paid on every visit.
**We translate** — the Console is the calm product. `--t-ui` on hover and
colour, `--t-press` on press, `--t-enter` for a panel arriving. Nothing loops,
nothing bounces, nothing celebrates.
**UI decision** — `--ease-pop`'s 6% overshoot is **not used in the Console at
all**. It is reserved for the Studio's activation moment. A tool that celebrates
its own list is a tool you stop trusting.

### 4.10 Summary

| Lumetra principle | Designakum implementation |
|---|---|
| Attention over dashboards | `/console` **is** the attention queue; empty is the goal |
| Reduce cognitive load | One row component at three scopes; four tiles maximum |
| Progressive disclosure | Client record is one page; only **Technical details** collapses |
| Human language | §3 vocabulary; no schema words in the Console |
| Clear states | Every attention group defines itself and names what clears it |
| Role separation | Separate products; operator mode read-only by default, marked twice |
| Client/operator projection | One tested mapping module; client simpler, never different |
| Meaningful empty states | Worded absence everywhere; "Nothing needs you today" |
| Purposeful motion | No overshoot in the Console; celebration belongs to the Studio |

---

## 5. Screen designs

### A) Today — `/console`

**Eyebrow** `NEEDS YOU TODAY` · **Lead** `Good morning, Feras`

**Goal** find out in five seconds whether anything requires me.
**Emotion** on opening: mild apprehension. On closing: resolved, or reassured.
**Primary action** whatever the top row says. The screen has no action of its
own — the rows are the actions.

**Hierarchy**

1. **The count as a sentence** — *"Four things need you."* Or, better,
   *"Nothing needs you today."*
2. **The attention groups**, ordered by consequence, not by count. Money at
   risk before cosmetic problems.
3. **The quiet line** — one sentence of the whole business:
   *"9 live · 3 building · 1 paused · 1 lapsed."*
4. Nothing else. No charts, no revenue tile, no recent-signups feed.

**Groups, each with a definition and an exit**

```
  PAYMENT FAILED                                                    2
  The card was declined and we have retried. What clears it: they
  update the card, or you grant time.

    Ahmed Zahrani      failed 3 days ago · 4 days left    [ Grant time ]  [ Open ]
    Layla Nasser       failed 6 days ago · 1 day left     [ Grant time ]  [ Open ]

  NOT RESOLVING                                                     2
  The portfolio is switched on but the public page does not load —
  usually checkout was never finished. What clears it: finish or
  cancel the plan.

    Studio Meem        never finished checkout            [ Open ]
    Test client        test payment                        [ Open ]

  LOGIN NOT DELIVERED                                               1
  We built it and never confirmed they received their sign-in.
  What clears it: send the welcome, then mark it delivered.

    Nawaf Q.           built 6 days ago                   [ Send welcome ]

  DOMAIN NOT POINTING HERE                                          1
  They added a domain and the DNS has not been changed.
  What clears it: they update DNS, or remove the domain.

    Noura Al-Otaibi    nooraa.design · 9 days             [ Show them how ]
```

**Why each element exists**

- *The greeting* — one human line. It is also the only decoration allowed.
- *Group before rows* — the operator decides at group level ("is any money at
  risk?") before reading names.
- *The definition* — a group nobody understands becomes a group nobody clears.
- *The exit condition* — turns a list into a decision.
- *The inline action* — reading and acting are one gesture. `Grant time` is a
  real existing capability (comp grant); `Open` goes to the client record.
- *The quiet line* — the whole business in one sentence, so the operator can
  close the tab knowing where things stand.

**Empty state** — *"Nothing needs you today."* then the quiet line. This is the
target state and should look like a finished screen, not a missing one.

---

### B) Clients — `/console/clients`

**Eyebrow** `EVERYONE` · **Lead** `Clients`

**Goal** find a specific client, or scan the roster by state.
**Emotion** navigational, low-stakes.
**Primary action** open a client. Secondary: `Add a client`.

**Hierarchy**

1. **Filter chips as the state summary** — the filter *is* the count.
   `All 14 · Live 9 · Building 3 · Needs attention 4 · Paused 1 · Ended 1`
2. **Search** — name, address or email.
3. **The roster.** One row per client:

```
  ●  Noura Al-Otaibi        designakum.site/noura
     Live · renews 1 Sep · 38 visitors this week          ⚠ domain    [ Open → ]

  ●  Ahmed Zahrani          designakum.site/ahmed
     Payment failed · 4 days to fix                       ⚠ payment   [ Open → ]

  ○  Studio Meem            designakum.site/meem
     Free — building · 2 projects so far                              [ Open → ]
```

4. **A ghost `+ Add a client` row** closing the list.

**Why**

- *Rows, not cards.* Fourteen clients scanned by state; cards would force
  scrolling for no gain. This is where Lumetra's card grid is **not** copied —
  they had six clients with logos and assignees; we have fourteen with a state
  and a number.
- *The dot* carries live/not-live pre-attentively; the words carry the detail.
- *One number per row, chosen by state.* Live → visitors. Building → projects.
  Payment failed → days left. The number that would change a decision, not the
  same number for everyone.
- *The warning chip* is the same object as a Today group, so the two screens
  agree.
- *No Subscribers screen.* "Who is paying" is the `Live` filter.

---

### C) Client record — `/console/clients/[id]`

**Eyebrow** `CLIENT` · **Lead** the person's name · `← All clients` above.

**Goal** answer any question about this client without leaving.
**Emotion** focused; often arriving mid-problem from Today.
**Primary action** varies by state — the record's most useful next verb.

**One page, no tabs.** Blocks in order:

1. **Header** — name, address as a link, state sentence, *client since March*.
   Actions: the state-appropriate primary (`Grant time` / `Send welcome` /
   `Open their portfolio`), then quieter ones.
2. **Attention** — if this client appears in Today, the same rows, here. If not,
   *"Nothing needs you for Noura."*
3. **Portfolio** — a real thumbnail of their actual page, live/not-live, last
   edited, project count, visitors this month as a sentence.
   Action: `Open their portfolio` → their Studio, read-only.
4. **Money** — plan, price, renewal or end date, payment history as a short
   list. Human sentences throughout.
5. **Access** — who can sign in, whether they ever have, invite state.
   Actions: `Resend welcome`, `Reset password` — **the verb changes with the
   state**, per Lumetra 3.4.
6. **Domain** — custom domain and whether it resolves, with the fix.
7. **Notes** — free text. What they pay, what we owe them, what they want. The
   engagement brief, stolen wholesale. **Owner-visible only** — it holds
   commercial terms the client must never read.
8. **Technical details** — collapsed. IDs, raw statuses, period dates,
   environment. The pressure valve that keeps schema out of everything above.

**Why**

- *One object, one URL.* Nobody remembers which of three screens holds the
  answer.
- *Attention repeated here* — arriving from Today, the operator should land on
  the problem, not hunt for it.
- *A real thumbnail* — this is a portfolio company. The work should be visible
  on the screen about the work.
- *Notes* fill a real gap: comps, partner deals and hand-shaken arrangements
  currently live nowhere. Additive; needs a column or small table.
- *Technical details* exists so §3 can be absolute everywhere else.

---

### D) Finance — `/console/finance`

**Eyebrow** `THE BUSINESS` · **Lead** `Finance`

**Goal** know what is coming in, and what is at risk.
**Emotion** periodic, end-of-month; occasionally anxious.
**Primary action** resolve a failing payment.

**Hierarchy**

1. **Three sentences, not tiles**
   *"9 clients pay for Designakum. That is 108 riyal a month."*
   *"2 payments are failing — 24 riyal at risk."*
   *"5 clients are complimentary and pay nothing."*
2. **At risk** — the failing payments, with days remaining and the same actions
   as Today.
3. **Renewals ahead** — who renews in the next 30 days, with dates.
4. **Complimentary** — listed **separately and never in revenue**. Already true
   in the MRR calculation; made structural.
5. **Recent payments** — a short list, not a ledger.

**Why**

- *Sentences over tiles.* A tile reading `108` requires the reader to remember
  the unit, the period and whether comps are included. The sentence carries all
  three. This is Lumetra's "numbers are sentences", and Finance is where it
  matters most.
- *At risk before revenue.* The actionable number leads.
- *Comps visible but separated* — the locked decision, made visual.
- *No charts.* Nine paying clients produce no trend worth plotting. When there
  are ninety, revisit.
- The riyal is the **official symbol image**, never spelled out. Latin numerals.

---

### E) Portfolio management

**Resolved: this is not a Console screen.** A portfolio is edited in its
client's Studio, opened from the client record in operator mode.

Building portfolio editing into the Console would mean two copies of every
editor, drifting, with the operator's copy acting on whichever client is
selected — the exact ambiguity §2.1 identified as the largest source of operator
error.

**What the Console keeps** is the *portfolio block* on the client record (§C3):
thumbnail, live state, last edited, project count, visitors — everything the
operator needs to **decide**, and nothing they need to **edit**.

**Operator mode**, per Lumetra 4.6:

```
  ┌──────────────────────────────────────────────────────────────┐
  │  Noura's portfolio · you are Feras · read only    [ Leave ]  │
  └──────────────────────────────────────────────────────────────┘
```

Read-only on entry, with an explicit `Edit their portfolio` to take control.
Marked twice: under the header, and a persistent pill at the bottom of the
viewport. **A UI default, not a security boundary.**

---

## 6. Visual trial

`docs/ux/prototype/console-trial.html` — desktop, light and dark, English and
Arabic RTL, showing Today (populated and empty), Clients, the client record and
Finance. Built from the real token layer. Not production code.

---

## 7. Implementation strategy

**Nothing here is built. This is the order for when it is.**

### 7.1 What stays

- `/admin` — untouched and working until the Console is complete. No flag day.
- All RLS, entitlement, authentication, PayPal. **The Console is a read-and-act
  surface over rules that already exist.**
- `lib/billing-status.js` — the state machine. The Console renders it; it does
  not restate it.
- The shells, the token layer, `Icon`, `Button`, `Card`, `Toast`, `ConfirmDialog`.

### 7.2 What changes

The vocabulary, the information architecture, the home screen, and where
portfolio editing happens. Not the data model, with one additive exception:
**client notes** (§C7) need a column or a small table.

### 7.3 Order

| # | Step | Depends on | Risk |
|---|---|---|---|
| 1 | The state→sentence mapping module + tests | nothing | none — pure |
| 2 | Today, read-only: groups, definitions, quiet line | 1 | low — new route |
| 3 | Clients roster + filters | 1 | low |
| 4 | Client record, all blocks except Notes | 1,3 | low |
| 5 | Inline actions on Today and the record, reusing existing handlers | 4 | **medium — first writes** |
| 6 | Finance | 1 | low |
| 7 | Operator mode into Studio, read-only by default | Studio shell | medium |
| 8 | Activity | nothing | low |
| 9 | Client notes *(additive schema)* | — | low, owner-visible only |
| 10 | Retire the owner half of `/admin` | 1–9 | do last |

Steps 1–4 and 6 and 8 are **read-only**, which is what makes this phase safe:
the Console can be built almost entirely without a write path, then given
actions once the surface is proven.

### 7.4 Risks

| Risk | Mitigation |
|---|---|
| The mapping module and the database disagree | It reads `tenant_has_active_subscription` and `billing-status.js`; a test pins operator and client sentences to the same states |
| Two admins during the transition | `/admin` stays authoritative until step 10; the Console does not duplicate a write until step 5 |
| Operator mode read as a security boundary | Stated in code comments and in this document: it is a UI default. RLS is unchanged |
| Notes leaking to clients | Owner-visible only, enforced by policy, and never loaded by the Studio |
| The attention queue becoming wallpaper | Every group defines its exit. A group nobody can clear is a bug in the group |

### 7.5 Testing

- **Pure first.** The mapping module is unit-tested for every state in
  `BILLING_STATES` plus the tenant-status and handover axes.
- **Projection test.** For every state, assert the Console sentence and the
  Studio sentence exist and do not contradict — the mechanical form of design
  law 4.
- **Vocabulary guard.** A test scanning Console source for `tenant`, `slug`,
  `workspace`, `comped`, `past_due` outside the Technical details component —
  the same shape as the emoji and theme guards, which have both already caught
  real regressions.
- **No new integration surface** until step 5, because there is no write.

---

## 8. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Today or Attention** as the home screen's name | **Today** — it is the daily screen, and "Attention" implies a second, calmer home that we are deliberately not building |
| 2 | **Finance or Billing** | **Finance** — a business noun. "Billing" is the infrastructure's word |
| 3 | Client notes: column on `tenants` or a `client_notes` table | A table, if notes should ever be dated or attributed |
| 4 | Does operator mode need a server-enforced read-only? | Not now. It is a UI default and must be described as one |
| 5 | Arabic for the Console | The operator is Arabic-speaking; the Console should be bilingual like everything else, but **the Studio is the surface that must be perfect in Arabic first** |
