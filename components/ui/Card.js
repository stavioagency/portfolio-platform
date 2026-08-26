// Card — the standard elevated surface (settings blocks, list rows, panels).
// pad: none | sm | md | lg
// `as` exists because several of the admin's card surfaces are clickable rows —
// real <button>s, not divs — and they should keep that semantics.
export default function Card({
  as: Tag = 'div',
  pad = 'md',
  elevated = false,
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      className={`ui-card pad-${pad} ${elevated ? 'elev' : ''} ${interactive ? 'act' : ''} ${className}`}
      {...(Tag === 'button' ? { type: 'button' } : {})}
      {...rest}
    >
      {children}
      <style jsx>{`
        .ui-card {
          background: var(--surface-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          transition: border-color var(--transition), background var(--transition);
        }
        .pad-none { padding: 0; }
        .pad-sm { padding: var(--space-3); }
        .pad-md { padding: var(--space-4); }
        .pad-lg { padding: var(--space-5); }
        /* Design system §6.1: "A card with a border and a shadow and a contrasting
           fill is three separations doing one job." An elevated card separates by
           surface and shadow, so it drops the border. */
        .elev {
          background: var(--surface-elevated);
          box-shadow: var(--shadow-sm);
          border-color: transparent;
        }
        .act { cursor: pointer; }
        .act:hover { border-color: var(--border-strong); background: var(--surface-hover); }
        .act:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        /* when rendered as a button, drop the UA chrome the reset does not cover */
        button.ui-card { inline-size: 100%; text-align: start; font-family: inherit; color: inherit; }
      `}</style>
    </Tag>
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
