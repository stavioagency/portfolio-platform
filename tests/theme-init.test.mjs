// Tests for the pre-paint theme initialiser in pages/_document.js.
//
// THE BUG IT GUARDS. Five pages read `admin_theme` out of localStorage and set
// `data-admin-theme` on <html> — from an effect, which runs after hydration.
// Until then the page painted with :root, the DARK palette, so every
// light-theme user saw a dark page flash to light on every load. The
// initialiser sets the attribute before the body paints.
//
// WHAT ACTUALLY NEEDS ASSERTING is not that the script exists — it is that its
// route list still matches the pages that theme themselves. That list is
// duplicated by necessity: _document cannot import a page to ask. So the two
// drift silently, and in both directions:
//
//   a themed page missing from the list   -> the flash comes back, on that page
//   an unthemed page added to the list    -> WORSE. The public portfolio is
//                                            deliberately dark-only, and would
//                                            start serving a visitor's saved
//                                            admin preference on a customer's
//                                            site, painting it white.
//
// So this derives the truth from the pages themselves and compares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = join(HERE, '..', 'pages');
const DOCUMENT = readFileSync(join(PAGES, '_document.js'), 'utf8');

function pageFiles(dir = PAGES) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...pageFiles(full)); continue; }
    if (entry.endsWith('.js') && !entry.startsWith('_')) out.push(full);
  }
  return out;
}

// pages/foo/bar.js -> /foo/bar ; pages/index.js -> / ; dynamic segments kept
function routeOf(file) {
  const rel = relative(PAGES, file).replace(/\.js$/, '').split(sep).join('/');
  return rel === 'index' ? '/' : `/${rel.replace(/\/index$/, '')}`;
}

// The routes whose components theme themselves — EITHER by setting the
// attribute directly, as the original five pages do, OR by calling the
// applyTheme() helper, as the Phase 1 shells do.
//
// Both spellings have to count. The first version of this scan looked only for
// the literal setAttribute, so when /console and /studio started theming through
// lib/shell-prefs.js the scan stopped seeing them, the lists agreed, and the
// test went green while both new routes had the flash back. A guard that cannot
// see the thing it guards is worse than no guard, because it reports success.
const THEMES_ITSELF = /setAttribute\(\s*['"]data-admin-theme['"]|\bapplyTheme\b/;

const themedRoutes = pageFiles()
  .filter((f) => THEMES_ITSELF.test(readFileSync(f, 'utf8')))
  .map(routeOf)
  .sort();

// The routes the initialiser will act on.
const listedRoutes = [...DOCUMENT.matchAll(/p===\\?"([^"\\]+)\\?"/g)].map((m) => m[1]).sort();

test('the initialiser exists and runs before the app markup', () => {
  assert.match(DOCUMENT, /data-admin-theme/, 'no theme initialiser in _document.js');
  assert.match(DOCUMENT, /admin_theme/, 'the initialiser does not read the storage key');
  const script = DOCUMENT.indexOf('dangerouslySetInnerHTML');
  const main = DOCUMENT.indexOf('<Main />');
  assert.ok(script > -1 && main > -1 && script < main,
    'the initialiser must come before <Main /> or the body paints first');
});

test('its route list matches the pages that actually theme themselves', () => {
  assert.deepEqual(listedRoutes, themedRoutes,
    `drift between _document.js and the pages.\n` +
    `  pages that set data-admin-theme: ${themedRoutes.join(', ')}\n` +
    `  routes in the initialiser:       ${listedRoutes.join(', ')}`);
});

test('the public portfolio is never themed by it', () => {
  // The load-bearing exclusion. `/` and `/[slug]` are a CUSTOMER's site; the
  // stored preference belongs to whoever was last in the admin on this browser.
  for (const route of ['/', '/[slug]', '/privacy', '/terms']) {
    assert.ok(!listedRoutes.includes(route),
      `${route} must not be themed from localStorage — it is not the admin`);
  }
});

test('it defaults to dark and cannot throw', () => {
  // Private browsing makes localStorage throw on access. An initialiser that
  // throws in <body> would abort parsing before the app ever renders.
  assert.match(DOCUMENT, /\|\|\s*\\?"dark\\?"/, 'the default is no longer dark');
  assert.match(DOCUMENT, /try\s*\{/, 'the initialiser is not wrapped in try');
  assert.match(DOCUMENT, /catch\s*\(\s*e\s*\)\s*\{\s*\}/, 'the initialiser does not swallow errors');
});

test('nothing else needs the attribute to be set server-side', () => {
  // The attribute must NOT appear in the SSR'd <html> element itself: the
  // server cannot know a browser's localStorage, and rendering a guess would
  // make it wrong for half of users and cause a hydration mismatch.
  assert.equal(/<Html[^>]*data-admin-theme/.test(DOCUMENT), false,
    'the theme must not be baked into the server-rendered <Html>');
});
