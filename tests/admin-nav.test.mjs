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

test('no owner-only platform group exists any more', () => {
  // Sites and Subscribers moved to /console on 2026-08-27. This file is now the
  // CLIENT's navigation only, and an owner opening /admin is editing ONE
  // portfolio -- not looking at a list of other people's.
  for (const isOwner of [true, false, null]) {
    const groups = navGroups({ isOwner, ar: false, t: (k) => k });
    assert.equal(groups.some((g) => g.id === 'platform'), false,
      `isOwner=${isOwner} still gets a platform group`);
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    assert.equal(ids.includes('clients'), false, 'Sites is still in the admin nav');
    assert.equal(ids.includes('subscribers'), false, 'Subscribers is still in the admin nav');
  }
});

test('billing is a client tab, and there is no owner tab left to confuse it with', () => {
  // The original pairing existed because `billing` (a client's own
  // subscription) and `subscribers` (every client's) were one word apart in the
  // same sidebar. Subscribers moved to /console, so only half the rule remains
  // -- and it is the half that matters: an OWNER must not get a tab that acts
  // on whichever workspace happens to be selected.
  const client = navGroups({ isOwner: false, ar: false, t: (k) => k })
    .flatMap((g) => g.items.map((i) => i.id));
  const owner = navGroups({ isOwner: true, ar: false, t: (k) => k })
    .flatMap((g) => g.items.map((i) => i.id));
  assert.ok(client.includes('billing'), 'a client must see their own subscription');
  assert.equal(owner.includes('billing'), false, 'an owner must not get the client billing tab');
  assert.equal(owner.includes('subscribers'), false, 'Subscribers belongs to /console now');
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

test('groups are ordered Website -> Insights -> Settings', () => {
  // Platform was first and is gone. The remaining order is the client's reading
  // order: build the site, read its numbers, administer it.
  for (const isOwner of [true, false]) {
    const ids = navGroups({ isOwner, ar: false, t: (k) => k }).map((g) => g.id);
    assert.deepEqual(ids, ['website', 'insights', 'settings'],
      `isOwner=${isOwner} group order changed`);
  }
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


