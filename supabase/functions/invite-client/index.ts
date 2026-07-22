// invite-client — owner-only client onboarding.
//
// Security model:
//   * The CALLER's JWT is verified (verify_jwt on the gateway) AND we re-check
//     is_platform_owner() with a client bound to that JWT. Only platform owners pass.
//   * The service_role key is used ONLY inside this function (server-side) to create
//     the auth user + admin_usernames row. It is NEVER exposed to the browser.
//   * The tenant mapping is created via the existing owner-gated assign_tenant_admin()
//     RPC (role = 'client'), so a client can never invite users or reach other tenants.
//
// Body: { tenant_id: uuid, email: string, username: string, redirect_to?: string }
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
  const redirect_to = body.redirect_to ? String(body.redirect_to) : undefined;
  if (!tenant_id) return json({ error: "missing_tenant_id" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (!/^[a-z0-9_.-]{2,40}$/.test(username)) return json({ error: "invalid_username" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 3) Tenant must exist.
  const { data: tenantRow } = await admin.from("tenants").select("id, slug").eq("id", tenant_id).maybeSingle();
  if (!tenantRow) return json({ error: "tenant_not_found" }, 404);

  // 4) Resolve the auth user for this email (reuse existing, else invite a new one).
  const { data: existingUname } = await admin.from("admin_usernames")
    .select("username, user_id").eq("username", username).maybeSingle();

  const { data: listed } = await admin.auth.admin.listUsers();
  const existingByEmail = listed?.users?.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;

  let userId: string;
  let createdUser = false;
  if (existingByEmail) {
    userId = existingByEmail.id;
  } else {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      email, redirect_to ? { redirectTo: redirect_to } : undefined,
    );
    if (inviteErr || !invited?.user) return json({ error: "invite_failed", detail: inviteErr?.message }, 400);
    userId = invited.user.id;
    createdUser = true;
  }

  // Username already used by a DIFFERENT user -> conflict (clean up a user we just made).
  if (existingUname && existingUname.user_id !== userId) {
    if (createdUser) await admin.auth.admin.deleteUser(userId);
    return json({ error: "username_taken" }, 409);
  }

  // 5) Ensure the username -> user mapping exists (login uses username).
  if (!existingUname) {
    const { error: uErr } = await admin.from("admin_usernames").insert({ username, user_id: userId });
    if (uErr) {
      if (createdUser) await admin.auth.admin.deleteUser(userId);
      return json({ error: "username_insert_failed", detail: uErr.message }, 500);
    }
  }

  // 6) Map the client to the tenant as role 'client' via the owner-gated RPC.
  const { error: assignErr } = await caller.rpc("assign_tenant_admin", {
    p_tenant_id: tenant_id, p_username: username,
  });
  if (assignErr) {
    // roll back only what THIS call created
    if (!existingUname) await admin.from("admin_usernames").delete().eq("username", username);
    if (createdUser) await admin.auth.admin.deleteUser(userId);
    return json({ error: "assign_failed", detail: assignErr.message }, 500);
  }

  return json({
    ok: true,
    tenant: tenantRow.slug,
    email,
    username,
    user_created: createdUser,
    message: createdUser
      ? "Invite email sent — the client sets a password via the link (or 'forgot password')."
      : "Existing user linked to this workspace.",
  });
});
