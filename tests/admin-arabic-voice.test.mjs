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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
// pages/admin.js writes a lot of Arabic INLINE, as `ar ? 'عربي' : 'English'`,
// which never passes through lib/translations.js. Guarding only the string
// table therefore missed 35 literals — four of which were still painting a
// command on a client's screen after the table had been cleaned. This half of
// the guard reads the source text, the way the other structural guards do.
//
// SCOPE, deliberately: principle 11 protects THE CLIENT. The Console is the
// operator's product, where §7.3 allows real vocabulary and the reader is
// Feras, not a customer. Operator-only strings are pinned below rather than
// rewritten — but they are pinned ONE BY ONE, so a new one has to be added
// consciously instead of a whole file being waved through.
const OPERATOR_PINNED = new Set([
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
]);

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

test('no inline Arabic in pages/admin.js gives the client an order', () => {
  const src = readFileSync(join(ROOT, 'pages/admin.js'), 'utf8');
  const literals = arabicLiterals(src);
  assert.ok(literals.length > 50, `expected the inline Arabic, saw ${literals.length}`);

  const offences = [];
  for (const text of literals) {
    if ([...OPERATOR_PINNED].some((pin) => text.includes(pin))) continue;
    for (const form of offendingForms(text)) {
      offences.push(`"${text.slice(0, 70)}" contains «${form}»`);
    }
  }
  assert.deepEqual(offences, [],
    'Client-facing Arabic in admin.js must be gender-neutral. Rewrite as a\n'
    + 'verbal noun, a statement of state, or a passive. If the string is\n'
    + 'genuinely operator-only, add it to OPERATOR_PINNED with that reasoning:\n  '
    + offences.join('\n  '));
});
