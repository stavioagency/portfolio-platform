// Tests for lib/shell-nav.js — the /console and /studio information
// architecture, which is DERIVED from lib/admin-nav.js rather than restated.
//
// What is worth asserting is the derivation, not the list. A hardcoded
// expectation of "console has these four tabs" would have to be edited every
// time the IA moves and would then be asserting the test's copy of the answer.
// These assert the properties that must hold however the IA changes: the two
// products stay disjoint where they must, neither invents an item, and the
// owner-only rules keep coming from one place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navGroups } from '../lib/admin-nav.js';
import { consoleNav, studioNav, navItemIds, defaultItemId } from '../lib/shell-nav.js';

const t = (k) => k;                       // the translator is opaque here
const ctx = { ar: false, t };

test('neither shell invents an item the admin IA does not have', () => {
  // The whole point of deriving: if a shell can produce an id that navGroups()
  // never emits, the two have forked and the shells are a second IA.
  const known = new Set([
    ...navItemIds(navGroups({ isOwner: true, ...ctx })),
    ...navItemIds(navGroups({ isOwner: false, ...ctx })),
  ]);
  for (const id of [...navItemIds(consoleNav(ctx)), ...navItemIds(studioNav(ctx))]) {
    assert.ok(known.has(id), `${id} exists in a shell but not in admin-nav`);
  }
});

test('the console carries the platform screens and the studio does not', () => {
  const c = navItemIds(consoleNav(ctx));
  const s = navItemIds(studioNav(ctx));
  for (const id of ['clients', 'subscribers']) {
    assert.ok(c.includes(id), `console is missing ${id}`);
    assert.ok(!s.includes(id), `${id} leaked into the studio`);
  }
});

test('the studio carries the portfolio editors and the console does not', () => {
  // Editing a portfolio is the client's product. An owner who needs to do it
  // opens that client's studio rather than carrying a second copy of every
  // editor around in the console — which is the split's entire purpose.
  const c = navItemIds(consoleNav(ctx));
  const s = navItemIds(studioNav(ctx));
  for (const id of ['profile', 'card', 'projects', 'links', 'appearance']) {
    assert.ok(s.includes(id), `studio is missing ${id}`);
    assert.ok(!c.includes(id), `${id} leaked into the console`);
  }
});

test('billing stays client-side, matching the admin rule it inherits', () => {
  // admin-nav gives `billing` to clients only, because for an owner it would
  // act on whichever workspace happens to be selected. Deriving means that
  // reasoning holds here for free — this asserts it actually did.
  assert.ok(navItemIds(studioNav(ctx)).includes('billing'));
  assert.ok(!navItemIds(consoleNav(ctx)).includes('billing'));
});

test('the studio is exactly the client IA', () => {
  assert.deepEqual(
    navItemIds(studioNav(ctx)),
    navItemIds(navGroups({ isOwner: false, ...ctx })),
  );
});

test('no group is rendered empty', () => {
  // A heading with nothing under it reads as a loading bug.
  for (const groups of [consoleNav(ctx), studioNav(ctx)]) {
    for (const g of groups) assert.ok(g.items.length > 0, `${g.id} is empty`);
  }
});

test('every item has an id, a label and an icon', () => {
  for (const groups of [consoleNav(ctx), studioNav(ctx)]) {
    for (const g of groups) {
      assert.ok(g.label, `group ${g.id} has no label`);
      for (const i of g.items) {
        assert.ok(i.id && i.label && i.icon, `${g.id}/${i.id} is incomplete`);
      }
    }
  }
});

test('the default item is the first real one, not a constant', () => {
  for (const groups of [consoleNav(ctx), studioNav(ctx)]) {
    assert.equal(defaultItemId(groups), groups[0].items[0].id);
    assert.ok(navItemIds(groups).includes(defaultItemId(groups)));
  }
  assert.equal(defaultItemId([]), null);
});

test('Arabic changes the labels and nothing structural', () => {
  const en = consoleNav({ ar: false, t });
  const ar = consoleNav({ ar: true, t });
  assert.deepEqual(navItemIds(ar), navItemIds(en), 'Arabic changed the IA');
  assert.notEqual(ar[0].label, en[0].label, 'the group label was not translated');
});
