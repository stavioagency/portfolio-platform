// ConfirmDialog — replaces confirm() and the "type the word" prompt().
//
// Usage (returns a Promise<boolean>, so call sites keep their shape):
//   const confirm = useConfirm();
//   if (!(await confirm({ title, description, tone: 'danger' }))) return;
//
// For the destructive "type DELETE to continue" flow:
//   await confirm({ ..., requireText: 'DELETE' })
//
// Accessibility: role="dialog" + aria-modal, labelled by its title, focus moved
// in on open and restored on close, Tab trapped inside, Esc cancels, Enter
// confirms (only when the typed keyword matches, if one is required).
// RTL: logical properties only; the button row follows the document direction.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ConfirmContext = createContext(null);
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])';

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { opts, resolve }
  const [typed, setTyped] = useState('');
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    restoreFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    setTyped('');
    setState({ opts, resolve });
  }), []);

  const close = useCallback((result) => {
    setState((cur) => {
      if (cur) cur.resolve(result);
      return null;
    });
    // hand focus back to whatever opened the dialog
    const el = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0);
  }, []);

  const opts = state?.opts;
  const needsText = !!opts?.requireText;
  const canConfirm = !needsText || typed.trim() === String(opts.requireText).trim();

  // focus the safest control on open, and lock background scroll
  useEffect(() => {
    if (!state) return undefined;
    const node = dialogRef.current;
    const target = node?.querySelector('[data-autofocus]') || node?.querySelector(FOCUSABLE);
    if (target) target.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [state]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (canConfirm) { e.preventDefault(); close(true); }
      return;
    }
    if (e.key !== 'Tab') return;
    // trap Tab inside the dialog
    const items = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])
      .filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const api = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {state && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div className="ui-confirm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
          <div
            className={`dialog ${opts.tone === 'danger' ? 'danger' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ui-confirm-title"
            aria-describedby={opts.description ? 'ui-confirm-desc' : undefined}
            ref={dialogRef}
            onKeyDown={onKeyDown}
          >
            <h2 className="title" id="ui-confirm-title">{opts.title}</h2>
            {opts.description && <p className="desc" id="ui-confirm-desc">{opts.description}</p>}

            {needsText && (
              <label className="req">
                <span className="req-label">
                  {opts.requireTextLabel || `Type ${opts.requireText} to confirm`}
                </span>
                <input
                  className="req-input"
                  data-autofocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>
            )}

            <div className="row">
              <button
                type="button"
                className="btn cancel"
                onClick={() => close(false)}
                {...(needsText ? {} : { 'data-autofocus': true })}
              >
                {opts.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                className="btn ok"
                disabled={!canConfirm}
                onClick={() => close(true)}
              >
                {opts.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>

          <style jsx>{`
            .ui-confirm-backdrop {
              position: fixed;
              inset: 0;
              z-index: var(--z-modal);
              display: grid;
              place-items: center;
              padding: var(--space-4);
              background: rgba(4, 4, 8, 0.66);
              backdrop-filter: blur(3px);
              animation: fade 0.16s ease;
            }
            .dialog {
              inline-size: min(440px, 100%);
              max-block-size: calc(100vh - var(--space-8));
              overflow-y: auto;
              padding: var(--space-5);
              background: var(--bg-elevated);
              border: 1px solid var(--border-strong);
              border-radius: var(--radius-lg);
              box-shadow: var(--shadow-lg);
              font-family: var(--font-sans);
              animation: ui-pop 0.18s cubic-bezier(0.2, 0.9, 0.3, 1);
            }
            .title {
              margin: 0;
              font-family: var(--font-heading);
              font-size: var(--text-xl);
              font-weight: 700;
              line-height: 1.3;
              color: var(--text-primary);
            }
            .desc {
              margin-block-start: var(--space-2);
              font-size: var(--text-md);
              line-height: 1.6;
              color: var(--text-secondary);
            }
            .req { display: block; margin-block-start: var(--space-4); }
            .req-label {
              display: block;
              margin-block-end: var(--space-2);
              font-size: var(--text-sm);
              color: var(--text-tertiary);
            }
            .req-input {
              inline-size: 100%;
              min-block-size: 44px;
              padding: var(--space-3);
              background: var(--bg-primary);
              color: var(--text-primary);
              border: 1px solid var(--border-strong);
              border-radius: var(--radius-sm);
              font-family: var(--font-sans);
              font-size: var(--text-md);
            }
            .req-input:focus { outline: none; border-color: var(--accent); }
            .row {
              display: flex;
              justify-content: flex-end;
              gap: var(--space-2);
              margin-block-start: var(--space-5);
            }
            .btn {
              min-block-size: 44px;
              padding: 0 var(--space-4);
              border: 1px solid transparent;
              border-radius: var(--radius-sm);
              font-family: var(--font-sans);
              font-size: var(--text-md);
              font-weight: 600;
              cursor: pointer;
              transition: background var(--transition), color var(--transition);
            }
            .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
            .btn:disabled { opacity: 0.45; cursor: not-allowed; }
            .cancel {
              background: transparent;
              color: var(--text-secondary);
              border-color: var(--border-strong);
            }
            .cancel:hover { background: var(--bg-hover); color: var(--text-primary); }
            .ok { background: var(--brand); color: var(--brand-ink); }
            .ok:hover:not(:disabled) { background: var(--brand-hover); }
            .danger .ok { background: var(--danger); color: var(--danger-fg); }
            .danger .ok:hover:not(:disabled) { background: #ff9a9a; }

            @keyframes ui-pop {
              from { opacity: 0; transform: translateY(8px) scale(0.98); }
              to { opacity: 1; transform: none; }
            }

            @media (max-width: 640px) {
              .ui-confirm-backdrop { place-items: end center; padding: var(--space-3); }
              .dialog { inline-size: 100%; padding: var(--space-4); }
              .row { flex-direction: column-reverse; }
              .btn { inline-size: 100%; }
            }
          `}</style>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (ctx) return ctx;
  // Provider missing (should not happen) — degrade to the native dialog rather
  // than silently confirming a destructive action.
  return async (opts = {}) => {
    if (typeof window === 'undefined') return false;
    const text = [opts.title, opts.description].filter(Boolean).join('\n\n');
    return window.confirm(text);
  };
}

export default ConfirmProvider;
