// signup-verify — proves the customer owns the address, then builds their
// workspace. Nothing here charges anything or grants any access.
//
// Deployed WITHOUT the JWT gateway check — the link is clicked from an email,
// not from a session:
//     supabase functions deploy signup-verify --no-verify-jwt
// The token IS the authentication.
//
// WHAT IT CREATES, AND WHAT IT DELIBERATELY DOES NOT
// --------------------------------------------------
// Creates: the confirmed auth user, a tenant (status DISABLED, created_via
// self_signup, handed_over_at now), the tenant_admins membership marked
// self_signup, the admin_usernames row for username login, and an empty
// profile row.
//
// Does NOT create a subscription, does not touch PayPal, does not activate the
// tenant. `tenant_has_active_subscription()` is already false for a workspace
// with no subscription row, so "no access before payment" needs no code here —
// it is what happens if this function does nothing about billing at all. The
// tenant is flipped to active by the ACTIVATED webhook, later.
//
// IDEMPOTENT BY CONSTRUCTION. The token is reusable for 24 hours (see
// signup-token.ts and HANDOFF §9), so this WILL be called more than once — by
// mail scanners pre-fetching the link, by a customer clicking twice, by a
// double-tap on mobile. Every step below is written to be safe on the second
// run and to return the same success.
//
// Body:    { token }
// Returns: { ok, slug, email, plan, lang } on success; a specific error
// otherwise. `plan` is the code chosen on the marketing site, or null;
// `lang` is the language they signed up in, always "ar" or "en".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json } from "../_shared/http.ts";
import { verifyVerificationToken } from "../_shared/signup-token.ts";
import { slugError } from "../_shared/signup-rules.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  // One answer for malformed, forged, wrong-purpose and expired alike. The
  // caller cannot tell them apart and must not — see signup-token.ts.
  const userId = await verifyVerificationToken(String(body.token ?? ""));
  if (!userId) return json({ error: "invalid_or_expired_token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const { data: found, error: findErr } = await admin.auth.admin.getUserById(userId);
    if (findErr || !found?.user) return json({ error: "invalid_or_expired_token" }, 401);
    const user = found.user;
    const email = (user.email ?? "").toLowerCase();
    const meta = user.user_metadata ?? {};
    // The plan they picked on the marketing site, stored at signup-start.
    // Returned so the page that lands here can carry it into the dashboard —
    // the visitor may be on a different device, so this is the only copy.
    // Never used to price anything: billing-checkout resolves it against
    // `provider_plans` when they actually pay.
    const plan = String(meta.pending_plan ?? "").trim() || null;
    // The language they signed up in, handed back for the same reason as the
    // plan: the verification link is usually opened on a device that has
    // never seen this site, so nothing in that browser knows. The link itself
    // carries `&lang=` and wins where it is present — this is what the page
    // falls back to instead of assuming Arabic, and what it passes on to the
    // dashboard. Normalised the same way signup-start stores it.
    const lang = meta.lang === "en" ? "en" : "ar";

    // ONE WORKSPACE PER USER. Checked before anything is written, and backed by
    // the partial unique index from section I so the rule holds even if this
    // check is ever bypassed. Returning success rather than an error is
    // deliberate: on a second click the desired end state already exists.
    const { data: existingMembership } = await admin
      .from("tenant_admins")
      .select("tenant_id, tenants(slug)")
      .eq("user_id", userId)
      .eq("self_signup", true)
      .maybeSingle();

    if (existingMembership) {
      // Already done. Confirm the email again anyway — harmless, and it repairs
      // the case where the first run created the workspace and then failed
      // before confirming.
      if (!user.email_confirmed_at) await confirmEmail(admin, userId, meta);
      // deno-lint-ignore no-explicit-any
      const slug = (existingMembership as any).tenants?.slug ?? null;
      return json({ ok: true, already: true, slug, email, plan, lang });
    }

    const slug = String(meta.pending_slug ?? "").trim().toLowerCase();
    const workspaceName = String(meta.pending_workspace_name ?? "").trim();

    // Re-validate rather than trust metadata. It was validated at signup-start,
    // but the reserved list can grow between the two calls, and a value read
    // back out of storage is input again.
    const badSlug = slugError(slug);
    if (badSlug) return json({ error: badSlug }, 400);

    // 1. Confirm the email FIRST. If the workspace creation below fails, the
    //    customer still has a usable, verified account and can be helped by
    //    hand — the reverse leaves a workspace owned by an unverified address.
    await confirmEmail(admin, userId, meta);

    // 2. The workspace. Disabled: the public site 404s until payment.
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .insert({
        slug,
        name: workspaceName || slug,
        status: "disabled",
        default_lang: meta.lang === "en" ? "en" : "ar",
        created_via: "self_signup",
        // No credentials were handed over — nobody has anything to deliver — so
        // this must never enter the operator's Pending handover queue.
        handed_over_at: new Date().toISOString(),
      })
      .select("id, slug")
      .single();

    if (tenantErr) {
      // 23505 = unique violation, i.e. the slug was taken between signup-start
      // and now. Recoverable by choosing another one, so say so precisely.
      const taken = String(tenantErr.code) === "23505";
      console.error("[signup-verify] tenant insert failed:", tenantErr.message);
      return json({ error: taken ? "slug_taken" : "workspace_creation_failed" }, taken ? 409 : 500);
    }

    // 3. Membership. `self_signup: true` is what the section-I unique index
    //    keys on, and role 'owner' is descriptive — the access itself comes
    //    from the row existing at all (SCHEMA.sql).
    const { error: memberErr } = await admin.from("tenant_admins").insert({
      tenant_id: tenant.id, user_id: userId, role: "owner", self_signup: true,
    });
    if (memberErr) {
      console.error("[signup-verify] membership insert failed:", memberErr.message);
      return json({ error: "workspace_creation_failed" }, 500);
    }

    // 4. Username login. Best-effort: sign-in also accepts the email address,
    //    so a collision here costs a convenience, not access.
    const username = await uniqueUsername(admin, slug);
    if (username) {
      const { error } = await admin.from("admin_usernames").insert({ username, user_id: userId });
      if (error) console.warn("[signup-verify] username not claimed:", error.message);
    }

    // 5. An empty profile. HANDOFF §6: an empty profile is not a missing
    //    profile — it is the normal state of a new workspace, and the public
    //    page uses hasPublicContent() to decide what to render.
    const { error: profileErr } = await admin.from("profile").insert({ tenant_id: tenant.id });
    if (profileErr) console.warn("[signup-verify] profile not created:", profileErr.message);

    return json({ ok: true, slug: tenant.slug, email, tenant_id: tenant.id, plan, lang });
  } catch (err) {
    console.error("[signup-verify] unexpected:", err);
    return json({ error: "verification_failed" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function confirmEmail(admin: any, userId: string, meta: Record<string, unknown>) {
  // Supabase Auth stays the source of truth for "is this address confirmed" —
  // we do not keep a column of our own (HANDOFF §7c).
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
    // Spread, never replace (HANDOFF §9).
    user_metadata: { ...meta, verified_at: new Date().toISOString() },
  });
  if (error) throw new Error(`confirm_failed: ${error.message}`);
}

// The slug is the natural username. If it is taken, try a few suffixes and
// then give up quietly rather than failing the whole verification over a
// convenience feature.
// deno-lint-ignore no-explicit-any
async function uniqueUsername(admin: any, base: string): Promise<string | null> {
  for (const candidate of [base, `${base}1`, `${base}2`, `${base}${Date.now() % 1000}`]) {
    const { data } = await admin
      .from("admin_usernames").select("username").eq("username", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return null;
}
