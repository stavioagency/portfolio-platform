// FocusPanel — the shell every editing panel borrows.
//
// Trial 2's rule, kept: at rest, ZERO form fields are visible. A panel exists
// only while something is selected, shows only that thing's fields, and closes
// back to the portfolio.
//
// It is NOT a modal and must never become one. There is no backdrop and
// nothing that covers the portfolio, because the client has to see the effect
// of what they are changing — if they cannot, the panel has failed at the one
// job it has.
//
// It is also not a sidebar: it does not persist, it holds no navigation, and
// nothing routes to it.

import { useEffect, useRef } from 'react';

export default function FocusPanel({ title, onClose, children, footer }) {
  const ref = useRef(null);

  // Escape closes, from anywhere inside the panel or the canvas.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Move focus into the panel when it opens, so a keyboard user is taken to
  // the thing they just chose to edit rather than left on the canvas.
  // Deliberately NOT a focus trap: this is not a modal, and a client must be
  // able to tab back out to their portfolio.
  useEffect(() => {
    const first = ref.current?.querySelector('input, textarea, button, [tabindex]');
    if (first) first.focus({ preventScroll: true });
  }, []);

  return (
    <aside ref={ref} className="panel" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="body">{children}</div>

      {footer && <div className="foot">{footer}</div>}

      <style jsx>{`
        .panel {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: var(--space-4) var(--space-5) var(--space-5);
          animation: panel-in var(--t-enter) var(--ease) both;
        }
        @keyframes panel-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .panel { animation: none; }
        }
        header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-bottom: var(--space-4);
        }
        h2 {
          margin: 0;
          flex: 1;
          font-family: var(--font-heading);
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        :global([dir='rtl']) h2 { letter-spacing: 0; font-size: 16px; }
        .close {
          font: inherit;
          cursor: pointer;
          border: 0;
          background: none;
          color: var(--text-tertiary);
          font-size: 14px;
          line-height: 1;
          padding: 4px 6px;
          border-radius: var(--radius-sm);
          transition: color var(--t-ui) var(--ease), background var(--t-ui) var(--ease);
        }
        .close:hover { color: var(--text-primary); background: var(--bg-hover); }
        .body { display: grid; gap: var(--space-4); }
        .foot {
          margin-top: var(--space-4);
          padding-top: var(--space-3);
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-wrap: wrap;
          font-size: 13px;
          color: var(--text-tertiary);
        }
      `}</style>
    </aside>
  );
}
