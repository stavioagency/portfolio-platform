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
