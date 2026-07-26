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
// Now the account is created WITH a randomised password that is returned to the
// OWNER. The owner passes it to the client through the channel they already use, the
// client signs in immediately, and the admin forces them to choose their own password
// on first sign-in via user_metadata.must_set_password. Nothing here needs email.
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
// Returns: { ok, tenant, email, username, temp_password }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  // The password is returned to the OWNER to pass on out of band. Deliberately NOT
  // emailed: plaintext passwords in email age badly, and email is the dependency this
  // rewrite exists to remove.
  return json({
    ok: true,
    tenant: tenantRow.slug,
    email,
    username,
    temp_password,
    message: "Account created. Give the client their username and this password — they must change it on first sign-in.",
  });
});
