// The first draft a client meets, and the three-step first run over it.
// Zero dependencies — run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  firstDraft, firstRunSteps, isUntouched, pieceStarted, FIRST_RUN_SLOTS,
} from '../lib/studio/first-draft.js';

test('the first draft carries exactly what the decision says it carries', () => {
  const d = firstDraft({
    name: 'Noura Al-Harbi',
    title: { en: 'Photographer', ar: 'مصوّرة' },
    bio: { en: 'I photograph people.', ar: 'أصوّر الناس.' },
    photo: 'https://example.com/n.jpg',
    links: [{ id: 'instagram', label: 'Instagram', url: 'https://instagram.com/noura' }],
    contact: 'noura@example.com',
  });
  assert.equal(d.name.en, 'Noura Al-Harbi');
  assert.equal(d.title.ar, 'مصوّرة');
  assert.equal(d.bio.en, 'I photograph people.');
  assert.equal(d.photo, 'https://example.com/n.jpg');
  assert.equal(d.links.length, 1);
  assert.equal(d.action.destination, 'noura@example.com');
  assert.equal(d.pieces.length, FIRST_RUN_SLOTS);
});

test('a plain-string name is written to BOTH languages', () => {
  // A person who typed their name once has not told us it differs by language,
  // and a blank Arabic name beside a filled English one reads as a bug.
  const d = firstDraft({ name: 'Noura' });
  assert.equal(d.name.en, 'Noura');
  assert.equal(d.name.ar, 'Noura');
});

test('nothing is invented — every unprovided field is empty, not generated', () => {
  const d = firstDraft({ name: 'Noura' });
  assert.deepEqual(d.title, { en: '', ar: '' });
  assert.deepEqual(d.bio, { en: '', ar: '' });
  assert.equal(d.photo, null);
  assert.deepEqual(d.links, []);
  // And nothing is awaiting review, because nothing was written for them.
  assert.equal(d.bioIsSuggestion, false);
});

test('an empty signup still produces a usable draft', () => {
  const d = firstDraft();
  assert.equal(d.pieces.length, FIRST_RUN_SLOTS);
  assert.ok(d.appearance.accent, 'appearance must have defaults to render at all');
  assert.deepEqual(d.name, { en: '', ar: '' });
});

test('the three slots are WORDED absences, never blank boxes', () => {
  // Design law 4: absence is always worded. The renderer needs a flag to say
  // what the slot is for; without it the only honest option is a grey square.
  const d = firstDraft();
  assert.ok(d.pieces.every((p) => p.empty === true));
  assert.ok(d.pieces.every((p) => p.cover === null));
  assert.deepEqual(d.pieces.map((p) => p.id), [1, 2, 3]);
});

test('a slot counts as started by a name OR a cover, not by existing', () => {
  assert.equal(pieceStarted({ name: { en: '', ar: '' }, cover: null }), false);
  assert.equal(pieceStarted({ name: { en: 'Layla', ar: '' }, cover: null }), true);
  assert.equal(pieceStarted({ name: { en: '', ar: '' }, cover: 'x.jpg' }), true);
  assert.equal(pieceStarted(null), false);
});

test('the first run is name -> photo -> first project, in that order', () => {
  // Blueprint §5.4: name first because an unnamed portfolio does not render.
  const { steps } = firstRunSteps(firstDraft());
  assert.deepEqual(steps.map((s) => s.id), ['name', 'photo', 'piece']);
});

test('the next step is the first unfinished one', () => {
  assert.equal(firstRunSteps(firstDraft()).next, 'name');
  assert.equal(firstRunSteps(firstDraft({ name: 'Noura' })).next, 'photo');
  assert.equal(firstRunSteps(firstDraft({ name: 'Noura', photo: 'p.jpg' })).next, 'piece');
});

test('the first run completes only when all three are done', () => {
  const d = firstDraft({ name: 'Noura', photo: 'p.jpg' });
  assert.equal(firstRunSteps(d).complete, false);
  d.pieces[0].name = { en: 'Layla, at home', ar: 'ليلى، في البيت' };
  const done = firstRunSteps(d);
  assert.equal(done.complete, true);
  assert.equal(done.next, null);
});

test('a seeded NAME alone does not count as touched', () => {
  // It came from signup, not from this screen. Counting it would skip the very
  // first run the blueprint calls the most important screen in the product.
  assert.equal(isUntouched(firstDraft({ name: 'Noura' })), true);
});

test('anything the client actually did makes the draft touched', () => {
  const cases = [
    (d) => { d.title = { en: 'Photographer', ar: '' }; },
    (d) => { d.bio = { en: '', ar: 'أصوّر الناس.' }; },
    (d) => { d.photo = 'p.jpg'; },
    (d) => { d.links = [{ id: 'x', url: 'y' }]; },
    (d) => { d.pieces[0].name = { en: 'Layla', ar: '' }; },
  ];
  for (const mutate of cases) {
    const d = firstDraft({ name: 'Noura' });
    mutate(d);
    assert.equal(isUntouched(d), false, 'this edit should have counted as touched');
  }
});

test('firstDraft returns a fresh object every call', () => {
  // A shared pieces array would let one client's edit leak into the next.
  const a = firstDraft();
  const b = firstDraft();
  a.pieces[0].name = { en: 'edited', ar: '' };
  a.appearance.accent = 'changed';
  assert.deepEqual(b.pieces[0].name, { en: '', ar: '' });
  assert.notEqual(b.appearance.accent, 'changed');
});
