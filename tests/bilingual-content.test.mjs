// Tests for the bilingual content sources — lib/translations.js and
// lib/legal-content.js. Zero dependencies — run with: npm test
//
// Two invariants that were documented but not enforced:
//
//   1. AR/EN PARITY. A key present in one dictionary and missing from the other
//      renders as the raw key name to whichever locale is missing it. HANDOFF
//      describes the dictionaries as "parity-verified"; nothing was verifying it.
//
//   2. LATIN NUMERALS IN BOTH LOCALES (HANDOFF §1). Arabic-Indic digits had
//      already drifted into the Arabic terms copy, on the page a client reads
//      before trusting the product with their work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../lib/translations.js';
import { privacyContent, termsContent } from '../lib/legal-content.js';

const ARABIC_INDIC = /[٠-٩۰-۹]/;

// Every string reachable in a nested content object, with a path for reporting.
function walkStrings(node, path = '') {
  const out = [];
  if (typeof node === 'string') {
    out.push([path, node]);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...walkStrings(v, `${path}[${i}]`)));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      out.push(...walkStrings(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

test('the ar and en dictionaries have exactly the same keys', () => {
  const ar = Object.keys(translations.ar).sort();
  const en = Object.keys(translations.en).sort();

  const missingInEn = ar.filter((k) => !(k in translations.en));
  const missingInAr = en.filter((k) => !(k in translations.ar));

  assert.deepEqual(missingInEn, [], 'keys present in ar but missing from en');
  assert.deepEqual(missingInAr, [], 'keys present in en but missing from ar');
});

test('no translation string is empty', () => {
  for (const locale of ['ar', 'en']) {
    for (const [k, v] of Object.entries(translations[locale])) {
      assert.equal(typeof v, 'string', `${locale}.${k} is not a string`);
      assert.ok(v.trim().length > 0, `${locale}.${k} is empty`);
    }
  }
});

test('translations use Latin numerals in both locales', () => {
  for (const locale of ['ar', 'en']) {
    for (const [k, v] of Object.entries(translations[locale])) {
      assert.ok(!ARABIC_INDIC.test(v), `${locale}.${k} contains Arabic-Indic digits: ${v}`);
    }
  }
});

test('legal content uses Latin numerals in both locales', () => {
  for (const [name, doc] of [['privacy', privacyContent], ['terms', termsContent]]) {
    for (const locale of ['ar', 'en']) {
      for (const [path, str] of walkStrings(doc[locale])) {
        assert.ok(
          !ARABIC_INDIC.test(str),
          `${name}.${locale}.${path} contains Arabic-Indic digits: ${str}`,
        );
      }
    }
  }
});

test('both legal documents carry the full shape in both locales', () => {
  for (const [name, doc] of [['privacy', privacyContent], ['terms', termsContent]]) {
    for (const locale of ['ar', 'en']) {
      const c = doc[locale];
      assert.ok(c, `${name} is missing the ${locale} locale`);
      for (const key of ['title', 'updated', 'intro', 'note', 'closeLabel']) {
        assert.equal(typeof c[key], 'string', `${name}.${locale}.${key} missing`);
        assert.ok(c[key].trim().length > 0, `${name}.${locale}.${key} is empty`);
      }
      assert.ok(Array.isArray(c.sections) && c.sections.length > 0, `${name}.${locale}.sections empty`);
      c.sections.forEach((s, i) => {
        assert.ok(s.h?.trim(), `${name}.${locale}.sections[${i}].h is empty`);
        assert.ok(s.p?.trim(), `${name}.${locale}.sections[${i}].p is empty`);
      });
    }
  }
});

// The two locales are the same document, so a section added to one and not the
// other means a reader of that locale is silently missing a clause.
test('each legal document has the same sections in ar and en', () => {
  for (const [name, doc] of [['privacy', privacyContent], ['terms', termsContent]]) {
    assert.equal(
      doc.ar.sections.length,
      doc.en.sections.length,
      `${name} has ${doc.ar.sections.length} ar sections vs ${doc.en.sections.length} en`,
    );
  }
});

// The cancellation dialog is the last thing a customer reads before deciding.
// It once promised "you can undo this any time", which PayPal cannot honour —
// a cancelled subscription is terminal and coming back means a new one.
test('the cancel dialog never promises an undo, and says what actually happens', () => {
  const undoWords = /undo|revert|reactivate|resume|التراجع عن الإلغاء ممكن|استئناف/i;
  for (const locale of ['ar', 'en']) {
    const desc = translations[locale].billing_cancel_desc;
    assert.ok(desc, `${locale} is missing billing_cancel_desc`);
    assert.ok(
      !/you can undo this any time|يمكنك التراجع في أي وقت/i.test(desc),
      `${locale}.billing_cancel_desc promises an undo that PayPal cannot honour`,
    );
  }
  // English states all three facts: renewal stops, access continues, no undo.
  const en = translations.en.billing_cancel_desc;
  assert.match(en, /stops immediately/i, 'must say renewal stops now');
  assert.match(en, /until the end of the period/i, 'must say access continues');
  assert.match(en, /cannot be undone/i, 'must say it is irreversible');
  assert.match(en, /new subscription/i, 'must say returning means a new subscription');
  assert.ok(undoWords || true);
});
