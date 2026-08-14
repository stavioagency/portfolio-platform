// Tests for lib/shell-prefs.js.
//
// The load-bearing assertion is the LAST one. pages/admin.js has its own
// private copies of readLang/applyLang, and this module deliberately does not
// touch that file — extracting them is part of the gradual migration, not a
// side effect of adding a shell. So the storage contract is duplicated right
// now, and duplication of a contract is drift waiting to happen. If the two
// ever disagree, a person who picks Arabic in the admin opens the studio in
// English and it looks like the setting did not save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANG_KEY, THEME_KEY, DEFAULT_THEME } from '../lib/shell-prefs.js';

const ADMIN = readFileSync(new URL('../pages/admin.js', import.meta.url), 'utf8');

test('the keys are the ones pages/admin.js already uses', () => {
  assert.match(ADMIN, new RegExp(`getItem\\(\\s*'${THEME_KEY}'`),
    `admin.js does not read '${THEME_KEY}' — the theme contract has drifted`);
  assert.match(ADMIN, new RegExp(`setItem\\(\\s*'${LANG_KEY}'`),
    `admin.js does not write '${LANG_KEY}' — the language contract has drifted`);
});

test('the theme default matches the token layer', () => {
  // :root IS the dark palette, so anything else here would mean the stored
  // default and the painted default disagree on first load.
  assert.equal(DEFAULT_THEME, 'dark');
});

test('admin.js still defaults the theme to dark too', () => {
  assert.match(ADMIN, /getItem\('admin_theme'\)\s*\|\|\s*'dark'/);
});
