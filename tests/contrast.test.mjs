// Tests for lib/contrast.js — the readable-foreground maths behind the public
// portfolio's solid primary CTA. Zero dependencies — run with: npm test
//
// The accent colour is chosen by each client from a colour picker, so the CTA's
// text colour cannot be a constant. These cases pin the two properties the UI
// actually depends on: a KNOWN-GOOD ink is picked for any hue, and an
// unparseable colour reports null rather than silently returning something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  readableInkOn,
  BLACK_INK,
  WHITE_INK,
} from '../lib/contrast.js';

// WCAG AA for large text (>=18.66px bold / >=24px) — the CTA label's tier.
const AA_LARGE = 3;

test('parses the colour formats the admin can produce', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor('#000000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseColor('#9FA7FF'), { r: 159, g: 167, b: 255 });
  // the <input type="color"> value, and the rgba() strings stored in appearance tokens
  assert.deepEqual(parseColor('rgb(12, 21, 48)'), { r: 12, g: 21, b: 48 });
  assert.deepEqual(parseColor('rgba(255, 255, 255, 0.45)'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor('  #ABC  '), { r: 170, g: 187, b: 204 });
});

test('returns null for anything it cannot read, rather than a wrong colour', () => {
  for (const bad of [null, undefined, 42, '', 'not-a-colour', '#gg0011', '#12345', 'var(--accent)']) {
    assert.equal(parseColor(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('relative luminance matches the WCAG anchors', () => {
  assert.equal(relativeLuminance(parseColor('#000000')), 0);
  assert.equal(relativeLuminance(parseColor('#ffffff')), 1);
  // green carries the most luminance weight of the three channels
  const g = relativeLuminance(parseColor('#00ff00'));
  const r = relativeLuminance(parseColor('#ff0000'));
  const b = relativeLuminance(parseColor('#0000ff'));
  assert.ok(g > r && r > b);
});

test('contrast ratio spans the full 1..21 range', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#123456', '#123456'), 1);
  assert.equal(contrastRatio('#ffffff', 'nonsense'), null);
});

test('picks dark ink on light accents and light ink on dark accents', () => {
  // bright accents a client might pick
  assert.equal(readableInkOn('#ffe600'), BLACK_INK); // yellow
  assert.equal(readableInkOn('#7dd37d'), BLACK_INK); // the "forest" preset accent
  assert.equal(readableInkOn('#ff9fb5'), BLACK_INK); // the "plum" preset accent
  assert.equal(readableInkOn('#9FA7FF'), BLACK_INK); // the default periwinkle accent

  // dark accents
  assert.equal(readableInkOn('#0b1020'), WHITE_INK);
  assert.equal(readableInkOn('#4f57d8'), WHITE_INK); // the light-theme accent
  assert.equal(readableInkOn('#c0392b'), WHITE_INK);
});

test('whichever ink it picks actually clears AA for button text', () => {
  // every preset accent, plus a spread of hues, must end up readable
  for (const accent of [
    '#9FA7FF', '#5b5fc7', '#7dd37d', '#ff9fb5', '#4f6ef2',
    '#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff',
  ]) {
    const ink = readableInkOn(accent);
    assert.ok(ink, `no ink chosen for ${accent}`);
    const ratio = contrastRatio(ink, accent);
    assert.ok(
      ratio >= AA_LARGE,
      `${ink} on ${accent} fails AA large (${ratio.toFixed(2)}:1)`,
    );
  }
});

test('an unreadable accent leaves the caller with its own default', () => {
  assert.equal(readableInkOn('var(--accent)'), null);
  assert.equal(readableInkOn(undefined), null);
});

test('contrast ratios match the known WCAG reference pairs', () => {
  // the canonical "smallest colour that passes AA on white" values
  assert.equal(contrastRatio('#595959', '#ffffff').toFixed(2), '7.00');
  assert.equal(contrastRatio('#767676', '#ffffff').toFixed(2), '4.54');
});
