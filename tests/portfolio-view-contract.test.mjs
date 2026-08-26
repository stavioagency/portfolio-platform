// The adapter contract, and the shape of a real portfolio document.
//
//     snapshot document → lib/portfolio-view.js → renderer props → components
//
// Frozen in docs/architecture/renderer-contracts.md. These tests exist BEFORE
// the adapter does, deliberately: the contract is what P2 builds against, and a
// contract with no test is a suggestion.
//
// The adapter's own purity tests SKIP while lib/portfolio-view.js is absent and
// arm themselves the moment it appears, so `npm test` stays green through P1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = join(ROOT, 'lib/portfolio-view.js');
const DOC = JSON.parse(
  readFileSync(join(ROOT, 'tests/fixtures/f9designer.doc.json'), 'utf8'),
);

const bilingual = (v, where) => {
  assert.equal(typeof v, 'object', `${where} must be a bilingual object`);
  assert.equal(typeof v.ar, 'string', `${where}.ar must be a string`);
  assert.equal(typeof v.en, 'string', `${where}.en must be a string`);
};

// ── The document shape ──────────────────────────────────────────────────
// A rename now fails a test; a rename after the first snapshot exists is a data
// migration. That asymmetry is the whole reason this is frozen at P1.

test('the document carries every key the renderer and the host need', () => {
  for (const key of [
    'v', 'lang', 'name', 'title', 'bio', 'shortLine', 'mark',
    'appearance', 'action', 'links', 'pieces', 'seo', 'favicon', 'footer',
  ]) {
    assert.ok(key in DOC, `the document is missing "${key}"`);
  }
  for (const [k, v] of Object.entries({
    name: DOC.name, title: DOC.title, bio: DOC.bio,
    shortLine: DOC.shortLine, footer: DOC.footer,
  })) bilingual(v, k);
});

test('mark and favicon are carried, or they die at P6', () => {
  // The host loses its draft read when profile stops being anon-readable. If
  // these are not in the document there is nowhere left to read them from.
  assert.ok(DOC.mark && typeof DOC.mark.path === 'string');
  assert.ok(DOC.favicon && typeof DOC.favicon.path === 'string');
});

test('the removed features are absent from the document', () => {
  // A snapshot that can express a ticker will eventually render one.
  for (const gone of [
    'banners', 'stats', 'cta_buttons', 'ctaButtons',
    'custom_fields', 'customFields', 'sections', 'top_ticker', 'topTicker',
  ]) {
    assert.ok(!(gone in DOC), `"${gone}" must not exist in a published document`);
  }
  assert.ok(!('og_image' in DOC.seo), 'the custom social-image field is removed');
});

test('draft-only state never reaches a published document', () => {
  for (const k of ['bioIsSuggestion', 'titleIsSuggestion', 'tenant_id', 'tenantId', 'slug']) {
    assert.ok(!(k in DOC), `"${k}" is draft or tenant state and must not be published`);
  }
});

// ── Media ───────────────────────────────────────────────────────────────

test('media carries paths, never URLs', () => {
  for (const piece of DOC.pieces) {
    assert.ok(Array.isArray(piece.media) && piece.media.length > 0,
      `piece ${piece.id} must have media — an imageless piece is excluded at promotion`);
    for (const m of piece.media) {
      assert.equal(typeof m.path, 'string');
      assert.ok(!/^https?:\/\//.test(m.path),
        `media path "${m.path}" is a URL — normalisation did not run`);
      assert.ok(!m.path.includes('..'), 'path traversal');
      bilingual(m.caption, `piece ${piece.id} caption`);
    }
  }
});

test('there is no separate cover field — media[0] IS the cover', () => {
  for (const piece of DOC.pieces) {
    assert.ok(!('cover' in piece), `piece ${piece.id} must not carry a cover field`);
    assert.ok(!('cover_image' in piece));
  }
});

test('w and h are optional — no source for them exists yet', () => {
  // storage.objects.metadata carries eTag/size/mimetype/cacheControl/
  // lastModified/contentLength/httpStatusCode — no dimensions. Verified
  // 2026-08-21. See renderer-contracts.md §2.5.
  for (const piece of DOC.pieces) {
    for (const m of piece.media) {
      if ('w' in m) assert.equal(typeof m.w, 'number');
      if ('h' in m) assert.equal(typeof m.h, 'number');
    }
  }
});

test('piece ordering is array position, not a display_order field', () => {
  for (const piece of DOC.pieces) {
    assert.ok(!('display_order' in piece), 'ordering is position — curation, not a column');
    assert.equal(typeof piece.id, 'number', 'the id is URL-authoritative and must survive');
  }
});

// ── What the real tenant taught us ──────────────────────────────────────
// These assert the FINDINGS, so that a future change which quietly "fixes" the
// fixture also has to acknowledge the problem the fixture was recording.

test('the fixture keeps the real cover-is-a-separate-file case', () => {
  const multi = DOC.pieces.find((p) => p.media.length > 4);
  assert.ok(multi, 'the fixture must retain a piece whose cover + gallery exceed 4 items');
  assert.equal(multi.media.length, 5,
    'cover_image is prepended to images[] — it is a distinct file, not images[0]');
});

test('the fixture keeps the empty-link-label case', () => {
  // All four real links carry an icon and an href and NO label. A faithful
  // conversion renders four invisible links, which is why label derivation is
  // an adapter responsibility (renderer-contracts.md §1.4, §7.2 F1).
  assert.ok(DOC.links.length > 0);
  assert.ok(DOC.links.every((l) => l.label === ''),
    'the fixture records that real links have no labels');
  assert.ok(DOC.links.every((l) => typeof l.url === 'string' && l.url),
    'every link must still carry a destination');
});

test('unmapped values are marked, never guessed', () => {
  // The real appearance is a custom dark theme with no expression in the new
  // model. The fixture says so rather than inventing a nearest accent.
  assert.equal(DOC.appearance.accent, 'UNMAPPED');
  assert.equal(DOC.action.destination, 'UNDECIDED');
});

// ── The adapter itself ──────────────────────────────────────────────────

const adapterExists = existsSync(ADAPTER);
const skip = adapterExists ? false : 'lib/portfolio-view.js does not exist yet (P2)';

test('the adapter is pure — no storage, database, routing or environment', { skip }, () => {
  const src = readFileSync(ADAPTER, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  for (const spec of [...src.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1])) {
    for (const bad of ['supabase', 'next/router', 'next/head', 'lib/tenant', 'react']) {
      assert.ok(!spec.includes(bad), `the adapter must not import "${spec}"`);
    }
  }
  for (const bad of ['process.env', 'fetch(', 'document.', 'localStorage', 'window.']) {
    assert.ok(!code.includes(bad),
      `the adapter must not use ${bad} — context arrives as an argument`);
  }
});

test('the adapter produces the closed prop set and resolves what the renderer cannot',
  { skip }, async () => {
    const { toPortfolio } = await import('../lib/portfolio-view.js');
    const props = toPortfolio(DOC, {
      origin: 'https://example.test',
      slug: 'example',
      mediaBase: 'https://example.test/media/',
    });

    assert.ok(!('seo' in props), 'seo is the host’s, never the renderer’s');
    assert.ok(!('favicon' in props), 'favicon is the host’s, never the renderer’s');

    for (const piece of props.pieces) {
      assert.equal(typeof piece.href, 'string', 'the host resolves piece hrefs');
      for (const m of piece.media) {
        assert.ok(!('path' in m), 'the renderer receives src, not path');
        assert.ok(m.src.startsWith('https://'), 'path became a URL in the adapter');
      }
    }
    assert.ok(props.links.every((l) => l.label), 'the adapter derives a label when none is written');
  });
