// AttentionQueue — the Studio home's answer to "what should I do next?"
//
// Not a task list and not a completion meter. Rules it enforces (design.md §6,
// blueprint §6.2):
//
//   * every item is the link to the thing it names — nothing reports a problem
//     you then have to go find
//   * every item names what clears it
//   * nothing implies the client failed. These are offers, not defects
//   * it is finite and genuinely empties, into a state worth arriving at
//   * no counts, no percentages, no progress ring — a percentage turns a
//     portfolio into a form to complete
//
// Copy comes from lib/studio/strings.js; which items exist is decided by
// lib/studio/draft.js. This component only renders.

import { isSkippable, QUEUE_IDS } from '../../lib/studio/draft';
import { studioStrings } from '../../lib/studio/strings';

function itemCopy(item, s) {
  switch (item.kind) {
    case 'add-work':
      return {
        title: s.addWorkTitle,
        body: s.addWorkBody,
        actions: [{ id: 'add', label: s.addWorkAction, primary: true }],
      };
    case 'bio-suggestion':
      return {
        title: s.bioTitle,
        body: s.bioBody,
        actions: [
          { id: 'keep', label: s.bioKeep },
          { id: 'another', label: s.bioAnother },
          { id: 'mine', label: s.bioMine },
        ],
      };
    case 'unnamed-pieces':
      return {
        title: s.piecesTitle(item.count),
        body: s.piecesBody,
        actions: [{ id: 'name', label: s.piecesAction }],
      };
    case 'unpublished':
      // No action button. Publish already sits in the header, permanently, and
      // two identical primary buttons 300px apart on one calm screen is
      // clutter — it also made the screen say the same thing twice. This item
      // is the persistent reminder and the explanation of what visitors are
      // seeing meanwhile; the header owns the act.
      return {
        title: s.unpublishedTitle(item.count),
        body: s.unpublishedBody,
        actions: [],
      };
    default:
      return null;
  }
}

export default function AttentionQueue({
  items,
  lang,
  firstPublish,
  onAction,
  onSkip,
  onPublish,
}) {
  const s = studioStrings(lang);

  // Empty is the goal, and it says which kind of empty it is. "Ready when you
  // are" is the handoff before a first publish; "nothing needs you" is the
  // quiet state of a portfolio that is already up to date.
  if (items.length === 0) {
    return (
      <section className="empty">
        <b>{firstPublish ? s.readyTitle : s.clearTitle}</b>
        <span>{firstPublish ? s.readyBody : s.clearBody}</span>
        {firstPublish && (
          <div>
            <button type="button" className="go" onClick={onPublish}>
              {s.publish}
            </button>
          </div>
        )}
        <style jsx>{`
          /* Not dashed. A dashed outline is the convention for "content is
             missing here", and this is the opposite: the state the client has
             arrived at, where nothing is missing and nothing is owed. It reads
             as a quiet resting surface instead. */
          .empty {
            border: 1px solid var(--border);
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
            padding: var(--space-6) var(--space-4);
            text-align: center;
            color: var(--text-secondary);
            font-size: 14px;
          }
          b {
            display: block;
            font-family: var(--font-heading);
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 2px;
          }
          .go {
            margin-top: var(--space-3);
            border: 0;
            border-radius: var(--radius-sm);
            padding: 8px 15px;
            font: inherit;
            font-weight: 600;
            background: var(--accent);
            color: var(--accent-fg);
            cursor: pointer;
          }
        `}</style>
      </section>
    );
  }

  return (
    <section className="queue">
      {/* "A few things waiting" — warm, honest, and it puts the patience on
          our side: the things wait for you, you are not behind. Count-aware,
          because "a few" over one item is wrong. */}
      <h2>{items.length === 1 ? s.queueOne : s.queueMany}</h2>

      {items.map((item, i) => {
        const copy = itemCopy(item, s);
        if (!copy) return null;
        return (
          <article
            key={item.id}
            className="item"
            /* A 60ms step (--t-stag) so the list settles in sequence rather
               than snapping in as a block. Composed, not animated. */
            style={{ animationDelay: `calc(var(--t-stag) * ${i})` }}
          >
            <div className="txt">
              <b>{copy.title}</b>
              <i>{copy.body}</i>
            </div>
            <div className="acts">
              {copy.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={action.primary ? 'go' : 'ghost'}
                  onClick={() =>
                    item.id === QUEUE_IDS.UNPUBLISHED
                      ? onPublish()
                      : onAction(item, action.id)
                  }
                >
                  {action.label}
                </button>
              ))}
              {/* The unpublished-changes guard is not skippable: dismissing it
                  would recreate the risk it exists to remove. */}
              {isSkippable(item) && (
                <button type="button" className="skip" onClick={() => onSkip(item.id)}>
                  {s.skip}
                </button>
              )}
            </div>
          </article>
        );
      })}

      <style jsx>{`
        h2 {
          margin: var(--space-6) 0 var(--space-3);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--text-secondary);
        }
        :global([dir='rtl']) h2 {
          font-family: var(--font-heading);
          letter-spacing: 0;
          font-size: 15px;
        }
        .item {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          flex-wrap: wrap;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-4) var(--space-5);
          margin-bottom: var(--space-2);
          animation: item-in var(--t-enter) var(--ease) both;
        }
        @keyframes item-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .item { animation: none; }
        }
        .txt { flex: 1; min-width: 220px; }
        .txt b { display: block; font-weight: 600; font-size: 14.5px; }
        .txt i {
          display: block;
          font-style: normal;
          font-size: 13px;
          color: var(--text-tertiary);
          margin-top: 1px;
        }
        .acts {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        button {
          font: inherit;
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: 13px;
          padding: 6px 12px;
          transition: background var(--t-ui) var(--ease),
                      color var(--t-ui) var(--ease);
        }
        .go {
          border: 0;
          font-weight: 600;
          background: var(--accent);
          color: var(--accent-fg);
        }
        .go:hover { background: var(--accent-hover); }
        .ghost {
          background: transparent;
          border: 1px solid var(--border-strong);
          color: var(--text-secondary);
        }
        .ghost:hover { background: var(--bg-hover); color: var(--text-primary); }
        .skip {
          border: 0;
          background: none;
          color: var(--text-tertiary);
          padding: 6px 4px;
        }
        .skip:hover { color: var(--text-secondary); }
      `}</style>
    </section>
  );
}
