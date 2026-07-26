import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPublicContent, hasBilingualText } from '../lib/profile-content.js';

// The exact shape createTenant inserts for a brand-new workspace, and the shape the
// designakum row actually had in production on 2026-07-26.
const FRESH = { tenant_id: 'x', default_lang: 'ar' };
const EMPTY_BILINGUAL = { name: { ar: '', en: '' }, tagline: { ar: '', en: '' } };

test('a missing profile has no content', () => {
  assert.equal(hasPublicContent(null), false);
  assert.equal(hasPublicContent(undefined), false);
});

test('a freshly created workspace has no content', () => {
  assert.equal(hasPublicContent(FRESH, 0), false);
});

test('empty bilingual strings are not content — the designakum.site bug', () => {
  assert.equal(hasPublicContent(EMPTY_BILINGUAL, 0), false);
});

test('a footer and SEO fields alone are NOT content — the real ahmad-demo row', () => {
  // This row is empty except for footer text and SEO metadata. The footer does
  // render, but a copyright line under a nameless "?" avatar is precisely the
  // broken state being caught, and SEO is for crawlers, not the page.
  const ahmadDemo = {
    name: { ar: '', en: '' }, tagline: { ar: '', en: '' }, bio: { ar: '', en: '' },
    profile_image: '', brand_logo: '', custom_fields: [], custom_links: [],
    banners: [], stats: [], cta_buttons: [],
    footer: { text: { ar: '© أحمد الراشد 2026 · عرض توضيحي', en: '© Ahmad Al-Rashid 2026 · Demo' } },
    seo: { title: { en: 'Ahmad Al-Rashid — Designer & Developer' }, og_image: 'data:image/svg+xml;base64,PHN2' },
    appearance: {}, top_ticker: { text: { ar: '', en: '' }, enabled: false },
  };
  assert.equal(hasPublicContent(ahmadDemo, 0), false);
});

test('whitespace-only text is not content', () => {
  assert.equal(hasPublicContent({ name: { ar: '   ', en: '\n' } }, 0), false);
});

test('a name in EITHER language is content', () => {
  assert.equal(hasPublicContent({ name: { ar: 'فيصل', en: '' } }, 0), true);
  assert.equal(hasPublicContent({ name: { ar: '', en: 'FAISAL' } }, 0), true);
});

test('projects alone are content, even with an otherwise empty profile', () => {
  assert.equal(hasPublicContent(FRESH, 8), true);
});

test('theme/appearance alone is NOT content — a styled blank card is still blank', () => {
  assert.equal(hasPublicContent({ ...FRESH, appearance: { accent_color: '#2C6FE0' } }, 0), false);
});

test('an avatar or brand logo counts', () => {
  assert.equal(hasPublicContent({ profile_image: 'https://x/y.png' }, 0), true);
  assert.equal(hasPublicContent({ brand_logo: 'https://x/y.png' }, 0), true);
});

test('banners count only when they would actually render', () => {
  assert.equal(hasPublicContent({ banners: [{ type: 'image', image_url: '' }] }, 0), false);
  assert.equal(hasPublicContent({ banners: [{ type: 'image', image_url: 'https://x/b.png' }] }, 0), true);
  assert.equal(hasPublicContent({ banners: [{ type: 'text', text: { en: 'Hi' } }] }, 0), true);
  assert.equal(hasPublicContent({ banners: [{ type: 'text', text: { en: '' } }] }, 0), false);
});

test('stats, CTAs, links and custom fields each count', () => {
  assert.equal(hasPublicContent({ stats: [{ value: { en: '10' } }] }, 0), true);
  assert.equal(hasPublicContent({ cta_buttons: [{ label: { ar: 'تواصل' } }] }, 0), true);
  assert.equal(hasPublicContent({ custom_links: [{ href: 'https://x' }] }, 0), true);
  assert.equal(hasPublicContent({ custom_fields: [{ value: { en: 'Riyadh' } }] }, 0), true);
});

test('empty arrays are not content', () => {
  assert.equal(hasPublicContent({ banners: [], stats: [], cta_buttons: [], custom_links: [], custom_fields: [] }, 0), false);
});

test('malformed values do not throw', () => {
  assert.equal(hasPublicContent({ banners: 'nope', stats: null, custom_links: 42 }, 0), false);
  assert.equal(hasPublicContent({ name: 7, bio: [] }, 0), false);
});

test('hasBilingualText handles legacy plain strings', () => {
  assert.equal(hasBilingualText('Faisal'), true);
  assert.equal(hasBilingualText(''), false);
  assert.equal(hasBilingualText({ en: 'x' }), true);
  assert.equal(hasBilingualText({}), false);
  assert.equal(hasBilingualText(null), false);
});
