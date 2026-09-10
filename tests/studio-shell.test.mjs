// The Studio shell and its navigation.
//
// /studio is the customer-facing management experience being built to replace
// what /admin does for customers. These tests pin the properties that are easy
// to break silently and hard to notice in review: direction, reachability,
// accessible names, and the authorization boundary.
//
// SOURCE-LEVEL, deliberately. The repo has no React test runner, and every
// property below is about what the files may contain — which is exactly what
// source inspection can settle. The behaviour that needs a browser is called
// out in the phase report rather than asserted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_SECTION, STUDIO_SECTIONS, isStudioSection, studioNav, studioSectionLabel } from '../lib/studio-nav.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SHELL = read('components/studio/StudioShell.js');
const SHELL_CODE = strip(SHELL);
const PAGE = read('pages/studio/index.js');
const strip2 = strip;
const PAGE_CODE = strip(PAGE);

// ── Navigation ───────────────────────────────────────────────────────────

test('every section is reachable from the navigation, and every nav item is a section', () => {
  // The failure this prevents is a screen that exists but cannot be opened —
  // or a nav item that opens nothing. Both look fine in review.
  for (const ar of [true, false]) {
    const nav = studioNav(ar);
    const ids = [...nav.primary, ...nav.more.items].map((i) => i.id);
    assert.deepEqual([...ids].sort(), [...STUDIO_SECTIONS].sort(),
      'the navigation and the section list disagree');
    assert.equal(new Set(ids).size, ids.length, 'a section appears twice in the navigation');
  }
  assert.ok(isStudioSection(DEFAULT_SECTION), 'the default section must be a real one');
});

test('the primary list stays short', () => {
  // Five items is the point. A sixth is how this becomes the ten-item control
  // panel the redesign exists to replace, and it will arrive as "just one more".
  const nav = studioNav(false);
  assert.equal(nav.primary.length, 5, 'the primary navigation must stay at five items');
  assert.ok(nav.more.items.length <= 5, 'More is a drawer, not a second menu');
});

test('every label exists in both languages, and they differ', () => {
  // A missing translation shows as an English label in an Arabic UI; a lazy one
  // shows as the same string twice. Both are caught here.
  for (const id of STUDIO_SECTIONS) {
    const ar = studioSectionLabel(id, true);
    const en = studioSectionLabel(id, false);
    assert.ok(ar && en, `${id} is missing a label`);
    assert.notEqual(ar, en, `${id} has the same label in both languages`);
    assert.match(ar, /[؀-ۿ]/, `${id}'s Arabic label is not Arabic`);
  }
});

// ── Direction ────────────────────────────────────────────────────────────

test('the shell is laid out logically, so Arabic mirrors without a second stylesheet', () => {
  // The whole reason the shell can be bilingual for free. A single `left:` here
  // pins the rail to one side and the Arabic layout quietly breaks.
  const css = SHELL.slice(SHELL.indexOf('<style jsx>'));
  for (const physical of [
    /(?<![-\w])margin-left\s*:/, /(?<![-\w])margin-right\s*:/,
    /(?<![-\w])padding-left\s*:/, /(?<![-\w])padding-right\s*:/,
    /(?<![-\w])border-left\s*:/, /(?<![-\w])border-right\s*:/,
    /(?<![-\w])left\s*:/, /(?<![-\w])right\s*:/,
    /text-align:\s*(left|right)/,
  ]) {
    assert.ok(!physical.test(css), `physical property in the shell: ${physical}`);
  }
  // And the properties that replace them are actually used.
  assert.ok(/border-inline-end/.test(css) && /margin-inline-start/.test(css) && /text-align: start/.test(css));
});

test('direction comes from the language, and is set on the element that owns it', () => {
  assert.ok(/dir=\{ar \? 'rtl' : 'ltr'\}/.test(SHELL_CODE), 'the shell must carry dir');
  assert.ok(/lang=\{ar \? 'ar' : 'en'\}/.test(SHELL_CODE), 'and lang, for the font stack and screen readers');
});

// ── Accessibility ────────────────────────────────────────────────────────

test('every icon-only control has an accessible name', () => {
  // An icon button with no name is announced as "button" and is unusable by
  // anyone not looking at it. The sign-out chip is the one icon-only control in
  // the shell, so it carries visually-hidden text.
  assert.ok(/className="srOnly"/.test(SHELL_CODE), 'icon-only controls need a hidden label');
  assert.ok(/clip-path: inset\(50%\)/.test(SHELL), 'the hidden label must stay readable to a screen reader');
  // Navigation landmarks are named, because there are two of them (rail and bar)
  // and "navigation, navigation" tells a screen-reader user nothing.
  assert.equal((SHELL_CODE.match(/aria-label=\{ar \? 'أقسام الاستوديو' : 'Studio sections'\}/g) || []).length, 2);
  assert.ok(/aria-current=\{section === item\.id \? 'page' : undefined\}/.test(SHELL_CODE),
    'the current section must be announced, not only coloured');
});

test('the mobile sheet can be dismissed by the gestures people already know', () => {
  // A sheet that only closes via its own button is a trap on a phone.
  assert.ok(/e\.key === 'Escape'/.test(SHELL_CODE), 'Escape must close the sheet');
  assert.ok(/removeEventListener/.test(SHELL_CODE), 'and the listeners must be torn down');
  assert.ok(/aria-modal="true"/.test(SHELL_CODE));
});

test('focus is visible on every interactive surface', () => {
  const css = SHELL.slice(SHELL.indexOf('<style jsx>'));
  const rings = [...css.matchAll(/:focus-visible/g)].length;
  assert.ok(rings >= 4, `only ${rings} focus styles — every control needs one`);
  assert.ok(!/outline:\s*none/.test(css), 'focus must never be removed outright');
});

// ── The page: authorization and honesty ──────────────────────────────────

test('the session is checked before anything is read', () => {
  // Order is the property. Reading first and gating after is how a signed-out
  // request still hits the database.
  const gate = PAGE_CODE.indexOf('getSession()');
  const read1 = PAGE_CODE.indexOf('loadWorkspaces()');
  assert.ok(gate > -1 && read1 > gate, 'the session check must precede the first read');
  assert.ok(/if \(!s\) \{ setPhase\('signedout'\); return; \}/.test(PAGE_CODE),
    'no session must end the request, not fall through');
});

test('the workspace list is scoped by membership, never read from `tenants`', () => {
  // THE BUG THIS PINS. `tenants` carries a PUBLIC read policy — USING (true) —
  // so selecting from it returns every workspace on the platform to anybody.
  // The first version did that and took row zero: correct by luck for a
  // platform owner, and every real customer would have been shown someone
  // else's portfolio — wrong name, wrong address, and a profile they cannot
  // read, reported as "this account is missing its setup".
  //
  // Found by opening the Studio as a signed-in owner and noticing the list
  // could only have come from an unscoped read.
  const DATA = strip(read('lib/studio-data.js'));
  assert.ok(/\.from\('tenant_admins'\)/.test(DATA),
    'the list must come through the membership table');
  assert.ok(!/\.from\('tenants'\)/.test(DATA),
    '`tenants` is world-readable and must never be the source of the list');
  assert.ok(!/\.from\('tenants'\)/.test(PAGE_CODE), 'and the page must not do it either');
  assert.ok(/loadWorkspaces\(\)/.test(PAGE_CODE), 'the page uses the scoped loader');
});

test('the open section is read from the address bar, not the router', () => {
  // THE BUG THIS PINS. On this statically-optimised page router.query was
  // observed EMPTY while router.isReady was already true and the URL plainly
  // read ?s=work — so /studio?s=work silently opened Home and every deep link
  // into a section was broken, with nothing reporting it.
  // window.location IS the address bar, which is what the customer pasted.
  assert.ok(/new URLSearchParams\(window\.location\.search\)\.get\('s'\)/.test(PAGE_CODE),
    'the section must come from the URL itself');
  assert.ok(!/router\.query\.s/.test(PAGE_CODE), 'router.query is not reliable here');
  assert.ok(/addEventListener\('popstate'/.test(PAGE_CODE), 'the back button must still work');
});

test('authorization is left to the database', () => {
  // RLS decides which workspaces come back. A filter here would be a security
  // control in the browser, which is not one.
  assert.ok(!/is_platform_owner|SERVICE_ROLE|service_role/.test(PAGE),
    'the Studio is not an owner surface and must not check for one');
  assert.ok(!/\.eq\('user_id'|auth\.uid\(\)/.test(PAGE_CODE),
    'tenant scoping belongs to RLS, not to a client-side filter');
  // Reads only. Publishing and editing arrive in later phases; until then this
  // screen must not be able to change anything.
  for (const write of ['.insert(', '.update(', '.upsert(', '.delete(']) {
    assert.ok(!PAGE_CODE.includes(write), `${write} — the shell phase is read-only`);
  }
});

test('there is one login screen, and this is not it', () => {
  // Two sign-in forms is two places for a session bug to live. /admin already
  // reads ?next= and returns you, which is how /console does it too.
  assert.ok(PAGE_CODE.includes('/admin?next=/studio'), 'sign-in must hand off to the existing screen');
  assert.ok(!/signInWithPassword|signInWithOAuth/.test(PAGE), 'the Studio must not grow its own sign-in');
});

test('no state is ever a blank screen or a frozen button', () => {
  for (const phase of ['loading', 'signedout', 'noworkspace', 'error']) {
    assert.ok(PAGE_CODE.includes(`${phase}:`), `the ${phase} state needs its own copy`);
  }
  assert.ok(/onRetry|onClick=\{onRetry\}/.test(PAGE_CODE), 'a failure must offer a way forward');
  assert.ok(/لم يتغيّر شيء في معرضك|Nothing in your portfolio has changed/.test(PAGE),
    'an error must say whether the customer lost anything');
});

test('nothing on Home is invented', () => {
  // Every line on Home is read from the customer's own rows. The moment a
  // number here is computed for effect, the screen becomes a dashboard.
  assert.ok(/hasPublicContent/.test(PAGE_CODE), 'completion reuses the public renderability check');
  assert.ok(!/Math\.random|toFixed\(|% *\+|Math\.round\(/.test(PAGE_CODE), 'no synthesised figures');
  assert.ok(/projectCount === 0/.test(PAGE_CODE), 'an empty portfolio must read as empty, not as zero-of-something');
});

test('the placeholder is marked as temporary and points somewhere that works', () => {
  // A placeholder with no exit is a dead end, and one with no note becomes
  // permanent. Both are recorded so this is removed rather than forgotten.
  assert.ok(/function NotYet/.test(PAGE_CODE));
  assert.ok(/href="\/admin"/.test(PAGE_CODE), 'it must point at the editor that works today');
  assert.ok(/must never become a permanent part of the product/.test(PAGE),
    'the placeholder must carry its own removal note');
});
