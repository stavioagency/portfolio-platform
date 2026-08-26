// Regression tests for the Studio editor logic (lib/studio/editor.js).
// Zero dependencies — run with: npm test   (Node's built-in test runner)
//
// These lock in the rules that keep the editor from becoming a CMS:
//   * clicking the work AREA reveals; it never opens a management screen
//   * the Index has four entries and `work` opens no panel
//   * ordering is curation — explicit moves, no drag, no-ops return the
//     original reference so a dead click cannot invent an unpublished change
//   * a direction change never touches content
//   * a suggestion expires on contact
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PANELS,
  INDEX_ENTRIES,
  intentForField,
  intentForIndex,
  canMoveEarlier,
  canMoveLater,
  moveEarlier,
  moveLater,
  setField,
  setPieceField,
  updatePiece,
  setLook,
  hasSuggestion,
  keepSuggestion,
  replaceSuggestion,
  applyDirection,
  defaultLookMode,
  LOOK_MODES,
  LOOK_CONTROLS,
  actionHref,
  hasNextStep,
  setActionDestination,
} from '../lib/studio/editor.js';

const bi = (en, ar) => ({ en, ar });
const draft = () => ({
  name: bi('Noura Al-Harbi', 'نورة الحربي'),
  title: bi('Photographer', 'مصوّرة'),
  bio: bi('An introduction.', 'نبذة.'),
  bioIsSuggestion: true,
  appearance: { accent: 'royal', banner: 'plain', font: 'manrope', density: 'roomy' },
  pieces: [
    { id: 1, name: bi('One', 'واحد') },
    { id: 2, name: bi('Two', 'اثنان') },
    { id: 3, name: bi('Three', 'ثلاثة') },
  ],
});

// =========================================================
// A click becomes an intent
// =========================================================

test('clicking identity text opens You, focused on what was clicked', () => {
  for (const field of ['name', 'title', 'bio', 'photo']) {
    assert.deepEqual(intentForField(field), { panel: PANELS.YOU, focus: field });
  }
});

test('clicking a piece opens that piece', () => {
  assert.deepEqual(intentForField('piece:4'), {
    panel: PANELS.PIECE, pieceId: 4, focus: 'name',
  });
});

test('clicking the WORK AREA reveals the work and opens nothing', () => {
  // The rule that keeps this from becoming a content manager: there is nothing
  // to edit about "the work" as a whole, so there is no panel for it.
  assert.deepEqual(intentForField('pieces'), { reveal: 'pieces' });
});

test('the portfolio root is not a target', () => {
  assert.equal(intentForField('portfolio'), null);
});

test('an unknown or malformed field is ignored, never guessed at', () => {
  assert.equal(intentForField('published_at'), null);
  assert.equal(intentForField('piece:banana'), null);
  assert.equal(intentForField(''), null);
  assert.equal(intentForField(null), null);
  assert.equal(intentForField(undefined), null);
});

// =========================================================
// The Index
// =========================================================

test('the Index has exactly four entries', () => {
  // A fifth entry is not a UI decision — it means a new kind of content
  // exists. If this test fails, stop and make that decision deliberately.
  assert.equal(INDEX_ENTRIES.length, 4);
  assert.deepEqual(INDEX_ENTRIES, ['you', 'work', 'links', 'look']);
});

test('choosing Work reveals the portfolio and opens NO panel', () => {
  const intent = intentForIndex('work');
  assert.deepEqual(intent, { reveal: 'pieces' });
  assert.equal(intent.panel, undefined, 'Work must never open a management destination');
});

test('the other Index entries open their panel', () => {
  assert.equal(intentForIndex('you').panel, PANELS.YOU);
  assert.equal(intentForIndex('links').panel, PANELS.LINKS);
  assert.equal(intentForIndex('look').panel, PANELS.LOOK);
});

test('an unknown Index entry is ignored', () => {
  assert.equal(intentForIndex('settings'), null);
});

// =========================================================
// Ordering — curation, not layout
// =========================================================

test('a piece moves earlier and later', () => {
  const pieces = draft().pieces;
  assert.deepEqual(moveEarlier(pieces, 2).map((p) => p.id), [2, 1, 3]);
  assert.deepEqual(moveLater(pieces, 2).map((p) => p.id), [1, 3, 2]);
});

test('the first piece cannot move earlier and the last cannot move later', () => {
  const pieces = draft().pieces;
  assert.equal(canMoveEarlier(pieces, 1), false);
  assert.equal(canMoveLater(pieces, 3), false);
  assert.equal(canMoveEarlier(pieces, 2), true);
  assert.equal(canMoveLater(pieces, 2), true);
});

test('an impossible move returns the ORIGINAL array, not a copy', () => {
  // Identity matters: a caller treats a new reference as a change. If a dead
  // click at the end of the list produced a copy, the draft would look dirty
  // and the client would be told they have an unpublished change they never
  // made.
  const pieces = draft().pieces;
  assert.equal(moveEarlier(pieces, 1), pieces);
  assert.equal(moveLater(pieces, 3), pieces);
});

test('moving an unknown piece changes nothing', () => {
  const pieces = draft().pieces;
  assert.equal(moveEarlier(pieces, 99), pieces);
  assert.equal(canMoveEarlier(pieces, 99), false);
  assert.equal(canMoveLater(pieces, 99), false);
});

test('ordering never mutates the array it was given', () => {
  const pieces = draft().pieces;
  const before = pieces.map((p) => p.id);
  moveLater(pieces, 1);
  assert.deepEqual(pieces.map((p) => p.id), before);
});

// =========================================================
// Editing values
// =========================================================

test('editing one language leaves the other alone', () => {
  const next = setField(draft(), 'bio', 'en', 'A new introduction.');
  assert.equal(next.bio.en, 'A new introduction.');
  assert.equal(next.bio.ar, 'نبذة.', 'the Arabic must survive an English edit');
});

test('editing a piece touches only that piece', () => {
  const next = setPieceField(draft(), 2, 'name', 'en', 'Renamed');
  assert.equal(next.pieces[1].name.en, 'Renamed');
  assert.equal(next.pieces[0].name.en, 'One');
  assert.equal(next.pieces[2].name.en, 'Three');
});

test('editing an unknown piece changes nothing', () => {
  const d = draft();
  assert.equal(setPieceField(d, 99, 'name', 'en', 'x'), d);
});

test('a look change is merged, not replaced', () => {
  const next = setLook(draft(), 'accent', 'olive');
  assert.equal(next.appearance.accent, 'olive');
  assert.equal(next.appearance.density, 'roomy', 'the other settings must survive');
});

test('editing never mutates the draft it was given', () => {
  const d = draft();
  setField(d, 'name', 'en', 'Someone else');
  updatePiece(d, 1, { name: bi('x', 'x') });
  setLook(d, 'accent', 'ink');
  assert.equal(d.name.en, 'Noura Al-Harbi');
  assert.equal(d.pieces[0].name.en, 'One');
  assert.equal(d.appearance.accent, 'royal');
});

// =========================================================
// Suggestions expire on contact
// =========================================================

test('keeping a suggestion clears the marker and keeps the words', () => {
  const d = draft();
  assert.equal(hasSuggestion(d, 'bio'), true);
  const next = keepSuggestion(d, 'bio');
  assert.equal(hasSuggestion(next, 'bio'), false);
  assert.equal(next.bio.en, 'An introduction.', 'keeping must not alter the text');
});

test('writing your own replaces the words and ends the offer in one step', () => {
  const next = replaceSuggestion(draft(), 'bio', 'en', 'My own words.');
  assert.equal(next.bio.en, 'My own words.');
  assert.equal(hasSuggestion(next, 'bio'), false);
});

test('a field with no suggestion is unaffected', () => {
  const d = draft();
  assert.equal(hasSuggestion(d, 'name'), false);
  assert.equal(keepSuggestion(d, 'name'), d);
});

// =========================================================
// Direction is a creative reset, and presentation only
// =========================================================

test('the Look panel opens on controls, never on the directions', () => {
  assert.equal(defaultLookMode(), LOOK_MODES.CONTROLS);
});

test('applying a direction changes presentation and NOTHING the client wrote', () => {
  const d = draft();
  const next = applyDirection(d, {
    appearance: { accent: 'sand', font: 'reem', density: 'tight' },
  });
  assert.equal(next.appearance.accent, 'sand');
  assert.equal(next.appearance.font, 'reem');
  // The load-bearing assertion. A direction change must never overwrite words.
  assert.deepEqual(next.name, d.name);
  assert.deepEqual(next.title, d.title);
  assert.deepEqual(next.bio, d.bio);
  assert.deepEqual(next.pieces, d.pieces);
});

test('a direction carrying content is ignored, not trusted', () => {
  const d = draft();
  const next = applyDirection(d, {
    appearance: { accent: 'ink' },
    bio: bi('Written by the direction', 'كتبها الاتجاه'),
  });
  assert.deepEqual(next.bio, d.bio, 'only appearance is read off a direction');
});

test('an empty direction is a no-op', () => {
  const d = draft();
  assert.equal(applyDirection(d, null), d);
  assert.equal(applyDirection(d, {}), d);
});

// =========================================================
// The option sets stay small
// =========================================================

test('every Look control offers a short, closed list', () => {
  // This is where "not a website builder" is honoured or lost. If one of these
  // grows past a handful, the panel has become a settings screen.
  for (const [key, options] of Object.entries(LOOK_CONTROLS)) {
    assert.ok(options.length >= 2, `${key} needs a choice to be worth showing`);
    assert.ok(options.length <= 5, `${key} has grown too long: ${options.length}`);
  }
});

// =========================================================
// The next step
// =========================================================
// docs/design/next-step.md — one primary action, destination only.

test('an email destination becomes a mailto link', () => {
  assert.equal(actionHref('noura@example.com'), 'mailto:noura@example.com');
});

test('a URL destination is used as given', () => {
  assert.equal(actionHref('https://cal.com/noura'), 'https://cal.com/noura');
});

test('an empty destination means the portfolio has no next step', () => {
  // Sections come from content, never a toggle. There is no "show the button"
  // switch, so an empty destination IS the off state — and a portfolio without
  // a next step is complete, not unfinished.
  for (const empty of ['', '   ', null, undefined]) {
    assert.equal(actionHref(empty), '');
    assert.equal(hasNextStep({ action: { destination: empty } }), false);
  }
  assert.equal(hasNextStep({}), false);
  assert.equal(hasNextStep(null), false);
});

test('a destination is whitespace-trimmed before it is shaped', () => {
  assert.equal(actionHref('  noura@example.com  '), 'mailto:noura@example.com');
});

test('setting the destination leaves the rest of the draft alone', () => {
  const d = { name: bi('Noura', 'نورة'), action: { destination: '' } };
  const next = setActionDestination(d, 'hello@studio.com');
  assert.equal(next.action.destination, 'hello@studio.com');
  assert.deepEqual(next.name, d.name);
  assert.equal(d.action.destination, '', 'the original must not mutate');
});

test('clicking the next step opens the Links panel, not a fifth panel', () => {
  // Four panels is the whole set. A fifth would mean a new KIND of content.
  assert.deepEqual(intentForField('action'), { panel: PANELS.LINKS, focus: null });
  assert.equal(INDEX_ENTRIES.length, 4);
});
