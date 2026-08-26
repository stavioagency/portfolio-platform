// /reset-password — where the emailed recovery link lands.
//
// THIS PAGE SPENDS NOTHING ON LOAD, and that is load-bearing. HANDOFF §9
// records mail scanners burning single-use links by pre-fetching them. A GET
// here renders a form and calls no function at all; the token is spent by
// complete-password-reset when a human submits. That is what makes single-use
// safe for recovery when it was not safe for signup verification.
//
// It therefore CANNOT tell you on arrival whether the token is any good — there
// is no check that would not also spend it. An expired link looks fine until
// the form is submitted, which is the right trade: the alternative is a
// validate endpoint that a scanner can hit, or a token that survives being
// used.
import { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { getTranslator, resolveLang, isLang } from '../lib/translations';
import { edgeErrorCode } from '../lib/billing-errors';
import { passwordPolicyError, PASSWORD_MIN, PASSWORD_MAX_CHARS } from '../lib/password-policy';
import { isPwnedPassword } from '../lib/pwned-password';
import { Button, Card } from '../components/ui';

// Where they go once it has worked. Same destination the old Supabase recovery
// link used, so nothing downstream of sign-in changes.
const SIGN_IN_PATH = '/admin';
const REDIRECT_MS = 1600;

export default function ResetPassword() {
  const [lang, setLang] = useState('ar');
  const [theme, setTheme] = useState('dark');
  // form | saving | done | invalid  — `invalid` is only ever reached from a
  // submission or a missing token, never from a check on load. See the note above.
  const [phase, setPhase] = useState('form');
  const [token, setToken] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const redirectTimer = useRef(null);
  const router = useRouter();

  const t = useMemo(() => getTranslator(lang), [lang]);
  const ar = lang === 'ar';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // The link is routinely opened on a device that has never seen this site,
    // so it carries its own language rather than trusting stored preference.
    // Same rule, and same helper, as /signup/verify.
    const fromLink = params.get('lang');
    let stored = null;
    try { stored = localStorage.getItem('lang'); } catch (_) {}
    setLang(resolveLang(fromLink, stored));

    let storedTheme = 'dark';
    try { storedTheme = localStorage.getItem('admin_theme') || 'dark'; } catch (_) {}
    setTheme(storedTheme);
    document.documentElement.setAttribute('data-admin-theme', storedTheme);

    const raw = params.get('token') || '';
    // Shape-checked here only to skip rendering a form that cannot possibly
    // work. The real check is server-side, against the stored digest.
    if (!/^[0-9a-f]{64}$/i.test(raw)) { setPhase('invalid'); return; }
    setToken(raw);

  }, []);

  // Take the token out of the address bar. It stays in `token` for the
  // submission, but it is no longer in the URL that gets bookmarked, shared in
  // a screenshot, or read by anything that can see window.location.
  //
  // THROUGH THE ROUTER, NOT window.history. A bare history.replaceState() in
  // the mount effect above looks like it works and does not: Next's router
  // writes its own history entry as it finishes hydrating, restoring the
  // original URL — token and all — a moment after ours is applied. Verified in
  // the browser, which is the only place that failure is visible. Gated on
  // `isReady` so this runs after the router has settled rather than racing it.
  useEffect(() => {
    if (!router.isReady || !router.query.token) return;
    const fromLink = router.query.lang;
    router.replace(
      isLang(fromLink) ? `/reset-password?lang=${fromLink}` : '/reset-password',
      undefined,
      { shallow: true },
    ).catch(() => {
      // Non-fatal: the token stays visible, which is where it already was. Not
      // worth failing the reset over.
    });
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
  }, [lang, ar]);

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Local rules first, so an obvious problem costs no round-trip. The server
    // enforces the same ones from _shared/signup-rules.ts regardless — this is
    // for the person's benefit, not a security boundary.
    const policyErr = passwordPolicyError(pwd, confirmPwd);
    if (policyErr) { setError(t(policyErr)); return; }

    setPhase('saving');
    try {
      // Breach check before the write, exactly like the two in-dashboard
      // password screens. Fails OPEN by design — see lib/pwned-password.js:
      // an outage at the breach service must not block account recovery.
      const { pwned } = await isPwnedPassword(pwd);
      if (pwned) { setError(t('password_pwned')); setPhase('form'); return; }

      const { data, error: fnErr } = await supabase.functions.invoke('complete-password-reset', {
        body: { token, password: pwd },
      });
      const code = await edgeErrorCode(fnErr, data);
      if (code === 'invalid_or_expired_token') { setPhase('invalid'); return; }
      if (code) {
        // A named policy failure reads back as its own sentence; anything else
        // gets the generic line rather than a raw code.
        setError(t(code) !== code ? t(code) : t('reset_pw_failed'));
        setPhase('form');
        return;
      }

      // Nothing is signed in here on purpose. The new password is the thing
      // being proven, and making them type it once is how they find out it
      // works — landing straight in the dashboard hides a typo until next time.
      setPhase('done');
      redirectTimer.current = setTimeout(() => {
        window.location.href = `${SIGN_IN_PATH}?lang=${lang}`;
      }, REDIRECT_MS);
    } catch (err) {
      // Never log `pwd` or `token`.
      console.error('[reset-password] failed:', err);
      setError(t('reset_pw_failed'));
      setPhase('form');
    }
  }

  const saving = phase === 'saving';
  const forgotHref = `${SIGN_IN_PATH}?lang=${encodeURIComponent(lang)}`;

  return (
    <>
      <Head>
        <title>{t('reset_pw_title')}</title>
        {/* Never indexed, and never sent onward: a referrer would carry the
            token to whatever the page links to. */}
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>

      <main className="rp" dir={ar ? 'rtl' : 'ltr'}>
        <div className="rp-shell">
          <header className="rp-top">
            <img className="rp-logo" src={theme === 'light' ? '/logo-light.png' : '/logo.png'} alt="ديزاينكم" />
          </header>

          <Card pad="lg" className="rp-card">
            {(phase === 'form' || saving) && (
              <form onSubmit={handleSubmit} className="rp-form">
                <h1>{t('reset_pw_heading')}</h1>
                <p className="rp-muted">{t('reset_pw_hint')}</p>

                {/* Present, hidden, and holding the account's address would be
                    ideal for password managers — but this page never learns the
                    address, by design: returning it would make the token a way
                    to read one. Managers handle new-password pairs without it. */}
                <label htmlFor="rp-new">{t('new_password')}</label>
                <input
                  id="rp-new" type="password" dir="ltr" value={pwd}
                  onChange={(e) => setPwd(e.target.value)} required autoFocus
                  autoComplete="new-password" disabled={saving}
                  minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX_CHARS}
                />

                <label htmlFor="rp-confirm">{t('confirm_new_password')}</label>
                <input
                  id="rp-confirm" type="password" dir="ltr" value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)} required
                  autoComplete="new-password" disabled={saving}
                  minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX_CHARS}
                />

                {error && <p className="rp-err" role="alert">{error}</p>}

                <Button type="submit" block loading={saving} disabled={saving || !pwd || !confirmPwd}>
                  {saving ? t('reset_pw_saving') : t('reset_pw_submit')}
                </Button>
              </form>
            )}

            {phase === 'done' && (
              <div className="rp-center" aria-live="polite">
                <div className="rp-mark ok" aria-hidden="true">✓</div>
                <h1>{t('reset_pw_done_title')}</h1>
                <p className="rp-muted">{t('reset_pw_done_desc')}</p>
                {/* The timer does the navigating; this is for anyone who would
                    rather not wait, and for when the timer is throttled in a
                    backgrounded tab. */}
                <a href={forgotHref} className="rp-btn">{t('sign_in')}</a>
              </div>
            )}

            {phase === 'invalid' && (
              <div className="rp-center">
                <div className="rp-mark warn" aria-hidden="true">!</div>
                <h1>{t('reset_pw_invalid_title')}</h1>
                <p className="rp-muted">{t('reset_pw_invalid_desc')}</p>
                <a href={forgotHref} className="rp-btn">{t('reset_pw_request_new')}</a>
              </div>
            )}
          </Card>
        </div>
      </main>

      <style jsx>{`
        .rp { min-height: 100vh; padding: var(--space-6) var(--space-4) var(--space-8);
          background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans); }
        .rp-shell { max-width: 460px; margin: 0 auto; }
        .rp-top { display: flex; justify-content: center; margin-bottom: var(--space-6); }
        .rp-logo { height: 28px; width: auto; }
        .rp-form { display: flex; flex-direction: column; gap: var(--space-2); }
        .rp-form h1 { font-size: var(--text-xl); font-weight: 700; margin: 0; }
        .rp-form label { font-size: var(--text-sm); color: var(--text-secondary); margin-top: var(--space-2); }
        .rp-form input { width: 100%; padding: 10px 12px; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--bg-elevated);
          color: var(--text-primary); font-size: var(--text-md); font-family: var(--font-sans); }
        .rp-form input:disabled { opacity: 0.6; }
        .rp-center { display: flex; flex-direction: column; align-items: center; text-align: center;
          gap: var(--space-3); padding: var(--space-5) 0; }
        .rp-center h1 { font-size: var(--text-xl); font-weight: 700; margin: 0; }
        .rp-muted { color: var(--text-tertiary); font-size: var(--text-sm); line-height: 1.6;
          max-width: 42ch; margin: 0; }
        .rp-err { color: var(--danger); font-size: var(--text-sm); margin: var(--space-2) 0 0; }
        .rp-mark { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 22px; font-weight: 700; }
        .rp-mark.ok { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
        .rp-mark.warn { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border); }
        .rp-btn { display: inline-block; margin-top: var(--space-2); padding: 10px 20px;
          border-radius: var(--radius-sm); background: var(--accent); color: var(--accent-fg);
          text-decoration: none; font-size: var(--text-sm); font-weight: 600; }
      `}</style>
    </>
  );
}
