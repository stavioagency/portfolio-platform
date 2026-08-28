import Riyal from './Riyal';
import { amountParts, DISPLAY_CURRENCY } from '../../lib/billing-plans';

// A price, with the riyal drawn rather than spelled.
//
// WHY A COMPONENT AND NOT A STRING. formatAmount() still exists and still
// returns "12 ر.س" — a confirm dialog's description is a string and cannot hold
// an <svg>. This is for the places that CAN render one, which is every screen
// where a customer actually reads a price.
//
// The digits are Latin in both languages, which is the product's rule and is
// why Intl.NumberFormat is not used: Intl.NumberFormat('ar') renders ١٢.
//
// The mark goes AFTER the number in Arabic and BEFORE it in English, matching
// how each language writes currency, and matching what formatAmount already
// did with the letters.
export default function Money({ minor, lang = 'ar', currency = DISPLAY_CURRENCY, className = '' }) {
  const parts = amountParts(minor, currency);
  if (!parts) return null;

  // Only the riyal has a mark. Anything else keeps its code, which is what the
  // customer's statement will say anyway.
  if (parts.currency !== 'SAR') {
    const code = parts.currency === 'USD' ? '$' : parts.currency;
    return (
      <span className={className} style={{ whiteSpace: 'nowrap' }}>
        {lang === 'ar' ? `${parts.digits} ${code}` : `${code} ${parts.digits}`}
      </span>
    );
  }

  // nowrap so a price never breaks between its number and its mark, which is
  // the one place a line break turns a figure into two figures.
  return (
    <span className={className} style={{ whiteSpace: 'nowrap' }}>
      {lang === 'ar'
        ? <>{parts.digits}&nbsp;<Riyal /></>
        : <><Riyal />&nbsp;{parts.digits}</>}
    </span>
  );
}
