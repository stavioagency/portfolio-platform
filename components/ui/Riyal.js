// The Saudi Riyal mark.
//
// Traced from the official artwork rather than drawn by eye: the PNG was
// thresholded to a mask, its two components' boundaries followed exactly on the
// pixel grid, and the outlines simplified with Douglas-Peucker at a tolerance
// tight enough that an overlay against the original shows no daylight. An
// earlier hand-trace got the structure right and the proportions wrong, which
// on a currency mark reads as a rendering fault.
//
// TWO PATHS because the mark has two pieces: the joined strokes, and the
// detached bar at the foot. They are separate <path> elements rather than one
// subpath so neither can be swallowed by a fill rule.
//
// WHY NOT THE UNICODE CHARACTER. U+20C0 (Saudi Riyal Sign) has thin font
// support and renders as an empty box on most devices today. U+20C1 — the one
// that usually gets pasted — is unassigned in Unicode and is a box everywhere.
const VIEWBOX = '0 0 895.1 1000.0';
const GLYPHS = [
  'M397.9 762.2 L349.0 833.6 L333.6 846.9 L317.5 855.9 L297.2 862.2 L7.7 923.8 L0.0 925.2 L0.0 921.7 L10.5 865.7 L20.3 835.0 L30.8 810.5 L316.1 750.3 L316.1 614.7 L50.3 671.3 L51.0 656.6 L61.5 607.0 L69.9 581.1 L80.4 556.6 L316.1 507.0 L316.1 87.4 L330.8 70.6 L362.2 40.6 L392.3 17.5 L421.0 0.0 L421.0 484.6 L526.6 462.2 L526.6 140.6 L546.9 117.5 L575.5 90.9 L606.3 67.8 L631.5 53.1 L631.5 439.2 L895.1 383.9 L890.9 415.4 L883.9 445.5 L865.0 497.9 L631.5 547.6 L631.5 654.5 L893.0 599.3 L895.1 599.3 L895.1 602.1 L890.9 630.8 L882.5 665.7 L869.2 703.5 L862.9 714.0 L526.6 785.3 L526.6 569.9 L422.4 591.6 L421.0 592.3 L421.0 718.9 L414.7 737.8 L397.9 762.2 Z',
  'M769.9 841.3 L895.1 814.7 L891.6 842.0 L884.6 873.4 L874.1 906.3 L864.3 928.7 L526.6 1000.0 L530.1 972.0 L535.7 946.2 L545.5 914.0 L557.3 886.0 L769.9 841.3 Z'
];

// It behaves like a character, not an image: no explicit size, no hardcoded
// fill, sitting on the text baseline and scaling with whatever font-size it
// lands in. That is what lets it sit inside a sentence without being positioned.
export default function Riyal({ className = '', title = 'ريال' }) {
  return (
    <svg
      className={className}
      viewBox={VIEWBOX}
      role="img"
      aria-label={title}
      focusable="false"
      style={{ height: '0.82em', width: 'auto', fill: 'currentColor', verticalAlign: '-0.04em' }}
    >
      {GLYPHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
