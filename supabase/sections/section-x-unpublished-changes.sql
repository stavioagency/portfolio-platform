-- SECTION X — "you have changes visitors cannot see yet" (2026-08-28)
--
-- THE PROBLEM. Editing changes the draft; visitors keep seeing the published
-- snapshot until the client presses Publish. That staging is correct and stays.
-- What was missing is the client being able to TELL. Publish was a button in
-- the sidebar that looked the same whether there was anything to publish or
-- not, so the honest reading of the screen was "I have no idea whether my
-- changes are live", which is the one question the whole mechanism exists to
-- answer.
--
-- HOW IT IS ANSWERED. Not by a timestamp comparison. profile.updated_at moves
-- when a client opens a field and closes it again, and `projects` has no
-- updated_at at all — a reordered or deleted piece would have been invisible to
-- that test. Instead the draft is SERIALISED and compared to what was
-- published. Same bytes, no pending changes.
--
-- WHICH MEANS THE BUILDER HAS TO BE SHARED. publish_tenant() built the snapshot
-- inline; a second copy here would drift, and the day it drifted the button
-- would light up forever on a portfolio with nothing to publish. So the builder
-- is extracted and publish_tenant() now calls it too.

create or replace function public.build_snapshot(tid uuid, stamp timestamptz)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'version', 1,
    'published_at', stamp,
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
      'seo',           p.seo,
      'rating',        p.rating,
      'client_count',  p.client_count,
      'hours',         p.hours,
      'bilingual',     p.bilingual
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

  snap := public.build_snapshot(tid, stamp);

  update public.tenants
     set published_snapshot = snap,
         published_at = stamp
   where id = tid;

  return stamp;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Does this workspace have anything to publish?
-- ---------------------------------------------------------------------------
--
-- published_at is STRIPPED FROM BOTH SIDES before comparing. It is the one key
-- that differs on every call by construction, so leaving it in would report
-- pending changes on a portfolio published one second ago and never stop.
--
-- Never published at all counts as having changes: there is a draft and
-- visitors cannot see any of it.
--
-- is_tenant_admin(), not can_edit_tenant(). A client whose subscription has
-- lapsed can still READ their own editor -- that is deliberate, 24 of the admin
-- rows are unentitled -- and telling them "no pending changes" when the draft
-- has moved would be a lie told to the people most likely to be checking.
create or replace function public.has_unpublished_changes(tid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  live jsonb;
  draft jsonb;
begin
  if tid is null or not public.is_tenant_admin(tid) then
    return false;
  end if;

  select published_snapshot into live from public.tenants where id = tid;
  if live is null then return true; end if;

  draft := public.build_snapshot(tid, now());
  if draft is null then return false; end if;

  return (draft - 'published_at') is distinct from (live - 'published_at');
end;
$function$;

revoke all on function public.build_snapshot(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.has_unpublished_changes(uuid) from public, anon;
grant execute on function public.has_unpublished_changes(uuid) to authenticated;

comment on function public.build_snapshot is
  'Serialises a tenant''s DRAFT into the published shape. The one builder: publish_tenant() and has_unpublished_changes() both call it so they cannot drift.';
comment on function public.has_unpublished_changes is
  'True when the draft differs from what visitors currently see. Compares serialised bytes, not timestamps.';
