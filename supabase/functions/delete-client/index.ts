// delete-client — remove a client completely.
//
// WHY THIS IS ITS OWN FUNCTION and not another action on client-recovery:
// that file is 441 lines and carries the live password-reset and email-change
// paths. Deploying it requires re-uploading the whole source, and a single
// transcription slip would take those flows down. This is small enough to be
// obviously correct, and it cannot break anything that already works.
//
// WHAT IT DOES
//   1. refuses if the subscription could still be charged
//   2. writes a record to deleted_clients BEFORE destroying anything
//   3. deletes the tenant, which cascades profile, projects, tenant_domains,
//      analytics_events, billing rows and tenant_admins
//   4. deletes the client's auth user
//
// WHY STEP 4 MATTERS: GoTrue's uniqueness is on auth.users.email, so deleting
// the row is what actually frees the address. The person can sign up again from
// scratch with the same email. release_account (client-recovery) parks an
// address instead and keeps the account -- a different job, still there.
//
// THIS DOES NOT RESTORE. deleted_clients is a log, not a recycle bin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// Mirrors lib/workspace-deletion.js BLOCKING_STATES. A subscription that is
// pending, trialing, active or past_due may still be charged or may still
// activate, and destroying the local rows would strand a live PayPal
// subscription with nothing on this side. Checked here rather than trusted from
// the browser, because the browser cannot be trusted with a delete.
const BLOCKING = ["pending", "trialing", "active", "past_due"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  // Owner-gated against the CALLER'S OWN token, the same pattern the other
  // owner functions use. The service key never leaves this process.
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

  const tenant_id = String(body.tenant_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(tenant_id)) return json({ error: "invalid_tenant_id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: tenant, error: tErr } = await admin
    .from("tenants").select("id, slug, name").eq("id", tenant_id).maybeSingle();
  if (tErr) return json({ error: "tenant_lookup_failed", detail: tErr.message }, 500);
  if (!tenant) return json({ error: "tenant_not_found" }, 404);

  // The caller must name the workspace it means to destroy. A mis-click cannot
  // produce a matching slug.
  const confirm_slug = String(body.confirm_slug ?? "").trim().toLowerCase();
  if (confirm_slug !== String(tenant.slug).toLowerCase()) {
    return json({ error: "confirm_mismatch", expected: tenant.slug }, 400);
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, provider_subscription_id")
    .eq("tenant_id", tenant_id).maybeSingle();
  if (sub && BLOCKING.includes(String(sub.status))) {
    return json({
      error: "subscription_live",
      state: sub.status,
      provider_subscription_id: sub.provider_subscription_id ?? null,
    }, 409);
  }

  // Platform owners are enrolled on EVERY tenant by trg_enroll_platform_owners.
  // They must never be deleted here.
  const { data: owners } = await admin.from("platform_owners").select("user_id");
  const ownerIds = new Set((owners ?? []).map((o: Record<string, unknown>) => String(o.user_id)));
  const { data: admins } = await admin
    .from("tenant_admins").select("user_id").eq("tenant_id", tenant_id);
  const candidates = (admins ?? [])
    .map((a: Record<string, unknown>) => String(a.user_id))
    .filter((id: string) => !ownerIds.has(id));

  // Only delete a login that administers NOTHING ELSE. Someone attached to a
  // second workspace keeps their account; only this membership goes.
  const deletable: string[] = [];
  for (const id of candidates) {
    const { count } = await admin
      .from("tenant_admins").select("tenant_id", { count: "exact", head: true })
      .eq("user_id", id).neq("tenant_id", tenant_id);
    if (!count) deletable.push(id);
  }

  let email: string | null = null;
  let username: string | null = null;
  if (deletable.length) {
    const { data: u } = await admin.auth.admin.getUserById(deletable[0]);
    email = (u?.user?.email as string) ?? null;
    const { data: un } = await admin
      .from("admin_usernames").select("username").eq("user_id", deletable[0]).maybeSingle();
    username = (un?.username as string) ?? null;
  }
  const { count: projectsCount } = await admin
    .from("projects").select("id", { count: "exact", head: true }).eq("tenant_id", tenant_id);

  // Recorded BEFORE the destruction, so a failure halfway leaves a trace rather
  // than a silent gap.
  const { error: logErr } = await admin.from("deleted_clients").insert({
    tenant_id,
    slug: tenant.slug,
    name: tenant.name,
    email,
    username,
    projects_count: projectsCount ?? 0,
    had_billing: !!sub,
    billing_state: sub ? String(sub.status) : null,
    deleted_by: who.user.id,
    note: String(body.note ?? "") || null,
  });
  if (logErr) return json({ error: "archive_failed", detail: logErr.message }, 500);

  // Cascades profile, projects, tenant_domains, analytics_events, billing rows
  // and tenant_admins in one statement, per the FK design.
  const { error: delErr } = await admin.from("tenants").delete().eq("id", tenant_id);
  if (delErr) return json({ error: "tenant_delete_failed", detail: delErr.message }, 500);

  // Then the logins. This is the step that frees the email for a future signup.
  const removed: string[] = [];
  for (const id of deletable) {
    await admin.from("admin_usernames").delete().eq("user_id", id);
    const { error: uErr } = await admin.auth.admin.deleteUser(id);
    if (uErr) {
      return json({
        error: "user_delete_failed", detail: uErr.message,
        tenant_deleted: true, users_deleted: removed.length,
      }, 500);
    }
    removed.push(id);
  }

  console.log(`[delete-client] removed tenant=${tenant.slug} users=${removed.length}`);
  return json({
    ok: true,
    slug: tenant.slug,
    users_deleted: removed.length,
    email_freed: email,
  });
});
