// Regression tests for the admin navigation IA (lib/admin-nav.js).
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// The grouped sidebar must not quietly widen what a role can see. These lock in
// the visibility rules that the old flat tab list enforced inline:
//   * Clients (platform administration) is owner-only
//   * Home (client onboarding) is client-only
//   * while ownership is unresolved (null) neither appears
//   * every tab the shell can render has exactly one nav entry
// UI visibility is not security — RLS is — but a leak here would still show a
// client a screen built for the platform owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navGroups } from '../lib/admin-nav.js';

const t = (k) => k;                       // identity translator
const ids = (groups) => groups.flatMap(g => g.items.map(i => i.id));
const build = (isOwner, ar = false) => navGroups({ isOwner, ar, t });

test('owner sees the Platform group with Clients', () => {
  const groups = build(true);
  const platform = groups.find(g => g.id === 'platform');
  assert.ok(platform, 'owner must get a platform group');
  assert.deepEqual(platform.items.map(i => i.id), ['clients']);
});

test('owner does NOT get the client Home screen', () => {
  assert.ok(!ids(build(true)).includes('home'));
});

test('client sees Home but never the Clients screen', () => {
  const list = ids(build(false));
  assert.ok(list.includes('home'), 'client must get Home');
  assert.ok(!list.includes('clients'), 'client must NOT see platform administration');
  assert.ok(!build(false).some(g => g.id === 'platform'));
});

test('while ownership is unresolved, neither role-specific tab appears', () => {
  const list = ids(build(null));
  assert.ok(!list.includes('home'));
  assert.ok(!list.includes('clients'));
});

// `domains` is deliberately NOT in this list: it is owner tooling for one
// specific client, and for owners it now lives inside that client's panel on the
// Sites page rather than as a global tab scoped to whoever is "active".
test('every role keeps the shared website/insights/settings tabs', () => {
  for (const isOwner of [true, false, null]) {
    const list = ids(build(isOwner));
    for (const tab of ['profile', 'card', 'projects', 'links', 'appearance', 'analytics', 'account']) {
      assert.ok(list.includes(tab), `${tab} missing for isOwner=${isOwner}`);
    }
  }
});

test('tab ids are unique — no tab reachable from two places', () => {
  for (const isOwner of [true, false, null]) {
    const list = ids(build(isOwner));
    assert.equal(new Set(list).size, list.length, `duplicate tab for isOwner=${isOwner}`);
  }
});

test('groups are ordered Platform -> Website -> Insights -> Settings', () => {
  assert.deepEqual(build(true).map(g => g.id), ['platform', 'website', 'insights', 'settings']);
  assert.deepEqual(build(false).map(g => g.id), ['website', 'insights', 'settings']);
});

test('every item has a label and an icon name', () => {
  for (const isOwner of [true, false, null]) {
    for (const g of build(isOwner)) {
      assert.ok(g.label, `group ${g.id} needs a label`);
      assert.ok(g.items.length > 0, `group ${g.id} must not be empty`);
      for (const i of g.items) {
        assert.ok(i.label, `${i.id} needs a label`);
        assert.ok(i.icon, `${i.id} needs an icon`);
      }
    }
  }
});

test('Arabic and English produce different group labels', () => {
  const en = build(true, false).map(g => g.label);
  const ar = build(true, true).map(g => g.label);
  assert.equal(en.length, ar.length);
  en.forEach((label, i) => assert.notEqual(label, ar[i], `group ${i} is not translated`));
});


