-- Section P — the published snapshot: what a visitor sees, separated from what
-- the client is editing
--
-- *** PROPOSAL. NOT APPLIED. ***
-- Nothing in this file has been run against production. It exists so the
-- decision is a yes/no on something concrete rather than an open design
-- question. Apply it deliberately, read the BLAST RADIUS section first, and
-- update SCHEMA.sql afterwards.
--
--
-- WHAT THIS IMPLEMENTS
-- --------------------
-- Blueprint §8.5, decided 2026-08-20, quoted rather than paraphrased because
-- the storage model is already settled and this migration must not re-open it:
--
--   "The editor keeps writing to `profile` and `projects` — those rows *are*
--    the draft. Publishing serialises the current state into a published
--    snapshot per tenant, which the public page reads. One column and one
--    function; no existing write path is rewritten."
--
-- So: ONE COLUMN and ONE FUNCTION. That is the whole migration.
--
-- Explicitly rejected there, and not reconsidered here: per-field draft columns
-- (doubles every write path) and a version-history table (that is a versioning
-- system, and nothing in this product needs one).
--
--
-- THE THING THIS DOES NOT DO, STATED FIRST
-- ----------------------------------------
-- It does NOT move the public site onto the snapshot. pages/[slug].js and
-- pages/index.js keep reading `profile` and `projects` exactly as they do
-- today, so applying this changes what a visitor sees by NOTHING. It only
-- creates the place a snapshot lives and the function that fills it.
--
-- That is blueprint §8.5's build order, and the order matters:
--
--   1. Define the published snapshot model      <- THIS FILE
--   2. Implement promotion from draft to snapshot  <- THIS FILE
--   3. Move the public renderer to snapshot reads  <- application code, later
--   4. Generate share images                       <- last, depends on 1-3
--
-- Until step 3 lands, editing still changes the live site immediately, because
-- the live site is still reading the draft rows. Applying this migration is
-- therefore SAFE and INERT, and step 3 is the moment "published" stops being a
-- design and becomes a state.
--
--
-- WHY A COLUMN ON `tenants` AND NOT A `published_snapshots` TABLE
-- ---------------------------------------------------------------
-- SCHEMA.sql line 293 anticipates a `published_snapshots` table. The blueprint,
-- which is newer and is the product authority, says "one column". A column
-- wins here for a reason beyond obedience: the snapshot is strictly one per
-- tenant, the public page already resolves the tenant row on every request, and
-- a table would add a join to the hottest read path in the product to model a
-- 1:1 relationship.
--
-- THE COST, stated accurately rather than dramatically. `tenants` is a narrow,
-- frequently scanned table and this puts a potentially large jsonb on it.
-- Postgres stores an oversized jsonb out of line (TOAST) and does not read it
-- unless the column is actually selected.
--
-- AS OF THIS MIGRATION, NO APPLICATION READ SELECTS IT. Every read of `tenants`
-- in the codebase names its columns:
--   pages/admin.js:942   .select('id, slug, name, status')   -- workspace switcher
--   pages/admin.js:4872  .select('id,handed_over_at')
--   lib/tenant.js:237    .select('id, slug, status')         -- public site path
-- The only unqualified .select() against tenants is the insert-returning at
-- pages/admin.js:3333, which returns ONE freshly created row whose snapshot is
-- NULL. So the practical cost today is zero, and the concern is future: a later
-- `select *` would start paying for it. If that ever measures, the fix is a
-- separate table, and moving it is a mechanical change to one function and one
-- read.
--
-- (An earlier draft of this file claimed the workspace switcher used `select *`.
-- It does not. Corrected after review rather than left to mislead.)
--
--
-- SECURITY MODEL
-- --------------
-- publish_tenant() is the INTENDED publish path. It is not the only technically
-- possible writer, and the distinction matters -- PostgreSQL RLS is ROW-level,
-- not column-level, so nothing here protects these two columns specifically.
--
-- What actually protects them, precisely:
--   * `tenants` INSERT/UPDATE/DELETE is gated by is_platform_owner()
--     (SCHEMA.sql, ROW LEVEL SECURITY section). An ordinary client is not a
--     platform owner, so they have NO update on `tenants` at all -- and
--     therefore cannot write published_snapshot or published_at directly, nor
--     hand-craft a snapshot that differs from their own draft.
--   * A PLATFORM OWNER can update those columns directly, bypassing this
--     function entirely. That is accepted: an operator can already edit every
--     content row in the database, and closing it would mean a column-level
--     grant that the rest of this schema does not use.
--
-- The function is still the only path that GUARANTEES the snapshot matches the
-- draft, which is the property that matters. This follows the pattern SCHEMA.sql
-- describes for the billing tables -- "every write is a function or an edge
-- function" -- without overstating what the database enforces.
--
-- Publishing is gated by can_edit_tenant(), which is
--   is_platform_owner() OR (is_tenant_admin(tid) AND tenant_has_active_subscription(tid))
-- so it carries the paywall the platform already enforces. NOTE, because it is
-- a real inconsistency and not an oversight: the locked model puts the paywall
-- at PUBLISHING while can_edit_tenant() puts it at WRITING. This migration
-- deliberately does not move that boundary — see
-- docs/architecture/publishing-boundary.md. Using the existing predicate keeps
-- this migration about snapshots and nothing else.
--
-- ENTITLEMENT GATES WHETHER THE SNAPSHOT IS SERVED, NEVER WHETHER IT EXISTS
-- (§8.5). An expired subscription must not clear published_snapshot: that
-- would destroy the client's published work over a lapsed card. Nothing here
-- deletes a snapshot, ever, except the tenant cascade.
--
--
-- THE READ GAP — NOT CLOSED BY THIS, AND WORTH BEING HONEST ABOUT
-- ---------------------------------------------------------------
-- SCHEMA.sql KNOWN GAPS #3: `profile` and `projects` are anon-readable with
-- USING (true), so an unpublished tenant's content is already world-readable
-- through PostgREST. This migration does not make that worse and does not fix
-- it. It becomes fixable at step 3: once the public page reads only the
-- snapshot, the draft tables can drop their anon SELECT. That is phase P6 of
-- docs/architecture/renderer-migration.md and it cannot land before then.
--
-- KNOWN GAPS #4 (draft media is world-readable) is untouched and unfixable
-- here: it needs the media pipeline, not a policy.
--
--
-- MEDIA
-- -----
-- §8.5: "Never delete a storage object still referenced by the published
-- snapshot." This migration stores FULL PUBLIC URLs, matching what
-- pages/admin.js already writes into profile_image / cover_image, so a
-- snapshot is self-contained and a cleanup sweep can diff against it by string.
-- SCHEMA.sql line 117 notes the eventual snapshot model specifies `path` and
-- that promotion "must normalise" — deliberately NOT done here, because
-- normalising URLs to paths while 135 of 157 objects still sit at legacy flat
-- paths (KNOWN GAPS #2) would produce snapshots pointing at objects that
-- cannot be resolved. Normalisation belongs with the media pipeline.
--
--
-- BLAST RADIUS, TO BE MEASURED BEFORE APPLYING
-- --------------------------------------------
-- Run the VERIFY block at the bottom BEFORE and after. Expected effect of
-- applying: 15 tenants gain a NULL column; nothing is read by any running code
-- path; no policy changes; no existing function is redefined. The only way this
-- alters a visitor's experience is if someone also ships step 3.
--
-- Idempotent. Safe to re-run.


-- 1. THE COLUMN ---------------------------------------------------------------

alter table public.tenants
  add column if not exists published_snapshot jsonb,
  add column if not exists published_at timestamptz;

comment on column public.tenants.published_snapshot is
  'The portfolio a visitor sees, serialised at publish time. NULL = never published. publish_tenant() is the intended writer; clients cannot write it because tenants UPDATE is owner-only, but a platform owner technically can. See section-p-published-snapshot.sql.';

comment on column public.tenants.published_at is
  'When published_snapshot was last written. NULL = never published.';


-- 2. THE FUNCTION -------------------------------------------------------------
-- Serialises the CURRENT draft (profile + projects) into the snapshot.
--
-- security definer so it can read the draft rows and write the tenants column
-- without granting the caller either privilege directly; the can_edit_tenant()
-- check inside is what actually authorises, and it runs as the CALLER because
-- it reads auth.uid().

create or replace function public.publish_tenant(tid uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  snap jsonb;
  stamp timestamptz := now();
begin
  if tid is null then
    raise exception 'publish_tenant: tenant id is required';
  end if;

  -- The authority for every content write, reused rather than reinvented.
  if not public.can_edit_tenant(tid) then
    raise exception 'publish_tenant: not permitted for tenant %', tid
      using errcode = '42501';
  end if;

  -- A tenant with no profile row has nothing to publish. This is not an error
  -- worth raising -- an owner-created workspace can legitimately be empty --
  -- but it must not write an empty snapshot over a good one.
  if not exists (select 1 from public.profile where tenant_id = tid) then
    raise exception 'publish_tenant: tenant % has no profile to publish', tid
      using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    -- Versioned from the first row. A snapshot read by a future renderer must
    -- be able to tell which shape it is looking at without guessing.
    'version', 1,
    'published_at', stamp,
    'tenant', jsonb_build_object(
      'slug', t.slug,
      'name', t.name,
      'default_lang', t.default_lang
    ),
    -- The profile columns the public page actually renders. Listed explicitly
    -- rather than row_to_json(p): a snapshot must not silently start carrying
    -- whatever column someone adds next, and several of these columns are
    -- slated for removal at phase P6.
    'profile', jsonb_build_object(
      'name',          p.name,
      'tagline',       p.tagline,
      'bio',           p.bio,
      'profile_image', p.profile_image,
      'brand_logo',    p.brand_logo,
      'favicon_url',   p.favicon_url,
      'default_lang',  p.default_lang,
      'appearance',    p.appearance,
      'custom_links',  p.custom_links,
      'custom_fields', p.custom_fields,
      'sections',      p.sections,
      'banners',       p.banners,
      'stats',         p.stats,
      'cta_buttons',   p.cta_buttons,
      'top_ticker',    p.top_ticker,
      'footer',        p.footer,
      'seo',           p.seo
    ),
    'projects', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id',               pr.id,
                   'title',            pr.title,
                   'description',      pr.description,
                   'full_description', pr.full_description,
                   'cover_image',      pr.cover_image,
                   'images',           pr.images,
                   'external_url',     pr.external_url,
                   'display_order',    pr.display_order
                 )
                 -- Ordered HERE so the renderer never has to sort. The projects
                 -- sequence is shared across tenants, so id order means nothing.
                 order by pr.display_order asc, pr.id asc
               )
          from public.projects pr
         where pr.tenant_id = tid
      ),
      '[]'::jsonb
    )
  )
    into snap
    from public.tenants t
    join public.profile p on p.tenant_id = t.id
   where t.id = tid;

  update public.tenants
     set published_snapshot = snap,
         published_at = stamp
   where id = tid;

  -- A publish that writes nothing must FAIL, never return a timestamp.
  --
  -- This function is SECURITY DEFINER, so it normally runs as the table owner
  -- and bypasses RLS on `tenants` -- which is what lets it write a column whose
  -- UPDATE policy is owner-only. If that ever stops being true (FORCE ROW LEVEL
  -- SECURITY enabled on tenants, or the function recreated under a role that is
  -- not the table owner), the UPDATE silently matches zero rows and the caller
  -- is told the portfolio was published when nothing was written. The client
  -- would see "published" over an unchanged site.
  --
  -- Cheap to check, and the failure it prevents is invisible otherwise.
  if not found then
    raise exception 'publish_tenant: tenant % was not updated -- 0 rows affected', tid
      using errcode = '25000',
            hint = 'Check pg_class.relforcerowsecurity for tenants and the owner of this function.';
  end if;

  return stamp;
end;
$function$;

comment on function public.publish_tenant(uuid) is
  'Promotes the current draft (profile + projects) into tenants.published_snapshot. Gated by can_edit_tenant(). The INTENDED writer of that column; a platform owner can also update it directly. See section-p-published-snapshot.sql.';

revoke all on function public.publish_tenant(uuid) from public;
grant execute on function public.publish_tenant(uuid) to authenticated;


-- VERIFY ----------------------------------------------------------------------
-- BEFORE applying, record the baseline:
--
--   select count(*) as tenants from public.tenants;
--   -- expected: 15
--
-- AFTER applying, the column exists and every tenant is unpublished:
--
--   select count(*) filter (where published_snapshot is null) as never_published,
--          count(*) as total
--     from public.tenants;
--   -- expected: 15 / 15  — applying must publish nothing by itself
--
-- The function refuses an unknown tenant. READ THE EXPECTED ERROR CAREFULLY --
-- it depends on WHO runs it, and the obvious guess is wrong:
--
--   select public.publish_tenant('00000000-0000-0000-0000-000000000000');
--
--   As a PLATFORM OWNER (which is who will be running this):
--     ERROR  publish_tenant: tenant 00000000-… has no profile to publish  (P0002)
--   NOT "not permitted". can_edit_tenant() is
--     is_platform_owner() OR (is_tenant_admin(tid) AND entitled)
--   and is_platform_owner() ignores `tid` entirely, so the permission check
--   PASSES for an owner against any uuid, real or not. Execution then reaches
--   the profile-existence guard, which is what raises.
--
--   As a non-owner client:
--     ERROR  publish_tenant: not permitted for tenant 00000000-…  (42501)
--
-- Both outcomes are correct. Seeing P0002 as an owner does NOT mean the
-- authorization check is broken -- proving that path requires a non-owner
-- session, which this block deliberately does not set up.
--
-- A real publish, run as an owner against the SAFE TEST WORKSPACE ONLY
-- (OneCentTest — never a real client):
--
--   select public.publish_tenant(id) from public.tenants where slug = 'onecenttest';
--   select slug,
--          published_at,
--          jsonb_array_length(published_snapshot->'projects') as pieces,
--          published_snapshot->'profile'->'name' as name
--     from public.tenants where slug = 'onecenttest';
--   -- expected: a timestamp, the piece count, and the name — and the public
--   -- site at /onecenttest UNCHANGED, because nothing reads the snapshot yet.
--
-- ROLLBACK, if it is ever wanted. Dropping the column destroys every snapshot,
-- which is only safe while nothing reads them — i.e. before step 3:
--
--   drop function if exists public.publish_tenant(uuid);
--   alter table public.tenants
--     drop column if exists published_snapshot,
--     drop column if exists published_at;
