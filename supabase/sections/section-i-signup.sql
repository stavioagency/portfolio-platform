-- ############################################################################
-- SECTION I — public self-service signup
-- ############################################################################
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ APPLIED + VERIFIED 2026-08-06 (gphrzvjlstznhypcfgre):                    │
-- │   ✅ tenants.created_via added — 12/12 existing tenants default owner  │
-- │   ✅ tenant_admins.self_signup added — all existing rows false            │
-- │   ✅ tenant_admins_one_self_signup_per_user_idx built                     │
-- │   ✅ 0 existing tenants lost access                                       │
-- │ Next: update supabase/SCHEMA.sql to match.                               │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- The architecture and the reasoning behind it are in HANDOFF.md §7c. This
-- file is the database half, and it is deliberately tiny: almost everything
-- self-signup needs already exists.
--
-- WHAT IS *NOT* HERE, AND WHY
-- ---------------------------
--   * No new RLS policy. `tenants` and `tenant_admins` stay owner-only for
--     writes. Signup creates a workspace from an Edge Function with the service
--     role, exactly as invite-client does. A public INSERT policy on `tenants`
--     would let anyone mint workspaces, which is the one thing this design must
--     not allow.
--   * No "pending" tenant status. `status = 'disabled'` already makes the
--     public site 404 (lib/tenant.js), which is precisely what an unpaid
--     workspace should do. A third status would mean touching the tenant
--     resolver, which HANDOFF §6 lists as load-bearing.
--   * No entitlement change. tenant_has_active_subscription() is already false
--     for a workspace with no subscription row, so "no access before payment"
--     is the default rather than something to enforce.
--   * No trial columns. subscriptions.trial_ends_at and the 'trialing' status
--     already exist and are already honoured by the entitlement function.

begin;

-- ============================================================================
-- 1. WHERE A WORKSPACE CAME FROM
-- ============================================================================
-- Two origins with genuinely different support stories: an operator-created
-- workspace has credentials that were handed over by a human, a self-signup
-- has an owner who set their own password and verified their own email.
--
-- The default is 'owner', so the eleven existing tenants describe themselves
-- correctly without a backfill.
alter table public.tenants
  add column if not exists created_via text not null default 'owner'
    check (created_via in ('owner', 'self_signup'));

comment on column public.tenants.created_via is
  'How this workspace came to exist. ''owner'' = invite-client (an operator handed over credentials); ''self_signup'' = the customer registered at /signup and verified their own email. Existing tenants default to ''owner''.';

create index if not exists tenants_self_signup_idx
  on public.tenants (created_at desc)
  where created_via = 'self_signup';

-- ============================================================================
-- 2. ONE WORKSPACE PER USER
-- ============================================================================
-- Enforced in the Edge Function, and mirrored here so the rule survives a bug
-- in the function rather than depending on it.
--
-- A PARTIAL unique index, so it constrains ONLY memberships created by signup.
--
-- IT CANNOT KEY ON role = 'owner', which was the obvious first attempt and is
-- wrong: trg_enroll_platform_owners enrols every platform owner into every
-- tenant with that role, so the live table holds 24 'owner' rows across 2
-- users. A unique index on that predicate does not merely misbehave — it
-- refuses to build, and the migration fails.
--
-- So signup marks its own membership explicitly. Every existing row is false,
-- which is both true and what lets the index build on an empty subset.
alter table public.tenant_admins
  add column if not exists self_signup boolean not null default false;

comment on column public.tenant_admins.self_signup is
  'True only for the membership created by /signup for the person who registered. Distinct from role, which is descriptive and is held by platform owners on every tenant.';

create unique index if not exists tenant_admins_one_self_signup_per_user_idx
  on public.tenant_admins (user_id)
  where self_signup;

comment on index public.tenant_admins_one_self_signup_per_user_idx is
  'One self-signup workspace per user (HANDOFF §7c). Partial, so platform owners — enrolled into every tenant — are unaffected. Dropping this index is how multi-workspace support gets switched on.';

commit;

-- ============================================================================
-- VERIFY (run after applying)
-- ============================================================================
-- select created_via, count(*) from public.tenants group by 1;
--   -- expect: owner = every tenant that existed before this ran, self_signup = 0.
--
-- select count(*) from public.tenant_admins where self_signup;
--   -- expect 0 immediately after applying: no one has signed up yet.
--
-- select role, count(*), count(distinct user_id) from public.tenant_admins
--  group by role;
--   -- context for the note above: role 'owner' holds many rows per user
--   -- because every platform owner is enrolled into every tenant. That is why
--   -- the uniqueness rule needed its own column.
