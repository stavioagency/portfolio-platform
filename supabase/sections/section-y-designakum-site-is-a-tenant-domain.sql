-- Section Y — designakum.site stops being a "neutral host"
--
-- THE PROBLEM
-- -----------
-- https://designakum.site/ served a 404 while https://designakum.site/designakum
-- served the portfolio perfectly. Every gate you would think to check was fine:
-- the tenant was active, entitled and published, and tenant_domains carried an
-- active row mapping the domain to it.
--
-- The refusal came from four words inside get_public_portfolio():
--
--     if h in ('localhost', '127.0.0.1') or h like '%.vercel.app'
--        or h = 'designakum.site' or h = 'www.designakum.site' then
--       return null;                          -- neutral hosts own no tenant
--     end if;
--
-- designakum.site was hard-coded into the NEUTRAL list — the same category as
-- localhost and a Vercel preview URL, meaning "the platform's own address,
-- which owns no portfolio". That test runs BEFORE the tenant_domains lookup and
-- returns immediately, so the mapping was never consulted.
--
-- WHY IT WAS RIGHT, AND THEN WASN'T
-- ---------------------------------
-- It was correct while designakum.site was only the platform host: the apex
-- served the app, and a portfolio was reached at /{slug}. It stopped being
-- correct the moment a tenant_domains row was added pointing designakum.site at
-- the "Designakum (official)" tenant. From then on the database held two
-- contradictory statements about one domain, and the hard-coded one won because
-- it ran first.
--
-- This is the failure mode section-q's own header warns about in a different
-- guise: a rule written for an earlier architecture, still executing, with
-- nothing to say it had been overtaken. The row is the newer and more explicit
-- statement of intent, so the list is what gives way.
--
-- THE FIX
-- -------
-- Delete the two conditions. designakum.site now resolves through
-- tenant_domains like every other custom domain — the identical path
-- f9designer.site already takes. No new mechanism, and no new privilege: a host
-- resolves if and only if it is mapped, its tenant is active, and the tenant is
-- entitled. Both later gates are untouched.
--
-- localhost, 127.0.0.1 and *.vercel.app STAY neutral, and that is not an
-- oversight. Those genuinely own no tenant, and a preview URL resolving to some
-- client's portfolio is exactly the isolation bug the neutral list exists to
-- prevent.
--
-- WHAT THIS BODY IS BASED ON — read before editing
-- ------------------------------------------------
-- The deployed definition, read back with pg_get_functiondef, NOT the copy in
-- section-q. section-q predates section-s and does not contain the snapshot
-- null-check or the live availability merge; applying it would have silently
-- deleted a shipped feature. Everything below is byte-identical to what was
-- running, except the neutral-host line.
--
-- Four sections now carry a full definition of this function (Q, S, and this
-- one; T and V only reference it). THE LATEST LETTER IS THE LIVE ONE. If you
-- are about to re-run an older section to "restore" something, read the
-- deployed definition first.
--
-- VERIFICATION (run after applying; every line held on 2026-09-10)
--   select public.get_public_portfolio(null,'designakum.site')     is not null;  -- t
--   select public.get_public_portfolio(null,'www.designakum.site') is not null;  -- t
--   select public.get_public_portfolio(null,'f9designer.site')     is not null;  -- t
--   select public.get_public_portfolio(null,'localhost')           is not null;  -- f
--   select public.get_public_portfolio(null,'x.vercel.app')        is not null;  -- f
--   select public.get_public_portfolio(null,'unmapped.example')    is not null;  -- f
--   select public.get_public_portfolio('designakum',null)          is not null;  -- t
--   select public.get_public_portfolio('nope-not-real',null)       is not null;  -- f
--   select public.get_public_portfolio(null,'designakum.site') ? 'tenant_id';    -- t
--
-- ROLLBACK
--   Re-add `or h = 'designakum.site' or h = 'www.designakum.site'` to the
--   neutral test. Nothing else changed, and no data was written.

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
    -- Neutral hosts own no tenant. designakum.site was removed from this list:
    -- it is a mapped custom domain like any other and tenant_domains decides.
    if h in ('localhost', '127.0.0.1') or h like '%.vercel.app' then
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

comment on function public.get_public_portfolio(text, text) is
  'THE public read path. Resolves slug-or-host (slug wins), refuses a disabled or unentitled tenant, returns the published snapshot merged with tenant_id and a live unexpired profile.availability. Neutral hosts: localhost, 127.0.0.1, *.vercel.app -- designakum.site is NOT neutral, it is a mapped tenant domain (section-y).';
