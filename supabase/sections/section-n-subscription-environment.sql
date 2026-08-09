-- Section N — which PayPal environment a subscription belongs to
--
-- THE PROBLEM THIS SOLVES
-- -----------------------
-- `provider_plans` has an `environment` column; `subscriptions` does not, and
-- there is no `provider_plan_id` on the row to join back through. So once
-- PAYPAL_ENV flipped to `live` on 2026-08-09, production held sandbox and live
-- subscriptions side by side with NOTHING distinguishing them: same table, same
-- statuses, same `provider = 'paypal'`, same `I-` id format.
--
-- The 2026-08-09 cleanup audit had to classify five subscriptions by reading
-- `billing_events` payloads and looking at whether the PayPal link host was
-- `api.sandbox.paypal.com` or `api.paypal.com`. That is archaeology, it is not
-- available to any code path, and it stops working the moment an event is
-- pruned.
--
-- The practical cost: an operator cannot tell that `zz-signup-live` is an
-- ACTIVE sandbox subscription — costing nothing, cancellable at leisure — while
-- `onecenttest` is a live one. Those two facts look identical in the dashboard
-- and call for opposite actions.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- It changes no entitlement, no checkout logic and no billing behaviour. The
-- column is descriptive: it records which PayPal an existing subscription lives
-- at. `tenant_has_active_subscription()` is untouched and must stay untouched —
-- a sandbox subscription that is currently granting access keeps granting it,
-- because taking access away from a workspace is not this migration's business.
--
-- NULLABLE ON PURPOSE
-- -------------------
-- `comped` and never-subscribed rows have no provider subscription, so they
-- have no environment; NULL means "not applicable", not "unknown". The backfill
-- also leaves NULL where the evidence does not exist rather than defaulting to
-- 'sandbox' — a wrong 'sandbox' label on a live subscription is exactly the
-- mistake this column exists to prevent, and guessing would reintroduce it.
--
-- Idempotent. Safe to re-run. VERIFY block at the bottom.

-- 1. The column ---------------------------------------------------------------

alter table public.subscriptions
  add column if not exists environment text;

comment on column public.subscriptions.environment is
  'Which provider environment this subscription lives at: sandbox | live. NULL for comped and never-subscribed rows, which have no provider subscription. Descriptive only — no entitlement reads this.';

-- Restrict the vocabulary, but keep NULL legal. Guarded because a re-run would
-- otherwise fail on the existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and conname = 'subscriptions_environment_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_environment_check
      check (environment is null or environment in ('sandbox', 'live'));
  end if;
end $$;

-- 2. Backfill from the only evidence that exists ------------------------------
--
-- Every PayPal webhook payload carries HATEOAS links whose host names the
-- environment: `api.sandbox.paypal.com` / `www.sandbox.paypal.com` for sandbox,
-- the same without `sandbox.` for live. That is how the audit classified these
-- rows by hand, and it is the same rule here.
--
-- `bool_or` over every link of every event for the subscription: sandbox wins if
-- ANY link says sandbox, because a live payload can never contain a sandbox
-- host. Rows whose events are gone stay NULL.
--
-- Only touches rows where environment IS NULL, so a re-run cannot relabel a row
-- that the application has since written correctly.
with evidence as (
  select
    be.resource_id,
    case
      when bool_or(link.href like '%sandbox.paypal.com%') then 'sandbox'
      when bool_or(link.href like '%paypal.com%')         then 'live'
      else null
    end as environment
  from public.billing_events be
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(be.payload -> 'resource' -> 'links') = 'array'
        then be.payload -> 'resource' -> 'links'
      else '[]'::jsonb
    end
  ) as el(value)
  cross join lateral (select el.value ->> 'href') as link(href)
  where be.resource_id is not null
    and link.href is not null
  group by be.resource_id
)
update public.subscriptions s
   set environment = evidence.environment
  from evidence
 where s.provider_subscription_id = evidence.resource_id
   and s.environment is null
   and evidence.environment is not null;

-- 3. VERIFY -------------------------------------------------------------------
-- Run this and READ IT. Do not assume the migration applied.
do $$
declare
  col_exists boolean;
  con_exists boolean;
  labelled   int;
  unlabelled int;
  no_provider int;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'environment'
  ) into col_exists;

  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and conname = 'subscriptions_environment_check'
  ) into con_exists;

  select count(*) into labelled
    from public.subscriptions where environment is not null;

  -- The ones that matter: a provider subscription we still cannot classify.
  select count(*) into unlabelled
    from public.subscriptions
   where provider_subscription_id is not null and environment is null;

  select count(*) into no_provider
    from public.subscriptions where provider_subscription_id is null;

  if not col_exists then raise exception 'VERIFY FAILED: subscriptions.environment missing'; end if;
  if not con_exists then raise exception 'VERIFY FAILED: subscriptions_environment_check missing'; end if;

  raise notice 'Section N OK — % labelled, % provider subscriptions still unlabelled, % rows with no provider subscription (NULL is correct for those)',
    labelled, unlabelled, no_provider;

  if unlabelled > 0 then
    raise notice 'ACTION: % subscription(s) have a provider id but no environment — their billing_events are gone. Classify by hand at PayPal.', unlabelled;
  end if;
end $$;

-- Expected on 2026-08-09 production: 5 labelled
--   I-M65XW1E7MM82 sandbox (zz-billing-test)
--   I-2GNFETA9WR0C sandbox (zz-signup-live)
--   I-D3EHXR0FH8M9 sandbox (niggatesting)
--   I-FUTDPN0VUV56 sandbox (gegeg)
--   I-V83KGRCDG4E1 live    (onecenttest)
-- and 13 rows with no provider subscription, correctly left NULL.
