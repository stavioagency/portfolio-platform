// EmptyState — shown when a list has no rows yet. Replaces the ad-hoc
// "no projects / no links" paragraphs so every empty list reads the same.
export default function EmptyState({ icon, title, description, action, compact = false }) {
  return (
    <div className={`ui-empty ${compact ? 'compact' : ''}`}>
      {icon && <div className="icon" aria-hidden="true">{icon}</div>}
      <div className="title">{title}</div>
      {description && <p className="desc">{description}</p>}
      {action && <div className="action">{action}</div>}
      <style jsx>{`
        .ui-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: var(--space-8) var(--space-4);
          background: var(--bg-secondary);
          border: 1px dashed var(--border-strong);
          border-radius: var(--radius-md);
        }
        .compact { padding: var(--space-5) var(--space-4); }
        .icon {
          font-size: 26px;
          line-height: 1;
          margin-block-end: var(--space-3);
          opacity: 0.75;
        }
        .title {
          font-size: var(--text-lg);
          font-weight: 700;
          color: var(--text-primary);
        }
        .desc {
          margin-block-start: var(--space-2);
          max-inline-size: 42ch;
          font-size: var(--text-sm);
          color: var(--text-tertiary);
          line-height: 1.6;
        }
        .action { margin-block-start: var(--space-4); }
      `}</style>
    </div>
  );
}
