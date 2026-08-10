# Orphan login baseline — 2026-08-09T23:12:50Z

Captured **before** any production cleanup deletion. This is the control set for
the workspace-deletion cleanup: after each deletion, re-running the query below
must return **exactly these six rows**. Anything new in the result is an account
whose `release_account` call silently failed, and is a reason to stop.

Project `gphrzvjlstznhypcfgre`. Tenants at capture time: 21. Auth users: 22.

## The query

```sql
select u.id, u.email, u.created_at, u.last_sign_in_at,
       (select au.username from admin_usernames au where au.user_id = u.id) as username
from auth.users u
where (select count(*) from tenant_admins ta where ta.user_id = u.id) = 0
  and not exists (select 1 from platform_owners p where p.user_id = u.id)
  and u.email not like '%@released.invalid'
order by u.created_at;
```

Reads: an account belonging to no workspace, that is not a platform owner, and
whose address has not already been parked by a previous release.

## Result — 6 rows

| # | user_id | email | username | created | last sign-in |
|---|---------|-------|----------|---------|--------------|
| 1 | `0ef70915-5c95-4a39-a18b-4781fe500a37` | babdallhfysl6@gmail.com | faisalofficialtest | 2026-07-26 21:15:39Z | never |
| 2 | `743ac93e-635c-474f-a847-0eabab431e3b` | smsomh8899@gmail.com | faislatestv2 | 2026-07-26 21:17:43Z | never |
| 3 | `749f9805-8918-487c-9911-bcfb76fd8278` | **izoiswild@gmail.com** | zed | 2026-07-27 00:23:56Z | 2026-07-29 15:36:33Z |
| 4 | `5b998bb9-25cf-4790-8ddb-3d079ef44d10` | froosii.minecraft@gmail.com | ferastest | 2026-07-27 01:27:55Z | 2026-07-27 01:29:13Z |
| 5 | `bfaa7929-a7f7-436e-b44f-ace917907c86` | spofhsodhfdsoih@gmail.com | faisaltest123 | 2026-08-03 02:38:55Z | never |
| 6 | `512bc331-92e3-4091-9b82-37c080afb9be` | signup-test@designakum.site | *(none)* | 2026-08-06 18:23:31Z | never |

Row 3 is **the operator's own address** — it predates this cleanup and is not
part of it. It must not be released.

None of these six is holding an address that any pending deletion needs back, so
none is a prerequisite for the cleanup. They are here as a control, not a
to-do list; Phase 5 decides what happens to them separately.

## How to use this

After a deletion, run the same query. Expected: the same six rows, unchanged.

- **6 rows, identical** — every stranded login released correctly.
- **7+ rows** — the new row is an account that lost its workspace and kept its
  email. Its release failed. STOP; do not delete anything further, and do not
  re-invoke `release_account` blindly (a second call on an already-parked
  account overwrites `released_email` with the parked address and destroys the
  original).
- **Fewer than 6** — something released one of these. Not expected from a
  deletion; investigate before continuing.
