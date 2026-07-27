// reset-client-password — owner-only recovery for a client who lost their password.
//
// WHY: without this, a client who forgets their password has no route back. Password
// reset needs email, which is the least reliable part of this system, so in practice
// the "fix" was deleting the workspace and rebuilding it — losing their site.
//
// This generates a fresh password, hands it to the OWNER to pass on, and flags the
// account so the client is forced to choose their own on next sign-in. Same shape as
// invite-client, and equally independent of email.
//
// SECURITY:
//   * verify_jwt on the gateway, PLUS is_platform_owner() re-checked against the
//     caller's own JWT. Only platform owners pass.
//   * REFUSES to touch another platform owner's account. Two co-owners are peers, and
//     one silently resetting the other's password is account takeover, not support.
//     Owners recover through Supabase's own reset flow.
//   * The service_role key never leaves this function.
//
// Body: { user_id: uuid }
// Returns: { ok, email, username, temp_password }
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

// Same alphabet as invite-client: no 0/O or 1/l/I, because this gets retyped by hand.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

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
  const user_id = String(body.user_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(user_id)) return json({ error: "invalid_user_id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Never reset a platform owner from here — see the security note above.
  const { data: targetIsOwner } = await admin.from("platform_owners")
    .select("user_id").eq("user_id", user_id).maybeSingle();
  if (targetIsOwner) return json({ error: "cannot_reset_platform_owner" }, 403);

  // The target must actually be a client of some workspace, not an arbitrary account.
  const { data: membership } = await admin.from("tenant_admins")
    .select("tenant_id").eq("user_id", user_id).limit(1).maybeSingle();
  if (!membership) return json({ error: "not_a_client" }, 404);

  const { data: found, error: findErr } = await admin.auth.admin.getUserById(user_id);
  if (findErr || !found?.user) return json({ error: "user_not_found" }, 404);

  const temp_password = randomPassword();
  const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
    password: temp_password,
    // Re-arm the gate: a password the owner has seen is a temporary one.
    user_metadata: { ...(found.user.user_metadata ?? {}), must_set_password: true },
  });
  if (updErr) return json({ error: "reset_failed", detail: updErr.message }, 400);

  const { data: uname } = await admin.from("admin_usernames")
    .select("username").eq("user_id", user_id).maybeSingle();

  return json({
    ok: true,
    email: found.user.email,
    username: uname?.username ?? null,
    temp_password,
    message: "Password reset. Give the client this password — they must change it on next sign-in.",
  });
});
