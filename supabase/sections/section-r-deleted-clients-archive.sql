-- Section R — removing a client completely, with a record of it
--
-- WHAT THIS ANSWERS
-- -----------------
-- There was no way to remove a client outright. `release_account` (section-J)
-- parks the login email at released+<id>@released.invalid and frees the
-- username, but keeps the auth user forever and refuses while a workspace
-- exists. So the operator was left with a growing list of accounts that could
-- not be tidied away, and no clean answer to "delete this person".
--
-- The requirement is: remove them from the database AND from the console, and
-- let them sign up again afterwards with the same email.
--
-- HOW THE EMAIL BECOMES REUSABLE
-- ------------------------------
-- By deleting the auth user, not by parking the address. GoTrue's uniqueness is
-- on auth.users.email, so once the row is gone the address is free -- no parked
-- placeholder, nothing left behind claiming it. `release_account` stays for what
-- it was built for: an account with no workspace that should keep existing.
--
-- WHAT THIS TABLE IS FOR
-- ----------------------
-- Deleting a tenant cascades its profile, projects, domains, analytics AND its
-- billing rows (SCHEMA.sql: "deleting a tenant removes ... billing and access
-- rows in one statement"). That is the existing behaviour and this does not
-- change it -- but it does mean an invoice can disappear with no trace at all.
-- This keeps a small record of what was removed and when, so the operator has
-- an answer six months later. It holds no portfolio content and no password
-- material: a name, the address they were at, the login email, and counts.
--
-- It is a LOG, not a recycle bin. Nothing here can restore a client; the content
-- is genuinely gone. Naming it deleted_clients rather than archived_clients is
-- deliberate for that reason.

create table if not exists public.deleted_clients (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,              -- the id it HAD; no FK, the row is gone
  slug           text not null,
  name           text,
  email          text,
  username       text,
  projects_count integer not null default 0,
  had_billing    boolean not null default false,
  billing_state  text,
  deleted_at     timestamptz not null default now(),
  deleted_by     uuid,                       -- the owner who did it
  note           text
);

comment on table public.deleted_clients is
  'A record of clients removed outright: who, where, when. Holds no portfolio content. Cannot restore anything -- the content is gone. See section-r.';

create index if not exists deleted_clients_deleted_at_idx
  on public.deleted_clients (deleted_at desc);

alter table public.deleted_clients enable row level security;

-- Owner-only, like billing_events. Writes come from the client-recovery Edge
-- Function under the service key, so there is deliberately no INSERT policy --
-- the same pattern the billing tables use.
drop policy if exists "Owners read deleted clients" on public.deleted_clients;
create policy "Owners read deleted clients"
  on public.deleted_clients for select to authenticated
  using (public.is_platform_owner());

-- ROLLBACK ---------------------------------------------------------------------
--   drop table if exists public.deleted_clients;
