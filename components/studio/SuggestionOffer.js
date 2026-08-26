// SuggestionOffer — an offer that expires on contact.
//
// Sits under the field it concerns. Never floats, never gets its own review
// screen, and never appears inside the portfolio itself.
//
// The rules it exists to enforce:
//   * the words "AI" and "generated" never appear — it is a *suggestion*
//   * it is never styled as a problem. No amber, no warning icon, no count of
//     anything "unresolved". It is grey and quiet, and ignoring it forever is
//     a legitimate outcome
//   * it disappears permanently once kept or rewritten. A standing badge would
//     tell the client their portfolio is not theirs
//   * "try another way" replaces the wording in place. It does not open a
//     gallery of variants to choose between — that is a decision the client
//     did not ask to make

import { studioStrings } from '../../lib/studio/strings';

export default function SuggestionOffer({ lang, onKeep, onAnother, onMine }) {
  const s = studioStrings(lang);

  return (
    <div className="offer">
      <span className="mark" aria-hidden="true">◇</span>
      <span className="what">{s.suggestion}</span>
      <span className="acts">
        <button type="button" onClick={onKeep}>{s.bioKeep}</button>
        <button type="button" onClick={onAnother}>{s.bioAnother}</button>
        <button type="button" onClick={onMine}>{s.bioMine}</button>
      </span>

      <style jsx>{`
        .offer {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
          font-size: 12.5px;
          color: var(--text-tertiary);
        }
        .mark { color: var(--brand); font-size: 10px; }
        .what { margin-inline-end: var(--space-1); }
        .acts { display: flex; gap: var(--space-1); flex-wrap: wrap; }
        button {
          font: inherit;
          cursor: pointer;
          background: transparent;
          border: 1px solid var(--border-strong);
          color: var(--text-secondary);
          border-radius: var(--radius-sm);
          padding: 4px 9px;
          font-size: 12px;
          transition: background var(--t-ui) var(--ease), color var(--t-ui) var(--ease);
        }
        button:hover { background: var(--bg-hover); color: var(--text-primary); }
      `}</style>
    </div>
  );
}
