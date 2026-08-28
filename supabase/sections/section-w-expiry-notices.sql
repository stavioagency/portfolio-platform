-- SECTION W — telling people before free access runs out (2026-08-28)
--
-- WHAT NEEDS A SCHEDULER AND WHAT DOES NOT.
--
-- The EXPIRY itself needs nothing. tenant_has_active_subscription() compares
-- current_period_end to now() on every read, so a grant stops working the
-- instant it is over whether or not any job ran. Nothing has to sweep the table
-- and flip a flag, and there is no window where the database disagrees with
-- itself. The console's "ending soon" list is a query for the same reason.
--
-- The NOTICES need one, because sending an email is the one thing a database
-- cannot do by being read.
--
-- WHY pg_cron RATHER THAN AN EXTERNAL SCHEDULER. It is a Postgres extension
-- that runs a statement on a schedule inside this database — a crontab that
-- lives next to the data. No new service to host, to pay for, to monitor, or to
-- lose the credentials to. Given the alternative here is a third-party cron
-- pinging a URL, and the whole job is "look at one table and send two kinds of
-- email", the version with no moving parts outside Postgres is the right size.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- What has already been said, so nobody is told twice
-- ---------------------------------------------------------------------------
--
-- KEYED ON THE DEADLINE, not just the tenant. Renewing a grant moves
-- current_period_end, which makes a NEW row possible and means the client is
-- warned again before the new deadline. Without the date in the key, a client
-- renewed twice would be warned once, ever.
create table if not exists public.comp_expiry_notices (
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  kind       text        not null check (kind in ('7d', '1d')),
  period_end timestamptz not null,
  sent_at    timestamptz not null default now(),
  primary key (tenant_id, kind, period_end)
);

alter table public.comp_expiry_notices enable row level security;

drop policy if exists "Owner reads notices" on public.comp_expiry_notices;
create policy "Owner reads notices" on public.comp_expiry_notices
  for select using (public.is_platform_owner());
-- No write policy at all: only the service role writes here, from the Edge
-- Function. An operator cannot mark a warning as sent by hand, which is the
-- only way this table could start lying.

-- ---------------------------------------------------------------------------
-- Who is due a warning
-- ---------------------------------------------------------------------------
--
-- Returns at most one row per tenant per kind, and only for grants that have
-- ACTUALLY not been warned yet. The Edge Function reads this and sends; it
-- makes no decisions of its own about who is due, so "when do we warn" lives in
-- one place and is answerable with a select.
create or replace function public.comps_needing_notice()
returns table (tenant_id uuid, slug text, kind text, period_end timestamptz, days_left integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.tenant_id,
         t.slug,
         k.kind,
         s.current_period_end,
         greatest(0, ceil(extract(epoch from (s.current_period_end - now())) / 86400)::int)
    from public.subscriptions s
    join public.tenants t on t.id = s.tenant_id
    cross join lateral (values ('7d', 7), ('1d', 1)) as k(kind, at_days)
   where s.status = 'comped'
     and s.current_period_end is not null
     -- Inside the window and not yet past. A grant that lapsed while nothing
     -- was running is NOT warned retroactively -- "your access ends in 7 days"
     -- sent a fortnight late is worse than silence.
     and s.current_period_end > now()
     and s.current_period_end <= now() + (k.at_days || ' days')::interval
     and not exists (
       select 1 from public.comp_expiry_notices n
        where n.tenant_id = s.tenant_id
          and n.kind = k.kind
          and n.period_end = s.current_period_end
     )
$function$;

revoke all on function public.comps_needing_notice() from public, anon;
grant execute on function public.comps_needing_notice() to authenticated;

comment on function public.comps_needing_notice is
  'Comped tenants inside a 7-day or 1-day warning window that have not been warned for THIS deadline.';
