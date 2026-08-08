// Tests for keepPeriodEnd() in supabase/functions/billing-webhook/index.ts —
// the guard that stops a webhook erasing a paid-through date.
//
// THE BUG THESE LOCK DOWN
// -----------------------
// PayPal DROPS billing_info.next_billing_time the moment a subscription is
// cancelled. That is not a guess: both cancellations stored in billing_events
// on this project show the field present on ACTIVATED and absent on CANCELLED,
// while last_payment.time survives. So a re-read after cancellation reports
// `currentPeriodEnd: null`.
//
// subscription_updated and payment_succeeded used to write that straight
// through. The entitlement predicate is
// `status = 'canceled' AND current_period_end > now()`, so a null is a
// REVOCATION — it takes away time the customer already paid for. PayPal does
// not guarantee delivery order and retries for three days, so an ACTIVATED,
// UPDATED or retried PAYMENT.SALE.COMPLETED landing after a cancellation is a
// real ordering. The loss scales with the plan: at worst a month on monthly, up
// to a full year on yearly.
//
// WHY BY EXTRACTION RATHER THAN BY IMPORT
// ---------------------------------------
// billing-webhook is a Deno Edge Function: it imports from `jsr:`, calls
// Deno.serve at module scope, and cannot be imported by Node. Same constraint
// and same solution as tests/client-email-lang.test.mjs — the decision is
// written as a pure, exported function, and this file lifts it out of the
// source by brace matching and runs it for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEBHOOK = join(ROOT, 'supabase/functions/billing-webhook/index.ts');
const SOURCE = readFileSync(WEBHOOK, 'utf8');

// Exactly the annotations keepPeriodEnd's signature uses. Deliberately explicit
// rather than a general stripper: if the signature changes, extraction fails
// loudly instead of quietly testing something else.
function stripTypes(source) {
  return source
    .replaceAll('remoteEnd: string | null | undefined,', 'remoteEnd,')
    .replaceAll('knownEnd: string | null | undefined,', 'knownEnd,')
    .replaceAll('): string | null {', ') {');
}

/** Lift `name`'s full declaration out of already-stripped source. */
function extract(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.notEqual(start, -1, `${name} should be exported — the test cannot run otherwise`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) {
      return source.slice(start, i + 1).replace(/^export /, '');
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const { keepPeriodEnd } = new Function(
  [extract(stripTypes(SOURCE), 'keepPeriodEnd'), 'return { keepPeriodEnd };'].join('\n'),
)();

const YEAR_OUT = '2027-08-07T10:00:00Z'; // a real ACTIVATED next_billing_time
const MONTH_OUT = '2026-09-08T10:00:00Z'; // ditto, from the monthly plan

// --- the regression itself ---------------------------------------------------

test('a NULL from PayPal preserves the period end we already know', () => {
  // The exact shape of a re-read after cancellation.
  assert.equal(keepPeriodEnd(null, YEAR_OUT), YEAR_OUT);
  assert.equal(keepPeriodEnd(null, MONTH_OUT), MONTH_OUT);
});

test('a YEARLY subscriber keeps every remaining paid month', () => {
  // The case with the largest blast radius: cancel in month two of twelve, then
  // any ACTIVATED / UPDATED / retried PAYMENT.SALE.COMPLETED lands afterwards.
  // Writing PayPal's null would have revoked ~10 paid months instantly.
  const kept = keepPeriodEnd(null, YEAR_OUT);
  assert.equal(kept, YEAR_OUT);
  assert.ok(new Date(kept) > new Date('2027-01-01'), 'must still be a year out, not a month');
});

test('undefined is treated exactly like null — it is not a date either', () => {
  assert.equal(keepPeriodEnd(undefined, YEAR_OUT), YEAR_OUT);
});

// --- PayPal still wins when it actually has an answer ------------------------

test('PayPal stays authoritative whenever it reports a date', () => {
  // The renewal path: a new next_billing_time must move the period end forward,
  // or a paid renewal would never extend anything.
  assert.equal(keepPeriodEnd(YEAR_OUT, MONTH_OUT), YEAR_OUT);
  // And it must be free to move it BACKWARDS too — a downgrade or a revise is
  // PayPal's call, not ours. This is why the guard is `??` and not "keep the
  // later of the two".
  assert.equal(keepPeriodEnd(MONTH_OUT, YEAR_OUT), MONTH_OUT);
});

test('a first activation with nothing stored yet takes PayPal\'s date', () => {
  // checkout writes the pending row with no current_period_end, so this is the
  // normal ACTIVATED path.
  assert.equal(keepPeriodEnd(MONTH_OUT, null), MONTH_OUT);
});

test('both missing is null — there is genuinely nothing to keep', () => {
  // Not a silent success: the cancellation branch has its own three-tier
  // fallback for this, and it is the only branch allowed to invent a date.
  assert.equal(keepPeriodEnd(null, null), null);
  assert.equal(keepPeriodEnd(undefined, undefined), null);
});

test('an empty string is not a date, and must not be preserved as one', () => {
  // `??` passes '' through, which would be written to a timestamptz column and
  // rejected. Documented so the behaviour is a decision rather than a surprise:
  // nothing in the adapter can produce '', because it maps a missing field to
  // null explicitly.
  assert.equal(keepPeriodEnd('', YEAR_OUT), '');
  assert.ok(!SOURCE.includes("?? ''"), 'the adapter must map a missing field to null, never to an empty string');
});

// --- the call sites ----------------------------------------------------------
// The pure function cannot prove it is actually WIRED IN, and "not wired in" is
// precisely what the bug was. These read the source, which is the only way to
// assert it from Node.

test('neither vulnerable branch writes PayPal\'s date straight through', () => {
  const unguarded = SOURCE.split('\n').filter(
    (line) => /current_period_end:\s*remote\.currentPeriodEnd/.test(line),
  );
  // One survivor is expected and correct: healMissingSubscription() adopts a
  // subscription that has NO local row, so there is nothing to preserve.
  assert.equal(
    unguarded.length, 1,
    'only healMissingSubscription may assign remote.currentPeriodEnd directly',
  );
  const idx = SOURCE.indexOf(unguarded[0]);
  const before = SOURCE.slice(0, idx);
  assert.ok(
    before.lastIndexOf('function healMissingSubscription') > before.lastIndexOf('switch (event.kind)'),
    'the one direct assignment must be inside healMissingSubscription, not in a webhook branch',
  );
});

test('subscription_updated and payment_succeeded both route through keepPeriodEnd', () => {
  const guarded = SOURCE.match(
    /current_period_end:\s*keepPeriodEnd\(remote\.currentPeriodEnd,\s*sub\.current_period_end\)/g,
  );
  assert.equal(guarded?.length, 2, 'both branches must keep the known date when PayPal reports none');
});
