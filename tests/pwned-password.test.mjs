import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha1Hex, parseRange, isPwnedPassword } from '../lib/pwned-password.js';

// SHA-1("password") — the canonical example, and the one whose prefix/suffix split
// the k-anonymity scheme is built around.
const PW = 'password';
const PW_HASH = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8';
const PW_PREFIX = '5BAA6';
const PW_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

function fakeFetch(body, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok, status, text: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test('sha1Hex matches the known digest, uppercase hex', async () => {
  assert.equal(await sha1Hex(PW), PW_HASH);
});

test('a breached password is reported with its count', async () => {
  const f = fakeFetch(`${PW_SUFFIX}:12345\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:7`);
  const r = await isPwnedPassword(PW, { fetchImpl: f });
  assert.deepEqual(r, { pwned: true, count: 12345, checked: true });
});

test('ONLY the 5-char prefix is sent — never the password or the full hash', async () => {
  const f = fakeFetch(`${PW_SUFFIX}:1`);
  await isPwnedPassword(PW, { fetchImpl: f });
  const { url } = f.calls[0];
  assert.equal(url, `https://api.pwnedpasswords.com/range/${PW_PREFIX}`);
  // Assert against the part AFTER /range/, not the whole URL: the host
  // "pwnedpasswords.com" literally contains the substring "password", so a naive
  // url.includes(PW) check passes/fails for the wrong reason.
  const sent = url.split('/range/')[1];
  assert.equal(sent, PW_PREFIX, 'exactly the 5-char prefix, nothing more');
  assert.ok(!sent.includes(PW), 'the password must never appear in the request');
  assert.ok(!sent.includes(PW_SUFFIX), 'the hash suffix must never be sent');
  assert.ok(!sent.includes(PW_HASH), 'the full hash must never be sent');
});

test('a password absent from the range is not pwned', async () => {
  const f = fakeFetch('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:9\nABCDEF0123456789ABCDEF0123456789ABC:2');
  const r = await isPwnedPassword(PW, { fetchImpl: f });
  assert.deepEqual(r, { pwned: false, count: 0, checked: true });
});

test('padding decoys (count 0) are treated as not found', async () => {
  // The Add-Padding response includes fake entries with a zero count; honouring
  // them would defeat the padding and report a clean password as breached.
  const f = fakeFetch(`${PW_SUFFIX}:0`);
  const r = await isPwnedPassword(PW, { fetchImpl: f });
  assert.equal(r.pwned, false);
  assert.equal(r.checked, true);
});

// FAIL OPEN. Every one of these must allow the password: blocking on an
// unreachable third party would lock a user out mid-reset, with no other way in.
test('a network failure fails OPEN and reports checked:false', async () => {
  const boom = async () => { throw new Error('offline'); };
  assert.deepEqual(await isPwnedPassword(PW, { fetchImpl: boom }), { pwned: false, count: 0, checked: false });
});

test('a non-200 response fails OPEN', async () => {
  const f = fakeFetch('nope', { ok: false, status: 503 });
  assert.deepEqual(await isPwnedPassword(PW, { fetchImpl: f }), { pwned: false, count: 0, checked: false });
});

test('a timeout fails OPEN', async () => {
  const hang = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const r = await isPwnedPassword(PW, { fetchImpl: hang, timeoutMs: 20 });
  assert.deepEqual(r, { pwned: false, count: 0, checked: false });
});

test('an empty password is not checked at all', async () => {
  const f = fakeFetch(`${PW_SUFFIX}:1`);
  const r = await isPwnedPassword('', { fetchImpl: f });
  assert.deepEqual(r, { pwned: false, count: 0, checked: false });
  assert.equal(f.calls.length, 0, 'must not call the API for an empty password');
});

test('parseRange is case-insensitive and tolerates blank lines', () => {
  assert.deepEqual(parseRange(`\n${PW_SUFFIX.toLowerCase()}:5\n`, PW_SUFFIX), { pwned: true, count: 5 });
});

test('parseRange ignores malformed lines rather than throwing', () => {
  assert.deepEqual(parseRange('garbage\n\n:::\n', PW_SUFFIX), { pwned: false, count: 0 });
});
