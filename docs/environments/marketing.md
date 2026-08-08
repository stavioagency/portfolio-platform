# Environment — Marketing (a different project)

**The marketing website is not in this repository and must never be worked on
from it.** This page exists so that a session which wanders toward marketing work
stops, rather than guessing.

---

## Ownership

| | |
|---|---|
| Owner account | `designakum@outlook.com` |
| Repository | its own, separate |
| Supabase | its own project |
| Hosting | its own deployment |

Contains: landing pages, pricing pages, SEO, marketing content and its own admin
CMS. None of that belongs here.

---

## The separation rules

1. **Nothing in this repo may reference, import from, copy, or serve the
   marketing site.**
2. **No marketing copy, pricing prose or sales content belongs in this repo.**
   Plan prices exist here only as billing data in `lib/billing-plans.js` — that
   is billing configuration, not marketing copy.
3. **Never deploy platform code to marketing, or marketing code to platform.**
   Different owners, different Supabase projects, different hosts.
4. **Never point one at the other's Supabase project.**
5. If a task seems to concern the marketing site, **stop and ask.** Do not assume
   which product is meant.

---

## The one place they touch

A single hand-off, and it runs in one direction only:

```
marketing site  ──link──▶  https://designakum.site/signup?lang=ar|en&plan=…
```

**Marketing must link to `/signup`, never `/subscribe`.** `/subscribe` is not a
public page: a visitor sent there has no session, so `billing-checkout` answers
`invalid_token` and they hit a dead end.

The `lang` parameter matters. A visitor crossing from the marketing site is on a
different origin and has nothing stored, so without it an English reader lands on
an Arabic form.

That link is the entire integration surface. There is no shared database, no
shared session, no shared code.

See [architecture/billing.md](../architecture/billing.md) for what happens after
the click.
