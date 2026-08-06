// provider.ts — the billing provider INTERFACE.
//
// Everything above this line is provider-agnostic: the Edge Functions, the
// database, the React screens. Everything below it is one file per provider.
// Swapping PayPal for something else, or running two at once, means writing a
// new object that satisfies BillingProvider and registering it here. No table
// changes, no UI changes, no changes to the state machine.
//
// The interface is deliberately small. It is the intersection of what this
// product needs, not the union of what a provider can do — a wider interface
// would be shaped by whichever provider was implemented first, which is exactly
// the coupling this file exists to prevent.
//
// TWO RULES EVERY ADAPTER MUST FOLLOW
//
//   1. Return OUR vocabulary, never the provider's. `mapStatus` is the only
//      place a provider's words are allowed to exist, and the values it
//      produces must be in SUBSCRIPTION_STATUSES below — the same list the
//      database CHECK constraint and lib/billing-status.js use.
//
//   2. Fail closed. An unrecognised status maps to 'expired', not 'active'.
//      A verification error is a rejection, not a warning. Money is the one
//      place where "I'm not sure" must mean "no".

// Our status vocabulary. Must stay in step with the CHECK constraint in
// supabase/sections/section-h-billing.sql and BILLING_STATES in
// lib/billing-status.js.
export const SUBSCRIPTION_STATUSES = [
  "pending",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
  "comped",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "voided";

// What a webhook means, once the provider's vocabulary has been stripped off.
// The webhook function switches on THIS, so adding a provider does not touch it.
export type BillingEventKind =
  | "subscription_activated"
  | "subscription_updated"
  | "subscription_cancelled"
  | "subscription_suspended"
  | "subscription_expired"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "dispute_opened"
  | "ignored";

export interface NormalizedEvent {
  id: string; // the provider's event id — the idempotency key
  kind: BillingEventKind;
  type: string; // the provider's own name, kept for the audit trail
  subscriptionId: string | null;
  // Our own tenant id, echoed back by the provider on every event about this
  // subscription. It is what lets a webhook be attributed when our local row is
  // missing, instead of being dropped while the customer is charged.
  customId: string | null;
  paymentId: string | null;
  amount: number | null; // minor units
  currency: string | null;
  reason: string | null; // failure/cancellation reason, when the provider gives one
  occurredAt: string | null;
}

export interface RemoteSubscription {
  id: string;
  status: SubscriptionStatus;
  planId: string | null;
  payerId: string | null;
  payerEmail: string | null;
  currentPeriodEnd: string | null;
  nextBillingTime: string | null;
}

export interface CreateSubscriptionInput {
  planId: string; // the PROVIDER's plan id, from provider_plans
  tenantId: string;
  workspaceName: string;
  returnUrl: string;
  cancelUrl: string;
  locale: string; // 'ar' | 'en'
}

export interface CreateSubscriptionResult {
  id: string;
  status: SubscriptionStatus;
  // Where to send the customer to approve it. Null would mean the provider
  // activated it outright, which PayPal never does.
  approveUrl: string | null;
}

export interface ReviseResult {
  // A plan change may need re-approval; when it does, the customer has to be
  // sent back to the provider before anything takes effect.
  approveUrl: string | null;
  effectiveImmediately: boolean;
}

export interface BillingProvider {
  readonly name: string;

  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  getSubscription(id: string): Promise<RemoteSubscription>;
  cancelSubscription(id: string, reason: string): Promise<void>;
  reviseSubscription(id: string, newPlanId: string): Promise<ReviseResult>;

  // Returns true ONLY if the payload provably came from the provider.
  verifyWebhook(req: Request, rawBody: string): Promise<boolean>;
  normalizeEvent(payload: unknown): NormalizedEvent;

  // Plan catalogue management, used by billing-plans-sync.
  ensureProduct(name: string, description: string): Promise<string>;
  createPlan(input: {
    productId: string;
    planCode: string;
    name: string;
    amount: string; // decimal string in the provider's format
    currency: string;
    interval: "month" | "year";
    intervalCount: number;
  }): Promise<string>;
}

// The registry. One line per provider; the environment picks which is live, so
// a rollback is a config change rather than a deploy.
import { paypal } from "./paypal.ts";

const PROVIDERS: Record<string, BillingProvider> = {
  paypal,
};

export function getProvider(name?: string): BillingProvider {
  const key = (name || Deno.env.get("BILLING_PROVIDER") || "paypal").toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) throw new Error(`unknown_billing_provider: ${key}`);
  return provider;
}
