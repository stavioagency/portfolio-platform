// The PortfolioRenderer contract (components/portfolio/PortfolioRenderer.js).
// Zero dependencies — run with: npm test
//
// WHY THIS EXISTS
//
// PortfolioRenderer is the intended FUTURE public renderer. Today it is called
// only by the Studio preview; one day the public page will call it with
// published data instead. That migration is only cheap if the component never
// learns anything about its caller in the meantime — the moment it fetches, or
// reads a URL, or knows what a draft is, the swap stops being a change of
// caller and becomes a rewrite.
//
// Blueprint §8.2a: "One renderer means one final shipped renderer, not
// premature extraction of a legacy implementation." These tests are what keep
// the destination reachable while the two implementations live apart.
//
// This is a SOURCE-LEVEL test. The repo has no React test runner, and the
// contract is about what the file may depend on, which is exactly what source
// inspection can answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(ROOT, 'components/portfolio/PortfolioRenderer.js'), 'utf8');

// The contract comment in that file NAMES the forbidden props, so scanning the
// raw text flags the documentation for describing the rule it enforces. Strip
// comments and check the code.
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, '')     // block and JSX comments
  .replace(/^\s*\/\/.*$/gm, '');          // line comments

// Everything the renderer imports, as written.
const IMPORTS = [...SOURCE.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]);

test('it imports nothing that fetches, routes, or reaches a backend', () => {
  // A renderer that can load its own data cannot be handed data by two
  // different callers — which is the entire point of it.
  const forbidden = ['supabase', 'next/router', 'next/head', 'swr', 'axios', 'lib/tenant'];
  for (const spec of IMPORTS) {
    for (const bad of forbidden) {
      assert.ok(!spec.includes(bad),
        `PortfolioRenderer must not import "${spec}" — it takes data as props`);
    }
  }
});

test('it knows nothing about the Studio', () => {
  // If the preview needs to look different from the public page, that belongs
  // to the host. Otherwise the preview stops being proof of what visitors get.
  for (const spec of IMPORTS) {
    assert.ok(!spec.includes('studio'),
      `PortfolioRenderer must not import from the Studio: "${spec}"`);
  }
  for (const word of ['isDraft', 'isPreview', 'tenantId', 'published_at', 'publishState']) {
    assert.ok(!CODE.includes(word),
      `"${word}" in PortfolioRenderer means the boundary has been breached`);
  }
});

test('it writes nothing global — no document, storage, or network side effects', () => {
  // Today's public page sets appearance tokens on document.documentElement and
  // injects a favicon. Those are PAGE concerns. If they moved in here, the
  // renderer could not be mounted anywhere except a whole document, and the
  // Studio would restyle itself the moment the iframe went away.
  for (const global of [
    'document.documentElement',
    'document.head',
    'localStorage',
    'sessionStorage',
    'window.location',
    'fetch(',
    'postMessage',
  ]) {
    assert.ok(!CODE.includes(global),
      `PortfolioRenderer must not touch ${global} — that belongs to its host`);
  }
});

test('it accepts the props both callers will supply', () => {
  // The published caller and the draft caller must be able to use the same
  // signature. If a prop is renamed, this fails and the migration cost shows up
  // here rather than on the day of the swap.
  for (const prop of ['portfolio', 'lang', 'dir', 'appearance']) {
    assert.match(SOURCE, new RegExp(`\\b${prop}\\b`),
      `the documented prop "${prop}" is gone from the signature`);
  }
});

test('it labels its regions for click-to-edit without depending on a listener', () => {
  // data-field is semantic annotation: the renderer names its parts and has no
  // opinion about who reads them. The public site ignores them entirely.
  assert.ok(CODE.includes('data-field'), 'region labels are part of the contract');
  assert.ok(!CODE.includes('onClick'),
    'the renderer must not handle clicks — its host does');
});

// ── THE CLOSED PROP SET ──────────────────────────────────────────────────
// The test above checks the four documented props still EXIST. It cannot catch
// a FIFTH being added — and a fifth prop is how every rule in the contract gets
// broken in practice: `slug` to build a piece href, `mediaBase` to resolve an
// image, `baseUrl` for a canonical link. None of those names is on any
// denylist, and each reads as an ordinary prop at review.
//
// Frozen in docs/architecture/renderer-contracts.md §1.1: the prop set is
// CLOSED. Whatever the fifth prop is called, it is the signal that routing,
// storage or tenant knowledge is being smuggled in — so the shape is asserted
// rather than the names.
test('the renderer prop set is closed — exactly four props', () => {
  const sig = SOURCE.match(/export default function PortfolioRenderer\(\s*\{([^}]*)\}/);
  assert.ok(sig, 'PortfolioRenderer must destructure its props in the signature');
  const props = sig[1]
    .split(',')
    .map((p) => p.split('=')[0].trim())
    .filter(Boolean);
  assert.deepEqual(
    props.sort(),
    ['appearance', 'dir', 'lang', 'portfolio'],
    'the prop set is closed: portfolio, lang, dir, appearance — and nothing else',
  );
});

test('no file in components/portfolio may reach for routing, storage or tenant context', () => {
  // The contract is a rule about the DIRECTORY, not about one file. Written this
  // way, PieceRenderer / WorkGrid / NextStep / Footer cannot opt out of the
  // rules by being new files (renderer-contracts.md §5.4).
  const dir = join(ROOT, 'components/portfolio');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'the renderer directory must not be empty');

  for (const file of files) {
    const src = readFileSync(join(dir, file), 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    for (const spec of [...src.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1])) {
      for (const bad of ['supabase', 'next/router', 'next/head', 'lib/tenant', 'studio']) {
        assert.ok(!spec.includes(bad), `${file} must not import "${spec}"`);
      }
    }
    for (const word of [
      'tenantId', 'tenant_id', 'slug', 'baseUrl', 'mediaBase', 'bucket',
      'process.env', 'isDraft', 'isPreview', 'publishState',
      'localStorage', 'document.documentElement', 'document.head', 'fetch(',
    ]) {
      assert.ok(!code.includes(word), `"${word}" in components/portfolio/${file} breaches the contract`);
    }
  }
});

test('the contract is stated in the file itself', () => {
  // The rules above are only enforceable because someone wrote them down where
  // the next person will look.
  assert.match(SOURCE, /It must NOT, ever:/,
    'the contract comment has been removed from PortfolioRenderer');
});
