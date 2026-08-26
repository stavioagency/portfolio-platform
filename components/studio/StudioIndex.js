// The Index — a lightweight way to find editing areas.
//
// It is NOT navigation. It does not persist, it highlights no current
// location, nothing routes to it, and there is no sidebar in any state at any
// width. It exists only because clicking-to-discover fails for anyone who does
// not think to try it, and because the queue shows what is *waiting* rather
// than everything that *can* change.
//
// FOUR ENTRIES, and it does not grow. A fifth is not a UI decision — it means
// a new kind of content exists, which is decided deliberately and elsewhere.
// If this ever needs a scrollbar, a group heading or a second level, we are
// rebuilding the section nav that was removed, and the answer is to stop.
//
// Note that `work` opens nothing: it reveals the work inside the portfolio,
// because the portfolio remains the navigation surface.

import { INDEX_ENTRIES } from '../../lib/studio/editor';
import { studioStrings } from '../../lib/studio/strings';

const LABEL_KEY = { you: 'idxYou', work: 'idxWork', links: 'idxLinks', look: 'idxLook' };

export default function StudioIndex({ lang, onChoose, onClose }) {
  const s = studioStrings(lang);

  return (
    <section className="index">
      <header>
        <h2>{s.indexTitle}</h2>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className="entries">
        {INDEX_ENTRIES.map((entry) => (
          <button key={entry} type="button" onClick={() => onChoose(entry)}>
            {s[LABEL_KEY[entry]]}
          </button>
        ))}
      </div>

      <style jsx>{`
        .index {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-4) var(--space-5) var(--space-5);
          margin-top: var(--space-5);
          animation: idx var(--t-enter) var(--ease) both;
        }
        @keyframes idx {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) { .index { animation: none; } }
        header { display: flex; align-items: center; gap: var(--space-3); }
        h2 {
          flex: 1;
          margin: 0 0 var(--space-3);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .close {
          font: inherit; cursor: pointer; border: 0; background: none;
          color: var(--text-tertiary); font-size: 13px; padding: 2px 6px;
        }
        .close:hover { color: var(--text-primary); }
        .entries { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .entries button {
          font: inherit;
          cursor: pointer;
          font-size: 13.5px;
          padding: 8px 14px;
          border-radius: var(--radius-sm);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          color: var(--text-primary);
          transition: border-color var(--t-ui) var(--ease);
        }
        .entries button:hover { border-color: var(--brand-line); }
      `}</style>
    </section>
  );
}
