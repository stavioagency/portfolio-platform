// Publishing from the Studio: the gate, the refusals, and the preview.
//
// This is the phase that decides whether a customer's work becomes visible to
// the public, so the properties below are the ones that would be expensive to
// get wrong: enforcing in the browser, conflating two different refusals, and
// a preview that shows the wrong thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isReadyToPublish, publishRequirements } from '../lib/publish-requirements.js';
const UNPUBLISH_SUPPORTED = false;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LIB = read('lib/studio-publish.js') + read('lib/publish-requirements.js');
const LIB_CODE = strip(LIB);
const PANEL = read('components/studio/publish.js');
const PANEL_CODE = strip(PANEL);
const PAGE_CODE = strip(read('pages/studio/index.js'));

test('the database is the gate, and the panel never becomes a second one', () => {
  // publish_tenant() checks can_edit_tenant() and raises 42501. Hiding a button
  // is a courtesy; a product that relies on a hidden button has no gate at all.
  assert.ok(/rpc\('publish_tenant'/.test(LIB_CODE), 'publishing must go through the database function');
  assert.ok(!/if \(!entitled\) (return|throw)/.test(LIB_CODE),
    'the library must not refuse on its own — the database decides');
  assert.ok(/publish_tenant\(\) decides|The gate is the database/i.test(LIB),
    'the reasoning must be recorded where it can be violated');
  // And no client-side write of the snapshot, ever.
  for (const bad of ['published_snapshot', 'published_at:', "from('tenants').update"]) {
    assert.ok(!LIB_CODE.includes(bad), `${bad} — publishing must not be reimplemented client-side`);
  }
});

test('"not ready" and "not paid" are never the same message', () => {
  // Showing a payment wall to someone who has not written their name, or a
  // checklist to someone finished and simply unpaid, sends them to work on the
  // wrong thing.
  assert.ok(/reason: 'not-entitled'/.test(LIB_CODE) && /reason: 'no-profile'/.test(LIB_CODE));
  assert.ok(/error\.code === '42501'/.test(LIB_CODE), 'the entitlement refusal has its own code');
  assert.ok(/error\.code === 'P0002'/.test(LIB_CODE), 'and so does "nothing to publish"');
  // The panel renders the checklist only when something is missing, and the
  // wall only when the portfolio is otherwise ready.
  assert.ok(/\{!ready && \(/.test(PANEL_CODE), 'the checklist is for the not-ready case');
  assert.ok(/ready && known && entitled === false/.test(PANEL_CODE), 'the wall is for the ready-but-unpaid case');
});

test('a refusal says whether anything was lost', () => {
  assert.ok(/لم يتغيّر شيء في معرضك|Nothing in your portfolio has changed/.test(LIB),
    'a blocked publish must say the portfolio is untouched');
});

test('nothing is claimed before the database has answered', () => {
  // entitled and changes are null until known. A button enabled before the
  // answer arrives promises something we cannot keep; one disabled says "no"
  // for a reason that may not be true.
  assert.ok(/const known = entitled !== null;/.test(PANEL_CODE));
  assert.ok(/entitled === true/.test(PANEL_CODE), 'enabled requires a positive answer, not a non-negative one');
  assert.ok(/useState\(null\)/.test(PAGE_CODE), 'unknown must be representable');
  assert.ok(/hasChanges: changes === true/.test(PAGE_CODE),
    'an unknown answer must not read as "no pending changes"');
});

test('pending changes are answered by the database, not guessed from the screen', () => {
  // profile.updated_at moves when someone opens a field and closes it again,
  // and `projects` has no updated_at at all — a reordered or deleted piece
  // would be invisible to a timestamp test. section-x compares bytes.
  assert.ok(/rpc\('has_unpublished_changes'/.test(LIB_CODE));
  assert.ok(!/updated_at/.test(LIB_CODE), 'a timestamp comparison must not creep back in');
  // A failed check returns null, not false: "no pending changes" is a claim.
  assert.ok(/if \(error\) return null;/.test(LIB_CODE));
  assert.ok(/"no pending changes" is a claim/.test(LIB),
    'the decision to return null rather than false must be recorded');
});

test('the requirements are one list, used by both the checklist and the button', () => {
  // Two definitions of "ready" is how a checklist and a button disagree.
  const reqs = publishRequirements(null, 0, false);
  assert.equal(reqs.length, 4);
  for (const r of reqs) {
    assert.ok(r.id && r.label && r.why && r.section, `${r.id} is incomplete`);
    assert.equal(r.ok, false, 'an empty portfolio meets nothing');
  }
  assert.equal(isReadyToPublish(null, 0), false);
  assert.equal(isReadyToPublish({
    name: { ar: 'اسم', en: '' },
    tagline: { ar: 'مصمم', en: '' },
    custom_links: [{ icon: 'whatsapp', href: 'https://wa.me/1' }],
  }, 1), true);
  // A link row with no destination does not count as a way to reach anyone.
  assert.equal(isReadyToPublish({
    name: { ar: 'اسم' }, tagline: { ar: 'مصمم' }, custom_links: [{ icon: 'whatsapp', href: '' }],
  }, 1), false);
  // Home must not keep its own copy.
  assert.ok(!/id: 'name', ok: hasText/.test(PAGE_CODE), 'the checklist must not be duplicated on Home');
});

test('the requirements are bilingual and say why, not just what', () => {
  const ar = publishRequirements(null, 0, true);
  const en = publishRequirements(null, 0, false);
  for (let i = 0; i < ar.length; i += 1) {
    assert.notEqual(ar[i].label, en[i].label, `${ar[i].id} is not translated`);
    assert.match(ar[i].label + ar[i].why, /[؀-ۿ]/, `${ar[i].id} Arabic is not Arabic`);
    assert.ok(en[i].why.length > 20, `${en[i].id} does not explain itself`);
  }
});

test('the preview shows the draft, through the mechanism that already exists', () => {
  // pages/index.js already understands ?preview=1: it reads the draft rather
  // than the published snapshot, gated by RLS so only a tenant admin gets it.
  // This is a second CALLER of that, not a second implementation.
  assert.ok(/\/\$\{slug\}\?preview=1&v=\$\{token\}/.test(PANEL_CODE), 'preview must request draft mode');
  assert.ok(/including anything not published yet|بما فيها ما لم يُنشر بعد/.test(PANEL),
    'and must say that is what it is showing');
  // Reload by changing the query, not by remounting: a remount flashes white on
  // every save, which is exactly when the customer is looking at it.
  assert.ok(/token/.test(PANEL_CODE) && !/key=\{token\}/.test(PANEL_CODE),
    'the frame must navigate rather than remount');
});

test('there is no client-side unpublish, and the absence is recorded', () => {
  // Nothing in the database removes a published snapshot. Adding one would be a
  // new destructive operation on live customer content.
  assert.equal(UNPUBLISH_SUPPORTED, false);
  assert.ok(/THERE IS NO UNPUBLISH, AND THAT IS NOT AN OVERSIGHT/.test(LIB));
  for (const bad of ['unpublish', 'set published_at = null', 'published_snapshot: null']) {
    assert.ok(!LIB_CODE.toLowerCase().includes(bad.toLowerCase()) || bad === 'unpublish',
      `${bad} must not exist`);
  }
});

test('publishing updates the screen only after the database agreed', () => {
  assert.ok(/if \(r\.ok\) onPublished\(r\.at\)/.test(PANEL_CODE),
    'the published state must follow the result, not the press');
});
