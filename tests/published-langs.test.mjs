// Which languages a portfolio is live in.
//
// The tests that matter are the refusals: a subset that would publish nothing,
// and a subset asking for a language the client does not write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offeredLangs, liveLangs, switcherOn, openingLang } from '../lib/published-langs.js';

const bi = { bilingual: true, default_lang: 'ar' };
const mono = { bilingual: false, default_lang: 'ar' };

test('what the profile offers', () => {
  assert.deepEqual(offeredLangs(bi), ['ar', 'en']);
  assert.deepEqual(offeredLangs(mono), ['ar']);
  assert.deepEqual(offeredLangs(null), ['ar']);
});

test('NULL published_langs is exactly today behaviour', () => {
  // Every existing tenant has NULL. Nothing changed for anyone on the day the
  // column landed, and that is the point of the default.
  assert.deepEqual(liveLangs(bi, {}), ['ar', 'en']);
  assert.deepEqual(liveLangs(bi, { published_langs: null }), ['ar', 'en']);
  assert.deepEqual(liveLangs(mono, {}), ['ar']);
});

test('a subset publishes only that language', () => {
  assert.deepEqual(liveLangs(bi, { published_langs: ['ar'] }), ['ar']);
  assert.deepEqual(liveLangs(bi, { published_langs: ['en'] }), ['en']);
});

test('A SUBSET THAT WOULD PUBLISH NOTHING IS IGNORED', () => {
  // A page in no language is a blank page — worse than the over-sharing this
  // column exists to prevent, and one stray click away.
  assert.deepEqual(liveLangs(bi, { published_langs: [] }), ['ar', 'en']);
  assert.deepEqual(liveLangs(mono, { published_langs: ['en'] }), ['ar']);
});

test('a language the client does not write cannot be published', () => {
  assert.deepEqual(liveLangs(mono, { published_langs: ['ar', 'en'] }), ['ar']);
});

test('the switch appears only when more than one language is LIVE', () => {
  // Writing in two is not the same as being live in two: a door to an empty
  // room is worse than no door.
  assert.equal(switcherOn(bi, {}), true);
  assert.equal(switcherOn(bi, { published_langs: ['ar'] }), false);
  assert.equal(switcherOn(mono, {}), false);
});

test('the page opens in the visitor language when that is live', () => {
  assert.equal(openingLang(bi, {}, 'en'), 'en');
  assert.equal(openingLang(bi, { published_langs: ['ar'] }, 'en'), 'ar');
  assert.equal(openingLang(mono, {}, 'en'), 'ar');
});
