// Tests for lib/brand-icons.js — brand colour resolution for social glyphs.
// Zero dependencies — run with: npm test
//
// The colours are rendered on the PUBLIC portfolio card (a dark surface) and in
// the admin's icon picker. The property that matters is that no glyph ever ends
// up invisible: a near-black brand on a dark card, or a pale one on white, must
// resolve to its per-surface override instead of its official colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAND_ICONS, BRAND_KEYS, brandColor, normalizeIcon } from '../lib/brand-icons.js';
import { contrastRatio } from '../lib/contrast.js';

// The two surfaces a glyph is actually painted on today.
const DARK_SURFACE = '#141d38';  // admin .dashboard.dark --bg-elevated
const LIGHT_SURFACE = '#ffffff'; // admin light theme --bg-primary

test('every brand colour is a parseable hex', () => {
  for (const key of BRAND_KEYS) {
    for (const field of ['color', 'colorOnDark', 'colorOnLight']) {
      const v = BRAND_ICONS[key][field];
      if (v === undefined) continue;
      assert.match(v, /^#[0-9a-f]{6}$/i, `${key}.${field} is not a 6-digit hex: ${v}`);
    }
  }
});

// BrandGlyph picks its render mode off `stroke`. An entry that declares neither
// shape, or declares the wrong one for its mode, renders as an empty box —
// silently, since a missing <path> throws nothing.
test('every entry carries exactly the geometry its render mode needs', () => {
  for (const key of BRAND_KEYS) {
    const ic = BRAND_ICONS[key];
    if (ic.stroke) {
      assert.ok(Array.isArray(ic.paths) && ic.paths.length > 0, `${key} is stroke but has no paths[]`);
      ic.paths.forEach((d, i) => {
        assert.equal(typeof d, 'string', `${key}.paths[${i}] is not a string`);
        assert.match(d, /^M/, `${key}.paths[${i}] does not start with a moveto`);
      });
      assert.equal(ic.path, undefined, `${key} is stroke but also carries a fill path`);
    } else {
      assert.equal(typeof ic.path, 'string', `${key} has no fill path`);
      assert.match(ic.path, /^M/, `${key}.path does not start with a moveto`);
      assert.equal(ic.paths, undefined, `${key} is fill but also carries stroke paths`);
    }
  }
});

// Stroke glyphs are the generic actions; brand marks stay solid silhouettes.
test('only colourless generic actions are drawn as strokes', () => {
  for (const key of BRAND_KEYS) {
    if (!BRAND_ICONS[key].stroke) continue;
    assert.equal(brandColor(key), null, `${key} is a stroke glyph but carries a brand colour`);
  }
});

test('generic actions stay colourless so callers keep their neutral styling', () => {
  assert.equal(brandColor('email'), null);
  assert.equal(brandColor('website'), null);
  assert.equal(brandColor('email', 'light'), null);
});

test('an unknown or empty icon resolves to null, never to a colour', () => {
  assert.equal(brandColor('not-a-brand'), null);
  assert.equal(brandColor(null), null);
  assert.equal(brandColor(undefined), null);
  assert.equal(brandColor(''), null);
});

test('near-black brands flip to a light glyph on a dark surface', () => {
  for (const key of ['x', 'github', 'tiktok', 'threads', 'medium']) {
    assert.equal(brandColor(key, 'dark'), '#ffffff', `${key} should invert on dark`);
    // on a light surface the official (near-black) colour is the right one
    assert.equal(brandColor(key, 'light'), BRAND_ICONS[key].color, `${key} keeps its brand colour on light`);
  }
});

test('pale brands darken on a light surface', () => {
  assert.equal(brandColor('snapchat', 'dark'), '#FFFC00');
  assert.equal(brandColor('snapchat', 'light'), '#8a7f00');
});

test('flat-coloured brands use their official colour on both surfaces', () => {
  assert.equal(brandColor('whatsapp', 'dark'), '#25D366');
  assert.equal(brandColor('whatsapp', 'light'), '#25D366');
  assert.equal(brandColor('youtube'), '#FF0000');
  assert.equal(brandColor('linkedin'), '#0A66C2');
});

test('dark defaults when no surface is given', () => {
  assert.equal(brandColor('github'), brandColor('github', 'dark'));
});

// The point of the whole feature: a recognisable glyph. A brand colour that
// disappears into the card is worse than the grey it replaced.
test('no resolved glyph colour vanishes into its surface', () => {
  const MIN_RATIO = 1.6; // small decorative glyph, not body text
  for (const key of BRAND_KEYS) {
    for (const [surface, bg] of [['dark', DARK_SURFACE], ['light', LIGHT_SURFACE]]) {
      const c = brandColor(key, surface);
      if (!c) continue; // colourless by design — rendered as currentColor
      const ratio = contrastRatio(c, bg);
      assert.ok(
        ratio >= MIN_RATIO,
        `${key} on ${surface} (${c} vs ${bg}) is only ${ratio.toFixed(2)}:1`,
      );
    }
  }
});

// Every entry carries a flat colour or none — nothing renders a gradient, so
// both surfaces that draw these glyphs paint them identically.
test('brand entries expose only flat colours', () => {
  for (const key of BRAND_KEYS) {
    const c = brandColor(key);
    assert.ok(c === null || /^#[0-9a-f]{6}$/i.test(c), `${key} resolved to a non-flat colour: ${c}`);
  }
});

test('colour lookup goes through the same legacy-emoji normalisation as icons', () => {
  assert.equal(normalizeIcon('📷'), 'instagram');
  assert.equal(brandColor('📷'), brandColor('instagram'));
  assert.equal(brandColor('💬'), '#25D366'); // legacy WhatsApp emoji
});
