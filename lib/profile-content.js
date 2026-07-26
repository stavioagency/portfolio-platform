// Does a tenant's profile actually render anything a visitor would recognise as a
// portfolio?
//
// The public page used to ask only "is there a profile ROW?" — so a tenant whose row
// existed but was empty sailed past the friendly "setup needed" screen and rendered a
// nameless card with a "?" avatar and a bare copyright line. That is what
// designakum.site served: not an error, not a 404, just a confusing blank.
//
// An empty row is the NORMAL state for a freshly created workspace, because
// createTenant inserts `{ tenant_id, default_lang }` and nothing else. So this is the
// state every new client passes through, not an edge case.
//
// What deliberately does NOT count, even though some of it is technically visible:
//   * appearance / default_lang — a styled card with no text is still a blank card.
//   * footer text — renders, but a copyright line under a nameless "?" avatar is the
//     exact broken state this function exists to catch. The real ahmad-demo row is
//     empty except for a footer and SEO fields, and it must read as "not set up".
//   * seo title/description/og_image — metadata for crawlers, not content on the page.
//   * top_ticker — a strip above an otherwise empty card is still an empty card.
// The test is "would a visitor see a portfolio here", not "is any field populated".

export function hasBilingualText(v) {
  if (v == null) return false;
  // Legacy rows stored a plain string before the {ar, en} shape existed.
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v !== 'object') return false;
  return Object.values(v).some((s) => typeof s === 'string' && s.trim() !== '');
}

const list = (v) => (Array.isArray(v) ? v : []);

export function hasPublicContent(profile, projectCount = 0) {
  if (!profile) return false;
  if ((projectCount || 0) > 0) return true;

  if (hasBilingualText(profile.name)) return true;
  if (hasBilingualText(profile.tagline)) return true;
  if (hasBilingualText(profile.bio)) return true;
  if (profile.profile_image || profile.brand_logo) return true;

  // Mirror the filters the public page applies when deciding what to render, so
  // "has content" cannot disagree with what is actually on screen.
  if (list(profile.banners).some((b) => b && (b.image_url || hasBilingualText(b.text)))) return true;
  if (list(profile.stats).some((s) => s && (hasBilingualText(s.value) || hasBilingualText(s.label)))) return true;
  if (list(profile.cta_buttons).some((b) => b && hasBilingualText(b.label))) return true;
  if (list(profile.custom_links).some((l) => l && l.href)) return true;
  if (list(profile.custom_fields).some((f) => f && (hasBilingualText(f.label) || hasBilingualText(f.value)))) return true;

  return false;
}

export default hasPublicContent;
