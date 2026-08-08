// billing-db.ts — the database side of billing, shared by every billing
// function. Provider-agnostic: nothing here knows what PayPal is.
//
// Every write in this file runs as the service role. That is deliberate and it
// is the whole security model: section-h-billing.sql grants the browser SELECT
// and nothing else, so these functions are the only path by which a
// subscription can come into existence or change state.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { PaymentStatus, SubscriptionStatus } from "./provider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

// A client bound to the CALLER's JWT, so RLS and the is_* helpers answer for
// them and not for us. Never use the service role to decide permissions.
export function callerClient(authHeader: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

// How long a suspended subscription keeps access. Mirrors GRACE_DAYS in
// lib/billing-status.js — the UI counts the days down, this sets the date.
export const GRACE_DAYS = 7;

export function graceEnd(from: Date = new Date()): string {
  return new Date(from.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export async function activeProviderPlan(
  admin: SupabaseClient,
  provider: string,
  environment: string,
  planCode: string,
) {
  const { data, error } = await admin
    .from("provider_plans")
    .select("provider_plan_id, amount, currency")
    .eq("provider", provider)
    .eq("environment", environment)
    .eq("plan_code", planCode)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`plan_lookup_failed: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
export interface SubscriptionPatch {
  provider?: string;
  provider_subscription_id?: string | null;
  plan_code?: string;
  status?: SubscriptionStatus;
  amount?: number | null;
  currency?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  grace_ends_at?: string | null;
  canceled_at?: string | null;
}

// One row per tenant, so this is "update if present, insert if not".
//
// IT IS NOT AN UPSERT, and that is not a style choice. PostgREST implements
// upsert as INSERT ... ON CONFLICT DO UPDATE, and Postgres checks NOT NULL on
// the proposed row BEFORE conflict resolution. Every webhook patch is partial —
// `{ status }`, `{ grace_ends_at }` — so an upsert of one of those against an
// existing row is rejected for a null `plan_code`, and the subscription silently
// stops tracking reality while PayPal keeps charging. Found in Section 3; it
// would have failed on the very first ACTIVATED webhook.
export async function upsertSubscription(
  admin: SupabaseClient,
  tenantId: string,
  patch: SubscriptionPatch,
) {
  const { data: updated, error: updErr } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("tenant_id", tenantId)
    .select("*");
  if (updErr) throw new Error(`subscription_write_failed: ${updErr.message}`);
  // An RLS- or predicate-filtered UPDATE reports success having changed nothing
  // (HANDOFF §6), so the affected rows decide whether to insert — never `error`.
  if (updated && updated.length > 0) return updated[0];

  // No row yet. An insert needs the NOT NULL columns, so a caller that only
  // sent a partial patch is a bug worth failing loudly on rather than writing a
  // subscription with a guessed plan.
  if (!patch.plan_code || !patch.status) {
    throw new Error(`subscription_missing_for_tenant_${tenantId}`);
  }
  const { data: inserted, error: insErr } = await admin
    .from("subscriptions")
    .insert({ tenant_id: tenantId, ...patch })
    .select("*")
    .single();
  if (insErr) throw new Error(`subscription_write_failed: ${insErr.message}`);
  return inserted;
}

export async function subscriptionByProviderId(admin: SupabaseClient, provider: string, id: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("provider", provider)
    .eq("provider_subscription_id", id)
    .maybeSingle();
  if (error) throw new Error(`subscription_lookup_failed: ${error.message}`);
  return data;
}

// Which of OUR plan codes does a provider plan id correspond to? Used to heal a
// subscription that exists at the provider but not here — the provider knows
// its own plan id and nothing else about our catalogue.
export async function planCodeForProviderPlan(
  admin: SupabaseClient,
  provider: string,
  providerPlanId: string,
) {
  const { data, error } = await admin
    .from("provider_plans")
    .select("plan_code, amount, currency")
    .eq("provider", provider)
    .eq("provider_plan_id", providerPlanId)
    // Deliberately NOT filtered on active: a subscriber may be on a plan whose
    // price has since been superseded, and that is exactly who needs healing.
    .maybeSingle();
  if (error) throw new Error(`plan_reverse_lookup_failed: ${error.message}`);
  return data;
}

export async function subscriptionByTenant(admin: SupabaseClient, tenantId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`subscription_lookup_failed: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Comp intent
// ---------------------------------------------------------------------------
// DELIBERATELY NOT PART OF SubscriptionPatch. comp_kind is metadata about a
// GRANT — who we intend to ask to pay — while every other write in this file is
// driven by something the provider said about a subscription. Folding it into
// the generic patch would let a future webhook branch carry it along by
// accident, and the one thing an operator's intent must never be is a side
// effect of a PayPal event.
//
// THE `status = 'comped'` FILTER IS THE POINT. section-m-convertible-comps.sql
// records that comp_kind is meaningful only for a comped row; this makes that
// structural rather than advisory. The statement cannot touch a paid, pending
// or cancelled row even if a caller's validation were bypassed, so the worst a
// bug upstream can do is fail to write.
//
// IT CHANGES NO ENTITLEMENT. tenant_has_active_subscription() does not read
// comp_kind and must never read it: a comp stays entitled whichever kind it is.
// Being wrong here costs a wrong button, never a client's access.
//
// Returns the updated row, or null when nothing matched — an RLS- or
// predicate-filtered UPDATE reports success having changed nothing (HANDOFF
// §6), so the caller must be able to tell "not a comp" from "done".
export async function setCompKind(
  admin: SupabaseClient,
  tenantId: string,
  kind: "grandfather" | "convertible",
) {
  const { data, error } = await admin
    .from("subscriptions")
    .update({ comp_kind: kind })
    .eq("tenant_id", tenantId)
    .eq("status", "comped")
    .select("tenant_id, status, comp_kind");
  if (error) throw new Error(`comp_kind_write_failed: ${error.message}`);
  return data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Payments and invoices
// ---------------------------------------------------------------------------
export interface PaymentInput {
  tenantId: string;
  subscriptionId: string | null;
  provider: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  description?: string | null;
  failureReason?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

// Returns { inserted } so the caller can tell a first delivery from a replay.
//
// THE DUPLICATE CASE IS THE NORMAL CASE. PayPal retries a webhook for up to
// three days; the unique (provider, provider_payment_id) index is what makes
// the second, third and tenth delivery free. `ignoreDuplicates` turns the
// conflict into a no-op instead of an error, so a replay does not look like a
// failure and get retried forever.
export async function recordPayment(admin: SupabaseClient, input: PaymentInput) {
  const { data, error } = await admin
    .from("payments")
    .upsert({
      tenant_id: input.tenantId,
      subscription_id: input.subscriptionId,
      provider: input.provider,
      provider_payment_id: input.providerPaymentId,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      description: input.description ?? null,
      failure_reason: input.failureReason ?? null,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
    }, { onConflict: "provider,provider_payment_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`payment_write_failed: ${error.message}`);
  return { inserted: !!data, id: data?.id ?? null };
}

export async function markPaymentRefunded(
  admin: SupabaseClient,
  provider: string,
  providerPaymentId: string,
) {
  const { data, error } = await admin
    .from("payments")
    .update({ status: "refunded" })
    .eq("provider", provider)
    .eq("provider_payment_id", providerPaymentId)
    .select("id, tenant_id");
  if (error) throw new Error(`refund_write_failed: ${error.message}`);
  // An RLS-or-predicate-filtered UPDATE reports success having changed nothing
  // (HANDOFF §6). Zero rows here means the refund is for a payment we never
  // saw, which the caller must be able to notice.
  return data?.[0] ?? null;
}

export async function issueInvoice(admin: SupabaseClient, input: {
  tenantId: string;
  subscriptionId: string | null;
  paymentId: string | null;
  amount: number;
  currency: string;
  status: "open" | "paid" | "void" | "uncollectible";
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  const { data: numberRow, error: numErr } = await admin.rpc("next_invoice_number");
  if (numErr) throw new Error(`invoice_number_failed: ${numErr.message}`);
  const { error } = await admin.from("invoices").insert({
    tenant_id: input.tenantId,
    subscription_id: input.subscriptionId,
    payment_id: input.paymentId,
    number: numberRow,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    period_start: input.periodStart ?? null,
    period_end: input.periodEnd ?? null,
    paid_at: input.status === "paid" ? new Date().toISOString() : null,
  });
  if (error) throw new Error(`invoice_write_failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export async function upsertCustomer(admin: SupabaseClient, input: {
  tenantId: string;
  provider: string;
  providerCustomerId?: string | null;
  email?: string | null;
}) {
  const { error } = await admin.from("billing_customers").upsert({
    tenant_id: input.tenantId,
    provider: input.provider,
    provider_customer_id: input.providerCustomerId ?? null,
    email: input.email ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,provider" });
  if (error) throw new Error(`customer_write_failed: ${error.message}`);
}
