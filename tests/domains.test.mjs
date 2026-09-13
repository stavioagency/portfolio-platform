// Custom domains, now that the rules are shared.
//
// These moved out of pages/admin.js so the Studio could offer custom domains
// without a second implementation of DNS verification. They had no tests while
// they lived there, which is most of why moving them was worth doing: the one
// property that matters here — that an unreachable DNS service never writes a
// status — is invisible in review and expensive in production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERCEL_A_RECORD, VERCEL_CNAME,
  normalizeDomain, isApexDomain, isValidDomain, dnsRecordFor,
  checkDomainDns, nextStatusFromDns, domainStatusMeta,
} from '../lib/domains.js';

// ── normalising ──────────────────────────────────────────────────────────

test('a domain is stored the way an incoming request host arrives', () => {
  // If these disagree, a saved domain never matches at runtime: it looks
  // configured, verifies green, and serves nothing.
  assert.equal(normalizeDomain('https://Example.com/portfolio'), 'example.com');
  assert.equal(normalizeDomain('  http://example.com  '), 'example.com');
  assert.equal(normalizeDomain('example.com/'), 'example.com');
  assert.equal(normalizeDomain('WWW.Example.COM'), normalizeDomain('www.example.com'));
});

test('nothing in, nothing out — never a crash', () => {
  for (const bad of [null, undefined, '', 0, {}]) {
    assert.doesNotThrow(() => normalizeDomain(bad));
  }
});

// ── which record ─────────────────────────────────────────────────────────

test('an apex gets an A record and a subdomain gets a CNAME', () => {
  // Not cosmetic: an apex cannot take a CNAME, so getting this backwards hands
  // the customer instructions their DNS provider will refuse.
  assert.equal(isApexDomain('example.com'), true);
  assert.equal(isApexDomain('www.example.com'), false);

  assert.deepEqual(dnsRecordFor('example.com'), {
    type: 'A', host: '@', value: VERCEL_A_RECORD,
  });
  assert.deepEqual(dnsRecordFor('www.example.com'), {
    type: 'CNAME', host: 'www', value: VERCEL_CNAME,
  });
});

test('the record a customer is told to create is the one Verify looks for', () => {
  // The instructions and the check must not drift: an A record value that does
  // not match what checkDomainDns accepts is a domain that can never verify.
  assert.equal(dnsRecordFor('example.com').value, VERCEL_A_RECORD);
  assert.ok(dnsRecordFor('www.example.com').value.includes('vercel-dns.com'));
});

test('shape is validated, availability is not', () => {
  assert.equal(isValidDomain('example.com'), true);
  assert.equal(isValidDomain('sub.example.co.uk'), true);
  assert.equal(isValidDomain('example'), false, 'a bare label is not a domain');
  assert.equal(isValidDomain('exa mple.com'), false);
  assert.equal(isValidDomain(''), false);
});

// ── what DNS said ────────────────────────────────────────────────────────

const dns = (answers) => async (url) => ({
  ok: true,
  json: async () => ({
    Answer: (url.includes('type=CNAME') ? answers.cname : answers.a || [])
      .map((d) => ({ data: d })),
  }),
});

test('a CNAME pointing at us verifies', async () => {
  const res = await checkDomainDns('www.example.com', dns({ cname: ['cname.vercel-dns.com.'], a: [] }));
  assert.deepEqual(res, { reachable: true, ok: true, hasAnyRecord: true });
  assert.equal(nextStatusFromDns(res), 'active');
});

test('an A record pointing at us verifies', async () => {
  const res = await checkDomainDns('example.com', dns({ cname: [], a: [VERCEL_A_RECORD] }));
  assert.equal(res.ok, true);
  assert.equal(nextStatusFromDns(res), 'active');
});

test('a record pointing somewhere else is an error, not a wait', () => {
  // These need opposite advice — one is "fix it", the other is "wait" — so
  // collapsing them is how a customer sits watching a domain that will never
  // come up on its own.
  assert.equal(nextStatusFromDns({ reachable: true, ok: false, hasAnyRecord: true }), 'error');
  assert.equal(nextStatusFromDns({ reachable: true, ok: false, hasAnyRecord: false }), 'pending');
});

test('AN UNREACHABLE DNS SERVICE NEVER WRITES A STATUS', async () => {
  // The reason `reachable` exists. Offline, blocked by an extension, a hostile
  // network — none of that is evidence about the customer's DNS. Writing a
  // status here would downgrade a working domain to pending and send them off
  // to fix something that was never broken.
  const dead = async () => { throw new Error('network down'); };
  const res = await checkDomainDns('example.com', dead);
  assert.deepEqual(res, { reachable: false, ok: false, hasAnyRecord: false });
  assert.equal(nextStatusFromDns(res), null, 'null means: leave the row alone');

  const http500 = async () => ({ ok: false, status: 500, json: async () => ({}) });
  assert.equal(nextStatusFromDns(await checkDomainDns('example.com', http500)), null);
});

test('a malformed DNS answer is treated as unreachable, not as empty', () => {
  assert.equal(nextStatusFromDns(null), null);
  assert.equal(nextStatusFromDns(undefined), null);
  assert.equal(nextStatusFromDns({}), null);
});

// ── how it reads ─────────────────────────────────────────────────────────

test('every status has a label in both languages and a tone', () => {
  for (const status of ['active', 'error', 'pending', 'something-new']) {
    for (const ar of [true, false]) {
      const m = domainStatusMeta(status, ar);
      assert.ok(m.label, `${status} has no label`);
      assert.ok(['success', 'danger', 'warning'].includes(m.tone), `${status} has no tone`);
    }
  }
});

test('an unknown status reads as waiting rather than as active', () => {
  // Fail toward "not live yet": claiming a domain is active when we do not know
  // is the one wrong answer that stops a customer investigating.
  assert.equal(domainStatusMeta('whatever', false).tone, 'warning');
});
