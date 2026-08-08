# Workflow — deployment

Three deployable surfaces, three different mechanisms. They are **not** deployed
together, and the order matters.

---

## The order

**SQL first, then functions, then frontend.** Each step must be safe to run
before the one after it exists — otherwise a deploy window is a broken product.

---

## 1. SQL

There is no migration runner. Migrations are applied by hand.

1. Write a new file in `supabase/sections/`.
2. Make it **idempotent** — `create table if not exists`, `create index if not
   exists`, `create or replace`, guarded drops — and put a **VERIFY block at the
   bottom** that proves the objects exist.
3. Apply it in the Supabase SQL editor, on `gphrzvjlstznhypcfgre`.
4. **Run the VERIFY block.** Do not assume it applied.
5. Update `supabase/SCHEMA.sql` so it still describes reality.

Apply it **before** pushing the code that depends on it.

**Never run anything in `supabase/history/`.** Superseded, and some of it is
actively wrong for this database.

---

## 2. Edge Functions

```bash
# JWT-gated (the default)
supabase functions deploy invite-client
supabase functions deploy reset-client-password
supabase functions deploy client-recovery
supabase functions deploy signup-start
supabase functions deploy signup-verify
supabase functions deploy billing-subscription
supabase functions deploy billing-plans-sync

# NOT JWT-gated — each authenticates itself; see the file headers
supabase functions deploy billing-checkout          --no-verify-jwt
supabase functions deploy billing-webhook           --no-verify-jwt
supabase functions deploy request-password-reset    --no-verify-jwt
supabase functions deploy complete-password-reset   --no-verify-jwt
```

`--no-verify-jwt` on those is **required and is not a weakening**:

- `billing-checkout` serves an owner's payment link, whose recipient has no
  session. It verifies a signed grant or a real JWT itself.
- `billing-webhook` is called by PayPal, which has no Supabase token. It verifies
  PayPal's signature.
- the two password-reset functions are used by people who by definition cannot
  sign in. They verify their own single-use token.

**Deploying one of these *with* the gateway check is a quiet failure** — payment
links or reset links simply stop working, with nothing in the app logs. It is
written at the top of each file for that reason.

**A function that needs a secret fails closed.** Set secrets before deploying, or
in the same window.

If you have no Supabase CLI credentials in the environment, deploy via the
Supabase MCP tools using the `source/` + `_shared/` layout, with
`verify_jwt: false` where the list above says so.

---

## 3. Frontend

Vercel, from `main`. A push redeploys within about a minute.

Environment variables live in Vercel → Settings → Environment Variables. A change
there needs a **redeploy** to take effect — setting a variable does not update a
running deployment.

Anything `NEXT_PUBLIC_*` **is shipped to the browser.** Never put a secret behind
that prefix.

---

## 4. Safety rules

- **One surface at a time**, and verify each before starting the next.
- **Never deploy platform code to the marketing project**, or marketing code
  here. Different owner accounts, different Supabase projects, different hosts.
- **Never point this app at the marketing Supabase project**, or at
  `jswxevbghmbqumlccpfy` (the finance app).
- **Sandbox credentials never go into production secrets, and live credentials
  never go into local `.env`.**
- After any billing deploy, check `billing_events` for rows with `error` set.
- After any auth or mail deploy, run one real end-to-end pass — a signup, or a
  password reset to a mailbox you control. Mail failures are **deliberately
  silent** (see [architecture/emails.md](../architecture/emails.md)), so a broken
  mail path looks exactly like a working one from the outside.

---

## 5. Going live with billing

The full checklist is in
[architecture/billing.md §9](../architecture/billing.md#9-going-live). In short:
a live PayPal app, new secrets, `PAYPAL_ENV=live`, re-run `billing-plans-sync`
(live plan ids differ), restrict `BILLING_RETURN_HOSTS` to production, rotate
`BILLING_GRANT_SECRET`, then run test-matrix rows 1, 8 and 11 against live with a
real card and refund yourself.
