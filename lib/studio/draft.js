// Studio draft logic — a pure module, kept out of the components so that every
// rule about "what has changed" and "what is waiting" can be unit-tested
// without React. See tests/studio-draft.test.mjs.
//
// This module is the decision layer for Studio Home. Components render what it
// returns; they never decide any of it themselves.
//
// Publishing model (blueprint §8.5): draft and published are SEPARATE states.
// Editing writes to the draft. Visitors see the published state until the
// client promotes it. Nothing here talks to a database, a network or React —
// it is functions over two plain objects.

// =========================================================
// What changed
// =========================================================
// A change is a difference between the draft and what visitors can currently
// see. The field list is deliberately explicit rather than a deep-diff: a
// generic diff would report churn the client never made (key order, undefined
// vs missing) and would silently start counting any field a future migration
// adds. Being explicit means a new field is a decision, not an accident.

const TEXT_FIELDS = ['name', 'title', 'bio', 'shortLine'];

// Bilingual fields are { ar, en }. Both languages count as ONE change: the
// client edited "their bio", not "their Arabic bio and their English bio".
function textChanged(a, b) {
  const x = a || {};
  const y = b || {};
  return (x.ar || '') !== (y.ar || '') || (x.en || '') !== (y.en || '');
}

function pieceChanged(a, b) {
  if (!a || !b) return true;
  return textChanged(a.name, b.name) ||
         textChanged(a.description, b.description) ||
         (a.cover || '') !== (b.cover || '') ||
         (a.link || '') !== (b.link || '');
}

// Appearance is one change however many knobs moved. A client who tries three
// accents and settles on the first has made zero changes, not six.
function appearanceChanged(a, b) {
  const x = a || {};
  const y = b || {};
  const keys = ['accent', 'font', 'density'];
  return keys.some((k) => (x[k] || '') !== (y[k] || ''));
}

// Returns { count, parts } where parts is a list of change kinds:
//   'bio' | 'title' | 'name' | 'appearance' | 'piece'
// 'piece' appears once per added, removed or edited piece.
//
// `published` may be null, meaning the portfolio has never been published. In
// that case there is nothing to compare against and nothing to publish *yet* —
// the first publish is an activation, not a set of changes — so the count is 0
// and the interface says "Only you can see this" rather than a number.
export function diff(draft, published) {
  const parts = [];
  if (!draft || !published) return { count: 0, parts };

  for (const field of TEXT_FIELDS) {
    if (textChanged(draft[field], published[field])) parts.push(field);
  }
  if (appearanceChanged(draft.appearance, published.appearance)) {
    parts.push('appearance');
  }
  const dest = (d) => ((d && d.action && d.action.destination) || '').trim();
  if (dest(draft) !== dest(published)) parts.push('action');

  const a = draft.pieces || [];
  const b = published.pieces || [];
  const byId = new Map(b.map((p) => [p.id, p]));
  for (const piece of a) {
    const before = byId.get(piece.id);
    if (!before || pieceChanged(piece, before)) parts.push('piece');
    byId.delete(piece.id);
  }
  // Anything left in the map was removed from the draft.
  for (let i = 0; i < byId.size; i += 1) parts.push('piece');

  return { count: parts.length, parts };
}

// =========================================================
// Naming the changes
// =========================================================
// The publish confirmation names what will change in plain language —
// "your bio, and 2 pieces". This is NOT a diff view: a diff is a builder
// pattern, and the client does not want to audit their own edits, only to
// recognise them.
//
// The count exists here and nowhere else. At rest the interface says
// "Your latest changes aren't live yet" — a sentence, not a number
// (blueprint §6.4).

const SUMMARY_WORDS = {
  en: {
    name: 'your name',
    title: 'your title',
    bio: 'your bio',
    shortLine: 'your short line',
    appearance: 'how it looks',
    action: 'how people reach you',
    piece: (n) => (n === 1 ? '1 piece' : `${n} pieces`),
    join: ', ',
    and: ', and ',
  },
  ar: {
    name: 'الاسم',
    title: 'المسمّى',
    bio: 'النبذة',
    shortLine: 'السطر المختصر',
    appearance: 'المظهر',
    action: 'طريقة التواصل',
    // Latin numerals in both locales — see GRANDMASTER.
    piece: (n) => (n === 1 ? 'عمل واحد' : `${n} أعمال`),
    join: '، ',
    and: ' و',
  },
};

export function changeSummary(parts, lang = 'en') {
  const w = SUMMARY_WORDS[lang] || SUMMARY_WORDS.en;
  if (!parts || parts.length === 0) return '';

  const pieces = parts.filter((p) => p === 'piece').length;
  const phrases = [];
  // Ordered as the client thinks about their portfolio, not as diff() found
  // them: who I am, then what I say, then the work, then how it looks.
  if (parts.includes('name')) phrases.push(w.name);
  if (parts.includes('title')) phrases.push(w.title);
  if (parts.includes('bio')) phrases.push(w.bio);
  if (parts.includes('shortLine')) phrases.push(w.shortLine);
  if (pieces > 0) phrases.push(w.piece(pieces));
  if (parts.includes('action')) phrases.push(w.action);
  if (parts.includes('appearance')) phrases.push(w.appearance);

  if (phrases.length === 1) return phrases[0];
  return phrases.slice(0, -1).join(w.join) + w.and + phrases[phrases.length - 1];
}

// =========================================================
// The queue
// =========================================================
// Studio Home is an attention queue, not a dashboard (design.md §6). Rules
// that hold for every item:
//
//   * it names what clears it — an item that cannot be cleared is nagging
//   * it is skippable — skipping is a legitimate ending, not a deferral
//   * it is FINITE and genuinely empties. A queue that regenerates forever
//     becomes wallpaper and stops being read
//   * it never implies the client did something wrong. "could use names",
//     never "missing names"
//
// Returns descriptor objects; copy lives in the component layer via i18n so
// that this module stays language-agnostic and testable. Each descriptor
// carries the data the sentence needs (e.g. `count`), never the sentence.

export const QUEUE_IDS = {
  ADD_WORK: 'add-work',
  BIO_SUGGESTION: 'bio-suggestion',
  UNNAMED_PIECES: 'unnamed-pieces',
  UNPUBLISHED: 'unpublished',
};

function isBlank(field) {
  const f = field || {};
  return !(f.ar || '').trim() && !(f.en || '').trim();
}

// `skipped` is a Set (or array) of queue ids the client dismissed this session.
export function queueItems(draft, { skipped = [], published = null } = {}) {
  if (!draft) return [];
  const dismissed = new Set(skipped);
  const items = [];
  const pieces = draft.pieces || [];

  // An empty portfolio has exactly one thing worth saying. Everything else
  // would be noise stacked on a blank page.
  if (pieces.length === 0) {
    return dismissed.has(QUEUE_IDS.ADD_WORK)
      ? []
      : [{ id: QUEUE_IDS.ADD_WORK, kind: 'add-work', field: 'pieces' }];
  }

  // AI wrote something and the client has not accepted or rewritten it. This
  // is an OFFER, not a defect — the client owns the final wording, and nothing
  // AI wrote is published without a deliberate act.
  if (draft.bioIsSuggestion && !dismissed.has(QUEUE_IDS.BIO_SUGGESTION)) {
    items.push({ id: QUEUE_IDS.BIO_SUGGESTION, kind: 'bio-suggestion', field: 'bio' });
  }

  const unnamed = pieces.filter((p) => isBlank(p.name)).length;
  if (unnamed > 0 && !dismissed.has(QUEUE_IDS.UNNAMED_PIECES)) {
    items.push({
      id: QUEUE_IDS.UNNAMED_PIECES,
      kind: 'unnamed-pieces',
      count: unnamed,
      field: 'pieces',
    });
  }

  // The forgotten-publish guard (blueprint §8.5). Staged publishing is only
  // safe because this item exists: without it a client edits for a week and
  // never realises visitors are looking at last month's portfolio.
  //
  // Deliberately NOT skippable — skipping it would recreate the exact risk it
  // exists to remove. It clears by publishing, which is one click away.
  if (published) {
    const { count } = diff(draft, published);
    if (count > 0) {
      items.push({ id: QUEUE_IDS.UNPUBLISHED, kind: 'unpublished', count });
    }
  }

  return items;
}

// Whether an item may be dismissed. Everything is skippable except the
// unpublished-changes guard above.
export function isSkippable(item) {
  return !!item && item.kind !== 'unpublished';
}

// =========================================================
// Publish state
// =========================================================
// Two indicators that must never be merged (blueprint §6.4): one is about
// whether the site EXISTS, the other about whether visitors can see the
// client's latest work. Merging them is where staged publishing gets confusing.
//
//   'never'    never published — "Only you can see this."
//   'ahead'    draft is ahead of published — "Your latest changes aren't live yet"
//   'synced'   draft and published agree — "up to date", and no Publish button
//   'offline'  entitlement lapsed; the snapshot exists but is not served
export function publishState(draft, published, { offline = false } = {}) {
  if (offline) return 'offline';
  if (!published) return 'never';
  return diff(draft, published).count > 0 ? 'ahead' : 'synced';
}

// How many AI suggestions the client has not looked at. Surfaced in the
// publish confirmation so that untouched AI copy cannot slip out unnoticed —
// this is how "never publish AI copy automatically" is enforced without
// blocking anyone.
export function unreviewedSuggestions(draft) {
  if (!draft) return 0;
  let n = 0;
  if (draft.bioIsSuggestion) n += 1;
  if (draft.titleIsSuggestion) n += 1;
  return n;
}
