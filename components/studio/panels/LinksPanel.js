// Links — where people can find you.
//
// A short, fixed set of places, each either filled in or empty. Deliberately
// NOT a repeater with "add row" and "remove row": a repeater is a small
// database editor, and the client would be building a list rather than filling
// in how to reach them. An empty one simply does not appear on the portfolio.

import FocusPanel from '../FocusPanel';
import { studioStrings } from '../../../lib/studio/strings';

// The places a creative freelancer in this market actually uses. Adding to
// this list is a product decision, not a UI convenience.
export const LINK_SLOTS = [
  { id: 'instagram', label: 'Instagram', placeholder: 'instagram.com/you' },
  { id: 'behance', label: 'Behance', placeholder: 'behance.net/you' },
  { id: 'x', label: 'X', placeholder: 'x.com/you' },
  { id: 'whatsapp', label: 'WhatsApp', placeholder: '+966…' },
  { id: 'email', label: 'Email', placeholder: 'you@example.com' },
];

export default function LinksPanel({ draft, lang, onClose, onLink, onDestination }) {
  const s = studioStrings(lang);
  const links = draft.links || [];
  const valueOf = (id) => (links.find((l) => l.id === id) || {}).url || '';

  return (
    <FocusPanel title={s.panelLinks} onClose={onClose} footer={<span>✓ {s.saved}</span>}>
      {/* THE NEXT STEP — a destination and nothing else. No label field, no
          style, no placement: each of those would hand the client a decision
          the product should make once, well, for everyone. See
          docs/design/next-step.md. */}
      <label className="row">
        <span className="lbl">{s.nextStep}</span>
        <input
          type="text"
          dir="ltr"
          placeholder={s.nextStepHint}
          value={(draft.action && draft.action.destination) || ''}
          onChange={(e) => onDestination(e.target.value)}
        />
      </label>

      <hr />

      {/* One line so an empty panel is not five blank boxes with no reason
          given. An unfilled slot simply never appears on the portfolio. */}
      <p className="lead">{s.linksLead}</p>

      {LINK_SLOTS.map((slot) => (
        <label key={slot.id} className="row">
          <span className="lbl">{slot.label}</span>
          {/* A URL or a handle has no language, so these are never bilingual
              and always read left-to-right, even in an Arabic interface. */}
          <input
            type="text"
            dir="ltr"
            placeholder={slot.placeholder}
            value={valueOf(slot.id)}
            onChange={(e) => onLink(slot.id, slot.label, e.target.value)}
          />
        </label>
      ))}

      <style jsx>{`
        .lead { margin: 0; font-size: 12.5px; color: var(--text-tertiary); }
        hr { border: 0; border-top: 1px solid var(--border); margin: 0; }
        .row { display: grid; gap: 5px; }
        .lbl { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
        input {
          font: inherit;
          font-size: 14px;
          width: 100%;
          color: var(--text-primary);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 8px 11px;
        }
        input::placeholder { color: var(--text-muted); }
        input:focus {
          outline: none;
          border-color: var(--brand-line);
          box-shadow: 0 0 0 3px var(--brand-focus);
        }
      `}</style>
    </FocusPanel>
  );
}
