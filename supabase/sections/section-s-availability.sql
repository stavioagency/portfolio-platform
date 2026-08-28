-- Section S — "available now", with an expiry
--
-- THE PROBLEM
-- -----------
-- A client typed "We are available to connect." into a stat by hand. It was
-- true when typed and false ten minutes later, and nothing ever changed it.
-- A status that cannot go stale is the whole feature.
--
-- WHY NOT READ IT FROM WHATSAPP/TELEGRAM/DISCORD
-- ----------------------------------------------
-- See docs/features/live-availability.md. Short version: WhatsApp's Cloud API
-- exposes no presence at all, and a Telegram BOT cannot see a user's online
-- status either. Only Discord can, and only inside a shared guild. So this is
-- the honest version -- the client says when they are free, and it EXPIRES on
-- its own rather than sitting there lying.
--
-- THE ONE DESIGN DECISION THAT MATTERS
-- ------------------------------------
-- Availability is NOT part of the published snapshot, and must never be.
--
-- The public site reads tenants.published_snapshot (section-q). If availability
-- were serialised into it, the badge would freeze at whatever it said when the
-- client last pressed Publish -- so a client could be shown "available" for
-- weeks after going offline, which is exactly the staleness this replaces. It
-- is merged into the response at READ time instead, straight from the live
-- profile row.
--
-- Expiry is evaluated at read time too (`until > now()`), so nothing has to
-- sweep it. There is no cron, no job, and no state to get stuck: the moment the
-- timestamp passes, the badge stops being returned. A client closing their
-- laptop needs no action for the status to become correct.

alter table public.profile
  add column if not exists availability jsonb;

comment on column public.profile.availability is
  'Client-set "available now" window: {"until": timestamptz}. Read LIVE and merged by get_public_portfolio() -- deliberately NOT in published_snapshot, or it would freeze at publish time. Expired by comparison, not by a job. See section-s.';


-- get_public_portfolio() merges it, still gated the same way ------------------
-- Identical to section-q except for the final SELECT. Entitlement, status and
-- resolution are untouched.

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
  snap jsonb;
  avail jsonb;
begin
  if p_slug is not null and length(trim(p_slug)) > 0 then
    select id, status into t_id, t_status
      from public.tenants where slug = lower(trim(p_slug));
    if t_id is null then return null; end if;
  else
    h := lower(trim(coalesce(p_host, '')));
    if h = '' then return null; end if;
    h := regexp_replace(h, ':[0-9]+$', '');
    h := regexp_replace(h, '\.$', '');
    if h in ('localhost', '127.0.0.1') or h like '%.vercel.app'
       or h = 'designakum.site' or h = 'www.designakum.site' then
      return null;
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

  if coalesce(t_status, 'active') <> 'active' then return null; end if;
  if not public.tenant_has_active_subscription(t_id) then return null; end if;

  select published_snapshot into snap from public.tenants where id = t_id;
  if snap is null then return null; end if;

  -- LIVE, and only while it is still true. An absent or past `until` returns
  -- nothing at all, so the page renders exactly as it did before the feature.
  select p.availability into avail
    from public.profile p
   where p.tenant_id = t_id
     and p.availability ? 'until'
     and (p.availability->>'until')::timestamptz > now();

  return snap
       || jsonb_build_object('tenant_id', t_id)
       || case when avail is null then '{}'::jsonb
               else jsonb_build_object('availability', avail) end;
end;
$function$;


-- VERIFY ----------------------------------------------------------------------
--   -- nothing is available until someone says so
--   select count(*) from public.profile where availability is not null;   -- 0
--
--   -- a future window shows; a past one does not. Run against OneCentTest only.
--   update public.profile set availability = jsonb_build_object('until', (now() + interval '1 hour'))
--    where tenant_id = (select id from public.tenants where slug = 'onecenttest');
--   select public.get_public_portfolio('onecenttest', null) -> 'availability';
--   update public.profile set availability = jsonb_build_object('until', (now() - interval '1 hour'))
--    where tenant_id = (select id from public.tenants where slug = 'onecenttest');
--   select public.get_public_portfolio('onecenttest', null) ? 'availability';  -- false
--   update public.profile set availability = null
--    where tenant_id = (select id from public.tenants where slug = 'onecenttest');
--
-- ROLLBACK ----------------------------------------------------------------------
--   Re-apply section-q's get_public_portfolio(), then:
--   alter table public.profile drop column if exists availability;
