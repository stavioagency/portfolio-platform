// The client's FIRST DRAFT — what exists the moment they arrive in the Studio,
// before they have typed anything.
//
// THE DECISION THIS IMPLEMENTS (Feras, product decision, not derivable from the
// docs): the first draft carries their name, their professional title, their
// photo if we have one, their bio, their contact and social links if we have
// them, and THREE EMPTY PIECE SLOTS ready to fill.
//
// WHY IT IS A SEED AND NOT A GENERATOR. Nothing here invents words. Every text
// field is either something the client already gave us at signup or an empty
// bilingual pair. The constitution's promise that "the first draft is created
// for them — they never start from nothing" is kept by the STRUCTURE being
// there, not by a machine writing their bio and asking them to approve it. A
// generated sentence a person did not write is a suggestion, and suggestions
// are a separate, reviewable thing (`bioIsSuggestion`, editor.js) — never the
// silent default.
//
// HOW THIS SITS WITH THE BLUEPRINT. §5.4 and §6.2 specify that an EMPTY client
// sees "the three-step first run. Nothing else on the page" — name, photo,
// first project. That is a rule about the SCREEN. This module is a rule about
// the DRAFT. Both hold at once: the draft is seeded here, and Overview still
// renders the three-step first run for whatever is still missing. `firstRunSteps`
// below is what tells it which of the three are done.
//
// THE THREE EMPTY SLOTS ARE NOT THREE BLANK BOXES. Design law 4: absence is
// always worded. A slot carries `empty: true` so the renderer can say what it
// is for; it must never paint an unexplained grey rectangle. Three, because
// blueprint §5.6 tells a client that "three to six is a portfolio" — the number
// is the smallest one the product is willing to call finished, which makes it
// a target rather than a chore.
//
// Pure and dependency-free, like the rest of lib/studio. See
// tests/studio-first-draft.test.mjs.

const bi = (en = '', ar = '') => ({ en, ar });

// The count comes from the blueprint's own advice to the client. Changing it
// changes what the product considers a starting point, so it is named.
export const FIRST_RUN_SLOTS = 3;

// Presentation defaults. These match mockEmpty() so a seeded draft and an empty
// one are the same shape, and so `applyDirection` has something to replace.
const DEFAULT_APPEARANCE = { accent: 'royal', font: 'manrope', density: 'roomy' };

function emptySlots(n = FIRST_RUN_SLOTS) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: bi(),
    description: bi(),
    cover: null,
    link: '',
    // Read by the renderer to word the absence rather than paint a blank card.
    empty: true,
  }));
}

// Accepts whatever signup actually captured. Every field is optional, because
// the only one signup guarantees is a name — and even that can arrive blank
// from an owner-created workspace.
//
// `signup` may carry either a bilingual { en, ar } or a plain string; a plain
// string is written to BOTH languages, because a person who typed their name
// once has not told us it differs by language, and showing an empty Arabic
// name next to a filled English one reads as a bug rather than as a choice.
export function firstDraft(signup = {}) {
  const text = (v) => {
    if (!v) return bi();
    if (typeof v === 'string') return bi(v, v);
    return bi(v.en || '', v.ar || '');
  };

  return {
    name: text(signup.name),
    title: text(signup.title),
    bio: text(signup.bio),
    shortLine: bi(),
    // Nothing here was written by a machine, so nothing is awaiting review.
    bioIsSuggestion: false,
    photo: signup.photo || null,
    appearance: { ...DEFAULT_APPEARANCE },
    links: Array.isArray(signup.links) ? signup.links.filter(Boolean) : [],
    action: { destination: signup.contact || '' },
    pieces: emptySlots(),
  };
}

// Has the client put anything of their own into this field yet?
function filled(field) {
  const f = field || {};
  return Boolean((f.en || '').trim() || (f.ar || '').trim());
}

// A piece counts once it has a name OR a cover. A slot with neither is still
// the slot we handed them.
export function pieceStarted(piece) {
  if (!piece) return false;
  return filled(piece.name) || Boolean(piece.cover);
}

// The three-step first run, blueprint §5.4: name -> photo -> first project, in
// that order and for that reason — "an unnamed portfolio does not render at
// all. It is the one field with a structural consequence, so it is the one we
// ask for first."
//
// Returns every step with its done state, so the screen can show all three at
// once (the blueprint shows three steps, not one at a time) while still knowing
// which one is next.
export function firstRunSteps(draft) {
  const d = draft || {};
  const steps = [
    { id: 'name', field: 'name', done: filled(d.name) },
    { id: 'photo', field: 'photo', done: Boolean(d.photo) },
    { id: 'piece', field: 'pieces', done: (d.pieces || []).some(pieceStarted) },
  ];
  const next = steps.find((s) => !s.done) || null;
  return { steps, next: next ? next.id : null, complete: steps.every((s) => s.done) };
}

// Is this draft still the untouched thing we handed them? Used by Overview to
// decide between the three-step first run and the normal screen (§6.2's first
// two rows). Deliberately NOT "are all three steps done" — a client who has
// added a bio but no photo has started, and showing them a blank-slate screen
// would discard what they just did.
export function isUntouched(draft) {
  const d = draft || {};
  if (filled(d.title) || filled(d.bio) || filled(d.shortLine)) return false;
  if (d.photo) return false;
  if ((d.links || []).length) return false;
  if ((d.pieces || []).some(pieceStarted)) return false;
  // The name alone does not count as touched: it is seeded from signup rather
  // than typed here, so a seeded name must not skip the first run.
  return true;
}
