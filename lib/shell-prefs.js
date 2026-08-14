// Language and theme preferences, as the shells read and write them.
//
// These are the SAME two localStorage keys pages/admin.js already uses —
// `lang` and `admin_theme` — because a person who sets Arabic in the admin and
// then opens the studio has expressed a preference about the product, not about
// a page. A second key would read as the setting silently not sticking.
//
// admin.js has private copies of readLang/applyLang. They are not extracted
// here yet: that means editing admin.js, which the Phase 1 migration does
// deliberately and gradually rather than as a side effect of adding a shell.
// Until it adopts this module the contract is duplicated, so
// tests/shell-prefs.test.mjs asserts the KEYS still match by reading admin.js —
// drift here would be silent and would look like a bug in the new shells.
import { resolveLang } from './translations.js';

export const LANG_KEY = 'lang';
export const THEME_KEY = 'admin_theme';
export const DEFAULT_THEME = 'dark';

/** The language to start in: an explicit ?lang= wins, then the stored one. */
export function readLang(urlLang = null) {
  let stored = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch (_) { /* private mode */ }
  return resolveLang(urlLang, stored);
}

/**
 * Persist the language AND apply it to the document.
 *
 * Both halves matter: `dir` is what flips the entire interface to RTL, and the
 * token layer keys its Arabic treatments off `html[dir='rtl']` — the eyebrow's
 * Reem Kufi, the 1.75 Arabic line height. Setting the state without setting the
 * attribute gives Arabic text in a Latin layout.
 */
export function applyLang(lang) {
  if (typeof document === 'undefined') return;
  try { localStorage.setItem(LANG_KEY, lang); } catch (_) { /* private mode */ }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function readTheme() {
  try { return localStorage.getItem(THEME_KEY) || DEFAULT_THEME; } catch (_) { return DEFAULT_THEME; }
}

/**
 * Persist the theme and apply it.
 *
 * The attribute is also set before first paint by the initialiser in
 * pages/_document.js — this is what keeps it correct AFTER a toggle. Any route
 * calling this must be listed there too, or it gets the flash back;
 * tests/theme-init.test.mjs fails if the two drift.
 */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const value = theme === 'light' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, value); } catch (_) { /* private mode */ }
  document.documentElement.setAttribute('data-admin-theme', value);
}
