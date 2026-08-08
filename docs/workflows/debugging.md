# Workflow — debugging

---

## The order

**1. Reproduce it.** Before reading any code. A surprising number of reported
failures in this project turned out to be correct behaviour observed at the wrong
moment. If you cannot reproduce it, say so and find out what the reporter
actually saw — do not start fixing.

**2. Identify the system**, then read only its document:

| Symptom | System | Read |
|---|---|---|
| cannot sign in, wrong password, "set a password" loop | auth | [architecture/auth.md](../architecture/auth.md) |
| no email arrived, or arrived in the wrong language | email | [architecture/emails.md](../architecture/emails.md) |
| payment, renewal, cancel, refund, plan, price | billing | [architecture/billing.md](../architecture/billing.md) |
| a save reports success but nothing changed | RLS | [architecture/database.md](../architecture/database.md) |
| wrong site served, 404, custom domain | tenant resolver | [architecture/overview.md](../architecture/overview.md) |
| unstyled form controls, broken-looking admin | `admin.js` | [architecture/overview.md §4](../architecture/overview.md) |

**3. Inspect the relevant files.** The document names them. Read the code before
theorising.

**4. Check the logs — the right ones.**

| Surface | Where |
|---|---|
| Edge Functions | Supabase → Edge Functions → Logs |
| Webhooks | the `billing_events` table — every event ever received, verbatim, with `error` |
| Postgres | Supabase → Logs |
| Frontend | Vercel → Logs, plus the browser console |

**5. Test.** `npm test`, plus a real end-to-end pass for anything touching React,
network or mail.

**6. Deploy carefully.** [deployment.md](deployment.md). One surface at a time.

---

## Check these first — they account for most of it

**Mail not arriving → `RESEND_API_KEY`.** Every mail path logs the failure and
returns success on purpose, so an anonymous caller cannot learn which addresses
have accounts. **A missing key looks exactly like working software from the
outside.** Check the function logs before suspecting anything else.

**A save that reports "Saved" but changes nothing → RLS.** PostgREST reports
success having changed zero rows. An RLS-filtered write is **not** an error. Any
write helper that does not inspect affected rows will lie to the user.

**"Their password stopped working" → an operator action, not a bug.** Both
`reset-client-password` and `client-recovery → send_welcome` generate a *new*
password and invalidate the old one. `send_welcome` does not warn before doing
it.

**"Asked to set a password again" → check localStorage before the database.**

```js
localStorage.getItem('admin_must_set_password')
```

A stale `'1'` there makes the gate fire regardless of what the account says.

**Every webhook 401s → `PAYPAL_WEBHOOK_ID`** missing, or from the other
environment.

**Checkout dead-ends → the customer was sent to `/subscribe` directly.** It is
not a public page. They need `/signup`.

---

## Traps that have already cost time

- **`supabase/history/` contains scripts that are actively WRONG for this
  database**, most dangerously a single-tenant `CHECK (id = 1)` constraint that
  multi-tenancy required removing. Copying a table definition out of one silently
  reintroduces single-tenant assumptions.

- **Supabase invite and recovery links are single-use and cannot be made
  otherwise.** Shortening the expiry does not change it. A "link already used"
  arrival comes back as `#error=...` with no token and no `type=`, which is why
  it must be detected explicitly — otherwise the user lands on a bare sign-in
  form being asked for a password they never set. (Password reset no longer uses
  these; invites still do.)

- **`user_metadata` writes must spread the existing object.** A replace clears
  `must_set_password` and silently drops the password gate.

- **The browser preview pane can return a STALE DOM after navigation.**
  Screenshots and JS probes may disagree with reality. Re-run the probe or reload
  before concluding a change did not work.

- **An empty profile is not a missing profile.** A new workspace legitimately has
  a profile row containing nothing.

---

## Verifying RLS without writing anything

Use a rolled-back transaction that sets `request.jwt.claims` to a specific user
and `set local role authenticated`. That exercises the real policies against real
data and leaves nothing behind.

---

## Before you conclude it is a data problem

**Audit the mappings** — `auth.users`, `profile`, `tenant_admins`,
`admin_usernames` — rather than assuming. At the last audit: 0 duplicate emails,
0 duplicate usernames, 0 orphaned usernames, 0 orphaned profiles. **No mapping
defect is causing login failures. Do not go looking for one.**
