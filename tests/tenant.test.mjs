// Regression tests for the tenant resolver (lib/tenant.js).
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// These cover the rules that keep tenants isolated on ONE deployment:
//   * a mapped host resolves to its own tenant
//   * a mapped host whose tenant is disabled must NOT fall back to the singleton
//   * an UNmapped host resolves to NOTHING (404) - it must never fall back to
//     another tenant's portfolio
//   * slug fallback works when the host isn't mapped
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenant, resolveTenantByHost, normalizeHost, NO_TENANT } from '../lib/tenant.js';

// Minimal fake of the supabase client surface the resolver actually uses.
//
// `entitled` fakes tenant_has_active_subscription(). It defaults to TRUE so
// every pre-existing test below still describes the case it was written for —
// the entitlement gate is a second gate, not a replacement for the first.
// Pass a map of { tenantId: boolean } to vary it, or 'error' to make the RPC
// fail and exercise the fail-open path.
function makeSupabase({ domains = [], tenants = [], entitled = true } = {}) {
  return {
    rpc(fn, args) {
      if (fn !== 'tenant_has_active_subscription') throw new Error(`unexpected rpc: ${fn}`);
      if (entitled === 'error') {
        return Promise.resolve({ data: null, error: { message: 'boom' } });
      }
      const value = typeof entitled === 'object' && entitled !== null
        ? entitled[args.tid] === true
        : entitled === true;
      return Promise.resolve({ data: value, error: null });
    },
    from(table) {
      if (table === 'tenant_domains') {
        return {
          select: () => ({
            in: (_col, candidates) =>
              Promise.resolve({
                data: domains
                  .filter((d) => candidates.includes(d.domain))
                  .map((d) => ({ domain: d.domain, tenants: d.tenant })),
                error: null,
              }),
          }),
        };
      }
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: (_col, slug) => ({
              maybeSingle: () =>
                Promise.resolve({ data: tenants.find((t) => t.slug === slug) || null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const acme = { id: 'acme-uuid', slug: 'acme', status: 'active' };
const suspended = { id: 'susp-uuid', slug: 'suspended-co', status: 'disabled' };

test('normalizeHost lowercases and strips port / trailing dot', () => {
  assert.equal(normalizeHost('Client.COM:3000'), 'client.com');
  assert.equal(normalizeHost('client.com.'), 'client.com');
  assert.equal(normalizeHost(''), '');
  assert.equal(normalizeHost(undefined), '');
});

test('a mapped host resolves to its own tenant', async () => {
  const supabase = makeSupabase({ domains: [{ domain: 'acme.com', tenant: acme }] });
  const t = await resolveTenant({ supabase, host: 'acme.com' });
  assert.equal(t.mode, 'tenant');
  assert.equal(t.id, 'acme-uuid');
});

test('www sibling resolves even if only the apex is seeded', async () => {
  const supabase = makeSupabase({ domains: [{ domain: 'acme.com', tenant: acme }] });
  const t = await resolveTenant({ supabase, host: 'www.acme.com' });
  assert.equal(t.id, 'acme-uuid');
});

// The isolation regression: a suspended client's own domain must NOT render the
// default tenant's portfolio.
test('mapped host with a DISABLED tenant is blocked, not defaulted', async () => {
  const supabase = makeSupabase({ domains: [{ domain: 'suspended.com', tenant: suspended }] });
  const t = await resolveTenant({ supabase, host: 'suspended.com' });
  assert.equal(t.mode, 'blocked');
  assert.notEqual(t.mode, 'tenant');
});

test('UNmapped host resolves to nothing -> 404, never another tenant', async () => {
  const supabase = makeSupabase({ domains: [{ domain: 'acme.com', tenant: acme }] });
  const t = await resolveTenant({ supabase, host: 'not-mapped.com' });
  assert.deepEqual(t, NO_TENANT);
});

test('neutral hosts (localhost / *.vercel.app) never match a domain', async () => {
  const supabase = makeSupabase({ domains: [{ domain: 'acme.com', tenant: acme }] });
  assert.equal(await resolveTenantByHost(supabase, 'localhost'), null);
  assert.equal(await resolveTenantByHost(supabase, 'preview.vercel.app'), null);
});

test('slug fallback resolves when the host is not mapped', async () => {
  const supabase = makeSupabase({ tenants: [acme] });
  const t = await resolveTenant({ supabase, host: 'localhost', slug: 'acme' });
  assert.equal(t.mode, 'tenant');
  assert.equal(t.id, 'acme-uuid');
});

test('unknown slug resolves to nothing -> 404', async () => {
  const supabase = makeSupabase({ tenants: [acme] });
  const t = await resolveTenant({ supabase, host: 'localhost', slug: 'nope' });
  assert.deepEqual(t, NO_TENANT);
});

test('a disabled tenant is not reachable by slug either', async () => {
  const supabase = makeSupabase({ tenants: [suspended] });
  const t = await resolveTenant({ supabase, host: 'localhost', slug: 'suspended-co' });
  assert.deepEqual(t, NO_TENANT); // no tenant match -> caller 404s
});

test('no supabase client -> nothing (never throws)', async () => {
  assert.deepEqual(await resolveTenant({}), NO_TENANT);
});

// --- slug-vs-host precedence -------------------------------------------------
// The bug these lock down: host used to be checked BEFORE slug and returned
// early, so any /slug opened from a mapped domain served that domain's tenant.
// The admin's live preview loads `${window.location.origin}/${slug}`, so an
// owner working from f9designer.site saw f9designer's portfolio no matter which
// workspace they had selected.

const other = { id: 'other-uuid', slug: 'other-co', status: 'active' };

test('an explicit slug WINS over a mapped host', async () => {
  const supabase = makeSupabase({
    domains: [{ domain: 'acme.com', tenant: acme }],
    tenants: [acme, other],
  });
  const t = await resolveTenant({ supabase, host: 'acme.com', slug: 'other-co' });
  assert.equal(t.slug, 'other-co', 'the URL named a tenant; it must be honoured');
});

test('the host still decides when there is no slug', async () => {
  const supabase = makeSupabase({
    domains: [{ domain: 'acme.com', tenant: acme }],
    tenants: [acme, other],
  });
  const t = await resolveTenant({ supabase, host: 'acme.com', slug: null });
  assert.equal(t.slug, 'acme');
});

test('an unknown slug on a mapped host is a 404, not the host tenant', async () => {
  // Falling back to the host here would let a typo quietly serve the domain's
  // own portfolio under someone else's URL.
  const supabase = makeSupabase({
    domains: [{ domain: 'acme.com', tenant: acme }],
    tenants: [acme],
  });
  const t = await resolveTenant({ supabase, host: 'acme.com', slug: 'does-not-exist' });
  assert.deepEqual(t, NO_TENANT);
});

test('a DISABLED tenant named by slug is 404 even on its own mapped host', async () => {
  const supabase = makeSupabase({
    domains: [{ domain: 'suspended.com', tenant: suspended }],
    tenants: [suspended],
  });
  const t = await resolveTenant({ supabase, host: 'suspended.com', slug: 'suspended-co' });
  assert.deepEqual(t, NO_TENANT);
});

// --- the entitlement gate ----------------------------------------------------
// The second gate, and it is INDEPENDENT of tenants.status. A workspace whose
// paid period has ended stops being served without anything writing a column —
// so an operator's manual suspension is never overwritten, and a cancelled
// subscription needs no sweep to expire.
//
// The status of a tenant here is always 'active'. That is the point: these
// tenants are operator-approved and would render today. Only entitlement stops
// them.

test('an ENTITLED tenant renders — active and comped subscriptions are unaffected', async () => {
  const supabase = makeSupabase({
    domains: [{ domain: 'acme.com', tenant: acme }],
    tenants: [acme],
    entitled: { 'acme-uuid': true },
  });
  assert.equal((await resolveTenant({ supabase, host: 'acme.com' })).id, 'acme-uuid');
  assert.equal((await resolveTenant({ supabase, host: 'localhost', slug: 'acme' })).id, 'acme-uuid');
});

test('a LAPSED tenant is 404 by slug', async () => {
  const supabase = makeSupabase({ tenants: [acme], entitled: { 'acme-uuid': false } });
  const t = await resolveTenant({ supabase, host: 'localhost', slug: 'acme' });
  assert.deepEqual(t, NO_TENANT);
});

test('a LAPSED tenant is blocked on its own mapped domain, not fallen through', async () => {
  // BLOCKED, not NO_TENANT: the host is still theirs. Falling through to
  // anything else is the isolation bug BLOCKED_TENANT exists to prevent.
  const supabase = makeSupabase({
    domains: [{ domain: 'acme.com', tenant: acme }],
    tenants: [acme],
    entitled: { 'acme-uuid': false },
  });
  const t = await resolveTenant({ supabase, host: 'acme.com' });
  assert.equal(t.mode, 'blocked');
  assert.notEqual(t.mode, 'tenant', 'callers 404 on anything that is not mode=tenant');
});

test('entitlement never resurrects an operator-DISABLED tenant', async () => {
  // Paid up, but the operator switched it off. Manual suspension wins — billing
  // must never be able to turn a workspace back on.
  const supabase = makeSupabase({
    domains: [{ domain: 'suspended.com', tenant: suspended }],
    tenants: [suspended],
    entitled: { 'susp-uuid': true },
  });
  assert.deepEqual(await resolveTenant({ supabase, host: 'localhost', slug: 'suspended-co' }), NO_TENANT);
  assert.equal((await resolveTenant({ supabase, host: 'suspended.com' })).mode, 'blocked');
});

test('a lapsed tenant does not leak the NEXT tenant on the same host', async () => {
  const supabase = makeSupabase({
    domains: [{ domain: 'acme.com', tenant: acme }],
    tenants: [acme, other],
    entitled: { 'acme-uuid': false, 'other-uuid': true },
  });
  const t = await resolveTenant({ supabase, host: 'acme.com' });
  assert.notEqual(t.id, 'other-uuid');
  assert.equal(t.mode, 'blocked');
});

test('the entitlement check FAILS OPEN — an RPC error serves the site', async () => {
  // Deliberate asymmetry: failing open serves the CORRECT tenant who may not
  // have paid, failing closed darkens every client site on one bad response.
  // Identity is still fail-closed; only entitlement is forgiving.
  const supabase = makeSupabase({
    domains: [{ domain: 'acme.com', tenant: acme }],
    tenants: [acme],
    entitled: 'error',
  });
  assert.equal((await resolveTenant({ supabase, host: 'acme.com' })).id, 'acme-uuid');
  assert.equal((await resolveTenant({ supabase, host: 'localhost', slug: 'acme' })).id, 'acme-uuid');
});

test('resolveTenantByHost is host mapping ONLY — it does not gate on entitlement', async () => {
  // Locks down the footgun documented on the export: it answers "who owns this
  // host", not "may this render". Anything deciding to RENDER uses resolveTenant.
  const supabase = makeSupabase({
    domains: [{ domain: 'acme.com', tenant: acme }],
    entitled: { 'acme-uuid': false },
  });
  const t = await resolveTenantByHost(supabase, 'acme.com');
  assert.equal(t.id, 'acme-uuid', 'still maps the host');
  assert.equal((await resolveTenant({ supabase, host: 'acme.com' })).mode, 'blocked', 'but resolveTenant blocks it');
});
