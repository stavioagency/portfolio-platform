// This piece — one piece of work at a time.
//
// There is no list of pieces anywhere in the Studio: a list is the first step
// towards a content manager. You reach a piece by touching it in your own
// portfolio, and this panel only ever shows that one.
//
// Ordering lives here, and it is CURATION, NOT LAYOUT CONTROL — two explicit
// moves, no drag. A drag handle invites builder expectations, needs a drop
// target, and is the one control that has to work under a thumb.

import FocusPanel from '../FocusPanel';
import BilingualField from '../BilingualField';
import { studioStrings } from '../../../lib/studio/strings';
import { canMoveEarlier, canMoveLater } from '../../../lib/studio/editor';

export default function PiecePanel({
  draft,
  pieceId,
  lang,
  focus,
  onClose,
  onPieceField,
  onPiecePatch,
  onMoveEarlier,
  onMoveLater,
}) {
  const s = studioStrings(lang);
  const pieces = draft.pieces || [];
  const piece = pieces.find((p) => p.id === pieceId);

  // The piece can vanish underneath the panel — deleted elsewhere, or the
  // draft replaced. Close rather than render an empty shell.
  if (!piece) return null;

  const position = pieces.findIndex((p) => p.id === pieceId) + 1;

  return (
    <FocusPanel title={s.panelPiece} onClose={onClose} footer={<span>✓ {s.saved}</span>}>
      <div className="cover">
        <span className="lbl">{s.fCover}</span>
        <div
          className="thumb"
          style={piece.cover
            ? { backgroundImage: `url(${piece.cover})` }
            : { background: piece.tone || 'var(--bg-elevated)' }}
        />
        {/* No "replace" button until the media pipeline exists. The cover
            itself stays — it is the client's work, and showing it is honest —
            but a disabled control would invite a click that cannot be
            answered, and teach them the product is unfinished. */}
      </div>

      <BilingualField
        label={s.fPieceName}
        value={piece.name}
        uiLang={lang}
        autoFocus={focus === 'name'}
        onChange={(l, v) => onPieceField(pieceId, 'name', l, v)}
      />

      <BilingualField
        label={s.fDescription}
        value={piece.description}
        uiLang={lang}
        multiline
        placeholder={s.fDescriptionHint}
        onChange={(l, v) => onPieceField(pieceId, 'description', l, v)}
      />

      <label className="plain">
        <span className="lbl">{s.fLink}</span>
        {/* Not bilingual: a URL has no language. */}
        <input
          type="url"
          dir="ltr"
          placeholder={s.fLinkHint}
          value={piece.link || ''}
          onChange={(e) => onPiecePatch(pieceId, { link: e.target.value })}
        />
      </label>

      <div className="order">
        <span className="lbl">{s.ordering}</span>
        <div className="moves">
          <button
            type="button"
            className="ghost"
            disabled={!canMoveEarlier(pieces, pieceId)}
            onClick={() => onMoveEarlier(pieceId)}
          >
            {s.moveEarlier}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!canMoveLater(pieces, pieceId)}
            onClick={() => onMoveLater(pieceId)}
          >
            {s.moveLater}
          </button>
          {/* A sentence, not a bare figure. */}
          <span className="where">
            {lang === 'ar'
              ? `${position} من ${pieces.length}`
              : `${position} of ${pieces.length}`}
          </span>
        </div>
      </div>

      <style jsx>{`
        .cover, .order, .plain { display: grid; gap: 6px; }
        .lbl { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
        .thumb {
          aspect-ratio: 16 / 10;
          border-radius: var(--radius-sm);
          background-size: cover;
          background-position: center;
          border: 1px solid var(--border);
        }
        .moves { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
        .where { font-size: 12px; color: var(--text-tertiary); }
        input {
          font: inherit;
          font-size: 14px;
          width: 100%;
          color: var(--text-primary);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 9px 11px;
        }
        input::placeholder { color: var(--text-muted); }
        input:focus {
          outline: none;
          border-color: var(--brand-line);
          box-shadow: 0 0 0 3px var(--brand-focus);
        }
        .ghost {
          font: inherit;
          cursor: pointer;
          font-size: 13px;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          background: transparent;
          border: 1px solid var(--border-strong);
          color: var(--text-secondary);
          transition: background var(--t-ui) var(--ease), color var(--t-ui) var(--ease);
        }
        .ghost:hover:not([disabled]) { background: var(--bg-hover); color: var(--text-primary); }
        .ghost[disabled] { opacity: 0.4; cursor: default; }
      `}</style>
    </FocusPanel>
  );
}
