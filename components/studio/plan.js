// The Studio's Plan screen.
//
// ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────
// It is the reason the signup funnel could not move. The marketing site sends
// a visitor to /signup?plan=yearly, the plan rides through verification, and
// /admin reads it (planFromQuery) and opens Billing with that plan chosen, one
// press from checkout. /studio read nothing: `plan` was one of four ids routed
// to the NotYet placeholder. Pointing the funnel here while that was true would
// have dropped a paying customer's chosen plan on the floor and shown them a
// screen that says "not yet", with no way to pay — the funnel would have
// launched with a hole exactly where the revenue is.
//
// ── IT IS A DOOR, NOT A CHECKOUT ─────────────────────────────────────────
// Nothing here talks to PayPal or to billing-checkout. /subscribe is the one
// checkout page and it already has both its doors; this screen chooses a plan
// and hands off to it with ?plan= and ?tenant=, which is precisely what the
// admin's Billing tab does. One checkout, now three ways in, still one place
// where a subscription is actually created.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
// Invoices, receipts, cancelling and changing a card stay in /admin and are
// linked. They are real work and this screen would be claiming to do them.
// Studio shows the one thing a customer on this screen came to do: start
// paying, so they can publish.
import { useState } from 'react';
import { listPlans, planName } from '../../lib/billing-plans';
import PlanPicker from '../billing/PlanPicker';
import { Icon } from '../ui';

export default function Plan({ ar, tenant, entitled, initialPlan }) {
  const plans = listPlans();
  /* The funnel's choice wins as the initial selection, and DEFAULT is not
     hard-coded here: a plan that leaves the sellable catalogue must stop being
     preselectable everywhere at once, which is why resolvePlanCode already
     filtered it before it reached this prop. Falling back to the first sellable
     plan rather than a literal keeps that true. */
  const [code, setCode] = useState(initialPlan || (plans[0] && plans[0].code) || '');

  const href = tenant && code
    ? `/subscribe?plan=${encodeURIComponent(code)}&tenant=${encodeURIComponent(tenant.id)}`
    : null;

  return (
    <section className="screen">
      <h1>{ar ? 'الاشتراك' : 'Plan'}</h1>

      {/* Entitlement is asked for after the Studio is usable, so it is null
          until it answers. Saying "not subscribed" during that gap would be the
          screen telling the customer something it does not know yet. */}
      {entitled === null && (
        <p className="lede">{ar ? 'جارٍ القراءة…' : 'Reading…'}</p>
      )}

      {entitled === true && (
        <>
          <p className="lede">
            {ar
              ? 'الاشتراك فعّال، والمعرض يظهر للزوّار عند نشره.'
              : 'The subscription is active, and the portfolio is visible to visitors once published.'}
          </p>
          {/* An active subscriber's remaining business -- invoices, the card,
              cancelling -- lives in the old editor and is honestly named as
              being there rather than mimicked here. */}
          <a className="go" href="/admin">
            {ar ? 'الفواتير وتفاصيل الدفع' : 'Invoices and payment details'}
            <Icon name="external" size={13} />
          </a>
        </>
      )}

      {entitled === false && (
        <>
          <p className="lede">
            {/* A statement of state, not an instruction: building is already
                free, and the only thing money buys is publishing. Saying that
                plainly is also what stops this screen reading as a wall. */}
            {ar
              ? 'بناء المعرض مجاني. الاشتراك مطلوب لنشره وظهوره للزوّار.'
              : 'Building your portfolio is free. A subscription is what publishes it.'}
          </p>

          <PlanPicker plans={plans} value={code} onChange={setCode} lang={ar ? 'ar' : 'en'} />

          {href && (
            <a className="pay" href={href}>
              {ar
                ? `متابعة الدفع — ${planName(code, 'ar')}`
                : `Continue to payment — ${planName(code, 'en')}`}
            </a>
          )}

          {/* WHERE THE MONEY ACTUALLY CHANGES HANDS, said before they press.
              The approval happens on PayPal; this origin never sees a card. */}
          <p className="fine">
            {ar
              ? 'يتم الدفع عبر PayPal، ولا تُطلب بيانات البطاقة في هذا الموقع.'
              : 'Payment is taken on PayPal. Card details are never entered on this site.'}
          </p>
        </>
      )}

      <style jsx>{`
        .screen { max-width: 720px; }
        h1 { margin: 0 0 6px; font-size: var(--text-xl); font-family: var(--font-heading); }
        .lede { margin: 0 0 var(--space-5); color: var(--text-secondary);
                font-size: var(--text-sm); line-height: 1.7; }

        .pay {
          display: flex; align-items: center; justify-content: center;
          margin-top: var(--space-5); padding: 0 var(--space-4);
          /* The floor this product already names, rather than a number picked
             here: it is the primary action on a screen a customer may well
             reach on a phone, straight from a link in their inbox. */
          min-height: var(--tap-min);
          border-radius: var(--radius-md);
          background: var(--action-primary-bg); color: var(--action-primary-fg);
          font-size: var(--text-md); font-weight: 700; text-decoration: none;
        }
        .pay:hover { opacity: 0.92; }
        .pay:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        .go {
          display: inline-flex; align-items: center; gap: 6px;
          min-height: var(--tap-min);
          color: var(--text-secondary); font-size: var(--text-sm); font-weight: 600;
          text-decoration: none;
        }
        .go:hover { color: var(--text-primary); }
        .go:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        .fine { margin: var(--space-3) 0 0; color: var(--text-tertiary);
                font-size: var(--text-xs); line-height: 1.6; }
      `}</style>
    </section>
  );
}
