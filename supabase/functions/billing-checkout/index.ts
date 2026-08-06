// billing-checkout — start a subscription, and hand back the URL to approve it.
//
// ONE CHECKOUT, TWO DOORS. This is the function both of them call:
//   * the client, from the Billing tab, with their JWT;
//   * anyone holding an owner-issued signed grant, with no session at all.
//
// It is therefore deployed WITHOUT the JWT gateway check:
//     supabase functions deploy billing-checkout --no-verify-jwt
// and does its own authorisation, one branch per door, below. Deploying it with
// verify_jwt on silently breaks the payment link and nothing else — which is a
// hard failure to spot, so it is written at the top of this file.
//
// WHAT IT DOES NOT DO: activate anything. It creates a subscription at PayPal
// in APPROVAL_PENDING and records it as `pending`, which grants nothing. The
// subscription becomes real when BILLING.SUBSCRIPTION.ACTIVATED arrives at
// billing-webhook. The customer's browser is never the source of truth about
// whether they paid.
//
// Body: { tenant_id?, plan_code?, grant?, return_url, cancel_url, locale? }
// Returns: { ok, approve_url, subscription_id, status }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, json, isUuid } from "../_shared/http.ts";
import { getProvider } from "../_shared/provider.ts";
import { PAYPAL_ENV } from "../_shared/paypal.ts";
import { verifyGrant } from "../_shared/grant.ts";
import {
  adminClient,
  callerClient,
  activeProviderPlan,
  upsertSubscription,
  subscriptionByTenant,
} from "../_shared/billing-db.ts";

// The only URLs a checkout may return to. An open redirect here would let an
// attacker send someone through a real PayPal approval and land them on a page
// of their choosing wearing our brand.
const ALLOWED_RETURN_HOSTS = (Deno.env.get("BILLING_RETURN_HOSTS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function safeRedirect(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
    if (ALLOWED_RETURN_HOSTS.length === 0) return null; // fail closed if unconfigured
    return ALLOWED_RETURN_HOSTS.includes(parsed.hostname.toLowerCase()) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const returnUrl = safeRedirect(String(body.return_url ?? ""));
  const cancelUrl = safeRedirect(String(body.cancel_url ?? ""));
  if (!returnUrl || !cancelUrl) return json({ error: "invalid_redirect_url" }, 400);

  const locale = body.locale === "en" ? "en" : "ar";

  // -------------------------------------------------------------------------
  // AUTHORISATION — one branch per door. Both end with a tenant id we are
  // certain the caller may act for, and a plan code we did not take on trust.
  // -------------------------------------------------------------------------
  let tenantId: string | null = null;
  let planCode: string | null = null;

  // WHICH DOOR IS DECIDED BY THE BODY, NOT BY THE HEADER. supabase-js always
  // sends an Authorization header — it falls back to the anon key when there is
  // no session — so "has an Authorization header" is true for every caller and
  // would send door-2 traffic down the door-1 branch to fail as invalid_token.
  const grantToken = String(body.grant ?? "");
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!grantToken) {
    // DOOR 1 — a signed-in client. is_tenant_admin() is checked against THEIR
    // token, not ours, so an admin of workspace A cannot buy for workspace B.
    // An anon key reaching getUser() fails here, which is the correct answer.
    const caller = callerClient(authHeader);
    const { data: who, error: whoErr } = await caller.auth.getUser();
    if (whoErr || !who?.user) return json({ error: "invalid_token" }, 401);

    const requested = String(body.tenant_id ?? "");
    if (!isUuid(requested)) return json({ error: "invalid_tenant_id" }, 400);

    const { data: mayAdmin, error: adminErr } = await caller.rpc("is_tenant_admin", { tid: requested });
    if (adminErr) return json({ error: "authz_check_failed", detail: adminErr.message }, 500);
    if (mayAdmin !== true) return json({ error: "forbidden" }, 403);

    tenantId = requested;
    planCode = String(body.plan_code ?? "");
  } else {
    // DOOR 2 — an owner-issued payment link. The grant names the tenant AND
    // the plan; nothing from the request body is trusted here, so a recipient
    // cannot edit the URL into a cheaper plan or someone else's workspace.
    const grant = await verifyGrant(grantToken);
    if (!grant) return json({ error: "invalid_or_expired_grant" }, 401);
    tenantId = grant.tenantId;
    planCode = grant.planCode;
  }

  if (!isUuid(tenantId) || !planCode) return json({ error: "invalid_request" }, 400);

  const admin = adminClient();
  const provider = getProvider();

  // The tenant must exist. A grant for a deleted workspace is not an error
  // worth explaining, but it must not reach PayPal.
  const { data: tenant } = await admin
    .from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
  if (!tenant) return json({ error: "tenant_not_found" }, 404);

  // Refuse to sell something they already have. Without this, a client who
  // opens an old payment link ends up with two PayPal subscriptions billing
  // them in parallel, and only one of them visible in our database.
  const existing = await subscriptionByTenant(admin, tenantId);
  if (existing && ["active", "trialing", "comped"].includes(existing.status)) {
    return json({ error: "already_subscribed", status: existing.status }, 409);
  }

  // A `pending` row is the dangerous case, and the local status is not enough
  // to judge it: the customer may have approved the subscription seconds ago
  // and the ACTIVATED webhook may not have landed yet. Creating a second
  // subscription there would leave them approved on TWO, billed on both, with
  // only the newer one visible here — while the older one keeps charging
  // forever because nothing in this system knows it exists.
  //
  // So ask PayPal, which is the only party that knows. If it is already live,
  // adopt it and refuse. If it is still unapproved, it is abandoned and will
  // expire at PayPal on its own, so a fresh one is safe.
  if (existing?.status === "pending" && existing.provider_subscription_id) {
    try {
      const remote = await provider.getSubscription(existing.provider_subscription_id);
      if (["active", "trialing", "past_due"].includes(remote.status)) {
        await upsertSubscription(admin, tenantId, {
          status: remote.status,
          current_period_end: remote.currentPeriodEnd,
        });
        return json({ error: "already_subscribed", status: remote.status }, 409);
      }
    } catch (err) {
      // Cannot reach PayPal, so cannot rule out a live subscription. Refusing
      // costs the customer a retry; guessing costs them a double charge.
      console.error("[billing-checkout] could not verify the pending subscription:", err);
      return json({ error: "provider_unreachable" }, 503);
    }
  }

  // The price comes from provider_plans, never from the request. This is the
  // line that stops a client from paying an amount they chose.
  const planRow = await activeProviderPlan(admin, provider.name, PAYPAL_ENV, planCode);
  if (!planRow) return json({ error: "plan_not_available", plan_code: planCode }, 400);

  let created;
  try {
    created = await provider.createSubscription({
      planId: planRow.provider_plan_id,
      tenantId,
      workspaceName: tenant.name || tenant.slug,
      returnUrl,
      cancelUrl,
      locale,
    });
  } catch (err) {
    console.error("[billing-checkout] provider error:", err);
    return json({ error: "provider_error", detail: String((err as Error).message ?? err) }, 502);
  }

  // Recorded as pending — see the header. This row grants nothing; it exists so
  // the webhook has something to attach to, and so the dashboard can say
  // "waiting for PayPal" instead of "not subscribed".
  await upsertSubscription(admin, tenantId, {
    provider: provider.name,
    provider_subscription_id: created.id,
    plan_code: planCode,
    status: created.status,
    amount: planRow.amount,
    currency: planRow.currency,
    cancel_at_period_end: false,
    canceled_at: null,
    grace_ends_at: null,
  });

  return json({
    ok: true,
    subscription_id: created.id,
    status: created.status,
    approve_url: created.approveUrl,
  });
});
