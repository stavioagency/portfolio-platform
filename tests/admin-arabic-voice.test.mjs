// The Arabic voice rule, applied to the ADMIN's copy (lib/translations.js).
//
// WHY THIS FILE EXISTS SEPARATELY FROM studio-arabic-voice.test.mjs:
// that guard reads lib/studio/strings.js and nothing else. The admin — every
// screen a client actually uses today — keeps its copy in lib/translations.js,
// which had NO guard at all. The result was 45 strings addressing the client
// with masculine imperatives («ابدأ من هنا», «أضِف اسمك», «اختر خطة») shipped
// to production, in the half of the product that is not the Studio.
//
// THE RULE (docs/design/design.md, principle 11)
//
// Arabic verbs addressed to a person carry grammatical gender: «انشري» speaks
// to a woman, «انشر» to a man. Designakum's clients are both and the product
// collects no gender, so a command is wrong for roughly half of them. Copy is
// written neutrally instead:
//   * a verbal noun instead of a command       — «إضافة الاسم», «اختيار خطة»
//   * a statement of state instead of an order — «عنوان الموقع مطلوب.»
//   * the passive where it reads naturally     — «لم تُراجَع بعد»
//
// A MASCULINE DEFAULT IS NOT A SHORTCUT. It is the same bug as the feminine
// one, and it is the form this file was actually written in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { translations } from '../lib/translations.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Masculine imperatives that actually appeared in this file, plus the feminine
// counterparts so a swap in either direction is caught.
//
// DELIBERATELY NOT LISTED — these collide with innocent words once diacritics
// are ignored, and a guard that cries wolf gets deleted:
//   «غير»  the negation particle in «غير محفوظة» / «غير صحيح», not «غيّر»
//   «سجل»   the noun in «سجل الفواتير» (invoice log), not «سجّل» (log in)
//   «تواصل» identical unvocalised as verbal noun (تَواصُل) and imperative
//           (تَواصَل); it is also the label on the CLIENT's own public page,
//           where the reader is their visitor, not them
// The first two are matched only in their vocalised imperative spelling.
const GENDERED = [
  // masculine imperative
  'ابدأ', 'أضف', 'أضِف', 'اختر', 'اكتب', 'احفظ', 'انقر', 'اضغط', 'أدخل',
  'أنشئ', 'عاين', 'عايِن', 'اسحب', 'ارفع', 'احذف', 'انتقل', 'استخدم',
  'تحقق', 'تحقّق', 'تفقد', 'تفقّد', 'حاول', 'اطلب', 'جرب', 'جرّب', 'وافق',
  'سجّل', 'عدّل', 'غيّر', 'انشر', 'أكّد', 'تأكد', 'تأكّد',
  // feminine imperative — equally excluded
  'ابدئي', 'أضيفي', 'اختاري', 'اكتبي', 'احفظي', 'اضغطي', 'أدخلي', 'أنشئي',
  'عايني', 'اسحبي', 'ارفعي', 'احذفي', 'انتقلي', 'استخدمي', 'انشري',
  // explicitly vocalised second person
  'يمكنكَ', 'يمكنكِ', 'أنتَ', 'أنتِ', 'لكَ', 'لكِ', 'عنكَ', 'عنكِ',
];

// Whole words only. A substring check flags «الاختيار» for «اختر» and
// «المستخدم» for «استخدم», which is how the Studio guard earned its tokeniser.
function offendingForms(text) {
  const words = String(text).split(/[^؀-ۿ]+/).filter(Boolean);
  return GENDERED.filter((form) => words.includes(form));
}

test('no admin Arabic string addresses the client with a gendered verb', () => {
  const offences = [];
  for (const [key, value] of Object.entries(translations.ar)) {
    if (typeof value !== 'string') continue;
    for (const form of offendingForms(value)) {
      offences.push(`${key}: "${value}" contains «${form}»`);
    }
  }
  assert.deepEqual(offences, [],
    'Admin Arabic must be gender-neutral. Rewrite as a verbal noun, a\n'
    + 'statement of state, or a passive — never a command:\n  '
    + offences.join('\n  '));
});

test('the guard actually reaches the strings it claims to check', () => {
  // Without this, a renamed export or an empty object would make the test
  // above pass by checking nothing at all.
  const count = Object.values(translations.ar).filter((v) => typeof v === 'string').length;
  assert.ok(count > 300, `expected the full Arabic string table, saw ${count}`);
  assert.ok(translations.ar.start_here_title, 'a known key is missing');
});

test('the matcher catches a command and spares its verbal noun', () => {
  // Mutation-tested both ways: an unapplied mutation is not a caught mutation.
  assert.deepEqual(offendingForms('أضِف اسمك'), ['أضِف']);
  assert.deepEqual(offendingForms('انشري معرضك'), ['انشري']);
  assert.deepEqual(offendingForms('إضافة الاسم'), []);
  // The two collisions the GENDERED list deliberately omits:
  assert.deepEqual(offendingForms('لديك تغييرات غير محفوظة'), []);
  assert.deepEqual(offendingForms('سجل الفواتير'), []);
  assert.deepEqual(offendingForms('تواصل معي'), []);
  // And the tokeniser: these contain the letters but are not the command.
  assert.deepEqual(offendingForms('اسم المستخدم'), []);
  assert.deepEqual(offendingForms('الاختيار متاح'), []);
});

// ---------------------------------------------------------------------------
// THE WHOLE TREE, not just the string table.
//
// A great deal of Arabic is written INLINE, as `ar ? 'عربي' : 'English'`, and
// never passes through lib/translations.js. Guarding only the table guarded
// only half the product: a live check found commands still painting on screen
// after the table had been cleaned, and a sweep then found 34 more outside
// pages/admin.js — 22 of them in lib/onboarding-guide.js, which is the
// step-by-step guide a brand new client reads first.
//
// SCOPE, deliberately: principle 11 protects THE CLIENT. The Console is the
// operator's product, where §7.3 allows real vocabulary and the reader is
// Feras rather than a customer. Operator-only strings are pinned below rather
// than rewritten — ONE BY ONE, so a new one is a conscious act instead of a
// whole file being waved through.
const OPERATOR_PINNED = new Set([
  // pages/admin.js — the owner's client-management surfaces
  'أدخل معرّفًا صالحًا',
  'أدخل معرّفًا صالحًا للمساحة',
  'هذا المعرّف محجوز، اختر غيره',
  'هذا البريد يخص حساب مالك للمنصة — استخدم بريدًا آخر.',
  'وهو مرتبط بعميل نشط، لذا استخدم بريدًا مختلفًا.',
  'وظيفة الاسترجاع غير منشورة بعد على Supabase.',
  'لا يمكن تحرير حساب ما زال مرتبطًا بمساحة عمل — احذف المساحة أولًا.',
  'يغيّر العنوان على الحساب نفسه. لا يُرسل شيئًا — استخدم «إرسال الترحيب» بعدها.',
  'تعذّر تحديث حالة التسليم. أعد المحاولة.',
  'كل عميل هو مساحة وموقع واحد. اضغط عليه لإدارته دون تبديل مساحة العمل النشطة.',
  'سجّل دخوله من قبل',
  'جرّب بحثًا أو تصفية أخرى.',
  // components/CredentialsHandoff.js — the owner hands credentials to a client
  'اختر طريقة التسليم',
  'لم يصل شيء إلى العنوان الجديد بعد — اختر طريقة تسليم',
  'لم يُرسل بريد — اختر طريقة تسليم من الأسفل',
  // lib/billing-errors.js — plan sync is an owner-only action
  'الخطط غير مزامنة مع باي بال. اضغط "مزامنة الخطط مع باي بال" أولًا.',
  // pages/console/index.js — the Console is the operator's product by definition
  'هذه الشاشة ستنتقل إلى هنا من لوحة التحكم الحالية.',
]);

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.next|\.git/.test(full)) walk(full);
        continue;
      }
      if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
    }
  };
  for (const r of ['pages', 'components', 'lib']) walk(join(ROOT, r));
  return out;
}

function arabicLiterals(src) {
  const found = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const v = m[1] || m[2] || m[3] || '';
    if (/[\u0600-\u06FF]/.test(v)) found.push(v);
  }
  return found;
}

test('no Arabic anywhere in the tree gives the client an order', () => {
  const offences = [];
  let literals = 0;
  for (const file of sourceFiles()) {
    const rel = relative(ROOT, file);
    // The string table has its own test above; skip it here to keep the
    // failure message pointing at one place per string.
    if (rel === 'lib/translations.js') continue;
    for (const text of arabicLiterals(readFileSync(file, 'utf8'))) {
      literals += 1;
      if ([...OPERATOR_PINNED].some((pin) => text.includes(pin))) continue;
      for (const form of offendingForms(text)) {
        offences.push(`${rel}: "${text.slice(0, 60)}" contains «${form}»`);
      }
    }
  }
  assert.ok(literals > 200, `expected the tree's Arabic, saw ${literals}`);
  assert.deepEqual(offences, [],
    'Client-facing Arabic must be gender-neutral. Rewrite as a verbal noun, a\n'
    + 'statement of state, or a passive. If the string is genuinely\n'
    + 'operator-only, add it to OPERATOR_PINNED with that reasoning:\n  '
    + offences.join('\n  '));
});
