-- ############################################################################
-- SECTION AB — capturing versions, rolling back, and expiring them
-- ############################################################################
--
-- ADDITIVE. Section AA created portfolio_versions and nothing wrote to it.
-- This fills it, and the choice of WHERE is the whole design.
--
-- ── A TRIGGER, NOT A CHANGE TO publish_tenant() ─────────────────────────────
-- publish_tenant() is the path the Studio uses, and editing it would have been
-- the obvious move. It is the wrong one twice over: it is a live function seven
-- clients publish through, so replacing its body is the one genuinely risky
-- edit available here; and it is not the only writer -- /admin, the console and
-- any future path all set published_snapshot themselves. A trigger on the
-- COLUMN catches every one of them, including the ones that do not exist yet,
-- and touches nothing that already works.

create or replace function capture_portfolio_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  -- Only a real publish. A row that was saved without the snapshot changing is
  -- not a version, and writing one would fill the history with duplicates that
  -- a client scrolling back cannot tell apart.
  if new.published_snapshot is null
     or new.published_snapshot is not distinct from old.published_snapshot then
    return new;
  end if;

  select coalesce(max(number), 0) + 1 into v_next
  from portfolio_versions where tenant_id = new.id;

  insert into portfolio_versions (tenant_id, number, snapshot, created_by)
  values (new.id, v_next, new.published_snapshot, auth.uid());

  return new;
end;
$$;

drop trigger if exists tenants_capture_version on tenants;
create trigger tenants_capture_version
  after update of published_snapshot on tenants
  for each row execute function capture_portfolio_version();

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- Putting an old page back is PUBLISHING it, so it is gated by the same
-- permission as publishing and not by the one for editing. It writes through
-- published_snapshot, which means the trigger above captures the restore as a
-- new version too -- rolling back is itself undoable, and the history never
-- loses the state you rolled away from.
create or replace function rollback_tenant(tid uuid, version_number integer)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_at timestamptz := now();
begin
  if not can_edit_tenant(tid) then
    raise exception 'not permitted to publish this portfolio'
      using errcode = 'insufficient_privilege';
  end if;

  select snapshot into v_snapshot
  from portfolio_versions
  where tenant_id = tid and number = version_number;

  if v_snapshot is null then
    raise exception 'version % does not exist for this portfolio', version_number
      using errcode = 'no_data_found';
  end if;

  update tenants
     set published_snapshot = v_snapshot, published_at = v_at
   where id = tid;

  insert into audit_log (actor_id, action, subject_type, subject_id, details)
  values (auth.uid(), 'portfolio.rollback', 'tenant', tid::text,
          jsonb_build_object('to_version', version_number));

  return v_at;
end;
$$;

-- ── EXPIRY ──────────────────────────────────────────────────────────────────
--
-- Fourteen days, with the exception that makes the rule survivable: the version
-- a tenant is CURRENTLY SERVING is kept at any age. Taken literally, "history
-- expires after 14 days" deletes the only copy of a page published three months
-- ago and never touched since -- which is most of a portfolio's life.
--
-- Not scheduled here. A destructive job that starts running the moment a
-- migration lands is a job nobody has watched run once.
create or replace function collect_expired_versions()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with kept as (
    select v.id
    from portfolio_versions v
    join tenants t on t.id = v.tenant_id
    where v.snapshot is not distinct from t.published_snapshot
  ),
  gone as (
    delete from portfolio_versions v
    where v.created_at < now() - interval '14 days'
      and v.id not in (select id from kept)
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function collect_expired_versions() from public, anon, authenticated;
grant execute on function rollback_tenant(uuid, integer) to authenticated;
