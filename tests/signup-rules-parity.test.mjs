// The reserved-slug list exists twice: lib/reserved-slugs.js for the browser,
// supabase/functions/_shared/signup-rules.ts for the server. Two runtimes, no
// shared module path — the same constraint that makes billing-plans-sync take
// its plan list as a POST body.
//
// Duplication of a SECURITY list is a drift risk, so this compares them as
// text. The server copy is the one that decides; if the browser copy gains an
// entry the server does not have, a user is refused after pressing the button.
// If the SERVER copy is missing one, a customer can claim a route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESERVED_SLUGS } from '../lib/reserved-slugs.js';

const serverSource = readFileSync(
  new URL('../supabase/functions/_shared/signup-rules.ts', import.meta.url), 'utf8');

function serverReservedList() {
  const block = serverSource.match(/const RESERVED_SLUGS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(block, 'could not find RESERVED_SLUGS in signup-rules.ts');
  return new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

test('the browser and server reserved-slug lists have not drifted', () => {
  const server = serverReservedList();
  const missingOnServer = [...RESERVED_SLUGS].filter((s) => !server.has(s));
  const missingInBrowser = [...server].filter((s) => !RESERVED_SLUGS.has(s));
  assert.deepEqual(missingOnServer, [],
    'reserved in the browser but NOT on the server — a customer could claim these');
  assert.deepEqual(missingInBrowser, [],
    'reserved on the server but not in the browser — the user is refused after submitting');
});

test('the server copy keeps the same bounds and shape rule', () => {
  assert.match(serverSource, /SLUG_MIN = 3/);
  assert.match(serverSource, /SLUG_MAX = 40/);
  assert.match(serverSource, /PASSWORD_MAX_BYTES = 72/,
    'the bcrypt byte cap must be enforced server-side too');
});
