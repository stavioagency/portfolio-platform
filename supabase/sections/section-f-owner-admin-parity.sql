-- ############################################################################
-- SECTION F — platform-owner parity across every workspace
-- ############################################################################
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ APPLIED + VERIFIED IN PRODUCTION 2026-07-26 (gphrzvjlstznhypcfgre):       │
-- │   ✅ F1 is_tenant_admin recognises platform owners                        │
-- │   ✅ F2 admin_usernames SELECT policy                                     │
-- │   ✅ F3 trigger + backfill (tenant_admins 5 -> 7 rows)                    │
-- │   ✅ F4 assign_tenant_admin(uuid, text, text), anon/PUBLIC revoked        │
-- │                                                                          │
-- │ Verified: as f9f9 (a platform owner), is_tenant_admin() returns TRUE for  │
-- │ a tenant uuid that does not exist — no membership row can match, so that  │
-- │ is the owner branch. Both owners now hold 'owner' on all three tenants;   │
-- │ the client row (fghj on f9designer) was left untouched. Trigger re-tested │
-- │ after the F3 revoke below: a probe insert auto-enrolled both owners.      │
-- │ Advisor confirms the admin_usernames and assign_tenant_admin warnings     │
-- │ have cleared.                                                            │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- The problem this fixes
-- ---------------------
-- `is_tenant_admin(tid)` tested tenant_admins membership ONLY. Every write policy
-- on profile / projects / tenant_domains is gated on it. But the admin's workspace
-- dropdown is sourced from `tenants`, which carries a PUBLIC read policy — so both
-- platform owners saw all three workspaces while only one of them held membership
-- rows for all three.
--
-- Observed in production 2026-07-26:
--   designakum (stavio.agency@gmail.com)  owner  -> membership on all 3 workspaces
--   f9f9       (ffaab44553@gmail.com)     owner  -> membership on f9designer ONLY
--
-- So f9f9 could select "Designakum (official)", edit it, and save — and the UPDATE
-- matched zero rows under RLS. PostgREST reports no error for a zero-row update, so
-- the admin said "Saved" and the work was gone on reload. That is the whole
-- "I can't see what my partner can see / everything is cooked" symptom.
--
-- The frontend half of this fix (persistProfile checking affected rows) makes such a
-- write fail LOUDLY. This file makes it stop happening at all.
-- ############################################################################


-- ── F1 ── A platform owner administers EVERY workspace ──────────────────────
-- Platform owners are the operators of the platform, not tenants of it. They
-- already bypass storage isolation the same way (see can_write_media in
-- section-e), so this makes the table policies agree with the storage policies.
create or replace function public.is_tenant_admin(tid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.is_platform_owner()
      or exists (select 1 from tenant_admins where user_id = auth.uid() and tenant_id = tid);
$function$;


-- ── F2 ── admin_usernames was readable by nobody ────────────────────────────
-- RLS was enabled on the table with NO policy attached, so every browser read
-- returned empty and the signed-in username never rendered (admin.js:1047, :3194).
-- Login itself was unaffected — it goes through get_email_for_username, which is
-- SECURITY DEFINER. Own-row only: the username -> email mapping is exactly what
-- section 8 of HANDOFF.md already flags as leaking via get_email_for_username, so
-- this policy must not widen it.
drop policy if exists "Read own username" on public.admin_usernames;
create policy "Read own username" on public.admin_usernames
  for select to authenticated
  using (user_id = auth.uid());


-- ── F3 ── Every platform owner is enrolled on every workspace ───────────────
-- createTenant could only ever enrol its own creator, which is what produced the
-- asymmetry above. The browser cannot fix this itself: platform_owners is readable
-- only for your OWN row, so the co-owner list is invisible client-side. Hence a
-- trigger rather than application code.
create or replace function public.enroll_platform_owners()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into tenant_admins (tenant_id, user_id, role)
  select new.id, po.user_id, 'owner' from platform_owners po
  on conflict (tenant_id, user_id) do nothing;
  return new;
end; $function$;

drop trigger if exists trg_enroll_platform_owners on public.tenants;
create trigger trg_enroll_platform_owners
  after insert on public.tenants
  for each row execute function public.enroll_platform_owners();

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which exposed this trigger
-- function at /rest/v1/rpc/enroll_platform_owners. Calling it directly errors
-- ("can only be called as a trigger"), so it was noise rather than a hole, but it
-- should not be reachable at all. PostgreSQL checks EXECUTE on a trigger function
-- when the TRIGGER IS CREATED, not each time it fires, so the trigger still works
-- — re-verified with a rolled-back probe insert after applying this.
revoke all on function public.enroll_platform_owners() from public;
revoke all on function public.enroll_platform_owners() from anon;
revoke all on function public.enroll_platform_owners() from authenticated;

-- Backfill the workspaces that predate the trigger. DO NOTHING leaves every
-- existing row untouched, including client-role rows (fghj on f9designer).
insert into tenant_admins (tenant_id, user_id, role)
select t.id, po.user_id, 'owner'
from tenants t cross join platform_owners po
on conflict (tenant_id, user_id) do nothing;


-- ── F4 ── assign_tenant_admin can record a role, and can correct one ────────
-- The old version hardcoded role 'client' with ON CONFLICT DO NOTHING, so the role
-- could never be chosen and re-assigning an existing user silently did nothing.
--
-- BE PRECISE ABOUT WHAT ROLE MEANS TODAY: tenant_admins.role is descriptive. No
-- policy or helper reads it — is_tenant_admin() and can_write_media() both test
-- membership only — so 'owner' and 'client' confer identical access to that one
-- workspace. Administering EVERY workspace comes from platform_owners (F1), which
-- is intentionally not settable from the browser. If role should ever gate
-- anything, that is a separate change and the helpers must be updated with it.
-- Dropped and recreated
-- because a new defaulted parameter would otherwise be ambiguous against the
-- existing 2-arg signature. Existing 2-arg callers (the invite-client Edge
-- Function) keep working and still grant 'client'.
drop function if exists public.assign_tenant_admin(uuid, text);

create function public.assign_tenant_admin(p_tenant_id uuid, p_username text, p_role text default 'client')
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_user uuid;
begin
  if not is_platform_owner() then raise exception 'only a platform owner can assign tenant admins'; end if;
  if p_role not in ('client', 'owner') then raise exception 'role must be client or owner'; end if;
  select user_id into v_user from admin_usernames where username = p_username;
  if v_user is null then raise exception 'no user with that username'; end if;
  insert into tenant_admins (tenant_id, user_id, role) values (p_tenant_id, v_user, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;
end; $function$;

-- Recreating a function resets its grants, and PostgreSQL grants EXECUTE to PUBLIC
-- by default — which is the "anon can execute SECURITY DEFINER" advisor warning.
-- This function is owner-only by design, so authenticated is enough.
revoke all on function public.assign_tenant_admin(uuid, text, text) from public;
revoke all on function public.assign_tenant_admin(uuid, text, text) from anon;
grant execute on function public.assign_tenant_admin(uuid, text, text) to authenticated;


-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- Expect: every platform owner holds an 'owner' row on every tenant.
--
--   select t.slug, au.username, ta.role
--   from tenants t
--   join tenant_admins ta on ta.tenant_id = t.id
--   left join admin_usernames au on au.user_id = ta.user_id
--   order by t.slug, ta.role;
--
-- Then sign in as the co-owner, switch to a workspace they did NOT create, save a
-- change, and reload to confirm it persisted.
