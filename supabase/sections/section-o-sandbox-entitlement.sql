-- Section O — a SANDBOX subscription must never grant production access
--
-- THE PROBLEM THIS SOLVES
-- -----------------------
-- section-n added `subscriptions.environment` and deliberately changed no
-- behaviour: it recorded which PayPal a row came from and left entitlement
-- alone, because taking access away from a workspace was not that migration's
-- business. This is the follow-up that was always implied.
--
-- `tenant_has_active_subscription()` read `status` and nothing else. Since
-- PAYPAL_ENV flipped to 'live' on 2026-08-09, production has held sandbox and
-- live subscriptions side by side, and a sandbox one at status='active' granted
-- exactly the access a paid live one does. Anyone who could reach the checkout
-- while the platform pointed at sandbox got a fully entitled workspace for fake
-- money.
--
-- Per section K, entitlement gates WRITES — profile, projects, tenant_domains
-- and storage. So the practical effect was: edit and save anything, forever,
-- without paying.
--
-- WHY `IS DISTINCT FROM 'sandbox'` AND NOT `= 'live'`
-- ---------------------------------------------------
-- READ THIS BEFORE "TIDYING" THE PREDICATE.
--
-- Comped subscriptions carry `environment = NULL` — they have no provider, so
-- they have no environment, and section-n records NULL as "not applicable".
-- `environment = 'live'` evaluates to NULL (not true) for every one of them, so
-- it would revoke access from ALL SEVEN comped clients simultaneously,
-- including the two owner workspaces `designakum` and `f9designer`.
--
-- `IS DISTINCT FROM` is NULL-safe: NULL passes, 'live' passes, only 'sandbox'
-- is refused. That is precisely the rule we want — "a sandbox subscription
-- never entitles" — rather than "only live entitles".
--
-- WHY NOT COMPARE AGAINST THE APPLICATION'S CURRENT ENVIRONMENT
-- -------------------------------------------------------------
-- Considered and rejected. This is a SQL function with no access to
-- PAYPAL_ENV, which is an Edge Function variable; making it runtime-aware
-- would couple the database to deployment config. Worse, it would mean
-- flipping a config variable silently revokes access for everyone on the other
-- side. Access changes belong in data, deliberately, not as a side effect of a
-- deploy. 'sandbox' is refused permanently and unconditionally instead.
--
-- BLAST RADIUS, MEASURED BEFORE APPLYING (2026-08-13)
-- ---------------------------------------------------
--   7 comped   env NULL   entitled -> STILL ENTITLED
--   2 pending  env live   not entitled -> unchanged (status gate)
--   2 active   env sandbox  ENTITLED -> NO LONGER ENTITLED
--       zz-signup-live, niggatesting — both owner test workspaces
--
-- There are ZERO real paying customers at the time of this change. Every
-- entitled workspace is a comp or one of those two. That is what makes this
-- cheap now and expensive later.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- It does not touch reads — a lapsed or sandbox workspace's public site still
-- renders, because that gate is `tenants.status` in the resolver. It does not
-- cancel anything at PayPal, delete any row, or change any status. It does not
-- touch comp_kind, billing-checkout, or the webhook.
--
-- ROLLBACK
-- --------
-- Re-run the previous definition, which is the body below minus the single
-- `and s.environment is distinct from 'sandbox'` line.
--
-- Idempotent. Safe to re-run. VERIFY block at the bottom.

create or replace function public.tenant_has_active_subscription(tid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.subscriptions s
     where s.tenant_id = tid
       -- The whole of this migration. NULL-safe on purpose: see the header.
       and s.environment is distinct from 'sandbox'
       and (
            s.status = 'comped'
         or (s.status in ('active','trialing')
             and (s.current_period_end is null or s.current_period_end > now()))
         or (s.status = 'past_due' and s.grace_ends_at is not null and s.grace_ends_at > now())
         or (s.status = 'canceled'
             and s.current_period_end is not null and s.current_period_end > now())
       )
  );
$function$;

comment on function public.tenant_has_active_subscription(uuid) is
  'THE entitlement authority. A sandbox subscription never grants access; NULL environment (comps) does. See section-o-sandbox-entitlement.sql.';

-- VERIFY ---------------------------------------------------------------------
-- Every comp must still be entitled, and no sandbox row may be.
--
--   select t.slug, s.status, s.environment,
--          public.tenant_has_active_subscription(t.id) as entitled
--     from public.tenants t
--     left join public.subscriptions s on s.tenant_id = t.id
--    order by s.environment nulls first, t.slug;
--
-- Expected: all 7 comped -> true; both sandbox -> false; both live/pending -> false.
