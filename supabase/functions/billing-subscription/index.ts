// billing-subscription — everything a subscriber or an owner can DO to an
// existing subscription: cancel it, change plan, or (owners) mint a payment
// link for a client.
//
// Deployed WITH the JWT check (the default): every action here needs a session.
//     supabase functions deploy billing-subscription
//
// THE RULE THAT SHAPES EVERY ACTION: change it at PayPal FIRST, and let the
// webhook write the row. A local row saying "cancelled" while PayPal keeps
// billing every month is the worst possible failure — the customer sees a
// cancelled subscription and their statement disagrees. So nothing here writes
// `status` on the strength of a request; it writes only what the provider has
// already confirmed, and leaves the rest to BILLING.SUBSCRIPTION.*.
//
// Body: { action: 'cancel' | 'change_plan' | 'create_link', tenant_id, ... }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, json, isUuid } from "../_shared/http.ts";
import { getProvider } from "../_shared/provider.ts";
import { PAYPAL_ENV } from "../_shared/paypal.ts";
import { signGrant } from "../_shared/grant.ts";
import {
  adminClient,
  callerClient,
  activeProviderPlan,
  subscriptionByTenant,
  upsertSubscription,
} from "../_shared/billing-db.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const action = String(body.action ?? "");
  const tenantId = String(body.tenant_id ?? "");
  if (!isUuid(tenantId)) return json({ error: "invalid_tenant_id" }, 400);

  // Authorisation against the CALLER's own token. is_tenant_admin() is already
  // true for platform owners, so one check covers a client managing their own
  // subscription and an owner managing a client's.
  const caller = callerClient(authHeader);
  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who?.user) return json({ error: "invalid_token" }, 401);
  const { data: mayAdmin, error: authzErr } = await caller.rpc("is_tenant_admin", { tid: tenantId });
  if (authzErr) return json({ error: "authz_check_failed", detail: authzErr.message }, 500);
  if (mayAdmin !== true) return json({ error: "forbidden" }, 403);

  const admin = adminClient();
  const provider = getProvider();

  // ---------------------------------------------------------------------
  // create_link — the owner's WhatsApp payment link (door 2 of checkout).
  // ---------------------------------------------------------------------
  if (action === "create_link") {
    // Owners only. A client minting their own grant would be pointless rather
    // than dangerous — they already have a session — but "pointless" is not a
    // reason to widen who can sign a token.
    const { data: isOwner } = await caller.rpc("is_platform_owner");
    if (isOwner !== true) return json({ error: "forbidden_not_owner" }, 403);

    const planCode = String(body.plan_code ?? "");
    const planRow = await activeProviderPlan(admin, provider.name, PAYPAL_ENV, planCode);
    if (!planRow) return json({ error: "plan_not_available", plan_code: planCode }, 400);

    try {
      const grant = await signGrant(tenantId, planCode);
      return json({ ok: true, grant });
    } catch (err) {
      // Almost always the missing BILLING_GRANT_SECRET. Say so plainly — this
      // is an operator error, and the operator is the one reading it.
      return json({ error: "grant_signing_failed", detail: String((err as Error).message) }, 500);
    }
  }

  const sub = await subscriptionByTenant(admin, tenantId);
  if (!sub) return json({ error: "no_subscription" }, 404);

  // A comped workspace has no provider subscription to act on. Refusing here
  // is clearer than letting PayPal 404 on a null id.
  if (sub.status === "comped" || !sub.provider_subscription_id) {
    return json({ error: "not_a_paid_subscription", status: sub.status }, 409);
  }

  // ---------------------------------------------------------------------
  // cancel
  // ---------------------------------------------------------------------
  if (action === "cancel") {
    const reason = String(body.reason ?? "Cancelled by the customer");
    try {
      await provider.cancelSubscription(sub.provider_subscription_id, reason);
    } catch (err) {
      console.error("[billing-subscription] cancel failed:", err);
      return json({ error: "provider_error", detail: String((err as Error).message) }, 502);
    }
    // PayPal has accepted it, so record the INTENT now — the customer is owed
    // immediate feedback and BILLING.SUBSCRIPTION.CANCELLED can be seconds
    // away or minutes. `status` is deliberately left alone; the webhook sets
    // it. Access continues to current_period_end either way.
    await upsertSubscription(admin, tenantId, {
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
    });
    return json({ ok: true, cancel_at_period_end: true, access_until: sub.current_period_end });
  }

  // ---------------------------------------------------------------------
  // change_plan — upgrade or downgrade
  // ---------------------------------------------------------------------
  if (action === "change_plan") {
    const planCode = String(body.plan_code ?? "");
    if (planCode === sub.plan_code) return json({ error: "same_plan" }, 400);

    const planRow = await activeProviderPlan(admin, provider.name, PAYPAL_ENV, planCode);
    if (!planRow) return json({ error: "plan_not_available", plan_code: planCode }, 400);

    let result;
    try {
      result = await provider.reviseSubscription(sub.provider_subscription_id, planRow.provider_plan_id);
    } catch (err) {
      console.error("[billing-subscription] revise failed:", err);
      return json({ error: "provider_error", detail: String((err as Error).message) }, 502);
    }

    if (result.approveUrl) {
      // PayPal wants the customer to agree to the new price. NOTHING has
      // changed yet, so the row must not be updated — writing the new plan
      // here would show a plan they are not on and are not being billed for.
      return json({ ok: true, requires_approval: true, approve_url: result.approveUrl });
    }

    // Applied outright. The plan code is safe to record; the new period end
    // arrives with BILLING.SUBSCRIPTION.UPDATED.
    await upsertSubscription(admin, tenantId, {
      plan_code: planCode,
      amount: planRow.amount,
      currency: planRow.currency,
    });
    return json({ ok: true, requires_approval: false, plan_code: planCode });
  }

  return json({ error: "unknown_action", action }, 400);
});
