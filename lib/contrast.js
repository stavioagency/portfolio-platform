// Contrast helpers — WCAG 2.1 relative luminance and contrast ratio.
//
// WHY THIS EXISTS: the public portfolio's primary CTA used to be a translucent
// tint of the accent (rgba(accent, 0.18)) over a dark card. That is legible but
// it does not READ as the primary action — it looks like the secondary buttons
// with slightly more colour. Making it a solid accent fill fixes the hierarchy,
// but the accent is CLIENT-CHOSEN from a colour picker: a solid fill needs a
// foreground that stays readable whether they pick #0b1020 or #ffe600. That
// decision is arithmetic, so it lives here as pure functions with tests rather
// than as a guess baked into a stylesheet.
//
// Everything degrades safely: an unparseable colour returns null and callers
// fall back to their existing hard-coded value.

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

function clampChannel(n) {
  if (!Number.isFinite(n)) return null;
  return Math.min(255, Math.max(0, Math.round(n)));
}

// Accepts '#abc', '#aabbcc', 'rgb(r g b)' and 'rgba(r,g,b,a)'. The alpha is
// deliberately ignored: these colours are used as opaque surfaces, and guessing
// what is behind a translucent one would be wrong more often than right.
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();

  const short = s.match(HEX_SHORT);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }

  const long = s.match(HEX_LONG);
  if (long) {
    return { r: parseInt(long[1], 16), g: parseInt(long[2], 16), b: parseInt(long[3], 16) };
  }

  const fn = s.match(RGB_FN);
  if (fn) {
    const r = clampChannel(Number(fn[1]));
    const g = clampChannel(Number(fn[2]));
    const b = clampChannel(Number(fn[3]));
    if (r === null || g === null || b === null) return null;
    return { r, g, b };
  }

  return null;
}

// WCAG 2.1 relative luminance. Channels are 0–255.
export function relativeLuminance(rgb) {
  if (!rgb) return null;
  const chan = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}

// WCAG contrast ratio between two colours, 1 (identical) to 21 (black/white).
// Returns null if either colour cannot be parsed.
export function contrastRatio(a, b) {
  const la = relativeLuminance(parseColor(a));
  const lb = relativeLuminance(parseColor(b));
  if (la === null || lb === null) return null;
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export const BLACK_INK = '#0a0a0c';
export const WHITE_INK = '#ffffff';

// The readable foreground to place ON `background`: whichever ink has the higher
// contrast ratio, so it is correct for any hue rather than only for the palette
// we happen to ship. Returns null when `background` cannot be parsed, so callers
// keep their existing default instead of guessing.
export function readableInkOn(background) {
  const onLight = contrastRatio(background, WHITE_INK);
  const onDark = contrastRatio(background, BLACK_INK);
  if (onLight === null || onDark === null) return null;
  return onLight >= onDark ? WHITE_INK : BLACK_INK;
}
