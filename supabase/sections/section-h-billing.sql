-- ############################################################################
-- SECTION H — subscription billing (PayPal)
-- ############################################################################
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ NOT YET APPLIED. Run once against gphrzvjlstznhypcfgre, then update       │
-- │ supabase/SCHEMA.sql to match and record the result in this banner —       │
-- │ the same convention as sections C–G.                                      │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- WHAT THIS ADDS
-- --------------
--   provider_plans      our plan codes  ->  the provider's plan ids
--   billing_customers   a tenant        ->  the payer at the provider
--   subscriptions       one live subscription per tenant
--   payments            every charge attempt, successful or not
--   invoices            the billing document for a payment
--   billing_events      every webhook we have received, verbatim
--   tenant_has_active_subscription(uuid)  the entitlement authority
--
-- THE ONE RULE THAT SHAPES ALL OF IT
-- ----------------------------------
-- The browser may READ billing rows for tenants it administers. It may not
-- WRITE any of them, ever — not one column. Every write comes from an Edge
-- Function using the service role, acting on something PayPal told it. There is
-- no policy below that lets `authenticated` insert or update a subscription,
-- because a client who can write `status = 'active'` has bought the product
-- with a fetch call.
--
-- This is the same shape as the rest of the schema (see SCHEMA.sql): public
-- reads are wide, writes are gated. It is stricter here because the write side
-- is not "can this person edit their own site" but "has this person paid".
--
-- WHY tenant AND NOT user
-- -----------------------
-- tenant_admins is many-to-one: a workspace can have several admins. A
-- subscription belongs to the WORKSPACE, so it survives an admin being added
-- or removed, and two admins cannot each buy the same thing.
--
-- WHY provider COLUMNS EVERYWHERE
-- -------------------------------
-- Billing is provider-agnostic by design: `provider` + `provider_*_id` on every
-- row, and a plan-id mapping table rather than ids in the code. Adding a second
-- provider later is a new adapter and new rows in provider_plans — not a
-- migration of this schema.

begin;

-- ============================================================================
-- 1. PLAN MAPPING — our codes to the provider's ids
-- ============================================================================
-- PayPal plan ids differ between sandbox and live, and a price change means a
-- NEW plan id (PayPal plans are effectively immutable once subscribers exist).
-- Neither fact can live in the code, so both live here.
create table if not exists public.provider_plans (
  id                uuid primary key default gen_random_uuid(),
  provider          text        not null default 'paypal',
  environment       text        not null check (environment in ('sandbox', 'live')),
  plan_code         text        not null,          -- matches lib/billing-plans.js
  provider_plan_id  text        not null,          -- e.g. P-5ML4271244454362WXNWU5NQ
  provider_product_id text,
  amount            integer     not null check (amount > 0),  -- minor units, billing currency
  currency          text        not null,
  active            boolean     not null default true,
  created_at        timestamptz not null default now(),
  -- Only ONE active mapping per plan per environment. Superseding a price means
  -- flipping the old row to active = false and inserting the new one, which
  -- keeps history instead of overwriting what existing subscribers are on.
  unique (provider, environment, provider_plan_id)
);

create unique index if not exists provider_plans_active_idx
  on public.provider_plans (provider, environment, plan_code)
  where active;

comment on table public.provider_plans is
  'Maps our plan codes to provider plan ids, per environment. Written by billing-plans-sync, never by the browser.';

-- ============================================================================
-- 2. CUSTOMERS — the tenant's identity at the provider
-- ============================================================================
create table if not exists public.billing_customers (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  provider              text not null default 'paypal',
  provider_customer_id  text,                    -- PayPal payer id
  email                 text,                    -- the PayPal account's email
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, provider)
);

comment on table public.billing_customers is
  'Who the tenant is at the payment provider. Holds NO payment instrument — PayPal keeps the funding source; we only ever see an id and an email.';

-- ============================================================================
-- 3. SUBSCRIPTIONS — one live subscription per tenant
-- ============================================================================
-- `status` is OUR vocabulary, not PayPal's. The adapter maps
-- APPROVAL_PENDING/ACTIVE/SUSPENDED/CANCELLED/EXPIRED onto these, so a second
-- provider with different words changes one function and no data.
-- lib/billing-status.js derives every screen from exactly these values.
create table if not exists public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  provider                  text not null default 'paypal',
  provider_subscription_id  text,                  -- PayPal I-XXXXXXXXXXXX
  plan_code                 text not null,
  status                    text not null check (status in
                              ('pending','trialing','active','past_due','canceled','expired','comped')),
  amount                    integer,               -- minor units actually charged
  currency                  text,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  grace_ends_at             timestamptz,           -- past_due only
  trial_ends_at             timestamptz,
  canceled_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  -- ONE subscription row per tenant. A workspace that resubscribes updates this
  -- row rather than growing a second one, so "is this tenant entitled" can never
  -- depend on which of two rows you happen to read. The history of what was
  -- charged lives in payments, which is where history belongs.
  unique (tenant_id),
  -- A provider id, once we have one, must be unique: two tenants sharing a
  -- PayPal subscription id means a webhook would activate the wrong workspace.
  unique (provider, provider_subscription_id)
);

create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_period_end_idx on public.subscriptions (current_period_end);

comment on table public.subscriptions is
  'One row per tenant. `status` is our own vocabulary; the provider adapter maps its states onto it.';

-- ============================================================================
-- 4. PAYMENTS — every charge attempt, successful or not
-- ============================================================================
create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  subscription_id       uuid references public.subscriptions(id) on delete set null,
  provider              text not null default 'paypal',
  -- THE IDEMPOTENCY KEY. PayPal retries a webhook up to a day; without this
  -- unique constraint a retried PAYMENT.SALE.COMPLETED books the same money
  -- twice and extends the period twice.
  provider_payment_id   text not null,
  amount                integer not null,
  currency              text not null,
  status                text not null check (status in ('pending','paid','failed','refunded','voided')),
  description           text,
  failure_reason        text,
  -- 'provider' (a real charge) or 'manual' (recorded by the operator against a
  -- bank transfer). The manual route has no UI yet; the column exists so adding
  -- it later is not a migration.
  method                text not null default 'provider' check (method in ('provider','manual')),
  period_start          timestamptz,
  period_end            timestamptz,
  created_at            timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create index if not exists payments_tenant_idx on public.payments (tenant_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status);

-- ============================================================================
-- 5. INVOICES — the document for a payment
-- ============================================================================
-- Separate from payments because they are not the same thing: an invoice is
-- issued for a period and may be paid late, by a different payment, or not at
-- all. Keeping one table for both makes a failed-then-retried renewal
-- unrepresentable.
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  payment_id     uuid references public.payments(id) on delete set null,
  number         text not null unique,     -- INV-2026-000001
  amount         integer not null,
  currency       text not null,
  status         text not null check (status in ('open','paid','void','uncollectible')),
  period_start   timestamptz,
  period_end     timestamptz,
  issued_at      timestamptz not null default now(),
  paid_at        timestamptz
);

create index if not exists invoices_tenant_idx on public.invoices (tenant_id, issued_at desc);

-- Sequential, gap-tolerant invoice numbers. A sequence rather than count(*)+1,
-- which two concurrent webhooks would happily give the same value.
create sequence if not exists public.invoice_number_seq;

create or replace function public.next_invoice_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'INV-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;

-- Nobody in the browser may mint an invoice number; the Edge Functions, which
-- run as service_role, must be able to. The explicit grant matters: revoking
-- from PUBLIC removes the default EXECUTE that service_role was relying on, so
-- without the second line invoicing breaks on the first successful payment.
revoke all on function public.next_invoice_number() from public, anon, authenticated;
grant execute on function public.next_invoice_number() to service_role;

-- ============================================================================
-- 6. BILLING EVENTS — every webhook, verbatim
-- ============================================================================
-- The audit trail, and the second half of idempotency. A webhook is INSERTED
-- here first; a duplicate delivery violates the unique constraint and is
-- dropped before any money logic runs.
create table if not exists public.billing_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null default 'paypal',
  provider_event_id  text not null,
  event_type         text not null,
  resource_id        text,
  payload            jsonb not null,
  signature_verified boolean not null default false,
  processed_at       timestamptz,
  error              text,
  received_at        timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists billing_events_type_idx on public.billing_events (event_type, received_at desc);
create index if not exists billing_events_unprocessed_idx on public.billing_events (received_at)
  where processed_at is null;

comment on table public.billing_events is
  'Raw provider webhooks. The unique (provider, provider_event_id) is what makes redelivery a no-op.';

-- ============================================================================
-- 7. ENTITLEMENT — the authority
-- ============================================================================
-- The ONLY definition of "is this workspace paid up". lib/billing-status.js
-- mirrors this rule for the UI; where the two disagree, this one is right.
--
-- SECURITY DEFINER + a locked search_path, like every other function here: it
-- reads a table the caller may not be able to read for other tenants.
create or replace function public.tenant_has_active_subscription(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.subscriptions s
     where s.tenant_id = tid
       and (
            s.status = 'comped'
         or (s.status in ('active','trialing')
             and (s.current_period_end is null or s.current_period_end > now()))
         -- A failed renewal keeps access until grace runs out. Recoverable
         -- declines are common and cutting a customer off on day one loses
         -- more than it protects.
         or (s.status = 'past_due' and s.grace_ends_at is not null and s.grace_ends_at > now())
         -- 'canceled' still counts while the paid period runs: they bought
         -- those days. lib/billing-status.js calls this state 'canceling'.
         or (s.status = 'canceled'
             and s.current_period_end is not null and s.current_period_end > now())
       )
  );
$$;

comment on function public.tenant_has_active_subscription(uuid) is
  'THE entitlement authority. pending/expired and lapsed grace are all false. Fails closed.';

grant execute on function public.tenant_has_active_subscription(uuid) to authenticated;

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================
alter table public.provider_plans    enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.payments          enable row level security;
alter table public.invoices          enable row level security;
alter table public.billing_events    enable row level security;

-- READ: a tenant's own admins, plus platform owners. is_tenant_admin() is
-- already true for owners, so one policy covers both — the same pattern the
-- rest of the schema uses.
--
-- Note these are NOT public reads. Everything else in this database is readable
-- by anon because a portfolio is public; what a client pays is not.
--
-- CREATED CONDITIONALLY, not with `drop policy … ; create policy …`. Two
-- reasons, and the second is the load-bearing one:
--   * re-running this file must be a no-op, and CREATE POLICY on an existing
--     policy is an error;
--   * DROP POLICY is refused by the safety classifier on the Supabase MCP
--     tools, so a file containing one cannot be applied by an agent at all and
--     has to be pasted into the dashboard by hand. This has cost time twice
--     before on this project.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('subscriptions',     'subscriptions_select_admin',     'public.is_tenant_admin(tenant_id)'),
      ('payments',          'payments_select_admin',          'public.is_tenant_admin(tenant_id)'),
      ('invoices',          'invoices_select_admin',          'public.is_tenant_admin(tenant_id)'),
      ('billing_customers', 'billing_customers_select_admin', 'public.is_tenant_admin(tenant_id)'),
      -- provider_plans is readable by any signed-in user: it is a price list,
      -- and checkout needs to know a plan exists before starting one.
      ('provider_plans',    'provider_plans_select_auth',     'active'),
      -- billing_events: owners only. It holds raw provider payloads, which
      -- carry payer names and emails belonging to OTHER tenants' customers.
      ('billing_events',    'billing_events_select_owner',    'public.is_platform_owner()')
    ) as t(tbl, pol, expr)
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = p.tbl and policyname = p.pol
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (%s)',
        p.pol, p.tbl, p.expr
      );
    end if;
  end loop;
end $$;

-- WRITES: none. There is deliberately no INSERT/UPDATE/DELETE policy on any of
-- these six tables, so every write is refused for anon and authenticated alike.
-- The Edge Functions use the service role, which bypasses RLS by design.
--
-- If you are ever tempted to add "just an update policy so the client can
-- cancel from the browser": cancellation goes through billing-subscription,
-- which cancels at PayPal FIRST and writes the row from the webhook. A row
-- flipped locally would leave PayPal still billing the customer every month.

-- ============================================================================
-- 9. GRANDFATHER THE EXISTING WORKSPACES
-- ============================================================================
-- Every tenant that exists TODAY is a live client who was never asked to pay.
-- Billing must not switch their site off the moment it ships, so they get a
-- comped subscription: entitled, no price, no renewal date, no provider.
--
-- Idempotent — re-running inserts nothing, and it never touches a tenant that
-- already has a subscription row.
insert into public.subscriptions (tenant_id, provider, plan_code, status, created_at)
select t.id, 'none', 'comped', 'comped', now()
  from public.tenants t
 where not exists (select 1 from public.subscriptions s where s.tenant_id = t.id)
on conflict (tenant_id) do nothing;

-- ============================================================================
-- 10. updated_at
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_touch on public.subscriptions;
create trigger trg_subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_customers_touch on public.billing_customers;
create trigger trg_billing_customers_touch before update on public.billing_customers
  for each row execute function public.touch_updated_at();

commit;

-- ============================================================================
-- VERIFY (run after applying)
-- ============================================================================
-- select count(*) as tenants,
--        (select count(*) from public.subscriptions where status = 'comped') as comped
--   from public.tenants;
--   -- these two numbers must match, or a live client lost access.
--
-- select public.tenant_has_active_subscription(id) from public.tenants limit 5;
--   -- must be true for every existing tenant.
