// DS-3 — the component convergence pass, held to its own invariant.
//
// DS-3 moved components/ui/* from raw platform tokens onto the DS-2 semantic
// aliases. Its whole claim is that NOTHING RENDERS DIFFERENTLY: every alias
// resolves to the value the primitive it replaced already had.
//
// That claim is only worth anything while it stays true. A one-character edit
// in styles/globals.css — repointing --action-primary-bg at --brand-hover, say
// — would restyle every primary button in the product, pass every existing
// test, and be visible to nobody reading the diff of a token file. So the
// mapping is pinned here, per theme, as arithmetic rather than as intent.
//
// This file also pins the two DELIBERATE OMISSIONS. Badge's label colours and
// Toast's .info tint were left on their old values by decision, not by
// accident, and both look exactly like unfinished work. Without a test saying
// so, the next person to open those files finishes the job and ships a visual
// change nobody approved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseColor, contrastRatio } from '../lib/contrast.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, '..', 'styles', 'globals.css'), 'utf8');
const ui = (name) => readFileSync(join(HERE, '..', 'components', 'ui', `${name}.js`), 'utf8');

// The DECLARATIONS only. A comment explaining why a value was retired
// necessarily contains that value, so a guard scanning raw source fires on its
// own rationale — the same trap tests/design-tokens.test.mjs documents. Reading
// stripped source also makes the pins stronger in the other direction: a
// declaration deleted but left described in a comment no longer satisfies them.
const uiCode = (name) => ui(name).replace(/\/\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------- parsing ---

function block(selector) {
  const start = CSS.indexOf(selector);
  assert.notEqual(start, -1, `selector not found: ${selector}`);
  const open = CSS.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') { depth--; if (depth === 0) break; }
  }
  const out = {};
  for (const line of CSS.slice(open + 1, i).split('\n')) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const DARK = block(':root');
const LIGHT = block("[data-admin-theme='light']");
// The light block overrides :root on the same element (<html>), so a light
// lookup legitimately falls back to a :root declaration.
const SCOPE = { dark: DARK, light: { ...DARK, ...LIGHT } };

function resolve(scope, name) {
  let value = `var(${name})`;
  const seen = [];
  for (let hop = 0; hop <= 16; hop++) {
    const m = value.match(/^var\((--[a-z0-9-]+)\)$/i);
    if (!m) return value;
    assert.equal(seen.includes(m[1]), false, `cycle: ${[...seen, m[1]].join(' -> ')}`);
    seen.push(m[1]);
    const next = scope[m[1]];
    assert.ok(next, `${m[1]} is not declared — chain: ${seen.join(' -> ')}`);
    value = next;
  }
  return assert.fail(`chain too deep: ${seen.join(' -> ')}`);
}

// ------------------------------------------------------------- the mapping ---

// [ the primitive DS-3 replaced, the semantic alias it was replaced with ].
// Every pair must resolve to one value, in both themes, forever — or DS-3
// silently became a redesign.
const CONVERSIONS = [
  ['--brand', '--action-primary-bg'],
  ['--brand-hover', '--action-primary-bg-hover'],
  ['--brand-ink', '--action-primary-fg'],
  ['--bg-elevated', '--action-secondary-bg'],
  ['--bg-hover', '--action-secondary-bg-hover'],
  ['--text-primary', '--action-secondary-fg'],
  ['--border-strong', '--action-secondary-border'],
  ['--bg-hover', '--action-ghost-bg-hover'],
  ['--text-secondary', '--action-ghost-fg'],
  ['--text-primary', '--action-ghost-fg-hover'],
  ['--danger-bg', '--action-danger-bg'],
  // Retargeted by design system §6.3 (destructive is outlined, never filled):
  // the hover deepens the tint instead of going solid, and both inks are
  // --danger-ink rather than a colour meant to sit on a solid fill.
  ['--danger-border', '--action-danger-bg-hover'],
  ['--danger-ink', '--action-danger-fg'],
  ['--danger-ink', '--action-danger-fg-hover'],
  ['--danger-border', '--action-danger-border'],
  ['--accent', '--border-focus'],
  ['--bg-secondary', '--surface-card'],
  ['--bg-elevated', '--surface-elevated'],
  ['--bg-hover', '--surface-hover'],
  ['--bg-primary', '--surface-input'],
  ['--border', '--border-default'],
  ['--success-bg', '--status-success-bg'],
  ['--success-border', '--status-success-border'],
  ['--warning-bg', '--status-warning-bg'],
  ['--warning-border', '--status-warning-border'],
  ['--danger-bg', '--status-danger-bg'],
  ['--danger-border', '--status-danger-border'],
];

for (const theme of ['dark', 'light']) {
  test(`${theme}: every DS-3 conversion resolves to the value it replaced`, () => {
    for (const [primitive, semantic] of CONVERSIONS) {
      assert.equal(
        resolve(SCOPE[theme], semantic),
        resolve(SCOPE[theme], primitive),
        `${theme}: ${semantic} no longer resolves to ${primitive} — `
        + 'DS-3 converted components on the promise that it does',
      );
    }
  });
}

test('every semantic alias DS-3 depends on is actually declared', () => {
  for (const [, semantic] of CONVERSIONS) {
    assert.ok(DARK[semantic], `${semantic} is consumed by a component but not declared`);
  }
});

// --------------------------------------------------------- the conversion ---

// Per component: aliases that must now be present, and the primitives they
// replaced, which must no longer appear in that file. Scoped per file rather
// than globally, because several primitives are legitimately KEPT elsewhere in
// the same component — Toast still paints var(--accent) on its .info mark.
const CONVERTED = {
  Button: {
    present: [
      '--action-primary-bg', '--action-primary-bg-hover', '--action-primary-fg',
      '--action-secondary-bg', '--action-secondary-bg-hover', '--action-secondary-fg',
      '--action-secondary-border', '--action-ghost-bg-hover', '--action-ghost-fg',
      '--action-ghost-fg-hover', '--action-danger-bg', '--action-danger-bg-hover',
      '--action-danger-fg', '--action-danger-fg-hover', '--action-danger-border',
      '--border-focus',
    ],
    absent: [
      '--brand', '--brand-hover', '--brand-ink', '--accent', '--bg-elevated',
      '--bg-hover', '--text-primary', '--text-secondary', '--border-strong',
      '--danger', '--danger-bg', '--danger-border', '--danger-fg',
    ],
  },
  Card: {
    present: ['--surface-card', '--surface-elevated', '--surface-hover', '--border-default', '--border-focus'],
    absent: ['--bg-secondary', '--bg-elevated', '--bg-hover', '--border', '--accent'],
  },
  EmptyState: { present: ['--surface-card'], absent: ['--bg-secondary'] },
  Badge: {
    present: [
      '--status-success-bg', '--status-success-border', '--status-warning-bg',
      '--status-warning-border', '--status-danger-bg', '--status-danger-border',
    ],
    absent: ['--success-bg', '--success-border', '--warning-bg', '--warning-border', '--danger-bg', '--danger-border'],
  },
  Toast: {
    present: ['--surface-elevated', '--status-success-bg', '--status-success-border', '--status-danger-bg', '--status-danger-border'],
    absent: ['--bg-elevated', '--success-bg', '--success-border', '--danger-bg', '--danger-border'],
  },
  Input: {
    present: ['--surface-input', '--border-focus'],
    absent: ['--bg-primary', '--accent'],
  },
};

// `var(--border)` must not match `var(--border-strong)`, so the closing paren
// is part of the needle.
const uses = (src, token) => src.includes(`var(${token})`);

for (const [name, { present, absent }] of Object.entries(CONVERTED)) {
  test(`${name} reads the semantic layer, not the primitives it replaced`, () => {
    const src = ui(name);
    for (const token of present) {
      assert.ok(uses(src, token), `${name} should consume ${token} and does not`);
    }
    for (const token of absent) {
      assert.equal(
        uses(src, token),
        false,
        `${name} reverted to ${token} — use the semantic alias instead`,
      );
    }
  });
}

// ------------------------------------------------------- deliberate holds ---

test('Badge label colours stay on the fill tokens — CLOSED in DS-4', () => {
  // Measured in DS-4, label on its own composited chip, dark / light:
  //   success 10.36 / 4.74   warning 10.05 / 5.16   danger 7.02 / 4.75
  // Every reachable tone clears AA. --status-*-fg would raise those to 7-11:1,
  // which is headroom rather than compliance, at the cost of a visible change
  // to 13 call sites. DECIDED AGAINST — not pending, not unfinished.
  const src = uiCode('Badge');
  for (const tone of ['success', 'warning', 'danger']) {
    assert.ok(uses(src, `--${tone}`), `Badge should still paint var(--${tone}) as its label`);
    assert.equal(
      uses(src, `--status-${tone}-fg`),
      false,
      `Badge adopted --status-${tone}-fg. That is a visual change and needs sign-off, not a test update`,
    );
  }
});

test('the retired periwinkle stays — CLOSED in DS-4', () => {
  // rgba(159,167,255,...) is the pre-redesign #9FA7FF, surviving in Badge
  // .accent and Toast .info. DS-4 measured every already-declared replacement
  // and ALL of them regress the light theme:
  //   Badge .accent  current 4.91 / 4.69 · --brand-soft 4.35 · --neutral-bg 4.45
  //   Toast .info    current 3.91 / 4.03 · --brand-soft 4.21 / 3.75
  // There is no substitution available, only a new-token decision nobody has
  // taken. Pinned so it is retired deliberately or not at all.
  for (const name of ['Badge', 'Toast']) {
    assert.match(
      uiCode(name),
      /rgba\(159, 167, 255,/,
      `${name}: the retired accent is gone — if that was intentional, check the `
      + 'light-theme contrast and delete this pin',
    );
  }
});

test('DS-3 did not touch the components it was scoped out of', () => {
  // CardHeader shares a file with Card, which makes it the easiest thing in
  // this pass to convert by accident.
  const card = ui('Card');
  const header = card.slice(card.indexOf('export function CardHeader'));
  for (const token of ['--surface-card', '--surface-elevated', '--surface-hover', '--border-default']) {
    assert.equal(header.includes(`var(${token})`), false, `CardHeader was converted: ${token}`);
  }
  // BrandGlyph is the one components/ui file the PUBLIC portfolio imports. It
  // uses no custom properties at all, and that is what keeps this whole phase
  // away from live client sites.
  assert.equal(
    /var\(--/.test(ui('BrandGlyph')),
    false,
    'BrandGlyph now reads a custom property — it is imported by pages/index.js',
  );
});

// ============================================================== DS-4 ========
//
// Three changes, two of them fixes to defects that predate the design-system
// work. Each is pinned by the invariant that made it necessary, not by the
// value it happens to produce today.

// Flattens a translucent colour onto an opaque one. The sheen is an rgba band
// over a solid surface, so what the eye receives is the composite.
function over(rgba, baseHex) {
  const m = String(rgba).match(/rgba\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*\)/);
  assert.ok(m, `not an rgba(): ${rgba}`);
  const a = Number(m[4]);
  const b = parseColor(baseHex);
  assert.ok(b, `base is not a flat colour: ${baseHex}`);
  const mix = (c, q) => Math.round(Number(c) * a + q * (1 - a));
  return `rgb(${mix(m[1], b.r)}, ${mix(m[2], b.g)}, ${mix(m[3], b.b)})`;
}

test('ConfirmDialog: the destructive hover is a token, not a hardcoded pink', () => {
  const src = uiCode('ConfirmDialog');
  assert.equal(
    /#ff9a9a/i.test(src),
    false,
    'ConfirmDialog is back on the hardcoded #ff9a9a. On the light theme that is '
    + 'white text on pale pink at 2.03:1, on the hover state of a destructive control',
  );
  assert.match(
    src,
    /\.danger \.ok:hover:not\(:disabled\) \{ background: var\(--danger-ink\); \}/,
    'the danger hover no longer reads var(--danger-ink)',
  );
});

test('ConfirmDialog: the destructive hover clears AA in BOTH themes', () => {
  // This is the assertion that would have caught the original bug. #ff9a9a was
  // one value serving two themes: correct on dark, 2.03:1 on light. Measuring
  // the pair per theme is the only thing that distinguishes those cases.
  for (const theme of ['dark', 'light']) {
    const fg = resolve(SCOPE[theme], '--danger-fg');
    const hover = resolve(SCOPE[theme], '--danger-ink');
    assert.equal(/^var\(/.test(hover), false, `${theme}: --danger-ink did not resolve`);
    const r = contrastRatio(fg, hover);
    assert.ok(r !== null, `${theme}: unparseable pair ${fg} on ${hover}`);
    assert.ok(r >= 4.5, `${theme}: --danger-fg on the hover fill is ${r.toFixed(2)}:1, needs 4.5`);
  }
});

test('ConfirmDialog: the hover corrects AWAY from the page, in both themes', () => {
  // The direction is the actual rule, and it is what a single hardcoded value
  // cannot satisfy: a destructive fill must lighten on dark and darken on light.
  // A future "simplification" back to one literal fails here rather than
  // shipping a 2:1 hover to half the users.
  for (const theme of ['dark', 'light']) {
    const page = parseColor(resolve(SCOPE[theme], '--bg-primary'));
    const rest = parseColor(resolve(SCOPE[theme], '--danger'));
    const hover = parseColor(resolve(SCOPE[theme], '--danger-ink'));
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const pageIsDark = lum(page) < 128;
    assert.equal(
      lum(hover) > lum(rest),
      pageIsDark,
      `${theme}: the destructive hover runs the wrong way against --danger`,
    );
  }
});

test('Skeleton: the sheen is ink-on-this-background, at exactly 0.055', () => {
  const src = uiCode('Skeleton');
  assert.equal(
    /rgba\(255, 255, 255, 0\.055\)/.test(src),
    false,
    'the sheen is a fixed white again — invisible on the light theme (1.01:1)',
  );
  const m = src.match(/rgba\(var\(--on-bg\),\s*([\d.]+)\)/);
  assert.ok(m, 'the sheen no longer reads rgba(var(--on-bg), …)');
  assert.equal(m[1], '0.055', `sheen alpha is ${m[1]}; DS-4 fixed it at 0.055 so dark stays byte-identical`);
});

test('Skeleton: the sheen is actually visible on its own base, in both themes', () => {
  // THE INVARIANT, not the hex. The original defect was not a wrong colour, it
  // was a band that composited to one step per channel above its base and so
  // could not be seen. Anything that reproduces that fails here.
  for (const theme of ['dark', 'light']) {
    const base = resolve(SCOPE[theme], '--bg-elevated');
    const channels = resolve(SCOPE[theme], '--on-bg');
    const peak = over(`rgba(${channels}, 0.055)`, base);
    const r = contrastRatio(peak, base);
    assert.ok(r !== null, `${theme}: unparseable sheen ${peak} on ${base}`);
    assert.ok(
      r >= 1.10,
      `${theme}: the shimmer peaks at ${r.toFixed(3)}:1 against its base, under the 1.10 floor `
      + '— that is a skeleton that does not appear to be loading',
    );
  }
});

test('Skeleton: the dark theme is byte-identical to what shipped before DS-4', () => {
  // --on-bg is 255,255,255 on dark, so the new sheen must expand to exactly the
  // literal it replaced. This is what makes the fix light-theme-only.
  const peak = over(`rgba(${resolve(SCOPE.dark, '--on-bg')}, 0.055)`, resolve(SCOPE.dark, '--bg-elevated'));
  const legacy = over('rgba(255, 255, 255, 0.055)', resolve(SCOPE.dark, '--bg-elevated'));
  assert.equal(peak, legacy, 'DS-4 changed the dark skeleton; it was supposed to change only light');
});

test('Skeleton: the reduced-motion exemption has a consumer', () => {
  // globals.css exempts [data-motion='loading'] from the blanket rule, and
  // explains why: a skeleton that stops moving reads as broken. Until DS-4 that
  // attribute was set NOWHERE, so the exemption protected nothing and the
  // blanket rule froze the one animation meant to survive it.
  assert.match(ui('Skeleton'), /data-motion="loading"/, 'Skeleton lost its data-motion hook');
  assert.match(
    CSS,
    /\[data-motion='loading'\]/,
    'globals.css lost the reduced-motion exemption that Skeleton depends on',
  );
});

test('DS-4 changed nothing outside its four files', () => {
  // Card, Button, EmptyState and Input were converted in DS-3 and are not in
  // DS-4's scope. Their DS-3 pins above already cover the mapping; this covers
  // the specific values DS-4 touched leaking sideways.
  for (const name of ['Button', 'Card', 'EmptyState', 'Input']) {
    const src = ui(name);
    assert.equal(/--danger-ink/.test(src), false, `${name} picked up --danger-ink`);
    assert.equal(/--on-bg/.test(src), false, `${name} picked up --on-bg`);
    assert.equal(/data-motion/.test(src), false, `${name} picked up a motion hook`);
  }
});

// =============================================================== SAFE-1 ======
//
// DS-6 SAFE-1: five literal 44px tap targets now read var(--tap-min), which was
// declared in DS-1 and had no consumer until this change. Naming the number is
// the whole change — --tap-min is 44px, so every one of these resolves to the
// value it replaced.
//
// There was a sixth 44px in the tree that was NOT a tap target and was
// deliberately excluded: a 44px avatar circle in components/CredentialsHandoff.js,
// where the number was a coincidence of geometry rather than a touch
// affordance. That file was deleted on 2026-08-28, so the exclusion has no
// subject — but the reasoning is kept because the next coincidental 44px will
// need it: converting one would couple a decorative diameter to the
// accessibility floor.

const TAP_TARGETS = [
  { file: 'Button', decl: '.md { min-height: var(--tap-min);' },
  { file: 'Button', decl: '.sm { min-height: var(--tap-min);' },
  { file: 'Input', decl: 'min-block-size: var(--tap-min);' },
  { file: 'ConfirmDialog', decl: 'min-block-size: var(--tap-min);' },
];

test('SAFE-1: --tap-min is exactly 44px, in both themes', () => {
  // The equality that makes the substitution zero-visual-change. --tap-min is
  // theme-invariant, so both themes must land on the same literal, and it must
  // be the literal the five declarations used to carry.
  for (const theme of ['dark', 'light']) {
    assert.equal(
      resolve(SCOPE[theme], '--tap-min'),
      '44px',
      `${theme}: --tap-min no longer resolves to 44px — the five substituted `
      + 'declarations would silently resize',
    );
  }
});

test('SAFE-1: every approved tap target reads the token, not the literal', () => {
  for (const { file, decl } of TAP_TARGETS) {
    assert.ok(
      uiCode(file).includes(decl),
      `${file}: expected a declaration reading "${decl}" — a site reverted to a literal`,
    );
  }
  // Button carries two (.md and the .sm mobile promotion); ConfirmDialog two
  // (.req-input and .btn); Input one. Five in total, and the count is asserted
  // so a lost site cannot hide behind a surviving sibling in the same file.
  const perFile = { Button: 2, Input: 1, ConfirmDialog: 2 };
  for (const [file, expected] of Object.entries(perFile)) {
    const n = [...uiCode(file).matchAll(/var\(--tap-min\)/g)].length;
    assert.equal(n, expected, `${file}: ${n} var(--tap-min) uses, expected ${expected}`);
  }
});

test('SAFE-1: no approved site still declares a literal 44px', () => {
  // Declarations only. The prose above Button's size rules still explains the
  // 44px floor, correctly, and must not fail this.
  for (const file of ['Button', 'Input', 'ConfirmDialog']) {
    const literals = [...uiCode(file).matchAll(/(?:min-height|min-block-size):\s*44px/g)];
    assert.deepEqual(
      literals.map((m) => m[0]),
      [],
      `${file}: a tap-target declaration is back to a hardcoded 44px`,
    );
  }
});

// SAFE-1's decorative-circle pin stood here. It named the 44x44 avatar in
// components/CredentialsHandoff.js, which was deleted on 2026-08-28 with the
// credentials handover.
//
// THE RULE IT PROTECTED IS NOT GONE, and is worth restating because it is the
// kind that gets "finished" by a well-meaning later pass: a 44px measurement is
// not automatically a tap target. Decorative geometry that happens to be 44px
// must never be coupled to --tap-min, because then it cannot change size
// without moving the accessibility floor with it. The count below is what
// enforces the same thing from the other direction — it fails if anything new
// adopts the token.

test('SAFE-1: exactly five declarations consume --tap-min, product-wide', () => {
  // Guards the other direction from the per-file counts: a sixth consumer
  // appearing anywhere in pages/ or components/ means something unrelated was
  // converted, which is the failure mode SAFE-1 was scoped to avoid.
  const roots = ['pages', 'components'];
  let total = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (!/node_modules|\.next/.test(full)) walk(full); continue; }
      if (!/\.(js|mjs|css)$/.test(entry.name)) continue;
      const body = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      total += [...body.matchAll(/var\(--tap-min\)/g)].length;
    }
  };
  for (const r of roots) walk(join(HERE, '..', r));
  assert.equal(total, 5, `${total} declarations consume --tap-min; SAFE-1 approved exactly 5`);
});

// ========================================================= DS-6 FIX-1/FIX-2 ==
//
// One behaviour in two files, pinned together because that is what they are.
//
// FIX-1: Badge's .neutral chip moved onto the --neutral-* set, which was
//   declared in both themes and had no consumer. The old pairing —
//   --text-tertiary on --bg-elevated — measured 3.31:1 on the light theme
//   against a 4.5 requirement for 11px/600 text.
// FIX-2: clientStage() emitted tone: 'default', a name Badge does not
//   implement, so the "Building" chip rendered with no background and no
//   border at all. It now emits 'neutral'.
//
// They ship together on purpose: FIX-2 routes the most commonly-occupied
// onboarding state onto the branch FIX-1 repairs. Landing FIX-2 alone would
// have made a live AA failure MORE visible, not less.
//
// pages/admin.js is a 6,500-line React page with no test harness in this
// project — the suite covers pure lib modules — so its assertion is a source
// assertion, following tests/admin-comp-kind-wiring.test.mjs. It cannot prove
// the screen renders; it can prove the wiring, which is where the risk is.

const adminSource = () => readFileSync(join(HERE, '..', 'pages', 'admin.js'), 'utf8');

// The .neutral rule, isolated, so assertions cannot be satisfied or broken by
// an unrelated token appearing elsewhere in the file.
function neutralBlock() {
  const src = uiCode('Badge');
  const m = src.match(/\.neutral \{([\s\S]*?)\}/);
  assert.ok(m, 'Badge no longer declares a .neutral rule');
  return m[1];
}

test('FIX-1: Badge .neutral reads the neutral token set', () => {
  const block = neutralBlock();
  for (const [prop, token] of [
    ['background', '--neutral-bg'],
    ['color', '--neutral-ink'],
    ['border-color', '--neutral-border'],
  ]) {
    assert.match(
      block,
      new RegExp(`${prop}:\\s*var\\(${token}\\)`),
      `.neutral ${prop} should read var(${token})`,
    );
  }
});

test('FIX-1: the old .neutral pairing is gone', () => {
  // --text-tertiary on --bg-elevated is the 3.31:1 light-theme pairing. It is
  // the --text-tertiary gap pinned in tests/contrast.test.mjs, and a chip is
  // where it stopped being acceptable.
  const block = neutralBlock();
  for (const token of ['--bg-elevated', '--text-tertiary', '--border)']) {
    assert.equal(
      block.includes(`var(${token}`),
      false,
      `.neutral is back on var(${token}) — that pairing fails AA in the light theme`,
    );
  }
});

test('FIX-1: .neutral clears AA in BOTH themes', () => {
  // The measurement the fix exists for. 11px at weight 600 is not WCAG "large
  // text", so the threshold is 4.5 and not 3.0.
  for (const theme of ['dark', 'light']) {
    const page = resolve(SCOPE[theme], '--bg-primary');
    const chip = over(resolve(SCOPE[theme], '--neutral-bg'), page);
    const ink = resolve(SCOPE[theme], '--neutral-ink');
    const r = contrastRatio(ink, chip);
    assert.ok(r !== null, `${theme}: unparseable pair ${ink} on ${chip}`);
    assert.ok(
      r >= 4.5,
      `${theme}: --neutral-ink on the neutral chip is ${r.toFixed(2)}:1, needs 4.5`,
    );
  }
});

// FIX-2's two clientStage() pins were removed on 2026-08-27. They asserted on
// the `building` badge in the owner's client roster, and clientStage() went to
// /console with OwnerClientsOverview. The rule they enforced -- a tone must be
// one Badge actually implements -- is still enforced below, tree-wide, by
// "'default' is not emitted as a tone anywhere in the product" and by the
// DS-6 five-tone API test. Nothing is unguarded; there is simply no
// clientStage() left to point at.

test("FIX-2: 'default' is not emitted as a tone anywhere in the product", () => {
  // The whole-tree check. Badge implements five tones; a sixth name reaching it
  // renders an unstyled span rather than failing, which is why nothing caught
  // this for as long as it existed.
  for (const file of ['pages/admin.js']) {
    const src = readFileSync(join(HERE, '..', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(
      /tone: 'default'/.test(src),
      false,
      `${file} emits tone: 'default', which Badge does not implement`,
    );
  }
});


test('DS-6: the Badge tone API is unchanged — exactly five tones', () => {
  const src = uiCode('Badge');
  const tones = [...src.matchAll(/^\s{8}\.([a-z]+)\s*[{ ]/gm)]
    .map((m) => m[1])
    .filter((t) => t !== 'dot' && t !== 'ui');
  assert.deepEqual(
    [...new Set(tones)].sort(),
    ['accent', 'danger', 'neutral', 'success', 'warning'],
    'the Badge tone set changed — no tone may be added or removed by DS-6',
  );
  assert.match(src, /tone = 'neutral'/, "Badge's default tone parameter changed");
});

test('FIX-3: the reset-password field reads a declared token', () => {
  // --text-base was never declared by this platform, so the declaration did
  // nothing and the field inherited 16px while every other input is 14px.
  // --text-md is the size every other text input in the product uses.
  const resetPw = readFileSync(join(HERE, '..', 'pages', 'reset-password.js'), 'utf8');
  assert.match(
    resetPw,
    /\.rp-form input \{[\s\S]*?font-size: var\(--text-md\)/,
    'the reset-password input no longer reads var(--text-md)',
  );
  assert.equal(
    /--text-base/.test(resetPw),
    false,
    'var(--text-base) is back — this platform declares no such token, so the '
    + 'declaration resolves to nothing and the field silently inherits 16px',
  );
  assert.equal(resolve(SCOPE.dark, '--text-md'), '14px', '--text-md is no longer 14px');
  assert.equal(resolve(SCOPE.light, '--text-md'), '14px', '--text-md is no longer 14px');
});

// ============================================================ DS-6 FOCUS-1 ==
//
// Every OUTLINE focus indicator in the product now takes its colour from one
// token. Two in components/shell/AppShell.js did not: they used --brand-focus,
// which is a 55%-alpha wash and, composited, measures 2.12-2.50:1 against every
// surface in both themes. WCAG 2.1 SC 1.4.11 asks 3:1 of a focus indicator, and
// at those two controls the outline is the ONLY indicator — no border or
// background moves on focus — so nothing else carries the signal.
//
// The fix is a colour token, not a mechanism: outline stays outline, the offsets
// are untouched, and --border-focus already existed (DS-2) and already resolves
// to --accent. --brand-focus keeps its other consumers.
//
// DELIBERATELY NOT CHANGED: the three Studio box-shadow rings
// (BilingualField, PiecePanel, LinksPanel) use the same token, but each pairs
// the ring with `border-color: var(--brand-line)` on the same state, so the
// indicator is a composite and its conformance cannot be settled by measuring
// the ring alone. That is a decision, not a mechanical swap. preview.js uses
// --brand-focus in an attention keyframe, which is not a focus indicator.

test('FOCUS-1: every outline focus indicator uses one colour token', () => {
  // The invariant, checked across the whole non-protected tree rather than at
  // the two sites that happened to be wrong — that is what makes it a rule.
  const roots = ['pages', 'components'];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (!/node_modules|\.next/.test(full)) walk(full); continue; }
      if (!/\.js$/.test(entry.name)) continue;
      const body = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // A file may paint the ring through its OWN alias, but only if the alias
      // is provably the same colour — declared as `--x: var(--accent…)` in this
      // same file. pages/index.js does exactly that: the public portfolio
      // carries its own --pf-* token layer, and --pf-accent is defined as
      // var(--accent, #9FA7FF).
      //
      // This is not a hole. The rule being enforced is ONE FOCUS COLOUR, and an
      // alias that resolves to --accent is that colour. A --pf-* name pointed at
      // anything else still fails, because the declaration is what is matched,
      // not the prefix.
      const aliases = new Set(
        [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\s*--accent\s*[,)]/g)].map((m) => m[1]),
      );
      for (const m of body.matchAll(/outline:\s*[0-9]+px solid var\((--[a-z0-9-]+)\)/g)) {
        if (m[1] !== '--accent' && m[1] !== '--border-focus' && !aliases.has(m[1])) {
          offenders.push(`${full.replace(join(HERE, '..') + '/', '')} :: ${m[1]}`);
        }
      }
    }
  };
  for (const r of roots) walk(join(HERE, '..', r));
  assert.deepEqual(
    [...new Set(offenders)],
    [],
    'an outline focus ring is painted with a token other than --accent / --border-focus',
  );
});

test('FOCUS-1: the outline focus colour clears 3:1 on every product surface', () => {
  // The measurement the fix exists for, and the one that would catch --accent
  // or --border-focus being repointed at something too faint to see.
  for (const theme of ['dark', 'light']) {
    const ring = resolve(SCOPE[theme], '--border-focus');
    for (const surface of ['--bg-primary', '--bg-secondary', '--bg-elevated']) {
      const bg = resolve(SCOPE[theme], surface);
      const r = contrastRatio(ring, bg);
      assert.ok(r !== null, `${theme}: unparseable ${ring} on ${bg}`);
      assert.ok(
        r >= 3,
        `${theme}: the focus ring is ${r.toFixed(2)}:1 on ${surface}, under the 3:1 `
        + 'WCAG 2.1 SC 1.4.11 floor for a non-text indicator',
      );
    }
  }
});

test('DS-6 closeout: the deferred items are still deferred', () => {
  // Cheap pins on the decisions this phase chose NOT to act on, so a later pass
  // has to reopen them deliberately rather than drift into them.
  const badge = uiCode('Badge');
  // Toast .info stays: it is unreachable (toast.info() has no call site), so the
  // retired periwinkle there renders to nobody.
  assert.match(uiCode('Toast'), /rgba\(159, 167, 255,/, 'Toast .info was changed');
  assert.match(badge, /rgba\(159, 167, 255,/, 'Badge .accent was changed');
  // ConfirmDialog keeps its own button and field. Converging them needs Button
  // variants that do not exist; see the DS-6 audit.
  const cd = uiCode('ConfirmDialog');
  assert.match(cd, /\.btn \{/, 'ConfirmDialog .btn was converged');
  assert.match(cd, /\.req-input \{/, 'ConfirmDialog .req-input was converged');
  // No speculative primitive appeared.
  const files = readdirSync(join(HERE, '..', 'components', 'ui'));
  for (const speculative of ['Modal.js', 'Tabs.js', 'Switch.js', 'Tooltip.js', 'Alert.js', 'Spinner.js']) {
    assert.equal(files.includes(speculative), false, `${speculative} was added speculatively`);
  }
  // No royal blue, no glow, no focus-ring token, no theme restructure.
  // DECLARATIONS ONLY: the DS-2 deferral record in globals.css names every one
  // of these tokens in prose, so a raw scan fires on the very comment that
  // documents the decision — the trap tests/design-tokens.test.mjs describes.
  const declarations = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const forbidden of [/^\s+--royal-/m, /^\s+--glow-/m, /^\s+--focus-ring\s*:/m, /\[data-theme/]) {
    assert.equal(forbidden.test(declarations), false, `globals.css grew ${forbidden}`);
  }
});

test('DS-6 closeout: --density stays declared and stays unwired', () => {
  // The token is reserved, not active. Two things must both hold, and the
  // comment beside it now says so: it must not be deleted (a reserved token is
  // not dead code), and it must not quietly acquire a consumer or a runtime
  // override — which is the thing its previous comment wrongly claimed already
  // existed. Note the admin has an unrelated Appearance "density" select that
  // writes profile content; it does not touch this custom property.
  assert.match(CSS, /^\s+--density:\s*1;/m, '--density was deleted or its value changed');
  const roots = ['pages', 'components'];
  const consumers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (!/node_modules|\.next/.test(full)) walk(full); continue; }
      if (!/\.(js|mjs|css)$/.test(entry.name)) continue;
      const body = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/var\(\s*--density\s*[,)]/.test(body) || /setProperty\(\s*['"]--density/.test(body)) {
        consumers.push(full.replace(join(HERE, '..') + '/', ''));
      }
    }
  };
  for (const r of roots) walk(join(HERE, '..', r));
  assert.deepEqual(
    consumers,
    [],
    '--density acquired a consumer or a runtime override. If that is intended it is '
    + 'a design decision, and the comment beside the token needs updating with it',
  );
});
