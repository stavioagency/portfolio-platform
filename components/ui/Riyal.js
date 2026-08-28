// The Saudi Riyal mark.
//
// WHY THIS IS NOT AN SVG PATH YET. The symbol was sent as an image in chat, not
// as a file in this repository, so there is nothing here to read. Tracing it by
// eye got the structure right and the proportions wrong, and an approximately
// correct currency mark on a checkout screen is the worst kind of wrong — it
// reads as a rendering fault, or worse, as a different currency.
//
// SO IT RENDERS "ر.س" UNTIL THE REAL ARTWORK ARRIVES. That is correct,
// universally understood in the Gulf, and it is what every customer-facing
// screen already showed.
//
// TO FINISH IT: save the official SVG's path data into GLYPH below. Nothing
// else has to change — every money string in the product goes through
// formatAmount(), which calls this. One constant, one file.
//
//   const GLYPH = 'M152 62 C...';   // viewBox 0 0 424 471
//
// The character route is deliberately not taken: U+20C0 (the real Saudi Riyal
// Sign) has thin font support and renders as an empty box on most devices
// today, and U+20C1 — which is what was pasted — is unassigned in Unicode and
// renders as a box everywhere.
const GLYPH = null;

// The mark sits on the text baseline and takes its colour from the text around
// it, so it behaves like a character rather than an image: no explicit size, no
// hardcoded fill, and it scales with whatever font-size it lands in.
export default function Riyal({ className = '' }) {
  if (!GLYPH) {
    // dir="ltr" is wrong here — this is Arabic text and belongs to the
    // paragraph's own direction. It is left unset on purpose.
    return <span className={className}>ر.س</span>;
  }
  return (
    <svg
      className={className}
      viewBox="0 0 424 471"
      role="img"
      aria-label="ريال"
      style={{ height: '0.9em', width: 'auto', fill: 'currentColor', verticalAlign: '-0.08em' }}
    >
      <path d={GLYPH} />
    </svg>
  );
}
