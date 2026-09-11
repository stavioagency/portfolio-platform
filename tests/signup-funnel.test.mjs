// The signup funnel's last hop, and the screen it now lands on.
//
// WHY THIS FILE EXISTS: the funnel was moved from /admin to /studio on
// 2026-09-11, and nothing anywhere pinned where it pointed. That is precisely
// how it came to be movable by one line while the destination could not
// receive what the line carries — /studio routed `plan` to a "not yet"
// placeholder and ignored `lang`, so flipping it would have dropped a paying
// customer's chosen plan and shown them a screen with no way to pay.
//
// The properties below are the contract between three files that are edited
// months apart and never together: verify.js sends, studio/index.js receives,
// plan.js spends. Each assertion is a way that chain has already been able to
// break silently.
//
// SOURCE-LEVEL, like the rest of the suite: no React runner here, and every
// property below is about what the files may contain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STUDIO_SECTIONS } from '../lib/studio-nav.js';
import { resolvePlanCode, planFromQuery } from '../lib/signup-intent.js';
import { listPlans } from '../lib/billing-plans.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const VERIFY = strip(read('pages/signup/verify.js'));
const STUDIO = strip(read('pages/studio/index.js'));
const PLAN = strip(read('components/studio/plan.js'));

// ── Where the funnel points ──────────────────────────────────────────────

test('a newly verified customer is sent to the Studio, not the old editor', () => {
  assert.match(VERIFY, /return `\/studio\?\$\{params\.toString\(\)\}`/,
    'the continue link must build a /studio URL');
  assert.ok(!/return `\/admin\?\$\{params\.toString\(\)\}`/.test(VERIFY),
    'the funnel must not still end at /admin');
});

test('the funnel carries BOTH the plan and the language', () => {
  // Dropping either has shipped before: a plan drops the sale, and a language
  // drops an English customer into an Arabic editor. They travel together.
  assert.match(VERIFY, /params\.set\('lang', lang\)/, 'lang must ride along');
  assert.match(VERIFY, /if \(plan\) params\.set\('plan', plan\)/, 'plan must ride along');
});

// ── Whether the destination can receive it ───────────────────────────────

test('the Studio actually reads the plan it is now sent', () => {
  assert.match(STUDIO, /planFromQuery/,
    'the Studio must consume ?plan= — this is the check that was missing when '
    + 'the funnel could be flipped in one line');
});

test('the Studio reads the language it is now sent', () => {
  assert.match(STUDIO, /get\('lang'\)/, 'the Studio must consume ?lang=');
});

test('Plan is a real screen and no longer a placeholder', () => {
  // The exact failure the funnel move would have caused: `plan` listed among
  // the ids routed to NotYet means a paying customer is shown "not yet".
  const notYet = STUDIO.match(/\[([^\]]*)\]\.includes\(section\)/);
  assert.ok(notYet, 'the placeholder list must still be findable');
  assert.ok(!/'plan'/.test(notYet[1]),
    'plan must not be routed to the NotYet placeholder while the funnel points at it');
  assert.match(STUDIO, /section === 'plan'/, 'and it must render a Plan screen');
  // Still a known section, or a deep link to it would fall back to Home.
  assert.ok(STUDIO_SECTIONS.includes('plan'), 'plan must remain a real section id');
});

test('the plan is spent only once there is a session to spend it on', () => {
  // A customer arriving from their inbox has no session on this device. If the
  // plan were consumed and erased on mount it would be gone before the gate
  // could carry it across the sign-in bounce — the same dropped plan, one step
  // later and much harder to see.
  assert.match(STUDIO, /if \(phase !== 'ready' \|\| planSpent\) return;/,
    'the plan must not be consumed before the session is known');
});

test('the sign-in bounce carries the whole query, not a bare /studio', () => {
  assert.match(STUDIO, /q\.set\('next', here/,
    'the gate must preserve where the customer was going');
  // The login screen reads its OWN ?lang=, which `next` does not carry: without
  // this an English customer read an English gate and got an Arabic form.
  assert.match(STUDIO, /q\.set\('lang', ar \? 'ar' : 'en'\)/,
    'and carry the language across the bounce');
  // The constant is still present as the pre-hydration default, which is what
  // tests/studio-shell.test.mjs pins — these two must stay compatible.
  assert.ok(STUDIO.includes("'/admin?next=/studio'"),
    'the constant default must remain for the first paint');
});

// ── What the Plan screen does with it ────────────────────────────────────

test('Plan hands off to the one checkout rather than growing its own', () => {
  assert.match(PLAN, /\/subscribe\?plan=/, 'it must hand off to /subscribe');
  assert.match(PLAN, /tenant=\$\{encodeURIComponent\(tenant\.id\)\}/,
    'and name the workspace being paid for');
  // INTEGRATION, not the word. The screen SHOULD say "PayPal" — telling a
  // customer where the money changes hands before they press is the point of
  // that line. What it must not do is create a subscription itself.
  for (const forbidden of ['billing-checkout', 'functions.invoke', 'paypal.com', 'approval_url']) {
    assert.ok(!PLAN.toLowerCase().includes(forbidden.toLowerCase()),
      `${forbidden} — Plan chooses a plan; /subscribe is where a subscription is created`);
  }
  assert.match(PLAN, /PayPal/, 'and it must still say where payment is taken');
});

test('Plan never claims an entitlement it has not been told', () => {
  // null means "not answered yet". Rendering the unsubscribed state during that
  // gap tells the customer something the screen does not know.
  assert.match(PLAN, /entitled === null/, 'the unanswered state must be handled explicitly');
  assert.match(PLAN, /entitled === true/, 'and the subscribed state named');
  assert.match(PLAN, /entitled === false/, 'and the unsubscribed state named');
});

// ── The catalogue the whole path agrees on ───────────────────────────────

test('a plan code from a URL is checked against the sellable catalogue', () => {
  // Not a second list of strings: the guarantee is that a retired plan stops
  // being preselectable everywhere the moment it leaves the catalogue.
  const sellable = listPlans().map((p) => p.code);
  assert.ok(sellable.length > 0, 'there must be a sellable catalogue to check against');
  for (const code of sellable) {
    assert.equal(resolvePlanCode(code), code, `${code} is sellable and must resolve`);
  }
  assert.equal(planFromQuery('?plan=definitely-not-a-plan'), null,
    'an unknown code must resolve to null rather than preselecting something');
  assert.equal(planFromQuery('?plan=comped'), null,
    'comped is granted, never chosen from a URL');
});
