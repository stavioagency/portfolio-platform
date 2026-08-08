-- ============================================================================
-- SECTION L — PUBLIC SITE ENTITLEMENT
-- ============================================================================
-- THIS FILE CHANGES NOTHING TODAY. It is a no-op on the live database, and that
-- is the point: it makes an existing permission DECLARED rather than incidental,
-- because lib/tenant.js now depends on it.
--
-- WHAT SECTION K LEFT OPEN
-- ------------------------
-- Section K wired tenant_has_active_subscription() into the WRITE policies, so a
-- lapsed workspace can no longer be edited. Its public portfolio kept rendering,
-- because that gate is tenants.status, read by the resolver in the BROWSER on
-- the anon key — and anon cannot read `subscriptions`, whose RLS restricts those
-- rows to the tenant's own admins.
--
-- THE FIX IS IN THE RESOLVER, NOT HERE
-- ------------------------------------
-- lib/tenant.js now calls tenant_has_active_subscription() over RPC after a
-- tenant resolves. The function is already SECURITY DEFINER, so it reads
-- subscriptions on the caller's behalf and hands back a bare boolean — no
-- billing data reaches the page, and no RLS policy was touched to allow it.
--
-- WHY THE GRANT NEEDS WRITING DOWN
-- --------------------------------
-- anon ALREADY holds EXECUTE. Verified on the live database:
--
--   proacl = {=X/postgres,postgres=X/postgres,anon=X/postgres,
--             authenticated=X/postgres,service_role=X/postgres}
--
-- It arrived via Supabase's default privileges on the public schema, not from
-- anything section H wrote — section H granted only to `authenticated`. So the
-- public site now depends on a permission nobody in this repository ever asked
-- for, and a future `revoke execute on all functions in schema public from anon`
-- would take every client portfolio down with no obvious cause.
--
-- Restating it makes the dependency survive that. Re-running is a no-op.
--
-- NO SWEEP, NO CRON, NO COLUMN
-- ----------------------------
-- Deliberately absent. Entitlement is evaluated live at page load, so a
-- cancelled subscription stops serving the moment current_period_end passes and
-- there is no row to go stale. It also means billing STILL never writes
-- tenants.status — an operator's manual suspension is theirs alone, in both
-- directions, exactly as billing-webhook's activation branch already assumes.

begin;

grant execute on function public.tenant_has_active_subscription(uuid) to anon;

comment on function public.tenant_has_active_subscription(uuid) is
  'THE entitlement authority. pending/expired and lapsed grace are all false. Fails closed. Granted to anon because lib/tenant.js gates public site rendering on it — it returns a bare boolean and exposes no billing data.';

commit;

-- ============================================================================
-- VERIFY (run after applying)
-- ============================================================================
-- 1. anon can execute it, and still cannot read the table behind it.
--
-- select has_function_privilege('anon',
--          'public.tenant_has_active_subscription(uuid)', 'EXECUTE') as anon_execute;
--   -- expect true.
--
-- set local role anon;
-- select count(*) from public.subscriptions;
--   -- expect 0 rows visible: the RLS on subscriptions is untouched, and the
--   -- boolean is the ONLY thing the public site can learn.
-- reset role;
--
-- 2. The answer the resolver will act on, per tenant.
--
-- select t.slug, t.status as operator_status, s.status as sub_status,
--        public.tenant_has_active_subscription(t.id) as entitled,
--        (t.status <> 'disabled'
--         and public.tenant_has_active_subscription(t.id)) as site_should_render
--   from public.tenants t left join public.subscriptions s on s.tenant_id = t.id
--  order by site_should_render, t.slug;
--   -- the two gates are independent and BOTH must pass. A disabled tenant that
--   -- is paid up stays dark; an entitled tenant that the operator switched off
--   -- stays dark. Nothing here writes either column.
