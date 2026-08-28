-- SECTION V — bilingual becomes a choice (2026-08-28)
--
-- Every text field on a portfolio is {ar, en}, so the editor asks for
-- everything twice. Almost nobody fills in the second half:
--
--   designakum   name, tagline and bio in both  -> genuinely bilingual
--   f9designer   name, tagline and bio in both  -> genuinely bilingual
--   ahbasalamah  a Latin name in both slots, nothing else
--   roza         an English name, no Arabic name, nothing else in English
--   the rest     Arabic only
--
-- So five of seven were being charged a decision they never made, and their
-- visitors got a language switch that led to a half-empty page.
--
-- The portfolio is now in ONE language unless the client says otherwise. The
-- switch on the public card appears only when this is true, and the editor
-- stops asking for a second version of every field.
--
-- ADDITIVE. One boolean, defaulting false.

alter table public.profile
  add column if not exists bilingual boolean not null default false;

-- WHO IS TURNED ON, and why the test is what it is.
--
-- NAME IS DELIBERATELY NOT ENOUGH on its own. A Latin brand name gets typed
-- into both slots because it is spelled the same either way -- ahbasalamah has
-- exactly that and nothing else -- and reading it as "this client writes in two
-- languages" would switch the feature on for someone who never used it.
--
-- A tagline or a bio present in BOTH languages is somebody actually writing
-- twice. That is the signal. It selects designakum and f9designer, and nobody
-- else, which matches what a human reading the seven would say.
update public.profile
   set bilingual = true
 where (coalesce(tagline->>'en', '') <> '' and coalesce(tagline->>'ar', '') <> '')
    or (coalesce(bio->>'en', '')     <> '' and coalesce(bio->>'ar', '')     <> '');

comment on column public.profile.bilingual is
  'Client publishes in both Arabic and English. Off: one language, and no switcher on the card.';

-- Expected after running, and worth checking rather than assuming:
--   select count(*) from profile where bilingual;   -- 2


-- ---------------------------------------------------------------------------
-- THE SNAPSHOT HAS TO CARRY THEM, OR NONE OF THIS IS VISIBLE
-- ---------------------------------------------------------------------------
--
-- The public page does not read the profile table. It reads
-- tenants.published_snapshot through get_public_portfolio(), and publish_tenant()
-- builds that snapshot from an EXPLICIT column list -- deliberately, so a
-- snapshot never silently starts carrying whatever column someone added last.
--
-- Which means a new column is invisible on the live site until it is named
-- here. Adding the three quick facts to profile and to the editor, and stopping
-- there, would have produced a feature that worked perfectly in the editor's
-- preview (which reads the draft) and did nothing at all after Publish.
--
-- Only the four new keys are added. Every other line is unchanged, including the
-- columns the public page no longer renders -- removing those is a separate
-- decision and would break any client who has not republished.

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
      -- section-t: the three quick facts
      'rating',        p.rating,
      'client_count',  p.client_count,
      'hours',         p.hours,
      -- section-v: whether the card offers a language switch
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
    into snap
    from public.tenants t
    join public.profile p on p.tenant_id = t.id
   where t.id = tid;

  update public.tenants
     set published_snapshot = snap,
         published_at = stamp
   where id = tid;

  return stamp;
end;
$function$;

-- RUN THIS LAST. It names columns from section-t (rating, client_count, hours)
-- and from this file (bilingual), so both must already exist.
