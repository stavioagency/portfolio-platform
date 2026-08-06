// Tests for lib/billing-export.js — the subscriber CSV export.
// Zero dependencies — run with: npm test
//
// The interesting cases are all adversarial: the workspace name in these rows is
// free text a client typed, and it lands in a file the OWNER opens in Excel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeCsvValue, toCsv, subscribersCsv, exportFilename } from '../lib/billing-export.js';

test('ordinary values pass through untouched', () => {
  assert.equal(escapeCsvValue('Studio Riyadh'), 'Studio Riyadh');
  assert.equal(escapeCsvValue(12), '12');
  assert.equal(escapeCsvValue(null), '');
  assert.equal(escapeCsvValue(undefined), '');
});

test('commas, quotes and newlines are quoted so columns cannot shift', () => {
  assert.equal(escapeCsvValue('Studio, Riyadh'), '"Studio, Riyadh"');
  assert.equal(escapeCsvValue('He said "hi"'), '"He said ""hi"""');
  assert.equal(escapeCsvValue('line one\nline two'), '"line one\nline two"');
});

test('formula-leading values are neutralised (CSV injection)', () => {
  // Excel executes these on open. The apostrophe makes the cell literal text.
  for (const payload of ['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd']) {
    const out = escapeCsvValue(payload);
    // A payload that ALSO needs CSV quoting (\r does) comes back wrapped, so the
    // apostrophe sits just inside the quote rather than at position 0.
    const inner = out.startsWith('"') ? out.slice(1) : out;
    assert.ok(inner.startsWith("'"), `${JSON.stringify(payload)} was not neutralised: ${JSON.stringify(out)}`);
  }
  // Both rules apply at once: neutralised with a leading apostrophe, then
  // quoted with its inner quotes doubled.
  assert.equal(
    escapeCsvValue('=HYPERLINK("http://evil","click")'),
    '"\'=HYPERLINK(""http://evil"",""click"")"',
  );
});

test('a neutralised value containing a comma is also quoted', () => {
  const out = escapeCsvValue('=A1,B1');
  assert.equal(out, '"\'=A1,B1"');
});

test('rows are joined with CRLF so Excel on Windows reads them as rows', () => {
  const csv = toCsv(['a', 'b'], [['1', '2'], ['3', '4']]);
  assert.equal(csv, 'a,b\r\n1,2\r\n3,4');
});

const NOW = Date.parse('2026-08-05T12:00:00Z');
const rows = [
  {
    name: 'Studio, Riyadh',
    slug: 'studio',
    email: 'a@example.com',
    subscription: {
      status: 'active', plan_code: 'yearly', amount: 12000,
      current_period_end: '2027-08-05T00:00:00Z', created_at: '2026-08-05T00:00:00Z',
    },
  },
  { name: 'Comped client', slug: 'comped', email: 'b@example.com', subscription: { status: 'comped', plan_code: 'comped' } },
  { name: 'Never paid', slug: 'none', email: 'c@example.com', subscription: null },
];

test('the export carries one header row and one row per subscriber', () => {
  const lines = subscribersCsv(rows, 'en', NOW).split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^Workspace,Slug,Email,Plan,Status,Renews,Amount/);
});

test('each row reports the derived state, not the raw status', () => {
  const csv = subscribersCsv(rows, 'en', NOW);
  assert.match(csv, /"Studio, Riyadh",studio,a@example\.com,Yearly,Active,5 Aug 2027,SAR 120/);
  assert.match(csv, /Comped client,comped,b@example\.com,Granted access,Granted,,,/);
  assert.match(csv, /Never paid,none,c@example\.com,No plan,Not subscribed,,,/);
});

test('the Arabic export keeps Latin numerals', () => {
  const csv = subscribersCsv(rows, 'ar', NOW);
  assert.ok(!/[٠-٩]/.test(csv), 'Arabic-Indic digits must not appear');
  assert.match(csv, /120/);
});

test('an empty list still produces a usable file with headers', () => {
  const csv = subscribersCsv([], 'en', NOW);
  assert.equal(csv.split('\r\n').length, 1);
  assert.equal(subscribersCsv(null, 'en', NOW), csv, 'a null list must not throw');
});

test('the filename sorts chronologically and is zero-padded', () => {
  assert.equal(exportFilename('subscribers', new Date('2026-03-09T00:00:00Z')), 'subscribers-2026-03-09.csv');
});
