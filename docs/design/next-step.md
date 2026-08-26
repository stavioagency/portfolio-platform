# The next step

**The portfolio's single primary action.** Approved; this is the model
implementation follows.

Placement was decided in [public-portfolio-hierarchy.md](public-portfolio-hierarchy.md)
§3b — after the work and the context, never above the work. This settles what
it *is*.

---

## 1. The rules

1. **One primary next step. Only one.**
2. **The same one appears on the portfolio and on every piece page.**
3. **The client provides the destination. Nothing else.**
4. **No builder** — no second action, no per-piece action, no variants.
5. **No custom text, no styling controls, no placement controls.**

---

## 2. The model

```
Portfolio
└── action
    └── destination     one URL or email address. That is the entire field.
```

There is no `label`, no `style`, no `variant`, no `position`, and no `enabled`.
Each of those would be a decision handed to the client, and every one of them
is a decision the product should make once, well, for everyone.

**The label is ours.** The client is a photographer, not a conversion copywriter;
asking them to write the words on a button is asking them to do a job they did
not come here for, and inviting *"CLICK HERE!!"* onto a page sold as premium.

| | English | Arabic |
|---|---|---|
| Label | **Get in touch** | **للتواصل** |

**The Arabic is deliberately nominal.** «تواصل معي» is an imperative addressed
to the visitor, and Arabic imperatives carry gender — so it would be wrong for
half of everyone who opens the page. This is the neutral-voice rule
(design.md 11) reaching a new surface: it was written for the Studio addressing
the client, and it applies just as much to the portfolio addressing a visitor.

---

## 3. Behaviour

**It appears only when there is a destination.** Sections come from content,
never toggles (hierarchy §0.6) — so there is no "show the button" switch, and
an empty destination simply means the page has no next step. That is a complete
and acceptable portfolio.

**One destination, two shapes.** An email address becomes a `mailto:` link; a
URL is used as given. The client types where to reach them and the product
works out the rest — they should not have to know the difference.

**Every link is passed through `safeUrl()` at render**, as everywhere else in
the product: input is stored raw and sanitised on the way out.

---

## 4. Where it sits

| Page | Position |
|---|---|
| The portfolio | After the work, after the introduction, before the links |
| A piece page | After the piece and its own link, before the rest of the work |

On a piece page it is **the same action, repeated** — not a second one. A
visitor arriving from a shared link may never see the portfolio's version, and
that is the only reason it is there.

**It is never above the work**, on either page. That rule is what keeps the
portfolio from becoming a link-in-bio card again.

---

## 5. Where it is edited

The destination lives in the **Links panel** — the panel about how people reach
the client. It does **not** get a fifth panel: the Studio has four, and a new
panel would mean a new kind of content rather than one more field
(studio-editor-model.md §4).

Clicking the next step in the preview opens that panel, exactly as clicking a
link does.

---

## 6. What this deliberately refuses

| Refused | Why |
|---|---|
| A second action | A page with two equal asks has none |
| Per-piece actions | The client would maintain fourteen of them, and a visitor would meet a different ask on every page |
| Custom label text | See §2 — it is a job the client did not come here for, and the failure mode is loud |
| Style or colour choice | Unlimited theming, already ruled out |
| A placement control | Placement is a hierarchy decision, made once, for everyone |
| "Hide the button" | Leaving the destination empty already does this, without a setting |
