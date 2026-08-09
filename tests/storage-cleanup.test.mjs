// A deleted workspace must not leave files behind.
//
// THE BUG THESE PIN
// -----------------
// The cleanup was one `list(prefix, { limit: 1000 })` and one `remove()`.
// Storage list calls are paged, so a workspace with more than a page of objects
// kept the remainder forever — and once the tenant row is deleted, nothing names
// the prefix any more, so those files can never be found to clean up by hand.
// The old code also discarded the list error, making an RLS refusal and an empty
// folder indistinguishable.
//
// Two halves, matching tests/workspace-deletion-billing.test.mjs: the paging is
// a function and is executed here against a fake bucket; the wiring in
// pages/admin.js is read as source, because Node cannot import a React page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deleteTenantStorage, PAGE_SIZE, MAX_PASSES } from '../lib/storage-cleanup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = readFileSync(join(ROOT, 'pages/admin.js'), 'utf8');

function deleteWorkspaceSource() {
  const start = ADMIN.indexOf('async function deleteWorkspace()');
  assert.notEqual(start, -1, 'deleteWorkspace must exist');
  const end = ADMIN.indexOf('\n  return (', start);
  assert.notEqual(end, -1, 'could not find the end of deleteWorkspace');
  return ADMIN.slice(start, end);
}

const TENANT = '7c741d4e-70e7-4d44-b26c-493ab68a5160';

/**
 * A bucket holding `count` files, which honours limit/offset and actually
 * removes what it is told to — so a test that pages wrongly loses files here
 * exactly as it would in production.
 */
function fakeBucket(count, { listErrOn = -1, rmErrOn = -1 } = {}) {
  let files = Array.from({ length: count }, (_, i) => ({ name: `f${i}.jpg` }));
  const calls = { list: 0, remove: 0, removedPaths: [] };
  return {
    calls,
    remaining: () => files.length,
    async list(prefix, { limit, offset } = {}) {
      if (calls.list === listErrOn) { calls.list++; return { data: null, error: new Error('rls_denied') }; }
      calls.list++;
      assert.equal(prefix, `t-${TENANT}`, 'must list the tenant prefix');
      return { data: files.slice(offset ?? 0, (offset ?? 0) + (limit ?? 100)), error: null };
    },
    async remove(paths) {
      if (calls.remove === rmErrOn) { calls.remove++; return { data: null, error: new Error('remove_denied') }; }
      calls.remove++;
      calls.removedPaths.push(...paths);
      const names = new Set(paths.map((p) => p.split('/').pop()));
      files = files.filter((f) => !names.has(f.name));
      return { data: paths, error: null };
    },
  };
}

// --- 1. THE BUG ITSELF --------------------------------------------------------

test('a workspace with more than one page of files is fully cleaned', async () => {
  // The regression. 2500 files is three pages plus a remainder; the old
  // single-call cleanup left 1500 of them stranded with no way to ever find
  // them again.
  const bucket = fakeBucket(2500);
  const { removed, error } = await deleteTenantStorage(bucket, TENANT);
  assert.equal(error, null);
  assert.equal(removed, 2500, 'every file must be removed, not just the first page');
  assert.equal(bucket.remaining(), 0, 'and the bucket must actually be empty');
});

test('it pages rather than asking for everything at once', async () => {
  // The storage API caps a page and returns fewer rows than asked for without
  // saying so, which is why one large limit cannot be trusted.
  const bucket = fakeBucket(250);
  await deleteTenantStorage(bucket, TENANT);
  assert.ok(bucket.calls.list >= 3, 'a 250-file folder takes several passes');
  assert.ok(PAGE_SIZE <= 1000, 'a page must stay within what the API will return');
});

test('every removed path is prefixed with the tenant folder', async () => {
  // A bare filename here would delete another workspace's file from the bucket
  // root — the isolation bug tenantStoragePath() exists to prevent, in reverse.
  const bucket = fakeBucket(3);
  await deleteTenantStorage(bucket, TENANT);
  for (const p of bucket.calls.removedPaths) {
    assert.ok(p.startsWith(`t-${TENANT}/`), `${p} must be scoped to the tenant`);
  }
});

// --- 2. FAILURES ARE REPORTED, NOT SWALLOWED ----------------------------------

test('a list error is returned rather than read as an empty folder', async () => {
  // The old code bound only `data`, so an RLS refusal looked exactly like
  // "nothing to delete" and the files stayed forever, silently.
  const bucket = fakeBucket(10, { listErrOn: 0 });
  const { removed, error } = await deleteTenantStorage(bucket, TENANT);
  assert.ok(error, 'the failure must reach the caller');
  assert.equal(removed, 0);
});

test('a remove error stops the loop instead of retrying forever', async () => {
  // Listing from offset 0 each pass is what makes the paging correct, and it is
  // also what would spin forever if a failing remove were retried: the same page
  // would be listed and refused a thousand times.
  const bucket = fakeBucket(500, { rmErrOn: 1 });
  const { error } = await deleteTenantStorage(bucket, TENANT);
  assert.ok(error, 'the refusal must be reported');
  assert.ok(bucket.calls.remove <= 2, 'and must not be retried');
});

test('it never throws — the workspace is already gone', async () => {
  // A storage failure must not surface as a failed delete: the tenant row is
  // deleted by the time this runs, so throwing would describe the wrong thing.
  const angry = {
    async list() { return { data: null, error: new Error('boom') }; },
    async remove() { return { data: null, error: null }; },
  };
  await assert.doesNotReject(() => deleteTenantStorage(angry, TENANT));
});

test('a missing bucket or tenant is a no-op, not a crash', async () => {
  assert.deepEqual(await deleteTenantStorage(null, TENANT), { removed: 0, passes: 0, error: null });
  assert.deepEqual(await deleteTenantStorage({}, null), { removed: 0, passes: 0, error: null });
});

test('an empty folder costs one list and no removes', async () => {
  const bucket = fakeBucket(0);
  const { removed, error } = await deleteTenantStorage(bucket, TENANT);
  assert.equal(removed, 0);
  assert.equal(error, null);
  assert.equal(bucket.calls.remove, 0, 'nothing to remove means no remove call');
});

test('a bucket that reports success without deleting cannot spin forever', async () => {
  // MAX_PASSES is the backstop. Without it this loop would never terminate.
  let listCalls = 0;
  const stuck = {
    async list() { listCalls++; return { data: [{ name: 'stuck.jpg' }], error: null }; },
    async remove() { return { data: [], error: null }; },
  };
  const { error } = await deleteTenantStorage(stuck, TENANT);
  assert.ok(error, 'giving up must be reported as a failure');
  assert.match(String(error.message), /storage_cleanup_incomplete/);
  assert.equal(listCalls, MAX_PASSES, 'and must be bounded');
});

// --- 3. THE WIRING ------------------------------------------------------------

test('deleteWorkspace uses the paged cleanup, and only after the tenant is gone', async () => {
  const src = deleteWorkspaceSource();
  assert.ok(/deleteTenantStorage\(/.test(src), 'the delete must use the paged helper');
  assert.ok(!/limit: 1000/.test(src), 'the single capped list must be gone');
  const del = src.indexOf("from('tenants').delete()");
  const storage = src.indexOf('deleteTenantStorage(');
  assert.ok(del < storage, 'storage is cleaned only once the row is really deleted');
});

test('a storage failure still does not fail the delete', async () => {
  // Deleting files for a workspace that then failed to delete is the expensive
  // mistake; orphaned files are the cheap one. The order and the try/catch both
  // encode that, and the release must still run afterwards.
  const src = deleteWorkspaceSource();
  const storage = src.indexOf('deleteTenantStorage(');
  const release = src.indexOf('releaseAccounts(stranded)');
  assert.ok(storage < release, 'the email release must still follow the storage cleanup');
  assert.ok(!/setWsErr\([^)]*storageErr/.test(src), 'a storage error must not be shown as a failed delete');
});
