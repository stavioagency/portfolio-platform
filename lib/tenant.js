// lib/tenant.js
// -----------------------------------------------------------------------------
// Tenant resolver — FOUNDATION ONLY (multi-tenant Batch 2).
//
// This is a safe scaffold. It changes NO live behavior and is intentionally
// NOT wired into the public page or admin yet (that happens in later batches).
//
// Current reality (see MULTITENANT-PLAN.md + supabase-multitenant.sql):
//   * The DB is still single-tenant. `profile` has CONSTRAINT single_profile
//     CHECK (id = 1), so there is exactly ONE profile row today. This resolver
//     does NOT try to change that.
//   * The `tenants` / `tenant_domains` tables do NOT exist until the migration
//     is applied later. So this resolver MUST tolerate their absence and fall
//     back to the existing singleton profile. Every lookup is wrapped so it can
//     never throw or crash the app.
//
// What later batches will use this for (once the migration + backfill exist):
//   * f9designer.site         -> f9designer tenant   (host match)
//   * designakum.vercel.com   -> designakum tenant   (host match)
//   * future client domains   -> their tenant        (host match)
//   * /client-slug            -> slug fallback
//   * bare / on an unmapped host / localhost -> DEFAULT_TENANT (singleton)
//
// IMPORTANT: real per-tenant reads require the SQL migration + backfill from
// supabase-multitenant.sql. Until then, resolveTenant() always returns the
// singleton default (below), which maps to the existing profile row id = 1.
// -----------------------------------------------------------------------------

// Nothing matched. Callers render 404.
//
// This REPLACED a singleton fallback that returned `profile.id = 1`. That was
// left over from the single-tenant era, and once real clients existed it meant
// every unresolvable request rendered whichever tenant happened to own profile 1
// — in production that was a client's live portfolio. A domain pointed at Vercel
// but not yet added to tenant_domains served that client's site to strangers.
//
// Tenants are separate sites: if we cannot say WHICH one is being asked for, the
// answer is "not found", never someone else's portfolio. Every profile row now
// carries a tenant_id, so nothing depends on the old singleton path.
export const NO_TENANT = Object.freeze({
  id: null,
  slug: null,
  mode: 'none',
  profileId: null,
});

// Kept as an alias so any older import keeps resolving; both now mean "404".
export const DEFAULT_TENANT = NO_TENANT;

// A host that IS mapped in tenant_domains but whose tenant is unusable (disabled, or
// the tenant row is gone). We must NOT fall back to the singleton here: that would
// serve the default tenant's portfolio on a client's own domain. Callers render 404.
export const BLOCKED_TENANT = Object.freeze({
  id: null,
  slug: null,
  mode: 'blocked',
  profileId: null,
});

// Normalize a request Host header to a bare host key: lowercase, no scheme, no
// port, no trailing dot. Does NOT strip `www.` — exact rows are matched first
// (both apex and www can be seeded as separate tenant_domains rows).
export function normalizeHost(host) {
  if (!host || typeof host !== 'string') return '';
  return host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

// Hosts that must never be treated as a customer domain -> fall through to
// slug/default (local dev + Vercel preview/build URLs).
function isNeutralHost(host) {
  if (!host) return true;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.vercel.app') // preview/build URLs; real client domains are custom
  );
}

// TWO INDEPENDENT GATES DECIDE WHETHER A PUBLIC SITE RENDERS. Keeping them
// separate is the whole design here, so neither can quietly overrule the other:
//
//   1. tenants.status === 'disabled'  — the OPERATOR's decision. Manual,
//      durable, and never written by billing. Checked in toTenant(), unchanged.
//   2. entitlement                    — whether the workspace is paid up,
//      evaluated LIVE against current_period_end. Checked here.
//
// Nothing writes a column to represent (2). A cancelled subscription serves
// until current_period_end and stops the moment it passes, with no sweep, no
// cron and no row that can go stale — and an operator's manual suspension
// survives untouched, because billing still never writes tenants.status.
//
// The check is an RPC because this runs in the BROWSER on the anon key, and
// anon cannot read `subscriptions` — RLS restricts those rows to the tenant's
// own admins. tenant_has_active_subscription() is SECURITY DEFINER and anon
// holds EXECUTE on it, so the answer comes back as a bare boolean and no
// billing data ever reaches the page. See section-l-public-site-entitlement.sql.
//
// IT FAILS OPEN, AND THAT IS DELIBERATE.
// This resolver is fail-CLOSED about tenant IDENTITY: if it cannot say which
// tenant was asked for, it 404s rather than risk serving someone else's
// portfolio. Entitlement is a different axis. Failing open here serves the
// CORRECT tenant who may not have paid; failing closed would take every client
// site dark on an RPC blip. The two ways to be wrong are not symmetric — the
// same reasoning billing-webhook uses when it grants 31 days rather than
// revoking a period it cannot measure.
async function isSiteEntitled(supabase, tenantId) {
  if (!tenantId) return false;
  try {
    const { data, error } = await supabase.rpc('tenant_has_active_subscription', { tid: tenantId });
    if (error) {
      console.error('[tenant] entitlement check failed — serving anyway:', error.message || error);
      return true;
    }
    // Explicitly `=== true`: a null from a tenant that has no subscription row
    // must read as "not entitled", not as "truthy enough".
    return data === true;
  } catch (e) {
    console.error('[tenant] entitlement check threw — serving anyway:', e);
    return true;
  }
}

// Resolve the active tenant. ASYNC but NEVER throws — on any error it returns
// NO_TENANT, so a lookup failure renders 404 rather than leaking another
// tenant's portfolio.
//
//   resolveTenant({ supabase, host, slug })
//
// Resolution order:
//   1) explicit slug via tenants (a named tenant wins; miss = 404, no fallback)
//   2) host match via tenant_domains, when there is no slug
//   3) NO_TENANT (404)
//
// A tenant that resolves but is not entitled is treated exactly as a disabled
// one on the SAME path: 404 by slug, blocked by host. Both render 404, and
// mirroring the existing shapes keeps callers from needing a third case.
export async function resolveTenant({ supabase, host, slug } = {}) {
  // No DB client -> nothing can be resolved; 404 rather than guess.
  if (!supabase) return NO_TENANT;

  // 1) An EXPLICIT slug wins over the host.
  //
  // Host used to be checked first, which broke every /slug URL opened from a
  // mapped domain: on f9designer.site the host matched and returned before the
  // slug was ever read, so f9designer.site/ahmad-demo served f9designer. The
  // admin's live preview loads `${window.location.origin}/${slug}`, so an owner
  // working from a custom domain saw that tenant's portfolio no matter which
  // workspace they switched to.
  //
  // The URL is the more specific request: if it names a tenant, honour it. All
  // portfolio content is public, so serving /ahmad-demo from another mapped
  // domain exposes nothing that /ahmad-demo does not already show.
  if (slug) {
    const t = await lookupBySlug(supabase, String(slug).toLowerCase());
    // A slug that names no usable tenant is a 404 — do NOT fall back to the
    // host, or a mistyped path would quietly serve the domain's own tenant.
    if (!t) return NO_TENANT;
    // Resolved and not operator-disabled. The second gate decides whether the
    // site is still paid for.
    if (!(await isSiteEntitled(supabase, t.id))) return NO_TENANT;
    return t;
  }

  // 2) No slug: the host decides (custom domains; skips neutral hosts; www-aware)
  const byHost = await resolveTenantByHost(supabase, host);
  if (byHost) {
    // Already BLOCKED_TENANT (mapped host, unusable tenant) — nothing to check.
    if (byHost.mode !== 'tenant') return byHost;
    // A lapsed tenant on its OWN mapped domain is blocked, not "not found":
    // the host is still theirs, so falling through to anything else would be
    // the isolation bug BLOCKED_TENANT exists to prevent.
    if (!(await isSiteEntitled(supabase, byHost.id))) return BLOCKED_TENANT;
    return byHost;
  }

  // 3) Nothing matched -> 404. Never fall through to another tenant's portfolio.
  return NO_TENANT;
}

// Resolve a tenant from a request HOST only (custom domains). Exported so a future
// SSR page loader or middleware can reuse the exact same host logic without the
// slug/default parts. NEVER throws — returns null for neutral hosts, no match, or
// missing tables, so callers fall back to slug/default (current live behavior).
//
// HOST MAPPING ONLY — this does NOT apply the entitlement gate. It answers
// "which tenant owns this host", not "may that tenant's site be served". Anything
// deciding whether to RENDER must go through resolveTenant(), or a lapsed
// workspace would be served straight past the check.
//
// Post-migration mapping this enables:
//   f9designer.site / www.f9designer.site -> f9designer tenant
//   designakum.vercel.com                 -> designakum tenant
//   <future client domain>                -> that client's tenant
export async function resolveTenantByHost(supabase, host) {
  if (!supabase) return null;
  const h = normalizeHost(host);
  if (!h || isNeutralHost(h)) return null;
  return lookupByDomain(supabase, h);
}

async function lookupByDomain(supabase, domain) {
  const candidates = domainCandidates(domain);
  if (candidates.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from('tenant_domains')
      .select('domain, tenants ( id, slug, status )')
      .in('domain', candidates);
    if (error || !data || data.length === 0) return null; // host not mapped -> default
    // Prefer an exact host match over the www-sibling.
    const row = data.find((r) => r.domain === domain) || data[0];
    // The host IS mapped to a tenant. If that tenant is unusable (disabled/missing),
    // block instead of falling through to the singleton — otherwise this client's
    // domain would render the default tenant's portfolio.
    return toTenant(row && row.tenants) || BLOCKED_TENANT;
  } catch (e) {
    return null; // tables missing / network / etc. -> fall through to default
  }
}

// Try the exact host, then its www-sibling, so apex and www both resolve even if
// only one of them is seeded in tenant_domains.
function domainCandidates(host) {
  if (!host) return [];
  if (host.startsWith('www.')) return [host, host.slice(4)];
  return [host, 'www.' + host];
}

async function lookupBySlug(supabase, slug) {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, slug, status')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data) return null;
    return toTenant(data);
  } catch (e) {
    return null;
  }
}

function toTenant(row) {
  if (!row || row.status === 'disabled') return null;
  return { id: row.id, slug: row.slug, mode: 'tenant', profileId: null };
}
