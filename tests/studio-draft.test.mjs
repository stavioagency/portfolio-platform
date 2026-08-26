// Regression tests for the Studio draft logic (lib/studio/draft.js).
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// These lock in the rules that make staged publishing safe and the attention
// queue supportive rather than corrective:
//   * draft vs published is the ONLY definition of "a change"
//   * both languages of one field count as one change, not two
//   * the unpublished-changes guard is never skippable
//   * the queue is finite and genuinely empties
//   * a never-published portfolio reports no count, because a first publish
//     is an activation and not a set of edits
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diff,
  changeSummary,
  queueItems,
  isSkippable,
  publishState,
  unreviewedSuggestions,
  QUEUE_IDS,
} from '../lib/studio/draft.js';

const bi = (en, ar) => ({ en, ar });

const portfolio = (over = {}) => ({
  name: bi('Noura Al-Harbi', 'نورة الحربي'),
  title: bi('Photographer, Riyadh', 'مصوّرة، الرياض'),
  bio: bi('I photograph people unhurried.', 'أصوّر الناس دون استعجال.'),
  bioIsSuggestion: false,
  appearance: { accent: 'royal', banner: 'plain', font: 'manrope', density: 'roomy' },
  pieces: [
    { id: 1, name: bi('Layla, at home', 'ليلى، في البيت'), cover: 'a.jpg' },
    { id: 2, name: bi('Souq mornings', 'صباحات السوق'), cover: 'b.jpg' },
  ],
  ...over,
});

// =========================================================
// diff
// =========================================================

test('identical draft and published is no change', () => {
  const p = portfolio();
  assert.deepEqual(diff(p, portfolio()), { count: 0, parts: [] });
});

test('a bilingual field edited in one language counts once, not twice', () => {
  const published = portfolio();
  const draft = portfolio({ bio: bi('A new English bio.', 'أصوّر الناس دون استعجال.') });
  const { count, parts } = diff(draft, published);
  assert.equal(count, 1, 'one field edited is one change');
  assert.deepEqual(parts, ['bio']);
});

test('editing BOTH languages of one field is still one change', () => {
  const published = portfolio();
  const draft = portfolio({ bio: bi('New English.', 'نص عربي جديد.') });
  assert.equal(diff(draft, published).count, 1);
});

test('adding a piece counts as one change', () => {
  const published = portfolio();
  const draft = portfolio();
  draft.pieces = [...draft.pieces, { id: 3, name: bi('New', 'جديد'), cover: 'c.jpg' }];
  const { count, parts } = diff(draft, published);
  assert.equal(count, 1);
  assert.deepEqual(parts, ['piece']);
});

test('removing a piece counts as one change', () => {
  const published = portfolio();
  const draft = portfolio();
  draft.pieces = draft.pieces.slice(0, 1);
  assert.deepEqual(diff(draft, published), { count: 1, parts: ['piece'] });
});

test('renaming a piece counts as one change', () => {
  const published = portfolio();
  const draft = portfolio();
  draft.pieces[0].name = bi('Layla, at dusk', 'ليلى، عند الغروب');
  assert.deepEqual(diff(draft, published), { count: 1, parts: ['piece'] });
});

test('several appearance knobs moved is ONE change, not four', () => {
  const published = portfolio();
  const draft = portfolio({
    appearance: { accent: 'ink', banner: 'full', font: 'reem', density: 'tight' },
  });
  assert.deepEqual(diff(draft, published), { count: 1, parts: ['appearance'] });
});

test('trying an accent and settling back on the original is zero changes', () => {
  const published = portfolio();
  const draft = portfolio();          // same values, arrived at differently
  assert.equal(diff(draft, published).count, 0);
});

test('a never-published portfolio reports no count', () => {
  // A first publish is an activation, not a set of edits. The interface says
  // "Only you can see this", never a number.
  assert.deepEqual(diff(portfolio(), null), { count: 0, parts: [] });
});

// =========================================================
// changeSummary
// =========================================================

test('one change reads as a bare phrase', () => {
  assert.equal(changeSummary(['bio'], 'en'), 'your bio');
});

test('two changes are joined with "and", never a count', () => {
  const s = changeSummary(['bio', 'piece'], 'en');
  assert.equal(s, 'your bio, and 1 piece');
  assert.ok(!/\d\s+changes/.test(s), 'the summary names things, it does not tally them');
});

test('several pieces collapse into one phrase', () => {
  assert.equal(changeSummary(['piece', 'piece', 'piece'], 'en'), '3 pieces');
});

test('summary orders phrases as the client thinks, not as diff found them', () => {
  const s = changeSummary(['piece', 'bio', 'name'], 'en');
  assert.equal(s, 'your name, your bio, and 1 piece');
});

test('Arabic summary uses Latin numerals and Arabic joiners', () => {
  const s = changeSummary(['bio', 'piece', 'piece'], 'ar');
  assert.ok(s.includes('2'), 'Latin numerals in both locales');
  assert.ok(s.includes('النبذة'));
  assert.ok(!s.includes(','), 'Arabic uses ، not a Latin comma');
});

test('an empty change list produces no summary', () => {
  assert.equal(changeSummary([], 'en'), '');
});

// =========================================================
// queueItems
// =========================================================

test('an empty portfolio says one thing only', () => {
  const draft = portfolio({ pieces: [] });
  const items = queueItems(draft);
  assert.equal(items.length, 1, 'a blank page must not be stacked with noise');
  assert.equal(items[0].id, QUEUE_IDS.ADD_WORK);
});

test('an AI bio the client has not touched is offered, not flagged', () => {
  const draft = portfolio({ bioIsSuggestion: true });
  const items = queueItems(draft);
  assert.ok(items.some((i) => i.id === QUEUE_IDS.BIO_SUGGESTION));
});

test('accepting the bio suggestion clears its item', () => {
  const draft = portfolio({ bioIsSuggestion: false });
  assert.ok(!queueItems(draft).some((i) => i.id === QUEUE_IDS.BIO_SUGGESTION));
});

test('unnamed pieces are counted, not listed one by one', () => {
  const draft = portfolio();
  draft.pieces = [
    { id: 1, name: bi('', ''), cover: 'a.jpg' },
    { id: 2, name: bi('', ''), cover: 'b.jpg' },
    { id: 3, name: bi('Named', 'مسمّى'), cover: 'c.jpg' },
  ];
  const item = queueItems(draft).find((i) => i.id === QUEUE_IDS.UNNAMED_PIECES);
  assert.ok(item);
  assert.equal(item.count, 2, 'one item carrying a count, not one item per piece');
});

test('whitespace is not a name', () => {
  const draft = portfolio();
  draft.pieces = [{ id: 1, name: bi('   ', '  '), cover: 'a.jpg' }];
  const item = queueItems(draft).find((i) => i.id === QUEUE_IDS.UNNAMED_PIECES);
  assert.equal(item.count, 1);
});

test('a piece named in only one language does not nag', () => {
  // Bilingual completeness is a separate concern. Having named the work at all
  // is enough to clear this item.
  const draft = portfolio();
  draft.pieces = [{ id: 1, name: bi('Layla', ''), cover: 'a.jpg' }];
  assert.ok(!queueItems(draft).some((i) => i.id === QUEUE_IDS.UNNAMED_PIECES));
});

test('skipping an item removes it', () => {
  const draft = portfolio({ bioIsSuggestion: true });
  const items = queueItems(draft, { skipped: [QUEUE_IDS.BIO_SUGGESTION] });
  assert.ok(!items.some((i) => i.id === QUEUE_IDS.BIO_SUGGESTION));
});

test('the queue genuinely empties', () => {
  // A queue that always has something in it becomes wallpaper.
  const draft = portfolio({ bioIsSuggestion: false });
  assert.deepEqual(queueItems(draft, { published: portfolio() }), []);
});

test('unpublished changes appear in the queue when the draft is ahead', () => {
  const published = portfolio();
  const draft = portfolio({ bio: bi('Rewritten.', 'أعيدت صياغتها.') });
  const item = queueItems(draft, { published }).find((i) => i.id === QUEUE_IDS.UNPUBLISHED);
  assert.ok(item, 'this item is what makes staged publishing safe');
  assert.equal(item.count, 1);
});

test('the unpublished-changes guard is NOT skippable', () => {
  // Skipping it would recreate exactly the risk it exists to remove: a client
  // editing for a week while visitors see last month's portfolio.
  const published = portfolio();
  const draft = portfolio({ bio: bi('Rewritten.', 'أعيدت صياغتها.') });
  const item = queueItems(draft, { published, skipped: [QUEUE_IDS.UNPUBLISHED] })
    .find((i) => i.id === QUEUE_IDS.UNPUBLISHED);
  assert.ok(item, 'the guard must survive being skipped');
  assert.equal(isSkippable(item), false);
});

test('every other item is skippable', () => {
  const draft = portfolio({ bioIsSuggestion: true });
  for (const item of queueItems(draft)) {
    assert.equal(isSkippable(item), true, `${item.id} should be skippable`);
  }
});

// =========================================================
// publishState
// =========================================================

test('never published', () => {
  assert.equal(publishState(portfolio(), null), 'never');
});

test('draft ahead of published', () => {
  const draft = portfolio({ title: bi('Portrait photographer', 'مصوّرة بورتريه') });
  assert.equal(publishState(draft, portfolio()), 'ahead');
});

test('draft and published agree', () => {
  assert.equal(publishState(portfolio(), portfolio()), 'synced');
});

test('offline wins over everything — the snapshot exists but is not served', () => {
  const draft = portfolio({ bio: bi('changed', 'تغيّرت') });
  assert.equal(publishState(draft, portfolio(), { offline: true }), 'offline');
});

// =========================================================
// unreviewedSuggestions
// =========================================================

test('untouched AI copy is counted so it cannot slip out unnoticed', () => {
  assert.equal(unreviewedSuggestions(portfolio({ bioIsSuggestion: true })), 1);
  assert.equal(unreviewedSuggestions(portfolio()), 0);
});
