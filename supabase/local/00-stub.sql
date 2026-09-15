-- Enough of the live schema to test a new section against, on a laptop.
--
-- NOT the schema and never applied to Supabase. supabase/SCHEMA.sql is 459
-- lines of prose out of 493 -- it documents the database rather than being able
-- to create one -- so until now there was no way to try a change anywhere but
-- production. This is the smallest stub that lets a section be proved wrong
-- before seven live clients meet it.
create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text,
  default_lang text default 'ar',
  status text default 'active',
  created_at timestamptz default now(),
  published_snapshot jsonb,
  published_at timestamptz
);

-- Enough of the auth and permission surface for Section AB to be tried locally.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function can_edit_tenant(tid uuid) returns boolean language sql stable as $$ select true $$;
