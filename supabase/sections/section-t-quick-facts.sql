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
