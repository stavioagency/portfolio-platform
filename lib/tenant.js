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

// Resolve the active tenant. ASYNC but NEVER throws — on any error it returns
// NO_TENANT, so a lookup failure renders 404 rather than leaking another
// tenant's portfolio.
//
//   resolveTenant({ supabase, host, slug })
//
// Resolution order:
//   1) host match via tenant_domains   2) slug via tenants   3) NO_TENANT (404)
export async function resolveTenant({ supabase, host, slug } = {}) {
  // No DB client -> nothing can be resolved; 404 rather than guess.
  if (!supabase) return NO_TENANT;

  // 1) Host / custom-domain match (skips neutral hosts; www-aware; fails safe)
  const byHost = await resolveTenantByHost(supabase, host);
  if (byHost) return byHost;

  // 2) Slug fallback
  if (slug) {
    const t = await lookupBySlug(supabase, String(slug).toLowerCase());
    if (t) return t;
  }

  // 3) Nothing matched -> 404. Never fall through to another tenant's portfolio.
  return NO_TENANT;
}

// Resolve a tenant from a request HOST only (custom domains). Exported so a future
// SSR page loader or middleware can reuse the exact same host logic without the
// slug/default parts. NEVER throws — returns null for neutral hosts, no match, or
// missing tables, so callers fall back to slug/default (current live behavior).
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
