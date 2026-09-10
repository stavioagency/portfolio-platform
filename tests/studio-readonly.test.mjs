// What the Studio does for a customer who cannot write.
//
// Production RLS: reads are is_tenant_admin, writes are can_edit_tenant =
// `owner OR (tenant admin AND active subscription)`. So a customer without a
// subscription can open every Studio screen and save nothing.
//
// That is a fact about the database, not a bug in this code, and the Studio's
// job is to say so once rather than let every field discover it separately.
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
const NOTICE = read('components/studio/readonly.js');
/* Checked against the code, not the prose: the file's own header explains
   can_edit_tenant, and a guard that fires on its own documentation is a guard
   somebody deletes. */
const NOTICE_CODE = strip(NOTICE);
const SECTIONS = strip(read('components/studio/sections.js'));
const WORK = strip(read('components/studio/work.js'));

test('the customer is told once, not once per field', () => {
  // Without this, autosave fires on every keystroke, the database changes zero
  // rows, and the blocked-write error appears forever. A working editor that
  // rejects every keystroke is the worst way to ask someone to pay.
  assert.ok(/\{hasProfileRow && !canEdit && <ReadOnlyNotice/.test(PAGE_CODE),
    'the notice must render once, above the open screen');
  assert.equal((PAGE_CODE.match(/<ReadOnlyNotice/g) || []).length, 1, 'exactly one notice');
});

test('an unknown entitlement reads as editable, never as a paywall', () => {
  // A paywall shown because a lookup failed is a paywall shown to someone who
  // has already paid. The database refuses the write on its own, so the cost of
  // being wrong this way is one honest error message.
  assert.ok(/const canEdit = entitled !== false;/.test(PAGE_CODE),
    'only an explicit false may disable editing');
  assert.ok(!/entitled === true.*canEdit/.test(PAGE_CODE), 'unknown must not read as "no"');
});

test('a refused write is not queued for later', () => {
  // A queued change would fire the moment a subscription started, writing text
  // the customer typed long ago and has since forgotten.
  for (const [name, src] of [['sections', SECTIONS], ['work', WORK]]) {
    const guards = (src.match(/if \(!canEdit\) return;/g) || []).length;
    assert.ok(guards >= 3, `${name}: only ${guards} write paths are guarded`);
  }
  assert.ok(/if \(!canEdit \|\| projects\.length >= MAX_PROJECTS\) return;/.test(WORK),
    'creating a project must be guarded too');
});

test('a missing profile row outranks the paywall', () => {
  // Signup creates an empty profile row, so its ABSENCE means something went
  // wrong at signup — not that the customer has not started. Offering a
  // subscription would send them to buy something that cannot fix it.
  assert.ok(/\{!hasProfileRow && <NoProfileNotice/.test(PAGE_CODE));
  const noProfile = PAGE_CODE.indexOf('<NoProfileNotice');
  const readOnly = PAGE_CODE.indexOf('<ReadOnlyNotice');
  assert.ok(noProfile < readOnly, 'the missing-row notice must come first');
  assert.ok(/will not fix it|لن يحلّ الاشتراك المشكلة/.test(NOTICE),
    'and must say a subscription will not help');
  assert.ok(/canEdit && hasProfileRow/.test(PAGE_CODE),
    'editing needs both an entitlement and a row to edit');
});

test('the notice is a report, and the database is still the gate', () => {
  assert.ok(/report, not a gate|is a courtesy/i.test(NOTICE),
    'the reasoning must be recorded where it can be violated');
  // It must not try to enforce anything itself.
  for (const bad of ['can_edit_tenant', 'rpc(', 'supabase']) {
    assert.ok(!NOTICE_CODE.includes(bad), `${bad} has no business in a notice component`);
  }
});

test('it unwinds itself if the product rule changes', () => {
  // The direction says free users should edit and merely not publish. That is a
  // change to can_edit_tenant, not to this code: canEdit becomes true for
  // everyone and none of this renders.
  assert.ok(/disappears by itself|unwinding/i.test(NOTICE),
    'the exit condition must be written down');
  assert.ok(/canEdit = true/.test(SECTIONS), 'editing must default to allowed');
});

test('everything already written is described as safe', () => {
  // The first fear on seeing a paywall inside an editor is that the work is
  // being held hostage.
  assert.ok(/Everything already written is safe|كل ما هو مكتوب محفوظ/.test(NOTICE));
});
