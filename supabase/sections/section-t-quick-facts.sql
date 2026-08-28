-- SECTION T — the three quick facts (2026-08-28)
--
-- WHAT THIS REPLACES. profile.stats was an array of free-text {value,label}
-- pairs, three per portfolio. Every client who filled it in used one of the
-- three slots to say whether they were available for work -- by hand, with
-- nothing to expire it. One had been advertising "no" for months.
--
-- So the three slots stop being free text and become three real facts:
--
--   rating        chosen from a list in the editor, never typed
--   client_count  a number, with no label field beside it
--   hours         working days and a range; availability is DERIVED from it
--                 at read time and therefore cannot go stale
--
-- ADDITIVE AND REVERSIBLE. Three nullable columns. No existing column is
-- dropped, renamed or rewritten, and no row is touched. profile.stats,
-- profile.availability, profile.banners and profile.top_ticker all stay exactly
-- as they are -- the public page has stopped rendering them, but the data is
-- still there and a `drop column` is a separate decision for a later day, once
-- every client has moved across.
--
-- ROLLBACK is the three matching `alter table public.profile drop column`
-- statements. Nothing else has to be undone.

alter table public.profile
  add column if not exists rating       numeric(2,1),
  add column if not exists client_count integer,
  add column if not exists hours        jsonb;

-- Guards, so a bad write cannot reach the portfolio. The editor already
-- constrains both, but the editor is not the boundary -- these are.
alter table public.profile
  drop constraint if exists profile_rating_range;
alter table public.profile
  add constraint profile_rating_range
  check (rating is null or (rating >= 0 and rating <= 5));

alter table public.profile
  drop constraint if exists profile_client_count_range;
alter table public.profile
  add constraint profile_client_count_range
  check (client_count is null or (client_count >= 0 and client_count <= 999999));

comment on column public.profile.rating       is 'Client-chosen rating 0.0-5.0, shown beside a star. Not visitor-submitted.';
comment on column public.profile.client_count is 'Client-entered count, shown beside a person mark. No label.';
comment on column public.profile.hours        is '{enabled, days:[0=Sun..6], from:"HH:MM", to:"HH:MM"} in Asia/Riyadh. Availability is derived from this.';

-- ---------------------------------------------------------------------------
-- FREE ACCESS THAT RUNS OUT
-- ---------------------------------------------------------------------------
--
-- Free access is now normally granted for a fixed stretch (30 days, renewable)
-- rather than forever. lib/billing-status.js was taught to read the date; this
-- teaches the DATABASE the same rule, and without this half the change is
-- decorative.
--
-- THE BUG THIS CLOSES. tenant_has_active_subscription() is what
-- get_public_portfolio() calls, and it is therefore the actual paywall — the
-- app's opinion is not the boundary. It matched `s.status = 'comped'` with no
-- date test at all. A grant that had run out would still have served the
-- portfolio: the client's own billing screen would say expired while their
-- public site stayed up, and only the screen would be telling the truth.
--
-- THE RULE, identical in both places:
--   current_period_end IS NULL  ->  permanent. This is what all seven live
--                                   clients carry, so none of them move.
--   current_period_end SET      ->  a deadline, and access stops at it.
--
-- "Forever" in the console clears the date. It never sets a far-future one --
-- a date in 2099 is a decision nobody remembers making, and it reads as an
-- expiry to every query that looks at it.

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
       -- NULL-safe on purpose: comps carry environment IS NULL and must keep
       -- their access. `= 'live'` would revoke all seven of them.
       and s.environment is distinct from 'sandbox'
       and (
            (s.status = 'comped'
             and (s.current_period_end is null or s.current_period_end > now()))
         or (s.status in ('active','trialing')
             and (s.current_period_end is null or s.current_period_end > now()))
         or (s.status = 'past_due' and s.grace_ends_at is not null and s.grace_ends_at > now())
         or (s.status = 'canceled'
             and s.current_period_end is not null and s.current_period_end > now())
       )
  );
$function$;

-- Proof it is safe to apply, runnable before and after:
--   select count(*) from subscriptions
--    where status = 'comped' and current_period_end is not null;
-- Expected: 0. If it is not 0, some client is about to lose access and you
-- should know which one before running this.


-- NOTE: the published snapshot must also learn about these three columns, or
-- they work in the editor's preview (which reads the draft) and do nothing at
-- all on the live site. That change lives in section-v, which runs last —
-- publish_tenant() is replaced once there, naming every column from both
-- sections, rather than twice with the second overwriting the first.
