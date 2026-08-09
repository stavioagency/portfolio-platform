-- ============================================================================
-- SECTION M — CONVERTIBLE COMPS (metadata only)
-- ============================================================================
-- Adds ONE nullable column, subscriptions.comp_kind, recording whether a comped
-- workspace was granted permanently or is one we intend to convert to a paid
-- subscription. It changes no behaviour by itself: nothing reads this column
-- until the checkout gate is changed, which is a separate file and a separate
-- deploy.
--
-- THE DISTINCTION THIS RECORDS
-- ----------------------------
--   grandfather  A client who was already being served when billing shipped.
--                Entitled forever, never asked to pay. section-h granted the
--                cohort that existed at launch; section-k granted the
--                stragglers. This is a promise that was made to real people.
--   convertible  A comp we intend to turn into a paying subscription. Still
--                entitled, still free until a payment actually succeeds — the
--                flag only decides whether anyone is OFFERED a way to pay.
--
-- WHY A COLUMN, AND NOT ANY EXISTING FIELD
-- ----------------------------------------
--   status       Would mean a new value in the CHECK below, in
--                SUBSCRIPTION_STATUSES in _shared/provider.ts, in
--                lib/billing-status.js (BILLING_STATES, ENTITLED, TONES,
--                LABELS) and, fatally, in tenant_has_active_subscription().
--                Editing the entitlement authority to record a presentational
--                distinction is the trade section-k exists to warn about.
--   plan_code    Is the CONVERSION TARGET. billing-checkout overwrites it with
--                'yearly'/'monthly' the moment a checkout starts, so a marker
--                stored there erases itself at precisely the wrong moment.
--   provider     Looks like a discriminator and is not. Of the comped rows,
--                eleven carry 'none' (section-h) and two carry 'paypal' (the
--                column default, via section-k). Both cohorts are grandfather;
--                the split is an artefact of two different INSERT statements.
--                Checkout must also overwrite this column, because
--                subscriptionByProviderId() filters on it.
--   any date     trial_ends_at, current_period_end. A DATE ON A COMP IS THE
--                MECHANISM BY WHICH A COMP LAPSES, and a lapsed comp is a live
--                client's public site going dark. Comps stay date-free. There
--                is deliberately no expiry, no sweep and no cron here, and
--                none may ever be added.
--   created_via  On tenants, not subscriptions, and cannot tell a NEW
--                owner-created client from a grandfathered one — both are
--                'owner'. A created_at cutoff would separate them, and
--                section-k rejects that reasoning in writing.
--
-- METADATA ONLY. THIS COLUMN MUST NEVER AFFECT ENTITLEMENT.
-- --------------------------------------------------------
-- tenant_has_active_subscription() is not touched by this file and must never
-- learn about comp_kind. `status = 'comped'` remains unconditionally entitled
-- whichever kind it is. That is what makes a mislabelled row a wrong BUTTON
-- rather than a lockout — the property the section-k backfill lacked when it
-- comped three unpaid self-signup workspaces and left them unable to buy their
-- way out. Being wrong here is recoverable in one UPDATE.
--
-- NULLABLE, NOT `NOT NULL DEFAULT`
-- --------------------------------
-- The opposite of section-k's created_via reasoning, because the comparison is
-- the opposite. created_via is read as `<> 'self_signup'`, where a NULL would
-- silently exclude a row that needed granting, so NOT NULL was load-bearing
-- there. comp_kind is read as `= 'convertible'`, so NULL means "not offered"
-- and fails CLOSED. Nullable also avoids stamping a meaningless value onto the
-- rows that are not comps at all.
--
-- ROLLBACK
-- --------
-- Do NOT drop the column: that discards which clients were promised permanent
-- free access, and DROP is refused by the safety classifier on the Supabase MCP
-- tools anyway. To close every door instead:
--
--     update public.subscriptions set comp_kind = 'grandfather'
--      where status = 'comped';
--
-- grandfather is refuse-everything, which is exactly the behaviour before this
-- file, so that single statement restores it without a deploy.

begin;

-- ============================================================================
-- 1. THE COLUMN
-- ============================================================================
-- Additive and nullable, so applying this to a live table takes no meaningful
-- lock and no existing row changes. Every reader that does not know about the
-- column keeps working, which is why this is safe to apply well before the code
-- that uses it.
alter table public.subscriptions
  add column if not exists comp_kind text;

comment on column public.subscriptions.comp_kind is
  'Comp intent, meaningful ONLY when status = ''comped'': grandfather (permanent, never prompted to pay) or convertible (may be offered a checkout). METADATA ONLY — tenant_has_active_subscription() does not read this and must never read it. NULL means not offered.';

-- ============================================================================
-- 2. THE CHECK CONSTRAINT
-- ============================================================================
-- Guarded on pg_constraint rather than written as DROP + ADD. Two reasons, both
-- inherited from section-h and section-k: re-running this file must be a no-op,
-- and DROP is refused by the safety classifier on the Supabase MCP tools, so a
-- file containing one cannot be applied by an agent at all.
--
-- NULL is explicitly allowed. A non-comped row has no comp intent to express,
-- and forcing one would be inventing information.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.subscriptions'::regclass
       and conname = 'subscriptions_comp_kind_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_comp_kind_check
      check (comp_kind is null or comp_kind in ('grandfather', 'convertible'));
  end if;
end $$;

-- ============================================================================
-- 3. BACKFILL — every comp that exists today is a grandfather comp
-- ============================================================================
-- All of them predate any notion of conversion, and each one is a promise made
-- to a real client. Defaulting to grandfather is the fail-closed direction:
-- nobody becomes sellable by accident, and making one convertible later is a
-- deliberate, reversible, owner-initiated act.
--
-- SCOPED TO status = 'comped' ON PURPOSE. A paid, pending, cancelled or expired
-- subscription has no comp intent, and stamping one on would put a value in a
-- column that later readers are told to consult only for comps.
--
-- `and comp_kind is null` makes re-running safe over time rather than only
-- once: a comp an operator has since marked convertible is skipped on every
-- later run, not silently dragged back to grandfather.
update public.subscriptions
   set comp_kind = 'grandfather'
 where status = 'comped'
   and comp_kind is null;

commit;

-- ============================================================================
-- VERIFY (run after applying)
-- ============================================================================
-- 1. The population. Expected immediately after applying, on 2026-08-08:
--    comped = 13, grandfather = 13, convertible = 0, unlabelled = 0.
--
--    comped and grandfather match ONLY until the first comp is deliberately
--    made convertible; after that grandfather + convertible = comped is the
--    assertion that stays true. Unlike section-h's "tenants == comped" check,
--    this one does not decay into a false alarm.
--
-- select
--   (select count(*) from public.subscriptions where status = 'comped') as comped,
--   (select count(*) from public.subscriptions
--     where status = 'comped' and comp_kind = 'grandfather') as grandfather,
--   (select count(*) from public.subscriptions
--     where status = 'comped' and comp_kind = 'convertible') as convertible,
--   (select count(*) from public.subscriptions
--     where status = 'comped' and comp_kind is null) as unlabelled;
--   -- comped must equal grandfather + convertible, and unlabelled must be 0.
--
-- 2. No invalid values anywhere, and none outside the comped population.
--
-- select count(*) as invalid_values
--   from public.subscriptions
--  where comp_kind is not null
--    and comp_kind not in ('grandfather', 'convertible');
--   -- must be 0. The CHECK enforces it; this proves the CHECK is installed.
--
-- select count(*) as labelled_non_comps
--   from public.subscriptions
--  where comp_kind is not null and status <> 'comped';
--   -- must be 0 immediately after applying. It may legitimately become
--   -- non-zero later: a convertible comp that converts keeps its label while
--   -- status moves to 'active', and that is deliberate — clearing it would add
--   -- a write to the webhook's activation branch, which is the most delicate
--   -- path in the system. Readers consult comp_kind only when status='comped'.
--
-- 3. The constraint exists.
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.subscriptions'::regclass
--    and conname = 'subscriptions_comp_kind_check';
--   -- expect exactly one row.
--
-- 4. ENTITLEMENT IS UNCHANGED. This is the assertion that matters most: the
--    column is metadata, so every tenant entitled before this file must still
--    be entitled after it, whatever their comp_kind.
--
-- select t.slug, s.status, s.comp_kind,
--        public.tenant_has_active_subscription(t.id) as entitled
--   from public.tenants t
--   join public.subscriptions s on s.tenant_id = t.id
--  where s.status = 'comped'
--  order by t.slug;
--   -- entitled must be true for EVERY row, grandfather and convertible alike.
