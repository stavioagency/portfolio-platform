# Cutover: /admin → /studio, /console → /client

**Status: not cut over. Nothing in this document has been done.**

The Studio and the owner console are built and tested. Neither has replaced
anything, and both existing surfaces are untouched and still authoritative.
This file records what "proven" has to mean before each switch, and what the
switch actually is — so the decision is a decision rather than a discovery.

---

## 1. Where the journey currently stops

```
signup  →  verify  →  /admin?plan&lang   ← the funnel still ends here
                          │
                          └─ /studio is reachable by URL, and by ?next=/studio
```

`pages/signup/verify.js` sends a newly verified customer to `/admin`. That is
**deliberately unchanged**: switching it would put every real new customer into
a Studio nobody has used yet, and the funnel is the one path where a bad first
five minutes costs a sale.

**The switch is one line** — `adminHref` in `pages/signup/verify.js` becomes
`/studio?...`. It should not be made until §3 is satisfied.

---

## 2. The blocker that is not ours to fix

**Production RLS says an unpaid customer cannot edit anything.**

```
profile / projects   SELECT  is_tenant_admin(tenant_id)
profile / projects   ALL     can_edit_tenant(tenant_id)

can_edit_tenant(tid) = is_platform_owner()
                       OR (is_tenant_admin(tid) AND tenant_has_active_subscription(tid))
```

Verified against the live database on 2026-09-10, not read from the section
files — those are known to drift.

The master direction says the opposite:

> Free users: CAN create/edit/explore their portfolio. CANNOT publish.

Both cannot be true. Today the product is **pay-then-edit**; the direction wants
**explore-then-pay**.

**Until that is decided, the Studio tells the truth**: a customer without a
subscription sees one notice explaining that they can look but not save, and no
field schedules a write. That behaviour costs nothing if the rule changes — the
day `can_edit_tenant` stops requiring a subscription, `canEdit` is true for
everyone and none of it renders.

**This is an RLS change on a live multi-tenant product and needs an explicit
decision.** It is not a code change anyone should make on inference.

---

## 3. Before switching the funnel to /studio

Each line is a thing to *do*, not a thing to assume:

- [ ] Sign in and complete the whole journey on a workspace you do not mind
      touching: edit profile, add a project, upload an image, reorder, delete,
      change the accent, add a link.
- [ ] Watch the autosave line reach **Saved** — not just stop saying "Saving".
- [ ] Reload and confirm every change actually persisted.
- [ ] Publish, then open `/{slug}` in a private window and confirm the change is
      live.
- [ ] Repeat in Arabic **and** English, and on a real phone.
- [ ] Confirm §2 is resolved, or accept that new signups land in a read-only
      Studio and that this is the intended first experience.
- [ ] Decide what happens to a customer mid-edit in `/admin` when the funnel
      moves — nothing breaks, but two editors will be live at once.

Only then: change `adminHref`, and leave `/admin` reachable.

---

## 4. Before /console becomes /client

`/client` is deliberately **read-only**. Every destructive operation — deleting a
client, resetting a password, changing an account email, moving a billing period,
granting and revoking free access — still lives in `/console` and is linked from
the customer record.

- [ ] Use `/client` for real triage for a week. Do its numbers match reality?
- [ ] Confirm the counts against `/console` on the same day.
- [ ] Move ONE destructive operation over, with its confirmation, and use it.
- [ ] Repeat until `/console` has nothing unique left.
- [ ] Only then redirect `/console` → `/client`.

**Do not redirect `/console` before it is empty.** It is the only working owner
tool, and it is what an operator reaches for when something is on fire.

---

## 5. What is genuinely finished

- `/studio` — shell, Home, Profile, Work, Appearance, Links, autosave, draft
  preview, publishing with its requirements, read-only honesty.
- `/client` — summary, search, customer list, customer record.
- Neither reimplements authentication, tenancy, storage, billing or publishing.
  Every one of those is called, not rebuilt.

## 6. What is deliberately absent

- **Unpublish.** Nothing in the database removes a published snapshot; adding one
  is a new destructive operation and a separate decision.
- **Appearance beyond the accent.** The public page reads exactly one appearance
  value. Anything more is a control the renderer ignores, and the public
  portfolio is frozen.
- **Domain, Visitors, Plan and Settings in the Studio.** They still point at
  `/admin`, which does them today.
