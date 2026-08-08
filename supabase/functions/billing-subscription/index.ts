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
// Body: { action: 'cancel' | 'change_plan' | 'create_link' | 'set_comp_kind',
//          tenant_id, ... }
//
// set_comp_kind is the odd one out and deliberately so: it touches no provider,
// it is owners-only, and it changes no entitlement. It records whether a comped
// workspace may ever be OFFERED a checkout. See the branch for why.
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
  setCompKind,
} from "../_shared/billing-db.ts";

// The only two values comp_kind may take, checked HERE rather than left to the
// database. section-m's CHECK constraint is the backstop, but a caller that
// sends "free" deserves a 400 naming the problem, not a 23514 surfaced as a 500.
//
// Exact match: no trimming, no case folding. "Convertible" is a typo in a
// hand-written request, and guessing what an operator meant about who gets
// asked to pay is not a kindness. Anything unrecognised — including null,
// undefined and a non-string — comes back null and is refused by the caller.
export function normalizeCompKind(value: unknown): "grandfather" | "convertible" | null {
  return value === "grandfather" || value === "convertible" ? value : null;
}

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
    // The hint names the fix, because this failure has exactly one cause worth
    // guessing at: the plans were never synced into provider_plans for this
    // PAYPAL_ENV. An owner reading "plan_not_available" on their own tooling
    // should not have to go and find that out.
    if (!planRow) {
      return json(
        { error: "plan_not_available", plan_code: planCode, hint: "run billing-plans-sync first" },
        400,
      );
    }

    try {
      const grant = await signGrant(tenantId, planCode);
      return json({ ok: true, grant });
    } catch (err) {
      // Almost always the missing BILLING_GRANT_SECRET. Say so plainly — this
      // is an operator error, and the operator is the one reading it.
      return json({ error: "grant_signing_failed", detail: String((err as Error).message) }, 500);
    }
  }

  // ---------------------------------------------------------------------
  // set_comp_kind — record whether a comped workspace is a permanent grant or
  // one we intend to convert to a paying subscription.
  // ---------------------------------------------------------------------
  // PLACED BEFORE THE PAID-SUBSCRIPTION GUARD BELOW, and it has to be. That
  // guard 409s on `status === "comped"`, which is precisely the population this
  // action exists to edit, so a branch added after it would be unreachable —
  // silently, with a passing deploy and a button that never works.
  //
  // OWNERS ONLY, and the check below is what enforces it. The generic
  // is_tenant_admin() check above is NOT sufficient: section F gives platform
  // owners tenant-admin parity, but it also passes an ordinary client admin on
  // their own workspace — who would otherwise be able to make their own comp
  // sellable, or refuse to be sellable. This line is the difference.
  //
  // WHAT THIS DOES NOT DO: change entitlement, in either direction.
  // tenant_has_active_subscription() does not read comp_kind and must never
  // read it, so the workspace is exactly as entitled after this call as before.
  // It also does not open a checkout: billing-checkout still refuses every
  // comped row, whatever its kind. This action records intent and nothing else.
  if (action === "set_comp_kind") {
    const { data: isOwner, error: ownerErr } = await caller.rpc("is_platform_owner");
    // The error is captured rather than folded into the boolean, unlike
    // create_link above: an RPC fault is not "you are not an owner", and
    // reporting it as one sends the operator looking in the wrong place.
    if (ownerErr) return json({ error: "authz_check_failed", detail: ownerErr.message }, 500);
    if (isOwner !== true) return json({ error: "forbidden_not_owner" }, 403);

    const kind = normalizeCompKind(body.comp_kind);
    if (!kind) {
      return json({ error: "invalid_comp_kind", allowed: ["grandfather", "convertible"] }, 400);
    }

    // READ BEFORE WRITE, so the record below can name the TRANSITION rather
    // than just the destination.
    //
    // This log line is the only record of an operator action. There is no audit
    // table, and billing_events is not one: it is raw provider webhooks keyed
    // on (provider, provider_event_id), and writing our own actions there would
    // corrupt both its meaning and its idempotency. `updated_at` moves too, but
    // the webhook touches that column as well, so it can say when and nothing
    // else. "convertible" on its own cannot tell a real change from a re-apply;
    // "grandfather -> convertible" can, and that is the question anyone
    // reconstructing "who made this client sellable" will actually be asking.
    const current = await subscriptionByTenant(admin, tenantId);
    if (!current) return json({ error: "no_subscription" }, 404);
    if (current.status !== "comped") {
      return json({ error: "not_a_comped_subscription", status: current.status }, 409);
    }
    const previous: string | null = current.comp_kind ?? null;

    const updated = await setCompKind(admin, tenantId, kind);
    if (!updated) {
      // The row stopped being a comp between the read above and this write.
      // setCompKind's own `status = 'comped'` filter is what caught it — which
      // is precisely why that filter lives on the statement and not only here.
      return json({ error: "not_a_comped_subscription", status: current.status }, 409);
    }

    console.log(
      `[billing-subscription] comp_kind ${previous ?? "unset"} -> ${kind} ` +
        `tenant=${tenantId} by=${who.user.id}`,
    );
    return json({
      ok: true,
      comp_kind: updated.comp_kind,
      previous_comp_kind: previous,
      // False when an operator re-applied the value a row already had. Saying
      // so beats reporting every call as a change.
      changed: previous !== kind,
    });
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
      // Already-cancelled is treated as SUCCESS inside the adapter — PayPal
      // answers 422 SUBSCRIPTION_STATUS_INVALID, and cancelSubscription() maps
      // that to a return rather than a throw. So a double-click, a retry, or a
      // customer who already cancelled from their own PayPal account all reach
      // the same end state without an error. Nothing extra is needed here.
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

    // A CANCELLED SUBSCRIPTION CANNOT BE REVISED AT PAYPAL. Cancellation is
    // terminal there — the same reason the UI offers "subscribe again" rather
    // than a resume button — so forwarding a revise for one can only come back
    // as a provider_error carrying PayPal's own wording. Refusing here turns
    // that into an answer the caller can act on.
    //
    // `cancel_at_period_end` is included alongside `status`, and it is the case
    // that actually happens: billing-subscription records the intent to cancel
    // immediately while leaving `status` for the webhook, so a customer who
    // cancels and then tries to change plan is still `active` locally for as
    // long as it takes BILLING.SUBSCRIPTION.CANCELLED to land. Checking status
    // alone would let exactly that window through.
    if (sub.status === "canceled" || sub.cancel_at_period_end) {
      return json({ error: "subscription_is_cancelled" }, 409);
    }

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
