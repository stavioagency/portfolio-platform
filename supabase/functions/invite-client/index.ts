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
  to: string, username: string, password: string, workspace: string,
): Promise<string | null> {
  if (!RESEND_API_KEY) return "not_configured";
  const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#0C1530">
  <h1 style="font-size:20px;margin:0 0 6px">Your website is ready</h1>
  <p style="font-size:14px;line-height:1.6;color:#475069;margin:0 0 20px">
    An account has been created for you on <strong>${esc(workspace)}</strong>.
    Sign in below to add your work, then make it yours.
  </p>
  <div style="background:#F4F6FB;border:1px solid #DDE3F0;border-radius:12px;padding:16px;margin-bottom:20px">
    <p style="margin:0 0 10px;font-size:12px;color:#475069">Username</p>
    <p style="margin:0 0 16px;font-size:16px;font-family:ui-monospace,Menlo,monospace"><strong>${esc(username)}</strong></p>
    <p style="margin:0 0 10px;font-size:12px;color:#475069">Temporary password</p>
    <p style="margin:0;font-size:16px;font-family:ui-monospace,Menlo,monospace"><strong>${esc(password)}</strong></p>
  </div>
  <p style="margin:0 0 20px">
    <a href="${esc(ADMIN_URL)}" style="display:inline-block;background:#2C6FE0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600">Sign in</a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#475069;margin:0">
    You will be asked to choose your own password the first time you sign in — this one
    stops working then. If you did not expect this email, you can ignore it.
  </p>
</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [to],
        subject: `Your ${workspace} website — sign-in details`,
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
  const { data: tenantRow } = await admin.from("tenants").select("id, slug").eq("id", tenant_id).maybeSingle();
  if (!tenantRow) return json({ error: "tenant_not_found" }, 404);

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
    user_metadata: { must_set_password: true },
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
  const mailError = await emailCredentials(email, username, temp_password, tenantRow.slug);

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
