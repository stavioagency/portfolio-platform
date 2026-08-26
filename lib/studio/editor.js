// Studio editor logic — a pure module, kept out of the components so every
// rule about what opens, what moves and what a click means can be unit-tested
// without React. See tests/studio-editor.test.mjs.
//
// Companion to lib/studio/draft.js, which owns "what has changed" and "what is
// waiting". This one owns "what am I editing".
//
// The governing rule of the whole editor, from the interaction model:
//
//     The portfolio remains the navigation surface.
//
// There is no section tree, no page list and no list of pieces. A client
// navigates by looking at their own site and touching part of it. Everything
// below exists to serve that and nothing else.

// Explicit extension: this module is covered by `node --test`, whose ESM
// resolver does not guess extensions the way webpack does. Next resolves the
// same specifier happily.
import { setLangValue } from '../i18n.js';

// =========================================================
// Panels
// =========================================================
// FOUR. Not five, and not a growing list. Each mirrors a part of the content
// model in blueprint §9, so adding a panel would mean a new kind of content
// exists — a product decision, made deliberately and elsewhere, never a UI
// convenience.
export const PANELS = {
  YOU: 'you',
  PIECE: 'piece',
  LINKS: 'links',
  LOOK: 'look',
};

// =========================================================
// A click on the portfolio becomes an intent
// =========================================================
// The renderer stamps `data-field` on its regions and the preview host reports
// which one was clicked. This turns that name into what the Studio should do.
//
// Returns one of:
//   { panel, focus }            open a panel, put the caret on a field
//   { panel: PANELS.PIECE, pieceId, focus }
//   { reveal }                  scroll the portfolio to a region, open nothing
//   null                        not a target
export function intentForField(field) {
  if (!field || typeof field !== 'string') return null;

  // The root is the page itself, not a thing to edit.
  if (field === 'portfolio') return null;

  if (field.startsWith('piece:')) {
    const pieceId = Number(field.slice('piece:'.length));
    if (!Number.isFinite(pieceId)) return null;
    return { panel: PANELS.PIECE, pieceId, focus: 'name' };
  }

  switch (field) {
    case 'name':
    case 'title':
    case 'bio':
    case 'photo':
    // The short line annotates the introduction, so it is edited beside it.
    case 'shortLine':
      return { panel: PANELS.YOU, focus: field };
    case 'links':
    // The next step is edited in the Links panel — the panel about how people
    // reach the client. It does not get a fifth panel: four is the whole set,
    // and a new panel would mean a new KIND of content rather than one more
    // field.
    case 'action':
      return { panel: PANELS.LINKS, focus: null };
    // Clicking the work AREA rather than a piece reveals the work; it does not
    // open a panel. There is nothing to edit about "the work" as a whole —
    // pieces are edited one at a time — and a panel here would be the first
    // step towards a content manager.
    case 'pieces':
      return { reveal: 'pieces' };
    default:
      return null;
  }
}

// =========================================================
// The Index
// =========================================================
// A lightweight way to find editing areas, for anyone who does not guess that
// the portfolio is clickable. It is NOT navigation: it does not persist, it
// highlights no current location, and nothing routes to it.
//
// FOUR ENTRIES. If this ever needs a fifth, a scrollbar, a group heading or a
// second level, we are rebuilding the section nav that was deliberately
// removed, and the correct response is to stop rather than to extend it.
export const INDEX_ENTRIES = ['you', 'work', 'links', 'look'];

// What choosing an Index entry does. Note that `work` REVEALS rather than
// opening anything — the portfolio stays the navigation surface, and editing a
// piece happens by touching that piece.
export function intentForIndex(entry) {
  switch (entry) {
    case 'you':
      return { panel: PANELS.YOU, focus: 'name' };
    case 'links':
      return { panel: PANELS.LINKS, focus: null };
    case 'look':
      return { panel: PANELS.LOOK, focus: null };
    case 'work':
      return { reveal: 'pieces' };
    default:
      return null;
  }
}

// =========================================================
// Ordering
// =========================================================
//
//     Ordering is curation, not layout control.
//
// The client sequences their work with explicit moves. There is no drag: a
// drag handle invites the builder expectations this model exists to avoid, and
// it is the one control that must work under a thumb.

export function canMoveEarlier(pieces, id) {
  const i = indexOfPiece(pieces, id);
  return i > 0;
}

export function canMoveLater(pieces, id) {
  const i = indexOfPiece(pieces, id);
  return i > -1 && i < (pieces || []).length - 1;
}

export function moveEarlier(pieces, id) {
  return swap(pieces, indexOfPiece(pieces, id), -1);
}

export function moveLater(pieces, id) {
  return swap(pieces, indexOfPiece(pieces, id), 1);
}

function indexOfPiece(pieces, id) {
  return (pieces || []).findIndex((p) => p.id === id);
}

// Returns a NEW array, or the original when the move is impossible. Returning
// the same reference matters: it lets a caller treat "nothing moved" as "no
// change", so an ineffective click cannot mark the draft dirty and invent an
// unpublished change out of nothing.
function swap(pieces, i, delta) {
  const list = pieces || [];
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return pieces;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// =========================================================
// Editing values
// =========================================================
// All of these return a NEW draft. Nothing mutates, so React sees a change and
// the preview channel has something to send.

// One bilingual field of the portfolio itself (name, title, bio).
export function setField(draft, field, lang, value) {
  return { ...draft, [field]: setLangValue(draft[field], lang, value) };
}

export function updatePiece(draft, id, patch) {
  return {
    ...draft,
    pieces: (draft.pieces || []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

export function setPieceField(draft, id, field, lang, value) {
  const piece = (draft.pieces || []).find((p) => p.id === id);
  if (!piece) return draft;
  return updatePiece(draft, id, { [field]: setLangValue(piece[field], lang, value) });
}

export function setLook(draft, key, value) {
  return { ...draft, appearance: { ...(draft.appearance || {}), [key]: value } };
}

// =========================================================
// Suggestions
// =========================================================
// A suggestion is an offer that expires on contact. It is never called "AI",
// never styled as a problem, and once it is kept or rewritten the marker is
// gone for good — a standing badge would tell the client their portfolio is
// not theirs.

const SUGGESTION_FLAGS = { bio: 'bioIsSuggestion', title: 'titleIsSuggestion' };

export function hasSuggestion(draft, field) {
  const flag = SUGGESTION_FLAGS[field];
  return !!(flag && draft && draft[flag]);
}

// Keeping the words as written. The text is already in the draft — that is how
// the first draft arrived — so this only clears the marker.
export function keepSuggestion(draft, field) {
  const flag = SUGGESTION_FLAGS[field];
  if (!flag) return draft;
  return { ...draft, [flag]: false };
}

// Writing your own replaces the words AND clears the marker in one step: the
// moment a client types, it is theirs and the offer is over.
export function replaceSuggestion(draft, field, lang, value) {
  return keepSuggestion(setField(draft, field, lang, value), field);
}

// =========================================================
// Look
// =========================================================
// The small, defensible set. Every option here is one we would defend in an
// agency presentation — this is where "not a website builder" is honoured or
// lost, so the lists are short and closed.
// The banner control was REMOVED, not shortened: the portfolio has no banner.
// A banner is an image placed above the work, competing with the work for the
// only currency that matters on the page, and the "one image that leads" role
// is already filled by the first piece. The concept survives only as a share
// image for link previews, which never renders on the page — see
// docs/design/share-image.md.
export const LOOK_CONTROLS = {
  accent: ['royal', 'ink', 'sand', 'olive'],
  font: ['manrope', 'reem'],
  density: ['roomy', 'tight'],
};

// The Look panel opens on the individual controls, NOT on the three
// directions.
//
// Choosing a direction is a creative reset, not a normal edit. Putting three
// whole-portfolio alternatives in front of someone who came to adjust one
// colour invites them to second-guess a decision they already made well — and
// a reset offered casually stops reading as a reset. So the directions appear
// only after the client deliberately asks for them.
export const LOOK_MODES = { CONTROLS: 'controls', DIRECTIONS: 'directions' };

export function defaultLookMode() {
  return LOOK_MODES.CONTROLS;
}

// A direction change is presentation-only: it may rewrite appearance, and it
// must never touch a content field. New wording arrives as a suggestion in the
// queue instead, which is what keeps "it never overwrites what you wrote" true
// in the data rather than only in the interface.
export function applyDirection(draft, direction) {
  if (!direction || !direction.appearance) return draft;
  return { ...draft, appearance: { ...(draft.appearance || {}), ...direction.appearance } };
}

// =========================================================
// The next step
// =========================================================
// The portfolio's single primary action. See docs/design/next-step.md.
//
// The client provides a DESTINATION and nothing else. There is no label, no
// style, no variant, no placement and no "enabled" — each of those would hand
// the client a decision the product should make once, well, for everyone, and
// the label especially: asking a photographer to write button copy invites
// "CLICK HERE!!" onto a page sold as premium.
//
// One destination, two shapes: an email address becomes a mailto: link, a URL
// is used as given. The client types where to reach them; working out which is
// which is the product's job, not theirs.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns the href to render, or '' when there is nothing to show. Sanitising
// happens at render via safeUrl(), as everywhere else — this only decides the
// SHAPE of what the client typed.
export function actionHref(destination) {
  const raw = String(destination == null ? '' : destination).trim();
  if (!raw) return '';
  if (EMAIL.test(raw)) return `mailto:${raw}`;
  return raw;
}

// Sections come from content, never toggles: an empty destination simply means
// the portfolio has no next step, which is a complete portfolio.
export function hasNextStep(portfolio) {
  return actionHref(portfolio && portfolio.action && portfolio.action.destination) !== '';
}

export function setActionDestination(draft, destination) {
  return { ...draft, action: { ...(draft.action || {}), destination } };
}
