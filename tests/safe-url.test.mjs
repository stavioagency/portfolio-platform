// Regression tests for lib/safe-url.js — the XSS guard on public portfolio links.
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// Links are entered by tenant admins and rendered to public visitors. A single
// javascript: link that slips through is stored XSS against every visitor of
// that tenant's site, so these cases are load-bearing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl } from '../lib/safe-url.js';

test('blocks the dangerous schemes', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://x/y',
  ]) {
    assert.equal(safeUrl(bad), '', `should block: ${JSON.stringify(bad)}`);
  }
});

test('allows the navigational schemes', () => {
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeUrl('http://example.com'), 'http://example.com');
  assert.equal(safeUrl('mailto:me@example.com'), 'mailto:me@example.com');
  assert.equal(safeUrl('tel:+966500000000'), 'tel:+966500000000');
});

test('assumes https for a bare host', () => {
  assert.equal(safeUrl('example.com'), 'https://example.com');
  assert.equal(safeUrl('wa.me/966500000000'), 'https://wa.me/966500000000');
});

test('leaves same-origin relative paths and hashes untouched', () => {
  assert.equal(safeUrl('/projects'), '/projects');
  assert.equal(safeUrl('#section'), '#section');
  assert.equal(safeUrl('./page'), './page');
});

test('empty / nullish input returns empty string', () => {
  for (const x of ['', '   ', null, undefined]) {
    assert.equal(safeUrl(x), '');
  }
});

test('unparseable garbage returns empty string, never throws', () => {
  assert.equal(safeUrl('ht!tp://['), '');
  assert.doesNotThrow(() => safeUrl('::::'));
});
