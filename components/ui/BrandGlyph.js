// BrandGlyph — renders one entry from lib/brand-icons.js.
//
// WHY IT EXISTS: five places rendered `<svg viewBox="0 0 24 24"><path d={ic.path}/></svg>`
// by hand — the public social row, the public CTA, and three admin surfaces.
// That was fine while every glyph was a solid brand mark, but the generic
// action icons (website, email, location, phone, link) are now STROKE geometry,
// and five copies of the markup would each have needed the same fix.
//
// WHY TWO RENDER MODES: a brand mark is a solid silhouette; the generic icons
// were Material-style solids, which at the same size read far heavier than
// Instagram's thin ring sitting two rows below them. Drawing them as ~2px
// strokes matches the optical weight of the brand marks instead of shouting
// over them.
//
// `fill` and `stroke` are set INLINE, not via CSS, because the call sites all
// carry rules like `.cta-icon svg { fill: currentColor }` which would otherwise
// flood a stroke glyph solid. An inline style beats those without every one of
// those five stylesheets needing to know this distinction exists.

import { brandIcon } from '../../lib/brand-icons';

export default function BrandGlyph({ icon, className = '' }) {
  const ic = brandIcon(icon);
  if (!ic) return null;

  if (ic.stroke) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        style={{ fill: 'none', stroke: 'currentColor' }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {ic.paths.map((d, i) => <path key={i} d={d} />)}
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      style={{ fill: 'currentColor' }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={ic.path} />
    </svg>
  );
}
