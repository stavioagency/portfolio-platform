// lib/published-langs.js
// -----------------------------------------------------------------------------
// Which languages a portfolio is actually LIVE in.
//
// A client can write in two languages and be ready in only one. Before this,
// the two facts were the same fact: profile.bilingual said "I write in both"
// and the page immediately offered both, so a half-translated English view went
// live the moment the switch was flipped. Section AA added
// tenants.published_langs to separate them — what is written from what is
// published.
//
// NULL means today's behaviour, deliberately: every existing tenant has NULL,
// so nothing changed for anyone the day the column landed.

const BOTH = ['ar', 'en'];

/** The languages the client WRITES in — what the profile offers. */
export function offeredLangs(profile) {
  if (profile && profile.bilingual === true) return [...BOTH];
  return [(profile && profile.default_lang) || 'ar'];
}

/**
 * The languages a visitor can actually see.
 *
 * Two rules, and the second one matters more than it looks. A subset is only
 * honoured where it overlaps what is written — asking to publish English on a
 * portfolio that has no English is not a request anyone can grant. And a subset
 * that leaves NOTHING live is ignored entirely: a page in no language is a
 * blank page, which is worse than the over-sharing this column exists to
 * prevent, and it would be reached by a single stray click.
 */
export function liveLangs(profile, tenant) {
  const offered = offeredLangs(profile);
  const chosen = tenant && Array.isArray(tenant.published_langs) ? tenant.published_langs : null;
  if (!chosen) return offered;

  const live = offered.filter((l) => chosen.includes(l));
  return live.length > 0 ? live : offered;
}

/**
 * Whether the page shows a language switch.
 *
 * A door to an empty room is worse than no door — seven live portfolios once
 * offered a switch that led to a page with the name filled in and nothing else.
 * So the switch appears only when there is genuinely more than one live
 * language, not merely when the client writes in two.
 */
export function switcherOn(profile, tenant) {
  return liveLangs(profile, tenant).length > 1;
}

/** The language to open in: the visitor's, if it is live; otherwise the first. */
export function openingLang(profile, tenant, preferred) {
  const live = liveLangs(profile, tenant);
  return live.includes(preferred) ? preferred : live[0];
}
