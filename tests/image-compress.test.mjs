// Regression tests for the pure parts of lib/image-compress.js.
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// compressImage() itself needs canvas + createImageBitmap and cannot run here;
// it is written to return the ORIGINAL file on any failure, which is what makes
// that acceptable. What IS tested is every decision it delegates: the scaling
// maths, which formats are passed through untouched, and the extension handling
// that determines the storage path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitWithin,
  shouldSkipCompression,
  replaceExtension,
  fileExtension,
  compressImage,
  MAX_IMAGE_DIMENSION,
  MAX_AVATAR_DIMENSION,
} from '../lib/image-compress.js';

test('a landscape photo scales by its longest edge', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
});

test('a portrait photo scales by its longest edge too', () => {
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
});

test('an image already within bounds is never scaled UP', () => {
  assert.deepEqual(fitWithin(400, 300, 1600), { width: 400, height: 300 });
});

test('exactly at the limit is left alone', () => {
  assert.deepEqual(fitWithin(1600, 1600, 1600), { width: 1600, height: 1600 });
});

test('an extreme panorama keeps at least one pixel of height', () => {
  const r = fitWithin(20000, 10, 1600);
  assert.equal(r.width, 1600);
  assert.ok(r.height >= 1, 'height must not round down to zero');
});

test('zero and garbage dimensions return zeroes rather than NaN', () => {
  assert.deepEqual(fitWithin(0, 0, 1600), { width: 0, height: 0 });
  assert.deepEqual(fitWithin(undefined, undefined, 1600), { width: 0, height: 0 });
  assert.deepEqual(fitWithin('abc', 'def', 1600), { width: 0, height: 0 });
});

test('avatars use a smaller ceiling than photos', () => {
  assert.ok(MAX_AVATAR_DIMENSION < MAX_IMAGE_DIMENSION);
  assert.deepEqual(fitWithin(2000, 2000, MAX_AVATAR_DIMENSION), { width: 800, height: 800 });
});

test('SVG is passed through — rasterising a vector makes it worse', () => {
  assert.equal(shouldSkipCompression({ type: 'image/svg+xml', name: 'logo.svg' }), true);
});

test('GIF is passed through — canvas would drop the animation', () => {
  assert.equal(shouldSkipCompression({ type: 'image/gif', name: 'loop.gif' }), true);
});

test('PNG and JPEG are compressed', () => {
  assert.equal(shouldSkipCompression({ type: 'image/png', name: 'a.png' }), false);
  assert.equal(shouldSkipCompression({ type: 'image/jpeg', name: 'a.jpg' }), false);
});

test('a typeless or missing file is skipped, never crashed on', () => {
  assert.equal(shouldSkipCompression(null), true);
  assert.equal(shouldSkipCompression({}), true);
  assert.equal(shouldSkipCompression({ name: 'no-type.png' }), true);
});

test('replaceExtension swaps the final extension only', () => {
  assert.equal(replaceExtension('photo.png', 'webp'), 'photo.webp');
  assert.equal(replaceExtension('my.holiday.photo.jpeg', 'webp'), 'my.holiday.photo.webp');
  assert.equal(replaceExtension('noextension', 'webp'), 'noextension.webp');
});

test('replaceExtension survives an empty or missing name', () => {
  assert.equal(replaceExtension('', 'webp'), 'image.webp');
  assert.equal(replaceExtension(undefined, 'webp'), 'image.webp');
  assert.equal(replaceExtension('.png', 'webp'), 'image.webp');
});

test('fileExtension prefers the MIME type over the filename', () => {
  // The name is stale after a re-encode; the type is what we actually produced.
  assert.equal(fileExtension({ type: 'image/webp', name: 'old.png' }), 'webp');
});

test('fileExtension normalises jpeg to jpg and strips +xml', () => {
  assert.equal(fileExtension({ type: 'image/jpeg', name: 'a.jpeg' }), 'jpg');
  assert.equal(fileExtension({ type: 'image/svg+xml', name: 'a.svg' }), 'svg');
});

test('fileExtension falls back to the filename when there is no type', () => {
  assert.equal(fileExtension({ name: 'photo.PNG' }), 'png');
  assert.equal(fileExtension({ name: 'nodots' }), 'bin');
});

test('compressImage returns the original when there is no canvas (as in Node)', async () => {
  // The safety property the whole design rests on: never block an upload.
  const file = { type: 'image/png', name: 'a.png', size: 1234 };
  assert.equal(await compressImage(file), file);
});
