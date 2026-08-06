// billing-webhook — the only thing that may activate, renew or end a
// subscription.
//
// Deployed WITHOUT the JWT gateway check, because PayPal does not have one:
//     supabase functions deploy billing-webhook --no-verify-jwt
// Authentication is the signature, verified below, and nothing else.
//
// THE ORDER OF OPERATIONS IS THE DESIGN
// -------------------------------------
//   1. read the RAW body — never a re-serialised object, or verification fails
//   2. verify the signature — an unverified payload is discarded, not logged
//      as pending and retried
//   3. INSERT into billing_events — the unique (provider, provider_event_id)
//      is what makes redelivery free. If the insert conflicts, this delivery
//      has already been handled and we return 200 immediately.
//   4. only then, apply it
//   5. stamp processed_at
//
// Steps 3 and 4 in that order are the whole idempotency story. PayPal retries
// for up to three days; without the event log a retried PAYMENT.SALE.COMPLETED
// would book the money twice and extend the period twice.
//
// WHY FAILURES STILL RETURN 200
// -----------------------------
// A 5xx makes PayPal retry, which is right for a transient fault and wrong for
// a permanent one — a malformed event we can never process would be redelivered
// for three days. So: signature failures and unprocessable events return 200
// with the reason recorded in billing_events.error, and genuinely transient
// database faults return 500 so the retry does some good.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json } from "../_shared/http.ts";
import { getProvider } from "../_shared/provider.ts";
import type { NormalizedEvent } from "../_shared/provider.ts";
import {
  adminClient,
  graceEnd,
  issueInvoice,
  markPaymentRefunded,
  planCodeForProviderPlan,
  recordPayment,
  subscriptionByProviderId,
  subscriptionByTenant,
  upsertCustomer,
  upsertSubscription,
} from "../_shared/billing-db.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const provider = getProvider();

  // 1. RAW body. Parsing first and re-serialising for verification is the
  //    classic way to make a valid signature look invalid.
  const rawBody = await req.text();

  // 2. Verify before anything else touches the database.
  const verified = await provider.verifyWebhook(req, rawBody);
  if (!verified) {
    // Deliberately terse and deliberately 200-free: an unverified caller learns
    // nothing about why, and PayPal never sees this branch.
    console.error("[billing-webhook] signature verification FAILED — discarding");
    return json({ error: "invalid_signature" }, 401);
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch {
    return json({ error: "invalid_json" }, 200);
  }

  const event: NormalizedEvent = provider.normalizeEvent(payload);
  if (!event.id) return json({ error: "missing_event_id" }, 200);

  const admin = adminClient();

  // 3. Claim the event. A conflict means someone already has it.
  const { data: claimed, error: claimErr } = await admin
    .from("billing_events")
    .upsert({
      provider: provider.name,
      provider_event_id: event.id,
      event_type: event.type,
      resource_id: event.subscriptionId ?? event.paymentId,
      payload: payload as Record<string, unknown>,
      signature_verified: true,
    }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();

  if (claimErr) {
    // A real database fault. Let PayPal retry — that is what retries are for.
    console.error("[billing-webhook] event log write failed:", claimErr.message);
    return json({ error: "storage_error" }, 500);
  }
  if (!claimed) {
    // Already processed. This is the normal case for a retry, not an error.
    return json({ ok: true, duplicate: true });
  }

  // 4. Apply.
  try {
    await apply(admin, provider.name, event);
    await admin.from("billing_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", claimed.id);
    return json({ ok: true });
  } catch (err) {
    const message = String((err as Error).message ?? err);
    console.error(`[billing-webhook] ${event.type} failed:`, message);
    await admin.from("billing_events").update({ error: message }).eq("id", claimed.id);
    // The event is logged with its error and can be replayed by hand. Returning
    // 200 stops a permanent failure from being redelivered for three days.
    return json({ ok: false, error: "processing_failed" }, 200);
  }
});

// Adopt a subscription that exists at the provider but not here.
//
// Everything is verified against the provider and the database before anything
// is written — the webhook body is NOT trusted to name a tenant. A forged
// custom_id would still have to survive signature verification, but the tenant
// is checked to exist and the plan is resolved from provider_plans by the plan
// id the PROVIDER reports, not by anything in the payload.
//
// Returns null when it cannot be done safely, and the caller then records the
// event with an error so it can be replayed by hand.
// deno-lint-ignore no-explicit-any
async function healMissingSubscription(
  admin: any,
  // deno-lint-ignore no-explicit-any
  provider: any,
  providerName: string,
  event: NormalizedEvent,
) {
  const tenantId = event.customId;
  if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return null;
  }

  const { data: tenant } = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) return null;

  // Never overwrite an existing subscription this way. A tenant that already
  // has one and is receiving events for a DIFFERENT provider subscription id is
  // a genuine double-subscription, which is a support problem, not something to
  // paper over by picking a winner.
  const current = await subscriptionByTenant(admin, tenantId);
  if (current && current.provider_subscription_id) return null;

  const remote = await provider.getSubscription(event.subscriptionId!);
  const planRow = remote.planId
    ? await planCodeForProviderPlan(admin, providerName, remote.planId)
    : null;
  if (!planRow) return null; // a plan we never created — refuse to guess

  console.warn(`[billing-webhook] adopting orphaned subscription ${event.subscriptionId} for tenant ${tenantId}`);
  return await upsertSubscription(admin, tenantId, {
    provider: providerName,
    provider_subscription_id: event.subscriptionId,
    plan_code: planRow.plan_code,
    status: remote.status,
    amount: planRow.amount,
    currency: planRow.currency,
    current_period_end: remote.currentPeriodEnd,
  });
}

// deno-lint-ignore no-explicit-any
async function apply(admin: any, providerName: string, event: NormalizedEvent) {
  if (event.kind === "ignored") return;
  if (!event.subscriptionId) throw new Error(`no_subscription_id_on_${event.type}`);

  const provider = getProvider(providerName);
  let sub = await subscriptionByProviderId(admin, providerName, event.subscriptionId);

  if (!sub) {
    // A webhook for a subscription we have no row for. Not theoretical: it
    // happens whenever checkout's database write fails after PayPal has already
    // created the subscription. The customer is being charged either way, so
    // dropping the event is the one unacceptable option.
    //
    // custom_id is our own tenant id, set at creation and echoed back on every
    // event, so the subscription can be adopted rather than lost.
    sub = await healMissingSubscription(admin, provider, providerName, event);
    if (!sub) throw new Error(`unknown_subscription_${event.subscriptionId}`);
  }

  const tenantId = sub.tenant_id;

  switch (event.kind) {
    case "subscription_activated":
    case "subscription_updated": {
      // Re-read the subscription from PayPal rather than trusting the webhook
      // body: events can arrive out of order, and the API always describes the
      // present. This is the difference between "activated" landing after
      // "cancelled" and quietly resurrecting a cancelled subscription.
      const remote = await provider.getSubscription(event.subscriptionId);
      await upsertSubscription(admin, tenantId, {
        status: remote.status,
        current_period_end: remote.currentPeriodEnd,
        // Activation clears any grace and any pending cancellation.
        grace_ends_at: remote.status === "active" ? null : sub.grace_ends_at,
        cancel_at_period_end: remote.status === "canceled" ? sub.cancel_at_period_end : false,
      });
      if (remote.payerId || remote.payerEmail) {
        await upsertCustomer(admin, {
          tenantId,
          provider: providerName,
          providerCustomerId: remote.payerId,
          email: remote.payerEmail,
        });
      }
      return;
    }

    case "payment_succeeded": {
      if (!event.paymentId || event.amount === null) throw new Error("payment_missing_fields");
      const { inserted, id } = await recordPayment(admin, {
        tenantId,
        subscriptionId: sub.id,
        provider: providerName,
        providerPaymentId: event.paymentId,
        amount: event.amount,
        currency: event.currency ?? sub.currency ?? "USD",
        status: "paid",
        description: `${sub.plan_code} subscription`,
      });
      // Only issue an invoice for a payment we had not already seen. The
      // payments insert is idempotent; issuing an invoice is not.
      if (inserted) {
        await issueInvoice(admin, {
          tenantId,
          subscriptionId: sub.id,
          paymentId: id,
          amount: event.amount,
          currency: event.currency ?? sub.currency ?? "USD",
          status: "paid",
        });
      }
      // A successful charge ends any grace period and re-activates a suspended
      // subscription. PayPal's own state is authoritative for the period end.
      const remote = await provider.getSubscription(event.subscriptionId);
      await upsertSubscription(admin, tenantId, {
        status: remote.status,
        current_period_start: new Date().toISOString(),
        current_period_end: remote.currentPeriodEnd,
        grace_ends_at: null,
      });
      return;
    }

    case "payment_failed": {
      if (event.paymentId && event.amount !== null) {
        await recordPayment(admin, {
          tenantId,
          subscriptionId: sub.id,
          provider: providerName,
          providerPaymentId: event.paymentId,
          amount: event.amount,
          currency: event.currency ?? sub.currency ?? "USD",
          status: "failed",
          failureReason: event.reason,
        });
      }
      // PayPal is still retrying at this point — it suspends only after the
      // failure threshold on the plan. So this opens the grace window and does
      // NOT revoke anything; the customer keeps working while their bank sorts
      // itself out.
      await upsertSubscription(admin, tenantId, {
        status: "past_due",
        grace_ends_at: sub.grace_ends_at ?? graceEnd(),
      });
      return;
    }

    case "subscription_suspended": {
      await upsertSubscription(admin, tenantId, {
        status: "past_due",
        grace_ends_at: sub.grace_ends_at ?? graceEnd(),
      });
      return;
    }

    case "subscription_cancelled": {
      // The paid period is NOT cut short — tenant_has_active_subscription()
      // keeps a cancelled subscription entitled until current_period_end,
      // because those days were bought.
      await upsertSubscription(admin, tenantId, {
        status: "canceled",
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
      });
      return;
    }

    case "subscription_expired": {
      await upsertSubscription(admin, tenantId, { status: "expired", grace_ends_at: null });
      return;
    }

    case "payment_refunded": {
      if (!event.paymentId) throw new Error("refund_missing_payment_id");
      const row = await markPaymentRefunded(admin, providerName, event.paymentId);
      if (!row) throw new Error(`refund_for_unknown_payment_${event.paymentId}`);
      // A refund does not itself cancel the subscription — PayPal sends a
      // separate cancellation when that is what happened. What it does mean is
      // that the period this money bought is no longer paid for, so entitlement
      // ends now rather than at a period end the customer no longer owns.
      await upsertSubscription(admin, tenantId, {
        status: "expired",
        current_period_end: new Date().toISOString(),
        grace_ends_at: null,
      });
      return;
    }

    case "dispute_opened": {
      // A chargeback is a refund plus a threat. Access stops immediately: the
      // money is already gone, and PayPal will not return it if the disputed
      // service kept running.
      await upsertSubscription(admin, tenantId, {
        status: "expired",
        current_period_end: new Date().toISOString(),
        grace_ends_at: null,
      });
      return;
    }
  }
}
