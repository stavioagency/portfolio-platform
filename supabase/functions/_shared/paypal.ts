// paypal.ts — the PayPal adapter. The ONLY file in this project that knows
// what PayPal calls things.
//
// It implements BillingProvider (see provider.ts) and translates in both
// directions: our plan/period vocabulary out, PayPal's statuses and event names
// back in.
//
// WHAT PAYPAL DOES FOR US, THAT WE THEREFORE DO NOT BUILD
// ------------------------------------------------------
// PayPal has real server-side subscription objects. It owns the billing
// schedule, charges the renewal itself, retries failures on its own dunning
// policy, and suspends after the configured number of failures. So there is no
// renewal scheduler, no retry ladder and no stored payment instrument in this
// codebase. Our job shrinks to: create it, revise it, cancel it, and believe the
// webhooks.
//
// WHAT PAYPAL DOES NOT DO
// -----------------------
//   * It cannot charge SAR. See lib/billing-plans.js — customers are quoted in
//     riyals and debited in dollars, and both figures are shown at checkout.
//   * A plan's price is effectively fixed once subscribers exist. Changing a
//     price means creating a NEW PayPal plan, which is why provider_plans maps
//     plan_code -> provider_plan_id per environment and keeps the old rows.
//
// ENVIRONMENT
//   PAYPAL_CLIENT_ID        required
//   PAYPAL_CLIENT_SECRET    required
//   PAYPAL_WEBHOOK_ID       required for webhook verification
//   PAYPAL_ENV              'sandbox' (default) | 'live'
import type {
  BillingProvider,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  NormalizedEvent,
  RemoteSubscription,
  ReviseResult,
  SubscriptionStatus,
} from "./provider.ts";

const CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET") ?? "";
const WEBHOOK_ID = Deno.env.get("PAYPAL_WEBHOOK_ID") ?? "";
export const PAYPAL_ENV = (Deno.env.get("PAYPAL_ENV") ?? "sandbox").toLowerCase();

const BASE = PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

// ---------------------------------------------------------------------------
// Auth. One OAuth token, cached until shortly before it expires.
// ---------------------------------------------------------------------------
// Cached in module scope, which on Edge Functions means "for the life of this
// warm instance" — a best-effort saving, never a correctness assumption. A cold
// instance simply fetches a new one.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("paypal_credentials_missing");
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`paypal_auth_failed_${res.status}`);
  const body = await res.json();
  // Refresh a minute early rather than at the boundary: a token that expires
  // mid-request produces a 401 that looks like a credentials problem.
  cachedToken = {
    value: body.access_token,
    expiresAt: now + Math.max(0, (Number(body.expires_in) || 0) - 60) * 1000,
  };
  return cachedToken.value;
}

async function api(path: string, init: RequestInit = {}, idempotencyKey?: string) {
  const token = await accessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };
  // PayPal's idempotency header. Sending it on every mutating call means a
  // retry after a network timeout cannot create a second subscription.
  if (idempotencyKey) headers["PayPal-Request-Id"] = idempotencyKey;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    // A hung provider call must not hold an Edge Function open until the
    // platform kills it — that is how a webhook ends up retried forever.
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = body?.details?.[0]?.description || body?.message || res.statusText;
    const err = new Error(`paypal_${res.status}: ${detail}`);
    // deno-lint-ignore no-explicit-any
    (err as any).status = res.status;
    // deno-lint-ignore no-explicit-any
    (err as any).body = body;
    throw err;
  }
  return body;
}

function findLink(links: Array<{ rel: string; href: string }> | undefined, rel: string) {
  return links?.find((l) => l.rel === rel)?.href ?? null;
}

// ---------------------------------------------------------------------------
// Status mapping — the ONLY place PayPal's vocabulary is allowed to exist.
// ---------------------------------------------------------------------------
// APPROVAL_PENDING / APPROVED both mean "created but not yet paying". APPROVED
// is the awkward one: the customer has agreed, but the first charge has not
// settled, so it is not entitlement yet. It becomes ACTIVE on activation.
//
// SUSPENDED is what PayPal does after its retries are exhausted, so it maps to
// past_due — our grace window, not an immediate cut-off.
const STATUS_MAP: Record<string, SubscriptionStatus> = {
  APPROVAL_PENDING: "pending",
  APPROVED: "pending",
  ACTIVE: "active",
  SUSPENDED: "past_due",
  CANCELLED: "canceled",
  EXPIRED: "expired",
};

export function mapStatus(paypalStatus: string | undefined): SubscriptionStatus {
  // Fail CLOSED. An unknown status is not access.
  return STATUS_MAP[String(paypalStatus ?? "").toUpperCase()] ?? "expired";
}

// PayPal event name -> what it means to us.
const EVENT_MAP: Record<string, NormalizedEvent["kind"]> = {
  "BILLING.SUBSCRIPTION.ACTIVATED": "subscription_activated",
  "BILLING.SUBSCRIPTION.RE-ACTIVATED": "subscription_activated",
  "BILLING.SUBSCRIPTION.UPDATED": "subscription_updated",
  "BILLING.SUBSCRIPTION.CANCELLED": "subscription_cancelled",
  "BILLING.SUBSCRIPTION.SUSPENDED": "subscription_suspended",
  "BILLING.SUBSCRIPTION.EXPIRED": "subscription_expired",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED": "payment_failed",
  "PAYMENT.SALE.COMPLETED": "payment_succeeded",
  "PAYMENT.SALE.DENIED": "payment_failed",
  "PAYMENT.SALE.REFUNDED": "payment_refunded",
  "PAYMENT.SALE.REVERSED": "payment_refunded",
  "CUSTOMER.DISPUTE.CREATED": "dispute_opened",
};

// PayPal amounts are decimal strings ("3.20"). Everything inside this project
// is integer minor units, so the conversion happens here, once.
function toMinorUnits(value: string | undefined, currency: string | undefined): number | null {
  if (!value) return null;
  const zeroDecimal = ["JPY", "HUF", "TWD"].includes(String(currency ?? "").toUpperCase());
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (zeroDecimal ? 1 : 100));
}

const INTERVAL_UNIT: Record<string, string> = { month: "MONTH", year: "YEAR" };

export const paypal: BillingProvider = {
  name: "paypal",

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const body = await api(
      "/v1/billing/subscriptions",
      {
        method: "POST",
        body: JSON.stringify({
          plan_id: input.planId,
          // custom_id rides along on every webhook PayPal sends about this
          // subscription. It is how a delivery is attributed to a tenant
          // without a lookup, and it is why a stray webhook cannot be applied
          // to the wrong workspace.
          custom_id: input.tenantId,
          application_context: {
            brand_name: "Designakum",
            // NO_SHIPPING, not NO_SHIPPING_ADDRESS. The enum is exactly
            // GET_FROM_FILE | NO_SHIPPING | SET_PROVIDED_ADDRESS, and PayPal
            // rejects anything else with a VALIDATION_ERROR — which is what
            // made every create-subscription call fail. There is nothing to
            // ship, so the address block is suppressed entirely.
            shipping_preference: "NO_SHIPPING",
            user_action: "SUBSCRIBE_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            // `locale` is deliberately NOT sent. PayPal documents it in two
            // formats across two API versions (ar_SA vs ar-SA), the accepted
            // list is not the obvious one, and a wrong value is another
            // VALIDATION_ERROR on the same call. Omitting it makes PayPal use
            // the buyer's own account language, which for a Saudi customer
            // paying with a Saudi PayPal account is the better default anyway.
          },
        }),
      },
      // Idempotent per tenant per minute: a double-click, or a retry after a
      // timeout, joins the existing subscription instead of creating a second.
      `sub-${input.tenantId}-${Math.floor(Date.now() / 60_000)}`,
    );

    return {
      id: body.id,
      status: mapStatus(body.status),
      approveUrl: findLink(body.links, "approve"),
    };
  },

  async getSubscription(id: string): Promise<RemoteSubscription> {
    const body = await api(`/v1/billing/subscriptions/${encodeURIComponent(id)}`);
    return {
      id: body.id,
      status: mapStatus(body.status),
      planId: body.plan_id ?? null,
      payerId: body.subscriber?.payer_id ?? null,
      payerEmail: body.subscriber?.email_address ?? null,
      currentPeriodEnd: body.billing_info?.next_billing_time ?? null,
      nextBillingTime: body.billing_info?.next_billing_time ?? null,
    };
  },

  async cancelSubscription(id: string, reason: string): Promise<void> {
    try {
      await api(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.slice(0, 127) }),
      });
    } catch (err) {
      // ALREADY CANCELLED IS SUCCESS. PayPal answers 422
      // SUBSCRIPTION_STATUS_INVALID when the subscription is not in a
      // cancellable state — which is exactly what a double-click, a retry, or
      // a customer cancelling from their own PayPal account produces. The
      // desired end state has been reached, so reporting failure would tell
      // someone their cancellation did not work when it did, and invite them
      // to try again or email support.
      // deno-lint-ignore no-explicit-any
      const e = err as any;
      const body = JSON.stringify(e?.body ?? {});
      const alreadyGone = e?.status === 422 &&
        /SUBSCRIPTION_STATUS_INVALID|status_invalid/i.test(body + String(e?.message ?? ""));
      if (alreadyGone) {
        console.warn(`[paypal] ${id} was already cancelled — treating as success`);
        return;
      }
      throw err;
    }
  },

  async reviseSubscription(id: string, newPlanId: string): Promise<ReviseResult> {
    const body = await api(`/v1/billing/subscriptions/${encodeURIComponent(id)}/revise`, {
      method: "POST",
      body: JSON.stringify({ plan_id: newPlanId }),
    });
    // PayPal returns an approval link when the change needs the customer to
    // agree again — a higher price usually does. When it does, nothing has
    // happened yet, and reporting success here would show a plan the customer
    // is not on.
    const approveUrl = findLink(body.links, "approve");
    return { approveUrl, effectiveImmediately: !approveUrl };
  },

  // -------------------------------------------------------------------------
  // Webhook verification — postback, not local crypto.
  // -------------------------------------------------------------------------
  // PayPal offers two routes: verify the certificate chain and signature
  // ourselves, or post the transmission back and let PayPal answer. This uses
  // the postback because the self-verification route requires fetching and
  // caching PayPal's certificate, checking its host, and getting CRC32 over the
  // raw body exactly right — three places to be subtly wrong in a way that
  // still returns "valid".
  //
  // The cost is one extra API call per webhook. That is a fine trade for a
  // volume measured in payments per day.
  async verifyWebhook(req: Request, rawBody: string): Promise<boolean> {
    if (!WEBHOOK_ID) {
      console.error("[paypal] PAYPAL_WEBHOOK_ID is not set — refusing to verify");
      return false;
    }
    const h = (name: string) => req.headers.get(name) ?? "";
    const transmissionId = h("paypal-transmission-id");
    const transmissionTime = h("paypal-transmission-time");
    const transmissionSig = h("paypal-transmission-sig");
    const certUrl = h("paypal-cert-url");
    const authAlgo = h("paypal-auth-algo");
    if (!transmissionId || !transmissionSig || !certUrl) return false;

    // The certificate URL comes from an attacker-controllable header. PayPal
    // will reject a foreign one, but a check here means we never even ask.
    let host = "";
    try { host = new URL(certUrl).hostname; } catch { return false; }
    if (!/^(api\.)?([a-z0-9-]+\.)*paypal\.com$/i.test(host)) {
      console.error("[paypal] refusing a cert_url outside paypal.com:", host);
      return false;
    }

    try {
      // The event must be posted back EXACTLY as received. Parsing and
      // re-serialising changes key order and number formatting, and PayPal
      // then reports a valid signature as invalid.
      const payload = `{"transmission_id":${JSON.stringify(transmissionId)},` +
        `"transmission_time":${JSON.stringify(transmissionTime)},` +
        `"cert_url":${JSON.stringify(certUrl)},` +
        `"auth_algo":${JSON.stringify(authAlgo)},` +
        `"transmission_sig":${JSON.stringify(transmissionSig)},` +
        `"webhook_id":${JSON.stringify(WEBHOOK_ID)},` +
        `"webhook_event":${rawBody}}`;

      const body = await api("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: payload,
      });
      return body?.verification_status === "SUCCESS";
    } catch (err) {
      // A verification that could not be completed is a verification that
      // failed. Never process on the assumption it would have passed.
      console.error("[paypal] webhook verification error:", err);
      return false;
    }
  },

  normalizeEvent(payload: unknown): NormalizedEvent {
    // deno-lint-ignore no-explicit-any
    const e = (payload ?? {}) as any;
    const type = String(e.event_type ?? "");
    const resource = e.resource ?? {};
    const kind = EVENT_MAP[type] ?? "ignored";

    // Subscription events carry the id on the resource; sale events carry it
    // as billing_agreement_id, which is the same subscription under an older
    // name PayPal never retired.
    const subscriptionId = resource.billing_agreement_id ??
      (type.startsWith("BILLING.SUBSCRIPTION") ? resource.id : null) ?? null;

    const amountObj = resource.amount ?? {};
    const currency = amountObj.currency_code ?? amountObj.currency ?? resource.total?.currency ?? null;
    const amount = toMinorUnits(amountObj.value ?? amountObj.total, currency);

    return {
      id: String(e.id ?? ""),
      kind,
      type,
      subscriptionId,
      // Set on createSubscription, and echoed on subscription events. Sale
      // events carry it too when the plan was created through us.
      customId: resource.custom_id ?? resource.custom ?? null,
      paymentId: type.startsWith("PAYMENT.SALE") ? (resource.id ?? null) : null,
      amount,
      currency,
      reason: resource.status_change_note ?? resource.reason ?? null,
      occurredAt: e.create_time ?? null,
    };
  },

  // -------------------------------------------------------------------------
  // Catalogue
  // -------------------------------------------------------------------------
  async ensureProduct(name: string, description: string): Promise<string> {
    const body = await api("/v1/catalogs/products", {
      method: "POST",
      body: JSON.stringify({
        name,
        description,
        type: "SERVICE",
        category: "SOFTWARE",
      }),
    }, `product-${name}`);
    return body.id;
  },

  async createPlan(input): Promise<string> {
    const body = await api("/v1/billing/plans", {
      method: "POST",
      body: JSON.stringify({
        product_id: input.productId,
        name: input.name,
        status: "ACTIVE",
        billing_cycles: [{
          frequency: {
            interval_unit: INTERVAL_UNIT[input.interval],
            interval_count: input.intervalCount,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          // 0 means "bill forever", which is what a subscription is. Any other
          // value silently stops charging after that many cycles.
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: input.amount, currency_code: input.currency },
          },
        }],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee_failure_action: "CONTINUE",
          // After three consecutive failures PayPal suspends the subscription,
          // which arrives as BILLING.SUBSCRIPTION.SUSPENDED and becomes our
          // past_due. This number IS the retry policy — we do not run one.
          payment_failure_threshold: 3,
        },
      }),
      // Same plan definition twice must not create two plans.
    }, `plan-${input.planCode}-${input.currency}-${input.amount}`);
    return body.id;
  },
};
