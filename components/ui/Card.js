// Card — the standard elevated surface (settings blocks, list rows, panels).
// pad: none | sm | md | lg
export default function Card({
  pad = 'md',
  elevated = false,
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <div
      className={`ui-card pad-${pad} ${elevated ? 'elev' : ''} ${interactive ? 'act' : ''} ${className}`}
      {...rest}
    >
      {children}
      <style jsx>{`
        .ui-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          transition: border-color var(--transition), background var(--transition);
        }
        .pad-none { padding: 0; }
        .pad-sm { padding: var(--space-3); }
        .pad-md { padding: var(--space-4); }
        .pad-lg { padding: var(--space-5); }
        .elev { background: var(--bg-elevated); box-shadow: var(--shadow-sm); }
        .act { cursor: pointer; }
        .act:hover { border-color: var(--border-strong); background: var(--bg-hover); }
        .act:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>
    </div>
  );
}

export function CardHeader({ title, description, action }) {
  return (
    <div className="ui-card-head">
      <div className="txt">
        <div className="title">{title}</div>
        {description && <div className="desc">{description}</div>}
      </div>
      {action && <div className="act">{action}</div>}
      <style jsx>{`
        .ui-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-3);
          margin-block-end: var(--space-3);
        }
        .title {
          font-size: var(--text-lg);
          font-weight: 700;
          color: var(--text-primary);
        }
        .desc {
          margin-block-start: var(--space-1);
          font-size: var(--text-sm);
          color: var(--text-tertiary);
          line-height: 1.5;
        }
        .act { flex-shrink: 0; }
      `}</style>
    </div>
  );
}
