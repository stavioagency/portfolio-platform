# Architecture — authentication & passwords

Read this before touching anything that creates a session or sets a password.
Audited against production 2026-08-06; the password-reset rewrite landed
2026-08-08.

**Supabase Auth is the only password authority, and that is verified, not
assumed.** A scan of `information_schema.columns` for anything matching
password / passwd / hash / secret across the whole `public` schema returns NONE.
There is no custom hashing, no shadow table, no duplicate storage. Keep it that
way.

---

## 1. Sign-in

```
identifier + password
   → lib/resolve-login.js  parseLoginIdentifier() decides email vs username
   → username? get_email_for_username RPC (anon-callable, and must stay so)
   → supabase.auth.signInWithPassword
```

`get_email_for_username` must remain callable by `anon`: sign-in resolves a
username *before* anyone is authenticated. Revoking it breaks login for
everyone. It is a known, accepted gap — see
[overview.md §7](overview.md#7-known-gaps).

---

## 2. Where passwords are created and changed

Two places create, four update. This table is the whole surface.

| Where | What it does |
|---|---|
| `invite-client` | creates the account with a generated 14-char password, mails it, sets `must_set_password` |
| `signup-start` | creates the account unconfirmed, with the customer's own password |
| AccountEditor (admin) | re-auth, HIBP check, then `auth.updateUser({ password })` |
| `reset-client-password` | generates a NEW password and re-arms `must_set_password` — **destructive** |
| `client-recovery` → `send_welcome` | generates a NEW password — **destructive** |
| `complete-password-reset` | the customer's own choice, against a single-use token; clears `must_set_password` |

`lib/password-policy.js` bounds length (min 8, max 20 chars) and enforces a
**72-byte** bcrypt backstop — a 20-character Arabic password can exceed 72 bytes
in UTF-8. That is the entirety of our involvement in password handling. Never
write custom hashing.

---

## 3. Public self-service signup

```
/signup?lang=…&plan=…
   → signup-start        creates the account (unconfirmed), stores plan + lang,
                         sends a verification mail via Resend
   → /signup/verify?t=…&lang=…
   → signup-verify       confirms the email in Supabase, creates the workspace
                         (status = 'disabled', created_via = 'self_signup')
   → Continue → /admin?plan=…&lang=… → sign in
   → Billing tab (plan preselected) → checkout → /subscribe → PayPal
   → ACTIVATED webhook   → subscription active AND tenant status → 'active'
```

Decided and locked. The operator route (`invite-client`, section 5) is
unaffected and is still how an existing client is onboarded.

- **`lang` and `plan` ride the whole way.** `plan` is stored on the account by
  `signup-start` and read back by `signup-verify`, because the verification email
  is usually opened on a different device. `lang` travels the same way, with the
  URL beating stored preference at every hop. **Neither is trusted for pricing** —
  `billing-checkout` resolves the plan against `provider_plans`.
- **Supabase Auth stays the source of truth for "is this email confirmed".**
  `signup-verify` sets `email_confirmed_at` through the admin API rather than
  recording confirmation in a column of our own.
- **The verification token is `_shared/signup-token.ts`** with its own secret
  (`SIGNUP_TOKEN_SECRET`, never `BILLING_GRANT_SECRET` — a leaked billing secret
  must not be able to verify email addresses). It is **stateless, expiring, and
  re-usable, not single-use**; resending mints an additional valid token rather
  than invalidating the old one. See
  [decisions/decisions.md](../decisions/decisions.md) for why.
- **Signup never reveals whether an email exists.** One response for every input.
  Behind it: a new address is created, an unconfirmed one is re-sent, a confirmed
  one gets a "you already have an account" mail instead. The information reaches
  the mailbox owner, never the requester.
- **No access before payment, and it needs no new enforcement.**
  `tenant_has_active_subscription()` is already false for a workspace with no
  subscription row. A self-signup tenant is created `disabled` and flipped to
  `active` by the ACTIVATED webhook. An abandoned payment simply leaves it there;
  retrying is opening `/subscribe` again.
- **One workspace per user is a single guard**, not a schema assumption.
  `tenant_admins` is already many-to-many; multi-workspace later means removing
  that check and adding a switcher.
- **Reserved slugs are enforced server-side**, from the shared list in `lib/`. A
  tenant claiming `admin` or `subscribe` would shadow a real route.

---

## 4. Password reset (self-serve)

Ours, not Supabase's, since 2026-08-08.

```
"Forgot password"
   → request-password-reset    mints a token, stores its HASH, sends a branded
                               per-language mail via Resend
   → /reset-password?…         renders a form on GET and calls NOTHING
   → complete-password-reset   spends the token, writes the password,
                               clears must_set_password
```

Security properties, all deliberate:

- **Tokens are stored hashed**, in `password_reset_tokens`. The plaintext exists
  only in the email.
- **Single-use and expiring**, claimed by a conditional `UPDATE ... WHERE used_at
  IS NULL AND expires_at > now()` using the **database's** clock. The function's
  clock is not authoritative and does not need to be.
- **A spent token is never reinstated**, even when the password write then fails.
  A `used_at` that could go from set back to null would destroy the single-use
  guarantee. The cost is that the person requests a new link.
- **No user enumeration.** Unknown, already-spent and expired tokens are
  deliberately not distinguished; the request endpoint answers identically
  whatever address it is given.
- **No password is ever logged.** Log lines carry a user id and an outcome.

**Single-use is safe here for a specific reason.** `/reset-password` renders a
form on GET and touches nothing; the token is spent by the POST that a *human*
causes by submitting. A mail scanner that pre-fetches the URL never burns it.
**Anything that adds a validate-on-load call to that page brings back the bug
that made Supabase's own links unusable** — `tests/password-reset.test.mjs` fails
if one appears.

Requires `supabase/sections/section-j-password-reset.sql` applied, and both
functions deployed with `--no-verify-jwt`. `resetPasswordForEmail` is gone from
the codebase.

---

## 5. Operator onboarding and recovery

Three owner-only Edge Functions, each re-checking `is_platform_owner()` against
the caller's own JWT.

**`invite-client`** — Clients → "+ Add client". Creates the workspace AND the
account together with a generated 14-character password, emails the credentials,
and also returns the password to the owner on screen.

**The email is deliberately the LAST step.** Account, username and tenant mapping
are all committed before any send is attempted, and a send failure never fails
the request. **Email is an optimisation, not a dependency.** Do not make any part
of this conditional on mail.

Two consequences worth knowing before touching it:

- **A typo in the email address hands a working password to a stranger.** Whoever
  signs in FIRST sets the real password and owns the workspace. Reset immediately.
- **There is no "re-invite".** `invite-client` creates a NEW auth user, so
  re-running it for an existing client fails on `email_taken` / `username_taken`.

**`reset-client-password`** — Clients → "Reset password". Generates a fresh
password, re-arms `must_set_password`, returns it to the owner. It **refuses to
touch a platform owner's account**: co-owners are peers, and one silently
resetting the other is account takeover, not support.

**`client-recovery`** — `update_email` rewrites the address on the *existing*
auth user; `send_welcome` re-sends the onboarding mail. It never creates a user,
a workspace or a membership.

**Changing a client's email has no UI.** Do it in the Supabase dashboard. A wrong
email does NOT lock a client out — sign-in resolves their *username* server-side —
it only breaks Supabase's own recovery.

---

## 6. `must_set_password` and the gate

`user_metadata.must_set_password` is what forces a temporary password to be
replaced on first sign-in. `SetPasswordGate` in `admin.js` renders over
everything when it is owed.

The gate fires on **either** of two things (`admin.js` ~line 400):

1. `session.user.user_metadata.must_set_password === true`, or
2. `recoveryMode`, which is seeded from a **localStorage flag**
   (`admin_must_set_password`) set at module load when the page was reached via a
   Supabase invite/recovery link.

The localStorage flag exists because the URL hash is stripped by supabase-js
within a second of landing, so a refresh used to drop the requirement entirely
and leave someone inside the admin with a session and no password.

**The obligation has three signals, and they are discharged together.** The
React state, the localStorage flag, and the module-scope *link arrival* all go
down in `dischargePasswordObligation()`, called from exactly three places: the
gate completing, `SIGNED_OUT`, and a successful password sign-in.

**`SIGNED_IN` is not once per login.** supabase-js re-emits it on every tab
refocus — `GoTrueClient`'s `visibilitychange` handler calls `_recoverAndRefresh`,
which ends in `_notifyAllSubscribers('SIGNED_IN', session)` for any valid
session. The listener re-arms the obligation on `SIGNED_IN` while the arrival is
unconsumed, so **the arrival must stay a consumable `let`, never a `const`.** As
a `const` it stayed true for the life of the page: completing the gate cleared
the other two signals, then the next tab-away-and-back re-armed both — and
because it rewrote localStorage, the loop survived a reload. That was the P0
"asked to set a password again". `tests/password-gate.test.mjs` fails if it goes
back to being a constant, or if the listener stops calling it.

A successful password sign-in also discharges it: typing a working password IS
the obligation being met, and without that a browser holding a stale flag gated
the customer again on the screen straight after a self-serve reset. This only
drops the LOCAL signals — an account that genuinely owes a password still says so
in `user_metadata`, which the gate reads independently.

**Two guardrails for any auth change:**

- **`must_set_password` was true for 3 users at audit time.** Any change must
  keep `SetPasswordGate` working, or those accounts are stranded holding a
  temporary password with no way to set a real one.
- **`user_metadata` writes must SPREAD, never replace.** A replace drops
  `must_set_password` and the gate silently disappears. Every call site in the
  repo spreads today; keep it so.

---

## 7. Known issues

**1. Two operator actions silently invalidate a working password.** This is the
source of "the client says their password stopped working". It is not a bug — it
is the design surfacing as one.

`send_welcome` has no alternative: the original password is only ever a hash, so
"re-send their welcome email" cannot mean "re-send their password". An operator
clicking it to help a client who never got the mail breaks the password that
client may already be using. `reset-client-password` warns before doing this;
`send_welcome` does not.

*Proposed fix, not built:* warn at the moment of clicking, and add a
NON-destructive resend for the common case — when `last_sign_in_at IS NULL` there
is no working password to protect, so re-issuing costs nothing. Fall back to the
destructive path only when they have actually signed in.

**2. "Asked to set a password again after resetting it" — FOUND AND FIXED
2026-08-08.** See §6; the mechanism is written up there because it is a property
of the gate, not a defect in the reset path.

The old note guessed at a stale localStorage flag left by an abandoned gate.
That was the wrong half: the flag was being **actively rewritten after every
successful gate completion**, by a tab refocus. `complete-password-reset` and
both `admin.js` clear sites were correct as written, as that note said.

**3. Supabase recovery links are single-use and cannot be made otherwise.** No
longer applies to password reset, which no longer uses them. Still true for any
Supabase-issued invite link.

---

## 8. Mapping integrity, as audited

0 duplicate emails, 0 duplicate usernames, 0 orphaned usernames, 0 orphaned
profiles. `users_without_workspace` was 6 — expected: two platform owners plus
the unattached logins the recovery tooling already handles.

**No mapping defect is causing login failures. Do not go looking for one.**
Audit `auth.users`, `profile`, `tenant_admins` and `admin_usernames` before
changing auth rather than assuming a login failure is a data problem — it has not
been so far.
