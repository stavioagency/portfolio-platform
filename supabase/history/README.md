# supabase/history — superseded SQL. DO NOT RUN ANY OF THIS.

These scripts describe states the database used to be in. They are kept because
they explain how it got here, and because a couple of them are the only written
record of decisions that are otherwise invisible. Running any of them against
production would at best do nothing and at worst undo the multi-tenant migration.

**For what the database is NOW, read `../SCHEMA.sql`.**
**To CHANGE it, add a new file to `../sections/` and apply that.**

| file | what it was |
|---|---|
| `supabase-setup.sql` | the original single-tenant schema, one hardcoded profile |
| `supabase-complete.sql` | that schema grown over time — still single-tenant, still assumes `profile.id = 1` |
| `supabase-multitenant.sql` | the first multi-tenant plan, written before any of it was applied. Section A/B of it landed; the rest was superseded by `sections/section-c…f` |
| `rehearsal/*` | scratch scripts used to dry-run the migration on a throwaway project. Never applied to production, and named for a project that no longer exists |

## Why this folder exists

There were eleven `.sql` files across four directories, totalling roughly 2,300
lines, describing four different overlapping versions of the same database — with
no way to tell which one was true. `SCHEMA.sql` is now read back out of the live
database, so it cannot drift into fiction the way these did.

## The one real trap in here

`supabase-complete.sql` still contains `CONSTRAINT single_profile CHECK (id = 1)`.
That constraint is **gone** from the live database — it had to go for multi-tenancy
to work at all. If you ever copy a table definition out of these files, you will
reintroduce single-tenant assumptions that took a long time to remove.
