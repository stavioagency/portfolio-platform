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
      // A loading button goes disabled and grows a spinner, both of which are
      // purely visual — a screen reader otherwise announces it as an ordinary
      // disabled button with no indication that work is in flight.
      aria-busy={loading || undefined}
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
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background var(--transition), border-color var(--transition),
                      color var(--transition), opacity var(--transition);
        }
        .ui-btn:focus-visible {
          outline: 2px solid var(--border-focus);
          outline-offset: 2px;
        }
        /* 0.5 dropped an already-secondary label under the 4.5:1 line and made
           "disabled" read as "broken". 0.65 still reads as clearly inactive
           while keeping the label legible — and a button that is merely BUSY
           stays at full strength, because its text is the only thing telling
           the user what is happening. */
        .ui-btn:disabled { opacity: 0.65; cursor: not-allowed; }
        .ui-btn[aria-busy='true']:disabled { opacity: 1; cursor: progress; }
        .block { width: 100%; }

        /* sizes — md meets the 44px mobile tap target everywhere; sm is compact on
           desktop and grows to 44px on phones, matching the admin's existing rule */
        .sm { min-height: 34px; padding: 0 var(--space-3); font-size: 13px; }
        .md { min-height: var(--tap-min); padding: 0 var(--space-4); font-size: var(--text-md); }
        @media (max-width: 640px) {
          .sm { min-height: var(--tap-min); padding: 0 var(--space-4); font-size: var(--text-md); }
        }

        /* FLAT, and deliberately so. The logo is a single solid colour with no
           gradient, glow or shadow anywhere in it, so a gradient button was
           making a claim about depth and material that the brand does not make.
           A gradient is also underivable from one token: every future accent
           change would mean re-authoring two stops and a coloured shadow. */
        .primary {
          background: var(--action-primary-bg);
          color: var(--action-primary-fg);
        }
        .primary:hover:not(:disabled) { background: var(--action-primary-bg-hover); }

        .secondary {
          background: var(--action-secondary-bg);
          color: var(--action-secondary-fg);
          border-color: var(--action-secondary-border);
        }
        .secondary:hover:not(:disabled) { background: var(--action-secondary-bg-hover); }

        .ghost { background: transparent; color: var(--action-ghost-fg); }
        .ghost:hover:not(:disabled) { background: var(--action-ghost-bg-hover); color: var(--action-ghost-fg-hover); }

        .danger {
          background: var(--action-danger-bg);
          color: var(--action-danger-fg);
          border-color: var(--action-danger-border);
        }
        .danger:hover:not(:disabled) { background: var(--action-danger-bg-hover); color: var(--action-danger-fg-hover); }

        .spin {
          width: 13px;
          height: 13px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin var(--t-spin) linear infinite;
        }
      `}</style>
    </button>
  );
}
