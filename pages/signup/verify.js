// /signup/verify — where the emailed link lands. Confirms the address, which
// is what causes the workspace to be created, then sends them to checkout.
//
// THIS PAGE WILL BE OPENED MORE THAN ONCE, AND THAT IS FINE.
// The token is reusable for 24 hours on purpose (HANDOFF §9: single-use links
// are burned by mail scanners pre-fetching them). signup-verify is idempotent
// and answers `already: true` on a repeat, which this page treats as success —
// because it is one.
//
// It calls signup-verify with the raw token and nothing else. The workspace
// name and address were captured at signup and are read back from the account
// server-side, so nothing here can influence what gets created.
import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { supabase } from '../../lib/supabase';
import { getTranslator, resolveLang, isLang } from '../../lib/translations';
import { resolvePlanCode } from '../../lib/signup-intent';
import { edgeErrorCode } from '../../lib/billing-errors';
import { Button, Card } from '../../components/ui';

export default function VerifySignup() {
  const [lang, setLang] = useState('ar');
  const [theme, setTheme] = useState('dark');
  // checking | done | invalid | failed
  const [phase, setPhase] = useState('checking');
  const [slug, setSlug] = useState('');
  const [detail, setDetail] = useState('');
  // The plan chosen back on the marketing site, handed back by signup-verify
  // from the account's metadata. It is the only copy that survives the email
  // being opened somewhere else, which is the usual case.
  const [plan, setPlan] = useState(null);

  const t = useMemo(() => getTranslator(lang), [lang]);
  const ar = lang === 'ar';

  // Every way out of this page carries the language. This is the last screen
  // that still knows it: the dashboard has no session yet to read a preference
  // from, and a visitor sent back to /signup after a dead link arrives as a
  // stranger all over again. Dropping it here is how an English customer ends
  // up on an Arabic dashboard — which is exactly what used to happen, because
  // the Continue link passed `plan` and nothing else.
  const adminHref = useMemo(() => {
    const params = new URLSearchParams();
    if (plan) params.set('plan', plan);
    params.set('lang', lang);
    return `/admin?${params.toString()}`;
  }, [plan, lang]);
  const signupHref = useMemo(() => `/signup?lang=${encodeURIComponent(lang)}`, [lang]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // The email may be read on a device that has never seen this site, so the
    // link carries its own language rather than relying on stored preference.
    // resolveLang() holds the rule — link first, then whatever this browser
    // remembers — and validates both, rather than this page keeping a second
    // copy of "is it ar or en" that can drift from the one in lib/.
    const fromLink = params.get('lang');
    let stored = null;
    try { stored = localStorage.getItem('lang'); } catch (_) {}
    setLang(resolveLang(fromLink, stored));

    // Whether anything here actually KNEW the language, as opposed to
    // resolveLang falling through to its Arabic default. If nothing did, the
    // account is asked below — a stripped link opened in a fresh browser is
    // the one case where neither the URL nor localStorage can help, and it is
    // also the case where guessing Arabic at an English customer is worst.
    const knownLocally = isLang(fromLink) || isLang(stored);

    let storedTheme = 'dark';
    try { storedTheme = localStorage.getItem('admin_theme') || 'dark'; } catch (_) {}
    setTheme(storedTheme);
    document.documentElement.setAttribute('data-admin-theme', storedTheme);

    const token = params.get('t');
    if (!token) { setPhase('invalid'); return; }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('signup-verify', { body: { token } });
        const code = await edgeErrorCode(error, data);
        if (code === 'invalid_or_expired_token') { setPhase('invalid'); return; }
        if (code) {
          // A named problem the person can act on — a taken address, mainly.
          setDetail(t(code) !== code ? t(code) : '');
          setPhase('failed');
          return;
        }
        // `already: true` lands here too, which is correct: the account is
        // verified and the workspace exists either way.
        setSlug(data?.slug || '');
        // Checked against the catalogue before it is put in a URL. A plan
        // retired between signup and verification simply drops out here, and
        // they land on Billing with the normal default selected.
        setPlan(resolvePlanCode(data?.plan));
        // Last resort only. The link and this browser both had their say
        // before the request went out, and either of them outranks the
        // account: they describe where the person is reading now, the account
        // describes where they were when they signed up. This fires when
        // neither knew — and it is the difference between an English customer
        // seeing their own language here and being handed Arabic by default.
        if (!knownLocally && isLang(data?.lang)) setLang(data.lang);
        setPhase('done');
      } catch (err) {
        console.error('[verify] failed:', err);
        setPhase('failed');
      }
    })();
    // Deliberately runs once: re-running on a language change would re-POST.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
  }, [lang, ar]);

  return (
    <>
      <Head>
        <title>{t('verify_title')}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="vf" dir={ar ? 'rtl' : 'ltr'}>
        <div className="vf-shell">
          <header className="vf-top">
            <img className="vf-logo" src={theme === 'light' ? '/logo-light.png' : '/logo.png'} alt="ديزاينكم" />
          </header>

          <Card pad="lg" className="vf-card">
            {phase === 'checking' && (
              <div className="vf-center" aria-busy="true">
                <span className="vf-spinner" aria-hidden="true" />
                <p className="vf-muted">{t('verify_checking')}</p>
              </div>
            )}

            {phase === 'done' && (
              <div className="vf-center">
                <div className="vf-mark ok" aria-hidden="true">✓</div>
                <h1>{t('verify_done_title')}</h1>
                <p className="vf-muted">{t('verify_done_desc')}</p>
                {slug && <p className="vf-slug" dir="ltr">designakum.site/{slug}</p>}
                {/* Sign-in first: checkout's door 1 needs a session, and they
                    have not signed in on this device — the link may have been
                    opened on a phone. */}
                {/* Sign-in has to happen first, so the plan rides in the URL
                    rather than being acted on here: /admin reads it and opens
                    Billing with that plan selected. Checkout is one press
                    away, and still a press — nobody is sent to PayPal by a
                    link they clicked in their inbox. */}
                <a href={adminHref} className="vf-btn">{t('verify_continue')}</a>
                <p className="vf-muted vf-small">{t('verify_next_hint')}</p>
              </div>
            )}

            {phase === 'invalid' && (
              <div className="vf-center">
                <div className="vf-mark warn" aria-hidden="true">!</div>
                <h1>{t('verify_invalid_title')}</h1>
                <p className="vf-muted">{t('verify_invalid_desc')}</p>
                <a href={signupHref} className="vf-btn">{t('verify_start_again')}</a>
              </div>
            )}

            {phase === 'failed' && (
              <div className="vf-center">
                <div className="vf-mark bad" aria-hidden="true">×</div>
                <h1>{t('verify_failed_title')}</h1>
                <p className="vf-muted">{detail || t('verify_failed_desc')}</p>
                <a href={signupHref} className="vf-btn">{t('verify_start_again')}</a>
                {/* Same support number as /subscribe, and for the same reason:
                    verification failed and there is nothing left for them to
                    press. A different number was here until 2026-08-07 and is
                    no longer answered. */}
                <a className="vf-link" href="https://wa.me/966505452943">{t('checkout_contact_us')}</a>
              </div>
            )}
          </Card>
        </div>
      </main>

      <style jsx>{`
        .vf { min-height: 100vh; padding: var(--space-6) var(--space-4) var(--space-8);
          background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); }
        .vf-shell { max-width: 520px; margin: 0 auto; }
        .vf-top { display: flex; justify-content: center; margin-bottom: var(--space-6); }
        .vf-logo { height: 28px; width: auto; }
        .vf-center { display: flex; flex-direction: column; align-items: center; text-align: center;
          gap: var(--space-3); padding: var(--space-5) 0; }
        .vf-center h1 { font-size: var(--text-xl); font-weight: 700; margin: 0; }
        .vf-muted { color: var(--text-tertiary); font-size: var(--text-sm); line-height: 1.6;
          max-width: 42ch; margin: 0; }
        .vf-small { font-size: var(--text-xs); }
        .vf-slug { font-size: var(--text-sm); color: var(--text-secondary);
          background: var(--bg-elevated); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 6px 12px; margin: 0; }
        .vf-mark { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 22px; font-weight: 700; }
        .vf-mark.ok { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
        .vf-mark.warn { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border); }
        .vf-mark.bad { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); }
        /* A plain <a>, not next/link: styled-jsx scopes by stamping an attribute
           onto elements in THIS file's JSX, so a class handed to another
           component's anchor never receives the styles. */
        .vf-btn { display: inline-flex; align-items: center; justify-content: center;
          margin-top: var(--space-2); padding: 10px var(--space-5); border-radius: var(--radius-md);
          text-decoration: none; background: var(--brand); color: var(--brand-ink);
          font-size: var(--text-md); font-weight: 600; }
        .vf-btn:hover { background: var(--brand-hover); }
        .vf-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .vf-link { color: var(--accent); font-size: var(--text-sm); text-decoration: none; }
        .vf-link:hover { text-decoration: underline; }
        .vf-spinner { width: 22px; height: 22px; border-radius: 50%;
          border: 2px solid var(--border-strong); border-top-color: var(--accent);
          animation: spin var(--t-spin) linear infinite; }
        @media (prefers-reduced-motion: reduce) { .vf-spinner { animation: none; } }
      `}</style>
      <style jsx global>{`
        .vf .vf-card { width: 100%; }
      `}</style>
    </>
  );
}
