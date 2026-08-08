-- ============================================================================
-- SECTION K — ENTITLEMENT ENFORCEMENT
-- ============================================================================
-- Wires tenant_has_active_subscription() into the write policies it was always
-- meant to gate.
--
-- WHAT WAS WRONG
-- --------------
-- section-h-billing.sql defined tenant_has_active_subscription(), commented it
-- as "THE entitlement authority", and granted it to `authenticated`. Nothing
-- ever called it. `select * from pg_policies where qual ilike
-- '%tenant_has_active_subscription%'` returned zero rows, and docs/architecture/
-- billing.md described the wiring as done.
--
-- The consequence is only visible after a period boundary, which is why it
-- survived: a customer cancels, keeps access through the paid period exactly as
-- designed, and then keeps it forever. PayPal sends nothing after a terminal
-- cancellation, so no event can ever correct it.
--
-- WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT
-- ----------------------------------------------------
-- Changes:  who may WRITE tenant content — profile, projects, tenant_domains,
--           and media objects in storage.
-- Does not: reads (a lapsed portfolio still renders — that gate is
--           tenants.status and lives in the resolver, a separate change);
--           is_tenant_admin() itself; anything on the six billing tables.
--
-- is_tenant_admin() IS LEFT ALONE ON PURPOSE. It gates the billing_* reads, so
-- folding entitlement into it would hide the Billing tab from exactly the
-- person who needs it — a lapsed customer trying to resubscribe. That is an
-- unrecoverable lockout, and it is the reason this file adds a new predicate
-- instead of tightening the existing one.
--
-- ALTER POLICY, NOT DROP + CREATE. Two reasons, both from section-h: re-running
-- this file must be a no-op, and DROP POLICY is refused by the safety
-- classifier on the Supabase MCP tools, so a file containing one cannot be
-- applied by an agent at all.

begin;

-- ============================================================================
-- 1. BACKFILL — before the policy, never after
-- ============================================================================
-- Five tenants had no subscriptions row at all when this was written, two of
-- them status='active'. The predicate fails closed, so applying the policy
-- without this would revoke write access from workspaces that work today.
--
-- 'comped' is the same instrument section-h used for every tenant that existed
-- when billing shipped, and it carries the same invariant: BILLING MUST NEVER
-- TAKE A LIVE CLIENT'S SITE DOWN. A workspace that predates enforcement is
-- granted, not stranded.
--
-- WHY created_via <> 'self_signup' — THIS CLAUSE IS THE WHOLE POINT
-- -----------------------------------------------------------------
-- "Predates enforcement" is the intent; "has no subscription row" is NOT the
-- same thing, and the first version of this file used the latter. A self-signup
-- customer who has verified their email but not yet paid is precisely a tenant
-- with no subscription row, so the unqualified backfill comped them — granting
-- free permanent entitlement to someone who never paid, which is the exact
-- outcome this whole file exists to prevent.
--
-- It is worse than a leak, because it is terminal: billing-checkout refuses
-- anyone already holding 'comped' (already_subscribed, 409), so the customer
-- can never buy their way out, while tenants.status stays 'disabled' and their
-- public site stays dark — only the ACTIVATED webhook flips that, and they can
-- no longer generate one. Observed on three live workspaces created between
-- 2026-08-06 and 2026-08-07 and comped by this file's first version on
-- 2026-08-08; those rows are NOT corrected here — removing billing rows is a
-- separate change from fixing the rule that writes them.
--
-- created_via is the right discriminator rather than a created_at cutoff:
--   * A self-signup tenant CANNOT predate billing. Section I (signup) shipped
--     after section H (billing), so the category is post-billing by
--     construction. No magic timestamp is needed to say so.
--   * The column is NOT NULL DEFAULT 'owner'. That is load-bearing: were it
--     nullable, `<> 'self_signup'` would be NULL for a legacy row and silently
--     exclude it, stranding exactly the pre-billing client this grant protects.
--   * Self-signup workspaces that HAVE paid need no special case — they already
--     have a subscription row, so `not exists` skips them anyway.
--
-- The comparison is `<>` and not `= 'owner'` deliberately: an unrecognised
-- future created_via is granted rather than stranded, matching the invariant
-- above. THE COST OF THAT CHOICE: if another self-serve signup path is ever
-- added, its created_via value MUST be added to this exclusion, or it inherits
-- the bug described above.
--
-- Idempotent by `where not exists` rather than ON CONFLICT: tenant_id is
-- unique, but this way re-running also cannot touch a row that has since become
-- a real paid subscription. With the clause above, re-running is also safe over
-- time rather than only once — an unpaid self-signup workspace is skipped on
-- every run, not just the run that happened to precede it.
-- plan_code is 'comped', matching COMP_PLAN_CODE in lib/billing-plans.js and
-- the eleven rows section-h already wrote. lib/billing-status.js treats that
-- code as granted access on sight, so a mismatch here would render as an
-- unknown plan in the UI.
insert into public.subscriptions (tenant_id, status, plan_code)
select t.id, 'comped', 'comped'
  from public.tenants t
 where t.created_via <> 'self_signup'
   and not exists (
   select 1 from public.subscriptions s where s.tenant_id = t.id
 );

-- ============================================================================
-- 2. THE COMPOSED PREDICATE
-- ============================================================================
-- "May this session change this tenant's content?" — the two existing
-- authorities, joined. Nothing new is decided here; both halves already exist
-- and are already tested.
--
--   is_platform_owner()  short-circuits FIRST, and must. An owner has to be
--                        able to fix a lapsed client's site, and support work
--                        does not stop because a card expired.
--   is_tenant_admin()    unchanged: are you an admin of this workspace.
--   tenant_has_...()     unchanged: is this workspace paid up, right now.
--
-- SECURITY DEFINER with a locked search_path, like every other function in this
-- schema: it reads subscriptions, which the caller may not read for tenants
-- other than their own.
--
-- Cost is one unique-index lookup on subscriptions_tenant_id_key per statement
-- (STABLE, so not per row), against writes that happen at human speed.
create or replace function public.can_edit_tenant(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
      or (public.is_tenant_admin(tid) and public.tenant_has_active_subscription(tid));
$$;

comment on function public.can_edit_tenant(uuid) is
  'Write authority for tenant content: owner, OR (tenant admin AND paid up). Reads are NOT gated by this. Fails closed.';

grant execute on function public.can_edit_tenant(uuid) to authenticated;

-- ============================================================================
-- 3. THE WRITE POLICIES
-- ============================================================================
-- Same policies, same names, one predicate swapped. USING and WITH CHECK both,
-- or a lapsed admin could still INSERT (WITH CHECK governs new rows, USING
-- governs existing ones — an UPDATE needs both).
alter policy "Tenant admins write profile" on public.profile
  using (public.can_edit_tenant(tenant_id))
  with check (public.can_edit_tenant(tenant_id));

alter policy "Tenant admins write projects" on public.projects
  using (public.can_edit_tenant(tenant_id))
  with check (public.can_edit_tenant(tenant_id));

alter policy "Tenant admins manage domains" on public.tenant_domains
  using (public.can_edit_tenant(tenant_id))
  with check (public.can_edit_tenant(tenant_id));

-- ============================================================================
-- 4. STORAGE
-- ============================================================================
-- The three media policies call can_write_media(), so the entitlement check
-- goes inside the function and the policies themselves are untouched.
--
-- Everything else here is preserved exactly: the '..' traversal guard, the
-- owner bypass, the 't-<uuid>' folder convention, and coalesce(..., false) so a
-- null can never read as permission.
create or replace function public.can_write_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(
    position('..' in object_name) = 0
    and (
      public.is_platform_owner()
      or exists (
        select 1
        from public.tenant_admins ta
        where ta.user_id = auth.uid()
          and (storage.foldername(object_name))[1] = 't-' || ta.tenant_id::text
          and public.tenant_has_active_subscription(ta.tenant_id)
      )
    ),
    false
  );
$$;

comment on function public.can_write_media(text) is
  'Media write authority: owner, OR an admin of the tenant that owns the folder AND that tenant is paid up. Reads stay public.';

commit;

-- ============================================================================
-- VERIFY (run after applying)
-- ============================================================================
-- 1. Every tenant THAT SHOULD BE GRANTED has a subscription, and nothing that
--    worked lost access.
--
--    NOTE: "tenants == subs, unentitled == 0" was the assertion here originally
--    and it is WRONG — it is the bug in section 1 restated as a check, which is
--    why the bug passed its own verification. An unpaid self-signup workspace
--    SHOULD have no subscription row and SHOULD be unentitled; that is the
--    corrected behaviour, not a failure. Count the grantable population instead.
--
-- select (select count(*) from public.tenants where created_via <> 'self_signup')
--          as grantable_tenants,
--        (select count(*) from public.tenants t
--          where t.created_via <> 'self_signup'
--            and not exists (select 1 from public.subscriptions s
--                             where s.tenant_id = t.id)) as ungranted,
--        (select count(*) from public.tenants t
--          where t.created_via <> 'self_signup'
--            and not public.tenant_has_active_subscription(t.id)) as unentitled;
--   -- ungranted and unentitled must BOTH be 0 immediately after applying.
--   -- grantable_tenants was 14 of 20 on 2026-08-08.
--
--   -- Unpaid self-signup workspaces are expected to be unentitled. To see them:
--   -- select t.slug, t.status from public.tenants t
--   --  where t.created_via = 'self_signup'
--   --    and not exists (select 1 from public.subscriptions s
--   --                     where s.tenant_id = t.id);
--
-- 2. The policies actually changed.
--
-- select tablename, policyname, qual
--   from pg_policies
--  where schemaname = 'public'
--    and qual ilike '%can_edit_tenant%';
--   -- expect exactly 3 rows: profile, projects, tenant_domains.
--
-- 3. The predicate agrees with entitlement, per tenant.
--
-- select t.slug, s.status, s.current_period_end,
--        public.tenant_has_active_subscription(t.id) as entitled
--   from public.tenants t join public.subscriptions s on s.tenant_id = t.id
--  order by entitled, t.slug;
--   -- every comped row: entitled = true.
--   -- every 'canceled' row still inside current_period_end: entitled = true.
--   -- a 'canceled' row past current_period_end: entitled = false. THAT is the
--   -- bug this file fixes, and it is the only row that should read false.
--
-- 4. THE REGRESSION THIS FILE EXISTS FOR. Impersonate a real NON-OWNER admin
--    (an owner would pass on the bypass and prove nothing), push the period end
--    into the past, and confirm writes stop while reads do not. Wrap it in a
--    transaction and ROLL BACK — this mutates a live billing row.
--
-- begin;
-- update public.subscriptions set current_period_end = now() - interval '1 day'
--  where tenant_id = '<tenant uuid>';
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<non-owner admin uuid>","role":"authenticated"}';
-- with probe as (
--   select public.is_tenant_admin('<tenant uuid>') as still_admin,
--          public.can_edit_tenant('<tenant uuid>') as may_edit),
--   try as (update public.profile set name = name
--            where tenant_id = '<tenant uuid>' returning 1),
--   rd  as (select count(*) n from public.subscriptions
--            where tenant_id = '<tenant uuid>')
-- select p.still_admin, p.may_edit,
--        (select count(*) from try) as rows_written,
--        (select n from rd)         as billing_rows_readable
--   from probe p;
-- rollback;
--
--   -- Verified 2026-08-08 on tenant `gegeg`:
--   --   still_admin true, may_edit FALSE, rows_written 0, billing readable 1.
--   -- still_admin and the readable billing row are the point, not an accident:
--   -- they are how a lapsed customer still reaches the Billing tab and pays.
