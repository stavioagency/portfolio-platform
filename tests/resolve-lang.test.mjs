// Tests for resolveLang() in lib/translations.js — which language /subscribe
// renders in. Zero dependencies — run with: npm test
//
// The load-bearing case is a visitor arriving from the marketing site: a
// different origin, so nothing is stored, and getting this wrong shows an
// English reader an Arabic payment page. The second is validation — an
// unrecognised value must not survive, because callers persist the result
// and getTranslator() silently renders English for anything it does not
// know, producing a page that contradicts its own lang attribute.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, isLang, resolveLang } from '../lib/translations.js';

test('the URL parameter wins over the stored preference', () => {
  assert.equal(resolveLang('en', 'ar'), 'en');
  assert.equal(resolveLang('ar', 'en'), 'ar');
});

test('a visitor from the marketing site, with nothing stored', () => {
  assert.equal(resolveLang('en', null), 'en');
  assert.equal(resolveLang('ar', null), 'ar');
});

test('falls back to the stored preference when the URL says nothing', () => {
  assert.equal(resolveLang(null, 'en'), 'en');
  assert.equal(resolveLang(undefined, 'en'), 'en');
  assert.equal(resolveLang('', 'en'), 'en');
});

test('Arabic when neither says anything — the product is Arabic-first', () => {
  assert.equal(resolveLang(null, null), 'ar');
  assert.equal(resolveLang(undefined, undefined), 'ar');
});

test('an unrecognised URL value is ignored, not trusted', () => {
  // Would otherwise render English while claiming to be French, and then be
  // persisted as the stored preference.
  assert.equal(resolveLang('fr', 'en'), 'en');
  assert.equal(resolveLang('fr', null), 'ar');
  assert.equal(resolveLang('EN', null), 'ar', 'case-sensitive on purpose');
  assert.equal(resolveLang('en-US', null), 'ar');
});

test('an unrecognised stored value is ignored too', () => {
  // It is persisted by the caller, so one bad write would round-trip forever.
  assert.equal(resolveLang(null, 'fr'), 'ar');
  assert.equal(resolveLang(null, '{}'), 'ar');
});

test('non-string inputs cannot slip through', () => {
  assert.equal(resolveLang(0, null), 'ar');
  assert.equal(resolveLang({}, null), 'ar');
  assert.equal(resolveLang([], null), 'ar');
  assert.equal(resolveLang(null, 0), 'ar');
});

test('isLang and LANGS agree on exactly the two languages we have', () => {
  assert.deepEqual(LANGS, ['ar', 'en']);
  assert.equal(isLang('ar'), true);
  assert.equal(isLang('en'), true);
  assert.equal(isLang('fr'), false);
  assert.equal(isLang(null), false);
});
