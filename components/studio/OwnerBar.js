// OwnerBar — the Studio header.
//
// Two decisions carried here:
//
// 1. The CLIENT'S NAME is the loudest thing on the screen, and the Designakum
//    wordmark is absent — only the diamond remains. This screen belongs to
//    them. A product that puts its own name above the customer's is telling
//    them whose portfolio it really is.
//
// 2. The publish state is a SENTENCE, never a count (blueprint §6.4). "3
//    changes not published" answers a question nobody asked while they are
//    working. The count belongs to the publish confirmation, where it is about
//    to mean something.

import { pick } from '../../lib/i18n';
import { studioStrings } from '../../lib/studio/strings';

export default function OwnerBar({ name, lang, state, onPublish }) {
  const s = studioStrings(lang);

  return (
    <header className="bar">
      <span className="diamond" aria-hidden="true" />
      <h1 className="owner">{pick(name, lang)}</h1>
      <span className="spacer" />

      {state === 'never' && <span className="quiet">{s.onlyYou}</span>}
      {state === 'ahead' && (
        <span className="ahead">
          <span className="dot" aria-hidden="true" />
          {s.notLive}
        </span>
      )}
      {state === 'synced' && (
        <span className="quiet">
          <span className="tick" aria-hidden="true">✓</span>
          {s.upToDate}
        </span>
      )}

      {/* No Publish button when there is nothing to publish, and none while
          offline — reactivating is the only action that matters there. */}
      {(state === 'never' || state === 'ahead') && (
        <button type="button" className="publish" onClick={onPublish}>
          {s.publish}
        </button>
      )}

      <style jsx>{`
        .bar {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-4) 0 var(--space-3);
          margin-bottom: var(--space-4);
          flex-wrap: wrap;
        }
        .diamond {
          width: 10px;
          height: 10px;
          flex: none;
          background: var(--brand);
          border-radius: 1px;
          transform: rotate(43deg);
        }
        .owner {
          margin: 0;
          font-family: var(--font-heading);
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.015em;
        }
        :global([dir='rtl']) .owner { letter-spacing: 0; font-size: 19px; }
        .spacer { flex: 1; }
        .quiet, .ahead {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          font-size: 13.5px;
          color: var(--text-secondary);
        }
        .dot {
          width: 7px;
          height: 7px;
          flex: none;
          border-radius: 50%;
          background: var(--brand);
        }
        .tick { color: var(--success, #3ECF8E); }
        .publish {
          border: 0;
          border-radius: var(--radius-sm);
          padding: 8px 15px;
          font: inherit;
          font-weight: 600;
          font-size: 14px;
          background: var(--accent);
          color: var(--accent-fg);
          cursor: pointer;
          transition: background var(--t-ui) var(--ease),
                      transform var(--t-press) var(--ease);
        }
        .publish:hover { background: var(--accent-hover); }
        .publish:active { transform: translateY(1px); }
      `}</style>
    </header>
  );
}
