// PageHeader — the standard screen skeleton from design system §5.2.
//
//   EYEBROW              <- what this screen is for
//   Title                        [ one action ]
//   description
//   SUMMARY BAND         <- the state, in 3-4 figures (optional)
//
// Every screen in the client portal renders one of these. Before it existed,
// each screen hand-rolled an <h1> and two different rules fought over the
// result -- .content h1 set --text-2xl while .editor h1 hardcoded 24px, same
// specificity, so source order decided the size. One primitive, one answer.
//
// `lead` promotes the title to --text-4xl. Per §6.2 exactly one thing leads
// per screen, so exactly one SCREEN gets to be the lead screen: pass it on the
// client's Overview and nowhere else.
export default function PageHeader({
  eyebrow,
  title,
  description,
  action,
  lead = false,
  summary,
}) {
  return (
    <header className="pgh">
      <div className="pgh-top">
        <div className="pgh-txt">
          {eyebrow && <div className="eyebrow pgh-eyebrow">{eyebrow}</div>}
          <h1 className={`pgh-title ${lead ? 'is-lead' : ''}`}>{title}</h1>
        </div>
        {action && <div className="pgh-action">{action}</div>}
      </div>

      {description && <p className="pgh-desc">{description}</p>}

      {summary && summary.length > 0 && (
        <div className="pgh-summary">
          {summary.map((s) => (
            <div key={s.label} className={`pgh-stat ${s.tone && s.tone !== 'default' ? `is-${s.tone}` : ''}`}>
              <div className="pgh-stat-value numeric">{s.value}</div>
              <div className="pgh-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        /* §5.3: space separates, not a border. The rule that used to sit under
           the page title is gone; --space-8 does that job now. */
        .pgh { margin-block-end: var(--space-8); }

        .pgh-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-4);
        }
        .pgh-txt { min-width: 0; }
        /* §5.2: one action slot, bound to the screen's purpose. */
        .pgh-action { flex-shrink: 0; }

        .pgh-eyebrow { margin-block-end: var(--space-2); }

        /* §3.3: display sizes carry weight 800, and tight tracking is what makes
           display type read as designed rather than merely large. */
        .pgh-title {
          font-family: var(--font-heading);
          font-size: var(--text-3xl);
          font-weight: 800;
          line-height: var(--leading-tight);
          letter-spacing: var(--track-tight);
          color: var(--text-primary);
        }
        .pgh-title.is-lead {
          font-size: var(--text-4xl);
          letter-spacing: var(--track-lead);
        }

        /* §3.6 rule 1, non-negotiable: never letter-spacing on Arabic -- it
           severs the joins between letterforms. The display face carries the
           presence that tracking carries in Latin. */
        :global(html[dir='rtl']) .pgh-title {
          font-family: var(--font-display-ar);
          letter-spacing: 0;
        }
        /* .is-lead re-declares letter-spacing at its own specificity, so it
           needs its own reset -- a reset on .pgh-title alone does not undo it.
           Kept as a separate single-line selector rather than a comma list
           because tests/arabic-typography.test.mjs reads rules line by line. */
        :global(html[dir='rtl']) .pgh-title.is-lead {
          letter-spacing: 0;
        }

        .pgh-desc {
          margin-block-start: var(--space-3);
          max-width: var(--measure);
          font-size: var(--text-md);
          line-height: var(--leading-normal);
          color: var(--text-secondary);
        }
        :global(html[dir='rtl']) .pgh-desc { line-height: var(--leading-arabic); }

        /* ---- Summary band ------------------------------------------------
           §6.4: "It contains a single value -> that is a stat, not a card."
           So these are not cards. They are figures separated by space, each
           over a hairline -- §6.8's "horizontal rules only, never a full grid"
           applied to a band rather than a table.

           §6.2: emphasis is a modifier changing exactly two properties, a
           border colour and an ink colour. Nothing else moves. */
        .pgh-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--space-5);
          margin-block-start: var(--space-6);
        }
        .pgh-stat {
          border-block-start: 1px solid var(--border-default);
          padding-block-start: var(--space-3);
        }
        .pgh-stat-value {
          font-size: var(--text-2xl);
          font-weight: 700;
          line-height: var(--leading-snug);
          color: var(--text-primary);
        }
        .pgh-stat-label {
          margin-block-start: var(--space-1);
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-tertiary);
        }
        .is-danger { border-block-start-color: var(--danger-border); }
        .is-danger .pgh-stat-value { color: var(--danger-ink); }
        .is-warning { border-block-start-color: var(--warning-border); }
        .is-warning .pgh-stat-value { color: var(--warning-ink); }
        .is-success { border-block-start-color: var(--success-border); }
        .is-success .pgh-stat-value { color: var(--success-ink); }

        /* §5.5: summary tiles go 4 -> 2, NEVER 4 -> 1. Two figures side by side
           stay comparable; stacked they become a list and lose the at-a-glance
           read that is the entire point of the band. */
        @media (max-width: 720px) {
          .pgh-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }

          /* Stacking .pgh-top put the action BETWEEN the title and the sentence
             explaining it, which reads as an interruption. "display: contents"
             lifts the title and the action into .pgh's own column so the action
             can be ordered after the description, where it belongs — the title
             and its description stay adjacent, which is the whole point of the
             pairing. */
          .pgh { display: flex; flex-direction: column; }
          .pgh-top { display: contents; }
          .pgh-txt { order: 1; }
          .pgh-desc { order: 2; }
          .pgh-action { order: 3; margin-block-start: var(--space-4); }
          .pgh-summary { order: 4; }

          /* The lead steps down one place ON THE SCALE rather than to a
             hand-picked size — 44px wraps "Welcome, <name>" awkwardly at 375px.
             Against a 14px body this still reads 2.4x, comfortably inside the
             ratio §3.3 is actually asking for. */
          .pgh-title.is-lead { font-size: var(--text-3xl); letter-spacing: var(--track-tight); }
        }
      `}</style>
    </header>
  );
}
