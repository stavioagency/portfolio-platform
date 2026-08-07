// Tests for the owner-operated credentials email — invite-client and
// client-recovery — in both languages.
//
// WHY THESE ARE TESTED BY EXTRACTION RATHER THAN BY IMPORT
// -------------------------------------------------------
// Those two files are Deno Edge Functions: they import from `jsr:` and
// `https://esm.sh/`, call Deno.env at module scope, and cannot be imported by
// Node. There is also no Deno on the machine this is written on. The
// alternative was to test nothing and hope, which is how an email goes out in
// the wrong language for a month without anyone noticing.
//
// So `pickLang` and `credentialsEmail` are written as PURE, EXPORTED functions
// with no Deno dependency, and this file lifts them out of the source by brace
// matching, strips the type annotations, and runs them for real. What is
// asserted is rendered output, not the presence of a string in a file.
//
// It doubles as the parity check the two files' comments promise: the same
// duplication argument that applies to their templates (deployed
// independently, a shared module is a deploy-order hazard) means the copies
// can drift, so the last test compares them character for character.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = {
  'invite-client': join(ROOT, 'supabase/functions/invite-client/index.ts'),
  'client-recovery': join(ROOT, 'supabase/functions/client-recovery/index.ts'),
};

// Exactly the annotations these two signatures use. Deliberately explicit
// rather than a general TypeScript stripper: if a signature changes, extraction
// fails loudly instead of silently testing something else.
//
// Applied to the WHOLE source before extraction, not after. Brace matching
// cannot run first: `): { subject: string; html: string } {` opens a brace for
// the return type, and matching from there closes on the annotation instead of
// the function body — which is exactly the truncation this used to produce.
function stripTypes(source) {
  return source
    .replaceAll('meta: Record<string, unknown> | null | undefined', 'meta')
    .replaceAll('tenantDefault?: string | null', 'tenantDefault')
    .replaceAll('lang: "ar" | "en",', 'lang,')
    .replaceAll('v: { username: string; password: string; workspace: string; adminUrl: string },', 'v,')
    .replaceAll('): "ar" | "en" {', ') {')
    .replaceAll('): { subject: string; html: string } {', ') {')
    .replaceAll('(v: unknown)', '(v)');
}

/** Lift `name`'s full declaration out of already-stripped source. */
function extract(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.notEqual(start, -1, `${name} should be exported — the test cannot run otherwise`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) {
      return source.slice(start, i + 1).replace(/^export /, '');
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

function load(path) {
  const src = stripTypes(readFileSync(path, 'utf8'));
  const body = [
    // credentialsEmail closes over `esc`, which is a plain arrow in both files.
    "const esc = (v) => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');",
    extract(src, 'pickLang'),
    extract(src, 'credentialsEmail'),
    'return { pickLang, credentialsEmail };',
  ].join('\n');
  return new Function(body)();
}

const MODULES = Object.fromEntries(
  Object.entries(FUNCTIONS).map(([name, path]) => [name, load(path)]),
);

const SAMPLE = {
  username: 'noura',
  password: 'Kx7mQp2rTv9wZa',
  workspace: 'Noura Studio',
  adminUrl: 'https://designakum.site/admin',
};

for (const [name, mod] of Object.entries(MODULES)) {
  test(`${name}: language priority is admin_lang, then lang, then tenant, then Arabic`, () => {
    const { pickLang } = mod;

    // 1. An explicit choice wins over everything, including a contradicting seed.
    assert.equal(pickLang({ admin_lang: 'en', lang: 'ar' }, 'ar'), 'en');
    assert.equal(pickLang({ admin_lang: 'ar', lang: 'en' }, 'en'), 'ar');

    // 2. The signup/seed language, when they have never pressed the toggle.
    assert.equal(pickLang({ lang: 'en' }, 'ar'), 'en');

    // 3. The workspace default — the only signal an invited client has.
    assert.equal(pickLang(null, 'en'), 'en');
    assert.equal(pickLang({}, 'en'), 'en');

    // 4. Arabic-first when nothing knows. This is the 44-of-50 case for
    //    accounts created before `lang` was seeded at invite time.
    assert.equal(pickLang(null, null), 'ar');
    assert.equal(pickLang(undefined, undefined), 'ar');
  });

  test(`${name}: junk never becomes a language`, () => {
    const { pickLang } = mod;
    for (const bad of ['EN', 'english', 'fr', '', ' ar ', 0, 1, true, {}, []]) {
      assert.equal(pickLang({ admin_lang: bad }, null), 'ar', `admin_lang=${JSON.stringify(bad)}`);
      assert.equal(pickLang(null, bad), 'ar', `tenant=${JSON.stringify(bad)}`);
    }
  });

  test(`${name}: the English email is English and reads left to right`, () => {
    const { subject, html } = mod.credentialsEmail('en', SAMPLE);
    assert.match(subject, /Your Noura Studio website — sign-in details/);
    assert.match(html, /Your website is ready/);
    assert.match(html, /Temporary password/);
    assert.match(html, /Sign in<\/a>/);
    assert.match(html, /dir="ltr"/);
    assert.match(html, /lang="en"/);
    assert.doesNotMatch(html, /[؀-ۿ]/, 'no Arabic should leak into the English email');
  });

  test(`${name}: the Arabic email is Arabic and reads right to left`, () => {
    const { subject, html } = mod.credentialsEmail('ar', SAMPLE);
    assert.match(subject, /[؀-ۿ]/, 'the subject must be Arabic too — it is what shows in the inbox');
    assert.match(html, /dir="rtl"/);
    assert.match(html, /lang="ar"/);
    assert.match(html, /text-align:right/);
    assert.match(html, /موقعك جاهز/);
    assert.match(html, /كلمة مرور مؤقتة/);
    // The body must be translated, not just re-aligned. These are the strings
    // a half-done translation leaves behind.
    for (const leftover of ['Your website is ready', 'Temporary password', 'Username</p>', '>Sign in<']) {
      assert.ok(!html.includes(leftover), `English leftover in the Arabic email: ${leftover}`);
    }
  });

  test(`${name}: credentials stay LTR inside an Arabic email`, () => {
    // A password rendered right-to-left is unreadable and gets retyped wrong.
    // Both the username and the password blocks carry their own dir="ltr".
    const { html } = mod.credentialsEmail('ar', SAMPLE);
    const ltrBlocks = html.match(/dir="ltr"/g) ?? [];
    assert.ok(ltrBlocks.length >= 2, 'username and password must each be forced LTR');
    assert.ok(html.includes(SAMPLE.password), 'the password must survive rendering');
    assert.ok(html.includes(SAMPLE.username));
  });

  test(`${name}: both languages escape what a workspace name can carry`, () => {
    for (const lang of ['ar', 'en']) {
      const { html } = mod.credentialsEmail(lang, { ...SAMPLE, workspace: '<script>x</script>&' });
      assert.ok(!html.includes('<script>'), `${lang}: workspace name must be escaped`);
      assert.ok(html.includes('&lt;script&gt;'), `${lang}: escaped form should be present`);
    }
  });
}

test('the two copies have not drifted', () => {
  // Both files carry the same pair of functions on purpose — see the comment on
  // each. Duplication is only safe while it is actually identical, so this is
  // the thing that makes the comment true rather than aspirational.
  const [a, b] = Object.values(FUNCTIONS).map((p) => stripTypes(readFileSync(p, 'utf8')));
  for (const fn of ['pickLang', 'credentialsEmail']) {
    assert.equal(
      extract(a, fn),
      extract(b, fn),
      `${fn} differs between invite-client and client-recovery`,
    );
  }
});
