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

// ---------------------------------------------------------------------------
// THE TOKEN RAMP — every pair the interface actually paints, in both themes.
//
// Everything above tests the maths on a colour the CLIENT picks. This block
// tests the colours WE pick, which nothing was checking: the token layer was
// hand-derived, its comments quote ratios ("white on the fill: 5.13:1", "white
// would be 3.4:1"), and until now nothing re-computed them. A comment claiming
// a ratio is not a measurement — it is a claim that was true when it was
// typed.
//
// This is what makes "premium" a build failure rather than a matter of taste.
// It is also why the token layer is written as literal hex instead of
// color-mix(): lib/contrast.js reads hex and rgb(), and a token nothing can
// parse is a token nothing can check.
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

// Pull one theme block's custom properties. `:root` is the dark theme,
// [data-admin-theme='light'] is the light one — the two the product ships.
function tokensIn(selector) {
  const start = CSS.indexOf(selector + ' {');
  assert.ok(start >= 0, `no ${selector} block in globals.css`);
  const body = CSS.slice(start, CSS.indexOf('\n}', start));
  const out = {};
  for (const m of body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)) out[m[1]] = m[2].trim();
  return out;
}

const DARK = tokensIn(':root');
const LIGHT = tokensIn("[data-admin-theme='light']");

// A token may be a plain colour or an alias (`var(--brand)`); follow the chain
// to the literal at the end of it.
//
// The recursion was already unbounded, which was fine while every alias was
// one hop deep and pointed somewhere real. A semantic alias layer makes both
// assumptions worth checking: `--a: var(--b); --b: var(--a);` is a stack
// overflow rather than a test failure, and neither the depth cap nor the cycle
// guard below relaxes anything — a chain that resolved before still resolves,
// to the same value.
//
// Lookup stays scoped to the ONE theme block, deliberately. Falling back to
// the dark block would let a light token silently inherit a dark value and
// still pass, which is the failure this file exists to catch.
const MAX_HOPS = 16;
function value(tokens, name, seen = []) {
  const raw = tokens[name];
  assert.ok(raw, `missing token ${name}`);
  const alias = raw.match(/^var\((--[a-z0-9-]+)\)$/);
  if (!alias) return raw;
  assert.equal(
    seen.includes(name),
    false,
    `var() cycle in the token layer: ${[...seen, name].join(' -> ')}`,
  );
  assert.ok(
    seen.length < MAX_HOPS,
    `var() chain deeper than ${MAX_HOPS} hops: ${[...seen, name].join(' -> ')}`,
  );
  return value(tokens, alias[1], [...seen, name]);
}

// Text tokens are rgba over the page, so the ratio has to be measured against
// what the eye receives, not against the un-composited colour. Ignoring the
// alpha would score --text-muted as pure white — a full pass on a token that
// is, in fact, the one most likely to fail.
function flatten(fg, bgHex) {
  const a = fg.match(/^rgba\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*\)$/);
  if (!a) return fg;
  const alpha = Number(a[4]);
  const bg = parseColor(bgHex);
  assert.ok(bg, `background ${bgHex} is not a flat colour`);
  const mix = (c, b) => Math.round(Number(c) * alpha + b * (1 - alpha));
  return `rgb(${mix(a[1], bg.r)}, ${mix(a[2], bg.g)}, ${mix(a[3], bg.b)})`;
}

const AA_TEXT = 4.5;   // body text
const AA_UI = 3;       // large text and interface fills

function ratio(tokens, fgName, bgName) {
  const bg = value(tokens, bgName);
  return contrastRatio(flatten(value(tokens, fgName), bg), bg);
}

for (const [theme, tokens] of [['dark', DARK], ['light', LIGHT]]) {
  test(`${theme}: the four text steps stay readable on every surface`, () => {
    // Four steps exist to express hierarchy. A step that is decorative-only is
    // a step the interface will use for a hint the user has to read anyway.
    for (const surface of ['--bg-primary', '--bg-secondary', '--bg-elevated', '--bg-hover']) {
      for (const step of ['--text-primary', '--text-secondary']) {
        const r = ratio(tokens, step, surface);
        assert.ok(r >= AA_TEXT, `${theme}: ${step} on ${surface} is ${r.toFixed(2)}:1`);
      }
      // The bottom two steps are asserted only where they hold. The dark theme
      // clears both — --text-tertiary carries hints the user has to read, so it
      // is held to full AA there, and --text-muted is the disabled/placeholder
      // tier at the UI threshold. The light theme clears neither, which is a
      // KNOWN GAP pinned in its own test below rather than relaxed away here.
      if (theme === 'dark') {
        const tertiary = ratio(tokens, '--text-tertiary', surface);
        assert.ok(tertiary >= AA_TEXT, `dark: --text-tertiary on ${surface} is ${tertiary.toFixed(2)}:1`);
        const muted = ratio(tokens, '--text-muted', surface);
        assert.ok(muted >= AA_UI, `dark: --text-muted on ${surface} is ${muted.toFixed(2)}:1`);
      }
    }
  });

  test(`${theme}: the four text steps are actually four distinct steps`, () => {
    // Both themes have shipped a block that set all four to one colour. That
    // is not a contrast failure — every step passes — so only this catches it.
    const seen = ['--text-primary', '--text-secondary', '--text-tertiary', '--text-muted']
      .map((s) => flatten(value(tokens, s), value(tokens, '--bg-primary')));
    assert.equal(new Set(seen).size, 4, `${theme}: the text ramp collapsed: ${seen.join(' ')}`);
  });

  test(`${theme}: brand ink clears AA on the brand fill`, () => {
    // The primary button. Its ink flips per theme — white on the light fill,
    // navy on the lightened dark one — because white on the dark theme's
    // --brand measures 3.4:1, which is why the flip exists at all.
    const r = ratio(tokens, '--brand-ink', '--brand');
    assert.ok(r >= AA_TEXT, `${theme}: --brand-ink on --brand is ${r.toFixed(2)}:1`);
  });

  test(`${theme}: the accent aliases still resolve to the brand`, () => {
    // --accent is what pages/admin.js paints with. If the alias breaks, the
    // product silently stops being brand-coloured while every test still
    // passes — which is exactly what a local --accent override once did.
    assert.equal(value(tokens, '--accent'), value(tokens, '--brand'));
    assert.equal(value(tokens, '--accent-fg'), value(tokens, '--brand-ink'));
  });

  test(`${theme}: every status ink is readable on its own chip`, () => {
    for (const state of ['success', 'warning', 'danger', 'neutral']) {
      const bg = value(tokens, '--bg-primary');
      // The chip's own tint sits on the page, so the ink is measured against
      // the composite, not against the tint in isolation.
      const chip = flatten(value(tokens, `--${state}-bg`), bg);
      const ink = value(tokens, `--${state}-ink`);
      const r = contrastRatio(ink, chip);
      assert.ok(r >= AA_TEXT, `${theme}: --${state}-ink on --${state}-bg is ${r.toFixed(2)}:1`);
    }
  });

  test(`${theme}: the status inks correct AWAY from the page, not toward it`, () => {
    // The ink is a correction on the fill, and the correction runs in opposite
    // directions per theme — lighter than the fill on dark, darker on light.
    // Getting the direction wrong still passes a contrast check against the
    // chip while making the label harder to read, not easier.
    const pageIsDark = relativeLuminance(parseColor(value(tokens, '--bg-primary'))) < 0.5;
    for (const state of ['success', 'warning', 'danger', 'neutral']) {
      const fill = relativeLuminance(parseColor(value(tokens, `--${state}`)));
      const ink = relativeLuminance(parseColor(value(tokens, `--${state}-ink`)));
      assert.equal(ink > fill, pageIsDark,
        `${theme}: --${state}-ink runs the wrong way against --${state}`);
    }
  });
}

test('the brand constant is the measured logo blue, in both themes', () => {
  // #2C6FE0 was the documented value and the logo disagreed; the asset is what
  // ships. This fails if the old value returns anywhere in the token layer.
  assert.equal(value(DARK, '--brand-base'), '#2A6BCE');
  assert.equal(value(LIGHT, '--brand'), '#2A6BCE', 'the light theme renders the constant directly');
  // Scan declarations, not prose: the comment beside --brand-base is what
  // forbids #2C6FE0, so it necessarily contains it.
  const declarations = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/#2C6FE0/i.test(declarations), false, '#2C6FE0 is back in the token layer');
});

// KNOWN GAP — the light theme's lower ramp.
//
// The dark theme clears every step. The light theme's bottom two do not, on
// any surface:
//
//              --bg-primary   --bg-hover (worst)
//   tertiary   3.44:1         3.23:1     needs 4.5, reached at alpha .62
//   muted      2.30:1         2.23:1     needs 3.0
//
// This is not a typo in a token, which is why it is not simply corrected here.
// The ramp is 1 / .72 / .50 / .36 in every theme; lifting light tertiary to
// .62 puts it within .10 of --text-secondary and collapses the very hierarchy
// the four steps exist to express, so fixing it means re-spacing the light
// ramp — a design decision that belongs to the redesign, not to the token
// foundation.
//
// Pinned here so it is a number in the suite rather than a sentence in a
// document, and so nobody makes it worse by accident.
for (const [step, floor] of [['--text-tertiary', 3.20], ['--text-muted', 2.20]]) {
  test(`KNOWN GAP: light ${step} misses AA, and may not drift further`, () => {
    for (const surface of ['--bg-primary', '--bg-secondary', '--bg-elevated', '--bg-hover']) {
      const r = ratio(LIGHT, step, surface);
      assert.ok(r >= floor, `light ${step} on ${surface} got worse: ${r.toFixed(2)}:1`);
    }
    const target = step === '--text-tertiary' ? AA_TEXT : AA_UI;
    assert.ok(ratio(LIGHT, step, '--bg-hover') < target,
      `light ${step} now clears its threshold — delete this pin and assert it above`);
  });
}

test('white on the brand constant is the 5.13:1 the comment claims', () => {
  assert.equal(contrastRatio('#ffffff', '#2A6BCE').toFixed(2), '5.13');
});
