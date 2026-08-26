// PublishSheet — the publish confirmation.
//
// THE ONLY PLACE A COUNT APPEARS. At rest the header says "your latest changes
// aren't live yet"; here the number is about to mean something, so it earns
// its place (blueprint §6.4, §8.5).
//
// It names what will change in plain language — "your bio, and 2 pieces" — and
// is deliberately NOT a diff view. A diff is a builder pattern: the client
// does not want to audit their own edits, only to recognise them.
//
// It also surfaces AI suggestions the client has not looked at. This is how
// "never publish AI copy automatically" is enforced without blocking anyone:
// publishing stays one deliberate act, and untouched AI wording cannot slip
// out unnoticed.

import { changeSummary } from '../../lib/studio/draft';
import { studioStrings } from '../../lib/studio/strings';

export default function PublishSheet({
  lang,
  parts,
  count,
  unreviewed,
  address,
  firstPublish,
  onConfirm,
  onDismiss,
}) {
  const s = studioStrings(lang);
  const summary = changeSummary(parts, lang);

  return (
    <section className="sheet" role="group">
      <b>{firstPublish ? s.publishFirst : s.publishCount(count)}</b>
      <p>{firstPublish ? s.publishFirstBody(address) : summary}</p>
      {unreviewed > 0 && <p className="note">{s.unreviewed(unreviewed)}</p>}

      <div className="acts">
        <button type="button" className="go" onClick={onConfirm}>
          {s.publish}
        </button>
        <button type="button" className="not" onClick={onDismiss}>
          {s.notYet}
        </button>
      </div>

      <style jsx>{`
        .sheet {
          background: var(--bg-secondary);
          border: 1px solid var(--brand-line);
          border-radius: var(--radius-md);
          padding: var(--space-4) var(--space-5);
          margin-bottom: var(--space-4);
          animation: sheet-in var(--t-enter) var(--ease) both;
        }
        @keyframes sheet-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sheet { animation: none; }
        }
        b {
          display: block;
          font-size: 15.5px;
          font-weight: 600;
          margin-bottom: 3px;
        }
        p {
          margin: 0 0 3px;
          font-size: 13.5px;
          color: var(--text-secondary);
        }
        .note { color: var(--text-tertiary); font-size: 13px; }
        .acts {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-top: var(--space-3);
          flex-wrap: wrap;
        }
        button {
          font: inherit;
          cursor: pointer;
          border-radius: var(--radius-sm);
          transition: background var(--t-ui) var(--ease);
        }
        .go {
          border: 0;
          padding: 8px 15px;
          font-weight: 600;
          font-size: 14px;
          background: var(--accent);
          color: var(--accent-fg);
        }
        .go:hover { background: var(--accent-hover); }
        .not {
          border: 0;
          background: none;
          padding: 8px 10px;
          font-size: 14px;
          color: var(--text-secondary);
        }
        .not:hover { color: var(--text-primary); }
      `}</style>
    </section>
  );
}
