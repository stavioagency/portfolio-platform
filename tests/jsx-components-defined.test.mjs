// Every component used in JSX must actually exist in the file that uses it.
//
// WHY THIS EXISTS: on 2026-08-28 a commit reverted a feature by deleting the
// component and leaving the call site. `<AvailabilityRow value={…} />` sat in
// pages/admin.js with no declaration and no import anywhere in the repo.
//
// Nothing caught it. It is not a syntax error, so the build compiled all 14
// routes and exited 0. It is not a token or a style, so no guard test looked at
// it. There are no component tests. It fails at RENDER, as a ReferenceError,
// and only on the one tab that renders it -- which was the client's Home Page
// editor, the busiest screen in the product. Every client opening that tab got
// a blank screen for as long as it took someone to notice.
//
// A JSX identifier is just a variable reference. This walks the tree, finds
// every `<Capitalised` in the JSX, and asserts the file declares or imports it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (!/node_modules|\.next|\.git/.test(full)) walk(full); continue; }
      if (/\.js$/.test(entry.name)) out.push(full);
    }
  };
  walk(join(ROOT, 'pages'));
  walk(join(ROOT, 'components'));
  return out;
}

// Comments and strings hold JSX-looking text that is documentation, not code —
// the stripping is the same discipline the other guards use.
function code(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// React's own intrinsics, which are never declared by a file that uses them.
const BUILTIN = new Set(['Fragment', 'Suspense', 'StrictMode', 'Profiler']);

// A binding introduced anywhere in the module: import, function, class, const/
// let/var, destructured import, or a parameter destructure (`{ Foo }`) — the
// last one matters because several editors take components as props.
function bindings(body) {
  const names = new Set();
  const add = (n) => n && names.add(n);
  for (const m of body.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) add(m[1]);
  for (const m of body.matchAll(/\bimport\s*{([^}]*)}/g)) {
    for (const part of m[1].split(',')) add(part.split(/\s+as\s+/).pop().trim());
  }
  for (const m of body.matchAll(/\b(?:function|class)\s+([A-Z][\w$]*)/g)) add(m[1]);
  for (const m of body.matchAll(/\b(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g)) add(m[1]);
  // `{ a, b: Alias, c: Renamed = 'div' }` binds a, Alias and Renamed. Strip the
  // default first, then take the part after the colon — that is the NAME that
  // ends up in scope. Doing it the other way round reads `as: Tag = 'div'` as
  // binding "as", which is how components/ui/Card.js looked like a defect.
  const destructured = (inner) => {
    for (const part of inner.split(',')) add(part.split('=')[0].split(':').pop().trim());
  };
  for (const m of body.matchAll(/{([^{}]*)}\s*=/g)) destructured(m[1]);
  for (const m of body.matchAll(/{([^{}]*)}\s*\)?\s*(?:=>|{)/g)) destructured(m[1]);
  return names;
}

function undefinedComponents() {
  const found = [];
  for (const file of sources()) {
    const body = code(file);
    const declared = bindings(body);
    for (const m of body.matchAll(/<([A-Z][\w$]*)(?=[\s/>])/g)) {
      const name = m[1];
      if (BUILTIN.has(name)) continue;
      // A member expression like <Foo.Bar> resolves through Foo, not Bar.
      if (declared.has(name)) continue;
      found.push(`${relative(ROOT, file)} :: <${name}>`);
    }
  }
  return [...new Set(found)];
}

test('every JSX component used is declared or imported by its own file', () => {
  assert.deepEqual(
    undefinedComponents(),
    [],
    'these components are rendered but never defined — each is a ReferenceError '
    + 'the moment that branch renders, and the build will not catch it',
  );
});

test('the guard actually sees the tree, and would catch a real one', () => {
  // A scanner that matches nothing passes the assertion above forever.
  assert.ok(sources().length >= 10, 'the walk is broken');
  const sample = readFileSync(join(ROOT, 'pages', 'admin.js'), 'utf8');
  assert.ok([...sample.matchAll(/<([A-Z][\w$]*)(?=[\s/>])/g)].length > 50, 'no JSX seen');
  // And the detector must actually fire on the shape it was written for.
  const declared = bindings('function Page(){ return <Missing a={1} /> }');
  assert.ok(!declared.has('Missing'), 'a bare JSX reference is being treated as declared');
  // The renamed-with-a-default parameter, which is a real pattern here
  // (components/ui/Card.js takes `as: Tag = 'div'`) and must not read as a bug.
  const aliased = bindings("function Card({ as: Tag = 'div' }) { return <Tag /> }");
  assert.ok(aliased.has('Tag'), 'a renamed destructured parameter is not seen as a binding');
});

// ---------------------------------------------------------------------------
// The same bug, one shape along: a CONSTANT that is used and never declared.
//
// WHY THIS EXISTS: deleting a component on 2026-08-28 also swallowed the
// `const RATING_CHOICES` sitting between it and the next function, because the
// cut ran to the next top-level declaration. `RATING_CHOICES.map(...)` stayed.
//
// The test above did not catch it — RATING_CHOICES is not a JSX tag — and
// neither did anything else: it is not a syntax error, so the build compiled
// and exited 0, and there are no component tests. It reached production as a
// blank screen with "a client-side exception has occurred" on the one tab a
// client uses most.
//
// SCREAMING_SNAKE_CASE ONLY, deliberately. It is this project's convention for
// a module-scope constant, and restricting the scan to that shape keeps it free
// of the false positives a general undefined-identifier check would drown in.
const BUILTIN_CONSTS = new Set(['NaN', 'Infinity', 'JSON', 'Math', 'URL', 'RTL', 'LTR']);

// Three places hold words that LOOK like constants but are prose:
//   strings          "IBM Plex Sans Arabic"
//   JSX text         <span>VISA</span>
//   trailing //      const x = 1; // RLS is the authority
//
// The comment stripper in code() only takes whole-line comments, so this scan
// blanks all three. ORDER MATTERS: strings go first, so a "https://" inside one
// is already gone before the trailing-comment pass looks for "//".
function forConstScan(body) {
  return body
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\/[^\n]*/g, '')
    // JSX text between tags. `{expr}` survives, which is the only place a
    // constant can legitimately appear in markup.
    .replace(/>[^<>{}]*</g, '><');
}

function undefinedConstants() {
  const found = [];
  for (const file of sources()) {
    const body = forConstScan(code(file));
    const declared = new Set();
    for (const m of body.matchAll(/\b(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]{2,})\b/g)) declared.add(m[1]);
    for (const m of body.matchAll(/\bimport\s*{([^}]*)}/g)) {
      for (const part of m[1].split(',')) declared.add(part.split(/\s+as\s+/).pop().trim());
    }
    for (const m of body.matchAll(/\bimport\s+([A-Z][A-Z0-9_]{2,})\s*(?:,|from)/g)) declared.add(m[1]);
    // `export { X } from './Y'` re-exports a name without importing it into
    // scope — components/ui/index.js is nothing but these.
    for (const m of body.matchAll(/\bexport\s*{([^}]*)}\s*from/g)) {
      for (const part of m[1].split(',')) declared.add(part.split(/\s+as\s+/).pop().trim());
    }
    // Destructured out of something, e.g. `const { A_B } = x`.
    for (const m of body.matchAll(/{([^{}]*)}\s*=/g)) {
      for (const part of m[1].split(',')) declared.add(part.split('=')[0].split(':').pop().trim());
    }
    for (const m of body.matchAll(/(?<![.\w$'"`])\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{3,})\b/g)) {
      const name = m[1];
      if (BUILTIN_CONSTS.has(name) || declared.has(name)) continue;
      found.push(`${relative(ROOT, file)} :: ${name}`);
    }
  }
  return [...new Set(found)];
}

test('every SCREAMING_SNAKE constant used is declared or imported by its own file', () => {
  assert.deepEqual(
    undefinedConstants(),
    [],
    'these constants are referenced but never defined — each is a ReferenceError '
    + 'the moment that branch renders, and the build will not catch it',
  );
});

test('the constant scanner would catch a real one, and ignores prose', () => {
  // An empty result is only trustworthy if the scanner still fires. Both halves
  // are checked: it must find a genuinely undeclared constant, and it must not
  // trip over the three kinds of prose that look like one.
  const scan = (src) => {
    const body = forConstScan(src);
    const declared = new Set(
      [...body.matchAll(/\b(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]),
    );
    return [...body.matchAll(/(?<![.\w$'"`])\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{3,})\b/g)]
      .map((m) => m[1])
      .filter((n) => !BUILTIN_CONSTS.has(n) && !declared.has(n));
  };

  assert.deepEqual(scan('function f(){ return RATING_CHOICES.map(x=>x) }'), ['RATING_CHOICES'],
    'an undeclared constant is no longer detected');
  assert.deepEqual(scan('const RATING_CHOICES = [1]; function f(){ return RATING_CHOICES.map(x=>x) }'), [],
    'a declared constant is reported as missing');
  assert.deepEqual(scan('const a = "IBM Plex"; // RLS is the authority'), [],
    'prose in a string or a trailing comment is read as code');
  assert.deepEqual(scan('const el = <span>VISA</span>;'), [],
    'JSX text is read as code');
});
