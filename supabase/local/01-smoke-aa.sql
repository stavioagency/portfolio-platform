\set ON_ERROR_STOP on
begin;
do $$
declare t uuid; v uuid; th uuid; n integer;
begin
  insert into tenants (slug, name) values ('smoke', 'Smoke') returning id into t;

  -- a version is a whole page and cannot be rewritten afterwards
  insert into portfolio_versions (tenant_id, number, snapshot)
  values (t, 1, '{"page":"one"}'::jsonb) returning id into v;
  begin
    update portfolio_versions set snapshot = '{}'::jsonb where id = v;
    raise exception 'a published version was rewritten';
  exception when restrict_violation then null; end;

  -- suspension carries a reason, and the reason is untold until it is sent
  update tenants set suspended_at = now(), suspend_reason = 'reported' where id = t;
  if (select suspend_reason_sent_at from tenants where id = t) is not null then
    raise exception 'a new suspension claims the client was already told';
  end if;

  -- a report notifies the owners exactly once, however many reports arrive
  insert into reports (tenant_id, reporter_key, reason) values (t, 'k1', 'impersonation');
  insert into reports (tenant_id, reporter_key, reason) values (t, 'k2', 'impersonation');
  select count(*) into n from operator_notices where subject_id = t::text;
  if n <> 1 then raise exception 'two reports sent % emails, not 1', n; end if;

  -- a message moves the thread to the top of the queue
  insert into support_threads (tenant_id, kind, subject) values (t, 'appeal', 'why')
    returning id into th;
  insert into support_messages (thread_id, body, via) values (th, 'hello', 'instagram');
  if (select last_message_at from support_threads where id = th) is null then
    raise exception 'a message did not touch its thread';
  end if;

  -- the audit log cannot be edited, by anyone
  insert into audit_log (action, subject_type, subject_id) values ('tenant.suspend', 'tenant', t::text);
  begin
    delete from audit_log where subject_id = t::text;
    raise exception 'the audit log was deleted from';
  exception when restrict_violation then null; end;

  raise notice 'section AA: every assertion passed';
end $$;
rollback;
