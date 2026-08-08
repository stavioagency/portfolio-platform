# Environment — Platform (this repo)

The customer-facing SaaS: accounts, auth, signup, dashboards, billing, PayPal,
subscriptions, onboarding, password reset and email.

---

## Ownership

| | |
|---|---|
| Owner account | `izoiswild@gmail.com` |
| Repository | `https://github.com/stavioagency/portfolio-platform.git` |
| Supabase | **`gphrzvjlstznhypcfgre`**, region ap-northeast-1 |
| Hosting | Vercel, production |
| Working branch | `main` — work happens directly on it |

Everything in this repository belongs to this environment. Nothing else does.

---

## Secrets — where each one lives

Three separate stores. Putting a value in the wrong one is either a leak or a
silent no-op.

| Store | Holds | Notes |
|---|---|---|
| **`.env.local`** (gitignored) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local dev only. Placeholders are enough to build or run tests |
| **Vercel → Settings → Environment Variables** | the two `NEXT_PUBLIC_SUPABASE_*` values, plus optional `NEXT_PUBLIC_BILLING_CURRENCY` and the four price overrides | anything `NEXT_PUBLIC_*` **is shipped to the browser**. Never put a secret behind that prefix |
| **Supabase → Project settings → Edge Functions → Secrets** | `PAYPAL_*`, `BILLING_GRANT_SECRET`, `BILLING_RETURN_HOSTS`, `RESEND_API_KEY`, `MAIL_FROM`, `SIGNUP_SITE_URL`, `SIGNUP_TOKEN_SECRET`, `ADMIN_URL` | server-side only. `supabase/functions/.env` is the **local** mirror (gitignored; copy `.env.example`) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into deployed functions automatically. **Do not add them to Supabase Secrets** —
it rejects the reserved `SUPABASE_` prefix.

**The `service_role` key bypasses RLS.** Edge Functions only, never in git, never
under `NEXT_PUBLIC_*`, never in client code.

Use **sandbox** PayPal credentials locally and **live** ones only in production
secrets. Never the other way round, and never both in one place.

---

## Deployment rules

- **Frontend** → Vercel, from `main`. See
  [workflows/deployment.md](../workflows/deployment.md).
- **Edge Functions** → `supabase functions deploy`. `billing-checkout`,
  `billing-webhook`, `request-password-reset` and `complete-password-reset` need
  `--no-verify-jwt`; they authenticate themselves.
- **SQL** → a new file in `supabase/sections/`, applied by hand, then
  `SCHEMA.sql` updated to match.
- **Never** deploy platform code to the marketing project, or vice versa.

---

## Other Supabase projects on this account

| Ref | What | Rule |
|---|---|---|
| `gphrzvjlstznhypcfgre` | **this platform** | the only one this repo touches |
| `jswxevbghmbqumlccpfy` | a personal finance app | **never touch it** |
| (marketing's own project) | the marketing site | see [marketing.md](marketing.md) |

---

## Known test artefacts in production

Deliberately preserved, and to be removed when the flows they prove are signed
off. Do not treat them as real data:

- tenant `zz-signup-live` and its user
- `signup-test@designakum.site` — unconfirmed, no workspace
- tenant `zz-billing-test`
- the hidden one-cent `test` plan in `lib/billing-plans.js`, plus its
  `provider_plans` row
- subscription `I-M65XW1E7MM82`
