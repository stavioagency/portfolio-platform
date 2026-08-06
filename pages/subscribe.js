// /subscribe — ONE checkout page, TWO doors.
//
//   Door 1: the client opens it from the Billing tab in their dashboard, with
//           a session. The link carries ?plan= and ?tenant=.
//   Door 2: the owner sends the URL over WhatsApp to a client who has never
//           signed in. The link carries ?t=<signed grant>.
//
// Building it as a page rather than a modal inside the admin is what makes the
// second door possible at all — and building the second door on top of the
// first is why it costs about ten percent more than one, instead of twice.
//
// THERE IS NO CARD FORM, AND THERE NEVER WILL BE ON THIS ORIGIN.
// With PayPal the customer approves the subscription ON PAYPAL. This page
// creates the subscription server-side (billing-checkout) and redirects to the
// approval URL PayPal hands back. Card details, PayPal credentials and 3-D
// Secure all happen on paypal.com, so this origin is out of PCI scope and there
// is nothing here to leak.
//
// WHAT COMING BACK MEANS
// Returning from PayPal means the customer approved it. It does NOT mean the
// subscription is active — that arrives as BILLING.SUBSCRIPTION.ACTIVATED at
// billing-webhook, seconds or minutes later. So the success screen says
// "confirming", not "active", and the dashboard is what shows the truth. The
// browser is never trusted to report a payment.
import { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { getTranslator, resolveLang } from '../lib/translations';
import {
  getPlan, formatAmount, formatInterval, planName, formatBillingNote,
} from '../lib/billing-plans';
import { Button, Card, Badge } from '../components/ui';
import { edgeErrorCode } from '../lib/billing-errors';

export default function Subscribe() {
  const [lang, setLang] = useState('ar');
  const [theme, setTheme] = useState('dark');
  // loading | invalid | form | redirecting | confirming | cancelled | failed
  const [phase, setPhase] = useState('loading');
  const [plan, setPlan] = useState(null);
  const [workspace, setWorkspace] = useState('');
  const [grant, setGrant] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState('');

  const t = useMemo(() => getTranslator(lang), [lang]);
  const ar = lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';

  // Language: read once, then own <html lang/dir> exactly as LegalPage does.
  // This page is reached without the admin shell, so nothing else sets them.
  //
  // `?lang=` wins over the stored preference — see resolveLang() for why.
  // The short version: a visitor arriving from the marketing site is on a
  // different origin, so there is nothing stored and the default would hand
  // an English reader an Arabic checkout.
  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem('lang'); } catch (_) {}

    let requested = null;
    try {
      requested = new URLSearchParams(window.location.search).get('lang');
    } catch (_) {}

    setLang(resolveLang(requested, stored));
  }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('lang', lang); } catch (_) {}
  }, [lang]);

  // Honour the theme the client chose in their dashboard. Coming from the
  // Billing tab in light mode and landing on a black payment page reads as a
  // different site, which is the last thing a payment screen should look like.
  // There is no toggle here on purpose: this page is a step in a flow, not a
  // place to configure anything.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let stored = 'dark';
    try { stored = localStorage.getItem('admin_theme') || 'dark'; } catch (_) {}
    setTheme(stored);
    document.documentElement.setAttribute('data-admin-theme', stored);
    return () => document.documentElement.removeAttribute('data-admin-theme');
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Coming BACK from PayPal. `status` is set by the return_url and cancel_url
    // that billing-checkout sent, both of which it validated against an
    // allow-list — so this branch cannot be reached from an arbitrary site.
    const status = params.get('status');
    if (status === 'success') { setPhase('confirming'); return; }
    if (status === 'cancelled') { setPhase('cancelled'); return; }

    const grantToken = params.get('t') || '';
    const requested = params.get('plan');
    const resolved = getPlan(requested);
    if (!resolved) { setPhase('invalid'); return; }

    setPlan(resolved);
    setGrant(grantToken);
    setTenantId(params.get('tenant') || '');
    setWorkspace(params.get('w') || '');
    setPhase('form');
  }, []);

  const startCheckout = useCallback(async () => {
    if (!plan) return;
    setError('');
    setPhase('redirecting');
    try {
      const origin = window.location.origin;
      const { data, error: fnErr } = await supabase.functions.invoke('billing-checkout', {
        body: {
          // Door 2 sends the grant and nothing else that matters: the server
          // reads the tenant and the plan out of the signed token, so editing
          // this URL cannot change what is bought or for whom.
          grant: grant || undefined,
          tenant_id: grant ? undefined : tenantId,
          plan_code: grant ? undefined : plan.code,
          return_url: `${origin}/subscribe?status=success`,
          cancel_url: `${origin}/subscribe?status=cancelled`,
          locale: lang,
        },
      });

      // The server's own code lives behind fnErr.context on a non-2xx; without
      // edgeErrorCode every failure here reads as the same generic sentence.
      const code = await edgeErrorCode(fnErr, data);
      if (code || !data?.approve_url) {
        setError(checkoutError(code, ar));
        setPhase('failed');
        return;
      }
      // Off to PayPal. Nothing is charged until they approve it there.
      window.location.href = data.approve_url;
    } catch (err) {
      console.error('[checkout] failed:', err);
      setError(ar ? 'تعذّر بدء عملية الدفع.' : 'Could not start the checkout.');
      setPhase('failed');
    }
  }, [plan, grant, tenantId, lang, ar]);

  const billingNote = plan ? formatBillingNote(plan.code, lang) : null;

  return (
    <>
      <Head>
        <title>{t('checkout_title')}</title>
        {/* Never indexed: it is a per-client payment link, not a landing page.
            The public PRICING page lives on the marketing site, which is a
            separate project — see HANDOFF §0. */}
        <meta name="robots" content="noindex" />
      </Head>

      <main className="co" dir={dir}>
        <div className="co-shell">
          <header className="co-top">
            {/* Two files, not one: /logo.png is white and vanishes on the light
                theme's white page. The admin sidebar swaps the same pair. */}
            <img className="co-logo" src={theme === 'light' ? '/logo-light.png' : '/logo.png'} alt="ديزاينكم" />
            <button
              type="button"
              className="co-lang"
              onClick={() => setLang(ar ? 'en' : 'ar')}
              title={ar ? 'Switch to English' : 'التحويل إلى العربية'}
            >
              {ar ? 'EN' : 'ع'}
            </button>
          </header>

          {phase === 'loading' && (
            <Card pad="lg" className="co-card">
              <div className="co-center" aria-busy="true">
                <span className="co-spinner" aria-hidden="true" />
                <p className="co-muted">{ar ? 'جارٍ التحضير…' : 'Getting things ready…'}</p>
              </div>
            </Card>
          )}

          {phase === 'invalid' && (
            <Card pad="lg" className="co-card">
              <div className="co-center">
                <div className="co-mark warn" aria-hidden="true">!</div>
                <h1>{t('checkout_link_invalid_title')}</h1>
                <p className="co-muted">{t('checkout_link_invalid_desc')}</p>
                <a className="co-link" href="https://wa.me/966505796218">{t('checkout_contact_us')}</a>
              </div>
            </Card>
          )}

          {/* Approved at PayPal, not yet activated here. The wording is careful
              on purpose — the webhook is what makes it real. */}
          {phase === 'confirming' && (
            <Card pad="lg" className="co-card">
              <div className="co-center">
                <div className="co-mark ok" aria-hidden="true">✓</div>
                <h1>{t('checkout_confirming_title')}</h1>
                <p className="co-muted">{t('checkout_confirming_desc')}</p>
                {/* ?checkout=success is the ONLY way the dashboard learns that
                    this visit follows a real approval. Activation is
                    asynchronous — the webhook landed ~40s later in the verified
                    run — so without it the Billing tab fetches once, renders
                    "pending", and the customer is told to refresh.
                    Deliberately NOT on the cancelled screen: someone who backed
                    out must not poll for an activation that is not coming. */}
                <a href="/admin?checkout=success" className="co-btn-link">{t('checkout_go_dashboard')}</a>
              </div>
            </Card>
          )}

          {phase === 'cancelled' && (
            <Card pad="lg" className="co-card">
              <div className="co-center">
                <div className="co-mark warn" aria-hidden="true">!</div>
                <h1>{t('checkout_cancelled_title')}</h1>
                <p className="co-muted">{t('checkout_cancelled_desc')}</p>
                <a href="/admin" className="co-btn-link">{t('checkout_go_dashboard')}</a>
              </div>
            </Card>
          )}

          {phase === 'failed' && (
            <Card pad="lg" className="co-card">
              <div className="co-center">
                <div className="co-mark bad" aria-hidden="true">×</div>
                <h1>{t('checkout_failed_title')}</h1>
                <p className="co-muted">{error || t('checkout_failed_desc')}</p>
                <Button onClick={() => setPhase('form')}>{t('checkout_try_again')}</Button>
              </div>
            </Card>
          )}

          {(phase === 'form' || phase === 'redirecting') && plan && (
            <div className="co-grid">
              {/* ---- ORDER SUMMARY ---- */}
              <Card pad="lg" className="co-card co-summary">
                <h2 className="co-h2">{t('checkout_summary')}</h2>
                {workspace && (
                  <p className="co-for">
                    {t('checkout_for')} <strong>{workspace}</strong>
                  </p>
                )}
                <div className="co-line">
                  <span>{planName(plan.code, lang)}</span>
                  <span className="co-num">{formatAmount(plan.amount, lang)}</span>
                </div>
                <div className="co-line co-muted-line">
                  <span>{formatInterval(plan, lang)}</span>
                  <Badge tone="accent">{ar ? 'تجديد تلقائي' : 'Auto-renews'}</Badge>
                </div>
                <div className="co-total">
                  <span>{t('checkout_total_today')}</span>
                  <span className="co-num co-total-num">{formatAmount(plan.amount, lang)}</span>
                </div>
                {/* PayPal cannot charge SAR. Saying so here, next to the total,
                    is the difference between an informed customer and a
                    surprised one looking at USD on their statement. */}
                {billingNote && <p className="co-fx">{billingNote}</p>}
                <p className="co-note">{t('checkout_renews_note')}</p>
              </Card>

              {/* ---- PAY ---- */}
              <Card pad="lg" className="co-card">
                <h1 className="co-h1">{t('checkout_title')}</h1>
                <p className="co-muted co-lead">{t('checkout_paypal_lead')}</p>

                <ol className="co-steps">
                  <li>{t('checkout_step_1')}</li>
                  <li>{t('checkout_step_2')}</li>
                  <li>{t('checkout_step_3')}</li>
                </ol>

                <Button block loading={phase === 'redirecting'} onClick={startCheckout}>
                  {t('checkout_continue_paypal')}
                </Button>

                <p className="co-secure">{t('billing_secure_note')}</p>
                <div className="co-methods" aria-label={ar ? 'طرق الدفع المقبولة' : 'Accepted payment methods'}>
                  <span>PayPal</span><span>VISA</span><span>Mastercard</span><span>AMEX</span>
                </div>
              </Card>
            </div>
          )}

          <footer className="co-foot">
            <span>{t('billing_powered_by')}</span>
            <span aria-hidden="true">·</span>
            <Link href="/terms">{t('legal_terms')}</Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy">{t('legal_privacy')}</Link>
          </footer>
        </div>
      </main>

      <style jsx>{`
        .co {
          min-height: 100vh;
          padding: var(--space-6) var(--space-4) var(--space-8);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: var(--font-sans);
        }
        .co-shell { max-width: 880px; margin: 0 auto; }
        .co-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
        .co-logo { height: 28px; width: auto; }
        .co-lang {
          width: 34px; height: 34px; border-radius: 50%;
          background: var(--bg-elevated); border: 1px solid var(--border);
          color: var(--text-secondary); font-family: inherit; font-size: var(--text-sm);
          font-weight: 600; cursor: pointer;
        }
        .co-lang:hover { color: var(--text-primary); border-color: var(--border-strong); }
        .co-lang:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .co-grid { display: grid; grid-template-columns: 1fr 1.15fr; gap: var(--space-4); align-items: start; }
        /* The summary stays FIRST in source so a payer reads what they are
           buying before the button, on every width. */
        @media (max-width: 760px) { .co-grid { grid-template-columns: 1fr; } }

        .co-h1 { font-size: var(--text-xl); font-weight: 700; margin: 0 0 var(--space-2); }
        .co-h2 { font-size: var(--text-xs); font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--text-tertiary); margin: 0 0 var(--space-4); }
        :global(html[dir='rtl']) .co-h2 { text-transform: none; letter-spacing: normal; }
        .co-lead { margin: 0 0 var(--space-4); max-width: none; }
        .co-for { font-size: var(--text-sm); color: var(--text-secondary); margin: 0 0 var(--space-3); }
        .co-line { display: flex; align-items: center; justify-content: space-between;
          gap: var(--space-3); padding: var(--space-2) 0; font-size: var(--text-md); }
        .co-muted-line { color: var(--text-tertiary); font-size: var(--text-sm); }
        .co-num { font-variant-numeric: tabular-nums; }
        .co-total { display: flex; align-items: baseline; justify-content: space-between;
          gap: var(--space-3); margin-top: var(--space-3); padding-top: var(--space-3);
          border-top: 1px solid var(--border); font-weight: 700; }
        .co-total-num { font-size: var(--text-2xl); }
        .co-fx { margin: var(--space-2) 0 0; font-size: var(--text-xs); color: var(--text-secondary); }
        .co-note { margin: var(--space-4) 0 0; font-size: var(--text-xs);
          color: var(--text-tertiary); line-height: 1.6; }

        .co-steps { margin: 0 0 var(--space-4); padding-inline-start: 20px;
          display: flex; flex-direction: column; gap: var(--space-2); }
        .co-steps li { font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6; }
        .co-secure { margin: var(--space-4) 0 0; font-size: var(--text-xs);
          color: var(--text-tertiary); line-height: 1.6; }
        .co-methods { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-3); }
        .co-methods span {
          padding: 3px var(--space-2); border-radius: var(--radius-sm);
          background: var(--bg-elevated); border: 1px solid var(--border);
          font-size: var(--text-xs); color: var(--text-tertiary);
        }

        .co-center { display: flex; flex-direction: column; align-items: center;
          text-align: center; gap: var(--space-3); padding: var(--space-5) 0; }
        .co-center h1 { font-size: var(--text-xl); font-weight: 700; margin: 0; }
        .co-muted { color: var(--text-tertiary); font-size: var(--text-sm);
          line-height: 1.6; max-width: 42ch; margin: 0; }
        .co-mark { width: 46px; height: 46px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 700; }
        .co-mark.ok { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
        .co-mark.warn { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border); }
        .co-mark.bad { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); }
        .co-link { color: var(--accent); font-size: var(--text-sm); text-decoration: none; }
        .co-link:hover { text-decoration: underline; }
        /* A plain <a>, not next/link: styled-jsx scopes by stamping an attribute
           onto the elements in THIS file's JSX, so a class handed to another
           component's anchor never receives the styles and the button renders
           as bare text. These are full navigations anyway. */
        .co-btn-link {
          display: inline-flex; align-items: center; justify-content: center;
          margin-top: var(--space-2); padding: 10px var(--space-5);
          border-radius: var(--radius-md); text-decoration: none;
          background: var(--accent-gradient); color: var(--accent-fg);
          font-size: var(--text-md); font-weight: 600; box-shadow: var(--accent-glow);
        }
        .co-btn-link:hover { background: var(--accent-gradient-hover); }
        .co-btn-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .co-spinner {
          width: 22px; height: 22px; border-radius: 50%;
          border: 2px solid var(--border-strong); border-top-color: var(--accent);
          animation: co-spin 0.8s linear infinite;
        }
        @keyframes co-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .co-spinner { animation: none; } }

        .co-foot { display: flex; align-items: center; justify-content: center; gap: var(--space-2);
          margin-top: var(--space-6); font-size: var(--text-xs); color: var(--text-muted); flex-wrap: wrap; }
        .co-foot :global(a) { color: var(--text-tertiary); text-decoration: none; }
        .co-foot :global(a:hover) { color: var(--text-secondary); }
      `}</style>
      <style jsx global>{`
        .co .co-card { width: 100%; }
      `}</style>
    </>
  );
}

// Server error codes turned into something a customer can act on. Anything
// unrecognised stays generic — a raw provider message is noise at best and a
// leak at worst.
function checkoutError(code, ar) {
  switch (code) {
    case 'already_subscribed':
      return ar ? 'هذه المساحة مشتركة بالفعل.' : 'This workspace already has a subscription.';
    case 'invalid_or_expired_grant':
      return ar ? 'انتهت صلاحية هذا الرابط. اطلب رابطًا جديدًا.' : 'This link has expired. Ask for a fresh one.';
    case 'plan_not_available':
      return ar ? 'هذه الخطة غير متاحة حاليًا.' : 'That plan is not available right now.';
    case 'forbidden':
      return ar ? 'لا تملك صلاحية الاشتراك لهذه المساحة.' : 'You are not allowed to subscribe for this workspace.';
    default:
      return ar ? 'تعذّر بدء عملية الدفع. حاول مرة أخرى.' : 'Could not start the checkout. Please try again.';
  }
}
