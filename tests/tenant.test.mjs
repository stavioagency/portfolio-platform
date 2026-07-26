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
function makeSupabase({ domains = [], tenants = [] } = {}) {
  return {
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
