# Cutover: /admin → /studio, /console → /client

**Status: the funnel is cut over. `/client` can now operate; `/console` is still not redirected.**

Updated 2026-09-13. §3 (the funnel → `/studio`) was done on 2026-09-11 and is
live. §4 (`/console` → `/client`) is untouched and `/console` remains the only
place any destructive operation exists.

The Studio and the owner console are built and tested. Neither has replaced
anything, and both existing surfaces are untouched and still authoritative.
This file records what "proven" has to mean before each switch, and what the
switch actually is — so the decision is a decision rather than a discovery.

---

## 1. Where the journey currently stops

```
signup  →  verify  →  /admin?plan&lang   ← the funnel still ends here
                          │
                          ├─ "Try the new Studio", in the admin sidebar
                          └─ /studio, by URL or ?next=/studio
```

**It moved on 2026-09-11.** `verify.js` now builds a `/studio` URL.

AND IT WAS NOT ONE LINE. This document said it was, and that was the most
expensive sentence in it. `/admin` consumed `?plan` (planFromQuery) and opened
Billing with it selected; `/studio` consumed neither `plan` nor `lang`, and
`plan` was one of four ids routed to the NotYet placeholder. Flipping the line
alone would have sent every new paying customer to a screen that says "not yet"
with no way to pay, and opened an Arabic Studio for English customers.

What the switch actually required: a real Plan screen handing off to
`/subscribe`; consuming `?plan` and `?lang`; spending the plan only once a
session exists, because the customer arrives with none and bounces through
`/admin`; and the gate carrying its whole query into `?next=`. Two dead buttons
turned up on that path — `components/ui/Button.js` had no `as` prop, so the
gate's "Sign in" and every placeholder's "Open the current editor" rendered
correctly and did nothing when pressed.

Pinned by `tests/signup-funnel.test.mjs`, which did not exist before: nothing
anywhere recorded where the funnel pointed, which is how it came to look like a
one-line change.

`pages/signup/verify.js` sends a newly verified customer to `/admin`. That is
**deliberately unchanged**: switching it would put every real new customer into
a Studio nobody has used yet, and the funnel is the one path where a bad first
five minutes costs a sale.

~~**The switch is one line**~~ — it was not. See above.

---

## 2. The blocker that was — resolved 2026-09-10

Production RLS used to make editing require a subscription, which contradicted
the product rule. **Fixed in section-z**, with the owner's decision:

> A customer may build their portfolio for free, and may not PUBLISH it until
> they pay.

```
profile / projects   ALL   can_draft_tenant(tenant_id)   membership only
tenant_domains       ALL   can_edit_tenant(tenant_id)    still needs paying
publish_tenant()           can_edit_tenant(tid)          still needs paying
```

**The trap that made this more than a one-word change:** `can_edit_tenant()` was
read in four places, including inside `publish_tenant()`. Relaxing it in place
would have made publishing free as well — removing the paywall entirely while
appearing to implement the rule. Two ideas were sharing one name, so they were
given two.

Applied to production and verified there. Blast radius on the day: none — all
seven tenants were comped and already satisfied both predicates.

## 3. Before switching the funnel to /studio — DONE 2026-09-11

Each line is a thing to *do*, not a thing to assume:

- [ ] Sign in and complete the whole journey on a workspace you do not mind
      touching: edit profile, add a project, upload an image, reorder, delete,
      change the accent, add a link.
- [ ] Watch the autosave line reach **Saved** — not just stop saying "Saving".
- [ ] Reload and confirm every change actually persisted.
- [ ] Publish, then open `/{slug}` in a private window and confirm the change is
      live.
- [ ] Repeat in Arabic **and** English, and on a real phone.
- [ ] Decide what happens to a customer mid-edit in `/admin` when the funnel
      moves — nothing breaks, but two editors will be live at once.

Only then: change `adminHref`, and leave `/admin` reachable.

---

## 4. Before /console becomes /client

**Updated 2026-09-13.** `/client` is no longer read-only. Password reset, email
change, grant, extend, revoke and delete all work there, built on
`lib/client-operations.js` — the same builders `/console` was refactored to
call, so the two cannot drift.

Nothing was taken away from `/console`. This adds a second place to do the same
work, which is the order this checklist asks for.

- [x] Use `/client` for real triage. *(The screen has been in use; its counts
      were verified against the database on 2026-09-10.)*
- [x] Move the destructive operations over, with their confirmations.
- [ ] **Use them on a real customer.** They are pinned by tests for row
      targeting and have not been run against a live workspace.
- [ ] Move what is still unique to `/console`: forcing a delete past a live
      subscription, invitations, and the archive of deleted clients.
- [ ] Only then redirect `/console` → `/client`.

**Do not redirect `/console` before it is empty.** It is the only working owner
tool, and it is what an operator reaches for when something is on fire.

---

## 5. What is genuinely finished

- `/studio` — shell, Home, Profile, Work, Appearance, Links, autosave, draft
  preview, publishing with its requirements.

### Exercised against production, on `designakum`, draft only (2026-09-10)

Everything below was done through the UI and then put back; the published
snapshot was never touched and `has_unpublished_changes()` finished false.

| | |
|---|---|
| Profile edit | autosaved, reached the database, survived a reload |
| Add project | row created, editor opened |
| Title edit | autosaved |
| Reorder | `display_order` rewritten for **both** rows |
| Delete | dialog named the piece and its image count; row removed |
| Image upload | 111,570 B PNG → **6,006 B WebP**, tenant-isolated path, public URL returns 200 |
| Unpublished changes | detected and cleared correctly, by byte comparison |

Not yet exercised: Links, Appearance, `/client` against real numbers, and
mobile.
- `/client` — summary, search, customer list, customer record.
- Neither reimplements authentication, tenancy, storage, billing or publishing.
  Every one of those is called, not rebuilt.

## 5a. Known issue: deleting never reclaims storage

**Deleting a project removes the row and leaves its images in the bucket.**
Verified on 2026-09-10: uploaded a cover, deleted the project through the
Studio, and the object was still in `storage.objects` afterwards.

It is NOT a regression — `/admin` has always behaved this way, and a sweep of
the bucket found **17 media files no longer referenced by any profile or
project**. Replacing an image orphans the old one too.

Consequences are cost and tidiness, not correctness: nothing breaks, and no
customer sees anything wrong. `lib/storage-cleanup.js` exists but runs only when
a whole tenant is deleted.

**Not fixed here, deliberately.** Deleting a customer's files is a destructive
operation, it can fail halfway leaving a row without its images, and the right
shape is probably a sweep an operator triggers rather than a cascade on every
delete. That is its own decision.

## 6. What is deliberately absent

- **Unpublish.** Nothing in the database removes a published snapshot; adding one
  is a new destructive operation and a separate decision.
- **Appearance beyond the accent.** The public page reads exactly one appearance
  value. Anything more is a control the renderer ignores, and the public
  portfolio is frozen.
- **Domain, Visitors, Plan and Settings in the Studio.** They still point at
  `/admin`, which does them today.
