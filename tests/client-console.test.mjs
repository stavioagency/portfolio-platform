// The owner console: /client, and the counting behind it.
//
// Two very different risks here. The first is arithmetic — an operator decides
// who to contact from these numbers, so a wrong count is a wrong phone call.
// The second is authorization, where the failure is not a wrong call but a
// customer reading another customer's business.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FILTERS, applyFilter, endingSoon, rankCustomers, searchCustomers, summarise, toCustomer,
} from '../lib/client-overview.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(join(ROOT, 'pages/client/index.js'), 'utf8');
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 10);
const at = (days) => new Date(NOW + days * DAY).toISOString();

const tenant = (over = {}) => ({
  id: over.id || 't', slug: over.slug || 's', name: over.name || 'N',
  status: over.status || 'active', created_at: over.created_at || at(-100),
  published_at: 'published_at' in over ? over.published_at : at(-50),
});

// ── What "offline" means ────────────────────────────────────────────────

test('the three reasons a portfolio is invisible are never collapsed into one', () => {
  // The operator's response is different for each, and chasing a customer who
  // simply has not pressed Publish is the mistake this prevents.
  const never = toCustomer(tenant({ published_at: null }), { status: 'active', current_period_end: at(30) }, NOW);
  const lapsed = toCustomer(tenant(), { status: 'expired', current_period_end: at(-30) }, NOW);
  const off = toCustomer(tenant({ status: 'disabled' }), { status: 'active', current_period_end: at(30) }, NOW);
  const live = toCustomer(tenant(), { status: 'active', current_period_end: at(30) }, NOW);

  assert.equal(never.offlineReason, 'never-published');
  assert.equal(lapsed.offlineReason, 'not-entitled');
  assert.equal(off.offlineReason, 'disabled');
  assert.equal(live.offlineReason, null);
  for (const c of [never, lapsed, off]) assert.equal(c.live, false);
  assert.equal(live.live, true);
});

test('live requires all three conditions the public read path requires', () => {
  // A portfolio renders only for an enabled tenant, with an entitlement, that
  // has published. Anything less is not live, whatever the other two say.
  const combos = [
    [true, true, true, true],
    [false, true, true, false],
    [true, false, true, false],
    [true, true, false, false],
  ];
  for (const [published, entitled, enabled, expected] of combos) {
    const c = toCustomer(
      tenant({ published_at: published ? at(-1) : null, status: enabled ? 'active' : 'disabled' }),
      entitled ? { status: 'active', current_period_end: at(30) } : { status: 'expired', current_period_end: at(-30) },
      NOW,
    );
    assert.equal(c.live, expected, `published=${published} entitled=${entitled} enabled=${enabled}`);
  }
});

// ── Counting ────────────────────────────────────────────────────────────

test('paying is narrower than entitled, because a grant brings in nothing', () => {
  const rows = [
    toCustomer(tenant({ id: 'a' }), { status: 'active', current_period_end: at(30) }, NOW),
    toCustomer(tenant({ id: 'b' }), { status: 'comped', current_period_end: at(30) }, NOW),
    toCustomer(tenant({ id: 'c' }), { status: 'expired', current_period_end: at(-1) }, NOW),
  ];
  const s = summarise(rows);
  assert.equal(s.entitled, 2, 'active and comped are both entitled');
  assert.equal(s.paying, 1, 'only the paid one is paying');
  assert.equal(s.comped, 1);
  assert.equal(s.lapsed, 1);
});

test('a workspace that never subscribed is not counted as lapsed', () => {
  // It has not failed at anything. Counting it as lapsed puts a customer who is
  // still deciding into the list of people to chase.
  const rows = [toCustomer(tenant(), null, NOW)];
  const s = summarise(rows);
  assert.equal(s.lapsed, 0);
  assert.equal(s.neverSubscribed, 1);
});

test('a permanent grant is never counted as expiring', () => {
  // Every live client today is comped with no end date. Reading a missing date
  // as "about to expire" would light up the whole list.
  const forever = toCustomer(tenant(), { status: 'comped', current_period_end: null }, NOW);
  assert.equal(endingSoon(forever), false);
  assert.equal(summarise([forever]).endingSoon, 0);

  const soon = toCustomer(tenant(), { status: 'comped', current_period_end: at(3) }, NOW);
  assert.equal(endingSoon(soon), true);
});

test('every number on the screen is a filter that can be opened', () => {
  // A total nobody can click into is a number nobody can act on.
  for (const id of ['all', 'live', 'lapsed', 'comped', 'never-published', 'disabled', 'ending-soon']) {
    assert.equal(typeof FILTERS[id], 'function', `${id} has no filter behind it`);
  }
  const rows = [
    toCustomer(tenant({ id: 'a' }), { status: 'active', current_period_end: at(30) }, NOW),
    toCustomer(tenant({ id: 'b', published_at: null }), null, NOW),
  ];
  assert.equal(applyFilter(rows, 'live').length, summarise(rows).live);
  assert.equal(applyFilter(rows, 'never-published').length, summarise(rows).neverPublished);
  assert.equal(applyFilter(rows, 'nonsense').length, rows.length, 'an unknown filter shows everything, never nothing');
});

// ── Finding the right customer ──────────────────────────────────────────

test('search matches on substring and is not fuzzy', () => {
  // A near-match on the wrong customer is how an operator acts on the wrong
  // workspace, which is the one mistake this screen must make difficult.
  const rows = [
    toCustomer(tenant({ id: '1', slug: 'ahmad-demo', name: 'Ahmad' }), null, NOW),
    toCustomer(tenant({ id: '2', slug: 'roza', name: 'Roza' }), null, NOW),
  ];
  assert.deepEqual(searchCustomers(rows, 'AHM').map((r) => r.slug), ['ahmad-demo']);
  assert.deepEqual(searchCustomers(rows, 'demo').map((r) => r.slug), ['ahmad-demo']);
  assert.deepEqual(searchCustomers(rows, '  ').map((r) => r.slug), ['ahmad-demo', 'roza'], 'blank shows all');
  assert.deepEqual(searchCustomers(rows, 'rza'), [], 'a transposition must not match');
});

test('the list leads with the rows that need attention', () => {
  // A list sorted by name is a list an operator has to read all of.
  const rows = [
    toCustomer(tenant({ id: 'ok', slug: 'ok', created_at: at(-1) }), { status: 'active', current_period_end: at(90) }, NOW),
    toCustomer(tenant({ id: 'lapsed', slug: 'lapsed' }), { status: 'expired', current_period_end: at(-9) }, NOW),
    toCustomer(tenant({ id: 'soon', slug: 'soon' }), { status: 'comped', current_period_end: at(2) }, NOW),
  ];
  assert.deepEqual(rankCustomers(rows).map((r) => r.slug), ['soon', 'lapsed', 'ok']);
});

// ── Authorization ───────────────────────────────────────────────────────

test('the owner check is the database’s, and it precedes every read', () => {
  const gate = CODE.indexOf("rpc('is_platform_owner')");
  const firstRead = CODE.indexOf(".from('tenants')");
  assert.ok(gate > -1, 'the owner gate must exist');
  assert.ok(firstRead > gate, 'no table may be read before the gate answers');
  assert.ok(/if \(isOwner !== true\) \{ setPhase\('denied'\); return; \}/.test(CODE),
    'anything but an explicit true must be refused');
  const session = CODE.indexOf('getSession()');
  assert.ok(session > -1 && session < gate, 'the session is checked first');
});

test('the gate is a courtesy on top of RLS, not instead of it', () => {
  // A customer who typed this URL must see an empty console, not someone
  // else's business. That property belongs to the policies, and this file must
  // not do anything that would substitute for them.
  assert.ok(/never instead of one|not what protects the DATA/i.test(PAGE),
    'the reasoning must be recorded where it can be violated');
  for (const bad of ['SERVICE_ROLE', 'service_role', 'supabaseAdmin']) {
    assert.ok(!PAGE.includes(bad), `${bad} must never appear in a browser page`);
  }
});

test('the console performs no destructive operation', () => {
  // Deleting a client, resetting a password and changing an email are
  // irreversible operations on real customers. They work in /console today;
  // duplicating them into an unproven screen is how one gets done twice, or to
  // the wrong row.
  for (const write of ['.delete(', '.update(', '.insert(', '.upsert(']) {
    assert.ok(!CODE.includes(write), `${write} — /client is read-only in this phase`);
  }
  for (const fn of ['delete-client', 'reset-client-password', 'client-recovery', 'billing-subscription']) {
    assert.ok(!CODE.includes(fn), `${fn} must not be invoked from here yet`);
  }
  assert.ok(/href="\/console"/.test(CODE), 'and the operations must be linked where they do work');
});

test('a customer who lands here is sent somewhere useful', () => {
  // "Denied" with no exit is a dead end for someone who simply opened the wrong
  // URL — most likely their own Studio.
  assert.ok(/href: '\/studio'/.test(CODE), 'the denied state must point at the Studio');
  assert.ok(/href: '\/admin\?next=\/client'/.test(CODE), 'and signing in must return here');
});
