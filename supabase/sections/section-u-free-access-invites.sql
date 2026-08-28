-- SECTION U — invite a client to free access, by email (2026-08-28)
--
-- THE FLOW THIS REPLACES. Onboarding a client meant the owner creating their
-- auth account with a generated password, then handing that password over by
-- WhatsApp or a PDF. Two onboarding paths existed side by side; self-serve
-- signup is now the only one, and the owner never sees a password again.
--
-- THE FLOW NOW. The owner types an email. That is the entire input. When the
-- person behind that address signs up through the ordinary flow, their new
-- workspace is granted free access for a fixed number of days instead of being
-- asked to pay.
--
-- WHY A TABLE AND NOT A CODE. A code has to be delivered, stored somewhere, and
-- can be forwarded to somebody else. An email is what the owner already knows
-- and already types. The failure mode -- the client signs up with a DIFFERENT
-- address -- needs no new machinery: they then exist in the client list like
-- anyone else, and "grant free access" is already a button there.

create table if not exists public.free_access_invites (
  id                uuid primary key default gen_random_uuid(),
  -- Stored lower-cased and matched lower-cased. Addresses arrive from a human
  -- typing into a console field and from an auth provider, and those two do not
  -- agree about capitalisation.
  email             text        not null,
  days              integer     not null default 30,
  note              text,
  invited_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  claimed_at        timestamptz,
  claimed_tenant_id uuid        references public.tenants(id) on delete set null,
  constraint free_access_invites_days_range check (days between 1 and 3650)
);

-- One OPEN invite per address. A claimed one stays as history, so the same
-- person can be invited again later without deleting the record of the first.
create unique index if not exists free_access_invites_open_email
  on public.free_access_invites (lower(email))
  where claimed_at is null;

create index if not exists free_access_invites_claimed
  on public.free_access_invites (claimed_at desc nulls first);

alter table public.free_access_invites enable row level security;

-- OWNER ONLY, and the database is the boundary. Nothing anonymous reads this:
-- the list of addresses offered free access is not public information, and the
-- claim below runs as SECURITY DEFINER so a client never needs to see the row
-- that grants them their own access.
drop policy if exists "Owner reads invites"   on public.free_access_invites;
drop policy if exists "Owner writes invites"  on public.free_access_invites;
create policy "Owner reads invites" on public.free_access_invites
  for select using (public.is_platform_owner());
create policy "Owner writes invites" on public.free_access_invites
  for all using (public.is_platform_owner()) with check (public.is_platform_owner());

-- ---------------------------------------------------------------------------
-- claim_free_access — called by signup-verify once the address is proven
-- ---------------------------------------------------------------------------
--
-- IDEMPOTENT, because signup-verify is. Its token is reusable for 24 hours and
-- WILL be called more than once -- by mail scanners pre-fetching the link, by a
-- customer clicking twice. A second call must not extend the grant by another
-- 30 days, so the invite is only consumed while claimed_at is still null, and
-- the whole thing is a no-op afterwards.
--
-- Returns true when a grant was made, so the caller can log it.
create or replace function public.claim_free_access(p_tenant_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inv public.free_access_invites%rowtype;
begin
  if p_tenant_id is null or coalesce(trim(p_email), '') = '' then
    return false;
  end if;

  -- Lock the row so two simultaneous verifications cannot both claim it.
  select * into inv
    from public.free_access_invites
   where lower(email) = lower(trim(p_email))
     and claimed_at is null
   order by created_at
   limit 1
   for update skip locked;

  if not found then return false; end if;

  -- The grant. comp_kind 'convertible' rather than 'grandfather': this one is
  -- MEANT to turn into a paying subscription, and the two are already
  -- distinguished by the existing check constraint.
  --
  -- current_period_end is what makes it expire. section-t taught both
  -- lib/billing-status.js and tenant_has_active_subscription() the same rule:
  -- a date present is a deadline, a date absent is forever.
  insert into public.subscriptions (tenant_id, provider, plan_code, status, comp_kind, current_period_end)
  values (p_tenant_id, 'none', 'comped', 'comped', 'convertible', now() + (inv.days || ' days')::interval)
  on conflict (tenant_id) do nothing;

  -- A workspace is created DISABLED and normally activated by the PayPal
  -- ACTIVATED webhook. Nothing is going to charge this one, so nothing would
  -- ever activate it -- the grant has to do it, or the client gets free access
  -- to a portfolio that stays dark.
  update public.tenants set status = 'active'
   where id = p_tenant_id and status <> 'active';

  update public.free_access_invites
     set claimed_at = now(), claimed_tenant_id = p_tenant_id
   where id = inv.id;

  return true;
end;
$function$;

revoke all on function public.claim_free_access(uuid, text) from public, anon, authenticated;
comment on function public.claim_free_access is
  'Consumes an open free-access invite for this email and grants the tenant a time-limited comp. Idempotent. Service-role only.';
