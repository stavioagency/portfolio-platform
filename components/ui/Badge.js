// Badge — status pills (domain status, tenant status, roles, counts).
// tone: neutral | success | warning | danger | accent
export default function Badge({ tone = 'neutral', dot = false, className = '', children, ...rest }) {
  return (
    <span className={`ui-badge ${tone} ${className}`} {...rest}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
      <style jsx>{`
        .ui-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: 3px var(--space-2);
          border: 1px solid transparent;
          border-radius: 999px;
          font-size: var(--text-xs);
          font-weight: 600;
          line-height: 1.6;
          white-space: nowrap;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .neutral {
          background: var(--bg-elevated);
          color: var(--text-tertiary);
          border-color: var(--border);
        }
        .success { background: var(--success-bg); color: var(--success); border-color: var(--success-border); }
        .warning { background: var(--warning-bg); color: var(--warning); border-color: var(--warning-border); }
        .danger  { background: var(--danger-bg);  color: var(--danger);  border-color: var(--danger-border); }
        .accent  { background: rgba(159, 167, 255, 0.12); color: var(--accent); border-color: rgba(159, 167, 255, 0.28); }
      `}</style>
    </span>
  );
}
