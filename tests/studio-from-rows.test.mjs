// The Studio's data path — mapping live rows to the draft shape and back.
// Zero dependencies — run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftFromRows, rowsFromDraft, hasContent, withFirstRunSlots,
} from '../lib/studio/from-rows.js';

const PROFILE = {
  name: { en: 'Noura Al-Harbi', ar: 'نورة الحربي' },
  tagline: { en: 'Photographer', ar: 'مصوّرة' },
  bio: { en: 'I photograph people.', ar: 'أصوّر الناس.' },
  profile_image: 'https://cdn/x.jpg',
  custom_links: [{ id: 'instagram', label: 'Instagram', url: 'https://instagram.com/n' }],
  appearance: { theme: 'midnight', tokens: { accent: '#9FA7FF' }, density: 'comfortable' },
};

const PROJECTS = [
  { id: 7, title: { en: 'Souq mornings', ar: 'صباحات السوق' }, description: { en: 'x', ar: 'س' }, cover_image: 'c2.jpg', external_url: '', display_order: 1 },
  { id: 3, title: { en: 'Layla, at home', ar: 'ليلى' }, description: { en: '', ar: '' }, cover_image: 'c1.jpg', external_url: 'https://e.com', display_order: 0 },
];

test('the profile row becomes the draft, tagline included', () => {
  const d = draftFromRows({ profile: PROFILE, projects: [] });
  assert.equal(d.name.ar, 'نورة الحربي');
  // Mismatch 1: the Studio calls this `title`, the column is `tagline`.
  assert.equal(d.title.en, 'Photographer');
  assert.equal(d.bio.ar, 'أصوّر الناس.');
  assert.equal(d.photo, 'https://cdn/x.jpg');
  assert.equal(d.links.length, 1);
});

test('pieces are ordered by display_order, never by id', () => {
  // The projects sequence is shared across every tenant, so id order is
  // meaningless as a sequence.
  const d = draftFromRows({ profile: PROFILE, projects: PROJECTS });
  assert.deepEqual(d.pieces.map((p) => p.id), [3, 7]);
  assert.equal(d.pieces[0].name.en, 'Layla, at home');
  assert.equal(d.pieces[0].link, 'https://e.com');
});

test('a piece with neither a name nor a cover is a worded absence', () => {
  const d = draftFromRows({
    profile: {},
    projects: [{ id: 1, title: { en: '', ar: '' }, cover_image: null, display_order: 0 }],
  });
  assert.equal(d.pieces[0].empty, true);
  // And one with only a cover is NOT empty — the client put something there.
  const d2 = draftFromRows({
    profile: {},
    projects: [{ id: 1, title: { en: '', ar: '' }, cover_image: 'c.jpg', display_order: 0 }],
  });
  assert.equal(d2.pieces[0].empty, false);
});

test("the Studio's appearance is read from its own namespaced key", () => {
  // The admin's theme/tokens vocabulary is a different model and must not be
  // lossily converted — that would recolour a live site on first open.
  const withStudio = { ...PROFILE, appearance: { ...PROFILE.appearance, studio: { accent: 'olive', density: 'tight' } } };
  const d = draftFromRows({ profile: withStudio, projects: [] });
  assert.equal(d.appearance.accent, 'olive');
  assert.equal(d.appearance.density, 'tight');
  // Unset keys still fall back to a default, so the portfolio always renders.
  assert.equal(d.appearance.font, 'manrope');
});

test('a profile with no studio key gets defaults, not the admin theme', () => {
  const d = draftFromRows({ profile: PROFILE, projects: [] });
  assert.equal(d.appearance.accent, 'royal');
  assert.notEqual(d.appearance.accent, 'midnight');
});

test('an absent profile still produces a renderable draft', () => {
  const d = draftFromRows();
  assert.deepEqual(d.name, { en: '', ar: '' });
  assert.deepEqual(d.pieces, []);
  assert.equal(d.appearance.accent, 'royal');
  assert.equal(d.bioIsSuggestion, false);
});

test('writing back keeps the admin appearance keys and namespaces its own', () => {
  const d = draftFromRows({ profile: PROFILE, projects: [] });
  d.appearance.accent = 'sand';
  const rows = rowsFromDraft(d, { existingAppearance: PROFILE.appearance });
  assert.equal(rows.profile.appearance.theme, 'midnight', 'admin key must survive');
  assert.deepEqual(rows.profile.appearance.tokens, { accent: '#9FA7FF' });
  assert.equal(rows.profile.appearance.studio.accent, 'sand');
});

test('the write payload never mentions the columns it does not own', () => {
  // banners, stats, cta_buttons, custom_fields, sections and top_ticker are
  // still rendered by pages/index.js. A patch that nulled one would take down
  // a paying client's page.
  const rows = rowsFromDraft(draftFromRows({ profile: PROFILE, projects: PROJECTS }));
  for (const col of ['banners', 'stats', 'cta_buttons', 'custom_fields', 'sections', 'top_ticker']) {
    assert.equal(col in rows.profile, false, `${col} must not appear in the patch`);
  }
});

test('writing back renumbers display_order from the visible sequence', () => {
  const d = draftFromRows({ profile: PROFILE, projects: PROJECTS });
  const rows = rowsFromDraft(d);
  assert.deepEqual(rows.pieces.map((p) => [p.id, p.display_order]), [[3, 0], [7, 1]]);
  assert.equal(rows.pieces[0].title.en, 'Layla, at home');
});

test('a round trip preserves everything that has a column', () => {
  const d = draftFromRows({ profile: PROFILE, projects: PROJECTS });
  const back = draftFromRows({
    profile: { ...rowsFromDraft(d).profile },
    projects: rowsFromDraft(d).pieces,
  });
  assert.deepEqual(back.name, d.name);
  assert.deepEqual(back.title, d.title);
  assert.deepEqual(back.bio, d.bio);
  assert.equal(back.photo, d.photo);
  assert.deepEqual(back.links, d.links);
  assert.deepEqual(back.pieces.map((p) => p.name), d.pieces.map((p) => p.name));
});

test('shortLine and the action destination do NOT survive a round trip', () => {
  // Recorded as a known gap rather than hidden: neither has a column. If this
  // test starts failing, someone added one and the mapping should carry it.
  const d = draftFromRows({ profile: PROFILE, projects: [] });
  d.shortLine = { en: 'Since 2014', ar: 'منذ 2014' };
  d.action = { destination: 'noura@example.com' };
  const back = draftFromRows({ profile: rowsFromDraft(d).profile, projects: [] });
  assert.deepEqual(back.shortLine, { en: '', ar: '' });
  assert.equal(back.action.destination, '');
});

test('hasContent separates "has a row" from "has content"', () => {
  // An owner-created tenant has a profile row before the client ever signs in.
  assert.equal(hasContent({ profile: {}, projects: [] }), false);
  assert.equal(hasContent({ profile: { name: { en: '', ar: '' } }, projects: [] }), false);
  assert.equal(hasContent({ profile: { name: { en: 'Noura', ar: '' } }, projects: [] }), true);
  assert.equal(hasContent({ profile: {}, projects: [{ id: 1, title: { en: 'x', ar: '' } }] }), true);
});

test('a tenant with no projects still gets its first-run slots', () => {
  const d = withFirstRunSlots(draftFromRows({ profile: PROFILE, projects: [] }));
  assert.equal(d.pieces.length, 3);
  assert.ok(d.pieces.every((p) => p.empty));
  // Negative ids mark slots that do not exist in the database yet.
  assert.ok(d.pieces.every((p) => p.id < 0));
});

test('a tenant with some projects is topped up, not overwritten', () => {
  const d = withFirstRunSlots(draftFromRows({ profile: PROFILE, projects: PROJECTS }));
  assert.equal(d.pieces.length, 3);
  assert.deepEqual(d.pieces.slice(0, 2).map((p) => p.id), [3, 7]);
  assert.ok(d.pieces[2].id < 0);
});

test('a full portfolio is left alone', () => {
  const many = [0, 1, 2, 3].map((i) => ({ id: i + 1, title: { en: `p${i}`, ar: '' }, display_order: i }));
  const d = withFirstRunSlots(draftFromRows({ profile: PROFILE, projects: many }));
  assert.equal(d.pieces.length, 4);
});
