// Tests for lib/reserved-slugs.js — what a public signup may claim as its
// address. Zero dependencies — run with: npm test
//
// The load-bearing case is route shadowing: a tenant slug becomes /{slug}, and
// Next.js resolves static routes first, so a workspace called `admin` is not an
// error — it is silently unreachable. Every real route must be refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESERVED_SLUGS, SLUG_MIN, SLUG_MAX, slugError, suggestSlug,
} from '../lib/reserved-slugs.js';

test('ordinary slugs are accepted', () => {
  for (const slug of ['ahmed', 'studio-riyadh', 'f9designer', 'a1b2c3', 'my-portfolio-2026']) {
    assert.equal(slugError(slug), '', `${slug} should be valid`);
  }
});

test('every real route is refused', () => {
  // If a route is added to pages/ and not to RESERVED_SLUGS, this is the test
  // that should start failing.
  for (const route of ['admin', 'subscribe', 'signup', 'privacy', 'terms', 'api']) {
    assert.equal(slugError(route), 'slug_reserved', `${route} is a real route and must be reserved`);
  }
});

test('the routes the admin split will need are refused before they exist', () => {
  // `studio` and `console` are the two halves of the coming split, `me` is the
  // signed-in user's own page. None of them is a route yet, which is exactly
  // why this test exists: reservation has to beat the customer to the word.
  // Note `me` is shorter than SLUG_MIN, so today it is refused for length —
  // assert only that it is refused, and that the set carries it for the day
  // the minimum changes.
  assert.equal(slugError('studio'), 'slug_reserved');
  assert.equal(slugError('console'), 'slug_reserved');
  assert.notEqual(slugError('me'), '', '`me` must never be claimable');
  for (const word of ['studio', 'console', 'me']) {
    assert.ok(RESERVED_SLUGS.has(word), `${word} must be in RESERVED_SLUGS`);
  }
});

test('names that would impersonate the platform are refused', () => {
  for (const slug of ['designakum', 'official', 'support', 'security', 'noreply']) {
    assert.equal(slugError(slug), 'slug_reserved');
  }
});

test('length is bounded at both ends', () => {
  assert.equal(slugError('ab'), 'slug_too_short');
  assert.equal(slugError('a'.repeat(SLUG_MIN)), '');
  assert.equal(slugError('a'.repeat(SLUG_MAX)), '');
  assert.equal(slugError('a'.repeat(SLUG_MAX + 1)), 'slug_too_long');
});

test('an empty or missing slug is reported as required, not as malformed', () => {
  for (const value of ['', '   ', null, undefined]) {
    assert.equal(slugError(value), 'slug_required');
  }
});

test('shape rules: no leading, trailing or doubled hyphens, no exotic characters', () => {
  for (const bad of ['-ahmed', 'ahmed-', 'ah--med', 'Ahmed Studio', 'ahmed_studio',
                     'ahmed.studio', 'ahmed/studio', 'أحمد', 'ahmed?x=1', 'ahmed%20']) {
    assert.equal(slugError(bad), 'slug_invalid_characters', `${JSON.stringify(bad)} must be rejected`);
  }
});

test('uppercase is normalised rather than rejected', () => {
  // The form may send what the user typed; trimming and lowercasing is the
  // server's job, not a reason to refuse them.
  assert.equal(slugError('  Studio-Riyadh  '), '');
});

test('an all-digit slug is refused', () => {
  assert.equal(slugError('12345'), 'slug_reserved');
});

test('suggestSlug produces something usable from a Latin name', () => {
  assert.equal(suggestSlug('Studio Riyadh'), 'studio-riyadh');
  assert.equal(suggestSlug('  Ahmed  Al Habib  '), 'ahmed-al-habib');
  assert.equal(suggestSlug('F9 Designer!!'), 'f9-designer');
});

test('suggestSlug returns empty for an Arabic name rather than punycode', () => {
  // Deliberate: the user is then asked to choose a Latin address, instead of
  // being handed something nobody can read back or dictate over the phone.
  assert.equal(suggestSlug('ديزاينكم'), '');
  assert.equal(suggestSlug('استوديو الرياض'), '');
});

test('suggestSlug output is not assumed valid — callers must re-check', () => {
  // "Admin" suggests "admin", which is reserved. The suggestion is a
  // convenience; slugError remains the decision.
  assert.equal(suggestSlug('Admin'), 'admin');
  assert.equal(slugError(suggestSlug('Admin')), 'slug_reserved');
  assert.equal(slugError(suggestSlug('AB')), 'slug_too_short');
});

test('the reserved list is a Set of lowercase entries', () => {
  assert.ok(RESERVED_SLUGS instanceof Set);
  for (const entry of RESERVED_SLUGS) {
    assert.equal(entry, entry.toLowerCase(), `${entry} must be lowercase to match normalised input`);
  }
});
