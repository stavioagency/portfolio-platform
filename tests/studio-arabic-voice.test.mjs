// The Arabic voice rule for Studio copy (lib/studio/strings.js).
// Zero dependencies — run with: npm test
//
// THE RULE
//
// Arabic verbs addressed to a person carry grammatical gender: «انشري» speaks
// to a woman, «انشر» to a man. Designakum's clients are both, and the product
// collects no gender — so every string that addresses the client in a gendered
// form is wrong for roughly half of them, in their own portfolio tool.
//
// Studio Arabic therefore uses NEUTRAL, STATE-BASED phrasing:
//   * a verbal noun instead of a command      — «النشر», «تغيير الطابع»
//   * a statement of state instead of an order — «هذه التغييرات ظاهرة لك فقط»
//   * the passive where it reads naturally     — «لم تُراجَع بعد»
//
// Unvocalised possessives like «أعمالك» / «معرضك» are neutral in writing and
// are fine; it is verbs and explicitly vocalised pronouns that give gender away.
//
// This test exists because the rule is invisible to anyone who does not read
// Arabic: the whole Studio was written in the feminine before it was noticed,
// and nothing in a code review would have caught it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_STRINGS } from '../lib/studio/strings.js';

// Feminine forms that actually appeared in this file, plus the obvious
// masculine counterparts — a default to masculine is equally excluded.
const GENDERED = [
  // explicit feminine address
  'انشري', 'أضيفي', 'سمّي', 'أبقي', 'اجعلي', 'غيّري', 'أعيدي',
  'تنشرين', 'تودّين', 'تعملين', 'ترين', 'تطّلعي', 'كتبتِ', 'شئتِ',
  'يمكنكِ', 'أنتِ', 'لكِ', 'عنكِ', 'مستعدة',
  // explicit masculine address — a masculine default is equally excluded
  'انشر', 'أضف', 'سمّه', 'أبقه', 'أعد',
  'يمكنكَ', 'أنتَ', 'لكَ', 'عنكَ',
];

// Matched against WHOLE WORDS, not substrings. «يغيّر» in "الطابع يغيّر شكل
// المعرض" is third person — the direction changes the shape — and must not be
// confused with the command «غيّري». A naive substring check flagged exactly
// that sentence, which is how this matcher earned its tokenising.
function offendingForms(text) {
  const words = text.split(/[^\u0600-\u06FF]+/).filter(Boolean);
  return GENDERED.filter((form) =>
    words.some((word) => word === form || word.startsWith(form)));
}

// Sample arguments for the string builders, so functions are checked too.
function render(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') {
    // Every count branch, not just one: Arabic changes form at 1, 2, 3-10 and
    // 11+, so a gendered or malformed string could hide in any of them.
    try { return [1, 2, 3, 11].map((n) => String(value(n))).join(' | '); }
    catch { /* not an (n) builder */ }
    try { return String(value('designakum.site/noura')); } catch { /* nor a string one */ }
    return '';
  }
  if (value && typeof value === 'object') return Object.values(value).map(render).join(' | ');
  return '';
}

const arabic = STUDIO_STRINGS.ar;

test('no Studio Arabic string addresses the client with a gendered verb', () => {
  const offences = [];
  for (const [key, value] of Object.entries(arabic)) {
    const text = render(value);
    for (const form of offendingForms(text)) {
      offences.push(`${key}: "${text}" contains «${form}»`);
    }
  }
  assert.deepEqual(offences, [],
    'Arabic Studio copy must be gender-neutral. Rewrite as a verbal noun, a\n' +
    'statement of state, or a passive — never a command, and never a\n' +
    'masculine default:\n  ' + offences.join('\n  '));
});

test('the kasra-marked second person appears nowhere', () => {
  // «كِ» is the written giveaway: an explicitly vocalised feminine "you".
  const offences = Object.entries(arabic)
    .map(([key, value]) => [key, render(value)])
    .filter(([, text]) => text.includes('كِ'))
    .map(([key, text]) => `${key}: "${text}"`);
  assert.deepEqual(offences, []);
});

test('every English key has an Arabic counterpart, and the reverse', () => {
  // Parity is part of the voice rule: a missing Arabic string silently falls
  // back to English, which is exactly the translation-layer feeling the
  // product is built to avoid.
  const en = Object.keys(STUDIO_STRINGS.en).sort();
  const ar = Object.keys(STUDIO_STRINGS.ar).sort();
  assert.deepEqual(ar, en);
});

test('the builders produce Arabic, not an English fallback', () => {
  // A builder that forgot its Arabic body would still "exist" and pass a key
  // check while emitting English at runtime.
  const arabicish = /[؀-ۿ]/;
  for (const key of ['publishCount', 'publishFirstBody', 'unreviewed', 'piecesTitle', 'unpublishedTitle']) {
    const text = render(arabic[key]);
    assert.ok(arabicish.test(text), `${key} produced no Arabic: "${text}"`);
  }
});

test('Latin numerals are used in Arabic, never Arabic-Indic digits', () => {
  // GRANDMASTER rule, and easy to regress by pasting from a localisation tool.
  const arabicIndic = /[٠-٩]/;
  for (const [key, value] of Object.entries(arabic)) {
    const text = render(value);
    assert.ok(!arabicIndic.test(text), `${key} uses Arabic-Indic digits: "${text}"`);
  }
});
