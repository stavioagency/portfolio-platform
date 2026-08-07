# Supabase Auth email templates

These are the emails **Supabase Auth** sends itself. They are not in this repo's
code path and no deploy touches them: they live in the dashboard, under
**Authentication → Emails → Templates**, and are edited by hand.

That is the whole reason this file exists. Every other email the platform sends
(`invite-client`, `client-recovery`) is generated in an Edge Function, is
covered by `tests/client-email-lang.test.mjs`, and picks its language per
recipient. These cannot do either, so the wording is kept here — otherwise the
only copy of it is a textarea in a dashboard, which is how the previous version
of this template got lost.

---

## Why these are bilingual instead of per-language

The Edge Function emails know who they are writing to: they resolve
`admin_lang → lang → tenant default_lang → Arabic` and send **one** language.

Supabase Auth's own templates cannot do that reliably. The recovery mail is
triggered by Supabase, not by our code, so there is no request to read a
language off, and the template has no dependable per-user language variable to
branch on. Branching on nothing would just be a coin flip.

So these templates carry **both languages in one email**, Arabic first. The
reader skips the half they do not need, which costs them two seconds; guessing
wrong costs them the account. Arabic leads for the same reason it is the
fallback everywhere else in this product.

Keep the two halves saying the same thing. If you edit one, edit the other.

---

## Reset Password

**Authentication → Emails → Templates → Reset Password**

Subject:

```
إعادة تعيين كلمة المرور · Reset your password
```

Body (HTML):

```html
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#0C1530">

  <!-- Arabic -->
  <div dir="rtl" lang="ar" style="text-align:right">
    <h1 style="font-size:20px;margin:0 0 6px">إعادة تعيين كلمة المرور</h1>
    <p style="font-size:14px;line-height:1.6;color:#475069;margin:0 0 20px">
      وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط الزر أدناه لاختيار كلمة مرور جديدة.
    </p>
    <p style="margin:0 0 20px">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2C6FE0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600">تعيين كلمة مرور جديدة</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#475069;margin:0">
      الرابط صالح لمدة محدودة ويُستخدم مرة واحدة. إن لم تطلب هذا فتجاهل الرسالة — كلمة مرورك الحالية تبقى كما هي.
    </p>
  </div>

  <hr style="border:0;border-top:1px solid #DDE3F0;margin:28px 0">

  <!-- English -->
  <div dir="ltr" lang="en" style="text-align:left">
    <h1 style="font-size:20px;margin:0 0 6px">Reset your password</h1>
    <p style="font-size:14px;line-height:1.6;color:#475069;margin:0 0 20px">
      We received a request to reset your account password. Use the button below to choose a new one.
    </p>
    <p style="margin:0 0 20px">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2C6FE0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600">Set a new password</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#475069;margin:0">
      The link expires shortly and can be used once. If you did not request this, ignore this email — your current password stays as it is.
    </p>
  </div>

</div>
```

### Notes for whoever pastes this

- **`{{ .ConfirmationURL }}` appears twice on purpose.** Both buttons are the
  same link; a reader should never have to scroll into the other language to
  find the one working button.
- **`dir` sits on each half, not on the document.** Mail clients strip `<html>`,
  and an Arabic block laid out left-to-right reads as broken rather than as
  Arabic. This is the same reason `credentialsEmail` puts `dir` on its wrapper.
- **No password is ever printed here.** Unlike the invite email, this flow ends
  with the reader choosing their own password, so there is nothing to render
  `dir="ltr"` inside the Arabic half.
- `#2C6FE0` is the brand blue. Keep it in sync with the Edge Function emails.

---

## Other templates

The remaining Auth templates (Confirm signup, Magic Link, Invite, Change email)
are **not used by this product's flows** — signup confirmation is handled by
`signup-start` / `signup-verify` with their own mail, and clients are created by
`invite-client`. Leave them at their defaults unless a flow starts using them,
and if one ever does, write it down here first.
