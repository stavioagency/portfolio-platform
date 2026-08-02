// Tests for lib/credentials-pdf.js — the hand-written PDF handoff sheet.
// Zero dependencies — run with: npm test
//
// A malformed PDF fails in the READER, not here: no exception, just a file the
// client cannot open. The xref offsets are the fragile part — they are byte
// positions, so a single multi-byte character anywhere above them shifts every
// entry and silently corrupts the document. These tests check the structure
// rather than trusting it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCredentialsPdf, escapePdfText, toLatin1 } from '../lib/credentials-pdf.js';

const CREDS = {
  workspace: 'Acme Studio',
  url: 'https://designakum.site/acme-studio',
  signInUrl: 'https://designakum.site/admin',
  username: 'acmestudio',
  password: 'Xk7-tuna-92Qm',
  email: 'client@acme.com',
};

const decode = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

test('produces a structurally complete PDF', () => {
  const pdf = decode(buildCredentialsPdf(CREDS));
  assert.ok(pdf.startsWith('%PDF-1.4\n'), 'missing header');
  assert.ok(pdf.trimEnd().endsWith('%%EOF'), 'missing EOF marker');
  assert.match(pdf, /\/Type \/Catalog/);
  assert.match(pdf, /\/Type \/Pages/);
  assert.match(pdf, /\/Type \/Page\b/);
  assert.match(pdf, /stream\n[\s\S]*?\nendstream/);
  assert.match(pdf, /trailer\n<< \/Size 7 \/Root 1 0 R >>/);
  // six objects, each opened and closed
  assert.equal((pdf.match(/\d+ 0 obj\n/g) || []).length, 6);
  assert.equal((pdf.match(/\nendobj\n/g) || []).length, 6);
});

// The one that silently breaks the file.
test('every xref offset points at the object it claims', () => {
  const pdf = decode(buildCredentialsPdf(CREDS));
  const xrefAt = Number(pdf.match(/startxref\n(\d+)/)[1]);
  assert.equal(pdf.slice(xrefAt, xrefAt + 4), 'xref', 'startxref does not point at the table');

  const entries = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, 6, 'expected one xref entry per object');
  entries.forEach((off, i) => {
    assert.equal(pdf.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`,
      `xref entry ${i + 1} points at the wrong byte`);
  });
});

test('the declared stream length matches the actual stream', () => {
  const pdf = decode(buildCredentialsPdf(CREDS));
  const declared = Number(pdf.match(/<< \/Length (\d+) >>/)[1]);
  const body = pdf.match(/stream\n([\s\S]*?)\nendstream/)[1];
  assert.equal(body.length, declared);
});

test('every byte is single-byte, so the offsets stay valid', () => {
  const bytes = buildCredentialsPdf({ ...CREDS, workspace: 'Acme — Studio ™' });
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.every((b) => b >= 0 && b <= 255));
});

test('the credentials actually appear on the sheet', () => {
  const pdf = decode(buildCredentialsPdf(CREDS));
  for (const v of [CREDS.username, CREDS.password, CREDS.email, CREDS.url]) {
    assert.ok(pdf.includes(v), `missing ${v}`);
  }
});

test('parentheses and backslashes are escaped, not left to break the syntax', () => {
  // an unescaped ) would terminate the string early and corrupt everything after
  const pdf = decode(buildCredentialsPdf({ ...CREDS, workspace: 'A (B) \\ C' }));
  assert.ok(pdf.includes('A \\(B\\) \\\\ C'));
  assert.equal(escapePdfText('a(b)c'), 'a\\(b\\)c');
  assert.equal(escapePdfText('a\\b'), 'a\\\\b');
});

test('non-Latin-1 text is dropped rather than rendered as garbage', () => {
  assert.equal(toLatin1('استوديو'), '');
  assert.equal(toLatin1('Acme استوديو Studio'), 'Acme Studio');
  assert.equal(toLatin1('line\nbreak'), 'line break');
  // an Arabic-only workspace name drops its row; the ASCII fields still ship
  const pdf = decode(buildCredentialsPdf({ ...CREDS, workspace: 'استوديو' }));
  assert.ok(!pdf.includes('WORKSPACE'), 'empty row should be omitted entirely');
  assert.ok(pdf.includes(CREDS.password), 'the password must still be present');
});

test('missing fields shrink the sheet instead of printing blank labels', () => {
  const pdf = decode(buildCredentialsPdf({ username: 'u', password: 'p' }));
  assert.ok(pdf.includes('USERNAME'));
  assert.ok(!pdf.includes('PORTFOLIO'), 'absent url should not render a label');
  assert.ok(pdf.trimEnd().endsWith('%%EOF'), 'still a complete file');
});

test('an empty credential set still yields a valid, openable file', () => {
  const pdf = decode(buildCredentialsPdf({}));
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
  assert.ok(!/undefined|null|NaN/.test(pdf));
});
