# Handoff — the Studio / Client redesign

**Written 2026-09-11.** Everything below is verified fact, not plan. Read this
before touching anything; then read `docs/architecture/studio-cutover.md`, which
holds the cutover checklists.

---

## 1. What this work is

Take the existing, live Designakum platform and redesign the **product
experience** on top of it. Not a rebuild:

```
/[slug]    public portfolio    FROZEN — do not redesign it
/studio    customer experience NEW, built, tested against production
/client    owner experience    NEW, built, read-only
/admin     legacy editor       UNTOUCHED, still the live editor
/console   legacy owner tools  UNTOUCHED, still holds every destructive action
```

The public portfolio is **frozen for this whole phase**. Do not redesign it, do
not add templates, do not start another visual experiment. An earlier attempt in
this repo did exactly that and was deleted in full at the owner's request.

## 2. Repository and access facts

- Repo `stavioagency/portfolio-platform`, branch `main`, **public**.
- Supabase project `gphrzvjlstznhypcfgre`. **`.env.local` points at PRODUCTION** —
  running the app locally reads and writes real customer data.
- 7 tenants, all `comped`, all entitled, all published, none disabled.
- Owner account is enrolled as a `tenant_admin` of **every** tenant
  (`trg_enroll_platform_owners`), so the owner sees all 7 workspaces in Studio.
- Tests: `npm test` → **702 tests, 700 pass, 0 fail, 2 skipped**. The 2 skips are
  a pre-existing P1 contract that arms itself when `lib/portfolio-view.js` exists.

## 3. Git state

**Everything is pushed. `origin/main` is at `f49e95f`.** Deployed via Vercel,
which builds `main`, so `/studio`, `/client` and the admin link are all live.

```
f49e95f The signup funnel ends at the Studio, and the Studio can receive it
6a5cc78 The Studio and /client stop being desktop-only at 375px
192ed44 Handoff: the state of the Studio and Client work, as facts
68a4283 Image upload works; deleting a project does not reclaim its storage
f69bf92 Deep links into a Studio section silently opened Home
142bf6f Studio opened the wrong customer's portfolio — twice, for two reasons
8da35f0 Building a portfolio stops costing money; publishing still does
c9ec48e Studio tells an unpaid customer the truth, and the cutover is written down
e41e0c5 /client: one owner console, over the data /console already reads
74aaba6 Studio autosaves, previews the draft, and publishes deliberately
8866520 Studio can edit a portfolio: Profile, Work, Appearance, Links
fcdbfc5 Studio gets a shell, and Home tells the truth about the portfolio
```

**Pushing is now routine; the owner lifted the hold on 2026-09-11.** A push
still ships to production immediately, so it is not a casual act.

NOTE: there are TWO clones of this repo on the owner's machine.
`~/Projects/portfolio-platform` is the working one. `~/Documents/GitHub/portfolio-platform`
is what GitHub Desktop opens and it was 12 commits behind as of 2026-09-13.

## 4. Production changes already applied

Two migrations, both applied and verified against the live database.

**`section-y`** — `designakum.site` was hard-coded as a "neutral host" inside
`get_public_portfolio()`, so the apex 404'd while `/designakum` worked. Removed;
the domain now resolves through `tenant_domains` like any other. *(This one is
already pushed, in `92abb0b`.)*

**`section-z`** — drafting no longer requires a subscription.

```
can_draft_tenant()  profile, projects        membership only
can_edit_tenant()   publish_tenant,
                    tenant_domains           membership + paying
```

The trap: `can_edit_tenant()` was read in four places **including inside
`publish_tenant()`**. Relaxing it in place would have made publishing free while
appearing to implement "build free, pay to publish". Two ideas shared one name,
so they were split.

## 5. What is built

**`/studio`** — rail on desktop, bottom bar + More sheet on mobile, Arabic RTL
throughout (logical CSS properties only; a test forbids physical `left`/`right`).

- **Home** — status, publish panel with requirements, live draft preview
- **Profile** — name, title, bio, picture, content-language choice
- **Work** — create, edit, reorder, delete, cover + gallery
- **Appearance** — accent only (see §7)
- **Links** — up to 8
- **Plan** — the sellable catalogue, handing off to `/subscribe`
- **Visitors** — visits, visitors, project views, contact clicks, per-day chart
- **Domain** — add, verify, re-point; the DNS record to create; removal stays in `/admin`
- **Settings** — password change; email shown, changed only by an operator

**`/client`** — summary (every number is a filter), search, customer record.
**Read-only by design**; a test asserts no insert/update/delete and no
edge-function call. Destructive operations stay in `/console` and are linked.

## 6. Verified against production (2026-09-10), on `designakum`, draft only

Everything was put back; the published snapshot was never touched.

| | |
|---|---|
| Profile edit | autosaved, reached the database, survived reload |
| Add / title / reorder / delete | all persisted; reorder rewrote both rows |
| Delete dialog | named the piece and its image count |
| Image upload | 111,570 B PNG → **6,006 B WebP**, tenant path, public URL 200 |
| Unpublished changes | detected and cleared, by byte comparison |
| `/client` counts | matched the database exactly, including "0 ending soon" |

## 7. Decisions already made — do not relitigate

- **Appearance is one control, the accent.** The public page reads exactly one
  appearance value, `tokens.accent`. Everything else was deliberately removed
  after a client's site rendered lilac edge to edge. Offering more would be
  offering a control the renderer ignores. It grows only when the public
  portfolio is unfrozen.
- **No unpublish.** Nothing in the database removes a published snapshot;
  adding one is a new destructive operation and a separate decision.
- **No free hex colour field.** A free hex is what put an unreadable accent on a
  live site. Ten curated accents, each contrast-checked.
- **The signup funnel ends at `/studio`** as of 2026-09-11. It was not the
  one-line change the cutover doc described: `/studio` consumed neither `?plan`
  nor `?lang`, and `plan` was routed to the NotYet placeholder, so flipping the
  line alone would have dropped a paying customer's plan and shown them a screen
  with no way to pay. Plan is a real screen now (`components/studio/plan.js`)
  and hands off to `/subscribe`. `/admin` stays reachable and is still the only
  sign-in screen.

## 8. Open items

1. ~~Three Studio sections are still placeholders.~~ **Done 2026-09-13.**
   Visitors, Domain and Settings are real screens and `NotYet` is deleted. The
   Studio has no placeholders left and "one editor" is now true for everything
   except the three things listed below, which are genuinely `/admin`'s:
   removing a domain, invoices, and changing an account's email.

2. **No real payment has ever run through the new Plan screen.** All seven
   tenants are comped. The hop builds the same `?plan=&tenant=` URL that
   `/admin`'s Billing tab has always built, so the risk is low — but the first
   real signup is the test, and it is the revenue path.
3. **Deleting a project leaves its images in storage.** Pre-existing, shared
   with `/admin`; 17 unreferenced media objects. Cost and tidiness, not
   correctness. Fix shape is probably an operator-triggered sweep.
4. **`/console` → `/client` is untouched.** `/client` is still read-only.
   Concrete prerequisite: it reads only `tenants`, `subscriptions` and
   `free_access_invites`, so it holds no member data — password reset and email
   change cannot be wired without adding that read.
5. **The accent does far less than the Appearance screen used to claim.** On
   the frozen public page the tenant accent reaches only four small places: the
   2px ring around the picture, the foot glow (HUE ONLY — lightness pinned at
   0.55, chroma capped at 0.09), the work dots, and one footer line. The old
   copy promised "buttons", which stopped being true when the public CTA became
   a ghost button. Corrected 2026-09-13 after the owner reported the colours as
   broken; they were not, the screen was overpromising. If the accent should do
   more, that is a change to the FROZEN renderer and a separate decision.
6. **The curated palette is validated against the wrong ink.** All ten accents
   in `lib/studio-appearance.js` score below 4.5:1 as text on the dark public
   card (`slate` 2.23, the default `royal` 3.50). They are checked against
   white-on-fill, which is correct for app chrome and not for the surface the
   public renderer paints. The two live client accents (#5B8DEF 5.56, #8b86d2
   5.50) both PASS there — the handoff's old "fails contrast" note measured
   them against white, an ink the public page no longer puts on the accent.

## 9. Working rules that were agreed

- Reuse the existing auth, tenancy, RLS, billing, storage and renderer. Do not
  rebuild proven infrastructure.
- Never weaken a test to make code pass. Several guards in this repo caught real
  defects during this work — gendered Arabic imperatives, an unreachable file
  input, an undeclared token, a missing icon. Obey them.
- Arabic must be gender-neutral: verbal nouns, not imperatives («إضافة», not
  «أضِف»). A test enforces it.
- Test on `designakum` only. Every other tenant is a real client. Draft edits are
  invisible to visitors; **only Publish changes a live page.**
- Destructive SQL and RLS changes still need explicit approval. Pushing no
  longer does — but a push deploys to production the moment it lands.

## 10. How to run it

```bash
cd ~/Projects/portfolio-platform
npm run build && PORT=3000 npx next start     # production build
```

Use the **production build**, not `npm run dev`: the dev server wedged during
this work and stopped hydrating `/studio` entirely, which looks exactly like an
application bug and is not one.

Sign in at `/admin?next=/studio`. There is one login screen for the platform and
it lives at `/admin`; `?next=` returns you.
