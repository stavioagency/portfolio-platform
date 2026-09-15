\set ON_ERROR_STOP on
begin;
do $$
declare t uuid; n integer; snap jsonb;
begin
  insert into tenants (slug, name) values ('ver', 'Ver') returning id into t;

  -- publishing captures a version
  update tenants set published_snapshot = '{"page":1}'::jsonb, published_at = now() where id = t;
  select count(*) into n from portfolio_versions where tenant_id = t;
  if n <> 1 then raise exception 'publishing captured % versions, not 1', n; end if;

  -- saving WITHOUT changing the snapshot captures nothing: a history full of
  -- identical entries is a history nobody can scroll
  update tenants set name = 'Renamed' where id = t;
  update tenants set published_snapshot = '{"page":1}'::jsonb where id = t;
  select count(*) into n from portfolio_versions where tenant_id = t;
  if n <> 1 then raise exception 'an unchanged snapshot captured a duplicate'; end if;

  -- a second, different publish is version 2
  update tenants set published_snapshot = '{"page":2}'::jsonb where id = t;
  select count(*) into n from portfolio_versions where tenant_id = t;
  if n <> 2 then raise exception 'second publish gave % versions', n; end if;

  -- rolling back restores the old page AND is itself captured, so the state
  -- rolled away from is never lost
  perform rollback_tenant(t, 1);
  select published_snapshot into snap from tenants where id = t;
  if snap <> '{"page":1}'::jsonb then raise exception 'rollback did not restore'; end if;
  select count(*) into n from portfolio_versions where tenant_id = t;
  if n <> 3 then raise exception 'rollback was not itself captured (% versions)', n; end if;

  -- and it is audited
  if not exists (select 1 from audit_log where action = 'portfolio.rollback' and subject_id = t::text) then
    raise exception 'a rollback left no audit entry';
  end if;

  -- a version that does not exist is refused, not silently ignored
  begin
    perform rollback_tenant(t, 99);
    raise exception 'rolling back to a missing version was allowed';
  exception when no_data_found then null; end;

  -- THE LIVE VERSION SURVIVES EXPIRY AT ANY AGE.
  -- Aged by INSERT, not UPDATE: the immutability trigger refuses to let a
  -- version be rewritten, which is the point of it, and a test that disabled
  -- that to make itself convenient would be testing a database nobody runs.
  insert into portfolio_versions (tenant_id, number, snapshot, created_at)
  values (t, 90, '{"page":"ancient"}'::jsonb, now() - interval '90 days'),
         (t, 91, (select published_snapshot from tenants where id = t), now() - interval '90 days');
  perform collect_expired_versions();
  -- the ancient one that is NOT live is gone
  if exists (select 1 from portfolio_versions where tenant_id = t and number = 90) then
    raise exception 'an expired version that nobody serves was kept';
  end if;
  if not exists (
    select 1 from portfolio_versions v join tenants x on x.id = v.tenant_id
    where v.tenant_id = t and v.snapshot is not distinct from x.published_snapshot
  ) then
    raise exception 'expiry deleted the page the tenant is currently serving';
  end if;

  raise notice 'section AB: every assertion passed';
end $$;
rollback;
