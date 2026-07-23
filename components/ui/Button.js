// Button — the one place button styling is defined.
// Replaces the duplicated .btn-primary-inline / .btn-add / .empty-cta rules.
// Variants: primary | secondary | ghost | danger   Sizes: sm | md
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`ui-btn ${variant} ${size} ${block ? 'block' : ''} ${className}`}
      {...rest}
    >
      {loading && <span className="spin" aria-hidden="true" />}
      {children}
      <style jsx>{`
        .ui-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          font-family: var(--font-sans);
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background var(--transition), border-color var(--transition),
                      color var(--transition), opacity var(--transition);
        }
        .ui-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .ui-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .block { width: 100%; }

        /* sizes — md meets the 44px mobile tap target */
        .sm { min-height: 34px; padding: 0 var(--space-3); font-size: var(--text-sm); }
        .md { min-height: 44px; padding: 0 var(--space-4); font-size: var(--text-md); }

        .primary { background: var(--accent); color: var(--accent-fg); }
        .primary:hover:not(:disabled) { background: var(--accent-hover); }

        .secondary {
          background: var(--bg-elevated);
          color: var(--text-primary);
          border-color: var(--border-strong);
        }
        .secondary:hover:not(:disabled) { background: var(--bg-hover); }

        .ghost { background: transparent; color: var(--text-secondary); }
        .ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }

        .danger {
          background: var(--danger-bg);
          color: var(--danger);
          border-color: var(--danger-border);
        }
        .danger:hover:not(:disabled) { background: var(--danger); color: var(--danger-fg); }

        .spin {
          width: 13px;
          height: 13px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: ui-spin 0.7s linear infinite;
        }
        @keyframes ui-spin { to { transform: rotate(360deg); } }
      `}</style>
    </button>
  );
}
