-- Section Z — editing your own draft stops requiring a subscription (2026-09-10)
--
-- THE PRODUCT RULE
-- ----------------
-- A customer may build their portfolio for free, and may not PUBLISH it until
-- they pay. Decided by the owner on 2026-09-10.
--
-- Before this, section-K's can_edit_tenant() governed both, so an unpaid
-- customer could open the editor and save nothing: pay-then-edit, where the
-- product wants explore-then-pay. In the new Studio that surfaced as a working
-- editor that rejected every keystroke.
--
-- WHY THIS IS NOT A ONE-WORD CHANGE TO can_edit_tenant()
-- -----------------------------------------------------
-- That predicate is read in FOUR places:
--
--     profile         write policy
--     projects        write policy
--     tenant_domains  write policy
--     publish_tenant()   -- inside the function body
--
-- Relaxing it in place would have made PUBLISHING free as well, removing the
-- paywall entirely while looking like it implemented it. Two different ideas
-- were sharing one name, so they are given two names.
--
--   can_draft_tenant()  may I change my own DRAFT?     membership only
--   can_edit_tenant()   may I make it PUBLIC, or hang
--                       a domain on it?                membership + paying
--
-- WHAT MOVES: profile and projects. Those are the draft.
--
-- WHAT DOES NOT: publish_tenant() keeps can_edit_tenant(), so the paywall is
-- exactly where it was. tenant_domains keeps it too — a custom domain is a paid
-- feature, and it could not resolve for an unpublished portfolio anyway.
--
-- BLAST RADIUS ON THE DAY: none. All seven tenants were comped and entitled, so
-- every one already satisfied both predicates. This only opens editing for
-- signups that have not paid.
--
-- NOT WIDENED IN ANY OTHER DIRECTION. is_tenant_admin() is still the membership
-- test, so a customer still reaches exactly their own workspaces. Tenant
-- isolation is untouched, and anon gained nothing.
--
-- VERIFICATION (run after applying; all four held on 2026-09-10)
--   select qual from pg_policies where tablename='profile'  and cmd='ALL';
--     -> can_draft_tenant(tenant_id)
--   select qual from pg_policies where tablename='projects' and cmd='ALL';
--     -> can_draft_tenant(tenant_id)
--   select qual from pg_policies where tablename='tenant_domains' and cmd='ALL';
--     -> can_edit_tenant(tenant_id)          -- unchanged
--   select pg_get_functiondef(oid) like '%can_edit_tenant%'
--     from pg_proc where proname='publish_tenant';   -> true, paywall intact
--
-- ROLLBACK
--   alter policy "Tenant admins write profile"  on public.profile
--     using (public.can_edit_tenant(tenant_id)) with check (public.can_edit_tenant(tenant_id));
--   alter policy "Tenant admins write projects" on public.projects
--     using (public.can_edit_tenant(tenant_id)) with check (public.can_edit_tenant(tenant_id));
--   Nothing else changed and no row was written.

create or replace function public.can_draft_tenant(tid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_platform_owner()
      or public.is_tenant_admin(tid);
$function$;

comment on function public.can_draft_tenant(uuid) is
  'Write authority for a tenant''s DRAFT (profile, projects): owner, OR a tenant admin -- no subscription required. Publishing is can_edit_tenant(), which does require one. Fails closed.';

revoke all on function public.can_draft_tenant(uuid) from public, anon;
grant execute on function public.can_draft_tenant(uuid) to authenticated;

-- USING and WITH CHECK both, or an unpaid admin could UPDATE but not INSERT --
-- WITH CHECK governs new rows, USING governs existing ones, and an UPDATE needs
-- both. Same pairing section-K established.
alter policy "Tenant admins write profile" on public.profile
  using (public.can_draft_tenant(tenant_id))
  with check (public.can_draft_tenant(tenant_id));

alter policy "Tenant admins write projects" on public.projects
  using (public.can_draft_tenant(tenant_id))
  with check (public.can_draft_tenant(tenant_id));
