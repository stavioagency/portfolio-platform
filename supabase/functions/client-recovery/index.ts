// client-recovery — fix a client's onboarding without rebuilding it.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ DEPLOYED to gphrzvjlstznhypcfgre 2026-08-02, verify_jwt on, matching the │
// │ two sibling functions. The admin degrades gracefully if it ever goes     │
// │ missing: recoveryError() in pages/admin.js reports it plainly and copy / │
// │ WhatsApp / PDF / reset-password keep working.                            │
// │                                                                          │
// │ NOTE: send_welcome needs RESEND_API_KEY / MAIL_FROM / ADMIN_URL as        │
// │ function secrets, the same ones invite-client uses. Without them it       │
// │ still rotates the password and returns it, reporting "not_configured".   │
// └──────────────────────────────────────────────────────────────────────────┘
//
// THE PROBLEM IT SOLVES
// invite-client creates the workspace, the account and the password in one shot
// and emails the credentials. A typo in the address sends them to a stranger,
// and because the password is never stored, closing the admin left the owner
// with no way to reach their own client. The only remedy was deleting the
// workspace and starting again — which loses the site.
//
// There is deliberately NO re-invite: invite-client creates a NEW auth user and
// would fail on email_taken / username_taken (HANDOFF §7). Recovery therefore
// has to mutate the EXISTING user, which is what this does. It never creates a
// user, a workspace or a membership.
//
// Body: { action: "update_email", user_id: uuid, email: string }
//       { action: "send_welcome", user_id: uuid }
// Returns: { ok, email, username?, temp_password?, emailed?, email_error? }
//
// WHY send_welcome ROTATES THE PASSWORD: the original is not stored anywhere —
// GoTrue holds only a hash. An email that re-sends "the same credentials" is
// therefore impossible; the honest equivalent is to issue a fresh temporary
// password and send that, which is what a client actually needs to get in. The
// admin UI says so on the button rather than pretending otherwise.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "Designakum <onboarding@resend.dev>";
const ADMIN_URL = Deno.env.get("ADMIN_URL") ?? "https://designakum.site/admin";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Same alphabet and policy as invite-client: no ambiguous glyphs, because this
// gets read off a screen and dictated over the phone.
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const ALL = LOWER + UPPER + DIGIT;

function randomPassword(len = 14): string {
  const r = new Uint32Array(len);
  crypto.getRandomValues(r);
  const at = (set: string, n: number) => set[n % set.length];
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

// Deliberately a copy of invite-client's template rather than a shared import:
// these functions are deployed independently and have no bundler contract
// between them, so a shared module is a deploy-order hazard for one saved edit.
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
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: `Your ${workspace} website — sign-in details`, html }),
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

  // Owner-gated against the CALLER'S OWN token, exactly like the other two
  // functions. The service key below never leaves this process.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who?.user) return json({ error: "invalid_token" }, 401);
  const { data: isOwner, error: ownerErr } = await caller.rpc("is_platform_owner");
  if (ownerErr) return json({ error: "owner_check_failed", detail: ownerErr.message }, 500);
  if (isOwner !== true) return json({ error: "forbidden_not_owner" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const action = String(body.action ?? "").trim();
  const user_id = String(body.user_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(user_id)) return json({ error: "invalid_user_id" }, 400);
  if (action !== "update_email" && action !== "send_welcome") {
    return json({ error: "invalid_action" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Co-owners are peers. One silently rewriting the other's email or password is
  // account takeover, not support — the same guard reset-client-password uses.
  const { data: targetIsOwner } = await admin.from("platform_owners")
    .select("user_id").eq("user_id", user_id).maybeSingle();
  if (targetIsOwner) return json({ error: "cannot_modify_platform_owner" }, 403);

  // Must be a real client of some workspace, not an arbitrary account id.
  const { data: membership } = await admin.from("tenant_admins")
    .select("tenant_id").eq("user_id", user_id).limit(1).maybeSingle();
  if (!membership) return json({ error: "not_a_client" }, 404);

  const { data: found, error: findErr } = await admin.auth.admin.getUserById(user_id);
  if (findErr || !found?.user) return json({ error: "user_not_found" }, 404);

  const { data: unameRow } = await admin.from("admin_usernames")
    .select("username").eq("user_id", user_id).maybeSingle();
  const username = unameRow?.username ?? "";

  const { data: tenantRow } = await admin.from("tenants")
    .select("slug, name").eq("id", membership.tenant_id).maybeSingle();
  const workspace = tenantRow?.name || tenantRow?.slug || "your website";

  // ---- Change the address only. No password is touched, so a client who
  // already signed in successfully keeps working.
  if (action === "update_email") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email) || email.length > 254) {
      return json({ error: "invalid_email" }, 400);
    }
    if (email === String(found.user.email ?? "").toLowerCase()) {
      return json({ ok: true, email, username, unchanged: true });
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
      email,
      email_confirm: true, // an owner typing it IS the confirmation; no round-trip
    });
    if (updErr) {
      // The most likely failure by far, and the one worth naming.
      const taken = /already|registered|exists/i.test(updErr.message);
      return json({ error: taken ? "email_taken" : "email_update_failed", detail: updErr.message }, taken ? 409 : 500);
    }
    return json({ ok: true, email, username });
  }

  // ---- Re-send the welcome, which necessarily means issuing a fresh password:
  // the original exists only as a hash. See the note at the top.
  const temp_password = randomPassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(user_id, {
    password: temp_password,
    // Re-arm the gate so the new one is still only a stepping stone.
    user_metadata: { ...(found.user.user_metadata ?? {}), must_set_password: true },
  });
  if (pwErr) return json({ error: "password_update_failed", detail: pwErr.message }, 500);

  const to = String(found.user.email ?? "");
  const mailError = to ? await emailCredentials(to, username, temp_password, workspace) : "no_address";

  // The password is returned whether or not the mail left, so a send failure
  // still leaves the owner holding something they can deliver by hand.
  return json({
    ok: true,
    email: to,
    username,
    temp_password,
    emailed: mailError === null,
    email_error: mailError,
  });
});
