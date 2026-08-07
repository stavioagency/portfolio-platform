// invite-client — owner-only client onboarding, PASSWORD-BASED.
//
// WHY THIS NO LONGER SENDS A MAGIC LINK
// -------------------------------------
// It used to call inviteUserByEmail, which created a user with no password and
// emailed a one-time link. Three things went wrong with that, repeatedly:
//   * the link is SINGLE-USE and Supabase cannot make it otherwise, so a second
//     click — or a mail scanner pre-fetching it — burned the invite;
//   * the account existed with NO password, so the moment the client signed out they
//     were locked out, with password reset (which needs email) as the only way back;
//   * it depends on email, the least reliable part of this system.
//
// Now the account is created WITH a randomised password. If RESEND_API_KEY is set the
// details are emailed to the client automatically; the password is ALSO returned to
// the owner either way, as the fallback and as the only channel while that secret is
// unset. Either route, the client signs in immediately and the admin forces them to
// choose their own password on first sign-in via user_metadata.must_set_password.
//
// The distinction that matters: email is now an OPTIMISATION, not a dependency. When
// it breaks, onboarding degrades to copy-and-paste instead of stopping.
//
// Security model (unchanged):
//   * The CALLER's JWT is verified (verify_jwt on the gateway) AND we re-check
//     is_platform_owner() with a client bound to that JWT. Only platform owners pass.
//   * The service_role key is used ONLY inside this function (server-side). It is
//     NEVER exposed to the browser.
//   * The tenant mapping goes through the owner-gated assign_tenant_admin() RPC with
//     role 'client', so a client can never invite users or reach another tenant.
//
// Body: { tenant_id: uuid, email: string, username: string }
// Returns: { ok, tenant, email, username, temp_password, emailed, email_error }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// OPTIONAL. Set these as Edge Function secrets and onboarding becomes automatic; leave
// them unset and it stays manual, with the owner passing the password on. Nothing here
// breaks either way — the account is created before any email is attempted, and a
// failed send never fails the request.
//   RESEND_API_KEY   re_...
//   MAIL_FROM        e.g. "Designakum <noreply@designakum.site>"   (.site, not .com)
//   ADMIN_URL        e.g. "https://designakum.site/admin"
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "Designakum <noreply@designakum.site>";
const ADMIN_URL = Deno.env.get("ADMIN_URL") ?? "https://designakum.site/admin";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Ambiguous characters are removed on purpose: this password is read off a screen and
// retyped, or dictated. 0/O and 1/l/I are where that goes wrong.
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const ALL = LOWER + UPPER + DIGIT;

// 14 characters: comfortably inside the app's own 8..20 policy
// (lib/password-policy.js), so the client is never handed a password their own
// account screen would reject.
function randomPassword(len = 14): string {
  const r = new Uint32Array(len);
  crypto.getRandomValues(r);
  const at = (set: string, n: number) => set[n % set.length];
  // Guarantee one of each class, so it satisfies a "letters and digits" rule.
  const chars = [at(LOWER, r[0]), at(UPPER, r[1]), at(DIGIT, r[2])];
  for (let i = 3; i < len; i++) chars.push(at(ALL, r[i]));
  const s = new Uint32Array(chars.length);
  crypto.getRandomValues(s);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = s[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const esc = (v: string) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Which language to write to this person in.
 *
 * The same priority the dashboard uses (pages/admin.js), for the same reasons:
 *
 *   admin_lang  what they CHOSE, by pressing the toggle in the admin. An
 *               explicit preference outranks everything.
 *   lang        what they signed up in, or were seeded with. A good guess.
 *   tenant      the workspace's own default_lang. For an INVITED client this
 *               is usually the only signal there is — see the caller.
 *   "ar"        the product is Arabic-first.
 *
 * Duplicated verbatim in client-recovery for the reason its template is
 * duplicated: these deploy independently and a shared module is a deploy-order
 * hazard. tests/client-email-lang.test.mjs fails if the two drift.
 */
export function pickLang(
  meta: Record<string, unknown> | null | undefined,
  tenantDefault?: string | null,
): "ar" | "en" {
  const ok = (v: unknown) => (v === "ar" || v === "en" ? v : null);
  return ok(meta?.admin_lang) ?? ok(meta?.lang) ?? ok(tenantDefault) ?? "ar";
}

/**
 * The credentials email, in one language or the other.
 *
 * Pure and exported so both branches can actually be rendered and asserted from
 * Node — there is no Deno on the machine this is written on, and an email
 * nobody can test is an email that quietly goes out in the wrong language.
 */
export function credentialsEmail(
  lang: "ar" | "en",
  v: { username: string; password: string; workspace: string; adminUrl: string },
): { subject: string; html: string } {
  const ar = lang === "ar";
  const t = ar
    ? {
      subject: `تفاصيل الدخول إلى ${v.workspace}`,
      title: "موقعك جاهز",
      intro: `تم إنشاء حساب لك على <strong>${esc(v.workspace)}</strong>. سجّل دخولك لإضافة أعمالك، ثم اجعل الموقع على ذوقك.`,
      username: "اسم المستخدم",
      password: "كلمة مرور مؤقتة",
      cta: "تسجيل الدخول",
      footer:
        "سيُطلب منك اختيار كلمة مرور خاصة بك عند أول تسجيل دخول، وتتوقف هذه عن العمل حينها. إن لم تكن تتوقع هذه الرسالة فتجاهلها.",
    }
    : {
      subject: `Your ${v.workspace} website — sign-in details`,
      title: "Your website is ready",
      intro: `An account has been created for you on <strong>${esc(v.workspace)}</strong>. Sign in below to add your work, then make it yours.`,
      username: "Username",
      password: "Temporary password",
      cta: "Sign in",
      footer:
        "You will be asked to choose your own password the first time you sign in — this one stops working then. If you did not expect this email, you can ignore it.",
    };

  // dir on the wrapper, not just the document: mail clients strip <html> and
  // an Arabic block laid out left-to-right reads as broken, not as translated.
  const html = `
<div dir="${ar ? "rtl" : "ltr"}" lang="${lang}" style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#0C1530;text-align:${ar ? "right" : "left"}">
  <h1 style="font-size:20px;margin:0 0 6px">${t.title}</h1>
  <p style="font-size:14px;line-height:1.6;color:#475069;margin:0 0 20px">
    ${t.intro}
  </p>
  <div style="background:#F4F6FB;border:1px solid #DDE3F0;border-radius:12px;padding:16px;margin-bottom:20px">
    <p style="margin:0 0 10px;font-size:12px;color:#475069">${t.username}</p>
    <p style="margin:0 0 16px;font-size:16px;font-family:ui-monospace,Menlo,monospace" dir="ltr"><strong>${esc(v.username)}</strong></p>
    <p style="margin:0 0 10px;font-size:12px;color:#475069">${t.password}</p>
    <p style="margin:0;font-size:16px;font-family:ui-monospace,Menlo,monospace" dir="ltr"><strong>${esc(v.password)}</strong></p>
  </div>
  <p style="margin:0 0 20px">
    <a href="${esc(v.adminUrl)}" style="display:inline-block;background:#2C6FE0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600">${t.cta}</a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#475069;margin:0">
    ${t.footer}
  </p>
</div>`;
  return { subject: t.subject, html };
}

// Sends the credentials straight to the client, so onboarding stops depending on the
// owner relaying them by hand.
//
// It emails a TEMPORARY password in plaintext, which is a real trade-off. It is
// acceptable here only because the account is useless until the holder changes it —
// must_set_password forces that on first sign-in — and because the alternative,
// a one-time magic link, is exactly what kept failing: single-use, burnt by mail
// scanners, and leaving accounts with no password at all.
//
// Returns null on success, or a reason. NEVER throws: the account already exists by
// the time this runs, and the owner still has the password on screen as a fallback.
async function emailCredentials(
  to: string, username: string, password: string, workspace: string, lang: "ar" | "en",
): Promise<string | null> {
  if (!RESEND_API_KEY) return "not_configured";
  const { subject, html } = credentialsEmail(lang, {
    username, password, workspace, adminUrl: ADMIN_URL,
  });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) return `resend_${res.status}: ${(await res.text()).slice(0, 200)}`;
    return null;
  } catch (e) {
    return `resend_unreachable: ${String(e).slice(0, 200)}`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  // 1) Verify the requester is a platform OWNER (never trust the frontend).
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who?.user) return json({ error: "invalid_token" }, 401);
  const { data: isOwner, error: ownerErr } = await caller.rpc("is_platform_owner");
  if (ownerErr) return json({ error: "owner_check_failed", detail: ownerErr.message }, 500);
  if (isOwner !== true) return json({ error: "forbidden_not_owner" }, 403);

  // 2) Validate input.
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const tenant_id = String(body.tenant_id ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const username = String(body.username ?? "").trim().toLowerCase();
  if (!tenant_id) return json({ error: "missing_tenant_id" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (!/^[a-z0-9_.-]{2,40}$/.test(username)) return json({ error: "invalid_username" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 3) Tenant must exist.
  const { data: tenantRow } = await admin.from("tenants")
    .select("id, slug, default_lang").eq("id", tenant_id).maybeSingle();
  if (!tenantRow) return json({ error: "tenant_not_found" }, 404);

  // THE ONLY LANGUAGE SIGNAL THERE IS on this path. The account does not exist
  // yet — it is created below — so there is no admin_lang to respect and no
  // lang to read. What the owner set as the workspace's own default is the
  // best available evidence of what this client reads, and it is the language
  // their public site will be in.
  const lang = pickLang(null, tenantRow.default_lang);

  // 4) Refuse to touch an account that already exists. Setting a password on an
  //    existing user would be an account takeover, not an invite, and the owner could
  //    not tell the difference from the response.
  const { data: takenName } = await admin.from("admin_usernames")
    .select("username").eq("username", username).maybeSingle();
  if (takenName) return json({ error: "username_taken" }, 409);

  const { data: listed } = await admin.auth.admin.listUsers();
  const emailExists = (listed?.users ?? []).some((u) => (u.email ?? "").toLowerCase() === email);
  if (emailExists) return json({ error: "email_taken" }, 409);

  // 5) Create the account WITH a password, already confirmed so they can sign in
  //    right away. must_set_password lives in user_metadata (not app_metadata) so the
  //    client's own browser can clear it once they choose a real password; it is a
  //    prompt, not a security boundary.
  const temp_password = randomPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: temp_password,
    email_confirm: true,
    // `lang` is seeded here so this account is not born blank the way every
    // invited client before it was: the dashboard reads it as the starting
    // language (pages/admin.js), a later client-recovery send_welcome finds it
    // instead of falling back to the tenant, and it is what a Supabase auth
    // template would read for a recovery email. It is a SEED, not a choice —
    // the moment they press the language toggle, admin_lang outranks it.
    user_metadata: { must_set_password: true, lang },
  });
  if (createErr || !created?.user) {
    return json({ error: "create_user_failed", detail: createErr?.message }, 400);
  }
  const userId = created.user.id;

  // 6) username -> user mapping (login accepts either username or email).
  const { error: uErr } = await admin.from("admin_usernames").insert({ username, user_id: userId });
  if (uErr) {
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "username_insert_failed", detail: uErr.message }, 500);
  }

  // 7) Map the client to the tenant as role 'client' via the owner-gated RPC.
  const { error: assignErr } = await caller.rpc("assign_tenant_admin", {
    p_tenant_id: tenant_id, p_username: username, p_role: "client",
  });
  if (assignErr) {
    // Roll back everything this call created; admin_usernames cascades with the user.
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "assign_failed", detail: assignErr.message }, 500);
  }

  // Try to deliver it automatically. This is the LAST step on purpose: everything
  // above has already succeeded, so a mail failure costs convenience, not the account.
  const mailError = await emailCredentials(email, username, temp_password, tenantRow.slug, lang);

  // The password is returned to the owner REGARDLESS. Even on a successful send it is
  // the fallback for a client who never receives it, and while RESEND_API_KEY is unset
  // it is the only delivery mechanism there is.
  return json({
    ok: true,
    tenant: tenantRow.slug,
    email,
    username,
    temp_password,
    emailed: mailError === null,
    email_error: mailError,
    message: mailError === null
      ? "Account created and the details were emailed to the client."
      : "Account created. Give the client their username and this password — they must change it on first sign-in.",
  });
});
