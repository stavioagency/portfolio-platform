// Toast — replaces alert() for feedback that does not need a decision.
//
// Usage:
//   const toast = useToast();
//   toast.error(t('save_failed'));
//   toast.success(t('saved'));
//
// Notes:
//   * RTL-safe: positioned with inset-inline, animates on the block axis only,
//     so nothing needs flipping for Arabic.
//   * Errors get role="alert" (assertive); success/info are polite.
//   * Full-width along the bottom under 640px.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const DEFAULT_DURATION = { success: 3500, info: 4000, error: 6000 };
const EXIT_MS = 180;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    const t = setTimeout(() => {
      setToasts((list) => list.filter((x) => x.id !== id));
      timers.current.delete(`x${id}`);
    }, EXIT_MS);
    timers.current.set(`x${id}`, t);
  }, []);

  const show = useCallback((message, opts = {}) => {
    if (!message) return null;
    const variant = opts.variant || 'info';
    const id = ++idRef.current;
    setToasts((list) => [...list.slice(-2), { id, message, variant, leaving: false }]);
    const ms = opts.duration ?? DEFAULT_DURATION[variant] ?? 4000;
    if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms));
    return id;
  }, [dismiss]);

  // clear every pending timer on unmount
  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach(clearTimeout); map.clear(); };
  }, []);

  const api = useMemo(() => ({
    show,
    dismiss,
    success: (m, o) => show(m, { ...o, variant: 'success' }),
    error: (m, o) => show(m, { ...o, variant: 'error' }),
    info: (m, o) => show(m, { ...o, variant: 'info' }),
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toast-wrap" aria-live="polite">
        {toasts.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`toast ${x.variant} ${x.leaving ? 'leaving' : ''}`}
            role={x.variant === 'error' ? 'alert' : 'status'}
            onClick={() => dismiss(x.id)}
          >
            <span className="mark" aria-hidden="true">
              {x.variant === 'success' ? '✓' : x.variant === 'error' ? '!' : 'i'}
            </span>
            <span className="msg">{x.message}</span>
          </button>
        ))}
      </div>
      <style jsx>{`
        .ui-toast-wrap {
          position: fixed;
          inset-block-end: var(--space-4);
          inset-inline-end: var(--space-4);
          z-index: var(--z-toast);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          pointer-events: none;
        }
        .toast {
          pointer-events: auto;
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          inline-size: min(380px, calc(100vw - var(--space-5) * 2));
          padding: var(--space-3) var(--space-4);
          text-align: start;
          background: var(--bg-elevated);
          color: var(--text-primary);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          font-family: var(--font-sans);
          font-size: var(--text-md);
          line-height: 1.45;
          cursor: pointer;
          animation: ui-toast-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
        }
        .toast.leaving {
          animation: ui-toast-out ${EXIT_MS}ms ease-in forwards;
        }
        .mark {
          flex-shrink: 0;
          inline-size: 20px;
          block-size: 20px;
          margin-block-start: 1px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          font-size: var(--text-xs);
          font-weight: 800;
        }
        .msg { flex: 1; min-inline-size: 0; overflow-wrap: anywhere; }

        .success { border-color: var(--success-border); }
        .success .mark { background: var(--success-bg); color: var(--success); }
        .error { border-color: var(--danger-border); }
        .error .mark { background: var(--danger-bg); color: var(--danger); }
        .info .mark { background: rgba(159, 167, 255, 0.14); color: var(--accent); }

        @keyframes ui-toast-in {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        @keyframes ui-toast-out {
          to { opacity: 0; transform: translateY(6px) scale(0.98); }
        }

        @media (max-width: 640px) {
          .ui-toast-wrap {
            inset-inline: var(--space-3);
            inset-block-end: var(--space-3);
          }
          .toast { inline-size: 100%; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  // Provider missing (should not happen) — never swallow the message.
  const fallback = (m) => { if (m) console.error('[toast]', m); return null; };
  return { show: fallback, dismiss: () => {}, success: fallback, error: fallback, info: fallback };
}

export default ToastProvider;
