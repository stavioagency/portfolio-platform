// /signup — the public front door. Creates an account and asks for the email
// to be confirmed; it does not create a workspace and it does not take money.
//
// WHAT THIS PAGE DOES NOT DO, DELIBERATELY
// ----------------------------------------
// It never calls supabase.auth.signUp(). That would trigger Supabase's own
// confirmation mailer, which has never delivered a message on this project
// (HANDOFF §7c). Everything goes through signup-start, which creates the
// account server-side and sends the link through Resend.
//
// It also does not tell the visitor whether an address is already registered.
// signup-start answers identically either way and this page shows the same
// "check your email" screen regardless — the distinction is made in the inbox,
// never on screen.
import { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { getTranslator, resolveLang } from '../lib/translations';
import { planFromQuery } from '../lib/signup-intent';
import { passwordPolicyError, PASSWORD_MIN, PASSWORD_MAX_CHARS } from '../lib/password-policy';
import { slugError, suggestSlug } from '../lib/reserved-slugs';
import { edgeErrorCode } from '../lib/billing-errors';
import { Button, Card } from '../components/ui';

export default function Signup() {
  const [lang, setLang] = useState('ar');
  const [theme, setTheme] = useState('dark');
  const [phase, setPhase] = useState('form'); // form | sending | sent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState('');
  // The plan they clicked on the marketing site, carried in `?plan=`. It is
  // remembered rather than acted on: this page creates an account, it does
  // not take money. See the submit handler for where it goes next.
  const [plan, setPlan] = useState(null);

  const t = useMemo(() => getTranslator(lang), [lang]);
  const ar = lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';

  // Both of these arrive in the URL from the marketing site, which is a
  // different origin — so there is nothing in localStorage on a first visit
  // and the link is the only thing that knows what the visitor chose.
  //
  // `?lang=` wins over the stored preference for that reason; resolveLang()
  // holds the rule and validates both inputs. Without it an English reader
  // who clicked "Start building" lands on an Arabic signup form.
  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem('lang'); } catch (_) {}

    let requested = null;
    try {
      requested = new URLSearchParams(window.location.search).get('lang');
    } catch (_) {}

    setLang(resolveLang(requested, stored));
    setPlan(planFromQuery(window.location.search));
  }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
    try { localStorage.setItem('lang', lang); } catch (_) {}
  }, [lang, ar]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let stored = 'dark';
    try { stored = localStorage.getItem('admin_theme') || 'dark'; } catch (_) {}
    setTheme(stored);
    document.documentElement.setAttribute('data-admin-theme', stored);
    return () => document.documentElement.removeAttribute('data-admin-theme');
  }, []);

  // The address is derived from the name until the moment the visitor edits it
  // themselves — after that it is theirs and we stop overwriting their typing.
  function onWorkspaceChange(value) {
    setWorkspace(value);
    if (!slugTouched) setSlug(suggestSlug(value));
  }

  const localError = useMemo(() => {
    if (!email.trim()) return '';
    const pwd = passwordPolicyError(password, password);
    if (pwd) return t(pwd);
    if (slug) {
      const bad = slugError(slug);
      if (bad) return t(bad);
    }
    return '';
  }, [email, password, slug, t]);

  const submit = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    // The same rules the server applies, run here first so the answer is
    // instant. lib/reserved-slugs.js and lib/password-policy.js are the browser
    // mirrors of _shared/signup-rules.ts — the server still decides.
    const pwd = passwordPolicyError(password, password);
    if (pwd) { setError(t(pwd)); return; }
    const bad = slugError(slug);
    if (bad) { setError(t(bad)); return; }

    setPhase('sending');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('signup-start', {
        body: {
          email: email.trim().toLowerCase(),
          password,
          workspace_name: workspace.trim(),
          slug: slug.trim().toLowerCase(),
          lang,
          // Stored on the account rather than kept in this tab. The
          // verification link is frequently opened somewhere else — a phone,
          // a webmail preview — and anything held in localStorage here is
          // gone by then. `pending_plan` travels with the account, which is
          // the same reason the workspace name and slug do.
          //
          // Harmless against a server that predates it: an older
          // signup-start ignores the extra field and the plan is simply
          // dropped, which is exactly today's behaviour.
          ...(plan ? { plan } : {}),
        },
      });
      const code = await edgeErrorCode(fnErr, data);
      if (code) {
        // Validation problems are named; anything else stays generic. Note that
        // "this email already exists" is NOT among the possible codes — the
        // server does not tell us, by design.
        setError(t(code) !== code ? t(code) : t('signup_failed'));
        setPhase('form');
        return;
      }
      setPhase('sent');
    } catch (err) {
      console.error('[signup] failed:', err);
      setError(t('signup_failed'));
      setPhase('form');
    }
  }, [email, password, workspace, slug, lang, plan, t]);

  return (
    <>
      <Head>
        <title>{t('signup_title')}</title>
        {/* noindex: the marketing site is what should rank, and this page is
            served on every tenant domain as well as the platform's own. */}
        <meta name="robots" content="noindex" />
      </Head>

      <main className="su" dir={dir}>
        <div className="su-shell">
          <header className="su-top">
            <img className="su-logo" src={theme === 'light' ? '/logo-light.png' : '/logo.png'} alt="ديزاينكم" />
            <button
              type="button"
              className="su-lang"
              onClick={() => setLang(ar ? 'en' : 'ar')}
              title={ar ? 'Switch to English' : 'التحويل إلى العربية'}
            >
              {ar ? 'EN' : 'ع'}
            </button>
          </header>

          {phase === 'sent' ? (
            <Card pad="lg" className="su-card">
              <div className="su-center">
                <div className="su-mark ok" aria-hidden="true">✉</div>
                <h1>{t('signup_check_email_title')}</h1>
                <p className="su-muted">
                  {t('signup_check_email_desc')} <strong dir="ltr">{email.trim().toLowerCase()}</strong>
                </p>
                <p className="su-muted su-small">{t('signup_check_email_hint')}</p>
                {/* Shown to EVERYONE, always. signup-start deliberately never
                    overwrites the password of an address that already exists —
                    otherwise anyone who knows an unverified address could
                    replace the real owner's credentials before they confirm.
                    The consequence is that a second submission leaves the FIRST
                    password in force, and saying nothing made people believe
                    the password they had just typed was live. Showing this only
                    on a repeat would reveal that the address exists, so it is
                    unconditional. */}
                <p className="su-muted su-small">{t('signup_password_notice')}</p>
                <button type="button" className="su-link" onClick={() => setPhase('form')}>
                  {t('signup_resend')}
                </button>
              </div>
            </Card>
          ) : (
            <Card pad="lg" className="su-card">
              <h1 className="su-h1">{t('signup_title')}</h1>
              <p className="su-muted su-lead">{t('signup_sub')}</p>

              <form onSubmit={submit} className="su-form">
                <label className="su-field">
                  <span>{t('email')}</span>
                  <input
                    type="email" dir="ltr" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <label className="su-field">
                  <span>{t('password')}</span>
                  <input
                    type="password" dir="ltr" required autoComplete="new-password"
                    minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX_CHARS}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                  <span className="su-hint">{t('signup_password_hint')}</span>
                </label>

                <label className="su-field">
                  <span>{t('signup_workspace_name')}</span>
                  <input
                    type="text" required maxLength={60}
                    value={workspace} onChange={(e) => onWorkspaceChange(e.target.value)}
                  />
                </label>

                <label className="su-field">
                  <span>{t('signup_slug')}</span>
                  {/* dir="ltr" always: the address is ASCII by design, and an
                      Arabic-direction input would show it reversed. */}
                  <span className="su-slug" dir="ltr">
                    <span className="su-slug-prefix">designakum.site/</span>
                    <input
                      type="text" required dir="ltr" value={slug}
                      onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
                    />
                  </span>
                  <span className="su-hint">{t('signup_slug_hint')}</span>
                </label>

                {(error || localError) && <div className="su-err">{error || localError}</div>}

                <Button type="submit" block loading={phase === 'sending'}>
                  {t('signup_submit')}
                </Button>
              </form>

              <p className="su-muted su-small su-foot-note">
                {t('signup_have_account')} <a href="/admin">{t('sign_in')}</a>
              </p>
            </Card>
          )}

          <footer className="su-foot">
            <Link href="/terms">{t('legal_terms')}</Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy">{t('legal_privacy')}</Link>
          </footer>
        </div>
      </main>

      <style jsx>{`
        .su { min-height: 100vh; padding: var(--space-6) var(--space-4) var(--space-8);
          background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); }
        .su-shell { max-width: 520px; margin: 0 auto; }
        .su-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
        .su-logo { height: 28px; width: auto; }
        .su-lang { width: 34px; height: 34px; border-radius: 50%; background: var(--bg-elevated);
          border: 1px solid var(--border); color: var(--text-secondary); font-family: inherit;
          font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
        .su-lang:hover { color: var(--text-primary); border-color: var(--border-strong); }
        .su-lang:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .su-h1 { font-size: var(--text-xl); font-weight: 700; margin: 0 0 var(--space-2); }
        /* Both classes are on the same element and .su-muted sets margin: 0,
           so this needs the higher specificity or the subtitle collides with
           the first field label. */
        .su-muted.su-lead { margin-bottom: var(--space-5); }
        .su-muted { color: var(--text-tertiary); font-size: var(--text-sm); line-height: 1.6; margin: 0; }
        .su-small { font-size: var(--text-xs); }
        .su-form { display: flex; flex-direction: column; gap: var(--space-4); }
        .su-field { display: flex; flex-direction: column; gap: 6px; }
        .su-field > span:first-child { font-size: var(--text-xs); color: var(--text-tertiary); }
        .su-field input { width: 100%; padding: 11px 14px; background: var(--bg-primary);
          border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary);
          /* 16px: anything smaller makes iOS zoom on focus */
          font-size: 16px; font-family: inherit; }
        .su-field input:focus { outline: none; border-color: var(--accent); }
        .su-hint { font-size: var(--text-xs); color: var(--text-muted); }
        .su-slug { display: flex; align-items: stretch; border: 1px solid var(--border);
          border-radius: var(--radius-md); overflow: hidden; background: var(--bg-primary); }
        .su-slug-prefix { display: flex; align-items: center; padding: 0 10px; white-space: nowrap;
          background: var(--bg-elevated); color: var(--text-tertiary); font-size: var(--text-sm); }
        .su-slug input { border: none; border-radius: 0; background: transparent; }
        .su-err { padding: 10px 12px; background: var(--danger-bg); color: var(--danger);
          border: 1px solid var(--danger-border); border-radius: var(--radius-md);
          font-size: var(--text-sm); line-height: 1.5; }
        .su-foot-note { margin-top: var(--space-5); }
        .su-foot-note :global(a), .su-link { color: var(--accent); text-decoration: none;
          background: none; border: none; font-family: inherit; font-size: inherit; cursor: pointer; }
        .su-foot-note :global(a:hover), .su-link:hover { text-decoration: underline; }

        .su-center { display: flex; flex-direction: column; align-items: center; text-align: center;
          gap: var(--space-3); padding: var(--space-5) 0; }
        .su-center h1 { font-size: var(--text-xl); font-weight: 700; margin: 0; }
        .su-mark { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 22px; font-weight: 700; }
        .su-mark.ok { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }

        .su-foot { display: flex; align-items: center; justify-content: center; gap: var(--space-2);
          margin-top: var(--space-6); font-size: var(--text-xs); color: var(--text-muted); }
        .su-foot :global(a) { color: var(--text-tertiary); text-decoration: none; }
        .su-foot :global(a:hover) { color: var(--text-secondary); }
      `}</style>
      <style jsx global>{`
        .su .su-card { width: 100%; }
      `}</style>
    </>
  );
}
