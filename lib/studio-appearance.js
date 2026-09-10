// lib/studio-appearance.js
// -----------------------------------------------------------------------------
// The accent a customer may choose, and nothing else.
//
// ── WHY THIS LIST IS SO SHORT ────────────────────────────────────────────
// The public page reads exactly ONE appearance value: `appearance.tokens.accent`
// (see pages/index.js). Background, surface, text ramp, border, font and radius
// used to be client settings and were deliberately removed, because together
// they produced the page the redesign replaced — one client's site rendered
// lilac edge to edge because tokens.bg had been set to the accent colour and
// nothing stopped it.
//
//     "The client controls content and emphasis.
//      Designakum controls structure and presentation."   — design.md
//
// So an Appearance screen offering a background picker would be offering a
// control the renderer ignores. Until the public portfolio is unfrozen and
// redesigned, the honest control set is: the accent.
//
// ── AND WHY IT IS A LIST RATHER THAN A COLOUR PICKER ─────────────────────
// A free hex field is what put an unreadable accent on a live customer site.
// Every colour below is checked by tests/studio-appearance.test.mjs against the
// ink that actually sits on it, in both themes, so there is no combination a
// customer can select that produces text nobody can read. That is §16's
// "meaningful visual options" — the customer picks a mood, the product keeps
// the guarantee.
//
// Pure data plus one reader. No React, no Supabase, no environment.

// The two inks that land on an accent fill, taken from styles/globals.css:
// --accent-fg resolves to --brand-ink, which is #ffffff in the dark theme and
// #0C1530 in the light one. An accent must be readable under whichever applies.
export const INK_ON_ACCENT = { dark: '#ffffff', light: '#0C1530' };

// Named for what they are, not for a hex. The Arabic is the colour's ordinary
// name, not a transliteration.
export const ACCENTS = [
  { id: 'royal',    hex: '#2A6BCE', label: { en: 'Royal blue', ar: 'أزرق ملكي' } },
  { id: 'indigo',   hex: '#4F46E5', label: { en: 'Indigo',     ar: 'نيلي' } },
  { id: 'violet',   hex: '#7C3AED', label: { en: 'Violet',     ar: 'بنفسجي' } },
  { id: 'magenta',  hex: '#B4308F', label: { en: 'Magenta',    ar: 'أرجواني' } },
  { id: 'crimson',  hex: '#C42B47', label: { en: 'Crimson',    ar: 'قرمزي' } },
  { id: 'rust',     hex: '#B4531F', label: { en: 'Rust',       ar: 'نحاسي' } },
  { id: 'olive',    hex: '#4F6B1E', label: { en: 'Olive',      ar: 'زيتوني' } },
  { id: 'emerald',  hex: '#0F7A52', label: { en: 'Emerald',    ar: 'زمردي' } },
  { id: 'teal',     hex: '#0E7490', label: { en: 'Teal',       ar: 'فيروزي' } },
  { id: 'slate',    hex: '#44506B', label: { en: 'Slate',      ar: 'رمادي حبري' } },
];

export const DEFAULT_ACCENT = 'royal';

export function accentById(id) {
  return ACCENTS.find((a) => a.id === id) || null;
}

/* The accent a profile row is currently using, as an id.
   Reads BOTH shapes the database holds: `tokens.accent` is what the theme
   presets wrote and what the public page prefers, `accent_color` is the older
   flat field it falls back to. A stored colour that is not in the list returns
   null — the customer chose it before this list existed, and the Studio must
   say "custom" rather than silently claim one of ours. */
export function currentAccent(appearance) {
  const a = appearance && typeof appearance === 'object' ? appearance : {};
  const hex = String((a.tokens && a.tokens.accent) || a.accent_color || '').trim().toLowerCase();
  if (!hex) return { id: null, hex: '', known: false, unset: true };
  const found = ACCENTS.find((c) => c.hex.toLowerCase() === hex);
  return { id: found ? found.id : null, hex, known: Boolean(found), unset: false };
}

/* The patch that sets an accent.
   BOTH fields are written, and that is deliberate: the public page prefers
   tokens.accent but falls back to accent_color, and leaving the older field
   holding a different colour means the two disagree for as long as anyone reads
   the fallback. Everything else already in `appearance` is preserved untouched —
   nothing else in that object is ours to discard. */
export function accentPatch(appearance, id) {
  const accent = accentById(id);
  if (!accent) return null;
  const base = appearance && typeof appearance === 'object' ? appearance : {};
  return {
    ...base,
    tokens: { ...(base.tokens || {}), accent: accent.hex },
    accent_color: accent.hex,
  };
}
