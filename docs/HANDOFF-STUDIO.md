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
- Tests: `npm test` → **666 tests, 664 pass, 0 fail, 2 skipped**. The 2 skips are
  a pre-existing P1 contract that arms itself when `lib/portfolio-view.js` exists.

## 3. Git state

**9 commits ahead of `origin/main`, none pushed.** `origin/main` is at `92abb0b`.

```
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

**Do not push without the owner saying so.**

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
- Domain / Visitors / Plan / Settings still show an honest placeholder → `/admin`

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
- **The signup funnel still ends at `/admin`.** Moving it is one line in
  `pages/signup/verify.js`; the owner wants it moved only once everything is
  finalised.

## 8. Open items

1. **Mobile is untested.** `resize_window` moved the window but not the viewport,
   so the 375px breakpoint never engaged. Needs a real phone or DevTools.
2. **Deleting a project leaves its images in storage.** Pre-existing, shared with
   `/admin`; 17 unreferenced media objects exist. Cost and tidiness, not
   correctness. Fix shape is probably an operator-triggered sweep.
3. **Both live portfolios use an accent that fails contrast** against the white
   text on it (`#5B8DEF` = 3.23:1, `#8b86d2` = 3.26:1; AA needs 4.5). Changing a
   client's brand colour is the owner's call.
4. **Deploy has not been discussed.** Vercel deploys from `main`, so a push ships
   Studio, `/client` and the admin link together.

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
- Do not push, do not deploy, do not run destructive SQL without explicit
  approval.

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
