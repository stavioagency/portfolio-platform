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
