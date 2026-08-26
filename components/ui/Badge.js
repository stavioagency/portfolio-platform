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
          background: var(--neutral-bg);
          color: var(--neutral-ink);
          border-color: var(--neutral-border);
        }
        /* DS-3 moved the tints and borders onto the semantic --status-* aliases.
           THE LABEL COLOURS DELIBERATELY DO NOT FOLLOW, and as of DS-4 that is a
           CLOSED DECISION rather than a hold — do not "finish" it.

           Measured, both themes, label on its own composited chip:
             success 10.36 / 4.74   warning 10.05 / 5.16   danger 7.02 / 4.75
           Every reachable tone already clears WCAG AA. --status-*-fg resolves to
           --*-ink, which would raise those to 7-11:1 — headroom, not compliance.
           Adopting it is a visible change to 13 call sites buying no
           accessibility, so it needs sign-off, not a tidy-up.

           .neutral IS a live tone. DS-4 recorded here that it was unreachable;
           that was wrong, and the claim is obsolete. It arrives from
           lib/billing-status.js — TONES maps 'none' and 'canceled' to it,
           PAYMENT_TONES maps 'refunded' and 'voided', and both carry an
           || 'neutral' fallback for any unknown state — and it renders at
           three Badge call sites in pages/admin.js.
           The chip used to paint --text-tertiary on --bg-elevated, measuring
           3.31:1 on the light theme against the 4.5 that 11px/600 text
           requires. That was a real defect and it was already shipping; DS-6
           repaired it by moving to the --neutral-* set, which was declared in
           both themes and had no consumer, and which measures 8.43 dark /
           8.48 light.

           .accent keeps the retired #9FA7FF for a measured reason, not inertia:
           it composites to 4.91 / 4.69, and EVERY already-declared alternative is
           worse on light — --brand-soft 4.35, --bg-elevated 4.38, --neutral-bg
           4.45, all under AA. Retiring it needs a new token, not a substitution. */
        .success { background: var(--status-success-bg); color: var(--success); border-color: var(--status-success-border); }
        .warning { background: var(--status-warning-bg); color: var(--warning); border-color: var(--status-warning-border); }
        .danger  { background: var(--status-danger-bg);  color: var(--danger);  border-color: var(--status-danger-border); }
        .accent  { background: rgba(159, 167, 255, 0.12); color: var(--accent); border-color: rgba(159, 167, 255, 0.28); }
      `}</style>
    </span>
  );
}
