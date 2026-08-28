// PlanPicker — the plan cards, shared by the two places a plan is chosen:
// the Billing tab inside the admin, and the standalone /subscribe page an owner
// can send to a client who has not signed in yet. It exists as a component for
// that reason and no other — one checkout, two doors, one set of cards to keep
// correct.
//
// It knows nothing about payment, subscriptions or the network. It is handed
// plans and a selection, and reports back which code was picked.
//
// ACCESSIBILITY: these are real radio inputs in a fieldset, visually hidden
// rather than replaced. Cards built from divs and onClick are unreachable by
// keyboard and unannounced by screen readers, and a payment screen is the worst
// possible place for that.
import {
  formatAmount,
  formatInterval,
  monthlyEquivalent,
  savingsPercent,
} from '../../lib/billing-plans';
import Money from '../ui/Money';

export default function PlanPicker({
  plans,
  value,
  onChange,
  lang = 'ar',
  currentCode = null, // the plan the workspace is already on, if any
  disabled = false,
  name = 'plan',
}) {
  const ar = lang === 'ar';

  return (
    <fieldset className="pp" disabled={disabled}>
      <legend className="sr-only">{ar ? 'اختيار خطة' : 'Choose a plan'}</legend>
      <div className="pp-grid">
        {plans.map((plan) => {
          const selected = value === plan.code;
          const isCurrent = currentCode === plan.code;
          const save = savingsPercent(plan);
          const perMonth = monthlyEquivalent(plan);
          // Only worth showing where it differs from the headline price —
          // "12 SAR per month (≈ 12 SAR/month)" is noise.
          const showPerMonth = perMonth !== null && perMonth !== plan.amount;
          return (
            <label key={plan.code} className={`pp-card ${selected ? 'on' : ''}`}>
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={plan.code}
                checked={selected}
                onChange={() => onChange(plan.code)}
              />
              <span className="pp-top">
                <span className="pp-name">{plan.name[ar ? 'ar' : 'en']}</span>
                {save !== null && (
                  <span className="pp-save">{ar ? `وفّر ${save}%` : `Save ${save}%`}</span>
                )}
                {isCurrent && (
                  <span className="pp-current">{ar ? 'خطتك الحالية' : 'Current plan'}</span>
                )}
              </span>
              <span className="pp-price">
                <span className="pp-amount"><Money minor={plan.amount} lang={lang} /></span>
                <span className="pp-interval">{formatInterval(plan, lang)}</span>
              </span>
              {showPerMonth && (
                <span className="pp-permonth">
                  {ar
                    ? `أي ما يعادل ${formatAmount(perMonth, lang)} شهريًا`
                    : `Works out at ${formatAmount(perMonth, lang)} a month`}
                </span>
              )}
              <span className="pp-tagline">{plan.tagline[ar ? 'ar' : 'en']}</span>
              {/* The tick is decorative — selection is announced by the radio. */}
              <span className="pp-tick" aria-hidden="true">✓</span>
            </label>
          );
        })}
      </div>

      <style jsx>{`
        .pp { border: none; padding: 0; margin: 0; min-inline-size: 0; }
        .pp[disabled] { opacity: 0.55; }
        .pp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: var(--space-3);
          max-width: 640px;
        }
        .pp-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          padding: var(--space-4);
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: border-color var(--transition), background var(--transition);
        }
        .pp:not([disabled]) .pp-card:hover { border-color: var(--border-strong); background: var(--bg-hover); }
        .pp[disabled] .pp-card { cursor: not-allowed; }
        .pp-card.on { border-color: var(--accent); background: var(--bg-elevated); }
        /* The ring follows the hidden input's focus, so keyboard users can see
           where they are without a visible input. */
        .pp-card:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
        .pp-top { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
        .pp-name { font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
        .pp-save {
          font-size: var(--text-xs); font-weight: 600;
          padding: 2px var(--space-2); border-radius: 999px;
          background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border);
        }
        .pp-current {
          font-size: var(--text-xs); font-weight: 600;
          padding: 2px var(--space-2); border-radius: 999px;
          background: var(--bg-elevated); color: var(--text-tertiary); border: 1px solid var(--border);
        }
        .pp-price { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
        /* tabular-nums keeps 12 and 120 aligned when the cards sit side by side */
        .pp-amount { font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .pp-interval { font-size: var(--text-sm); color: var(--text-tertiary); }
        .pp-permonth { font-size: var(--text-xs); color: var(--text-tertiary); }
        .pp-tagline { font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6; }
        .pp-tick {
          position: absolute; top: var(--space-3); inset-inline-end: var(--space-3);
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; line-height: 1;
          background: var(--accent); color: var(--accent-fg);
          opacity: 0; transform: scale(0.7);
          transition: opacity var(--transition), transform var(--transition);
        }
        .pp-card.on .pp-tick { opacity: 1; transform: scale(1); }
        @media (prefers-reduced-motion: reduce) {
          .pp-card, .pp-tick { transition: none; }
        }
        .sr-only {
          position: absolute; width: 1px; height: 1px;
          padding: 0; margin: -1px; overflow: hidden;
          clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
      `}</style>
    </fieldset>
  );
}
