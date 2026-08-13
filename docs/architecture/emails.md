# Architecture — email

**Every email this platform sends goes through Resend.** Supabase's own mailer is
not on any live path.

---

## 1. Why Resend and not Supabase

Supabase's built-in mailer has effectively never delivered on this project. The
audit is unambiguous: across 14 users, `confirmation_sent_at` was null for **all**
of them and `recovery_sent_at` was set for only 2. Every account was created by
`admin.createUser` with confirmation bypassed.

The consequence was invisible and expensive: "forgot password" was a dead button.
A customer clicked it, nothing arrived, and they concluded their password had
broken.

So both mail-dependent flows were moved off it — signup verification first, then
password reset. `resetPasswordForEmail` is gone from the codebase. See
[decisions/decisions.md](../decisions/decisions.md).

This is also why account creation is server-side: a browser `signUp()` would
trigger the mailer we are deliberately avoiding.

---

## 2. Who sends what

Four Edge Functions send mail. Nothing else does.

| Function | Email | Trigger |
|---|---|---|
| `invite-client` | credentials / welcome | owner adds a client |
| `client-recovery` (`send_welcome`) | credentials / welcome, re-sent | owner recovers an onboarding |
| `signup-start` | verification link, or "you already have an account" | public self-signup |
| `request-password-reset` | branded reset link | "forgot password" |

Supabase Auth templates still exist for completeness; see
`supabase/EMAIL-TEMPLATES.md`. The Reset Password template there is marked
**RETIRED** and kept only as a fallback.

---

## 3. Secrets

Set in `Supabase dashboard → Project settings → Edge Functions → Secrets`.
Locally, `supabase/functions/.env` (gitignored; copy `.env.example`).

| Secret | Notes |
|---|---|
| `RESEND_API_KEY` | needs send permission on the `MAIL_FROM` domain |
| `MAIL_FROM` | optional; must be a domain verified in Resend or every send is rejected. Defaults in code |
| `SIGNUP_SITE_URL` | the origin used to build **both** the signup verification link and the `/reset-password` link. Must be the site the customer actually opens or the link 404s. The name is historical — it is used by both mail paths, and renaming it would silently fall back to the default on every deployed function until the secret was re-set |
| `ADMIN_URL` | the admin origin, used in onboarding mail |
| `SIGNUP_TOKEN_SECRET` | signs the verification token. **Never** reuse `BILLING_GRANT_SECRET` — a leaked billing secret must not be able to verify email addresses |

> **`SIGNUP_TOKEN_SECRET` is read by the functions but is not listed in
> `supabase/functions/.env.example`.** Worth adding; until then, remember to set
> it locally by hand.

---

## 4. Failure behaviour — read this before debugging "no email arrived"

**A missing `RESEND_API_KEY` looks exactly like working software from the
outside.** Each mail path logs the failure and returns success.

That is deliberate, not sloppiness: a 500 from `request-password-reset` would
tell an anonymous caller which addresses have accounts. Silence is the price of
not leaking that.

It has a second, deeper form in onboarding. **In `invite-client` the email is the
LAST step.** Account, username and tenant mapping are all committed before any
send is attempted, and a send failure never fails the request. **Email is an
optimisation, not a dependency** — when it breaks, onboarding degrades to
copy-and-paste rather than stopping. Do not make any part of that flow
conditional on mail.

**So: if mail stops arriving, check `RESEND_API_KEY` in the Edge Function logs
FIRST**, before suspecting anything else. See
[workflows/debugging.md](../workflows/debugging.md).

**Then check that the code got as far as trying to send.** Reset mail was
missing for two weeks in Aug 2026 and the key was fine the whole time — the
function was deciding the account did not exist and returning before it reached
`sendMail`. Resend, the domain, and the secrets were all healthy; the user
lookup was broken (auth.md §7 item 4).

The distinguishing signal is in the logs and costs one query:

| Log line | Meaning |
|---|---|
| `RESEND_API_KEY unset` | secrets problem — the original hypothesis |
| `resend rejected <status>` | key or `MAIL_FROM` domain problem |
| `no account for that address` | **the lookup failed, not the mail** |
| `reset mail sent lang=…` | we sent it; the problem is downstream of us |

A second, sharper check for password reset specifically: **`password_reset_tokens`
should have a row for every request.** Zero rows means the function returned
before minting a token, which rules out every mail-side cause immediately. A
mail problem still writes the row.

---

## 4b. Full inventory — audited 2026-08-13

Every email this platform can send. Four functions, all Resend; **no live path
reaches Supabase's mailer** (the only mentions in the codebase are historical
comments explaining why it was abandoned).

| Email | Trigger | Provider | AR | EN | Branded | Status |
|---|---|---|---|---|---|---|
| Password reset | "Forgot password" | Resend | ✅ | ✅ | ✅ | **OK** |
| Credentials / welcome | owner "+ Add client" | Resend | ✅ | ✅ | ✅ | **OK** |
| Credentials re-send | owner `send_welcome` | Resend | ✅ | ✅ | ✅ | OK — but destructive, see auth.md §7.1 |
| Signup verification | public `/signup` | Resend | ✅ | ✅ | ❌ | **off-brand** |
| "You already have an account" | signup w/ confirmed email | Resend | ✅ | ✅ | ❌ | **off-brand** |
| Payment confirmed | — | — | — | — | — | **DOES NOT EXIST** |
| Payment failed | — | — | — | — | — | **DOES NOT EXIST** |
| Subscription cancelled | — | — | — | — | — | **DOES NOT EXIST** |
| Plan changed | — | — | — | — | — | **DOES NOT EXIST** |
| Renewal / receipt | — | — | — | — | — | **DOES NOT EXIST** |
| Admin/operator notifications | — | — | — | — | — | **DOES NOT EXIST** |

### Finding 1 — signup emails are off-brand (cosmetic, not broken)

`signup-start` renders its two emails with `background:#4f6ef2` and no card
layout. Every other email uses the brand blue `#2C6FE0` on `#0C1530` text with a
bordered credentials/CTA card. It also hardcodes two separate `dir="rtl"` /
LTR blocks instead of the `ar ? "rtl" : "ltr"` wrapper the other three share.

Both languages are present and correct, and RTL works — this is **branding
drift, not a defect**. It matters more than its size suggests because these are
the *first two emails a self-signup customer ever receives*, and they look
unlike everything that follows. Fix during the UX phase when templates are
being touched anyway; there is no reliability reason to touch it now.

### Finding 2 — signup uses URL language only, and that is CORRECT

`signup-start` resolves language from `body.lang` alone rather than `pickLang()`.
Not a bug: no account exists yet, so there is no `admin_lang`, no `lang` and no
tenant to read. The URL is the only signal available, which is exactly the rule
in §5. The other three all use the full chain.

### Finding 3 — there are NO billing emails at all

A customer pays and hears nothing. No confirmation, no receipt, no renewal
notice, no failed-payment warning, no cancellation confirmation. The billing
state machine is complete and the webhook knows about every one of these
events — `payment_succeeded`, `payment_failed`, `subscription_cancelled` — so
the *triggers already exist*; only the sending does not.

Consequences worth stating: a failed payment is the one case where silence
directly costs money, because the customer does not know to fix their card
before the grace period expires (`past_due` → `grace_ends_at`). And a
subscription with no receipt is a support ticket and a chargeback risk.

**Not built here deliberately** — this is a feature, and this phase is
stabilisation. It is the largest *product* gap the audit found, and it belongs
in the launch plan rather than the UX plan.

---

## 5. Language

One resolution chain, used identically by every mail sender and by the admin
itself:

```
user_metadata.admin_lang      what they CHOSE, by pressing the toggle in the admin
        ↓ (if unset)
user_metadata.lang            what they were seeded with at creation
        ↓ (if unset)
tenants.default_lang          the workspace's default
        ↓ (if unset)
'ar'                          Arabic
```

Implemented the same way in `invite-client`, `client-recovery`,
`request-password-reset` and `admin.js`:

```ts
return ok(meta?.admin_lang) ?? ok(meta?.lang) ?? ok(tenantDefault) ?? "ar";
```

An explicit preference always outranks a seeded one. Where a URL carries `lang`
(signup, checkout), **the URL beats stored preference** — a visitor arriving from
the marketing site is on a different origin and has nothing stored, so without it
an English reader would land on an Arabic page.

An unrecognised value is ignored rather than honoured; Arabic wins.

---

## 6. Branding

All emails should be Designakum-branded and are sent per-language, not
bilingually — the recipient's language is known by the chain above, so there is
no reason to send them both.

The exception is the Supabase Auth templates in `supabase/EMAIL-TEMPLATES.md`,
which are bilingual in one body because Supabase's template layer has no access
to our language chain. That file explains the reasoning. Those templates are not
on a live path.

Constraints that apply to email copy as much as to the UI: Arabic is first-class,
no letter-spacing on Arabic, no uppercase Arabic, **Latin numerals in both
languages**.
