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
import { getProvider, type SubscriptionStatus } from "../_shared/provider.ts";
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

// STARTING A CHECKOUT MUST NEVER TAKE ACCESS AWAY.
//
// There is one subscription row per tenant (unique (tenant_id)), so the write
// at the end of this function UPDATES whatever is already there. Writing
// `pending` over it is normally harmless — a tenant with no subscription, or a
// lapsed one, has nothing to lose. A COMPED row does: `comped` is entitled
// unconditionally in tenant_has_active_subscription(), `pending` is entitled by
// nothing, and the gap between them is a live client's public site going dark.
//
// It would also be PERMANENT rather than momentary. Nothing walks a customer
// back from PayPal, so an approval that is simply abandoned leaves the row on
// `pending` forever with no event able to correct it — the section-K failure
// mode exactly: a recoverable mistake made unrecoverable.
//
// So a comped row keeps its status through checkout, and only the ACTIVATED
// webhook moves it. Everything else about the write is unchanged, and must be:
// `provider` and `provider_subscription_id` are what billing-webhook matches on
// (subscriptionByProviderId), so a row that withheld them would take the
// payment and never find its way home. Eleven of the comped rows carry
// provider = 'none' from section-h, which is precisely why the provider column
// has to be overwritten rather than preserved alongside the status.
//
// Comped is not currently reachable here — the already_subscribed guard below
// still refuses it — so this is the safety property being put in place BEFORE
// the gate that needs it, not a live code path.
export function checkoutStatus(
  existingStatus: string | null | undefined,
  createdStatus: SubscriptionStatus,
): SubscriptionStatus {
  return existingStatus === "comped" ? "comped" : createdStatus;
}

// Which local rows cannot be trusted to mean "no live subscription at PayPal"?
//
// `pending` is the original case: the customer may have approved seconds ago
// with the webhook still in flight. `comped` joins it for a converting
// workspace — once checkoutStatus() keeps the status, a first attempt leaves a
// comped row carrying a real provider_subscription_id, and a second attempt
// that skipped this check would create a parallel subscription and bill the
// customer twice, with only the newer one visible here.
//
// The provider id is what makes the question askable at all; without one there
// is nothing to look up and nothing that could already be live.
export function needsRemoteVerification(
  status: string | null | undefined,
  providerSubscriptionId: string | null | undefined,
): boolean {
  return !!providerSubscriptionId && (status === "pending" || status === "comped");
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
  //
  // needsRemoteVerification() extends the same protection to a comped row that
  // is mid-conversion — see checkoutStatus(). Adopting there writes a real
  // status over `comped`, which is not a revocation but an activation: they
  // approved, so they are entitled by payment instead of by grant. Nothing is
  // lost either way, because a comped row has no current_period_end to keep.
  if (needsRemoteVerification(existing?.status, existing?.provider_subscription_id)) {
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
  //
  // The one exception is a comped row, which keeps its status: see
  // checkoutStatus(). Everything else here is written either way, including for
  // a comp — the provider ids are what the webhook matches on, and the plan and
  // amount are what was actually bought. lib/billing-status.js keys `comped`
  // off the STATUS before it looks at any plan or date, so a comped row wearing
  // a real plan_code still reads as granted access until the webhook says
  // otherwise, and the Subscribers screen still keeps it out of MRR.
  await upsertSubscription(admin, tenantId, {
    provider: provider.name,
    provider_subscription_id: created.id,
    plan_code: planCode,
    status: checkoutStatus(existing?.status, created.status),
    amount: planRow.amount,
    currency: planRow.currency,
    cancel_at_period_end: false,
    canceled_at: null,
    grace_ends_at: null,
    // The subscription was just created at THIS environment's PayPal, against a
    // plan looked up with this same PAYPAL_ENV above — so this is recorded, not
    // guessed. Without it, sandbox and live subscriptions are indistinguishable
    // in the table; see section-n-subscription-environment.sql.
    environment: PAYPAL_ENV,
  });

  return json({
    ok: true,
    subscription_id: created.id,
    status: created.status,
    approve_url: created.approveUrl,
  });
});
