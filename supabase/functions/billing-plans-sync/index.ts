// billing-plans-sync — mirror the plan catalogue into PayPal, once per
// environment, and record the resulting ids in provider_plans.
//
// WHY THIS EXISTS
// ---------------
// lib/billing-plans.js is the source of truth for what a plan costs. PayPal
// needs its own copy of that as a product + a plan, and hands back an id that
// is different in sandbox and live and changes whenever the price does. Neither
// id can live in the code, so this function creates them and writes the mapping
// to provider_plans.
//
// Owner-only, and safe to re-run: it skips any plan code that already has an
// ACTIVE mapping at the same price. Changing a price means running it again —
// the old mapping is deactivated and a new PayPal plan is created, which is the
// only way PayPal supports a price change for a plan that already has
// subscribers. EXISTING SUBSCRIBERS STAY ON THE OLD PLAN AND THE OLD PRICE.
// That is PayPal's model, not a limitation of this function: moving them costs
// a revise + a re-approval from each customer.
//
// Body: { plans: [{ code, name, amount, currency, interval, interval_count }] }
// The plan list is POSTED IN by the caller rather than imported, because
// lib/billing-plans.js is browser JavaScript in the Next app and this is Deno
// on Supabase — two runtimes with no shared module path. The admin screen sends
// what it is showing, so what gets created is exactly what the operator saw.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, json } from "../_shared/http.ts";
import { getProvider } from "../_shared/provider.ts";
import { PAYPAL_ENV } from "../_shared/paypal.ts";
import { adminClient, callerClient } from "../_shared/billing-db.ts";

const PRODUCT_NAME = "Designakum Portfolio";
const PRODUCT_DESCRIPTION = "Bilingual portfolio website subscription";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const caller = callerClient(authHeader);
  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who?.user) return json({ error: "invalid_token" }, 401);
  const { data: isOwner, error: ownerErr } = await caller.rpc("is_platform_owner");
  if (ownerErr) return json({ error: "owner_check_failed", detail: ownerErr.message }, 500);
  if (isOwner !== true) return json({ error: "forbidden_not_owner" }, 403);

  let body: { plans?: Array<Record<string, unknown>> };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const plans = Array.isArray(body.plans) ? body.plans : [];
  if (plans.length === 0) return json({ error: "no_plans" }, 400);

  const admin = adminClient();
  const provider = getProvider();

  let productId: string | null = null;
  const results: Array<Record<string, unknown>> = [];

  for (const plan of plans) {
    const code = String(plan.code ?? "");
    const amount = String(plan.amount ?? "");     // decimal string, e.g. "3.20"
    const currency = String(plan.currency ?? "");
    const interval = String(plan.interval ?? "");
    const intervalCount = Number(plan.interval_count ?? 1);

    if (!code || !amount || !currency || !["month", "year"].includes(interval)) {
      results.push({ code, skipped: "invalid_plan_definition" });
      continue;
    }

    // Already mapped at this exact price? Then there is nothing to do, and
    // creating another PayPal plan would leave two actives for one code.
    const { data: existing } = await admin
      .from("provider_plans")
      .select("provider_plan_id, amount, currency")
      .eq("provider", provider.name)
      .eq("environment", PAYPAL_ENV)
      .eq("plan_code", code)
      .eq("active", true)
      .maybeSingle();

    const minorAmount = Math.round(Number(amount) * (["JPY", "HUF", "TWD"].includes(currency) ? 1 : 100));
    if (existing && existing.amount === minorAmount && existing.currency === currency) {
      results.push({ code, unchanged: true, provider_plan_id: existing.provider_plan_id });
      continue;
    }

    try {
      // One product for the whole catalogue; created on first use.
      if (!productId) productId = await provider.ensureProduct(PRODUCT_NAME, PRODUCT_DESCRIPTION);

      const providerPlanId = await provider.createPlan({
        productId,
        planCode: code,
        name: `${PRODUCT_NAME} — ${code}`,
        amount,
        currency,
        interval: interval as "month" | "year",
        intervalCount,
      });

      // Deactivate the previous mapping BEFORE inserting the new one: the
      // partial unique index allows only one active row per (provider,
      // environment, plan_code), so the insert would otherwise fail.
      if (existing) {
        await admin.from("provider_plans")
          .update({ active: false })
          .eq("provider", provider.name)
          .eq("environment", PAYPAL_ENV)
          .eq("plan_code", code)
          .eq("active", true);
      }

      const { error: insErr } = await admin.from("provider_plans").insert({
        provider: provider.name,
        environment: PAYPAL_ENV,
        plan_code: code,
        provider_plan_id: providerPlanId,
        provider_product_id: productId,
        amount: minorAmount,
        currency,
        active: true,
      });
      if (insErr) throw new Error(insErr.message);

      results.push({ code, created: true, provider_plan_id: providerPlanId, replaced: existing?.provider_plan_id ?? null });
    } catch (err) {
      // One bad plan must not abandon the rest half-created.
      console.error(`[billing-plans-sync] ${code} failed:`, err);
      results.push({ code, error: String((err as Error).message ?? err) });
    }
  }

  return json({ ok: true, environment: PAYPAL_ENV, provider: provider.name, results });
});
