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
                          ├─ "Try the new Studio", in the admin sidebar
                          └─ /studio, by URL or ?next=/studio
```

The owner has said the funnel SHOULD move to `/studio` once everything is
finalised. It has not moved yet.

`pages/signup/verify.js` sends a newly verified customer to `/admin`. That is
**deliberately unchanged**: switching it would put every real new customer into
a Studio nobody has used yet, and the funnel is the one path where a bad first
five minutes costs a sale.

**The switch is one line** — `adminHref` in `pages/signup/verify.js` becomes
`/studio?...`. It should not be made until §3 is satisfied.

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
