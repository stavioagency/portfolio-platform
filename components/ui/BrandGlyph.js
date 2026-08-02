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

// SIZE IS A PROP, NOT CSS — and this is load-bearing.
//
// Every call site used to size its own inline <svg> from a styled-jsx rule like
// `.cta-icon svg { width: 19px }`. styled-jsx scopes that to
// `.cta-icon.jsx-hash svg.jsx-hash`, and an <svg> rendered by THIS component
// never receives the caller's hash class — so the moment the markup moved in
// here, all five of those rules stopped matching and every glyph in the app
// rendered at zero size. Invisible, with no error.
//
// Sizing on the element itself means the glyph cannot be broken by a stylesheet
// that does not know it exists.
export default function BrandGlyph({ icon, size = 18, className = '' }) {
  const ic = brandIcon(icon);
  if (!ic) return null;

  const common = {
    className,
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    'aria-hidden': 'true',
    focusable: 'false',
  };

  // Generic actions are stroke geometry; brand marks are solid silhouettes.
  // fill/stroke go inline because callers still carry `svg { fill: currentColor }`
  // rules that would otherwise flood a stroke glyph solid.
  if (ic.stroke) {
    return (
      <svg
        {...common}
        style={{ fill: 'none', stroke: 'currentColor' }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ic.paths.map((d, i) => <path key={i} d={d} />)}
      </svg>
    );
  }

  return (
    <svg {...common} style={{ fill: 'currentColor' }}>
      <path d={ic.path} />
    </svg>
  );
}
