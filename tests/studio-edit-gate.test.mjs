// What can and cannot stop a save in the Studio.
//
// This file used to assert a read-only mode. Section-z removed the reason for
// one: can_draft_tenant() governs profile and projects and needs only
// membership, while can_edit_tenant() still gates publish_tenant(). A customer
// builds for free and pays to publish.
//
// So the properties worth pinning changed shape. What matters now is that the
// paywall lives in exactly ONE place, that a missing profile row is not
// mistaken for it, and that editing never quietly re-acquires a subscription
// requirement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = read('pages/studio/index.js');
const PAGE_CODE = strip(PAGE);
const NOTICES = read('components/studio/notices.js');
const PANEL_CODE = strip(read('components/studio/publish.js'));
const SECTIONS = strip(read('components/studio/sections.js'));
const WORK = strip(read('components/studio/work.js'));

test('editing does not depend on the subscription', () => {
  // The regression this prevents: someone reintroduces `entitled` into the
  // edit gate, and unpaid customers silently lose the editor again — which is
  // the exact behaviour section-z was written to remove.
  assert.ok(/const canEdit = hasProfileRow;/.test(PAGE_CODE),
    'only a missing profile row may stop a save');
  assert.ok(!/canEdit[^\n]*entitled|entitled[^\n]*canEdit/.test(PAGE_CODE),
    'entitlement must not feed the edit gate');
});

test('the paywall exists in exactly one place', () => {
  // Two paywalls is two things to keep in step, and the one that drifts is the
  // one a customer meets.
  assert.ok(/entitled === false/.test(PANEL_CODE), 'the publish panel owns the paywall');
  assert.ok(!/subscribe/i.test(SECTIONS), 'no editing screen may offer a subscription');
  assert.ok(!/subscribe/i.test(WORK));
  assert.ok(!/Subscribe/.test(NOTICES), 'and neither may a notice');
});

test('a missing profile row is not mistaken for the paywall', () => {
  // Signup creates an empty row, so its absence means signup went wrong — not
  // that the customer has not started, and not that they owe money.
  assert.ok(/\{!hasProfileRow && <NoProfileNotice/.test(PAGE_CODE));
  assert.ok(/will not fix it|لن يحلّ الاشتراك المشكلة/.test(NOTICES),
    'it must say a subscription will not help');
});

test('the write paths are still guarded against a null row', () => {
  for (const [name, src] of [['sections', SECTIONS], ['work', WORK]]) {
    const guards = (src.match(/if \(!canEdit\) return;/g) || []).length;
    assert.ok(guards >= 3, `${name}: only ${guards} write paths are guarded`);
  }
});

test('the removal of the read-only mode is recorded, not silent', () => {
  // "Why is there no read-only mode?" is a fair question to ask of an editor
  // whose product has a paywall in it.
  assert.ok(/section-z/i.test(NOTICES), 'the notices file must explain what changed');
  assert.ok(/BUILDS for free and PAYS to publish|builds for free/i.test(NOTICES));
});
