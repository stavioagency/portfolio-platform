// Input — consistent text field styling. `as` renders input | textarea | select.
// Logical properties throughout so RTL needs no overrides.
export default function Input({
  as = 'input',
  invalid = false,
  className = '',
  children,
  ...rest
}) {
  const Tag = as;
  return (
    <>
      <Tag className={`ui-input ${as} ${invalid ? 'invalid' : ''} ${className}`} {...rest}>
        {children}
      </Tag>
      <style jsx>{`
        .ui-input {
          display: block;
          inline-size: 100%;
          min-block-size: var(--tap-min);
          padding: var(--space-3);
          background: var(--surface-input);
          color: var(--text-primary);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-sm);
          font-family: var(--font-sans);
          font-size: var(--text-md);
          line-height: 1.4;
          transition: border-color var(--transition), background var(--transition);
        }
        .ui-input::placeholder { color: var(--text-muted); }
        .ui-input:hover:not(:disabled) { border-color: var(--text-muted); }
        /* Design system §6.7: focus is --border-focus PLUS a 2px --brand-focus
           ring, and the focus indicator is never removed. The ring is a
           box-shadow rather than an outline so it follows the field's radius. */
        .ui-input:focus {
          outline: none;
          border-color: var(--border-focus);
          box-shadow: 0 0 0 2px var(--brand-focus);
        }
        /* The disabled surface stays on --bg-secondary: DS-2 declined to create a
           --field-bg-disabled alias, so there is no semantic name to move it to. */
        .ui-input:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          background: var(--bg-secondary);
        }
        .invalid { border-color: var(--danger); }
        .textarea { min-block-size: 96px; resize: vertical; line-height: 1.6; }
        .select { cursor: pointer; }
      `}</style>
    </>
  );
}

// Small helper text under a field. tone: muted | error
export function Hint({ tone = 'muted', children }) {
  return (
    <div className={`ui-hint ${tone}`}>
      {children}
      <style jsx>{`
        .ui-hint {
          margin-block-start: var(--space-1);
          font-size: var(--text-xs);
          line-height: 1.5;
        }
        .muted { color: var(--text-muted); }
        .error { color: var(--danger); }
      `}</style>
    </div>
  );
}
