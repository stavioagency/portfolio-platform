-- ############################################################################
-- SECTION G — pending handoff on a newly created workspace
-- ############################################################################
--
-- The problem this fixes
-- ----------------------
-- Creating a workspace produces a temporary password that is shown to the owner
-- exactly once. Nothing recorded whether that password ever reached the client.
-- If the owner closed the panel, mistyped the client's email, or simply got
-- distracted, the workspace looked identical to every other active client while
-- in fact nobody could sign into it. The only recovery was to notice by accident
-- and run a password reset.
--
-- `handed_over_at` makes that state explicit: NULL means "created but the client
-- has not been given their credentials yet". The admin clears it by pressing
-- "Mark as handed over" once they have actually delivered them.
--
-- Why a column and not a status value
-- -----------------------------------
-- `tenants.status` drives the PUBLIC resolver: anything not 'active' 404s the
-- site (lib/tenant.js). Adding a third status would take a pending client's site
-- offline and would mean touching the tenant resolver, which is load-bearing.
-- Handoff is an operator concern and has nothing to do with whether the site is
-- served, so it gets its own nullable column and no policy of its own — the
-- existing owner-only UPDATE policy on `tenants` already gates writes.
--
-- Backfill
-- --------
-- Every tenant that exists TODAY has already been handed over (they are live
-- clients). They are stamped with their own created_at so the pending list opens
-- empty rather than listing the entire customer base as outstanding.

alter table public.tenants
  add column if not exists handed_over_at timestamptz;

comment on column public.tenants.handed_over_at is
  'When the admin confirmed the client received their credentials. NULL = pending handoff. Operator state only — does NOT affect public site resolution.';

-- One-time: existing tenants predate the feature and are all live.
update public.tenants
   set handed_over_at = created_at
 where handed_over_at is null;

-- Partial index: the pending list is the only query that filters on this, and it
-- is expected to hold a handful of rows out of the whole table.
create index if not exists tenants_pending_handoff_idx
  on public.tenants (created_at desc)
  where handed_over_at is null;
