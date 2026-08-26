# The credibility line

**Approved.**

Replaces the stat tiles removed in the feature decisions. The governing
sentence:

> **The work proves quality. The credibility line only helps understand who
> made it.**

Everything below follows from taking that literally: it is **context, not
proof**. It does not argue, count, or claim.

---

## 1. Generated, or written by the client?

**Decision: written by the client.** Optional, one short line.

**Why not generated.** Generating a sentence needs structured inputs —
`since: 2014`, `focus: 'editorial'`, `base: 'Riyadh'` — which is three new
fields, three new decisions, and a small schema of claims the product cannot
verify. It also produces sentences that read assembled rather than said, and
the assembled version of "ten years" is a stat counter wearing prose.

**Why not derived from what already exists.** The title already says
*"Photographer, Riyadh"*. Restating it lower down adds nothing; a derived line
would either duplicate the title or invent something the client never said.

**Why written.** The rules require that awards and claims appear **only when
the client explicitly provides them**, which means the text has to come from
them. It is one field, in their voice, using the bilingual mechanism every
other field already uses.

The cost is the obvious one — marketing language — and §5 is how that is
handled: by the example we show, and by the shape of the field, not by a rule
nobody reads.

---

## 2. The model

```
Portfolio
└── shortLine     { ar, en }     optional, one line
```

One field. No structure, no list, no repeatable rows, no icons.

**A repeatable version of this is the stat grid returning.** Three short lines
side by side is exactly the tile row that was removed, and the reason it was
removed applies unchanged: a grid of claims competes with the work while
proving nothing.

---

## 3. Allowed input

| Allowed | Not allowed |
|---|---|
| Plain text, one line | Multiple lines or paragraphs |
| Whatever facts the client chooses to state | Links, markup, formatting |
| Numbers, as Latin numerals in both languages | A counter, a percentage, a total |

**Length is capped, and the cap is the mechanism.** A single-line input with a
hard `maxlength` is what stops this becoming a second bio; ninety characters is
about one clause. There is **no character counter** — no `42 / 90` — for the
same reason there is no image quota: a meter invites filling.

The field is visibly short and the placeholder demonstrates the register, so
the limit is felt rather than announced.

---

## 4. Placement

It belongs to the **introduction**, rendered as a quiet line beneath the bio:

```
   THE WORK
   ────────────────────────────
   the introduction, in full

   Photographing since 2014, mostly editorial     ← the short line, quieter
   ────────────────────────────
   [ the next step ]
```

**Not in identity.** Identity may carry name, one line, and optionally a small
photo — nothing more sits above the work (hierarchy §5). A credibility line
above the work would be a claim placed before the evidence, which is precisely
the link-in-bio move the redesign removed.

**Not on piece pages** — already decided (piece-content-model.md §9). It is
identity-level, and a piece page is not the portfolio.

**Quieter than the bio.** The bio is the client's voice; this is a footnote to
it. If it ever reads louder than the paragraph above it, the hierarchy has
inverted.

---

## 5. Copy rules

### Our copy

| | English | Arabic |
|---|---|---|
| Label | **In short** | **باختصار** |
| Placeholder | Photographing since 2014, mostly editorial | التصوير منذ 2014، غالبًا تحريري |

The label names the register — *brief* — rather than the concept. "Credibility
line" is an internal term and a client should never meet it.

**The placeholder is the teacher.** No rule about marketing language will be
read; an example that is specific, factual and unglamorous sets the register
better than any instruction. It shows a year, a discipline and nothing else —
no adjective, no claim, no exclamation.

Both follow the neutral-voice rule: nominal, no gendered address, natural in
each language rather than translated.

### The client's copy

**Latin numerals in both locales**, as everywhere in the product. This field
will often carry a year, so it is the field most likely to regress to
Arabic-Indic digits if pasted from elsewhere.

**Their words are theirs.** The neutral-voice rule governs what *we* write, not
what the client writes about themselves — a client describing their own work in
the first person is not addressing anyone, and nothing here polices it.

---

## 6. Empty states

> **It never replaces the bio, and never appears as the only introduction.**

This corrects an earlier draft of this document, which allowed a portfolio with
a short line and no paragraph. It does not: the short line is a **footnote to
the introduction**, and a footnote with nothing above it is not an
introduction — it is a claim standing alone, which is the register this whole
feature exists to avoid.

| Case | Behaviour |
|---|---|
| Bio, no short line | The introduction is the bio alone |
| Bio and short line | The bio, with the short line beneath it, quieter |
| **Short line, no bio** | **Nothing renders — neither of them.** The line is dependent on the paragraph it annotates |
| Neither | The page goes from the work to the next step. Complete, not unfinished |

**No prompt, no nudge, no queue item, no completion state.** Absence here is a
choice, not a gap.

The dependency also settles §8: the short line cannot be a *substitute* for the
bio, only a supplement to it, so it can never become the thin introduction a
client falls back on instead of writing properly.

---

## 7. What this refuses

| Refused | Why |
|---|---|
| Stat tiles, in any number | Removed once already. A figure in a box proves nothing and competes with the work |
| A counter, total or percentage | "500+ projects" invites invention, and it is the opposite of context |
| Generated claims | The product cannot verify them and should not author them |
| Awards or logos we supply | Claims come from the client or not at all |
| Multiple lines | See §2 — a repeatable field is the tile row returning |
| Rich text or links | It is one factual line, not a section |

---

## 8. One thing I want ruled on before it is built

**Three fields now describe who made this**: the title (*"Photographer,
Riyadh"*), the bio (a paragraph in their voice), and this line. That is a real
redundancy risk, and it is the strongest argument against the feature.

The case for keeping it: the registers genuinely differ — the title is a
**label**, the bio is a **voice**, the short line is a **fact** — and a
freelancer who will never write a paragraph may well write one line. That makes
it the introduction most portfolios actually get, rather than a third bite at
the same cherry.

The case against: if a client writes a good bio, this line has nothing left to
do, and a field that is redundant when the product works well is a field that
should not exist.

**Decided: keep it, narrow** — one optional line, quieter than the bio, capped
at ninety characters, and **dependent on the bio** (§6). Portfolios with a
strong bio may simply leave it empty, and that is a success rather than a gap.

The dependency is what resolves the redundancy worry. The three fields cannot
compete for the same job, because two of them only ever appear together and in
a fixed order: the label, then the voice, then the fact.
