-- ############################################################################
-- SECTION AA — version history, support, moderation, audit, notices
-- ############################################################################
--
-- ADDITIVE ONLY. Every statement here creates something new or adds a nullable
-- column. Nothing is dropped, nothing is renamed, no existing policy is
-- touched. Seven paying clients are live on this database while it runs, and
-- the whole point of the shape below is that they cannot notice it happening.
--
-- It builds on the vocabulary that already exists rather than a parallel one:
-- can_edit_tenant(), can_draft_tenant(), is_platform_owner(), publish_tenant().
-- A second set of predicates meaning almost the same thing is how a permission
-- gets relaxed in one place and not the other -- this repo has already paid for
-- that lesson once, in Section K.

-- ── 1. VERSION HISTORY ──────────────────────────────────────────────────────
--
-- tenants.published_snapshot already holds the CURRENT published page. That is
-- one version, and rolling back needs the previous ones, so each publish also
-- writes a row here.
--
-- Retention is 14 days, with one exception that matters: the version a tenant
-- is currently serving is kept at any age. Taken literally, "history expires
-- after 14 days" deletes the only copy of a page published three months ago and
-- never touched since.
create table if not exists portfolio_versions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  number       integer not null check (number > 0),
  snapshot     jsonb not null,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  unique (tenant_id, number)
);

create index if not exists portfolio_versions_tenant_idx
  on portfolio_versions (tenant_id, created_at desc);

comment on column portfolio_versions.number is
  'Per tenant and monotonic. A client says "put back version 3", and 3 has to mean the same thing to them and to us forever.';

comment on column portfolio_versions.snapshot is
  'A whole page, from build_portfolio_snapshot(). Not a diff and not a join: a version reassembled from live tables is today''s content wearing last week''s number.';

-- Immutable. A snapshot a script can edit is not a snapshot, and the service
-- role bypasses RLS, so this is a trigger rather than a missing policy.
create or replace function forbid_version_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'portfolio_versions rows are immutable; publish a new version instead'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists portfolio_versions_immutable on portfolio_versions;
create trigger portfolio_versions_immutable
  before update on portfolio_versions
  for each row execute function forbid_version_mutation();

-- ── 2. PER-LANGUAGE PUBLISHING ──────────────────────────────────────────────
--
-- profile.bilingual already says whether a tenant offers two languages. This
-- says which of them are LIVE, so Arabic can be published while English is
-- still half written. NULL means "whatever the profile offers", which is
-- exactly today's behaviour -- so every existing tenant keeps working without
-- a backfill.
alter table tenants add column if not exists published_langs text[];

comment on column tenants.published_langs is
  'NULL = today''s behaviour: every language the profile offers is live. A non-null array is an explicit subset. Nullable rather than defaulted so that the seven live tenants need no backfill and cannot change behaviour the moment this lands.';

-- ── 3. SUSPENSION ───────────────────────────────────────────────────────────
--
-- Separate columns from anything a client can write, so republishing cannot
-- clear a suspension. That is a property of the shape, not a check somebody has
-- to remember.
alter table tenants add column if not exists suspended_at timestamptz;
alter table tenants add column if not exists suspended_by uuid;
alter table tenants add column if not exists suspend_reason text;
alter table tenants add column if not exists suspend_reason_sent_at timestamptz;

comment on column tenants.suspend_reason_sent_at is
  'Null while a suspension has a reason the client has not been shown. The console surfaces that gap: a reason nobody was told is the same to them as no reason, and telling them is the decision, not a nicety.';

-- ── 4. SUPPORT ──────────────────────────────────────────────────────────────
--
-- One store for every channel. Support arriving by Instagram or email is a row
-- here with a different `via`, not a screenshot someone pasted into a chat --
-- "all requests visible in one place" is only true if this IS the place.
create table if not exists support_threads (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants (id) on delete set null,
  opened_by       uuid,
  kind            text not null default 'support' check (kind in ('support', 'appeal')),
  subject         text not null check (char_length(subject) between 1 and 140),
  status          text not null default 'open'
                  check (status in ('open', 'waiting_on_client', 'waiting_on_us', 'closed')),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  closed_at       timestamptz,
  closed_by       uuid,
  constraint support_threads_closure_is_whole check ((status = 'closed') = (closed_at is not null))
);

create index if not exists support_threads_tenant_idx on support_threads (tenant_id, last_message_at desc);
create index if not exists support_threads_queue_idx  on support_threads (status, kind, last_message_at desc);

comment on column support_threads.status is
  'NOT derived from who spoke last. The two look identical until an owner reads a thread, decides it needs nothing and leaves it -- at which point "their message was last" says waiting-on-us forever. last_message_at is the other fact, and it lives beside this rather than instead of it.';

comment on column support_threads.kind is
  'An appeal is answerable against a clock -- 48 hours -- and a support question is not. Telling them apart must not require reading the subject line.';

create table if not exists support_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references support_threads (id) on delete cascade,
  author_id    uuid,
  body         text not null check (char_length(body) between 1 and 10000),
  via          text not null default 'app' check (via in ('app', 'email', 'instagram', 'whatsapp')),
  created_at   timestamptz not null default now()
);

create index if not exists support_messages_thread_idx on support_messages (thread_id, created_at);

-- Read state per person: two owners share this console, and a thread Faisal has
-- read is not a thread you have read. One is_read column on the thread is how
-- one owner stops seeing a reply because the other glanced at it.
create table if not exists support_reads (
  thread_id  uuid not null references support_threads (id) on delete cascade,
  user_id    uuid not null,
  read_at    timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create or replace function touch_thread_last_message()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update support_threads
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists support_messages_touch_thread on support_messages;
create trigger support_messages_touch_thread
  after insert on support_messages
  for each row execute function touch_thread_last_message();

-- ── 5. REPORTS ──────────────────────────────────────────────────────────────
--
-- There is deliberately NO threshold and NOTHING auto-suspends. With seven
-- known clients and two owners who can look within hours, automatic suspension
-- is not a scaling tool, it is a weapon handed to whoever files ten reports.
-- The table exists now so that if a threshold is ever wanted it is chosen from
-- real numbers instead of guessed.
create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  reporter_id   uuid,
  reporter_key  text not null,
  reason        text not null,
  note          text check (note is null or char_length(note) <= 1000),
  status        text not null default 'new' check (status in ('new', 'reviewing', 'upheld', 'dismissed')),
  resolved_by   uuid,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint reports_resolution_is_whole
    check ((status in ('upheld', 'dismissed')) = (resolved_at is not null and resolved_by is not null))
);

create index if not exists reports_open_idx  on reports (status, created_at desc);
create index if not exists reports_tenant_idx on reports (tenant_id);
create index if not exists reports_rate_idx  on reports (tenant_id, reporter_key, created_at);

comment on column reports.reporter_key is
  'A coarse, unreversible key -- a daily-rotating hash of address and agent -- so one source can be rate-limited without storing who they are. No cookie is set and no IP is kept.';

-- ── 6. AUDIT LOG ────────────────────────────────────────────────────────────
--
-- Append-only, for everyone, including the two owners. They are the people this
-- log exists to hold to account, so they are the last people who should be able
-- to edit it. The trigger says so to the service role, which RLS never reaches.
create table if not exists audit_log (
  id           bigserial primary key,
  actor_id     uuid,
  action       text not null,
  subject_type text not null,
  subject_id   text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_subject_idx on audit_log (subject_type, subject_id, created_at desc);
create index if not exists audit_log_actor_idx   on audit_log (actor_id, created_at desc);

create or replace function forbid_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists audit_log_append_only on audit_log;
create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function forbid_audit_mutation();

-- ── 7. OPERATOR NOTICES ─────────────────────────────────────────────────────
--
-- The email half of "notify both owners". The badge is a count and needs
-- nothing; the email is the half that can fail, and it carries the thing we
-- promised to answer in 48 hours. A webhook that calls an email API inline
-- loses the notice silently if the API is down or the transaction rolls back
-- after it. So the notice is a ROW, written in the same transaction as the
-- thing it is about: if that commits, the notice exists, and a sender that has
-- stopped is a growing pile rather than silence.
create table if not exists operator_notices (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('report', 'appeal', 'support', 'payment_failed')),
  subject_type text not null,
  subject_id   text not null,
  summary      text not null check (char_length(summary) between 1 and 300),
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  attempts     smallint not null default 0 check (attempts >= 0),
  last_error   text
);

-- One subject notifies once: a report re-saved or a webhook retried must not
-- send a second email. The constraint guarantees it rather than the caller.
create unique index if not exists operator_notices_one_per_subject_idx
  on operator_notices (kind, subject_type, subject_id);
create index if not exists operator_notices_unsent_idx
  on operator_notices (created_at) where sent_at is null;

create table if not exists operator_notice_reads (
  notice_id uuid not null references operator_notices (id) on delete cascade,
  user_id   uuid not null,
  read_at   timestamptz not null default now(),
  primary key (notice_id, user_id)
);

create or replace function notify_operators(
  p_kind text, p_subject_type text, p_subject_id text, p_summary text
) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into operator_notices (kind, subject_type, subject_id, summary)
  values (p_kind, p_subject_type, p_subject_id, p_summary)
  on conflict (kind, subject_type, subject_id) do nothing;
$$;

create or replace function notify_on_report()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform notify_operators('report', 'tenant', new.tenant_id::text,
    'A portfolio was reported: ' || coalesce(new.reason, 'no reason given'));
  return new;
end;
$$;

drop trigger if exists reports_notify_operators on reports;
create trigger reports_notify_operators
  after insert on reports
  for each row execute function notify_on_report();
