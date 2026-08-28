// Regression tests for the client editor's navigation (lib/admin-nav.js).
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// WHAT THIS FILE IS FOR NOW. It used to lock visibility rules: Sites and
// Subscribers were owner-only, Home was client-only, and a leak would have
// shown a client a screen built for the platform owner. Those screens moved to
// /console on 2026-08-27 and the nav stopped being role-dependent at all.
//
// So the rules worth pinning changed. /admin is ONE person editing ONE
// portfolio, and the risk is no longer a leak — it is the sprawl coming back.
// On 2026-08-28 this went from ten items across three groups to five flat ones,
// and every one of the ten had seemed reasonable when it was added.
//
// UI visibility is not security — RLS is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navGroups } from '../lib/admin-nav.js';

const t = (k) => k;                       // identity translator
const ids = (groups) => groups.flatMap((g) => g.items.map((i) => i.id));
const build = (isOwner, ar = false) => navGroups({ isOwner, ar, t });

test('the navigation is the same five items for everyone', () => {
  // Role-dependent tabs are what produced "Billing means my subscription here
  // and everyone's subscription there". An owner opening /admin is editing one
  // portfolio, exactly like a client, and sees exactly what a client sees.
  const expected = ['projects', 'card', 'links', 'analytics', 'account'];
  for (const isOwner of [true, false, null]) {
    assert.deepEqual(ids(build(isOwner)), expected, `isOwner=${isOwner} sees a different nav`);
  }
});

test('the screens that moved to /console have not come back', () => {
  for (const isOwner of [true, false, null]) {
    const seen = ids(build(isOwner));
    for (const gone of ['clients', 'subscribers']) {
      assert.equal(seen.includes(gone), false, `${gone} is back in the client's editor`);
    }
  }
});

test('the tabs deleted on 2026-08-28 stay deleted, each for its own reason', () => {
  // Named individually rather than counted, because "five items" is satisfied
  // by any five and these are the ones that were actually wrong:
  //
  //   home        a second screen also called some version of "home"
  //   appearance  a theme, free colours, a font and a radius — every one a way
  //               to make a portfolio worse than the template
  //   domains     "Workspace", which is developer vocabulary, for a custom
  //               domain feature that is not built
  //   billing     folded into the account, where a client looks for it
  //   profile     merged into `card`; identity was split across two tabs and
  //               nobody could say which held what
  const seen = ids(build(false));
  for (const gone of ['home', 'appearance', 'domains', 'billing', 'profile']) {
    assert.equal(seen.includes(gone), false, `the "${gone}" tab is back`);
  }
});

test('five items, and adding a sixth has to be deliberate', () => {
  // A tripwire, not a law of nature. A sixth tab may well be right one day —
  // this is here so it is a decision somebody makes on purpose rather than the
  // tenth one arriving the way the first ten did.
  assert.equal(ids(build(false)).length, 5, 'the editor grew a tab');
});

test('every item has a label and an icon name', () => {
  for (const isOwner of [true, false, null]) {
    for (const group of build(isOwner)) {
      for (const item of group.items) {
        assert.ok(item.id, 'an item has no id');
        assert.ok(item.icon, `${item.id} has no icon`);
        assert.ok(item.label && String(item.label).trim(), `${item.id} has no label`);
      }
    }
  }
});

test('Arabic and English are both written out, and differ', () => {
  // The labels are literals here rather than translation keys, so a missing
  // Arabic string would render an English tab in an Arabic sidebar.
  const ar = build(false, true)[0].items.map((i) => i.label);
  const en = build(false, false)[0].items.map((i) => i.label);
  assert.equal(ar.length, en.length);
  for (let i = 0; i < ar.length; i++) {
    assert.notEqual(ar[i], en[i], `item ${i} has the same label in both languages`);
    assert.match(ar[i], /[؀-ۿ]/, `item ${i}'s Arabic label is not Arabic`);
  }
});

test('the nav is flat — no group headings', () => {
  // Three headings over ten items was a table of contents for a document
  // nobody was reading. One unlabelled group is how the shell renders a flat
  // list without a special case.
  const groups = build(false);
  assert.equal(groups.length, 1, 'the sidebar grew groups again');
  assert.equal(groups[0].label, null, 'the single group acquired a heading');
});
