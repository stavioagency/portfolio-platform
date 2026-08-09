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
import { PAYPAL_ENV } from "../_shared/paypal.ts";
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

// PAYPAL DROPS billing_info.next_billing_time THE MOMENT A SUBSCRIPTION IS
// CANCELLED. Verified against the real stored payloads: both cancellations on
// this project show next_billing_time present on ACTIVATED and gone on
// CANCELLED, while last_payment.time survives. So getSubscription() reports
// `currentPeriodEnd: null` for anything cancelled — permanently, not while some
// value settles.
//
// That makes a re-read after cancellation a REVOCATION if it is written
// straight through. The entitlement predicate is
// `status = 'canceled' AND current_period_end > now()`, so a null takes away
// access the customer has already paid for — and the branch below spends three
// tiers of care avoiding exactly that when it handles the cancellation itself.
// The danger is the OTHER branches: an ACTIVATED, UPDATED or
// PAYMENT.SALE.COMPLETED that lands after PayPal has flipped to CANCELLED used
// to overwrite a good date with null. PayPal does not guarantee delivery order
// and retries for three days, so "after" is a real ordering, not a theoretical
// one — and the loss scales with the plan: a month at worst on monthly, up to a
// full year on yearly.
//
// So: PayPal stays authoritative whenever it actually has an answer, and "no
// answer" means LEAVE IT ALONE rather than erase it. Never the other way round.
export function keepPeriodEnd(
  remoteEnd: string | null | undefined,
  knownEnd: string | null | undefined,
): string | null {
  return remoteEnd ?? knownEnd ?? null;
}

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
    // NOT keepPeriodEnd(), deliberately: this path only runs when there is no
    // local row to keep anything from (guarded above). Whatever PayPal says,
    // including nothing, is all we have.
    current_period_end: remote.currentPeriodEnd,
    // The other path that brings a subscription into existence. The event got
    // here through a verified webhook signature and the row was read back from
    // this environment's PayPal, so the environment is known rather than
    // assumed. See section-n-subscription-environment.sql.
    environment: PAYPAL_ENV,
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
        // Never null out a date we already know — see keepPeriodEnd(). This is
        // the branch that had to survive "activated lands after cancelled": it
        // already guarded `status` and `cancel_at_period_end` for that case and
        // left the date beside them unprotected.
        current_period_end: keepPeriodEnd(remote.currentPeriodEnd, sub.current_period_end),
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

      // A SELF-SIGNUP WORKSPACE GOES LIVE HERE, AND ONLY HERE.
      //
      // signup-verify creates it with status 'disabled', so the public site
      // 404s (lib/tenant.js) until somebody has actually paid. This is the one
      // line that reverses that, and it is deliberately in the webhook rather
      // than anywhere the browser can reach: coming back from PayPal means the
      // customer approved a subscription, not that it was charged.
      //
      // Scoped to created_via = 'self_signup' on purpose. An operator-created
      // workspace that was suspended by hand must stay suspended — its status
      // is an operator decision, not a billing outcome, and reactivating it
      // because a payment landed would silently overrule that.
      if (remote.status === "active") {
        const { error: activateErr } = await admin
          .from("tenants")
          .update({ status: "active" })
          .eq("id", tenantId)
          .eq("created_via", "self_signup")
          .eq("status", "disabled");
        // Not fatal: the subscription is recorded either way and the customer
        // is entitled. A site that is still dark is visible and fixable; losing
        // the payment record would not be.
        if (activateErr) {
          console.error("[billing-webhook] could not activate the self-signup tenant:", activateErr.message);
        }
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
        // A retried PAYMENT.SALE.COMPLETED can land after a cancellation —
        // PayPal retries for three days — and the re-read would then report no
        // period end at all. Keep what we know. See keepPeriodEnd().
        current_period_end: keepPeriodEnd(remote.currentPeriodEnd, sub.current_period_end),
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
      // keeps a cancelled subscription entitled until current_period_end.
      //
      // WHICH MAKES A NULL current_period_end A REVOCATION. The entitlement
      // predicate is `current_period_end > now()`, and null fails it, so
      // writing `canceled` without a date takes away access the customer has
      // already paid for — the exact opposite of the intent above. The column
      // is null whenever activation arrived without a next_billing_time.
      //
      // So: use what we have, else ask PayPal, else fall back — but never
      // write null.
      let periodEnd: string | null = sub.current_period_end ?? null;

      if (!periodEnd) {
        try {
          const remote = await provider.getSubscription(event.subscriptionId);
          periodEnd = remote.currentPeriodEnd ?? null;
        } catch (err) {
          // Not fatal. The fallback below is what protects the customer.
          console.error("[billing-webhook] could not read the remote period end:", err);
        }
      }

      if (!periodEnd) {
        // A deliberate over-grant. We cannot determine when the paid period
        // ends, and the two ways to be wrong are not symmetric: an extra month
        // of access costs one month, wrongly cutting off a paying customer
        // costs the customer. Err toward them, and make it visible.
        periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
        console.warn(
          `[billing-webhook] no period end for ${event.subscriptionId} — granting 31 days rather than revoking`,
        );
      }

      await upsertSubscription(admin, tenantId, {
        status: "canceled",
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        current_period_end: periodEnd,
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
