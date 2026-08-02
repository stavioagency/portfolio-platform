// Tests for lib/credentials.js — the handoff message builders.
// Zero dependencies — run with: npm test
//
// These strings are the ONLY copy of a temporary password that leaves the
// creation flow. A dropped field or a mangled mailto is a workspace the client
// cannot sign into, so the cases below pin: every field survives, optional
// fields are omitted rather than left dangling, and the mailto stays intact when
// the workspace name contains characters that would otherwise truncate it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  portfolioUrl,
  credentialsText,
  whatsappMessage,
  emailSubject,
  mailtoLink,
  credentialsFilename,
  workspaceLabel,
} from '../lib/credentials.js';

const FULL = {
  workspace: 'Acme Studio',
  username: 'acme',
  password: 'Xk7-tuna-92Qm',
  email: 'client@acme.com',
  url: 'https://designakum.com/acme-studio',
  signInUrl: 'https://designakum.com/admin',
};

test('portfolioUrl joins origin and slug without doubling slashes', () => {
  assert.equal(portfolioUrl('https://x.com', 'acme'), 'https://x.com/acme');
  assert.equal(portfolioUrl('https://x.com/', '/acme'), 'https://x.com/acme');
});

test('portfolioUrl returns null rather than a half-formed URL', () => {
  assert.equal(portfolioUrl('', 'acme'), null);
  assert.equal(portfolioUrl('https://x.com', ''), null);
  assert.equal(portfolioUrl(null, null), null);
});

test('credentialsText carries every field the admin must hand over', () => {
  const out = credentialsText(FULL, 'en');
  for (const v of [FULL.workspace, FULL.username, FULL.password, FULL.email, FULL.url, FULL.signInUrl]) {
    assert.ok(out.includes(v), `missing ${v} in:\n${out}`);
  }
});

test('the password survives verbatim in every format', () => {
  // the one value that cannot be recovered if it is mangled
  for (const build of [credentialsText, whatsappMessage]) {
    assert.ok(build(FULL, 'en').includes(FULL.password));
    assert.ok(build(FULL, 'ar').includes(FULL.password));
  }
  assert.ok(decodeURIComponent(mailtoLink(FULL, 'en')).includes(FULL.password));
});

test('optional fields are omitted, never left dangling', () => {
  const noUrl = { ...FULL, url: '' };
  const out = credentialsText(noUrl, 'en');
  assert.ok(!out.includes('Portfolio:'), `dangling label in:\n${out}`);
  assert.ok(out.includes('Username: acme'));
  // and no blank line where the URL would have been
  assert.ok(!/\n\s*\n/.test(out));
});

test('both locales render, and Arabic is not just the English string', () => {
  const en = whatsappMessage(FULL, 'en');
  const ar = whatsappMessage(FULL, 'ar');
  assert.notEqual(en, ar);
  assert.ok(/[؀-ۿ]/.test(ar), 'Arabic message has no Arabic text');
  assert.ok(!/[؀-ۿ]/.test(en), 'English message leaked Arabic text');
});

test('the WhatsApp message explains the forced password change', () => {
  assert.match(whatsappMessage(FULL, 'en'), /change the password/i);
  assert.ok(whatsappMessage(FULL, 'ar').includes('تغيير كلمة المرور'));
});

test('mailtoLink survives characters that would truncate the body', () => {
  const nasty = { ...FULL, workspace: 'A&B "Design" ?x=1', password: 'a&b=c?d#e' };
  const link = mailtoLink(nasty, 'en');
  // exactly one '?' separating the address from the query
  assert.equal(link.indexOf('?'), link.lastIndexOf('?'));
  // exactly one '&' joining subject and body — any others must be escaped
  assert.equal(link.split('&').length - 1, 1);
  const decoded = decodeURIComponent(link);
  assert.ok(decoded.includes('a&b=c?d#e'), 'password did not survive encoding');
  assert.ok(decoded.includes('A&B "Design" ?x=1'), 'workspace did not survive encoding');
});

test('mailtoLink addresses the client', () => {
  assert.ok(mailtoLink(FULL, 'en').startsWith(`mailto:${encodeURIComponent(FULL.email)}?`));
});

test('emailSubject names the workspace, and degrades when it has none', () => {
  assert.ok(emailSubject(FULL, 'en').includes('Acme Studio'));
  assert.equal(typeof emailSubject({ ...FULL, workspace: '' }, 'en'), 'string');
  assert.ok(emailSubject({ ...FULL, workspace: '' }, 'en').length > 0);
});

test('credentialsFilename is filesystem-safe for any workspace name', () => {
  assert.equal(credentialsFilename(FULL), 'acme-studio-credentials.txt');
  assert.equal(credentialsFilename({ workspace: 'استوديو' }), 'workspace-credentials.txt');
  assert.equal(credentialsFilename({ workspace: '  //A B//  ' }), 'a-b-credentials.txt');
  assert.equal(credentialsFilename({}), 'workspace-credentials.txt');
  assert.match(credentialsFilename({ workspace: 'x'.repeat(200) }), /^x{40}-credentials\.txt$/);
});

test('workspaceLabel falls back to the slug when a workspace has no name', () => {
  assert.equal(workspaceLabel({ name: 'Acme', slug: 'acme' }), 'Acme');
  assert.equal(workspaceLabel({ name: '', slug: 'acme' }), 'acme');
  assert.equal(workspaceLabel({ slug: 'acme' }), 'acme');
  assert.equal(workspaceLabel(null), '');
});

test('an empty credential set produces empty output, not the word undefined', () => {
  for (const out of [credentialsText({}, 'en'), whatsappMessage({}, 'en'), credentialsText({}, 'ar')]) {
    assert.ok(!/undefined|null|NaN/.test(out), `leaked placeholder in:\n${out}`);
  }
});
