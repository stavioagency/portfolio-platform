// Finding media nobody references any more.
//
// This module decides which of a customer's files get deleted. Almost every
// test below is about NOT deleting something: an upload still in flight, a file
// whose age is unknown, a referenced image behind a cache-busting query string,
// and — the one that matters most — every file in the bucket, when the path
// parsing has broken and made the whole thing look like garbage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SWEEP_GRACE_MS, pathFromPublicUrl, referencedPaths,
  findOrphans, sweepAllowed, reclaimable,
} from '../lib/storage-sweep.js';

const BASE = 'https://gphrzvjlstznhypcfgre.supabase.co/storage/v1/object/public/media/';
const url = (p) => BASE + p;
const NOW = Date.parse('2026-09-13T12:00:00Z');
const old = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

// ── reading a path back out of a stored URL ──────────────────────────────

test('a stored public URL yields the path it points at', () => {
  assert.equal(pathFromPublicUrl(url('t-abc/cover-1.webp')), 't-abc/cover-1.webp');
});

test('a cache-busting query or fragment is not part of the path', () => {
  // Getting this wrong makes a REFERENCED file look unreferenced, which is how
  // a live image gets deleted.
  assert.equal(pathFromPublicUrl(url('t-abc/cover-1.webp?v=2')), 't-abc/cover-1.webp');
  assert.equal(pathFromPublicUrl(url('t-abc/cover-1.webp#x')), 't-abc/cover-1.webp');
});

test('a percent-encoded name is decoded to the stored path', () => {
  assert.equal(pathFromPublicUrl(url('t-abc/my%20cover.webp')), 't-abc/my cover.webp');
});

test('anything unrecognised is null, never a guess', () => {
  // A guess becomes a path matching no object, which makes a real file look
  // unreferenced.
  for (const bad of [null, undefined, '', 42, {}, 'not a url',
    'https://example.com/image.png',
    'https://x.supabase.co/storage/v1/object/public/other-bucket/t-abc/a.webp']) {
    assert.equal(pathFromPublicUrl(bad), null, `${String(bad)} should not parse`);
  }
});

// ── what is referenced ───────────────────────────────────────────────────

test('a profile picture, a cover and every gallery image are referenced', () => {
  const refs = referencedPaths({
    profiles: [{ profile_image: url('t-a/profile-1.webp'), name: 'Alice' }],
    projects: [{
      cover_image: url('t-a/cover-1.webp'),
      images: [url('t-a/g1.webp'), url('t-a/g2.webp')],
    }],
  });
  assert.deepEqual([...refs].sort(),
    ['t-a/cover-1.webp', 't-a/g1.webp', 't-a/g2.webp', 't-a/profile-1.webp']);
});

test('an image in a column nobody told this module about still counts', () => {
  // Read defensively: a column added later that holds an image must not
  // silently become unreferenced and therefore deletable.
  const refs = referencedPaths({
    profiles: [{ some_future_banner: url('t-a/banner.webp') }],
    projects: [],
  });
  assert.ok(refs.has('t-a/banner.webp'));
});

test('rubbish rows do not throw and do not reference anything', () => {
  const refs = referencedPaths({ profiles: [null, undefined], projects: [null, {}] });
  assert.equal(refs.size, 0);
  assert.equal(referencedPaths(undefined).size, 0);
});

// ── which objects are garbage ────────────────────────────────────────────

const objects = [
  { name: 'cover-1.webp', created_at: old(72), metadata: { size: 1000 } },
  { name: 'stale-1.webp', created_at: old(72), metadata: { size: 2000 } },
  { name: 'justnow.webp', created_at: old(0.01), metadata: { size: 3000 } },
];

test('a referenced file is never garbage', () => {
  const refs = referencedPaths({ projects: [{ cover_image: url('t-a/cover-1.webp') }] });
  const orphans = findOrphans(objects, refs, { prefix: 't-a', now: NOW });
  assert.ok(!orphans.some((o) => o.name === 'cover-1.webp'));
});

test('AN UPLOAD STILL IN FLIGHT IS NOT GARBAGE', () => {
  // uploadImage() puts the file in storage BEFORE the row that points at it is
  // saved. A file seconds old and unreferenced is a customer mid-edit, and
  // sweeping it deletes a picture out from under someone still typing.
  const orphans = findOrphans(objects, new Set(), { prefix: 't-a', now: NOW });
  assert.ok(!orphans.some((o) => o.name === 'justnow.webp'), 'a fresh upload must survive');
  assert.ok(orphans.some((o) => o.name === 'stale-1.webp'), 'a three-day-old orphan is garbage');
});

test('the grace period is a full day and is respected exactly', () => {
  assert.equal(SWEEP_GRACE_MS, 24 * 60 * 60 * 1000);
  const justInside = [{ name: 'x.webp', created_at: new Date(NOW - SWEEP_GRACE_MS + 1000).toISOString() }];
  const justOutside = [{ name: 'x.webp', created_at: new Date(NOW - SWEEP_GRACE_MS - 1000).toISOString() }];
  assert.equal(findOrphans(justInside, new Set(), { now: NOW }).length, 0);
  assert.equal(findOrphans(justOutside, new Set(), { now: NOW }).length, 1);
});

test('an unknown age is treated as too young, not too old', () => {
  // An unknown age is not evidence that a file is safe to delete.
  const weird = [
    { name: 'a.webp' },
    { name: 'b.webp', created_at: null },
    { name: 'c.webp', created_at: 'not a date' },
  ];
  assert.deepEqual(findOrphans(weird, new Set(), { now: NOW }), []);
});

test('paths are built from the prefix the objects were listed under', () => {
  const orphans = findOrphans([{ name: 'x.webp', created_at: old(72) }], new Set(), { prefix: 't-a', now: NOW });
  assert.equal(orphans[0].path, 't-a/x.webp');
});

// ── the refusal ──────────────────────────────────────────────────────────

test('A SWEEP THAT PARSED NO REFERENCES REFUSES TO RUN', () => {
  // The catastrophic case. If URL parsing breaks, nothing is referenced and
  // every file looks like garbage — a sweep would delete every image every
  // customer has. Rows that should have produced references but produced none
  // is a broken sweep, not a very successful one.
  const verdict = sweepAllowed({
    referenced: new Set(),
    rowsWithImages: 12,
    orphans: [{ path: 't-a/x.webp' }],
    objects: [{ name: 'x.webp' }],
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'no-references-parsed');
});

test('a genuinely empty workspace is allowed to sweep', () => {
  // No rows carrying images means no references is the truth, not a bug.
  const verdict = sweepAllowed({
    referenced: new Set(),
    rowsWithImages: 0,
    orphans: [],
    objects: [],
  });
  assert.equal(verdict.ok, true);
});

test('a normal sweep proceeds', () => {
  const verdict = sweepAllowed({
    referenced: new Set(['t-a/cover-1.webp']),
    rowsWithImages: 1,
    orphans: [{ path: 't-a/stale-1.webp' }],
    objects: [{ name: 'cover-1.webp' }, { name: 'stale-1.webp' }],
  });
  assert.equal(verdict.ok, true);
});

// ── what it would reclaim ────────────────────────────────────────────────

test('reclaimable bytes tolerate unknown sizes', () => {
  assert.equal(reclaimable([{ size: 1000 }, { size: null }, { size: 2000 }]), 3000);
  assert.equal(reclaimable([]), 0);
  assert.equal(reclaimable(null), 0);
});
