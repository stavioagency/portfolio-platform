-- Section Q — the public site reads a published snapshot, not the draft tables
--
-- THE HOLE THIS CLOSES
-- --------------------
-- `profile` and `projects` carried `SELECT ... USING (true)` for role `public`.
-- The public site is statically exported and fetches in the browser with the
-- anon key, so the subscription gate ran in the visitor's own JavaScript. The
-- practical consequence: anyone could read ANY tenant's portfolio content
-- straight from PostgREST -- entitled or not, published or not. The paywall
-- gated RENDERING, never ACCESS. SCHEMA.sql KNOWN GAPS #3.
--
-- After this migration:
--   * anon cannot read profile or projects at all
--   * the public site calls ONE function, get_public_portfolio()
--   * that function resolves the tenant, checks status AND entitlement
--     SERVER-SIDE, and returns the published snapshot or nothing
--   * entitlement can no longer be bypassed by editing client-side JavaScript
--
-- WHAT MUST NOT BREAK, and how each is handled
-- --------------------------------------------
-- 1. THE CLIENT EDITOR. profile/projects had exactly one authenticated policy:
--    `ALL ... can_edit_tenant(tenant_id)`, and can_edit_tenant REQUIRES
--    entitlement. Dropping the public SELECT would therefore have locked an
--    UNENTITLED client out of reading their own draft -- the exact people who
--    are deciding whether to pay. So this adds a SELECT policy keyed on
--    is_tenant_admin() (membership, no entitlement). Reading your own draft is
--    always allowed; WRITING it still needs can_edit_tenant, unchanged.
--
-- 2. LIVE SITES GOING DARK. There are zero snapshots today, so switching the
--    renderer to snapshots with an empty table would 404 every paying client.
--    This migration BACKFILLS a snapshot for every tenant that has a profile,
--    as a one-time admin action inside the migration. No site changes.
--
-- 3. BILLING. Nothing here touches subscriptions, payments, invoices, PayPal
--    webhooks or any billing function. tenant_has_active_subscription() stays
--    THE entitlement authority and is called, not reimplemented.
--
-- Reversible: the ROLLBACK block at the bottom restores the public SELECT
-- policies exactly as they were.
--
-- APPLIED IN TWO STEPS, and the order is not optional:
--   A) sections 1-4 (builder, publish_tenant, get_public_portfolio, backfill).
--      Purely additive. Nothing reads the new function yet, so nothing changes.
--   B) section 5 (drop the public SELECT policies) -- ONLY after the renderer
--      that calls get_public_portfolio() is deployed.
-- Doing B first would 404 every live site until the deploy landed; doing the
-- deploy first would break it until the function existed. A-deploy-B has no
-- window where the public site is broken.


-- 1. SNAPSHOT BUILDER, factored out so there is ONE serialization ---------------
-- publish_tenant() and the backfill below must produce identical shapes, and the
-- way to guarantee that is to have one function build it.
--
-- NO AUTHORIZATION CHECK IN HERE ON PURPOSE: it is an internal helper and is
-- revoked from everyone. publish_tenant() is the authorized caller.

create or replace function public.build_portfolio_snapshot(tid uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'version', 1,
    'tenant', jsonb_build_object(
      'slug', t.slug,
      'name', t.name,
      'default_lang', t.default_lang
    ),
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
                 order by pr.display_order asc, pr.id asc
               )
          from public.projects pr
         where pr.tenant_id = tid
      ),
      '[]'::jsonb
    )
  )
  from public.tenants t
  join public.profile p on p.tenant_id = t.id
  where t.id = tid;
$function$;

comment on function public.build_portfolio_snapshot(uuid) is
  'INTERNAL. Serialises a tenant draft into snapshot shape. No authorization check -- revoked from anon/authenticated; publish_tenant() is the authorized caller. See section-q.';

revoke all on function public.build_portfolio_snapshot(uuid) from public;
revoke all on function public.build_portfolio_snapshot(uuid) from anon;
revoke all on function public.build_portfolio_snapshot(uuid) from authenticated;


-- 2. publish_tenant() now delegates the serialization ---------------------------
-- Authorization, the profile guard and the row-count assertion are unchanged.

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

  if not public.can_edit_tenant(tid) then
    raise exception 'publish_tenant: not permitted for tenant %', tid
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profile where tenant_id = tid) then
    raise exception 'publish_tenant: tenant % has no profile to publish', tid
      using errcode = 'P0002';
  end if;

  snap := public.build_portfolio_snapshot(tid);

  update public.tenants
     set published_snapshot = snap,
         published_at = stamp
   where id = tid;

  -- A publish that writes nothing must FAIL, never return a timestamp.
  if not found then
    raise exception 'publish_tenant: tenant % was not updated -- 0 rows affected', tid
      using errcode = '25000';
  end if;

  return stamp;
end;
$function$;


-- 3. THE PUBLIC READ PATH -------------------------------------------------------
-- One function, anon-callable, replacing three anon table reads.
--
-- Resolution mirrors lib/tenant.js exactly: an explicit slug wins over the host,
-- a slug that names nothing is a miss with NO host fallback (or a typo would
-- serve the domain's own tenant), and the host path is www-aware.
--
-- Returns NULL for: unknown slug/host, disabled tenant, unentitled tenant, or a
-- tenant that has never published. The caller cannot tell these apart, which is
-- deliberate -- it is the same 404 either way and distinguishing them would leak
-- which slugs exist.

create or replace function public.get_public_portfolio(
  p_slug text default null,
  p_host text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  t_id uuid;
  t_status text;
  h text;
begin
  if p_slug is not null and length(trim(p_slug)) > 0 then
    select id, status into t_id, t_status
      from public.tenants
     where slug = lower(trim(p_slug));
    -- A named slug that misses is a miss. Never fall through to the host.
    if t_id is null then return null; end if;
  else
    h := lower(trim(coalesce(p_host, '')));
    if h = '' then return null; end if;
    h := regexp_replace(h, ':[0-9]+$', '');      -- strip port
    h := regexp_replace(h, '\.$', '');           -- strip trailing dot
    if h in ('localhost', '127.0.0.1') or h like '%.vercel.app'
       or h = 'designakum.site' or h = 'www.designakum.site' then
      return null;                                -- neutral hosts own no tenant
    end if;
    select d.tenant_id, t.status into t_id, t_status
      from public.tenant_domains d
      join public.tenants t on t.id = d.tenant_id
     where d.domain = h
        or d.domain = regexp_replace(h, '^www\.', '')
        or 'www.' || d.domain = h
     limit 1;
    if t_id is null then return null; end if;
  end if;

  -- Operator switch. A disabled workspace serves nothing.
  if coalesce(t_status, 'active') <> 'active' then return null; end if;

  -- THE PAYWALL, evaluated here in the database rather than in the visitor's
  -- browser. tenant_has_active_subscription() remains the sole authority.
  if not public.tenant_has_active_subscription(t_id) then return null; end if;

  -- Entitled and active: serve what was published. NULL when never published.
  return (select published_snapshot from public.tenants where id = t_id);
end;
$function$;

comment on function public.get_public_portfolio(text, text) is
  'THE public site read path. Resolves slug-or-host, enforces status + entitlement server-side, returns the published snapshot or NULL. Replaces anon SELECT on profile/projects. See section-q.';

revoke all on function public.get_public_portfolio(text, text) from public;
grant execute on function public.get_public_portfolio(text, text) to anon, authenticated;


-- 4. BACKFILL — so no live site goes dark ---------------------------------------
-- One-time. Every tenant that has a profile gets a snapshot of its CURRENT
-- content, which is exactly what the public site is serving right now. A tenant
-- with no profile row is skipped rather than given an empty snapshot.
-- Idempotent: re-running just refreshes them from the same drafts.

update public.tenants t
   set published_snapshot = public.build_portfolio_snapshot(t.id),
       published_at       = coalesce(t.published_at, now())
 where exists (select 1 from public.profile p where p.tenant_id = t.id);


-- 5. CLOSE THE READ GAP ---------------------------------------------------------
-- The draft tables stop being world-readable. Order matters: the backfill above
-- has already run, and the renderer change ships with this.

drop policy if exists "Public can read profile"  on public.profile;
drop policy if exists "Public can read projects" on public.projects;

-- Reading your OWN draft must not require entitlement -- an unentitled client
-- still needs to see their work to decide whether to pay for it. Membership
-- only. is_tenant_admin() already returns true for platform owners.
create policy "Tenant admins read profile"
  on public.profile for select to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy "Tenant admins read projects"
  on public.projects for select to authenticated
  using (public.is_tenant_admin(tenant_id));

-- The existing `ALL ... can_edit_tenant(tenant_id)` write policies are UNTOUCHED.
-- Writes still require entitlement; that is section K and it stays.


-- VERIFY ------------------------------------------------------------------------
--   -- every tenant with a profile now has a snapshot
--   select count(*) filter (where published_snapshot is not null) as published,
--          count(*) as total from public.tenants;
--
--   -- an entitled tenant serves; an unentitled one does not
--   select public.get_public_portfolio('f9designer', null) is not null;   -- t
--   select public.get_public_portfolio('onecenttest', null) is null;      -- t
--   select public.get_public_portfolio('nope-not-real', null) is null;    -- t
--
--   -- anon can no longer read the drafts
--   select has_table_privilege('anon','public.profile','SELECT');  -- still t at
--   -- GRANT level; the POLICY is what stops it. Check policies instead:
--   select policyname, roles::text, cmd from pg_policies
--    where schemaname='public' and tablename in ('profile','projects');
--
-- ROLLBACK ----------------------------------------------------------------------
--   drop policy if exists "Tenant admins read profile"  on public.profile;
--   drop policy if exists "Tenant admins read projects" on public.projects;
--   create policy "Public can read profile"  on public.profile  for select to public using (true);
--   create policy "Public can read projects" on public.projects for select to public using (true);
--   drop function if exists public.get_public_portfolio(text, text);
--   -- build_portfolio_snapshot and the snapshots themselves are harmless; leave them.
