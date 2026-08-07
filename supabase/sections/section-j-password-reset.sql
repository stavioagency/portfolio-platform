-- ############################################################################
-- SECTION J — our own password reset, off Supabase's mailer
-- ############################################################################
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ APPLIED to gphrzvjlstznhypcfgre, 2026-08-08, alongside the deploy of     │
-- │ request-password-reset / complete-password-reset — both functions fail   │
-- │ closed without this table.                                               │
-- │                                                                          │
-- │ Every statement is idempotent (create table / index if not exists, and   │
-- │ a repeatable enable + revoke), so re-running it is safe. Do that rather  │
-- │ than assume: run the VERIFY block at the bottom of this file to confirm  │
-- │ the table, its RLS state, and both indexes are actually present.         │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- WHY THIS EXISTS
-- ---------------
-- HANDOFF §7, finding 2: across 14 users, `confirmation_sent_at` is null for
-- ALL of them and `recovery_sent_at` is set for 2. Supabase's built-in mailer
-- has effectively never delivered on this project, so "forgot password" has
-- been a dead button — the customer clicks it, nothing arrives, and they
-- conclude their password broke. Signup verification already routes around this
-- through Resend (§7c); this is the same move for recovery.
--
-- WHY A TABLE RATHER THAN A SIGNED TOKEN
-- --------------------------------------
-- The signup link uses `_shared/signup-token.ts`: an HMAC token with the expiry
-- inside the signature and no server-side state. That is right for email
-- CONFIRMATION, which is idempotent — confirming an already-confirmed address
-- is a no-op, so a reusable token costs nothing and survives the mail-scanner
-- pre-fetch problem in §9.
--
-- A password reset is not idempotent. Whoever holds the link can set the
-- password, so it has to be revocable and single-use, and "used" is state that
-- a stateless token cannot carry. Hence a row per token.
--
-- THE PRE-FETCH PROBLEM DOES NOT APPLY HERE, which is what makes single-use
-- safe. A mail scanner GETs the URL; /reset-password only renders a form on
-- GET and touches nothing. The token is spent by the POST that
-- complete-password-reset receives when a human submits the form. A scanner
-- that fetched the page never burns the link.
--
-- WHY THE HASH AND NOT THE TOKEN
-- ------------------------------
-- This table is readable by anything holding the service role, and it ends up
-- in backups and in any dump taken for debugging. Storing raw tokens would make
-- every one of those an account-takeover artefact for 30 minutes. SHA-256 is
-- the right primitive here rather than bcrypt/argon: the input is 32 bytes of
-- CSPRNG output, so there is no dictionary to attack and nothing for a slow KDF
-- to buy.

begin;

create table if not exists public.password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- SHA-256 of the raw token, lowercase hex. 64 chars, fixed.
  token_hash text not null,
  expires_at timestamptz not null,
  -- NULL = still spendable. Set the moment it is claimed, which is also how a
  -- superseded token is retired when a newer one is issued.
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.password_reset_tokens is
  'Single-use password-reset tokens for the Resend-based recovery flow (request-password-reset / complete-password-reset). Rows hold the SHA-256 hash only — the raw token exists solely in the emailed URL. Service-role only; RLS is on with no policies deliberately.';
comment on column public.password_reset_tokens.token_hash is
  'SHA-256 of the raw token, lowercase hex. NEVER the token itself.';
comment on column public.password_reset_tokens.used_at is
  'When the token was claimed. Set by the atomic claim in complete-password-reset, and also set on older tokens when a new one is issued, so only the newest link works.';

-- The lookup complete-password-reset does on every submission. Unique as well
-- as indexed: two rows with the same hash would be two live links, and while a
-- collision is not reachable with 32 random bytes, a bug that reused a hash
-- would be. Cheaper to make it unrepresentable.
create unique index if not exists password_reset_tokens_token_hash_idx
  on public.password_reset_tokens (token_hash);

-- Serves both the per-user rate limit and the "retire the previous ones" write
-- in request-password-reset. created_at desc because both read newest-first.
create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id, created_at desc);

-- ============================================================================
-- RLS: ON, WITH NO POLICIES. That is not an oversight.
-- ============================================================================
-- No client role has any business reading this table, and with RLS enabled and
-- zero policies, `anon` and `authenticated` see nothing at all. The two Edge
-- Functions use the service role, which bypasses RLS. Enabling it also keeps
-- the Supabase security advisor quiet about a public-schema table with none —
-- a finding that would otherwise sit in the report forever.
alter table public.password_reset_tokens enable row level security;

-- Belt and braces: the service role bypasses RLS anyway, but an explicit revoke
-- means a future `grant ... on all tables in schema public` cannot quietly hand
-- this to PostgREST's anon role.
revoke all on public.password_reset_tokens from anon, authenticated;

commit;

-- ============================================================================
-- HOUSEKEEPING (optional, not scheduled)
-- ============================================================================
-- Rows are tiny and expire in 30 minutes, so this is not urgent, but nothing
-- deletes them either. If the table is ever worth pruning:
--
--   delete from public.password_reset_tokens
--    where created_at < now() - interval '30 days';
--
-- Deliberately NOT a trigger or a cron job: an expired row is harmless (both
-- the expiry and the used flag are checked on every claim), and a background
-- job that deletes auth-adjacent rows is a thing that can go wrong at 3am for
-- no benefit.

-- ============================================================================
-- VERIFY (run after applying)
-- ============================================================================
-- select count(*) from public.password_reset_tokens;
--   -- expect 0.
--
-- select relrowsecurity from pg_class where oid = 'public.password_reset_tokens'::regclass;
--   -- expect t.
--
-- select count(*) from pg_policies
--  where schemaname = 'public' and tablename = 'password_reset_tokens';
--   -- expect 0 — on purpose. See the note above.
--
-- select indexname from pg_indexes
--  where schemaname = 'public' and tablename = 'password_reset_tokens';
--   -- expect the primary key plus password_reset_tokens_token_hash_idx
--   -- and password_reset_tokens_user_id_idx.
