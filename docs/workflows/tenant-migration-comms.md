# Tenant migration — the conversations before cutover

**Phase P0.3 of [../architecture/renderer-migration.md](../architecture/renderer-migration.md).
Nobody has been contacted. No tooling exists and none is being built.**

This is the plan for talking to the clients who lose a feature when their site
moves to the new renderer, and the operator workflow that turns each conversation
into a decision recorded before anything is promoted.

> **P0.3 gates P5 and nothing else.** Every other phase proceeds while these
> conversations happen. But **no tenant is cut over before its own conversation
> is complete and its decisions are recorded here.**

---

## 1. Who is affected, and why

Eleven active tenants. Four features are removed by the feature decisions, and
**four tenants are technically affected** — but that is not the number of
conversations.

> **Four affected tenants ≠ four client conversations.** How many people are
> actually contacted depends on ownership and admin state, and on current data
> only **`roza`** certainly requires external confirmation. **`alihabibfilms`**
> may — its ownership is unclear. **`designakum` is internal/demo content** and
> needs no external conversation at all. **`f9designer`'s ownership requires
> clarification** before anyone is contacted. See §2.5 and §2.7.

Two of the four are also not feature-loss cases at all, and cannot go through
this process: see **§2.8**.

| Feature removed | Tenants | Why it goes |
|---|---|---|
| **CTA lists** (`cta_buttons[]`) | **4** | A page with five equal asks has none. One action, after the work |
| **Stats** (`stats[]`) | **3** | A grid of tiles is a claim competing with the work. `500+` invites invention |
| **Banners** (`banners[]` + auto-advance) | **2** | An image above the work competes with the work, and visitors read it as the client's work when it is not |
| **Ticker** (`top_ticker`) | **2** | A marquee. It moves continuously, says nothing at a glance, and is the loudest thing on a page selling calm |
| Custom fields | **0** | Nobody uses it. Costs nothing |

Counts verified against the live database on 2026-08-21 and reconciling exactly
with [../architecture/published-snapshot.md](../architecture/published-snapshot.md) §9.

**These overlap.** Eleven counts across four features do not mean eleven tenants
— a tenant with a ticker probably has banners too. **The number of people to
contact is smaller than the number of affected features**, and §2 is where that
resolves into an actual list.

### What is NOT lost, and should be said early in every conversation

Clients hear "your site is changing" and assume the worst. These carry across
unchanged, and three of them are more widely used than anything being removed:

| Kept | Tenants holding it |
|---|---|
| Photo or brand mark | **6** |
| Non-default appearance | **5** |
| Social / contact links | **4** |
| Custom favicon | **4** |
| Name, tagline, bio, footer, SEO fields, the work itself | all |

The work also stops being behind a button. For most of these clients the honest
summary is: **their projects go from hidden behind a modal to being the page.**

---

## 2. The per-tenant register

**Populated 2026-08-21** from the read-only query below. Content is quoted as
stored — nothing is inferred, translated or tidied. Blank cells are decisions
that have not been made yet.

```sql
-- READ ONLY. This is the query that produced the register.
select t.slug, t.status,
       coalesce(jsonb_array_length(p.cta_buttons),0) as ctas,
       coalesce(jsonb_array_length(p.stats),0)       as stats,
       coalesce(jsonb_array_length(p.banners),0)     as banners,
       (coalesce(p.top_ticker->>'enabled','false') = 'true') as ticker,
       p.cta_buttons, p.stats, p.top_ticker
  from public.tenants t
  join public.profile p on p.tenant_id = t.id
 where t.status = 'active'
   and (coalesce(jsonb_array_length(p.cta_buttons),0) > 0
     or coalesce(jsonb_array_length(p.stats),0) > 0
     or coalesce(jsonb_array_length(p.banners),0) > 0
     or coalesce(p.top_ticker->>'enabled','false') = 'true')
 order by t.slug;
```

### The four, at a glance

| slug | CTAs | stats | banners | ticker | **pieces** | client admins |
|---|---|---|---|---|---|---|
| `alihabibfilms` | 4 | 0 | 0 | off | **0** | 0 |
| `designakum` | 3 | 3 | 1 | **on** | 1 | 0 |
| `f9designer` | 2 | 3 | 1 | off | 8 | 0 |
| `roza` | 6 | 3 | 0 | **on** | **0** | 1 |

**Overlap resolves as predicted:** eleven feature-instances across **four**
tenants, not eleven tenants. `designakum` holds all four features; `f9designer`
three; `roza` three; `alihabibfilms` one.

> **Two findings here outrank everything else in this document, and both change
> what these conversations are about. See §2.5.**

---

### `alihabibfilms` — AliHabibFilms

Reviewed: — · Contacted: — · Decision: — · Ready to promote: **no**

**CTA buttons (4), all `action: link`:**

| Label (en) | Destination |
|---|---|
| Instagram | `instagram.com/alihabibfilms/` |
| TikTok | `tiktok.com/@ali.habib.films` |
| YouTube | `youtube.com/@AliHabibFilms-9` |
| Facebook | `facebook.com/people/Alihabibfilms/…` |

Stats: none. Banners: none. Ticker: **disabled**, text empty — nothing is lost.
Pieces: **0**.

| Feature | What replaces it | Client input? | May be empty? | Decision |
|---|---|---|---|---|
| CTA buttons (4) | **all four become `links`**, not the action | YES | yes | |
| Action | **none proposed** | YES | yes | |

**The deterministic rule fails here and must not be applied.** No destination is
an email, so the rule degrades to "first button with an href" and would pick
**Instagram** as the single next step. These are not calls to action — they are
four social profiles, which is what `custom_links` exists for. The correct
migration is CTAs → links, with **no action at all** unless the client supplies
one. Empty is legitimate.

---

### `designakum` — Designakum (official)

Reviewed: — · Contacted: **n/a, internal** · Decision: — · Ready to promote: **no**

**CTA buttons (3):**

| Label (ar / en) | Destination | Note |
|---|---|---|
| الموقع الرسمي / Official Website | `https://designakum.com ` | **trailing space in the stored href** |
| تواصل معنا / Contact us | `instagram.com/IZ1D` | |
| لطلب الموقع / Order Website | *(empty href)* | `action: open_projects` — **discarded**, the work is now the page |

**Stats (3):** `التقييم / Evaluation → 4.9` · `متواجدين للتواصل / We are available
to connect. → نعم / Yes` · `العملاء الحاليين / Existing customers → 2+`

**Banners:** 1. **Ticker: enabled** — «ديزاينكم - هذا مثال -» / "Designakum –
This is an example –". Pieces: 1.

| Feature | What replaces it | Client input? | May be empty? | Decision |
|---|---|---|---|---|
| CTA buttons (3 → 2 after discard) | one action | internal decision | yes | |
| Stats (3) | credibility line, or nothing | internal decision | yes | |
| Banner (1) | nothing | no | n/a | |
| Ticker | nothing | no | n/a | |

**This is Designakum's own workspace, not a client's** — the name says
"(official)" and the ticker text says it is an example. **No external
conversation is required.** It is still a live page on a mapped domain, so it
still needs the checklist in §6.

The deterministic rule would pick "Official Website"; "Contact us" is at least as
plausible as the real next step. **An operator decides. The stored href must
also be trimmed** — the trailing space is in the data, not a display artefact.

---

### `f9designer` — f9designer

Reviewed: — · Contacted: — · Decision: — · Ready to promote: **no**

**CTA buttons (2):**

| Label (ar) | Destination |
|---|---|
| قناتي تلقرام جميع اعمالي | `t.me/mtt4u` |
| تواصل معنا | WhatsApp — `…phone=%2B966505796218` |

**Stats (3):** `اعمالي / My work → +1100` · `متفرغ للتصميم ( حاليا ) → نعم / Yes` ·
`المتابعين / followers → +463`

**Banners:** 1. **Ticker: disabled**, though text is stored («تــم تــصــمــيــم
الــمــوقــع عــبــر ديــزايــنــكــم») — **not currently rendered, so not a loss.**
Pieces: **8** — the largest portfolio in the system.

| Feature | What replaces it | Client input? | May be empty? | Decision |
|---|---|---|---|---|
| CTA buttons (2) | one action | YES | yes | |
| Stats (3) | credibility line, or nothing | YES — their words | yes | |
| Banner (1) | nothing | no | n/a | |
| Ticker (disabled) | nothing | no | n/a | |

The rule picks **Telegram** (first with an href); **WhatsApp** is the more
plausible next step. Human decision.

**Verify the WhatsApp number before promoting.** The stored destination is
`+966505796218`, which matches a number recorded elsewhere in this project as
Designakum's *superseded* number. It may legitimately be this tenant's own.
**Do not change it on their behalf** — confirm it.

Two of the three stats are follower and volume counts. They cannot be converted
into a sentence by anyone but their owner.

---

### `roza` — Roza

Reviewed: — · Contacted: — · Decision: — · Ready to promote: **no**

**The only one of the four with a client admin account.** If any of these is a
real external conversation, it is this one.

**CTA buttons (6), labels Arabic-only:**

| Label (ar) | Destination |
|---|---|
| الدورات المتاحة ( كود خصم FIFA ) | `retm.net/instructor/1A72B?referralCode=1A72B` |
| المتجر ( خصم %50 ) | `roza.sayan.pro/?utm_source=ig…` |
| WhatsApp | `wsend.co/966532604360` |
| متاجر صممناها | Google Drive file |
| موقعي الشخصي | `roza4design00.netlify.app` |
| ملف اعمالي ( Behance ) | `behance.net/e14dcdfc` |

**Stats (3):** `براند → 450+` · `متفرغة لإستلام الطلبات → لا` · `عدد المتابعين → +90K`

**Banners:** none. **Ticker: enabled** — «كود خصم %50 (FIFA)». Pieces: **0**.

| Feature | What replaces it | Client input? | May be empty? | Decision |
|---|---|---|---|---|
| CTA buttons (6) | one action + the rest as links | YES | yes | |
| Stats (3) | credibility line, or nothing | YES — their words | yes | |
| Ticker | nothing | **YES — see below** | n/a | |

**Removing the ticker removes a live promotion.** It carries an active discount
code. That is a business decision, not a cosmetic one, and it must be raised
explicitly rather than discovered after cutover.

The rule picks the **courses link with a referral code**. WhatsApp is the more
plausible next step, and the other five are links. This is the clearest case in
the register for why the choice is confirmed by a person.

---

### 2.5 What the register changed about the plan

Two facts in the data change the shape of P0.3 rather than adding detail to it.

**A — Two of the four have no work.** `alihabibfilms` and `roza` have **zero
pieces**. This is not a feature-replacement conversation and cannot be run as
one. It is a **migration blocker**: §2.8.

**B — Three of the four have no client account.** `alihabibfilms`, `designakum`
and `f9designer` have **zero non-owner admins**. `designakum` is internal by
design. For the other two it is unexplained, and it means there may be nobody to
contact — which is why the conversation count in §1 is stated as a range rather
than as four.

### 2.6 Migration-logic findings

Findings about how the migration behaves. Each has a consequence for a decision.

| # | Finding | Consequence |
|---|---|---|
| M1 | **No CTA anywhere is an email.** The deterministic rule's first branch never fires across all four tenants; it degrades to "first button with an href" | The proposal is weaker than the plan assumed. Review is what catches it — rule §4 |
| M2 | `alihabibfilms`' four CTAs are **social profiles, not actions** | CTAs → links, action **empty**. The rule cannot detect this; a person must. See §3 |
| M3 | `alihabibfilms` and `roza` have **0 pieces** | §2.8 — blocker |
| M4 | `designakum`'s third CTA is `action: open_projects` with an empty href | Discarded, and **not counted as a loss**: the work is now the page |

### 2.7 Data-quality findings — recorded, not fixed

Defects in stored data, separate from migration logic. **None of these has been
changed, and none should be changed outside the tenant's own review.** A quiet
`UPDATE` to a client's row is the same category of act as rewriting their words.

| # | Finding | Where |
|---|---|---|
| Q1 | **Trailing whitespace in a stored URL** — `"https://designakum.com "`. In the data, not a display artefact | `designakum`, first CTA href |
| Q2 | **Disabled ticker retaining text** — the ticker is off, but its text is still stored. Not a loss, but it reads as one from the row rather than the page | `f9designer` |
| Q3 | **`handed_over_at` mismatch with admin membership** — three tenants are marked as having had credentials delivered while holding **zero client admins**. Credentials cannot have been handed to an account that holds no membership | `alihabibfilms`, `designakum`, `f9designer` |
| Q4 | **Possible stale WhatsApp number** — the destination `+966505796218` matches a number recorded elsewhere in this project as Designakum's *superseded* number. It may legitimately be this tenant's own | `f9designer`, second CTA href |

Q3 is the one with reach beyond this migration: it means `handed_over_at` cannot
be trusted as evidence that a client has an account, anywhere it is used.

Q4 must be **confirmed with the tenant**, never corrected on their behalf. If it
is stale, the fix is theirs to make; if it is theirs, changing it would break
their contact route.

### 2.8 Zero-work tenants — a blocker requiring a product decision before P5

> **`alihabibfilms` and `roza` have no pieces. They cannot be migrated through
> the feature-replacement conversation, because there is nothing underneath the
> features being removed.**

**Why this is a different problem.** The other tenants lose a feature and keep a
portfolio. These two lose the features their page is *made of*. All nine projects
in the system belong to `designakum` (1) and `f9designer` (8); these two have
none.

The new model's first principle is **the work is the page** — the hierarchy
requires at least one real piece visible on a 375px phone without scrolling, and
sections appear only when they have content. Applied to a tenant with no work,
that yields identity, possibly a bio, possibly links, and nothing else. The
current page is not better — it is a link card — but it is *full*, and the new
one will not be.

**This is not a CTA, stats, banner or ticker problem, and it must not be handled
as one.** Running the §5 workflow on these two would produce a confirmed set of
replacement decisions and still leave a page with nothing at its centre.

**The options, none of them chosen:**

| | Option | What it costs |
|---|---|---|
| **a** | **Add work before cutover** | Requires the client to supply pieces, which is a real ask and may not be answerable. It is also the only option that ends with a portfolio |
| **b** | **Remain on legacy temporarily** | Their page keeps working unchanged — but every tenant on legacy holds the draft-read gap open, so this **blocks P6 for as long as it lasts** ([../architecture/renderer-migration.md](../architecture/renderer-migration.md) §1.14). Not free, and not indefinite |
| **c** | **Accept an intentionally minimal portfolio** | Only if the product decides a work-less portfolio is a legitimate published state. That is a real position — an empty portfolio is a valid portfolio elsewhere in the model — but it has not been decided for a *published, paid* page |

> **REQUIRES A PRODUCT DECISION BEFORE P5.** No option is chosen here, and this
> document has no authority to choose one. Until it is answered, neither tenant
> is cut over — and option **b** is the default only by inaction, which is the
> one outcome worth avoiding, because it silently postpones P6.

### 2.9 Cross-check against the P0.1 counts

| Feature | P0.1 (all profiles) | Register (active only) | |
|---|---|---|---|
| CTA lists | 4 | 4 | ✓ |
| Stats | 3 | 3 | ✓ |
| Banners | 2 | 2 | ✓ |
| Ticker (enabled) | 2 | 2 | ✓ |
| Custom fields | 0 | 0 | ✓ |
| Projects total | 9 | 9 (1 + 8) | ✓ |
| Tenants with work | 2 | 2 | ✓ |

**Every count reconciles exactly.** No affected tenant is inactive, so the
`status = 'active'` filter excluded nothing — worth stating, because it could
have hidden a disabled tenant carrying a removed feature.

### 2.10 Provenance — how this register was produced

**Two read-only `SELECT` queries, 2026-08-21. No other database access.**

1. **The documented §2 query, verbatim.** Produced the feature inventory: which
   tenants hold CTAs, stats, banners or a ticker, and their stored content.

2. **An ownership and work query**, not in the original plan: `tenants` joined to
   `tenant_admins`, `projects` and `tenant_domains`, returning per tenant the
   count of non-owner admins, pieces and domains — no emails, no user ids.

**Why the second query was run.** The first answered *what* each tenant loses but
not *who to talk to*, and P0.3 exists to prepare conversations. It established
two things that changed the scope of this phase rather than its detail: that two
tenants have no work at all (§2.8), and that three have no client account (§2.5).
Both are blockers. Neither is visible in the profile data, and planning four
conversations without them would have produced a plan for conversations that
cannot happen.

It was read-only, additive, and touched no client content.

---

## 3. What replaces what

The general mapping. Per-tenant specifics go in the register.

### CTA lists → the single next step

| | |
|---|---|
| **Now** | a list of buttons; the first renders primary, the rest ghost |
| **Becomes** | one action — a destination and nothing else — placed **after** the work and the introduction |
| **Client input** | **Required.** Which destination becomes the one action is a question about their business, not a technical mapping |
| **May be empty** | **Yes.** No destination means the portfolio has no next step, which is a complete portfolio |

#### A CTA button is not automatically the next step

> **The two are different kinds of thing, and the old data does not distinguish
> them.** `cta_buttons[]` was a list of anything a client wanted to link to.
> The action is one **conversion or contact destination**.

So the migration is a **sort**, not a pick:

| A button that is… | Goes to | Example |
|---|---|---|
| a **social or platform profile** | **`links`** | Instagram, TikTok, YouTube, Behance, a Telegram channel |
| a **portfolio or reference URL** | **`links`** | a personal site, a PDF of past work |
| a **contact or conversion destination** | **the action** — at most one | an email, a WhatsApp thread, a booking or enquiry page |
| `action: open_projects` | **discarded** | the work is now the page, so there is nothing to open |

**A CTA list containing only social links produces an empty action, and that is
the correct outcome.** Not a gap to fill.

**The example case is `alihabibfilms`.** All four of its CTA buttons are social
profiles — Instagram, TikTok, YouTube, Facebook. No destination is an email, so
the deterministic rule degrades to "first button with an href" and would install
**Instagram as the single next step**, which is not a next step at all. The
correct migration is all four to `links` and **no action**. See §2.6 M2.

**The proposal, restated with the sort applied.** Among buttons that are
genuinely contact or conversion destinations: an email wins, otherwise the first
with a URL. **If that set is empty, the proposal is an empty action** — the rule
never reaches outside the category to find a candidate.

The operator still brings a proposal rather than a blank, and a person still
confirms it (rule §4). What changed is that the rule can now return "none",
which on this data it must for at least one tenant.

**The label is no longer theirs.** It is "Get in touch" / «للتواصل», the same on
every portfolio. Say this explicitly — a client who wrote their own button text
will notice, and the reason is that we are not asking a photographer to write
conversion copy.

### Stats → the credibility line, or nothing

| | |
|---|---|
| **Now** | free-form value/label tiles |
| **Becomes** | **at most one short line, in words**, beneath the bio — "Ten years, mostly editorial" |
| **Client input** | **Required, and it must be their words.** See §4 |
| **May be empty** | **Yes**, and this is the expected outcome for some |

This is the conversation, not a transformation. `500+` cannot be turned into a
sentence by anyone but the person whose claim it is.

### Banners → nothing on the page

| | |
|---|---|
| **Now** | one or more images above the work, auto-advancing every 5s |
| **Becomes** | **nothing.** The first piece is the image that leads |
| **Client input** | None |
| **May be empty** | n/a — the concept is gone |

The role a banner claimed — one image that leads — is filled by the first piece,
which the client already controls through ordering. The banner concept survives
**only** as the link-preview image, generated from their first piece at P7.
Worth mentioning: they are not losing the image, they are losing a slot.

### Ticker → nothing

| | |
|---|---|
| **Now** | a scrolling strip above everything |
| **Becomes** | **nothing** |
| **Client input** | None |
| **May be empty** | n/a |

If the ticker carried real information — an availability note, a promotion — it
has nowhere structural to go, and the honest options are the bio, the
credibility line, or nothing. **Do not invent a home for it.**

---

## 4. The rules

Four, and they exist because each has an obvious shortcut that would be worse.

### No automatic rewriting of a client's claims

Nobody rewrites, condenses or "improves" a client's own words to fit the new
model. Their stats, their button copy and their ticker text are theirs. If the
content does not fit, the answer is a conversation or an empty field, never an
edit made on their behalf.

### No generated credibility statements

The credibility line is **written by the client**. It is not generated, not
assembled from structured inputs, and not derived from their title — a derived
line either duplicates the title or invents something they never said, and an
assembled "ten years" is a stat counter wearing prose
([../design/credibility-line.md](../design/credibility-line.md) §1).

If they do not want to write one, **the portfolio has no credibility line.**
That is a finished portfolio, not an incomplete one.

### No automatic CTA choice without review

The proposal is generated by rule; **the decision is confirmed by a person.**
An unreviewed automatic pick would silently change where a client's enquiries
land — and at this scale a person looking is both cheaper and better than a
heuristic.

The register proved the point before anyone was contacted: **no CTA in any of the
four tenants is an email**, so the rule's first branch never fires, and for
`alihabibfilms` the fallback would have installed a social profile as the next
step. The rule sorts by category first and may legitimately return **none**
(§3).

### Empty is acceptable wherever the new model allows it

No field is filled to avoid a gap. Sections appear from content: a portfolio
with no next step, no credibility line and no links is complete and renders
correctly. **Do not talk a client into content to make a page look fuller** —
that is the builder logic this product is moving away from.

---

## 5. The operator workflow

One tenant at a time. **A step is not complete until it is written down.**

```
   1  review the live page     ← what they actually have, not what the row says
   2  prepare the proposal     ← replacement for every affected feature
   3  contact the tenant       ← with the proposal already prepared
   4  record the decision      ← in this document, dated
   5  promote — only after 4   ← then flip the flag, then verify
```

**1 — Review the live page.** Open it as a visitor, in both languages. The row
tells you a tenant has three stats; it does not tell you that one is blank, or
that the ticker says "on holiday until March". Screenshot it — §6 needs the
screenshot anyway.

**2 — Prepare the proposal.** Every affected feature has a named replacement
before the client is contacted. Arriving without one turns a two-minute
confirmation into an open-ended design conversation.

**3 — Contact the tenant.** Cover, in this order: what is not changing; that
their work moves from behind a button to being the page; what is going and why,
in one sentence each; the CTA proposal, to confirm or change; and — only if they
have stats — the invitation to write one short line, with "or nothing" offered as
a real option.

**This is substance, not a script.** No outreach copy is drafted here, and none
should be sent from a template: eleven tenants do not need one, and a templated
message about someone's own portfolio reads as exactly that.

**4 — Record the decision.** In the register (§2), dated, including what the
client chose to leave empty. **A silence is not a decision** — an unanswered
message means the tenant is not ready to cut over.

**5 — Promote.** Only now, and then §6.

---

## 6. The cutover checklist

Per tenant. Both halves, in order.

### Before

- [ ] **Screenshot the current live page** — desktop and 375px, both languages.
      This is the only record of what the site looked like; after the flip there
      is nothing to compare against.
- [ ] **Verify the replacement decisions** are recorded in §2 and confirmed by
      the client — CTA destination, credibility line (or a recorded "none"),
      appearance mapping.
- [ ] **Confirm the snapshot promotion is ready** — the tenant's document
      reconciled against its live page during P4 internal verification, and no
      unresolved `URL → path` failure.

### After

- [ ] **Flip the renderer flag** — `tenants.public_renderer` → `v2`. One row.
- [ ] **Compare against the screenshot**, same viewports, both languages.
- [ ] **Verify each section, in hierarchy order:**
  - [ ] **Identity** — name, title, and the mark if they had one
  - [ ] **Work** — every piece present, in the client's order, at least one piece
        visible on a 375px screen without scrolling
  - [ ] **Introduction** — bio in full, credibility line only if one was written
  - [ ] **Action** — appears once, below the work, and goes where they confirmed
  - [ ] **Links** — every link present, working, correct glyph
  - [ ] **Footer** — their line, plus legal
- [ ] **Check the removed features are gone** — no ticker, no banner, no stats,
      no CTA stack, no empty section where one used to be.
- [ ] **Confirm the favicon and link preview** still resolve (interim `og:image`
      policy applies until P7).

**If anything is wrong: flip the flag back.** It is one row, it takes effect
immediately, and it is what the scaffolding exists for. Then fix, and repeat.

---

## 7. Sequencing

**Start P0.3 first and expect it to finish last.** It is the only item in the
plan whose duration is not controlled by us, and it gates P5 alone.

**Sequence the hardest tenant deliberately.** The last tenant to cut over holds
P6 — and therefore the security fix — open. Leaving whoever is most complicated
until the end is how a dated phase becomes an undated one.

**The register already names them.** The hardest are not the tenants losing the
most features — `designakum` loses all four and is internal, so it is among the
easiest. They are **`alihabibfilms` and `roza`**, because §2.8 is unresolved and
because option **b** for either of them *is* the thing that holds P6 open.

So the order is: settle §2.8 **before** P5 begins, then cut over the tenants that
are only losing features, and let the zero-work tenants be sequenced by whatever
that decision turns out to be — not left to the end by default.
