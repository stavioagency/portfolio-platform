import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_STEPS, nextStep } from '../lib/onboarding-guide.js';

// The ids MUST match the keys computeSetup() produces in pages/admin.js, because the
// guide is driven by that done-map. A rename on either side silently shows every step
// as unfinished forever, which looks like broken progress rather than a typo.
const SETUP_KEYS = ['photo', 'bio', 'project', 'links', 'theme', 'domain', 'publish'];

test('every computeSetup key has a guide step, and vice versa', () => {
  const ids = GUIDE_STEPS.map((s) => s.id);
  assert.deepEqual([...ids].sort(), [...SETUP_KEYS].sort());
});

test('the name step comes first — without it the site does not render at all', () => {
  assert.equal(GUIDE_STEPS[0].id, 'publish');
});

test('the custom domain comes last — it is the only optional, paid step', () => {
  assert.equal(GUIDE_STEPS[GUIDE_STEPS.length - 1].id, 'domain');
});

test('every step is fully bilingual — no half-translated content reaches a client', () => {
  for (const s of GUIDE_STEPS) {
    for (const field of ['title', 'why', 'tip']) {
      for (const lang of ['ar', 'en']) {
        const v = s[field]?.[lang];
        assert.equal(typeof v, 'string', `${s.id}.${field}.${lang} must be a string`);
        assert.ok(v.trim().length > 0, `${s.id}.${field}.${lang} must not be empty`);
      }
    }
  }
});

test('the how-to steps exist in both languages and match in count', () => {
  for (const s of GUIDE_STEPS) {
    const { ar, en } = s.how;
    assert.ok(Array.isArray(ar) && ar.length >= 2, `${s.id}.how.ar needs at least 2 steps`);
    assert.ok(Array.isArray(en) && en.length >= 2, `${s.id}.how.en needs at least 2 steps`);
    // A mismatch means one language quietly lost an instruction.
    assert.equal(ar.length, en.length, `${s.id}.how has ${ar.length} Arabic vs ${en.length} English steps`);
    ar.concat(en).forEach((line) => assert.ok(line.trim().length > 0, `${s.id} has an empty how-to line`));
  }
});

test('every step points at a real admin tab', () => {
  const TABS = ['profile', 'card', 'projects', 'links', 'appearance', 'analytics', 'domains', 'account'];
  for (const s of GUIDE_STEPS) {
    assert.ok(TABS.includes(s.tab), `${s.id} points at unknown tab "${s.tab}"`);
  }
});

test('the Arabic is written, not left as the English string', () => {
  // Catches a step stubbed with the English text in both slots.
  for (const s of GUIDE_STEPS) {
    assert.notEqual(s.title.ar, s.title.en, `${s.id}.title is identical in both languages`);
    assert.notEqual(s.why.ar, s.why.en, `${s.id}.why is identical in both languages`);
  }
});

test('nextStep returns the first unfinished step', () => {
  assert.equal(nextStep({}).id, 'publish');
  assert.equal(nextStep({ publish: true }).id, GUIDE_STEPS[1].id);
});

test('nextStep returns null once everything is done', () => {
  const all = Object.fromEntries(GUIDE_STEPS.map((s) => [s.id, true]));
  assert.equal(nextStep(all), null);
});

test('nextStep skips completed steps out of order', () => {
  // Someone may finish a later step first; the prompt must still point at the
  // earliest thing still missing.
  assert.equal(nextStep({ publish: true, photo: true, bio: true, domain: true }).id, 'project');
});
