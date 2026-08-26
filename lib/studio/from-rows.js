// The Studio's data path: the live `profile` and `projects` rows on one side,
// the Studio draft shape on the other.
//
// Pure and dependency-free. Nothing here opens a network connection, and that
// is deliberate — the mapping is the part with all the decisions in it, and it
// should be testable without a database. See tests/studio-from-rows.test.mjs.
//
// ---------------------------------------------------------------------------
// WHAT THIS DOES NOT DO, AND WHY IT CANNOT YET
// ---------------------------------------------------------------------------
// It does not write. `profile` and `projects` ARE the published website --
// pages/[slug].js renders those exact rows to visitors. Blueprint §8.5 requires
// draft and published to be SEPARATE states, and the live database has no draft
// store: SCHEMA.sql describes `published_snapshots` as a pattern that future
// tables "will follow", not as something that exists.
//
// So writing the Studio straight back into these rows would mean every keystroke
// edits a paying client's live public site with no publish step -- exactly the
// model §8.5 replaced. `rowsFromDraft` therefore produces the payload and stops
// there. Persisting it needs a draft store, which needs a schema change, which
// is a decision for Feras and a migration in supabase/sections/.
//
// ---------------------------------------------------------------------------
// FOUR MISMATCHES BETWEEN THE TWO MODELS, recorded rather than papered over
// ---------------------------------------------------------------------------
//  1. The Studio's `title` is the database's `tagline`. Same field, two names.
//     The mapping is the only place that should ever know this.
//  2. `shortLine` has NO column. It is Studio-only for now and does not survive
//     a round trip through the database.
//  3. `action.destination` has no column either. `cta_buttons` is the nearest
//     thing and it is REMOVED by the feature decisions (SCHEMA.sql line 100),
//     so it must not be reused for this.
//  4. Appearance uses two different vocabularies: the Studio speaks
//     accent/font/density, the admin's column speaks theme/tokens/font_body/
//     density/radius. They are not translations of each other. Rather than
//     lossily convert -- which would silently change a live site's colours the
//     first time a client opened the Studio -- the Studio's own settings live
//     under a namespaced `studio` key INSIDE the existing appearance jsonb.
//     That needs no migration, and the admin's keys are left untouched.

import { FIRST_RUN_SLOTS } from './first-draft.js';

const bi = (v) => ({ en: (v && v.en) || '', ar: (v && v.ar) || '' });
const DEFAULT_APPEARANCE = { accent: 'royal', font: 'manrope', density: 'roomy' };

// Flat tones stand in for a cover that has not been uploaded. Same list the
// mock data uses, so an empty piece looks the same however it arrived.
const TONES = ['#C8CEDC', '#B6BFD2', '#D3D8E4', '#AEB8CE', '#C0C8D8'];

function pieceFromRow(row, i) {
  return {
    id: row.id,
    name: bi(row.title),
    description: bi(row.description),
    cover: row.cover_image || null,
    link: row.external_url || '',
    tone: TONES[i % TONES.length],
    // Wording an absence needs to know it is one (design law 4).
    empty: !((row.title && (row.title.en || row.title.ar)) || row.cover_image),
  };
}

// `projects` rows carry display_order, and the sequence is shared across every
// tenant — so a piece is ordered by display_order and NEVER by id.
function orderPieces(rows) {
  return [...rows].sort((a, b) => {
    const d = (a.display_order || 0) - (b.display_order || 0);
    return d !== 0 ? d : (a.id || 0) - (b.id || 0);
  });
}

export function draftFromRows({ profile, projects } = {}) {
  const p = profile || {};
  const rows = Array.isArray(projects) ? projects : [];
  const stored = (p.appearance && p.appearance.studio) || {};

  return {
    name: bi(p.name),
    // Mismatch 1: the Studio's `title` is the column called `tagline`.
    title: bi(p.tagline),
    bio: bi(p.bio),
    // Mismatch 2: Studio-only, so it starts empty on every load from the database.
    shortLine: { en: '', ar: '' },
    // Nothing loaded from the database was written by a machine, so nothing is
    // awaiting review. A suggestion is a live, in-session offer.
    bioIsSuggestion: false,
    photo: p.profile_image || null,
    appearance: { ...DEFAULT_APPEARANCE, ...stored },
    links: Array.isArray(p.custom_links) ? p.custom_links.filter(Boolean) : [],
    // Mismatch 3: no column, so it starts empty rather than borrowing one.
    action: { destination: '' },
    pieces: orderPieces(rows).map(pieceFromRow),
  };
}

// The payload a draft store would persist. Split by destination table, because
// the Studio edits one portfolio while the database keeps it in two places.
//
// Returns { profile, pieces } where `profile` is a PATCH -- only the columns the
// Studio owns. It deliberately does not mention banners, stats, cta_buttons,
// custom_fields, sections or top_ticker: those are still live columns rendered
// by pages/index.js, and a patch that omitted them would be fine while a patch
// that nulled them would take down a paying client's page.
export function rowsFromDraft(draft, { existingAppearance } = {}) {
  const d = draft || {};
  return {
    profile: {
      name: bi(d.name),
      tagline: bi(d.title),
      bio: bi(d.bio),
      profile_image: d.photo || null,
      custom_links: d.links || [],
      // Merge, never replace: the admin's theme keys live in this same column
      // and are none of the Studio's business.
      appearance: { ...(existingAppearance || {}), studio: { ...(d.appearance || {}) } },
    },
    pieces: (d.pieces || []).map((piece, i) => ({
      id: piece.id,
      title: bi(piece.name),
      description: bi(piece.description),
      cover_image: piece.cover || null,
      external_url: piece.link || '',
      display_order: i,
    })),
  };
}

// Does this tenant have anything at all? A tenant created by an owner has a
// profile row before the client has ever signed in, so "has a row" is not the
// same question as "has content".
export function hasContent({ profile, projects } = {}) {
  const d = draftFromRows({ profile, projects });
  const filled = (f) => Boolean((f.en || '').trim() || (f.ar || '').trim());
  if (filled(d.name) || filled(d.title) || filled(d.bio)) return true;
  if (d.photo) return true;
  if (d.links.length) return true;
  return d.pieces.some((p) => !p.empty);
}

// A tenant with no projects at all still gets the slots the first draft
// promises, so the Studio never renders a portfolio with nowhere to put work.
export function withFirstRunSlots(draft) {
  const d = draft || {};
  const pieces = d.pieces || [];
  if (pieces.length >= FIRST_RUN_SLOTS) return d;
  const extra = Array.from({ length: FIRST_RUN_SLOTS - pieces.length }, (_, i) => ({
    // Negative ids mark a slot that does not exist in the database yet. A real
    // row gets a real id from the shared sequence on insert.
    id: -(i + 1),
    name: { en: '', ar: '' },
    description: { en: '', ar: '' },
    cover: null,
    link: '',
    tone: TONES[(pieces.length + i) % TONES.length],
    empty: true,
  }));
  return { ...d, pieces: [...pieces, ...extra] };
}
