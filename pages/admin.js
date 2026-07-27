import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import Head from 'next/head';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import { supabase } from '../lib/supabase';
import { normalizeHost } from '../lib/tenant';
import { getTranslator } from '../lib/translations';
import { pick, setLangValue, emptyBilingual } from '../lib/i18n';
import { BRAND_ICONS, BRAND_KEYS, normalizeIcon } from '../lib/brand-icons';
import { navGroups } from '../lib/admin-nav';
import { passwordPolicyError, PASSWORD_MIN, PASSWORD_MAX_CHARS } from '../lib/password-policy';
import { isPwnedPassword } from '../lib/pwned-password';
import { GUIDE_STEPS, nextStep } from '../lib/onboarding-guide';
import {
  arrivedViaPasswordLink as arrivedViaPasswordLinkFn,
  readAuthLinkErrorFromWindow,
  isExpiredLinkError,
} from '../lib/auth-link';
import { parseLoginIdentifier } from '../lib/resolve-login';
import { compressImage, fileExtension, MAX_AVATAR_DIMENSION } from '../lib/image-compress';
import {
  Button, Card, CardHeader, Badge, EmptyState, Icon, Skeleton,
  ToastProvider, useToast, ConfirmProvider, useConfirm,
} from '../components/ui';
import PreviewPane from '../components/PreviewPane';

// A recovery link lands as `#...type=recovery...` and supabase-js STRIPS that hash
// while it exchanges the token — which can happen before our onAuthStateChange
// listener is subscribed, so the PASSWORD_RECOVERY event is easy to miss. Because
// the link also creates a real session, missing it drops the user straight into the
// dashboard and the reset link silently becomes a passwordless login. Read the hash
// once at module load (before the client's async init clears it) and treat it as a
// second, independent signal.
//
// Both recovery AND invite links must force the set-password step — see
// lib/auth-link.js for why invite is the case that was missing. Evaluated at module
// load, before supabase-js strips the hash.
const arrivedViaPasswordLink = arrivedViaPasswordLinkFn();
const authLinkError = readAuthLinkErrorFromWindow();

// "Must set a password" has to OUTLIVE the URL. The hash is stripped by supabase-js
// within a second of landing, so a refresh — or any navigation — used to drop the
// requirement entirely, leaving someone inside the admin with a session and no
// password. Persist it until a password is actually saved.
const PENDING_PW_KEY = 'admin_must_set_password';
function markPasswordPending() {
  try { localStorage.setItem(PENDING_PW_KEY, '1'); } catch (_) {}
}
function isPasswordPending() {
  try { return localStorage.getItem(PENDING_PW_KEY) === '1'; } catch (_) { return false; }
}
function clearPasswordPending() {
  try { localStorage.removeItem(PENDING_PW_KEY); } catch (_) {}
}
// Set it at module load, for the same reason the link is read here.
if (arrivedViaPasswordLink) markPasswordPending();

function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }


// Shared ConfirmDialog shapes, so every destructive action is worded the same way
// in both locales. These replace the old bare confirm(t('...')) strings.
function unsavedDialog(t) {
  return {
    title: t('unsaved_title'),
    description: t('unsaved_switch'),
    confirmLabel: t('discard_changes'),
    cancelLabel: t('keep_editing'),
    tone: 'danger',
  };
}
function removeDialog(t) {
  return {
    title: t('confirm_remove'),
    description: t('action_undone'),
    confirmLabel: t('remove'),
    cancelLabel: t('cancel'),
    tone: 'danger',
  };
}
function deleteDialog(t, title, description) {
  return {
    title,
    description: description || t('action_undone'),
    confirmLabel: t('delete'),
    cancelLabel: t('cancel'),
    tone: 'danger',
  };
}

// Canonical admin URL for auth redirects (password reset + invites). Using ONE fixed
// origin — instead of window.location.origin — means only this URL needs to be in the
// Supabase "Redirect URLs" allowlist, no matter how many client custom domains exist.
// Override per environment with NEXT_PUBLIC_ADMIN_URL; on localhost we keep the local
// origin so dev password-reset works.
// The fallback below must ALWAYS be present in Supabase's Redirect URLs allowlist.
// Supabase silently drops a redirect it does not recognise and falls back to the
// Site URL, which is how password recovery once landed on a tenant homepage
// instead of the reset screen (see c835317).
function adminRedirectUrl() {
  const isLocal = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const base = process.env.NEXT_PUBLIC_ADMIN_URL
    || (isLocal ? window.location.origin : 'https://designakum.site');
  return `${String(base).replace(/\/+$/, '')}/admin`;
}

function readLang() {
  if (typeof window === 'undefined') return 'ar';
  return localStorage.getItem('lang') || 'ar';
}
function applyLang(lang) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

const BANNER_BGS = {
  purple: { name: 'Purple',  gradient: 'linear-gradient(135deg, #7a72d6, #9FA7FF)' },
  blue:   { name: 'Blue',    gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)' },
  sunset: { name: 'Sunset',  gradient: 'linear-gradient(135deg, #ec4899, #f97316)' },
  forest: { name: 'Forest',  gradient: 'linear-gradient(135deg, #10b981, #3b82f6)' },
  dark:   { name: 'Dark',    gradient: 'linear-gradient(135deg, #1f2937, #374151)' },
};

const THEME_PRESETS = {
  midnight: { key: 'midnight', tokens: { accent: '#9FA7FF', bg: '#0a0a0c', surface: '#131318', text: '#ffffff', text_muted: 'rgba(255, 255, 255, 0.45)', border: 'rgba(255, 255, 255, 0.06)' } },
  paper:    { key: 'paper',    tokens: { accent: '#5b5fc7', bg: '#faf9f6', surface: '#ffffff', text: '#1a1a22', text_muted: 'rgba(26,26,34,0.55)', border: 'rgba(0,0,0,0.08)' } },
  forest:   { key: 'forest',   tokens: { accent: '#7dd37d', bg: '#0c1410', surface: '#142019', text: '#ffffff', text_muted: 'rgba(255, 255, 255, 0.5)', border: 'rgba(255, 255, 255, 0.07)' } },
  plum:     { key: 'plum',     tokens: { accent: '#ff9fb5', bg: '#1a0e1a', surface: '#251525', text: '#ffffff', text_muted: 'rgba(255, 255, 255, 0.5)', border: 'rgba(255, 255, 255, 0.08)' } },
};

const FONT_OPTIONS = [
  { key: 'manrope',  label: 'Manrope (modern)',     stack: "'Manrope', 'IBM Plex Sans Arabic', system-ui, sans-serif" },
  { key: 'cairo',    label: 'Cairo (Arabic-first)', stack: "'Cairo', 'Manrope', system-ui, sans-serif" },
  { key: 'reemkufi', label: 'Reem Kufi (calligraphic)', stack: "'Reem Kufi', 'Cairo', serif" },
  { key: 'plexar',   label: 'IBM Plex Sans Arabic', stack: "'IBM Plex Sans Arabic', 'Manrope', sans-serif" },
];

const DENSITY_OPTS = [
  { key: 'comfortable', value: 1.0 },
  { key: 'compact',     value: 0.85 },
  { key: 'spacious',    value: 1.15 },
];

const RADIUS_OPTS = [
  { key: 'soft',  px: 12 },
  { key: 'sharp', px: 4 },
  { key: 'pill',  px: 24 },
];

// =========================================================
// Main
// =========================================================
export default function Admin() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLangState] = useState('ar');
  const [theme, setThemeState] = useState('dark');
  // Reads the persisted flag, not just this page load's URL: the hash is gone after
  // a refresh, but the obligation is not.
  const [recoveryMode, setRecoveryMode] = useState(() => arrivedViaPasswordLink || isPasswordPending());
  const t = getTranslator(lang);

  useEffect(() => {
    const initial = readLang();
    setLangState(initial);
    applyLang(initial);
    try { setThemeState(localStorage.getItem('admin_theme') || 'dark'); } catch (e) {}

    // A rejection here used to strand the admin on "Loading…" with no error and no
    // way forward but a manual reload. Clear the flag either way and fall through
    // to the sign-in form — the user gets a real error when they try to sign in.
    // Deliberately no timeout backstop: force-clearing a slow-but-valid session
    // restore would flash the sign-in form at an already-authenticated user.
    supabase.auth.getSession()
      .then(({ data }) => { setSession(data?.session ?? null); })
      .catch((err) => { console.error('[auth] getSession failed:', err); })
      .finally(() => { setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      // An invite fires SIGNED_IN, not PASSWORD_RECOVERY, so the link type is the
      // only reliable signal for it. Belt and braces alongside the initial state.
      if (event === 'PASSWORD_RECOVERY') { markPasswordPending(); setRecoveryMode(true); }
      if (event === 'SIGNED_IN' && arrivedViaPasswordLink) { markPasswordPending(); setRecoveryMode(true); }
      // Signing out ends the obligation — the next session decides for itself.
      if (event === 'SIGNED_OUT') { clearPasswordPending(); setRecoveryMode(false); }
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Language is remembered in TWO places on purpose:
  //   * localStorage — instant, so the admin never flashes Arabic before correcting
  //     itself on load.
  //   * user_metadata.admin_lang — follows the ACCOUNT, so signing in on a different
  //     browser or machine still comes up in the language you last chose. This is
  //     separate from profile.default_lang, which is the language a client's PUBLIC
  //     SITE opens in — a different decision that happens to have the same values.
  function setLang(next, { persistToAccount = true } = {}) {
    setLangState(next);
    applyLang(next);
    if (persistToAccount && session) {
      // Fire and forget: a failure here costs the cross-device memory, nothing else,
      // and localStorage has already recorded the choice.
      // Spread the existing metadata rather than trusting the API to merge: if it
      // replaced instead, this would silently clear must_set_password and drop the
      // password gate for a client who has not chosen one yet.
      supabase.auth.updateUser({ data: { ...(session.user?.user_metadata || {}), admin_lang: next } })
        .catch((err) => console.warn('[lang] could not save to account:', err));
    }
  }

  // Apply the account's remembered language once a session exists. Skipped when it
  // already matches, so this never fights the user mid-session, and flagged not to
  // write back — otherwise reading a value would immediately re-save it.
  useEffect(() => {
    const saved = session?.user?.user_metadata?.admin_lang;
    if (!saved || (saved !== 'ar' && saved !== 'en')) return;
    if (saved === lang) return;
    setLangState(saved);
    applyLang(saved);
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  function toggleLang() {
    setLang(lang === 'ar' ? 'en' : 'ar');
  }
  function toggleTheme() {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('admin_theme', next); } catch (e) {}
      return next;
    });
  }
  useEffect(() => {
    const c = theme === 'light' ? '#ffffff' : '#060912';
    document.body.style.background = c;
    document.documentElement.style.background = c;
    // Drives the light-theme tokens in globals.css. Set at the root so overlays
    // rendered outside .dashboard (toasts, confirm dialogs) are themed too.
    document.documentElement.setAttribute('data-admin-theme', theme || 'dark');
    return () => {
      document.body.style.background = '';
      document.documentElement.style.background = '';
      document.documentElement.removeAttribute('data-admin-theme');
    };
  }, [theme]);


  if (loading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>{t('loading')}</div>;

  // Toast + Confirm are mounted here (not in _app) so only the admin carries them.
  return (
    <ToastProvider>
    <ConfirmProvider>
      <Head><title>{t('head_title_admin')}</title></Head>
      {/* An invited client gets the admin IMMEDIATELY, with a gate on top of it that
          cannot be dismissed until a password exists. Replacing the whole screen with
          a password form (the old behaviour) meant they never saw that the invite had
          actually worked. No session means the link failed — SignIn explains why. */}
      {session
        ? (
          <>
            <Dashboard session={session} lang={lang} toggleLang={toggleLang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} />
            {/* Three ways to owe a password, all ending at the same gate: arrived by
                an invite/reset link, a pending obligation from a previous load, or an
                account created with a temporary password by the owner. */}
            {(recoveryMode || session.user?.user_metadata?.must_set_password === true) && (
              <SetPasswordGate
                lang={lang}
                onDone={() => { clearPasswordPending(); setRecoveryMode(false); }}
              />
            )}
          </>
        )
        : <SignIn lang={lang} toggleLang={toggleLang} theme={theme} toggleTheme={toggleTheme} linkError={authLinkError} />}
    </ConfirmProvider>
    </ToastProvider>
  );
}

function LangToggleButton({ lang, onClick }) {
  // Shows the TARGET language (clicking switches TO this language)
  const targetLabel = lang === 'ar' ? 'EN' : 'العربية';
  return (
    <button type="button" onClick={onClick} className="lang-toggle-btn" title={targetLabel}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
      <style jsx>{`
        .lang-toggle-btn {
          padding: 6px 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: inherit;
        }
        .lang-toggle-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
        .lang-toggle-btn svg { opacity: 0.7; }
      `}</style>
    </button>
  );
}

function ThemeToggleButton({ theme, onClick }) {
  const isDark = theme !== 'light';
  return (
    <button type="button" onClick={onClick} className="theme-toggle-btn" title={isDark ? 'Light mode' : 'Dark mode'}>
      {isDark ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      )}
      <style jsx>{`
        .theme-toggle-btn {
          padding: 6px 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        }
        .theme-toggle-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
      `}</style>
    </button>
  );
}

// =========================================================
// Sign In
// =========================================================
function SignIn({ lang, toggleLang, theme, toggleTheme, linkError }) {
  const t = getTranslator(lang);
  const ar = lang === 'ar';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('signin'); // 'signin' | 'forgot'
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const id = parseLoginIdentifier(username);
      let email = null;
      if (id.kind === 'email') {
        email = id.value;
      } else if (id.kind === 'username') {
        const { data, error: rpcError } = await supabase.rpc('get_email_for_username', { p_username: id.value });
        if (!rpcError) email = data || null;
      }
      // Always attempt the sign-in, even with no resolved email. Returning early
      // on an unknown username answered far faster than a real password check,
      // which leaked whether an account existed; letting Supabase reject it keeps
      // both paths indistinguishable.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email || `${id.value || 'unknown'}@invalid.local`,
        password,
      });
      if (authError) setError(t('invalid_credentials'));
    } catch (err) {
      // network / unexpected failure — never leave the button stuck spinning
      console.error('[auth] sign-in failed:', err);
      setError(t('invalid_credentials'));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setForgotLoading(true);
    const raw = forgotIdentifier.trim();
    // Accept a typed email directly; otherwise resolve a username to its email
    // via the same RPC the sign-in form uses. Either way we show the same
    // generic message afterward so we never reveal whether an account exists.
    try {
      let email = raw.includes('@') ? raw : null;
      if (!email) {
        const { data } = await supabase.rpc('get_email_for_username', { p_username: raw.toLowerCase() });
        email = data || null;
      }
      if (email) {
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: adminRedirectUrl() });
      }
    } catch (err) {
      // Swallow — the generic "if it exists, we sent a link" screen is shown
      // regardless, so a failure here must not reveal account existence.
      console.error('[auth] reset request failed:', err);
    } finally {
      setForgotLoading(false);
      setForgotDone(true);
    }
  }

  function backToSignIn() {
    setMode('signin');
    setForgotDone(false);
    setForgotIdentifier('');
  }

  const isForgot = mode === 'forgot';

  return (
    <AuthShell
      theme={theme} lang={lang} toggleLang={toggleLang} toggleTheme={toggleTheme}
      title={isForgot ? t('forgot_password_heading') : t('sign_in_heading')}
      onSubmit={isForgot ? handleForgotSubmit : handleSubmit}
    >
        {isForgot ? (
          forgotDone ? (
            <>
              <p className="signin-hint">{t('forgot_password_sent')}</p>
              <button type="button" className="link-btn" onClick={backToSignIn}>{t('back_to_sign_in')}</button>
            </>
          ) : (
            <>
              <p className="signin-hint">{t('forgot_password_hint')}</p>
              <label htmlFor="forgot-identifier">{t('username_or_email')}</label>
              <input id="forgot-identifier" name="forgot-identifier" type="text" dir="ltr" value={forgotIdentifier} onChange={(e) => setForgotIdentifier(e.target.value)} required autoFocus autoComplete="username" spellCheck="false" autoCapitalize="off" />
              <Button type="submit" block loading={forgotLoading} disabled={!forgotIdentifier.trim()}>{forgotLoading ? t('sending') : t('send_reset_link')}</Button>
              <button type="button" className="link-btn" onClick={backToSignIn}>{t('back_to_sign_in')}</button>
            </>
          )
        ) : (
          <>
            {/* Arriving here from a dead invite/reset link used to look like the app
                simply demanding a password the person had never set. Say what happened. */}
            {linkError && (
              <div className="error" style={{ marginBottom: 12 }}>
                {isExpiredLinkError(linkError)
                  ? (ar
                    ? 'انتهت صلاحية الرابط أو تم استخدامه من قبل. اطلب دعوة جديدة أو رابط إعادة تعيين.'
                    : 'That link has expired or was already used. Ask for a new invite or reset link.')
                  : (linkError.description || linkError.code)}
              </div>
            )}
            <p className="signin-hint">{t('sign_in_hint')}</p>
            <label htmlFor="signin-username">{t('username_or_email')}</label>
            {/* 254 = the maximum length of an email address; a username is capped
                well below that by the invite validator. */}
            <input id="signin-username" name="username" type="text" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus autoComplete="username" spellCheck="false" autoCapitalize="off" maxLength={254} />
            <label htmlFor="signin-password">{t('password')}</label>
            {/* Matches the cap enforced everywhere a password is SET, so the two
                screens cannot disagree. NOTE: this makes a pre-policy password
                longer than PASSWORD_MAX_CHARS untypeable here — see HANDOFF §7. */}
            <input id="signin-password" name="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" maxLength={PASSWORD_MAX_CHARS} />
            {error && <div className="error">{error}</div>}
            <Button type="submit" block loading={loading}>{loading ? t('signing_in') : t('sign_in')}</Button>
            <button type="button" className="link-btn" onClick={() => setMode('forgot')}>{t('forgot_password_link')}</button>
          </>
        )}
    </AuthShell>
  );
}

// Shared chrome for the signed-out screen (SignIn).
// previously carried a byte-identical 18-line style block; it now lives once in
// AuthStyles below.
function AuthShell({ theme, lang, toggleLang, toggleTheme, title, onSubmit, children }) {
  return (
    <div className={`signin-wrap ${theme || 'dark'}`}>
      <form className="signin-card" onSubmit={onSubmit}>
        <div className="signin-top">
          <h1>{title}</h1>
          <LangToggleButton lang={lang} onClick={toggleLang} /><ThemeToggleButton theme={theme} onClick={toggleTheme} />
        </div>
        {children}
      </form>
      <AuthStyles />
    </div>
  );
}

// Global, but every selector is scoped under .signin-wrap / .signin-card so it
// cannot leak into the dashboard.
function AuthStyles() {
  return (
    <style jsx global>{`
      .signin-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; color: var(--text-primary); --accent: #4f6ef2; --accent-hover: #6d86ff; --accent-fg: #ffffff; --border: rgba(var(--on-bg),0.1); --border-strong: rgba(var(--on-bg),0.2); transition: background-color 0.2s; }
      .signin-wrap.dark { --on-bg: 255,255,255; --bg-primary: #060912; --bg-secondary: #0c1428; --bg-elevated: #141d38; --bg-hover: #1d2747; --text-primary: #ffffff; --text-secondary: #ffffff; --text-tertiary: #ffffff; --text-muted: #ffffff; background-color: #060912; }
      /* tokens come from [data-admin-theme='light'] in globals.css */
      .signin-wrap.light { background-color: #ffffff; }
      .signin-card { width: 100%; max-width: 360px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-6); }
      .signin-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 12px; }
      .signin-card h1 { font-size: var(--text-xl); font-weight: 700; }
      .signin-hint { font-size: 13px; color: var(--text-tertiary); margin-bottom: var(--space-5); }
      .signin-card label { display: block; font-size: 12px; font-weight: 500; color: var(--text-tertiary); margin: var(--space-4) 0 6px; text-transform: uppercase; letter-spacing: 0.05em; }
      html[dir="rtl"] .signin-card label { text-transform: none; letter-spacing: normal; }
      .signin-card input { width: 100%; padding: 11px 14px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary); font-size: 14px; transition: var(--transition); font-family: inherit; }
      .signin-card input:focus { outline: none; border-color: var(--accent); }
      /* the submit button is the Button primitive now — only its spacing is local */
      .signin-card .ui-btn { margin-top: var(--space-5); border-radius: var(--radius-md); }
      .link-btn { width: 100%; background: none; border: none; padding: 0; margin-top: 12px; font-size: 12px; color: var(--text-tertiary); cursor: pointer; font-family: inherit; text-align: center; text-decoration: underline; }
      .link-btn:hover { color: var(--text-primary); }
      .signin-card .error { margin-top: var(--space-4); padding: 10px 12px; background: var(--danger-bg); color: var(--danger); border-radius: var(--radius-md); font-size: 13px; }
    `}</style>
  );
}

// =========================================================
// Set Password Gate — a modal over a LIVE dashboard, for someone who arrived by an
// invite or reset link and therefore has a session but no password of their own.
//
// It is deliberately not dismissable: no close button, no Escape, no backdrop click.
// Letting it be closed recreates the original bug — an account that works until you
// sign out and then can never be signed into again, with password reset (which needs
// email) as the only way back.
// =========================================================
function SetPasswordGate({ lang, onDone }) {
  const t = getTranslator(lang);
  const ar = lang === 'ar';
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const doneTimer = useRef(null);
  const firstFieldRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => () => clearTimeout(doneTimer.current), []);

  // Lock the page behind the gate: no scrolling, no tabbing out, no Escape.
  useEffect(() => {
    firstFieldRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key !== 'Tab') return;
      // Focus trap: keep Tab inside the panel so the dashboard underneath cannot be
      // operated around the gate.
      const focusables = panelRef.current?.querySelectorAll('input, button');
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const policyErr = passwordPolicyError(newPwd, confirmPwd);
    if (policyErr) { setError(t(policyErr)); return; }
    setLoading(true);
    try {
      // Breach check before the write. Fails open by design — see lib/pwned-password.js.
      const { pwned } = await isPwnedPassword(newPwd);
      if (pwned) { setError(t('password_pwned')); return; }
      // Clear must_set_password in the SAME call that sets the password, so the two
      // can never disagree — the gate is driven by that flag for temp-password
      // accounts, and a separate write could fail and leave it stuck on.
      const { data: cur } = await supabase.auth.getUser();
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPwd,
        // Same reasoning as the language write: preserve whatever else is in there
        // (admin_lang) instead of relying on the API to merge.
        data: { ...(cur?.user?.user_metadata || {}), must_set_password: false },
      });
      if (updateErr) { setError(updateErr.message); return; }
      setDone(true);
      doneTimer.current = setTimeout(() => onDone && onDone(), 1200);
    } catch (err) {
      console.error('[auth] set-password failed:', err);
      setError(t('save_failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gate-bg" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-panel" ref={panelRef} dir={ar ? 'rtl' : 'ltr'}>
        <h2 id="gate-title">{ar ? 'اختر كلمة المرور' : 'Choose your password'}</h2>
        {done ? (
          <p className="gate-hint">{t('password_updated')} ✓</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="gate-hint">{ar
              ? 'حسابك جاهز. اختر كلمة مرور الآن لتتمكن من تسجيل الدخول لاحقًا — بدونها لن تستطيع الرجوع بعد تسجيل الخروج.'
              : "Your account is ready. Set a password now so you can sign in later — without one you cannot get back in after signing out."}</p>
            <label htmlFor="gate-new">{t('new_password')}</label>
            <input
              id="gate-new" ref={firstFieldRef} type="password" dir="ltr" value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)} required autoComplete="new-password"
              minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX_CHARS}
            />
            <label htmlFor="gate-confirm">{t('confirm_new_password')}</label>
            <input
              id="gate-confirm" type="password" dir="ltr" value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)} required autoComplete="new-password"
              minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX_CHARS}
            />
            {error && <div className="gate-err">{error}</div>}
            <Button type="submit" block loading={loading}>
              {loading ? t('saving') : t('set_new_password_button')}
            </Button>
          </form>
        )}
      </div>
      <style jsx>{`
        .gate-bg {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.75);
          -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        .gate-panel {
          width: 100%; max-width: 380px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg, 16px);
          padding: 24px;
          box-shadow: 0 24px 70px rgba(0,0,0,0.5);
        }
        .gate-panel h2 { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
        .gate-hint { font-size: 13px; line-height: 1.6; color: var(--text-secondary); margin-bottom: 16px; }
        .gate-panel label { display: block; font-size: 12px; color: var(--text-secondary); margin: 10px 0 4px; }
        .gate-panel input {
          width: 100%; padding: 10px 12px;
          background: var(--bg-elevated); color: var(--text-primary);
          border: 1px solid var(--border); border-radius: var(--radius-md, 10px);
          font-family: inherit; font-size: 14px;
        }
        .gate-panel input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
        .gate-err {
          margin-top: 10px; padding: 8px 12px; font-size: 12px;
          background: var(--danger-bg); color: var(--danger);
          border: 1px solid var(--danger-border); border-radius: var(--radius-md, 10px);
        }
        .gate-panel :global(button) { margin-top: 14px; }
      `}</style>
    </div>
  );
}

// =========================================================
// Dashboard
// =========================================================
function Dashboard({ session, lang, toggleLang, setLang, theme, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('profile');
  const dirtyRef = useRef(false); // set by the mounted SaveBar via DirtyContext
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [tenant, setTenant] = useState(null);
  const [isOwner, setIsOwner] = useState(null); // null = unknown; true = owner; false = client (UX only; RLS is the authority)
  const TENANT_LS_KEY = 'admin_selected_tenant';
  const t = getTranslator(lang);
  const ar = lang === 'ar';
  const confirm = useConfirm();

  // Detect platform-owner status from the database (is_platform_owner). This only
  // decides which UI is shown; every privileged action is still enforced by RLS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('is_platform_owner');
        if (!cancelled) setIsOwner(data === true);
      } catch (_) { if (!cancelled) setIsOwner(false); }
    })();
    return () => { cancelled = true; };
  }, [session]);

  // Once we know the user is a CLIENT, land them on their Home (onboarding) screen
  // instead of the raw Profile editor. Owners keep the Profile default.
  useEffect(() => {
    if (isOwner === false) setActiveTab((prev) => (prev === 'profile' ? 'home' : prev));
  }, [isOwner]);

  // The grouped nav is the single source of truth for tab labels, so the mobile
  // bar and the page header can never drift from the sidebar.
  const navSections = useMemo(() => navGroups({ isOwner, ar, t }), [isOwner, ar, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const TAB_LABELS = useMemo(() => {
    const out = {};
    navSections.forEach(g => g.items.forEach(i => { out[i.id] = i.label; }));
    return out;
  }, [navSections]);

  async function navigate(tab) {
    if (tab === activeTab) { setSidebarOpen(false); return; }
    if (dirtyRef.current && !(await confirm(unsavedDialog(t)))) return;
    dirtyRef.current = false;
    setActiveTab(tab);
    setSidebarOpen(false); // auto-close drawer on mobile after picking a tab
  }
  async function signOut() { await supabase.auth.signOut(); }

  // Which workspaces may this admin edit? Exposed via context so the Create-Tenant
  // flow can refresh the list after onboarding.
  //
  // A PLATFORM OWNER gets every workspace; a client gets only their own mappings.
  // The distinction matters because `tenant_admins` is readable ONLY for your own
  // rows (RLS: tenant_admins_select_own, user_id = auth.uid()). Sourcing an
  // owner's list from it meant each owner saw just the clients THEY had created —
  // a co-owner's clients were invisible, which read as the two accounts being out
  // of sync. `tenants` carries a public read policy, so no schema change is
  // needed. RLS still governs every write; this only decides what is listed.
  const loadTenants = useCallback(async () => {
    try {
      const uid = session?.user?.id;
      if (!uid) return;
      // Ownership decides which query to run, so wait until it is known rather
      // than briefly showing an owner the client-scoped list.
      if (isOwner === null) return;

      let rows;
      if (isOwner) {
        const { data, error } = await supabase
          .from('tenants')
          .select('id, slug, name, status');
        if (error) { console.error('[tenant] tenants read failed:', error.message || error); return; }
        rows = data;
      } else {
        const { data, error } = await supabase
          .from('tenant_admins')
          .select('tenants ( id, slug, name, status )')
          .eq('user_id', uid);
        // A read failure here is a real misconfiguration (missing grant/policy),
        // so keep it visible.
        if (error) { console.error('[tenant] tenant_admins read failed:', error.message || error); return; }
        rows = (data || []).map(r => r.tenants);
      }
      if (!rows) return;
      // Keep disabled tenants in the ADMIN list — the owner must be able to see and
      // re-enable a suspended client. Public visibility is enforced by lib/tenant.js.
      const list = rows.filter(Boolean);
      list.sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug)));
      setTenants(list);
      if (list.length === 0) { setTenant(null); return; }
      let stored = null;
      try { stored = localStorage.getItem(TENANT_LS_KEY); } catch (_) {}
      const preferred = list.find(x => String(x.id) === String(stored)) || list[0];
      setTenant(prev => prev || preferred);
    } catch (e) { console.error('[tenant] tenant load error:', e); }
    // isOwner is a dependency, not just a read: it starts null and resolves
    // asynchronously, so the list must reload once ownership is known.
  }, [session, isOwner]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  // Switching tenant remounts the editors (via key), discarding unsaved edits —
  // so guard it the same way tab switches are guarded. The choice is remembered.
  async function switchTenant(id) {
    const next = tenants.find(x => String(x.id) === String(id));
    if (!next || next.id === tenant?.id) return;
    if (dirtyRef.current && !(await confirm(unsavedDialog(t)))) return;
    dirtyRef.current = false;
    setTenant(next);
    try { localStorage.setItem(TENANT_LS_KEY, String(next.id)); } catch (_) {}
  }

  // Lock body scroll when drawer is open (mobile)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const tenantKey = tenant?.id ?? 'single'; // remount editors on tenant switch -> reload scoped data

  // Website identity shown in the sidebar. In legacy single-profile mode
  // (tenant === null) this is the platform's own site at "/", exactly as before.
  const siteName = tenant?.name || tenant?.slug || t('sidebar_title');
  const sitePath = tenant?.slug ? `/${tenant.slug}` : '/';
  const siteHref = sitePath;

  // Live preview: the iframe shows the real public site for the active tenant.
  // Origin is read from the browser (never hardcoded); the same Next app serves
  // both /admin and the public routes, so its own origin is always correct.
  const [previewOrigin, setPreviewOrigin] = useState('');
  useEffect(() => { setPreviewOrigin(window.location.origin); }, []);
  const [previewToken, setPreviewToken] = useState(0);
  const refreshPreview = useCallback(() => setPreviewToken(n => n + 1), []);
  const [previewOpen, setPreviewOpen] = useState(false); // tablet toggle only
  const PREVIEW_TABS = { profile: true, card: true, appearance: true };
  const showPreview = !!PREVIEW_TABS[activeTab];

  return (
    <DirtyContext.Provider value={dirtyRef}>
    <TenantContext.Provider value={{ tenant, tenants, setTenant, reloadTenants: loadTenants, isOwner }}>
    <PreviewContext.Provider value={{ refresh: refreshPreview }}>
    <div className={`dashboard ${theme || 'dark'}`}>
      {/* MOBILE TOP BAR — only visible <720px */}
      <header className="mobile-bar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu" type="button">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span className="mobile-tab-label">{TAB_LABELS[activeTab] || t('sidebar_title')}</span>
        <LangToggleButton lang={lang} onClick={toggleLang} /><ThemeToggleButton theme={theme} onClick={toggleTheme} />
      </header>

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img className={theme !== 'light' ? 'on' : ''} src="/logo.png" alt="ديزاينكم" />
          <img className={theme === 'light' ? 'on' : ''} src="/logo-light.png" alt="" aria-hidden="true" />
        </div>
        <div className="sidebar-header">
          <div className="sidebar-title">{t('sidebar_title')}</div>
          <div className="sidebar-header-right">
            <LangToggleButton lang={lang} onClick={toggleLang} /><ThemeToggleButton theme={theme} onClick={toggleTheme} />
            <button type="button" className="drawer-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Which website am I editing right now? Previously the sidebar showed a
            generic title and a "view site" link that always pointed at "/". */}
        <div className="site-card">
          <div className="site-line">
            <span className="site-name">{siteName}</span>
            {tenant?.status === 'disabled' && (
              <Badge tone="warning">{ar ? 'معلّقة' : 'Suspended'}</Badge>
            )}
          </div>
          <div className="site-slug">{sitePath}</div>
          <a href={siteHref} target="_blank" rel="noopener noreferrer" className="view-site-btn">
            <Icon name="external" size={13} mirror />
            {t('view_live_site')}
          </a>
        </div>

        <nav className="nav" aria-label={ar ? 'التنقّل' : 'Main'}>
          {navSections.map(group => (
            <NavGroup key={group.id} label={group.label}>
              {group.items.map(item => (
                <NavItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={activeTab === item.id}
                  onClick={() => navigate(item.id)}
                />
              ))}
            </NavGroup>
          ))}
        </nav>

        <div className="sidebar-footer">
          <SidebarUser session={session} t={t} isOwner={isOwner} ar={ar} />
          <button onClick={signOut} className="signout-btn" type="button">
            <Icon name="logout" size={14} mirror />
            {t('sign_out')}
          </button>
        </div>
      </aside>

      {/* Backdrop — only visible on mobile when drawer is open */}
      <div className={`backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <main className="content">
        {isOwner && <TenantSelector tenants={tenants} tenant={tenant} onChange={switchTenant} lang={lang} />}

        <div className={`work ${showPreview ? 'has-preview' : ''} ${previewOpen ? 'preview-open' : ''}`}>
          <div className="work-editor">
            {showPreview && (
              // Tablet-only toggle; hidden on desktop (preview always shown) and
              // on mobile (no preview yet). See the responsive rules below.
              <button type="button" className="preview-toggle" onClick={() => setPreviewOpen(v => !v)}>
                <Icon name="external" size={14} mirror />
                {previewOpen
                  ? (ar ? 'إخفاء المعاينة' : 'Hide preview')
                  : (ar ? 'معاينة مباشرة' : 'Live preview')}
              </button>
            )}
            {activeTab === 'home'       && isOwner === false && <ClientHome key={tenantKey} lang={lang} onNavigate={navigate} />}
            {activeTab === 'clients'    && isOwner === true  && <OwnerClientsOverview lang={lang} onOpen={(id) => { switchTenant(id); navigate('profile'); }} />}
            {activeTab === 'profile'    && <ProfileEditor    key={tenantKey} t={t} lang={lang} />}
            {activeTab === 'card'       && <CardEditor       key={tenantKey} t={t} lang={lang} />}
            {activeTab === 'projects'   && <ProjectsEditor   key={tenantKey} t={t} lang={lang} />}
            {activeTab === 'links'      && <LinksEditor      key={tenantKey} t={t} lang={lang} />}
            {activeTab === 'appearance' && <AppearanceEditor key={tenantKey} t={t} lang={lang} />}
            {activeTab === 'analytics'  && <AnalyticsEditor  key={tenantKey} t={t} lang={lang} />}
            {activeTab === 'domains'    && <TenantAdminSection key={tenantKey} lang={lang} part="settings" />}
            {activeTab === 'account'    && <AccountEditor    key={tenantKey} t={t} lang={lang} session={session} setChromeLang={setLang} />}
          </div>

          {showPreview && previewOrigin && (
            <aside className="work-preview" aria-label={ar ? 'معاينة الموقع المباشرة' : 'Live website preview'}>
              <PreviewPane origin={previewOrigin} slug={tenant?.slug || null} reloadToken={previewToken} lang={lang} />
            </aside>
          )}
        </div>
      </main>

      <style jsx>{`
        .dashboard { display: flex; min-height: 100vh; color: var(--text-primary); --accent: #4f6ef2; --accent-hover: #6d86ff; --border: rgba(var(--on-bg),0.1); --border-strong: rgba(var(--on-bg),0.2); transition: background-color 0.2s; }
        .dashboard.dark { --on-bg: 255,255,255; --bg-primary: #060912; --bg-secondary: #0c1428; --bg-elevated: #141d38; --bg-hover: #1d2747; --text-primary: #ffffff; --text-secondary: #ffffff; --text-tertiary: #ffffff; --text-muted: #ffffff; background-color: #060912; }
        /* tokens come from [data-admin-theme='light'] in globals.css */
        .dashboard.light { background-color: #ffffff; }
        .sidebar { width: 240px; background: var(--bg-secondary); border-inline-end: 1px solid var(--border); display: flex; flex-direction: column; padding: var(--space-4); }
        .sidebar-logo { padding: var(--space-2) var(--space-3) 0; display: grid; justify-items: start; }
        .sidebar-logo img { grid-area: 1 / 1; height: 26px; width: auto; display: block; opacity: 0; transition: opacity 0.25s ease; }
        .sidebar-logo img.on { opacity: 1; }
        .sidebar-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) var(--space-3) var(--space-4); gap: 8px; }
        .sidebar-header-right { display: flex; align-items: center; gap: 6px; }
        .sidebar-title { font-size: var(--text-sm); font-weight: 700; color: var(--text-tertiary); letter-spacing: 0.04em; text-transform: uppercase; }
        :global(html[dir="rtl"]) .sidebar-title { letter-spacing: normal; text-transform: none; }
        .drawer-close { display: none; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); cursor: pointer; font-family: inherit; align-items: center; justify-content: center; }

        /* Website identity — what am I editing, and where does it live? */
        .site-card { padding: var(--space-3); margin-bottom: var(--space-5); background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); }
        .site-line { display: flex; align-items: center; gap: var(--space-2); }
        .site-name { flex: 1; min-width: 0; font-size: var(--text-md); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .site-slug { margin-top: 2px; font-size: var(--text-xs); color: var(--text-tertiary); direction: ltr; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .nav { display: flex; flex-direction: column; gap: var(--space-4); flex: 1; }
        .sidebar-footer { padding: var(--space-3); border-top: 1px solid var(--border); }
        .view-site-btn { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: var(--space-3); padding: 7px 12px; background: var(--bg-hover); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); color: var(--text-secondary); font-size: var(--text-sm); font-weight: 600; text-decoration: none; transition: var(--transition); }
        .view-site-btn:hover { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
        .signout-btn { display: flex; align-items: center; gap: 8px; font-size: var(--text-sm); color: var(--text-tertiary); padding: 6px 0; background: none; border: none; cursor: pointer; font-family: inherit; }
        .signout-btn:hover { color: var(--text-primary); }
        .content { flex: 1; padding: var(--space-6) var(--space-8); overflow-y: auto; max-height: 100vh; }

        /* Page title area. Every screen already renders its own <h1> and intro
           paragraph, each styling them slightly differently. The shell now owns
           that typography so the title area is identical on every tab — rather
           than adding a second title above the one that is already there. */
        .content :global(h1) {
          font-family: var(--font-heading);
          font-size: var(--text-2xl);
          font-weight: 700;
          line-height: 1.25;
          color: var(--text-primary);
          margin-bottom: var(--space-2);
        }
        .content :global(h1 + .hint) {
          max-width: 68ch;
          margin-bottom: var(--space-6);
          padding-bottom: var(--space-4);
          border-bottom: 1px solid var(--border);
          font-size: var(--text-md);
          line-height: 1.6;
          color: var(--text-tertiary);
        }

        /* ---- Editor / live-preview split ------------------------------------
           Base (mobile + tablet): a single column. The preview is hidden and the
           editor renders exactly as it did before this feature. A tablet-only
           toggle reveals the preview stacked below the editor. At >=1024px the
           row becomes two columns with the preview pinned on the right. */
        .work { min-width: 0; }
        .work-editor { min-width: 0; }
        .work-preview { display: none; }
        .preview-toggle {
          display: none;
          align-items: center; gap: var(--space-2);
          margin-bottom: var(--space-4); padding: 8px 14px;
          background: var(--bg-elevated); border: 1px solid var(--border-strong);
          border-radius: var(--radius-sm); color: var(--text-secondary);
          font-family: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer;
          transition: background var(--transition), color var(--transition);
        }
        .preview-toggle:hover { background: var(--bg-hover); color: var(--text-primary); }
        .preview-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        /* Tablet (721px–1023px): show the toggle; reveal preview stacked when open. */
        @media (min-width: 721px) and (max-width: 1023px) {
          .work.has-preview .preview-toggle { display: inline-flex; }
          .work.has-preview.preview-open .work-preview { display: block; height: 70vh; margin-top: var(--space-5); }
        }

        /* Desktop (>=1024px) — more room for the grouped sidebar and the page head. */
        @media (min-width: 1024px) {
          .sidebar { width: 264px; padding: var(--space-4) var(--space-4) var(--space-5); }
          .content { padding: var(--space-8) var(--space-8); }
          .page-head { margin-bottom: var(--space-6); }

          /* Two columns: editor scrolls, preview stays pinned in view. */
          .work.has-preview {
            display: grid;
            grid-template-columns: minmax(0, 1fr) clamp(360px, 34vw, 460px);
            gap: var(--space-6);
            align-items: start;
          }
          .work.has-preview .work-preview {
            display: block;
            position: sticky;
            top: 0;
            height: calc(100vh - var(--space-8) * 2);
          }
          .work.has-preview .preview-toggle { display: none; }
        }

        /* Mobile-only elements hidden by default */
        .mobile-bar { display: none; }
        .backdrop { display: none; }
        .hamburger { display: none; }

        @media (max-width: 720px) {
          .dashboard { display: block; min-height: 100vh; }
          .mobile-bar {
            display: flex;
            position: sticky;
            top: 0;
            z-index: 50;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 14px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            -webkit-backdrop-filter: blur(12px);
            backdrop-filter: blur(12px);
          }
          .hamburger {
            display: flex;
            width: 40px; height: 40px;
            align-items: center; justify-content: center;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            cursor: pointer;
            font-family: inherit;
          }
          .mobile-tab-label {
            flex: 1;
            text-align: center;
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          /* Sidebar becomes a slide-out drawer */
          .sidebar {
            position: fixed;
            top: 0;
            inset-inline-start: 0;
            bottom: 0;
            width: 280px;
            max-width: 84vw;
            transform: translateX(-100%);
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 100;
            border-inline-end: 1px solid var(--border);
            box-shadow: 0 0 40px rgba(0,0,0,0.4);
            overflow-y: auto;
          }
          .sidebar.open { transform: translateX(0); }
          .drawer-close { display: inline-flex; }
          /* In RTL, the drawer comes from the right */
          :global([dir="rtl"]) .sidebar { transform: translateX(100%); }
          :global([dir="rtl"]) .sidebar.open { transform: translateX(0); }

          .backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            -webkit-backdrop-filter: blur(4px);
            backdrop-filter: blur(4px);
            z-index: 90;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.25s ease;
          }
          .backdrop.show { opacity: 1; pointer-events: auto; }

          .content { padding: var(--space-4) var(--space-4); max-height: none; }
          .page-head { margin-bottom: var(--space-4); padding-bottom: var(--space-3); }
          /* NOTE: the tap-target rule for .nav-item used to live here, where it
             could never match — NavItem is a component, so it carries its own
             styled-jsx scope. It now lives inside NavItem itself. */
        }
      `}</style>
    </div>
    </PreviewContext.Provider>
    </TenantContext.Provider>
    </DirtyContext.Provider>
  );
}

// Tenant picker shown at the top of the admin. Hidden entirely in legacy mode
// (no tenants). With one tenant it shows a static label (single-tenant behavior
// preserved); with several it becomes a dropdown.
function TenantSelector({ tenants, tenant, onChange, lang }) {
  if (!tenants || tenants.length === 0) return null;
  const label = lang === 'ar' ? 'مساحة العمل' : 'Workspace';
  return (
    <div className="tenant-bar">
      <span className="tenant-bar-label">{label}</span>
      {tenants.length > 1 ? (
        <select className="tenant-select" value={tenant?.id || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {tenants.map(tn => (
            <option key={tn.id} value={tn.id}>
              {(tn.name || tn.slug) + (tn.status === 'disabled' ? (lang === 'ar' ? ' (معلّقة)' : ' (suspended)') : '')}
            </option>
          ))}
        </select>
      ) : (
        <span className="tenant-current">
          {(tenant?.name || tenant?.slug || '') + (tenant?.status === 'disabled' ? (lang === 'ar' ? ' (معلّقة)' : ' (suspended)') : '')}
        </span>
      )}
      <style jsx>{`
        .tenant-bar { display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-5); padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); max-width: 640px; }
        .tenant-bar-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); }
        :global(html[dir="rtl"]) .tenant-bar-label { text-transform: none; letter-spacing: normal; }
        .tenant-current { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .tenant-select { font-family: inherit; font-size: 13px; font-weight: 600; padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-primary); cursor: pointer; }
        .tenant-select:focus { outline: none; border-color: var(--accent); }
      `}</style>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {/* the active marker is an inset bar, so it flips sides automatically in RTL */}
      <span className="marker" aria-hidden="true" />
      <Icon name={icon} size={16} />
      <span className="nav-label">{label}</span>
      <style jsx>{`
        .nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          inline-size: 100%;
          min-block-size: 36px;
          padding: var(--space-2) var(--space-3);
          border: none;
          border-radius: var(--radius-sm);
          background: none;
          font-family: inherit;
          font-size: var(--text-md);
          color: var(--text-secondary);
          text-align: start;
          cursor: pointer;
          transition: background var(--transition), color var(--transition);
        }
        .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .nav-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .marker {
          position: absolute;
          inset-inline-start: 0;
          inset-block: 6px;
          inline-size: 2px;
          border-radius: 2px;
          background: var(--accent);
          opacity: 0;
          transition: opacity var(--transition);
        }
        .nav-item.active {
          background: var(--bg-hover);
          color: var(--text-primary);
          font-weight: 600;
        }
        .nav-item.active .marker { opacity: 1; }
        .nav-item.active :global(.ui-icon) { color: var(--accent); }

        /* touch targets — the drawer is the only way to navigate on a phone */
        @media (max-width: 640px) {
          .nav-item { min-block-size: 44px; padding: var(--space-3); }
        }
      `}</style>
    </button>
  );
}

// A labelled block of nav items. The label is a quiet section heading, not a
// control — grouping is the point, collapsing is not.
function NavGroup({ label, children }) {
  return (
    <div className="nav-group" role="group" aria-label={label}>
      <div className="nav-group-label">{label}</div>
      {children}
      <style jsx>{`
        .nav-group-label {
          padding: 0 var(--space-3) var(--space-2);
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        :global(html[dir='rtl']) .nav-group-label {
          letter-spacing: normal;
          text-transform: none;
        }
      `}</style>
    </div>
  );
}

function SidebarUser({ session, t, isOwner, ar }) {
  const [username, setUsername] = useState('');
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('admin_usernames').select('username').eq('user_id', session.user.id).maybeSingle();
      if (data?.username) setUsername(data.username);
    })();
  }, [session.user.id]);
  const initial = (username || session.user.email || '?').trim()[0].toUpperCase();
  return (
    <div className="user-row">
      <div className="avatar">{initial}</div>
      <div className="user-meta">
        <div className="user-name">{username || session.user.email.split('@')[0]}</div>
        {/* which hat am I wearing — platform owner, or this website's admin? */}
        {isOwner === true
          ? <div className="user-role">{ar ? 'مالك المنصّة' : 'Platform owner'}</div>
          : <div className="user-status"><span className="dot" />{t('status_live')}</div>}
      </div>
      <style jsx>{`
        .user-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #4f6ef2, #2d47a8); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .user-meta { min-width: 0; flex: 1; }
        .user-name { font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .user-status { font-size: 10px; color: var(--success); display: flex; align-items: center; gap: 4px; }
        .user-role { font-size: 10px; font-weight: 600; color: var(--accent); }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
      `}</style>
    </div>
  );
}

// "Unsaved changes" ref owned by the Dashboard and written by the mounted SaveBar,
// so the Dashboard can warn before switching tabs. Only one SaveBar is mounted at a
// time (tabs render conditionally), so a single shared ref is sufficient.
const DirtyContext = createContext(null);

// The tenant the admin is currently editing. `tenant` is null in legacy/single
// mode (no tenant mapping or the tenant tables aren't readable), which preserves
// the exact id=1 behavior below.
const TenantContext = createContext({ tenant: null, tenants: [], setTenant: () => {}, reloadTenants: async () => {}, isOwner: false });
function useTenant() { return useContext(TenantContext); }

// Lets the shared SaveBar tell the live PreviewPane to refresh after a save,
// without any editor knowing the preview exists. Default is a no-op so editors
// on screens with no preview (and legacy usages) are unaffected.
const PreviewContext = createContext({ refresh: () => {} });
function usePreview() { return useContext(PreviewContext); }

// Tenant-scoped data helpers.
//
// These used to fall back to the legacy single-profile (id = 1) row whenever no
// tenant was selected. Once real clients existed that row belonged to one of
// them, so "no tenant selected" silently meant "read and write a specific
// client's live portfolio". Every helper below now REFUSES instead: if we cannot
// say which tenant is being acted on, we do nothing. This mirrors the same rule
// the public site follows (lib/tenant.js -> NO_TENANT -> 404).
const NO_TENANT_ERROR = { message: 'No tenant selected' };

// User-facing counterpart to NO_TENANT_ERROR, for the screens that refuse to act
// until a workspace is chosen.
function noWorkspaceMsg(lang) {
  return lang === 'ar' ? 'اختر مساحة عمل أولًا' : 'Select a workspace first';
}

function loadProfile(tenant, columns = '*') {
  if (!tenant) return Promise.resolve({ data: null, error: NO_TENANT_ERROR });
  return supabase.from('profile').select(columns).eq('tenant_id', tenant.id).maybeSingle();
}
// An update the RLS policy filters out is not an error to PostgREST — it reports
// success having changed zero rows. So saving into a workspace you cannot write
// looked exactly like a real save, and the work was gone on reload. `.select()`
// makes the affected rows observable so a blocked write can fail loudly instead.
const BLOCKED_WRITE_ERROR = {
  message: 'Update affected no rows — this account may not have write access to this workspace',
};

async function persistProfile(tenant, fields) {
  // Updates an EXISTING profile row; creating a brand-new tenant's profile is
  // part of the create-tenant flow, not this helper.
  if (!tenant) return { data: null, error: NO_TENANT_ERROR };
  const { data, error } = await supabase
    .from('profile').update(fields).eq('tenant_id', tenant.id).select('tenant_id');
  if (error) return { data, error };
  if (!data || data.length === 0) return { data, error: BLOCKED_WRITE_ERROR };
  return { data, error: null };
}

// Tenant-isolated storage path: a tenant's media lives under `t-<id>/`. Returns
// null rather than a bare filename when no tenant is selected — a flat path is
// what the storage policies now refuse to write, and before those policies
// existed it dropped the file into the shared root next to every other client's
// images. Callers must check for null; throwing here would surface as an
// unhandled rejection, since the upload handlers have no try/catch.
function tenantStoragePath(tenant, name) {
  if (!tenant) return null;
  return `t-${tenant.id}/${name}`;
}

// Slugs that would collide with real routes — a static route always wins over the
// dynamic /[slug] page, so such a tenant would be unreachable.
const RESERVED_SLUGS = ['admin', 'privacy', 'terms', 'api', '_next', '404', '500', 'favicon.ico'];

// A blank slug is invalid; keep slugs to a safe host-friendly charset.
function normalizeSlug(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
// Host only: strip scheme/path here, then delegate to the resolver's own normalizeHost
// so a stored domain is normalized EXACTLY like an incoming request host. (Duplicating
// this logic would let a saved domain silently never match at runtime.)
function normalizeDomain(v) {
  return normalizeHost(String(v || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
}

function SaveBar({ saving, savedMsg, onSave, t, dirty, extra }) {
  const dirtyRef = useContext(DirtyContext);
  const { refresh: refreshPreview } = usePreview();
  useEffect(() => {
    if (!dirtyRef) return;
    dirtyRef.current = dirty;
    return () => { dirtyRef.current = false; };
  }, [dirty, dirtyRef]);

  // Detect a successful save and refresh the live preview — without any editor
  // being aware of it. A save resolves as: saving true -> false. On success the
  // editor clears `dirty`; on error it leaves `dirty` true and shows a toast.
  // So a false-and-clean transition is exactly a successful save.
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !saving && !dirty) refreshPreview();
    wasSaving.current = saving;
  }, [saving, dirty, refreshPreview]);
  return (
    <div className={`actions ${dirty ? 'sticky-save' : ''}`}>
      <Button onClick={onSave} loading={saving}>
        {saving ? t('saving') : t('save')}
        {dirty && <span className="unsaved-dot" />}
      </Button>
      {dirty && !saving && <span className="hint">{t('unsaved_changes')}</span>}
      {savedMsg && !dirty && <span className="saved-indicator">{savedMsg} ✓</span>}
      {/* the delete action sits at the far end of the row (start of it on mobile) */}
      {extra && <span className="extra">{extra}</span>}
      <style jsx>{`
        .actions { display: flex; gap: 10px; align-items: center; margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--border); flex-wrap: wrap; }
        .extra { margin-inline-start: auto; }
        .unsaved-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--warning); margin-inline-start: 6px; box-shadow: 0 0 6px var(--warning); vertical-align: middle; }
        .hint { font-size: var(--text-sm); color: var(--text-tertiary); }
        .saved-indicator { font-size: 13px; color: var(--accent); }
        /* On phones, pin the save row to the bottom while there are unsaved changes so it's always reachable */
        @media (max-width: 720px) {
          .actions.sticky-save {
            position: sticky;
            bottom: 0;
            margin-top: var(--space-5);
            padding-bottom: 12px;
            background: var(--bg-primary);
            box-shadow: 0 -6px 16px rgba(0,0,0,0.28);
            z-index: 20;
          }
          /* keep the destructive action off the same edge as Save on phones */
          .extra { margin-inline-start: 0; }
        }
      `}</style>
    </div>
  );
}

// =========================================================
// Profile Editor — single-lang inputs (uses chrome lang)
// =========================================================
function ProfileEditor({ t, lang }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [profile, setProfile] = useState({ name: emptyBilingual(), tagline: emptyBilingual(), bio: emptyBilingual(), profile_image: '', default_lang: 'ar', custom_fields: [], sections: { bio: true, custom_fields: true, projects: true, links: true, lang_switcher: true }, seo: { title: emptyBilingual(), description: emptyBilingual(), og_image: '' } });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const { tenant } = useTenant();

  useEffect(() => { load(); }, []);
  useEffect(() => {
    try { setShowStart(localStorage.getItem('admin_start_dismissed') !== '1'); } catch (e) {}
  }, []);
  function dismissStart() {
    try { localStorage.setItem('admin_start_dismissed', '1'); } catch (e) {}
    setShowStart(false);
  }

  async function load() {
    const { data } = await loadProfile(tenant);
    if (data) {
      setProfile({
        name: data.name || emptyBilingual(),
        tagline: data.tagline || emptyBilingual(),
        bio: data.bio || emptyBilingual(),
        profile_image: data.profile_image || '',
        default_lang: data.default_lang || 'ar',
        custom_fields: data.custom_fields || [],
        sections: data.sections || { bio: true, custom_fields: true, projects: true, links: true, lang_switcher: true },
        seo: {
          title: data.seo?.title || emptyBilingual(),
          description: data.seo?.description || emptyBilingual(),
          og_image: data.seo?.og_image || '',
        },
      });
    }
  }
  function patch(updates) { setProfile(p => ({ ...p, ...updates })); setDirty(true); }
  function bilingualPatch(key, val) { patch({ [key]: setLangValue(profile[key], lang, val) }); }

  async function save() {
    setSaving(true);
    try {
      const { error } = await persistProfile(tenant, profile);
      if (!error) { setSavedMsg(t('saved')); setDirty(false); }
      else { console.error(error); toast.error(t('save_failed')); }
    } catch (err) {
      console.error(err); toast.error(t('save_failed'));
    } finally { setSaving(false); }
  }
  async function uploadImage(file) {
    const img = await compressImage(file, { maxDimension: MAX_AVATAR_DIMENSION });
    const path = tenantStoragePath(tenant, `profile-${Date.now()}.${fileExtension(img)}`);
    if (!path) { toast.error(t('upload_failed')); return; }
    const { error } = await supabase.storage.from('media').upload(path, img, { upsert: true });
    if (error) { console.error(error); toast.error(t('upload_failed')); return; }
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    patch({ profile_image: data.publicUrl });
  }
  async function uploadOgImage(file) {
    const img = await compressImage(file);
    const path = tenantStoragePath(tenant, `og-${Date.now()}.${fileExtension(img)}`);
    if (!path) { toast.error(t('upload_failed')); return; }
    const { error } = await supabase.storage.from('media').upload(path, img, { upsert: true });
    if (error) { console.error(error); toast.error(t('upload_failed')); return; }
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    patch({ seo: { ...profile.seo, og_image: data.publicUrl } });
  }
  function patchSeo(key, val) { patch({ seo: { ...profile.seo, [key]: setLangValue(profile.seo?.[key], lang, val) } }); }

  function addCustomField() { patch({ custom_fields: [...(profile.custom_fields || []), { id: newId(), label: emptyBilingual(), value: emptyBilingual() }] }); }
  function updateCustomField(id, updates) { patch({ custom_fields: profile.custom_fields.map(f => f.id === id ? { ...f, ...updates } : f) }); }
  async function removeCustomField(id) { if (!(await confirm(removeDialog(t)))) return; patch({ custom_fields: profile.custom_fields.filter(f => f.id !== id) }); }
  function moveCustomField(id, dir) {
    const arr = [...profile.custom_fields]; const i = arr.findIndex(f => f.id === id); const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; patch({ custom_fields: arr });
  }
  function toggleSection(key) { patch({ sections: { ...profile.sections, [key]: !profile.sections[key] } }); }

  return (
    <div className="editor">
      <h1>{t('nav_profile')}</h1>
      <p className="hint">{t('profile_sub')}</p>

      {showStart && (
        <div className="start-here">
          <button type="button" className="start-close" onClick={dismissStart} aria-label={t('close')}>×</button>
          <strong>{t('start_here_title')}</strong>
          <ol>
            <li>{t('start_step_name')}</li>
            <li>{t('start_step_photo')}</li>
            <li>{t('start_step_project')}</li>
            <li>{t('start_step_preview')}</li>
          </ol>
        </div>
      )}

      <h2>{t('basics')}</h2>
      <p className="hint">{t('lang_note')}</p>
      <Field id="profile-name" label={t('name')}>
        <input id="profile-name" value={pick(profile.name, lang)} onChange={(e) => bilingualPatch('name', e.target.value)} />
      </Field>
      <Field id="profile-tagline" label={t('tagline')}>
        <input id="profile-tagline" value={pick(profile.tagline, lang)} onChange={(e) => bilingualPatch('tagline', e.target.value)} />
      </Field>
      <Field id="profile-bio" label={t('bio')}>
        <textarea id="profile-bio" rows={4} value={pick(profile.bio, lang)} onChange={(e) => bilingualPatch('bio', e.target.value)} />
      </Field>
      <Field id="profile-image" label={t('profile_image')}>
        <ImageUpload value={profile.profile_image} onUpload={uploadImage} onClear={() => patch({ profile_image: '' })} aspect={1} hint={t('img_hint_profile')} t={t} />
      </Field>

      <h2>{t('seo_title')} <span className="meta">· {t('optional')}</span></h2>
      <p className="hint">{t('seo_sub')}</p>
      <p className="hint">{t('seo_optional')}</p>
      <Field id="seo-title" label={t('seo_meta_title')}>
        <input id="seo-title" value={pick(profile.seo?.title, lang)} onChange={(e) => patchSeo('title', e.target.value)} placeholder={pick(profile.name, lang)} maxLength={60} />
      </Field>
      <Field id="seo-desc" label={t('seo_meta_desc')}>
        <textarea id="seo-desc" rows={2} value={pick(profile.seo?.description, lang)} onChange={(e) => patchSeo('description', e.target.value)} placeholder={pick(profile.bio, lang)} maxLength={160} />
      </Field>
      <Field id="seo-og" label={t('seo_share_image')}>
        <ImageUpload value={profile.seo?.og_image} onUpload={uploadOgImage} onClear={() => patch({ seo: { ...profile.seo, og_image: '' } })} aspect={1.91} hint={t('seo_share_hint')} t={t} />
      </Field>

      <h2>{t('custom_fields_title')}</h2>
      <p className="hint">{t('custom_fields_sub')}</p>
      {profile.custom_fields?.map((f, i) => (
        <div key={f.id} className="card-row">
          <div className="row-head">
            <span className="row-tag">{t('item_field')}</span>
            <div className="row-actions">
              <button type="button" className="x-small" aria-label={t('move_up')} disabled={i === 0} onClick={() => moveCustomField(f.id, -1)}>↑</button>
              <button type="button" className="x-small" aria-label={t('move_down')} disabled={i === profile.custom_fields.length - 1} onClick={() => moveCustomField(f.id, 1)}>↓</button>
              <button type="button" className="x-small" aria-label={t('remove')} onClick={() => removeCustomField(f.id)}>×</button>
            </div>
          </div>
          <div className="row-grid-2">
            <Field id={`cf-l-${f.id}`} label={t('custom_field_label')}>
              <input id={`cf-l-${f.id}`} value={pick(f.label, lang)} onChange={(e) => updateCustomField(f.id, { label: setLangValue(f.label, lang, e.target.value) })} />
            </Field>
            <Field id={`cf-v-${f.id}`} label={t('custom_field_value')}>
              <input id={`cf-v-${f.id}`} value={pick(f.value, lang)} onChange={(e) => updateCustomField(f.id, { value: setLangValue(f.value, lang, e.target.value) })} />
            </Field>
          </div>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={addCustomField}>+ {t('add_custom_field')}</Button>

      <h2>{t('sections_title')}</h2>
      <p className="hint">{t('sections_sub')}</p>
      <div style={{ maxWidth: 500 }}>
        {[
          ['bio', t('section_bio')],
          ['custom_fields', t('section_custom_fields')],
          ['projects', t('section_projects')],
          ['links', t('section_links')],
          ['lang_switcher', t('section_lang_switcher')],
        ].map(([k, label]) => (
          <div key={k} className="toggle-row">
            <span>{label}</span>
            <button type="button" className={`switch ${profile.sections[k] ? 'on' : ''}`} onClick={() => toggleSection(k)} aria-pressed={!!profile.sections[k]} />
          </div>
        ))}
      </div>

      <SaveBar saving={saving} savedMsg={savedMsg} onSave={save} t={t} dirty={dirty} />
      <AdminStyles />
    </div>
  );
}

// =========================================================
// Card Editor
// =========================================================
function CardEditor({ t, lang }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [profile, setProfile] = useState({
    banners: [], stats: [], cta_buttons: [], brand_logo: '', favicon_url: '',
    top_ticker: { enabled: false, text: emptyBilingual(), bg_color: '#9FA7FF', text_color: '#0a0a0c', speed: 'medium' },
    footer: { text: emptyBilingual(), color: 'rgba(var(--on-bg),0.3)' },
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const { tenant } = useTenant();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await loadProfile(tenant);
    if (data) setProfile({
      banners: data.banners || [],
      stats: data.stats || [],
      cta_buttons: data.cta_buttons || [],
      brand_logo: data.brand_logo || '',
      favicon_url: data.favicon_url || '',
      top_ticker: {
        enabled: data.top_ticker?.enabled || false,
        text: data.top_ticker?.text || emptyBilingual(),
        bg_color: data.top_ticker?.bg_color || '#9FA7FF',
        text_color: data.top_ticker?.text_color || '#0a0a0c',
        speed: data.top_ticker?.speed || 'medium',
      },
      footer: {
        text: data.footer?.text || emptyBilingual(),
        color: data.footer?.color || 'rgba(var(--on-bg),0.3)',
      },
    });
  }
  function patchTicker(updates) { setProfile(p => ({ ...p, top_ticker: { ...p.top_ticker, ...updates } })); setDirty(true); }
  function patchFooter(updates) { setProfile(p => ({ ...p, footer: { ...p.footer, ...updates } })); setDirty(true); }
  function patch(updates) { setProfile(p => ({ ...p, ...updates })); setDirty(true); }
  async function save() {
    setSaving(true);
    try {
      const { error } = await persistProfile(tenant, profile);
      if (!error) { setSavedMsg(t('saved')); setDirty(false); }
      else { console.error(error); toast.error(t('save_failed')); }
    } catch (err) {
      console.error(err); toast.error(t('save_failed'));
    } finally { setSaving(false); }
  }
  async function uploadAsset(prefix, file) {
    // brand logos and favicons render tiny; banners are full-width.
    const small = prefix === 'brand-logo' || prefix === 'favicon';
    const img = await compressImage(file, small ? { maxDimension: MAX_AVATAR_DIMENSION } : undefined);
    const path = tenantStoragePath(tenant, `${prefix}-${Date.now()}.${fileExtension(img)}`);
    if (!path) { toast.error(t('upload_failed')); return; }
    const { error } = await supabase.storage.from('media').upload(path, img, { upsert: true });
    if (error) { console.error(error); toast.error(t('upload_failed')); return null; }
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  }
  async function uploadBrandLogo(file) { const url = await uploadAsset('brand-logo', file); if (url) patch({ brand_logo: url }); }
  async function uploadFavicon(file)   { const url = await uploadAsset('favicon',    file); if (url) patch({ favicon_url: url }); }

  function addBanner() { if ((profile.banners?.length || 0) >= 5) return; patch({ banners: [...(profile.banners || []), { id: newId(), type: 'text', text: emptyBilingual(), subtitle: emptyBilingual(), bg: 'purple', image_url: '' }] }); }
  function updateBanner(id, u) { patch({ banners: profile.banners.map(b => b.id === id ? { ...b, ...u } : b) }); }
  async function removeBanner(id) { if (!(await confirm(removeDialog(t)))) return; patch({ banners: profile.banners.filter(b => b.id !== id) }); }
  function moveBanner(id, dir) { const a = [...profile.banners]; const i = a.findIndex(b => b.id === id); const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; patch({ banners: a }); }
  async function uploadBannerImage(bannerId, file) { const url = await uploadAsset(`banner-${bannerId}`, file); if (url) updateBanner(bannerId, { image_url: url }); }

  function addStat() { if ((profile.stats?.length || 0) >= 3) return; patch({ stats: [...(profile.stats || []), { id: newId(), label: emptyBilingual(), value: emptyBilingual() }] }); }
  function updateStat(id, u) { patch({ stats: profile.stats.map(s => s.id === id ? { ...s, ...u } : s) }); }
  async function removeStat(id) { if (!(await confirm(removeDialog(t)))) return; patch({ stats: profile.stats.filter(s => s.id !== id) }); }
  function moveStat(id, dir) { const a = [...profile.stats]; const i = a.findIndex(s => s.id === id); const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; patch({ stats: a }); }

  function addButton() { patch({ cta_buttons: [...(profile.cta_buttons || []), { id: newId(), icon: 'whatsapp', label: emptyBilingual(), action: 'link', href: '' }] }); }
  function updateButton(id, u) { patch({ cta_buttons: profile.cta_buttons.map(b => b.id === id ? { ...b, ...u } : b) }); }
  async function removeButton(id) { if (!(await confirm(removeDialog(t)))) return; patch({ cta_buttons: profile.cta_buttons.filter(b => b.id !== id) }); }
  function moveButton(id, dir) { const a = [...profile.cta_buttons]; const i = a.findIndex(b => b.id === id); const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; patch({ cta_buttons: a }); }

  return (
    <div className="editor">
      <h1>{t('card_title')}</h1>
      <p className="hint">{t('card_sub')}</p>
      <p className="hint">{t('lang_note')}</p>

      <h2>{t('brand_logo')}</h2>
      <p className="hint">{t('brand_logo_hint')}</p>
      <ImageUpload value={profile.brand_logo} onUpload={uploadBrandLogo} onClear={() => patch({ brand_logo: '' })} aspect={1} hint={t('img_hint_brand_logo')} t={t} />

      <h2>{t('favicon_title')} <span className="meta">· {t('optional')}</span></h2>
      <p className="hint">{t('favicon_hint')}</p>
      <ImageUpload value={profile.favicon_url} onUpload={uploadFavicon} onClear={() => patch({ favicon_url: '' })} aspect={1} hint={t('img_hint_favicon')} t={t} />

      <h2>{t('ticker_title')} <span className="meta">· {t('ticker_sub')} · {t('optional')}</span></h2>
      <div className="card-row" style={{ maxWidth: 640 }}>
        <div className="toggle-row" style={{ paddingTop: 0 }}>
          <span>{t('ticker_enabled')}</span>
          <button type="button" className={`switch ${profile.top_ticker?.enabled ? 'on' : ''}`} onClick={() => patchTicker({ enabled: !profile.top_ticker?.enabled })} aria-pressed={!!profile.top_ticker?.enabled} />
        </div>
        {profile.top_ticker?.enabled && (
          <>
            <div className="row-grid-2">
              <Field id="ticker-text" label={t('ticker_text')}>
                <input id="ticker-text" value={pick(profile.top_ticker.text, lang)} onChange={(e) => patchTicker({ text: setLangValue(profile.top_ticker.text, lang, e.target.value) })} placeholder={lang === 'ar' ? 'متاح لمشاريع جديدة · تواصل معي' : 'Available for new projects · contact me'} />
              </Field>
              <Field id="ticker-speed" label={t('ticker_speed')}>
                <select id="ticker-speed" value={profile.top_ticker.speed || 'medium'} onChange={(e) => patchTicker({ speed: e.target.value })}>
                  <option value="slow">{t('ticker_speed_slow')}</option>
                  <option value="medium">{t('ticker_speed_medium')}</option>
                  <option value="fast">{t('ticker_speed_fast')}</option>
                </select>
              </Field>
            </div>
            <div className="row-grid-2" style={{ marginTop: 10 }}>
              <Field id="ticker-bg" label={t('ticker_bg')}>
                <input id="ticker-bg" type="color" value={profile.top_ticker.bg_color || '#9FA7FF'} onChange={(e) => patchTicker({ bg_color: e.target.value })} />
              </Field>
              <Field id="ticker-text-color" label={t('ticker_text_color')}>
                <input id="ticker-text-color" type="color" value={profile.top_ticker.text_color || '#0a0a0c'} onChange={(e) => patchTicker({ text_color: e.target.value })} />
              </Field>
            </div>
            {/* live preview */}
            <div style={{ marginTop: 12, background: profile.top_ticker.bg_color || '#9FA7FF', color: profile.top_ticker.text_color || '#0a0a0c', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {pick(profile.top_ticker.text, lang) || pick(profile.top_ticker.text, 'en') || (lang === 'ar' ? 'معاينة نص الشريط...' : 'Preview of ticker text...')}
            </div>
          </>
        )}
      </div>

      <h2>{t('banners_title')} <span className="meta">· {t('banners_sub')} · {(profile.banners?.length || 0)}/5</span></h2>
      {profile.banners?.map((b, i) => (
        <BannerRow key={b.id} banner={b} lang={lang} onChange={(u) => updateBanner(b.id, u)} onRemove={() => removeBanner(b.id)} onUp={() => moveBanner(b.id, -1)} onDown={() => moveBanner(b.id, 1)} canUp={i > 0} canDown={i < profile.banners.length - 1} uploadImage={(f) => uploadBannerImage(b.id, f)} t={t} />
      ))}
      {(profile.banners?.length || 0) < 5 && <Button variant="secondary" size="sm" onClick={addBanner}>+ {t('banner_add')}</Button>}

      <h2>{t('stats_title')} <span className="meta">· {t('stats_sub')} · {(profile.stats?.length || 0)}/3</span></h2>
      {profile.stats?.map((s, i) => (
        <StatRow key={s.id} stat={s} lang={lang} onChange={(u) => updateStat(s.id, u)} onRemove={() => removeStat(s.id)} onUp={() => moveStat(s.id, -1)} onDown={() => moveStat(s.id, 1)} canUp={i > 0} canDown={i < profile.stats.length - 1} t={t} />
      ))}
      {(profile.stats?.length || 0) < 3 && <Button variant="secondary" size="sm" onClick={addStat}>+ {t('stat_add')}</Button>}

      <h2>{t('buttons_title')} <span className="meta">· {t('buttons_sub')}</span></h2>
      {profile.cta_buttons?.map((b, i) => (
        <ButtonRow key={b.id} btn={b} lang={lang} onChange={(u) => updateButton(b.id, u)} onRemove={() => removeButton(b.id)} onUp={() => moveButton(b.id, -1)} onDown={() => moveButton(b.id, 1)} canUp={i > 0} canDown={i < profile.cta_buttons.length - 1} t={t} />
      ))}
      <Button variant="secondary" size="sm" onClick={addButton}>+ {t('button_add')}</Button>

      <h2>{t('footer_title')} <span className="meta">· {t('footer_sub')} · {t('optional')}</span></h2>
      <div className="card-row" style={{ maxWidth: 640 }}>
        <Field id="footer-text" label={t('footer_text')}>
          <input id="footer-text" value={pick(profile.footer?.text, lang)} onChange={(e) => patchFooter({ text: setLangValue(profile.footer?.text, lang, e.target.value) })} placeholder={lang === 'ar' ? '© فيصل فهد 2026' : '© Your Name 2026'} />
        </Field>
        <Field id="footer-color" label={t('footer_color')}>
          <input id="footer-color" type="color" value={profile.footer?.color?.startsWith('#') ? profile.footer.color : '#4d4d57'} onChange={(e) => patchFooter({ color: e.target.value })} />
        </Field>
      </div>

      <SaveBar saving={saving} savedMsg={savedMsg} onSave={save} t={t} dirty={dirty} />
      <AdminStyles />
    </div>
  );
}

function BannerRow({ banner, lang, onChange, onRemove, onUp, onDown, canUp, canDown, uploadImage, t }) {
  const previewText = pick(banner.text, lang) || pick(banner.text, 'en') || pick(banner.text, 'ar');
  const previewSub = pick(banner.subtitle, lang) || pick(banner.subtitle, 'en') || pick(banner.subtitle, 'ar');
  return (
    <div className="card-row">
      <div className="row-head">
        <div className="row-tabs">
          <button type="button" className={banner.type === 'text' ? 'active' : ''} onClick={() => onChange({ type: 'text' })}>{t('banner_type_text')}</button>
          <button type="button" className={banner.type === 'image' ? 'active' : ''} onClick={() => onChange({ type: 'image' })}>{t('banner_type_image')}</button>
        </div>
        <div className="row-actions">
          <button type="button" className="x-small" disabled={!canUp} onClick={onUp} aria-label={t('move_up')}>↑</button>
          <button type="button" className="x-small" disabled={!canDown} onClick={onDown} aria-label={t('move_down')}>↓</button>
          <button type="button" className="x-small" onClick={onRemove} aria-label={t('remove')}>×</button>
        </div>
      </div>
      {banner.type === 'text' ? (
        <>
          <div className="row-grid-2">
            <Field id={`b-text-${banner.id}`} label={t('banner_text')}>
              <input id={`b-text-${banner.id}`} value={pick(banner.text, lang)} onChange={(e) => onChange({ text: setLangValue(banner.text, lang, e.target.value) })} placeholder={lang === 'ar' ? 'أهلاً وسهلاً' : 'Welcome'} />
            </Field>
            <Field id={`b-sub-${banner.id}`} label={t('banner_subtitle')}>
              <input id={`b-sub-${banner.id}`} value={pick(banner.subtitle, lang)} onChange={(e) => onChange({ subtitle: setLangValue(banner.subtitle, lang, e.target.value) })} placeholder={t('optional')} />
            </Field>
          </div>
          <Field id={`b-bg-${banner.id}`} label={t('banner_bg')}>
            <select id={`b-bg-${banner.id}`} value={banner.bg || 'purple'} onChange={(e) => onChange({ bg: e.target.value })}>
              {Object.entries(BANNER_BGS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </Field>
          <div className="banner-preview" style={{ background: BANNER_BGS[banner.bg || 'purple'].gradient }}>
            <div className="banner-text">{previewText || '...'}</div>
            {previewSub && <div className="banner-sub">{previewSub}</div>}
          </div>
        </>
      ) : (
        <Field id={`b-img-${banner.id}`} label={t('banner_upload')}>
          <ImageUpload value={banner.image_url} onUpload={uploadImage} onClear={() => onChange({ image_url: '' })} aspect={3/2} hint={t('img_hint_banner')} t={t} />
        </Field>
      )}
    </div>
  );
}

function StatRow({ stat, lang, onChange, onRemove, onUp, onDown, canUp, canDown, t }) {
  return (
    <div className="card-row">
      <div className="row-head">
        <span className="row-tag">{t('item_stat')}</span>
        <div className="row-actions">
          <button type="button" className="x-small" disabled={!canUp} onClick={onUp} aria-label={t('move_up')}>↑</button>
          <button type="button" className="x-small" disabled={!canDown} onClick={onDown} aria-label={t('move_down')}>↓</button>
          <button type="button" className="x-small" onClick={onRemove} aria-label={t('remove')}>×</button>
        </div>
      </div>
      <div className="row-grid-2">
        <Field id={`s-l-${stat.id}`} label={t('stat_label')}>
          <input id={`s-l-${stat.id}`} value={pick(stat.label, lang)} onChange={(e) => onChange({ label: setLangValue(stat.label, lang, e.target.value) })} placeholder={lang === 'ar' ? 'التقييم' : 'Rating'} />
        </Field>
        <Field id={`s-v-${stat.id}`} label={t('stat_value')}>
          <input id={`s-v-${stat.id}`} value={pick(stat.value, lang)} onChange={(e) => onChange({ value: setLangValue(stat.value, lang, e.target.value) })} placeholder="★ 4.9" />
        </Field>
      </div>
    </div>
  );
}

function ButtonRow({ btn, lang, onChange, onRemove, onUp, onDown, canUp, canDown, t }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const icon = btn.icon && BRAND_ICONS[normalizeIcon(btn.icon)];
  return (
    <div className="card-row">
      <div className="row-head">
        <button type="button" className="brand-mini" onClick={() => setPickerOpen(true)} title={t('pick_icon')} aria-label={t('pick_icon')}>
          {icon ? <svg viewBox="0 0 24 24"><path d={icon.path} /></svg> : '?'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{icon?.label || t('pick_icon')}</span>
        <div className="row-actions">
          <button type="button" className="x-small" disabled={!canUp} onClick={onUp} aria-label={t('move_up')}>↑</button>
          <button type="button" className="x-small" disabled={!canDown} onClick={onDown} aria-label={t('move_down')}>↓</button>
          <button type="button" className="x-small" onClick={onRemove} aria-label={t('remove')}>×</button>
        </div>
      </div>
      <div className="row-grid-2">
        <Field id={`bt-l-${btn.id}`} label={t('button_label')}>
          <input id={`bt-l-${btn.id}`} value={pick(btn.label, lang)} onChange={(e) => onChange({ label: setLangValue(btn.label, lang, e.target.value) })} placeholder={lang === 'ar' ? 'تواصل معي' : 'Contact me'} />
        </Field>
        <Field id={`bt-a-${btn.id}`} label={t('button_action')}>
          <select id={`bt-a-${btn.id}`} value={btn.action || 'link'} onChange={(e) => onChange({ action: e.target.value })}>
            <option value="link">{t('button_action_link')}</option>
            <option value="open_projects">{t('button_action_open_projects')}</option>
          </select>
        </Field>
      </div>
      {btn.action !== 'open_projects' && (
        <Field id={`bt-h-${btn.id}`} label={t('button_href')}>
          <input id={`bt-h-${btn.id}`} type="url" dir="ltr" value={btn.href || ''} onChange={(e) => onChange({ href: e.target.value })} placeholder="https://wa.me/97450000000" />
        </Field>
      )}
      {pickerOpen && <IconPickerModal selected={btn.icon} onPick={(k) => { onChange({ icon: k }); setPickerOpen(false); }} onClose={() => setPickerOpen(false)} t={t} />}
    </div>
  );
}

// =========================================================
// Projects Editor
// =========================================================
function ProjectsEditor({ t, lang }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [projects, setProjects] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true); // gate the empty state until the first load lands
  const { tenant } = useTenant();

  useEffect(() => { load(); }, []);
  // No tenant means REFUSE, not "fall back to everything" — the same rule
  // loadProfile/persistProfile follow via NO_TENANT_ERROR, and the one the public
  // site follows via NO_TENANT -> 404. The tenant filter used to be conditional, so
  // an unset workspace listed every tenant's projects in one undifferentiated list.
  async function load() {
    if (!tenant) { setProjects([]); setLoading(false); return; }
    const { data } = await supabase
      .from('projects').select('*').eq('tenant_id', tenant.id).order('display_order');
    setProjects(data || []);
    setLoading(false);
  }

  async function addProject() {
    // Likewise: an unstamped project belongs to no tenant and would be invisible to
    // every workspace, so refuse rather than create an orphan.
    if (!tenant) { toast.error(noWorkspaceMsg(lang)); return; }
    const nextOrder = projects.length;
    const defaultTitle = { en: 'New Project', ar: 'مشروع جديد' };
    const row = { title: defaultTitle, display_order: nextOrder, images: [], tenant_id: tenant.id };
    const { data, error } = await supabase.from('projects').insert(row).select().single();
    if (data) { setProjects([...projects, data]); setEditing(data); }
    if (error) { console.error(error); toast.error(t('save_failed')); }
  }
  // These three writes discarded their result entirely, so BOTH failure modes were
  // invisible: a real error (network, constraint) and an RLS-filtered write, which
  // is not an error at all but a successful statement that changed zero rows. Each
  // one now inspects the rows it actually touched — see BLOCKED_WRITE_ERROR.
  async function updateProject(updated) {
    const { data, error } = await supabase
      .from('projects').update(updated).eq('id', updated.id).select('id');
    // Throwing is what ProjectEditForm.save() already expects: its catch reports
    // save_failed and leaves the form dirty. Nothing ever threw before, which is
    // why a failed save still announced "saved".
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(BLOCKED_WRITE_ERROR.message);
    setProjects(projects.map(p => p.id === updated.id ? updated : p));
    setEditing(updated);
  }
  async function deleteProject(id) {
    if (!(await confirm(deleteDialog(t, t('delete_project_confirm'))))) return;
    const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id');
    if (error || !data || data.length === 0) {
      console.error('[projects] delete failed:', error || BLOCKED_WRITE_ERROR);
      toast.error(t('save_failed'));
      return; // keep the row on screen — it is still in the database
    }
    setProjects(projects.filter(p => p.id !== id));
    if (editing?.id === id) setEditing(null);
  }
  async function move(id, dir) {
    const i = projects.findIndex(p => p.id === id); const j = i + dir;
    if (j < 0 || j >= projects.length) return;
    const arr = [...projects]; [arr[i], arr[j]] = [arr[j], arr[i]];
    const updates = arr.map((p, idx) => ({ ...p, display_order: idx }));
    setProjects(updates); // optimistic — resynced below if the writes do not land
    const results = await Promise.all(updates.map(p => supabase
      .from('projects').update({ display_order: p.display_order }).eq('id', p.id).select('id')));
    const failed = results.find(r => r.error || !r.data || r.data.length === 0);
    if (failed) {
      console.error('[projects] reorder failed:', failed.error || BLOCKED_WRITE_ERROR);
      toast.error(t('save_failed'));
      // These are independent statements, so some may have landed. Re-read rather
      // than restoring the previous array, which would only be right if the whole
      // reorder failed together.
      await load();
    }
  }

  if (editing) return <ProjectEditForm project={editing} onSave={updateProject} onBack={() => { setEditing(null); load(); }} onDelete={deleteProject} t={t} lang={lang} />;

  return (
    <div className="editor">
      <div className="editor-header">
        <h1>{t('nav_projects')}</h1>
        <Button size="sm" onClick={addProject}>+ {t('add_project')}</Button>
      </div>
      <p className="hint">{t('empty_rows_note')}</p>

      {loading ? (
        <div className="project-list" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="project-row">
              <div className="prow-actions"><Skeleton width={28} height={28} /></div>
              <Card pad="sm" className="prow-main">
                <Skeleton width={44} height={44} radius="var(--radius-sm)" />
                <div className="prow-meta" style={{ flex: 1 }}>
                  <Skeleton width="45%" height={13} />
                  <Skeleton width="70%" height={11} />
                </div>
              </Card>
            </div>
          ))}
        </div>
      ) : !tenant ? (
        // Distinguish "this workspace has no projects yet" from "no workspace is
        // selected", which the shared empty state would otherwise report as the
        // former — and invite you to add a project that could not be stamped.
        <div className="hint">{noWorkspaceMsg(lang)}</div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Icon name="folder" size={24} />}
          title={t('no_projects')}
          description={lang === 'ar' ? 'أعمالك هي ما يقنع الزوار. أضِف أول مشروع لعرض ما تبرع فيه.' : 'Your projects are what convince visitors. Add your first one to show what you do best.'}
          action={<Button size="sm" onClick={addProject}>+ {t('no_projects_yet_cta')}</Button>}
        />
      ) : (
        <div className="project-list">
          {projects.map((p, i) => {
            const title = pick(p.title, lang) || pick(p.title, 'en') || pick(p.title, 'ar');
            const desc = pick(p.description, lang) || pick(p.description, 'en') || pick(p.description, 'ar');
            return (
              <div key={p.id} className="project-row">
                <div className="prow-actions">
                  <button type="button" className="x-small" aria-label={t('move_up')} disabled={i === 0} onClick={() => move(p.id, -1)}>↑</button>
                  <button type="button" className="x-small" aria-label={t('move_down')} disabled={i === projects.length - 1} onClick={() => move(p.id, 1)}>↓</button>
                </div>
                <Card as="button" interactive pad="sm" className="prow-main" onClick={() => setEditing(p)}>
                  {p.cover_image
                    ? <img src={p.cover_image} alt="" />
                    : <div className="prow-cover-empty" />}
                  <div className="prow-meta">
                    <div className="prow-title">{title || '—'}</div>
                    {desc && <div className="prow-desc">{desc}</div>}
                  </div>
                  <span className="chevron">›</span>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <AdminStyles />
      <style jsx>{`
        .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
        .project-list { display: flex; flex-direction: column; gap: 6px; }
        .project-row { display: flex; align-items: center; gap: 6px; }
        .prow-actions { display: flex; flex-direction: column; gap: 2px; }
        /* surface comes from Card; only the row layout is local */
        .prow-main { flex: 1; display: flex; align-items: center; gap: var(--space-4); }
        .prow-main img, .prow-cover-empty { width: 44px; height: 44px; object-fit: cover; border-radius: var(--radius-sm); flex-shrink: 0; }
        .prow-cover-empty { background: linear-gradient(135deg, #3a3a52, #1a1a22); }
        .prow-meta { flex: 1; min-width: 0; }
        .prow-title { font-size: var(--text-md); font-weight: 600; }
        .prow-desc { font-size: var(--text-sm); color: var(--text-tertiary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chevron { color: var(--text-muted); font-size: 18px; }
      `}</style>
    </div>
  );
}

function ProjectEditForm({ project, onSave, onBack, onDelete, t, lang }) {
  const toast = useToast();
  const [data, setData] = useState(project);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const { tenant } = useTenant();

  function patch(updates) { setData(d => ({ ...d, ...updates })); setDirty(true); }
  function bilingualPatch(key, val) { patch({ [key]: setLangValue(data[key], lang, val) }); }

  async function save() {
    setSaving(true);
    try {
      await onSave(data);
      setSavedMsg(t('saved')); setDirty(false);
    } catch (err) {
      console.error(err); toast.error(t('save_failed'));
    } finally { setSaving(false); }
  }
  async function uploadCover(file) {
    const img = await compressImage(file);
    const path = tenantStoragePath(tenant, `project-${data.id}-cover-${Date.now()}.${fileExtension(img)}`);
    if (!path) { toast.error(t('upload_failed')); return; }
    const { error } = await supabase.storage.from('media').upload(path, img, { upsert: true });
    if (error) { console.error(error); toast.error(t('upload_failed')); return; }
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
    patch({ cover_image: urlData.publicUrl });
  }
  async function uploadGalleryImage(file) {
    const img = await compressImage(file);
    const path = tenantStoragePath(tenant, `project-${data.id}-${Date.now()}.${fileExtension(img)}`);
    if (!path) { toast.error(t('upload_failed')); return; }
    const { error } = await supabase.storage.from('media').upload(path, img);
    if (error) { console.error(error); toast.error(t('upload_failed')); return; }
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
    patch({ images: [...(data.images || []), urlData.publicUrl] });
  }
  function removeImage(idx) { patch({ images: data.images.filter((_, i) => i !== idx) }); }

  const displayTitle = pick(data.title, lang) || pick(data.title, 'en') || pick(data.title, 'ar') || t('project_fallback');

  return (
    <div className="editor">
      <button onClick={onBack} className="back-btn">← {t('back')}</button>
      <h1>{displayTitle}</h1>

      <h2>{t('basics')}</h2>
      <Field id="p-title" label={t('project_title')}>
        <input id="p-title" value={pick(data.title, lang)} onChange={(e) => bilingualPatch('title', e.target.value)} />
      </Field>
      <Field id="p-desc" label={t('project_description')}>
        <input id="p-desc" value={pick(data.description, lang)} onChange={(e) => bilingualPatch('description', e.target.value)} placeholder={lang === 'ar' ? 'ملخص قصير' : 'Short summary'} />
      </Field>
      <Field id="p-full" label={t('full_description')}>
        <textarea id="p-full" rows={5} value={pick(data.full_description, lang)} onChange={(e) => bilingualPatch('full_description', e.target.value)} />
      </Field>

      <h2>{t('project_info')} <span className="meta">· {t('optional')}</span></h2>
      <div className="row-grid-3" style={{ maxWidth: 560 }}>
        <Field id="p-client" label={t('project_client')}>
          <input id="p-client" value={data.client || ''} onChange={(e) => patch({ client: e.target.value })} />
        </Field>
        <Field id="p-year" label={t('project_year')}>
          <input id="p-year" dir="ltr" value={data.year || ''} onChange={(e) => patch({ year: e.target.value })} />
        </Field>
        <Field id="p-role" label={t('project_role')}>
          <input id="p-role" value={data.role || ''} onChange={(e) => patch({ role: e.target.value })} />
        </Field>
      </div>

      <h2>{t('cover_image')}</h2>
      <ImageUpload value={data.cover_image} onUpload={uploadCover} onClear={() => patch({ cover_image: '' })} aspect={1} hint={t('img_hint_cover')} t={t} />

      <h2>{t('external_link')}</h2>
      <Field id="p-ext" label="">
        <input id="p-ext" type="url" dir="ltr" value={data.external_url || ''} onChange={(e) => patch({ external_url: e.target.value })} placeholder="https://..." />
      </Field>

      <h2>{t('project_images')}</h2>
      <MultiImageUpload images={data.images || []} onUpload={uploadGalleryImage} onRemove={removeImage} hint={t('img_hint_gallery')} t={t} />

      <SaveBar saving={saving} savedMsg={savedMsg} onSave={save} t={t} dirty={dirty}
        extra={<Button variant="danger" size="sm" onClick={() => onDelete(data.id)}>{t('delete')}</Button>}
      />
      <AdminStyles />
      <style jsx>{`
        .back-btn { font-size: 13px; color: var(--text-tertiary); margin-bottom: var(--space-4); padding: 4px 0; background: none; border: none; cursor: pointer; font-family: inherit; }
        .back-btn:hover { color: var(--text-primary); }
        .row-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (max-width: 720px) {
          .row-grid-3 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

// =========================================================
// Links Editor
// =========================================================
function LinksEditor({ t, lang }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [links, setLinks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pickerForId, setPickerForId] = useState(null);
  const [loading, setLoading] = useState(true); // gate the empty state until the first load lands
  const { tenant } = useTenant();

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await loadProfile(tenant, 'custom_links');
    setLinks(data?.custom_links || []);
    setLoading(false);
  }
  function patch(next) { setLinks(next); setDirty(true); }
  async function save() {
    setSaving(true);
    try {
      const { error } = await persistProfile(tenant, { custom_links: links });
      if (!error) { setSavedMsg(t('saved')); setDirty(false); }
      else { console.error(error); toast.error(t('save_failed')); }
    } catch (err) {
      console.error(err); toast.error(t('save_failed'));
    } finally { setSaving(false); }
  }
  function add() { patch([...links, { id: newId(), icon: 'website', label: emptyBilingual(), href: '' }]); }
  function update(id, u) { patch(links.map(l => l.id === id ? { ...l, ...u } : l)); }
  async function remove(id) { if (!(await confirm(removeDialog(t)))) return; patch(links.filter(l => l.id !== id)); }
  function move(id, dir) { const a = [...links]; const i = a.findIndex(l => l.id === id); const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; patch(a); }

  return (
    <div className="editor">
      <h1>{t('links_title')}</h1>
      <p className="hint">{t('links_sub')}</p>

      {loading && (
        <div aria-hidden="true">
          {[0, 1].map(i => (
            <div key={i} className="link-row">
              <div className="link-actions"><Skeleton width={28} height={28} /></div>
              <Skeleton width={36} height={36} radius="var(--radius-sm)" />
              <Skeleton width={160} height={36} />
              <Skeleton width="30%" height={36} />
            </div>
          ))}
        </div>
      )}

      {!loading && links.length === 0 && (
        <EmptyState
          icon={<Icon name="link" size={24} />}
          title={lang === 'ar' ? 'لا توجد روابط بعد' : 'No links yet'}
          description={lang === 'ar' ? 'أضِف حساباتك (إنستغرام، بيهانس، لينكدإن…) ليتواصل معك الزوار.' : 'Add your socials (Instagram, Behance, LinkedIn…) so visitors can reach you.'}
          action={<Button size="sm" onClick={add}>+ {lang === 'ar' ? 'أضف رابطًا' : 'Add a link'}</Button>}
        />
      )}

      {links.map((l, i) => {
        const icon = BRAND_ICONS[normalizeIcon(l.icon)] || BRAND_ICONS.website;
        return (
          <div key={l.id} className="link-row">
            <div className="link-actions">
              <button type="button" className="x-small" aria-label={t('move_up')} disabled={i === 0} onClick={() => move(l.id, -1)}>↑</button>
              <button type="button" className="x-small" aria-label={t('move_down')} disabled={i === links.length - 1} onClick={() => move(l.id, 1)}>↓</button>
            </div>
            <button type="button" className="brand" onClick={() => setPickerForId(l.id)} title={t('pick_icon')} aria-label={t('pick_icon')}>
              <svg viewBox="0 0 24 24"><path d={icon.path} /></svg>
            </button>
            <input className="input-sm" placeholder={icon.label} value={pick(l.label, lang)} onChange={(e) => update(l.id, { label: setLangValue(l.label, lang, e.target.value) })} style={{ width: 160 }} />
            <input className="input-sm" type="text" dir="ltr" placeholder="https://..." value={l.href || ''} onChange={(e) => update(l.id, { href: e.target.value })} style={{ flex: 1 }} />
            <button type="button" className="x-small" aria-label={t('remove')} onClick={() => remove(l.id)}>×</button>
          </div>
        );
      })}
      {/* The empty state already offers "add a link", so this would sit right
          underneath it as a duplicate control. Only show it once a list exists. */}
      {!loading && links.length > 0 && (
        <Button variant="secondary" size="sm" onClick={add}>+ {t('add_link')}</Button>
      )}

      <SaveBar saving={saving} savedMsg={savedMsg} onSave={save} t={t} dirty={dirty} />
      {pickerForId && <IconPickerModal selected={links.find(l => l.id === pickerForId)?.icon} onPick={(k) => { update(pickerForId, { icon: k }); setPickerForId(null); }} onClose={() => setPickerForId(null)} t={t} />}

      <AdminStyles />
      <style jsx>{`
        .link-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; max-width: 720px; flex-wrap: wrap; }
        .link-actions { display: flex; flex-direction: column; gap: 2px; }
        .brand { width: 38px; height: 38px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: rgba(var(--on-bg),0.92); background: rgba(var(--on-bg),0.05); border: 1px solid rgba(var(--on-bg),0.07); cursor: pointer; flex-shrink: 0; }
        .brand svg { width: 17px; height: 17px; fill: currentColor; }
        .brand:hover { background: rgba(var(--on-bg),0.08); }
        .input-sm { padding: 9px 12px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary); font-size: 13px; font-family: inherit; min-width: 0; }
        @media (max-width: 720px) {
          .link-row { gap: 6px; }
          /* Label input stays on row 1 with icon/actions, URL drops to row 2 full-width */
          .link-row > input.input-sm:nth-of-type(2) {
            flex: 1 0 100%;
            width: 100% !important;
            order: 99;
          }
          .input-sm { padding: 12px 14px; font-size: 16px; /* prevent iOS zoom */ }
        }
      `}</style>
    </div>
  );
}

function IconPickerModal({ selected, onPick, onClose, t }) {
  const [q, setQ] = useState('');
  const filtered = BRAND_KEYS.filter(k => BRAND_ICONS[k].label.toLowerCase().includes(q.toLowerCase()) || k.includes(q.toLowerCase()));
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  // Escape must close the picker — it was mouse-only before.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="picker-bg" onClick={onClose}>
      <div
        className="picker"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('icon_picker_title')}
      >
        <div className="picker-head">
          <h3>{t('icon_picker_title')}</h3>
          <button onClick={onClose} className="picker-close" type="button" aria-label={t('close')}>×</button>
        </div>
        <input autoFocus placeholder={t('icon_picker_search')} value={q} onChange={(e) => setQ(e.target.value)} className="picker-search" />
        <div className="picker-grid">
          {filtered.map(k => (
            <button key={k} type="button" className={`picker-cell ${selected === k ? 'sel' : ''}`} onClick={() => onPick(k)} title={BRAND_ICONS[k].label}>
              <svg viewBox="0 0 24 24"><path d={BRAND_ICONS[k].path} /></svg>
              <span>{BRAND_ICONS[k].label}</span>
            </button>
          ))}
        </div>
      </div>
      <style jsx>{`
        .picker-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.15s ease; }
        .picker { width: 100%; max-width: 520px; max-height: 80vh; background: var(--bg-secondary); border: 1px solid var(--border-strong); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .picker-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
        .picker-head h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        .picker-close { width: 28px; height: 28px; border-radius: 50%; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); font-size: 18px; cursor: pointer; }
        .picker-search { width: calc(100% - 40px); margin: 16px 20px 0; padding: 10px 14px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; color: var(--text-primary); font-size: 14px; font-family: inherit; }
        .picker-search:focus { outline: none; border-color: var(--accent); }
        .picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 6px; padding: 16px 20px; overflow-y: auto; }
        .picker-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 6px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; color: rgba(var(--on-bg),0.92); transition: var(--transition); font-family: inherit; }
        .picker-cell:hover { border-color: var(--border-strong); background: var(--bg-hover); }
        .picker-cell.sel { border-color: var(--accent); background: rgba(79,110,242,0.1); }
        .picker-cell svg { width: 20px; height: 20px; fill: currentColor; }
        .picker-cell span { font-size: 10px; color: var(--text-tertiary); text-align: center; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; max-width: 100%; white-space: nowrap; }
      `}</style>
    </div>
  );
}

// =========================================================
// Appearance Editor
// =========================================================
function AppearanceEditor({ t, lang }) {
  const toast = useToast();
  const [appearance, setAppearance] = useState({ theme: 'midnight', tokens: { ...THEME_PRESETS.midnight.tokens }, font_body: 'manrope', density: 'comfortable', radius: 'soft' });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [device, setDevice] = useState('desktop');
  const { tenant } = useTenant();

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await loadProfile(tenant, 'appearance');
    if (data?.appearance) {
      setAppearance({
        theme: data.appearance.theme || 'midnight',
        tokens: { ...(THEME_PRESETS.midnight.tokens), ...(data.appearance.tokens || {}) },
        font_body: data.appearance.font_body || 'manrope',
        density: data.appearance.density || 'comfortable',
        radius: data.appearance.radius || 'soft',
      });
    }
  }
  function patch(updates) { setAppearance(a => ({ ...a, ...updates })); setDirty(true); }
  function patchTokens(updates) { setAppearance(a => ({ ...a, tokens: { ...a.tokens, ...updates } })); setDirty(true); }
  function applyPreset(key) { setAppearance(a => ({ ...a, theme: key, tokens: { ...THEME_PRESETS[key].tokens } })); setDirty(true); }
  async function save() {
    setSaving(true);
    try {
      const { error } = await persistProfile(tenant, { appearance });
      if (!error) { setSavedMsg(t('saved')); setDirty(false); }
      else { console.error(error); toast.error(t('save_failed')); }
    } catch (err) {
      console.error(err); toast.error(t('save_failed'));
    } finally { setSaving(false); }
  }

  const deviceWidth = device === 'mobile' ? 360 : device === 'tablet' ? 640 : '100%';

  return (
    <div className="editor">
      <h1>{t('appearance_title')}</h1>

      <h2>{t('theme_preset')}</h2>
      <div className="preset-grid">
        {Object.entries(THEME_PRESETS).map(([k, v]) => (
          <button key={k} type="button" className={`preset ${appearance.theme === k ? 'active' : ''}`} onClick={() => applyPreset(k)}>
            <div className="preset-swatch" style={{ background: v.tokens.bg, color: v.tokens.accent, borderColor: v.tokens.border }}>Aa</div>
            <div className="preset-name">{t(`preset_${k}`)}</div>
          </button>
        ))}
      </div>

      <h2>{t('custom_colors')}</h2>
      <div className="color-grid">
        {[['bg', 'color_background'], ['surface', 'color_surface'], ['accent', 'color_accent'], ['text', 'color_text'], ['text_muted', 'color_text_muted'], ['border', 'color_border']].map(([k, lbl]) => (
          <div key={k} className="color-item">
            <input type="color" value={normalizeColor(appearance.tokens[k])} onChange={(e) => patchTokens({ [k]: e.target.value })} />
            <label>{t(lbl)}</label>
          </div>
        ))}
      </div>

      <h2>{t('typography')}</h2>
      <Field id="font-b" label={t('font_body')}>
        <select id="font-b" value={appearance.font_body} onChange={(e) => patch({ font_body: e.target.value })}>
          {FONT_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </Field>

      <h2>{t('layout')}</h2>
      <Field id="density" label={t('density')}>
        <select id="density" value={appearance.density} onChange={(e) => patch({ density: e.target.value })}>
          {DENSITY_OPTS.map(o => <option key={o.key} value={o.key}>{t(`density_${o.key}`)}</option>)}
        </select>
      </Field>
      <Field id="radius" label={t('corner_roundness')}>
        <select id="radius" value={appearance.radius} onChange={(e) => patch({ radius: e.target.value })}>
          {RADIUS_OPTS.map(o => <option key={o.key} value={o.key}>{t(`roundness_${o.key}`)}</option>)}
        </select>
      </Field>

      <h2>{t('live_preview')}</h2>
      <div className="device-toggle">
        {[['desktop', 'device_desktop'], ['tablet', 'device_tablet'], ['mobile', 'device_mobile']].map(([k, lbl]) => (
          <button key={k} type="button" className={device === k ? 'active' : ''} onClick={() => setDevice(k)}>{t(lbl)}</button>
        ))}
      </div>
      <div className="preview-shell">
        <iframe src="/" style={{ width: deviceWidth, maxWidth: '100%', height: 600, border: 'none', borderRadius: 12, background: '#0a0a0c' }} title="preview" />
      </div>

      <SaveBar saving={saving} savedMsg={savedMsg} onSave={save} t={t} dirty={dirty} />
      <AdminStyles />
      <style jsx>{`
        .preset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: var(--space-5); max-width: 640px; }
        .preset { background: var(--bg-secondary); border: 1.5px solid var(--border); border-radius: var(--radius-md); padding: 12px; cursor: pointer; text-align: center; transition: var(--transition); font-family: inherit; }
        .preset:hover { border-color: var(--border-strong); }
        .preset.active { border-color: var(--accent); }
        .preset-swatch { height: 42px; border-radius: var(--radius-sm); margin-bottom: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; border: 1px solid; }
        .preset-name { font-size: 12px; color: var(--text-secondary); }
        .color-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-width: 500px; margin-bottom: var(--space-4); }
        .color-item { display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); }
        .color-item input[type="color"] { width: 36px; height: 36px; padding: 2px; border-radius: 6px; cursor: pointer; }
        .color-item label { flex: 1; font-size: 12px; color: var(--text-secondary); }
        .device-toggle { direction: ltr; display: inline-flex; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 4px; gap: 2px; margin-bottom: var(--space-4); }
        .device-toggle button { padding: 8px 14px; background: none; border: none; color: var(--text-tertiary); font-size: 12px; border-radius: 6px; cursor: pointer; font-family: inherit; }
        .device-toggle button.active { background: var(--bg-elevated); color: var(--text-primary); }
        .preview-shell { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; display: flex; justify-content: center; }
        @media (max-width: 720px) {
          .preset-grid { grid-template-columns: repeat(2, 1fr); }
          .color-grid { grid-template-columns: 1fr; }
          .preview-shell { padding: 8px; }
          .preview-shell :global(iframe) { height: 420px !important; }
          .device-toggle button { padding: 10px 14px; }
        }
      `}</style>
    </div>
  );
}

function normalizeColor(v) {
  if (!v) return '#000000';
  if (v.startsWith('#') && (v.length === 7 || v.length === 4)) return v;
  return '#000000';
}

// =========================================================
// Analytics Editor
// =========================================================
function AnalyticsEditor({ t, lang }) {
  const [range, setRange] = useState('7d');
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const { tenant } = useTenant();

  // A ref-based token guards against a range-switch race: if the user changes
  // range while a slower request is in flight, only the latest one writes state.
  const loadSeq = useRef(0);
  useEffect(() => {
    const seq = ++loadSeq.current;
    load(seq);
    return () => { /* mark superseded — the check in load() handles it */ };
  }, [range, tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(seq) {
    setLoading(true);
    let from;
    const now = new Date();
    if (range === '24h') from = new Date(now - 24 * 3600 * 1000);
    else if (range === '7d') from = new Date(now - 7 * 86400 * 1000);
    else if (range === '30d') from = new Date(now - 30 * 86400 * 1000);
    else from = new Date(0);

    try {
      let evq = supabase.from('analytics_events').select('*').gte('created_at', from.toISOString());
      if (tenant) evq = evq.eq('tenant_id', tenant.id);
      const { data: evs } = await evq.order('created_at', { ascending: false });
      let pq = supabase.from('projects').select('id, title');
      if (tenant) pq = pq.eq('tenant_id', tenant.id);
      const { data: projs } = await pq;
      if (seq !== loadSeq.current) return; // a newer range was requested; drop this result
      setEvents(evs || []);
      setProjects(projs || []);
    } catch (e) {
      console.error('[analytics] load failed:', e);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  const pageViews = events.filter(e => e.event_type === 'page_view');
  const uniqueVisitors = new Set(pageViews.map(e => e.visitor_id).filter(Boolean)).size;
  const projectViews = events.filter(e => e.event_type === 'project_view');
  const linkClicks = events.filter(e => e.event_type === 'link_click');

  const topProjects = useMemo(() => {
    const counts = new Map();
    projectViews.forEach(e => { if (e.project_id) counts.set(e.project_id, (counts.get(e.project_id) || 0) + 1); });
    const arr = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return arr.map(([id, count]) => {
      const proj = projects.find(p => p.id === id);
      const title = proj ? (pick(proj.title, lang) || pick(proj.title, 'en')) : `Project #${id}`;
      return { label: title || '—', value: count };
    });
  }, [projectViews, projects, lang]);

  const topLinks = useMemo(() => {
    const counts = new Map();
    linkClicks.forEach(e => { if (e.link_key) counts.set(e.link_key, (counts.get(e.link_key) || 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ label: k, value: v }));
  }, [linkClicks]);

  const topReferrers = useMemo(() => {
    const counts = new Map();
    pageViews.forEach(e => {
      let r = 'Direct / unknown';
      if (e.referrer) {
        try { r = new URL(e.referrer).hostname.replace(/^www\./, ''); }
        catch { r = e.referrer.slice(0, 40); }
      }
      counts.set(r, (counts.get(r) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [pageViews]);

  const topCountries = useMemo(() => {
    const counts = new Map();
    pageViews.forEach(e => { const c = e.country || 'Unknown'; counts.set(c, (counts.get(c) || 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [pageViews]);

  const chartPath = useMemo(() => {
    if (pageViews.length === 0) return null;
    const buckets = 12;
    const now = Date.now();
    let span;
    if (range === '24h') span = 24 * 3600 * 1000;
    else if (range === '7d') span = 7 * 86400 * 1000;
    else if (range === '30d') span = 30 * 86400 * 1000;
    else span = Math.max(now - new Date(pageViews[pageViews.length - 1].created_at).getTime(), 1);
    const start = now - span;
    const counts = new Array(buckets).fill(0);
    pageViews.forEach(e => {
      const ts = new Date(e.created_at).getTime();
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor(((ts - start) / span) * buckets)));
      counts[idx]++;
    });
    const max = Math.max(...counts, 1);
    const w = 600, h = 160;
    const stepX = w / (buckets - 1);
    const pts = counts.map((c, i) => `${i * stepX},${h - (c / max) * (h - 20)}`);
    const line = `M${pts.join(' L')}`;
    const area = `${line} L${w},${h} L0,${h} Z`;
    const fmtAxis = (ts) => {
      const d = new Date(ts);
      if (range === '24h') return d.toLocaleTimeString(lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
      return d.toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short' });
    };
    const labels = [0, 0.25, 0.5, 0.75, 1].map(f => fmtAxis(start + f * span));
    return { line, area, labels };
  }, [pageViews, range, lang]);

  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (e) { return iso || '—'; }
  };
  const recentVisits = pageViews.slice(0, 20).map(e => [fmtTime(e.created_at), e.country || '—']);

  return (
    <div className="editor">
      <h1>{t('analytics_title')}</h1>

      <div className="range-pills">
        {[['24h', 'range_24h'], ['7d', 'range_7d'], ['30d', 'range_30d'], ['all', 'range_all']].map(([k, lbl]) => (
          <button key={k} type="button" className={range === k ? 'active' : ''} onClick={() => setRange(k)}>{t(lbl)}</button>
        ))}
      </div>

      {loading ? (
        <p className="hint">{t('loading')}</p>
      ) : events.length === 0 ? (
        <EmptyState icon={<Icon name="chart" size={24} />} title={t('no_data_yet')} compact />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label={t('stat_total_visits')} value={pageViews.length} />
            <StatCard label={t('stat_unique_visitors')} value={uniqueVisitors} />
            <StatCard label={t('stat_project_views')} value={projectViews.length} />
            <StatCard label={t('stat_contact_clicks')} value={linkClicks.length} />
          </div>

          {chartPath && (
            <div className="chart-card">
              <div className="chart-title">{t('visits_over_time')}</div>
              <svg viewBox="0 0 600 160" preserveAspectRatio="none" style={{ width: '100%', height: 160 }}>
                <defs>
                  <linearGradient id="ag" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#4f6ef2" stopOpacity=".4" />
                    <stop offset="100%" stopColor="#4f6ef2" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={chartPath.area} fill="url(#ag)" />
                <path d={chartPath.line} fill="none" stroke="#4f6ef2" strokeWidth="2" />
              </svg>
              <div className="chart-axis">
                {chartPath.labels.map((l, i) => <span key={i}>{l}</span>)}
              </div>
            </div>
          )}

          <div className="twocol">
            <BarChartCard title={t('top_projects')} rows={topProjects} />
            <BarChartCard title={t('contact_clicks')} rows={topLinks} />
          </div>

          <div className="twocol">
            <TableCard title={t('top_referrers')} headLabel={t('source')} headValue={t('visits')} rows={topReferrers} />
            <TableCard title={t('visitors_by_country')} headLabel={t('country')} headValue={t('visits')} rows={topCountries} />
          </div>

          <TableCard title={t('recent_visits')} headLabel={t('time')} headValue={t('country')} rows={recentVisits} />
        </>
      )}

      <AdminStyles />
      <style jsx>{`
        .range-pills { direction: ltr; display: inline-flex; gap: 4px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 4px; margin-bottom: var(--space-5); }
        .range-pills button { padding: 6px 12px; font-size: 12px; color: var(--text-tertiary); border-radius: 6px; background: none; border: none; cursor: pointer; font-family: inherit; }
        .range-pills button.active { background: var(--bg-elevated); color: var(--text-primary); }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: var(--space-6); }
        .chart-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-5); margin-bottom: var(--space-4); }
        .chart-title { font-size: 14px; font-weight: 600; margin-bottom: var(--space-4); }
        .chart-axis { direction: ltr; display: flex; justify-content: space-between; margin-top: 8px; font-size: 10px; color: var(--text-tertiary); }
        .twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: var(--space-4); }
        @media (max-width: 720px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } .twocol { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value.toLocaleString()}</div>
      <style jsx>{`
        .stat-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-4); position: relative; overflow: hidden; }
        .stat-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(var(--on-bg),0.08), transparent); }
        .stat-label { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
        :global(html[dir="rtl"]) .stat-label { text-transform: none; letter-spacing: normal; }
        .stat-value { font-size: 26px; font-weight: 700; letter-spacing: -.02em; color: var(--text-primary); }
      `}</style>
    </div>
  );
}

function BarChartCard({ title, rows }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="bcc">
      <div className="bcc-title">{title}</div>
      {rows.length === 0 ? <p className="bcc-empty">—</p> : rows.map((r, i) => (
        <div key={i} className="bcc-row">
          <div className="bcc-label">{r.label}</div>
          <div className="bcc-track"><div className="bcc-fill" style={{ width: `${(r.value / max) * 100}%` }} /></div>
          <div className="bcc-value">{r.value}</div>
        </div>
      ))}
      <style jsx>{`
        .bcc { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-5); }
        .bcc-title { font-size: 14px; font-weight: 600; margin-bottom: var(--space-4); }
        .bcc-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; font-size: 13px; }
        .bcc-row + .bcc-row { border-top: 1px solid var(--border); }
        .bcc-label { flex: 0 0 160px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bcc-track { flex: 1; height: 8px; background: var(--bg-elevated); border-radius: 4px; overflow: hidden; }
        .bcc-fill { height: 100%; background: var(--accent); border-radius: 4px; }
        .bcc-value { flex: 0 0 50px; text-align: end; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
        .bcc-empty { color: var(--text-muted); font-size: 13px; padding: 12px 0; text-align: center; }
      `}</style>
    </div>
  );
}

function TableCard({ title, headLabel, headValue, rows }) {
  return (
    <div className="tcc">
      <div className="tcc-title">{title}</div>
      {rows.length === 0 ? <p className="tcc-empty">—</p> : (
        <table>
          <thead><tr><th>{headLabel}</th><th style={{ textAlign: 'end' }}>{headValue}</th></tr></thead>
          <tbody>{rows.map(([k, v], i) => (<tr key={i}><td>{k}</td><td className="num">{v}</td></tr>))}</tbody>
        </table>
      )}
      <style jsx>{`
        .tcc { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-5); }
        .tcc-title { font-size: 14px; font-weight: 600; margin-bottom: var(--space-4); }
        .tcc table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .tcc th { text-align: start; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-tertiary); font-weight: 500; padding: 8px 0; border-bottom: 1px solid var(--border); }
        :global(html[dir="rtl"]) .tcc th { text-transform: none; letter-spacing: normal; }
        .tcc td { padding: 10px 0; border-bottom: 1px solid var(--border); color: var(--text-secondary); }
        .tcc td.num { text-align: end; font-variant-numeric: tabular-nums; color: var(--text-primary); }
        .tcc tr:last-child td { border-bottom: none; }
        .tcc-empty { color: var(--text-muted); font-size: 13px; padding: 12px 0; text-align: center; }
      `}</style>
    </div>
  );
}

// =========================================================
// Account Editor
// =========================================================
// Onboarding: create a workspace (tenant) per client and manage its custom domains.
// All writes here require the multi-tenant onboarding migration (tenants/tenant_admins/
// tenant_domains write policies + grants, and Section C so a new profile row can exist).
// Until that migration is applied these calls surface a clear error instead of failing
// silently; nothing here runs against or breaks the current single-tenant database.
// ---- Custom domains (Phase 4) -------------------------------------------------
// DNS targets for the Portfolio Platform Vercel project. Apex domains need an A
// record; subdomains use a CNAME. We do NOT automate Vercel — instructions only.
const VERCEL_A_RECORD = '76.76.21.21';
const VERCEL_CNAME = 'cname.vercel-dns.com';

function isApexDomain(d) {
  return String(d || '').split('.').filter(Boolean).length <= 2;
}

// Verify DNS straight from the browser via public DNS-over-HTTPS — no backend needed.
// IMPORTANT: distinguish "lookup failed" from "no records". If the DNS API is
// unreachable (offline, blocked by an extension/network), we must NOT treat that as
// "no DNS" — otherwise Verify would downgrade a perfectly working domain.
async function checkDomainDns(domain) {
  const q = async (type) => {
    // Abort a stalled DoH request so Verify can't spin forever on a flaky network.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`dns http ${r.status}`);
      const j = await r.json();
      return (j.Answer || []).map((a) => String(a.data || '').replace(/\.$/, '').toLowerCase());
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const [cname, a] = await Promise.all([q('CNAME'), q('A')]);
    const ok = cname.some((v) => v.includes('vercel-dns.com')) || a.includes(VERCEL_A_RECORD);
    return { reachable: true, ok, hasAnyRecord: cname.length > 0 || a.length > 0 };
  } catch (_) {
    return { reachable: false, ok: false, hasAnyRecord: false };
  }
}

// `tone` maps onto the Badge primitive; `dot` is kept for the couple of places
// that render the status inline inside a sentence rather than as a pill.
function domainStatusMeta(status, ar) {
  if (status === 'active') return { tone: 'success', label: ar ? 'نشط' : 'Active' };
  if (status === 'error') return { tone: 'danger', label: ar ? 'فشل' : 'Failed' };
  return { tone: 'warning', label: ar ? 'بانتظار DNS' : 'Waiting for DNS' };
}

function DomainStatusBadge({ status, ar }) {
  const meta = domainStatusMeta(status, ar);
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

function DnsInstructions({ domain, ar, isOwner }) {
  const apex = isApexDomain(domain);
  const host = apex ? '@' : domain.split('.')[0];
  return (
    <div className="dns">
      <div className="dns-title">{ar ? 'أضف هذا السجل عند مزوّد النطاق:' : 'Add this record at your domain provider:'}</div>
      <div className="dns-grid">
        <div><span>{ar ? 'النوع' : 'Type'}</span><strong dir="ltr">{apex ? 'A' : 'CNAME'}</strong></div>
        <div><span>{ar ? 'الاسم' : 'Host'}</span><strong dir="ltr">{host}</strong></div>
        <div><span>{ar ? 'القيمة' : 'Value'}</span><strong dir="ltr">{apex ? VERCEL_A_RECORD : VERCEL_CNAME}</strong></div>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {ar ? 'أضِف السجل ثم ارجع واضغط «تحقّق». قد يستغرق انتشار DNS حتى 48 ساعة.'
            : 'Add the record, then come back and press Verify. DNS propagation can take up to 48 hours.'}
      </p>
      <p className="hint">
        {isOwner
          ? (ar ? 'ملاحظة للمالك: أضِف النطاق أيضًا في مشروع Vercel.' : 'Owner note: also add this domain in the Vercel project.')
          : (ar ? 'سنكمل ربط النطاق من جهتنا بعد نجاح التحقق.' : 'We’ll finish connecting it on our side once verification passes.')}
      </p>
      <style jsx>{`
        .dns { margin-top: 10px; padding: 12px 14px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); }
        .dns-title { font-size: 12px; font-weight: 600; margin-bottom: 10px; color: var(--text-secondary); }
        .dns-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
        .dns-grid > div { display: flex; flex-direction: column; gap: 3px; }
        .dns-grid span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
        :global(html[dir="rtl"]) .dns-grid span { text-transform: none; letter-spacing: normal; }
        .dns-grid strong { font-size: 13px; font-weight: 700; word-break: break-all; }
      `}</style>
    </div>
  );
}

// Client-friendly domain setup: add -> DNS instructions -> verify -> active.
function DomainManager({ lang, isOwner }) {
  const confirm = useConfirm();
  const { tenant } = useTenant();
  const ar = lang === 'ar';
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [openDns, setOpenDns] = useState(null);
  const [verifying, setVerifying] = useState(null);
  const [verifyMsg, setVerifyMsg] = useState({});

  const load = useCallback(async () => {
    if (!tenant) { setDomains([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('tenant_domains').select('*').eq('tenant_id', tenant.id).order('created_at');
    setDomains(data || []); setLoading(false);
  }, [tenant]);
  useEffect(() => { load(); }, [load]);

  async function addDomain(e) {
    e.preventDefault(); setErr('');
    if (!tenant) { setErr(ar ? 'اختر مساحة أولًا' : 'Select a workspace first'); return; }
    const d = normalizeDomain(newDomain);
    if (!d || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) {
      setErr(ar ? 'أدخل نطاقًا صالحًا مثل example.com' : 'Enter a valid domain like example.com'); return;
    }
    if (domains.some((x) => x.domain === d)) { setErr(ar ? 'هذا النطاق مضاف بالفعل' : 'That domain is already added'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('tenant_domains')
        .insert({ tenant_id: tenant.id, domain: d, is_primary: domains.length === 0, status: 'pending' });
      if (error) { setErr(error.message || String(error)); return; }
      setNewDomain(''); await load(); setOpenDns(d);
    } catch (e2) {
      console.error('[domain] add failed:', e2);
      setErr(ar ? 'تعذّر إضافة النطاق' : 'Could not add the domain');
    } finally {
      setBusy(false);
    }
  }

  async function verify(row) {
    setVerifying(row.id);
    const res = await checkDomainDns(row.domain);
    if (!res.reachable) {
      // Couldn't reach the DNS checker — leave status untouched rather than lie.
      setVerifyMsg((m) => ({ ...m, [row.id]: ar
        ? 'تعذّر التحقق الآن (تعذّر الوصول لخدمة DNS). لم يتغيّر الحالة — حاول مرة أخرى.'
        : 'Could not run the check right now (DNS service unreachable). Status unchanged — please try again.' }));
      setVerifying(null);
      return;
    }
    const next = res.ok ? 'active' : (res.hasAnyRecord ? 'error' : 'pending');
    await supabase.from('tenant_domains').update({ status: next }).eq('id', row.id);
    setVerifyMsg((m) => ({ ...m, [row.id]: res.ok
      ? (ar ? 'تم التحقق ✓ النطاق يشير إلينا.' : 'Verified ✓ your domain points to us.')
      : res.hasAnyRecord
        ? (ar ? 'يوجد سجل DNS لكنه لا يشير إلينا بعد.' : 'A DNS record exists but doesn’t point to us yet.')
        : (ar ? 'لم نجد سجل DNS بعد — قد يستغرق الانتشار حتى 48 ساعة.' : 'No DNS record found yet — propagation can take up to 48 hours.') }));
    setVerifying(null);
    await load();
  }

  async function removeDomain(id) {
    const ok = await confirm({
      title: ar ? 'حذف النطاق؟' : 'Remove domain?',
      description: ar
        ? 'سيتوقف هذا النطاق عن عرض المعرض. يمكنك إضافته مرة أخرى لاحقًا.'
        : 'This domain will stop serving the portfolio. You can add it again later.',
      confirmLabel: ar ? 'حذف' : 'Remove',
      cancelLabel: ar ? 'إلغاء' : 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    const { error } = await supabase.from('tenant_domains').delete().eq('id', id);
    if (error) setErr(error.message || String(error)); else load();
  }
  // Clear the flag tenant-wide FIRST — a partial unique index allows one primary.
  async function makePrimary(id) {
    if (!tenant) return; setErr('');
    const { error: clearErr } = await supabase.from('tenant_domains').update({ is_primary: false }).eq('tenant_id', tenant.id);
    if (clearErr) { setErr(clearErr.message || String(clearErr)); return; }
    const { error } = await supabase.from('tenant_domains').update({ is_primary: true }).eq('id', id);
    if (error) setErr(error.message || String(error)); else load();
  }

  if (!tenant) {
    return <div className="hint">{ar ? 'اختر مساحة من الأعلى لإدارة نطاقاتها.' : 'Select a workspace above to manage its domains.'}</div>;
  }

  return (
    <div className="dm">
      {loading ? <div className="hint">…</div> : domains.length === 0 ? (
        <EmptyState
          icon={<Icon name="globe" size={24} />}
          title={ar ? 'لا يوجد نطاق مخصص بعد' : 'No custom domain yet'}
          description={ar ? `موقعك متاح الآن على /${tenant.slug}. اربط نطاقك الخاص ليبدو احترافيًا أكثر.`
                          : `Your site is live at /${tenant.slug}. Connect your own domain to make it feel truly yours.`}
        />
      ) : (
        <div className="dm-list">
          {domains.map((d) => (
            <Card key={d.id} pad="sm">
              <div className="dm-head">
                <span className="dm-name" dir="ltr">{d.domain}</span>
                {d.is_primary && <span className="dm-star" title={ar ? 'أساسي' : 'Primary'}>★</span>}
                <span className="dm-status"><DomainStatusBadge status={d.status} ar={ar} /></span>
              </div>
              <div className="dm-actions">
                <Button variant="secondary" size="sm" onClick={() => verify(d)} loading={verifying === d.id}>
                  {ar ? 'تحقّق' : 'Verify'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setOpenDns(openDns === d.domain ? null : d.domain)}>
                  {ar ? 'تعليمات DNS' : 'DNS instructions'}
                </Button>
                {!d.is_primary && (
                  <Button variant="secondary" size="sm" onClick={() => makePrimary(d.id)}>{ar ? 'اجعله أساسيًا' : 'Make primary'}</Button>
                )}
                <button type="button" className="x-small" onClick={() => removeDomain(d.id)} aria-label={ar ? 'إزالة النطاق' : 'Remove domain'}>×</button>
              </div>
              {verifyMsg[d.id] && <div className="dm-msg">{verifyMsg[d.id]}</div>}
              {openDns === d.domain && <DnsInstructions domain={d.domain} ar={ar} isOwner={isOwner} />}
            </Card>
          ))}
        </div>
      )}

      <form onSubmit={addDomain} className="dm-add">
        <input type="text" dir="ltr" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="example.com" />
        <Button type="submit" loading={busy}>{ar ? 'ربط نطاق' : 'Connect domain'}</Button>
      </form>
      {err && <div className="ts-err">{err}</div>}

      <style jsx>{`
        .dm { max-width: 640px; }
        .dm-list { display: flex; flex-direction: column; gap: 10px; }
        .dm-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .dm-name { font-size: var(--text-md); font-weight: 600; word-break: break-all; }
        .dm-star { color: var(--accent); }
        .dm-status { margin-inline-start: auto; white-space: nowrap; }
        .dm-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
        .dm-msg { margin-top: 8px; font-size: var(--text-sm); color: var(--text-secondary); }
        .dm-add { display: flex; gap: 8px; margin-top: 12px; align-items: flex-start; flex-wrap: wrap; }
        .dm-add input { flex: 1; min-width: 180px; }
        .ts-err { padding: 8px 12px; background: var(--danger-bg); color: var(--danger); border-radius: var(--radius-md); font-size: var(--text-sm); margin-top: 8px; }
      `}</style>
    </div>
  );
}

// `part` splits this in two so the IA can put them on different screens:
//   'workspace' — owner-only client administration (stays under Account)
//   'domains'   — the tenant's own website + custom domain (its own Settings tab)
// Default 'all' keeps the original combined rendering.
// `session` was dropped when the standalone create-workspace form went away — it
// was only used to self-enrol the creator, which the Section F trigger now does.
function TenantAdminSection({ lang, part = 'settings' }) {
  const confirm = useConfirm();
  const { tenant, setTenant, reloadTenants, isOwner } = useTenant();
  const ar = lang === 'ar';

  // Invite a NEW client login (owner-only, via the invite-client Edge Function).
  const [invEmail, setInvEmail] = useState('');
  const [invUser, setInvUser] = useState('');
  const [invBusy, setInvBusy] = useState(false);
  const [invMsg, setInvMsg] = useState('');
  const [invErr, setInvErr] = useState('');
  // The workspace this invite will create. Slug is derived from the name until the
  // owner edits it, so the common case is two fields, not four.
  const [invName, setInvName] = useState('');
  const [invSlug, setInvSlug] = useState('');
  const [invSlugTouched, setInvSlugTouched] = useState(false);
  const invSlugPreview = normalizeSlug(invSlug || invName);
  // Credentials to hand to the client. Held only in memory, shown once.
  const [invCreds, setInvCreds] = useState(null);
  const [invCopied, setInvCopied] = useState(false);
  // Inviting a client CREATES THAT CLIENT'S OWN WORKSPACE. It used to attach them to
  // whichever workspace happened to be selected in the switcher, which meant an
  // invite silently added someone to an unrelated client's site and no new workspace
  // ever appeared — the owner reasonably assumed something was broken.
  //
  // A client is a separate site, so onboarding one is: make their workspace, then
  // give them a login to it. Those are one action, not two.
  async function inviteClient(e) {
    e.preventDefault();
    setInvErr(''); setInvMsg('');

    const s = normalizeSlug(invSlug || invName);
    if (!s) { setInvErr(ar ? 'أدخل معرّفًا صالحًا للمساحة' : 'Enter a valid workspace slug'); return; }
    if (RESERVED_SLUGS.includes(s)) {
      setInvErr(ar ? 'هذا المعرّف محجوز، اختر غيره' : 'That slug is reserved — pick another');
      return;
    }

    setInvBusy(true);
    let created = null; // the workspace THIS call made, for rollback
    try {
      // 1) The client's own workspace.
      const { data: tRow, error: tErr } = await supabase.from('tenants')
        .insert({ slug: s, name: invName.trim() || s, default_lang: 'ar', status: 'active' })
        .select().single();
      if (tErr) {
        // A duplicate slug is the common case and the message is cryptic.
        const dup = String(tErr.message || '').toLowerCase().includes('duplicate');
        setInvErr(dup
          ? (ar ? 'هذا المعرّف مستخدم بالفعل' : 'That slug is already taken')
          : (tErr.message || String(tErr)));
        return;
      }
      created = tRow;

      // 2) Its profile row. The Section F trigger has already enrolled every
      //    platform owner on this tenant, so this write is permitted.
      const { error: pErr } = await supabase.from('profile')
        .insert({ tenant_id: tRow.id, default_lang: 'ar' });
      if (pErr) { setInvErr(pErr.message || String(pErr)); return; }

      // 3) The client's login, scoped to the workspace we just made.
      //    supabase.functions.invoke attaches the owner's session JWT; the function
      //    verifies is_platform_owner server-side before doing anything.
      //    No redirect_to any more: the function creates the account WITH a password
      //    and returns it, instead of emailing a one-time link.
      const { data, error } = await supabase.functions.invoke('invite-client', {
        body: {
          tenant_id: tRow.id,
          email: invEmail.trim(),
          username: invUser.trim(),
        },
      });
      if (error) {
        // The function returns BOTH a machine code ("invite_failed") and a
        // `detail` carrying the real reason from Supabase. Showing only the code
        // made every failure read as an unexplained "invite_failed" — including
        // the email rate limit, which is the most common cause and the one an
        // owner can actually act on. Prefer detail, fall back to the code.
        let msg = error.message;
        try {
          const b = await error.context?.json?.();
          if (b?.detail) msg = `${b.error || 'invite_failed'}: ${b.detail}`;
          else if (b?.error) msg = b.error;
        } catch (_) {}
        setInvErr(msg || (ar ? 'فشلت الدعوة' : 'Invite failed'));
        return;
      }
      if (data?.error) { setInvErr(data.detail ? `${data.error}: ${data.detail}` : data.error); return; }

      created = null; // succeeded — do not roll back

      // The password is shown ONCE, here. It is not stored and not emailed, so if
      // this is dismissed without copying it the only way back is a reset.
      setInvCreds({
        workspace: tRow.name || tRow.slug,
        email: data?.email || invEmail.trim(),
        username: data?.username || invUser.trim(),
        password: data?.temp_password || '',
        // The function reports whether it actually delivered. It never fails the
        // request over email, so this can be false while everything else succeeded.
        emailed: data?.emailed === true,
        emailError: data?.email_error || null,
      });
      setInvEmail(''); setInvUser(''); setInvName(''); setInvSlug('');
      setInvMsg('');
      await reloadTenants();
      setTenant(tRow); // land the owner on the workspace they just made
      try { localStorage.setItem('admin_selected_tenant', String(tRow.id)); } catch (_) {}
    } catch (err) {
      console.error('[invite] failed:', err);
      setInvErr(ar ? 'فشلت الدعوة' : 'Invite failed');
    } finally {
      // KEEP a workspace whose invite failed, and say so.
      //
      // This used to roll the workspace back, which was right while a separate
      // "create workspace" form existed. It is now the ONLY way to create one, so
      // deleting it whenever the email step fails — the step that fails most often
      // right now — would mean no workspace could be created at all until email is
      // fixed. Better to state plainly what exists and what did not happen; "Delete
      // workspace" in settings undoes it in one click.
      if (created) {
        setInvErr((prev) => `${prev} — ${ar
          ? `لكن مساحة «${created.slug}» أُنشئت بنجاح. أصلح البريد ثم أعد الدعوة، أو احذف المساحة من إعداداتها.`
          : `The workspace "${created.slug}" WAS created. Fix email then invite again, or delete it in Workspace settings.`}`);
        await reloadTenants();
        setTenant(created);
        try { localStorage.setItem('admin_selected_tenant', String(created.id)); } catch (_) {}
      }
      setInvBusy(false);
    }
  }

  // Workspace settings for the ACTIVE tenant: rename, change slug, suspend/reactivate.
  // Suspending sets status='disabled' — the public resolver then 404s that tenant's
  // domain instead of falling back to another tenant's portfolio.
  const [wsName, setWsName] = useState('');
  const [wsSlug, setWsSlug] = useState('');
  const [wsBusy, setWsBusy] = useState(false);
  const [wsMsg, setWsMsg] = useState('');
  const [wsErr, setWsErr] = useState('');
  useEffect(() => {
    setWsName(tenant?.name || '');
    setWsSlug(tenant?.slug || '');
    setWsMsg(''); setWsErr('');
  }, [tenant]);

  async function saveWorkspace(e) {
    e.preventDefault();
    setWsErr(''); setWsMsg('');
    if (!tenant) return;
    const s = normalizeSlug(wsSlug);
    if (!s) { setWsErr(ar ? 'أدخل معرّفًا صالحًا' : 'Enter a valid slug'); return; }
    if (RESERVED_SLUGS.includes(s)) { setWsErr(ar ? 'هذا المعرّف محجوز' : 'That slug is reserved'); return; }
    setWsBusy(true);
    const { error } = await supabase.from('tenants')
      .update({ name: wsName.trim() || s, slug: s }).eq('id', tenant.id);
    setWsBusy(false);
    if (error) { setWsErr(error.message || String(error)); return; }
    setWsMsg(ar ? 'تم الحفظ' : 'Saved');
    await reloadTenants();
  }

  async function toggleStatus() {
    if (!tenant) return;
    const disabling = tenant.status !== 'disabled';
    const warn = ar
      ? 'تعليق هذه المساحة سيجعل موقع العميل غير متاح (404). متابعة؟'
      : "Suspending this workspace makes the client's site unavailable (404). Continue?";
    if (disabling) {
      const ok = await confirm({
        title: ar ? 'تعليق مساحة العمل؟' : 'Suspend workspace?',
        description: warn,
        confirmLabel: ar ? 'تعليق' : 'Suspend',
        cancelLabel: ar ? 'إلغاء' : 'Cancel',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setWsErr(''); setWsMsg(''); setWsBusy(true);
    const { error } = await supabase.from('tenants')
      .update({ status: disabling ? 'disabled' : 'active' }).eq('id', tenant.id);
    setWsBusy(false);
    if (error) { setWsErr(error.message || String(error)); return; }
    setWsMsg(disabling ? (ar ? 'تم التعليق' : 'Suspended') : (ar ? 'تم التفعيل' : 'Reactivated'));
    await reloadTenants();
  }

  // PERMANENTLY delete the active workspace. Distinct from "Delete portfolio" in
  // Account, which only CLEARS a workspace's content and leaves the workspace itself —
  // which is why a suspended demo workspace kept reappearing in the switcher with no
  // way to get rid of it.
  //
  // Every table referencing tenants is ON DELETE CASCADE (profile, projects,
  // tenant_admins, tenant_domains, analytics_events), so one delete removes the lot.
  // RLS already restricts this to platform owners.
  async function deleteWorkspace() {
    if (!tenant) return;
    const label = tenant.name || tenant.slug;
    // Require the SLUG, not a generic word: the switcher means the active workspace
    // is often not the one you were last looking at, and this is unrecoverable.
    const ok = await confirm({
      title: ar ? 'حذف مساحة العمل نهائيًا؟' : 'Delete workspace permanently?',
      description: ar
        ? `سيؤدي هذا إلى حذف «${label}» بالكامل: الملف الشخصي والمشاريع والنطاقات والإحصائيات ووصول العميل. لا يمكن التراجع. لن يُحذف حساب دخول العميل، فقد يكون مرتبطًا بمساحات أخرى.`
        : `This permanently deletes "${label}" and everything in it: profile, projects, domains, analytics and client access. It cannot be undone. The client's LOGIN is not deleted — they may belong to other workspaces.`,
      requireText: tenant.slug,
      // Inlined rather than t('type_to_confirm'): this component takes `lang` and
      // builds its strings from `ar`, it has no translator in scope.
      requireTextLabel: ar ? `اكتب «${tenant.slug}» للتأكيد` : `Type "${tenant.slug}" to confirm`,
      confirmLabel: ar ? 'حذف نهائي' : 'Delete forever',
      cancelLabel: ar ? 'إلغاء' : 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;

    setWsErr(''); setWsMsg(''); setWsBusy(true);
    const doomed = tenant;
    try {
      // Delete the tenant FIRST, then clean storage. The other order risks wiping a
      // live workspace's images and then failing to delete it; orphaned files are a
      // far cheaper mistake than deleted files for a workspace that still exists.
      const { data, error } = await supabase.from('tenants').delete().eq('id', doomed.id).select('id');
      if (error) { setWsErr(error.message || String(error)); return; }
      if (!data || data.length === 0) { setWsErr(BLOCKED_WRITE_ERROR.message); return; }

      // Best effort: the tenant is already gone, so a failure here leaves unreachable
      // files, not a broken workspace. Never let it surface as a failed delete.
      try {
        const prefix = `t-${doomed.id}`;
        const { data: files } = await supabase.storage.from('media').list(prefix, { limit: 1000 });
        if (files && files.length) {
          await supabase.storage.from('media').remove(files.map((f) => `${prefix}/${f.name}`));
        }
      } catch (storageErr) {
        console.warn('[tenant] workspace deleted; storage cleanup failed:', storageErr);
      }

      // Drop the remembered selection so the switcher cannot reopen a dead workspace.
      try {
        if (localStorage.getItem('admin_selected_tenant') === String(doomed.id)) {
          localStorage.removeItem('admin_selected_tenant');
        }
      } catch (_) {}
      setTenant(null);
      await reloadTenants();
      setWsMsg(ar ? 'تم حذف المساحة' : 'Workspace deleted');
    } catch (err) {
      console.error('[tenant] delete failed:', err);
      setWsErr(err?.message || (ar ? 'فشل الحذف' : 'Delete failed'));
    } finally {
      setWsBusy(false);
    }
  }


  return (
    // Every other editor wraps itself in .editor and mounts AdminStyles; this one
    // never did, because it was always rendered INSIDE AccountEditor's wrapper. Moving
    // it onto its own tab exposed that: unstyled native inputs and no spacing.
    <div className="editor">
      {/* Workspace settings for the ACTIVE workspace. Lives on the Workspace tab,
          NOT on Account — Account is about YOUR login, and stacking a client's
          workspace controls above your own password change is what made this
          screen unreadable. */}
      {isOwner && part === 'settings' && (
      <>
      {tenant && (
        <>
          <h2>{ar ? 'إعدادات المساحة' : 'Workspace settings'} <span className="meta">· {tenant.status === 'disabled' ? (ar ? 'معلّقة' : 'suspended') : (ar ? 'نشطة' : 'active')}</span></h2>
          <form onSubmit={saveWorkspace} style={{ maxWidth: 500 }}>
            <Field id="ws-name" label={ar ? 'الاسم' : 'Name'}>
              <input id="ws-name" type="text" value={wsName} onChange={(e) => setWsName(e.target.value)} />
            </Field>
            <Field id="ws-slug" label={ar ? 'المعرّف (slug)' : 'Slug'}>
              <input id="ws-slug" type="text" dir="ltr" value={wsSlug} onChange={(e) => setWsSlug(e.target.value)} />
            </Field>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <Button type="submit" loading={wsBusy}>{ar ? 'حفظ' : 'Save'}</Button>
              <Button variant="secondary" size="sm" onClick={toggleStatus} disabled={wsBusy}>
                {tenant.status === 'disabled' ? (ar ? 'إعادة التفعيل' : 'Reactivate') : (ar ? 'تعليق المساحة' : 'Suspend workspace')}
              </Button>
              {/* type="button": this sits inside the settings form, and a bare button
                  would submit it — saving the workspace instead of deleting it. */}
              <Button type="button" variant="danger" size="sm" onClick={deleteWorkspace} disabled={wsBusy}>
                {ar ? 'حذف المساحة' : 'Delete workspace'}
              </Button>
            </div>
          </form>
          <p className="hint">{ar
            ? 'التعليق يوقف الموقع مؤقتًا ويمكن التراجع عنه. الحذف نهائي ويشمل المشاريع والنطاقات والإحصائيات.'
            : 'Suspending takes the site offline and is reversible. Deleting is permanent and includes projects, domains and analytics.'}</p>
          {wsErr && <div className="ts-err">{wsErr}</div>}
          {wsMsg && <div className="ts-ok">{wsMsg} ✓</div>}
        </>
      )}

      </>
      )}

      {/* Onboarding: shown on its own, inside the Clients screen's modal. */}
      {isOwner && part === 'onboard' && (
      <>
      <h2>{ar ? 'إضافة عميل' : 'Add a client'}</h2>
      <p className="hint">{ar
        ? 'ينشئ مساحة عمل خاصة بهذا العميل وحسابًا بكلمة مرور. ستظهر لك كلمة المرور مرة واحدة لترسلها له — لا يُرسَل أي بريد.'
        : "Creates this client's own workspace and an account with a password. You'll be shown the password once to pass on — no email is sent."}</p>
      <form onSubmit={inviteClient} style={{ maxWidth: 500 }}>
        <Field id="inv-name" label={ar ? 'اسم العميل / المساحة' : 'Client / workspace name'}>
          <input
            id="inv-name" type="text" value={invName}
            onChange={(e) => { setInvName(e.target.value); if (!invSlugTouched) setInvSlug(''); }}
            placeholder={ar ? 'أكمي ستوديو' : 'Acme Studio'}
          />
        </Field>
        <Field id="inv-slug" label={ar ? 'المعرّف (رابط الموقع)' : 'Slug (site address)'}>
          <input
            id="inv-slug" type="text" dir="ltr"
            value={invSlug || (invSlugTouched ? '' : invSlugPreview)}
            onChange={(e) => { setInvSlugTouched(true); setInvSlug(e.target.value); }}
            placeholder="acme-studio"
          />
        </Field>
        {invSlugPreview && (
          <p className="hint" dir="ltr" style={{ marginTop: -4 }}>/{invSlugPreview}</p>
        )}
        <Field id="inv-email" label={ar ? 'البريد الإلكتروني' : 'Email'}>
          <input id="inv-email" type="email" dir="ltr" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="client@email.com" />
        </Field>
        <Field id="inv-user" label={ar ? 'اسم المستخدم' : 'Username'}>
          <input id="inv-user" type="text" dir="ltr" value={invUser} onChange={(e) => setInvUser(e.target.value)} placeholder="client" />
        </Field>
        {invErr && <div className="ts-err">{invErr}</div>}
        {invMsg && <div className="ts-ok">{invMsg} ✓</div>}
        <Button type="submit" loading={invBusy} style={{ marginTop: 12 }}>
          {ar ? 'إنشاء المساحة والحساب' : 'Create workspace & account'}
        </Button>
      </form>

      {invCreds && (
        <div className="creds">
          <h3>{ar ? `جاهز — مساحة «${invCreds.workspace}»` : `Ready — workspace "${invCreds.workspace}"`}</h3>
          <p className="hint">{invCreds.emailed
            ? (ar
              ? `تم إرسال التفاصيل تلقائيًا إلى ${invCreds.email}. تظهر هنا أيضًا في حال لم تصله.`
              : `Details were emailed automatically to ${invCreds.email}. Shown here too, in case it never arrives.`)
            : (ar
              ? 'لم يُرسَل بريد — أرسل هذه البيانات للعميل بنفسك. لن تظهر كلمة المرور مرة أخرى، وسيُطلب منه تغييرها عند أول تسجيل دخول.'
              : 'No email was sent — pass these to the client yourself. The password is not shown again, and they must change it on first sign-in.')}</p>
          {!invCreds.emailed && invCreds.emailError && invCreds.emailError !== 'not_configured' && (
            <p className="hint" style={{ opacity: 0.75 }} dir="ltr">{invCreds.emailError}</p>
          )}
          <div className="creds-row"><span>{ar ? 'اسم المستخدم' : 'Username'}</span><code dir="ltr">{invCreds.username}</code></div>
          <div className="creds-row"><span>{ar ? 'كلمة المرور' : 'Password'}</span><code dir="ltr">{invCreds.password}</code></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button
              type="button" size="sm"
              onClick={async () => {
                const text = ar
                  ? `رابط الدخول: ${adminRedirectUrl()}\nاسم المستخدم: ${invCreds.username}\nكلمة المرور: ${invCreds.password}`
                  : `Sign in: ${adminRedirectUrl()}\nUsername: ${invCreds.username}\nPassword: ${invCreds.password}`;
                try {
                  await navigator.clipboard.writeText(text);
                  setInvCopied(true);
                  setTimeout(() => setInvCopied(false), 2000);
                } catch (_) { /* clipboard blocked — the values are on screen to copy by hand */ }
              }}
            >
              {invCopied ? (ar ? 'تم النسخ ✓' : 'Copied ✓') : (ar ? 'نسخ التفاصيل' : 'Copy details')}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setInvCreds(null); setInvCopied(false); }}>
              {ar ? 'تم' : 'Done'}
            </Button>
          </div>
        </div>
      )}

      </>
      )}


      {(part === 'settings' || part === 'domains') && (
      <>
      <h2>{ar ? 'موقعك والنطاق' : 'Your website & domain'} <span className="meta">· {tenant?.name || tenant?.slug || (ar ? 'لا توجد مساحة' : 'no workspace')}</span></h2>
      <p className="hint">{ar
        ? `موقعك متاح دائمًا على /${tenant?.slug || 'slug'}. اربط نطاقك المخصص في ثلاث خطوات: أضِف النطاق، أضِف سجل DNS، ثم تحقّق.`
        : `Your site is always live at /${tenant?.slug || 'slug'}. Connect a custom domain in three steps: add it, add the DNS record, then verify.`}</p>
      <DomainManager lang={lang} isOwner={isOwner} />
      </>
      )}

      <style jsx>{`
        .advanced { max-width: 500px; margin-top: 20px; border-top: 1px solid var(--border); padding-top: 14px; }
        .advanced summary { cursor: pointer; font-size: 13px; color: var(--text-secondary); user-select: none; }
        .advanced summary:hover { color: var(--text-primary); }
        .advanced[open] summary { margin-bottom: 8px; }
        .creds { max-width: 500px; margin-top: 16px; padding: 16px; background: var(--success-bg); border: 1px solid var(--success-border); border-radius: var(--radius-md); }
        .creds h3 { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
        .creds-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); font-size: 13px; }
        .creds-row span { color: var(--text-secondary); }
        .creds-row code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; color: var(--text-primary); user-select: all; }
        .ts-err { padding: 8px 12px; background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); border-radius: var(--radius-md); font-size: 12px; margin-top: 8px; }
        .ts-ok { padding: 8px 12px; background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); border-radius: var(--radius-md); font-size: 12px; margin-top: 8px; }
      `}</style>
      <AdminStyles />
    </div>
  );
}

// ---- Client onboarding: completion is DERIVED from existing data (no new tables) ----
function hasBilingualText(v) { return !!(v && (String(v.ar || '').trim() || String(v.en || '').trim())); }
function computeSetup({ profile, projectCount, domainCount }) {
  const p = profile || {};
  const items = [
    { key: 'photo',   tab: 'profile',    done: !!(p.profile_image || p.brand_logo) },
    { key: 'bio',     tab: 'profile',    done: hasBilingualText(p.bio) },
    { key: 'project', tab: 'projects',   done: (projectCount || 0) > 0 },
    { key: 'links',   tab: 'links',      done: (p.custom_links || []).length > 0 },
    { key: 'theme',   tab: 'appearance', done: !!p.appearance },
    { key: 'domain',  tab: 'account',    done: (domainCount || 0) > 0 },
    { key: 'publish', tab: 'profile',    done: hasBilingualText(p.name) },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, percent: Math.round((done / items.length) * 100) };
}

// Reusable, client-only, mobile-friendly checklist. Each row opens the relevant tab.
// The guided build-your-website checklist.
//
// This replaced a flat list of seven labels. Labels tell someone WHICH BUTTON to
// press, and that was never where clients got stuck — they got stuck on what to
// actually write in the box. Each step now carries why it matters, the concrete
// actions in order, and what "good" looks like, from lib/onboarding-guide.js.
//
// Progressive disclosure: exactly ONE step is expanded — the first unfinished one —
// so the screen reads as "here is your next move", not as a wall of instructions.
// Finished steps collapse to a tick. Any step can still be opened by clicking it.
function WebsiteGuide({ doneMap, onNavigate, lang }) {
  const ar = lang === 'ar';
  const next = nextStep(doneMap);
  // Opening on the next unfinished step, but tracked in state so the client can read
  // ahead or revisit something already done.
  const [openId, setOpenId] = useState(next ? next.id : null);
  const pick2 = (v) => (ar ? v.ar : v.en);

  return (
    <div className="wg">
      {GUIDE_STEPS.map((step, i) => {
        const done = !!doneMap[step.id];
        const open = openId === step.id;
        return (
          <Card key={step.id} pad="none" className={`wg-step ${done ? 'done' : ''} ${open ? 'open' : ''}`}>
            <button
              type="button"
              className="wg-head"
              onClick={() => setOpenId(open ? null : step.id)}
              aria-expanded={open}
            >
              <span className="wg-mark">{done ? '✓' : i + 1}</span>
              <span className="wg-title">{pick2(step.title)}</span>
              {!done && next && next.id === step.id && (
                <span className="wg-next">{ar ? 'التالي' : 'Next'}</span>
              )}
              <span className="wg-chev">{open ? '▾' : (ar ? '‹' : '›')}</span>
            </button>

            {open && (
              <div className="wg-body">
                <p className="wg-why">{pick2(step.why)}</p>
                <ol className="wg-how">
                  {pick2(step.how).map((line, n) => <li key={n}>{line}</li>)}
                </ol>
                <p className="wg-tip"><strong>{ar ? 'نصيحة' : 'Tip'}</strong> · {pick2(step.tip)}</p>
                <Button size="sm" onClick={() => onNavigate(step.tab)}>
                  {done
                    ? (ar ? 'تعديل' : 'Edit this')
                    : (ar ? 'ابدأ الآن' : 'Do this now')}
                </Button>
              </div>
            )}
          </Card>
        );
      })}
      <style jsx>{`
        .wg { display: flex; flex-direction: column; gap: 8px; max-width: 640px; }
        .wg-head {
          display: flex; align-items: center; gap: 12px; width: 100%;
          padding: 13px 14px; min-height: 48px;
          background: none; border: none; cursor: pointer;
          font-family: inherit; font-size: var(--text-md); color: inherit; text-align: inherit;
        }
        .wg-mark {
          width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%;
          border: 1.5px solid var(--border-strong);
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 600; color: var(--text-tertiary);
        }
        .wg-step.done .wg-mark { background: var(--accent); border-color: var(--accent); color: #fff; }
        .wg-step.done .wg-title { color: var(--text-tertiary); }
        .wg-title { flex: 1; font-weight: 500; }
        .wg-next {
          font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
          color: var(--accent); border: 1px solid var(--accent);
          border-radius: 999px; padding: 2px 8px; flex-shrink: 0;
        }
        .wg-chev { color: var(--text-muted); font-size: 16px; flex-shrink: 0; }
        .wg-body { padding: 0 14px 16px; border-top: 1px solid var(--border); margin-top: -1px; }
        .wg-why { font-size: 13px; line-height: 1.7; color: var(--text-secondary); margin: 14px 0 12px; }
        .wg-how { margin: 0 0 12px; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 6px; }
        .wg-how li { font-size: 13px; line-height: 1.6; color: var(--text-primary); }
        .wg-tip {
          font-size: 12px; line-height: 1.6; color: var(--text-secondary);
          background: var(--bg-elevated); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: 10px 12px; margin: 0 0 14px;
        }
        .wg-tip strong { color: var(--accent); }
      `}</style>
    </div>
  );
}

// Client home / welcome screen — status, URL, completion, quick actions, checklist.
function ClientHome({ lang, onNavigate }) {
  const { tenant } = useTenant();
  const ar = lang === 'ar';
  const [profile, setProfile] = useState(null);
  const [projectCount, setProjectCount] = useState(0);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: p } = await loadProfile(tenant);
      let pc = 0, dm = [];
      if (tenant) {
        const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
        pc = count || 0;
        const { data: d } = await supabase.from('tenant_domains').select('domain,is_primary,status').eq('tenant_id', tenant.id);
        dm = d || [];
      }
      if (!cancelled) { setProfile(p || {}); setProjectCount(pc); setDomains(dm); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenant]);

  const setup = computeSetup({ profile, projectCount, domainCount: domains.length });
  const name = pick(profile?.name, lang) || pick(profile?.name, 'en') || '';
  const primary = domains.find((d) => d.is_primary) || domains[0];
  const slugUrl = tenant ? `/${tenant.slug}` : '/';
  const publicUrl = primary ? `https://${primary.domain}` : slugUrl;
  const active = (tenant?.status || 'active') !== 'disabled';

  return (
    <div className="editor">
      <h1>{name ? (ar ? `مرحبًا ${name} 👋` : `Welcome, ${name} 👋`) : (ar ? 'مرحبًا بك في منشئ موقعك 👋' : 'Welcome to your portfolio builder 👋')}</h1>
      <p className="hint">{ar ? 'موقعك جاهز ومباشر. أكمل الخطوات التالية لجعله رائعًا.' : 'Your website is ready and live. Complete the steps below to make it shine.'}</p>

      <div className="ch-grid">
        <Card pad="sm" className="ch-card">
          <div className="ch-label">{ar ? 'حالة الموقع' : 'Website status'}</div>
          <div className="ch-status">
            <Badge tone={active ? 'success' : 'danger'} dot>
              {active ? (ar ? 'مباشر' : 'Active') : (ar ? 'معلّق' : 'Suspended')}
            </Badge>
          </div>
        </Card>
        <Card pad="sm" className="ch-card">
          <div className="ch-label">{ar ? 'رابط موقعك' : 'Your website'}</div>
          <a className="ch-url" href={publicUrl} target="_blank" rel="noopener noreferrer" dir="ltr">{primary ? primary.domain : slugUrl}</a>
          {primary ? (
            <div className="ch-sub"><DomainStatusBadge status={primary.status} ar={ar} /></div>
          ) : (
            <button type="button" className="ch-link" onClick={() => onNavigate('account')}>
              {ar ? 'اربط نطاقك المخصص ←' : 'Connect a custom domain →'}
            </button>
          )}
        </Card>
        <Card pad="sm" className="ch-card">
          <div className="ch-label">{ar ? 'الاكتمال' : 'Completion'}</div>
          <div className="ch-status">{loading ? '—' : `${setup.percent}%`}</div>
          <div className="ch-bar"><div className="ch-bar-fill" style={{ width: `${loading ? 0 : setup.percent}%` }} /></div>
        </Card>
      </div>

      <h2>{ar ? 'إجراءات سريعة' : 'Quick actions'}</h2>
      <div className="ch-actions">
        <button className="ch-action" onClick={() => onNavigate('profile')}>👤 {ar ? 'تعديل الملف' : 'Edit profile'}</button>
        <button className="ch-action" onClick={() => onNavigate('projects')}>📁 {ar ? 'إضافة مشروع' : 'Add project'}</button>
        <button className="ch-action" onClick={() => onNavigate('appearance')}>🎨 {ar ? 'تخصيص التصميم' : 'Customize design'}</button>
        <button className="ch-action" onClick={() => onNavigate('account')}>🌐 {ar ? 'ربط نطاق' : 'Connect domain'}</button>
      </div>

      <h2>{ar ? 'أكمل موقعك' : 'Complete your website'} <span className="meta">· {loading ? '…' : `${setup.done}/${setup.total}`}</span></h2>
      {!loading && (
        <>
          {/* Progress before the steps: seeing a filled bar is what makes the
              remaining work feel finite rather than open-ended. */}
          <div className="ch-progress" aria-hidden="true">
            <div className="ch-progress-fill" style={{ width: `${setup.percent}%` }} />
          </div>
          <p className="hint" style={{ marginBottom: 14 }}>{
            setup.done === setup.total
              ? (ar ? 'اكتمل كل شيء. موقعك جاهز تمامًا للمشاركة 🎉' : 'Everything is done. Your site is ready to share 🎉')
              : (ar
                ? 'كل خطوة تشرح سبب أهميتها وكيف تنفّذها. ابدأ بالخطوة المفتوحة — هي التالية.'
                : 'Each step explains why it matters and exactly how to do it. Start with the open one — that is your next move.')
          }</p>
          <WebsiteGuide
            doneMap={Object.fromEntries(setup.items.map((i) => [i.key, i.done]))}
            onNavigate={onNavigate}
            lang={lang}
          />
        </>
      )}

      <AdminStyles />
      <style jsx>{`
        .ch-progress { height: 6px; border-radius: 999px; background: var(--bg-elevated); border: 1px solid var(--border); max-width: 640px; overflow: hidden; margin-bottom: 10px; }
        .ch-progress-fill { height: 100%; background: var(--accent); transition: width 0.4s ease; }
        .ch-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; max-width: 640px; margin-bottom: var(--space-5); }
        /* surface comes from Card */
        .ch-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 6px; }
        :global(html[dir="rtl"]) .ch-label { text-transform: none; letter-spacing: normal; }
        .ch-status { font-size: 18px; font-weight: 700; }
        .ch-url { font-size: 14px; font-weight: 600; color: var(--accent); text-decoration: none; word-break: break-all; }
        .ch-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
        .ch-link { margin-top: 6px; padding: 0; background: none; border: none; color: var(--accent); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; text-align: start; }
        .ch-bar { height: 6px; background: var(--bg-elevated); border-radius: 999px; margin-top: 8px; overflow: hidden; }
        .ch-bar-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width .3s ease; }
        .ch-actions { display: flex; flex-wrap: wrap; gap: 8px; max-width: 640px; margin-bottom: var(--space-4); }
        .ch-action { padding: 11px 14px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; color: var(--text-primary); min-height: 44px; }
        .ch-action:hover { border-color: var(--border-strong); }
      `}</style>
    </div>
  );
}

// Owner-only simple overview: name, domain, status, completion. Click to open.
function OwnerClientsOverview({ lang, onOpen }) {
  const { tenants } = useTenant();
  const ar = lang === 'ar';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [resettingId, setResettingId] = useState(null);
  const [resetCreds, setResetCreds] = useState(null);
  const [resetErr, setResetErr] = useState('');
  const [resetCopied, setResetCopied] = useState(false);
  const confirm = useConfirm();

  // Recovery path for a client who lost their password. Without this the only fix was
  // deleting the workspace and rebuilding it, which loses their site — and a reset
  // EMAIL is not an option while SMTP is unconfigured.
  async function resetPassword(row) {
    const m = row.member;
    if (!m) return;
    const ok = await confirm({
      title: ar ? 'إعادة تعيين كلمة المرور؟' : 'Reset this password?',
      description: ar
        ? `سيتم إنشاء كلمة مرور جديدة لـ ${m.email}. كلمتهم الحالية ستتوقف فورًا، وستظهر لك الجديدة مرة واحدة لترسلها لهم.`
        : `A new password will be generated for ${m.email}. Their current one stops working immediately, and you will be shown the new one once to pass on.`,
      confirmLabel: ar ? 'إعادة التعيين' : 'Reset',
      cancelLabel: ar ? 'إلغاء' : 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    setResetErr(''); setResetCreds(null); setResettingId(m.user_id);
    try {
      const { data, error } = await supabase.functions.invoke('reset-client-password', {
        body: { user_id: m.user_id },
      });
      if (error) {
        let msg = error.message;
        try {
          const b = await error.context?.json?.();
          if (b?.detail) msg = `${b.error || 'reset_failed'}: ${b.detail}`;
          else if (b?.error) msg = b.error;
        } catch (_) {}
        setResetErr(msg || (ar ? 'فشلت إعادة التعيين' : 'Reset failed'));
        return;
      }
      if (data?.error) { setResetErr(data.detail ? `${data.error}: ${data.detail}` : data.error); return; }
      setResetCreds({
        workspace: row.name,
        email: data?.email || m.email,
        username: data?.username || m.username,
        password: data?.temp_password || '',
      });
    } catch (err) {
      console.error('[reset] failed:', err);
      setResetErr(ar ? 'فشلت إعادة التعيين' : 'Reset failed');
    } finally {
      setResettingId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ids = tenants.map((x) => x.id);
      if (ids.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }
      const [{ data: profiles }, { data: projects }, { data: domains }, { data: members }] = await Promise.all([
        supabase.from('profile').select('tenant_id,name,bio,profile_image,brand_logo,custom_links,appearance').in('tenant_id', ids),
        supabase.from('projects').select('tenant_id').in('tenant_id', ids),
        supabase.from('tenant_domains').select('tenant_id,domain,is_primary').in('tenant_id', ids),
        // Which email belongs to which workspace. Has to be an RPC: tenant_admins and
        // admin_usernames are both readable only for your OWN rows, so the browser
        // cannot join a workspace to its client. Owner-gated inside the function, and
        // it never returns platform owners — only clients.
        supabase.rpc('list_workspace_members'),
      ]);
      const pcount = {}; (projects || []).forEach((p) => { pcount[p.tenant_id] = (pcount[p.tenant_id] || 0) + 1; });
      const pmap = {}; (profiles || []).forEach((p) => { pmap[p.tenant_id] = p; });
      const dmap = {}; (domains || []).forEach((d) => { (dmap[d.tenant_id] = dmap[d.tenant_id] || []).push(d); });
      const mmap = {}; (members || []).forEach((m) => { mmap[m.tenant_id] = m; });
      const out = tenants.map((x) => {
        const s = computeSetup({ profile: pmap[x.id], projectCount: pcount[x.id] || 0, domainCount: (dmap[x.id] || []).length });
        const dom = (dmap[x.id] || []).find((d) => d.is_primary) || (dmap[x.id] || [])[0];
        return {
          id: x.id, name: x.name || x.slug, status: x.status, percent: s.percent,
          domain: dom?.domain || `/${x.slug}`,
          domainStatus: dom ? dom.status : null,
          isPrimary: !!dom?.is_primary,
          member: mmap[x.id] || null,
        };
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (!cancelled) { setRows(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenants, adding]);

  return (
    <div className="editor">
      {/* One list, one primary action. Onboarding used to live at the bottom of the
          Account screen, under this person's own password change, which is why
          nobody could find it or tell the two apart. */}
      <div className="editor-header">
        <h1>{ar ? 'العملاء' : 'Clients'} <span className="meta">· {rows.length}</span></h1>
        <Button size="sm" onClick={() => setAdding(true)}>+ {ar ? 'إضافة عميل' : 'Add client'}</Button>
      </div>
      <p className="hint">{ar
        ? 'كل عميل له مساحته وموقعه. اضغط على أي عميل لفتح مساحته وتحريرها.'
        : 'Every client has their own workspace and site. Tap a client to open and edit theirs.'}</p>

      {adding && (
        <div className="add-bg" onClick={() => setAdding(false)}>
          <div className="add-panel" onClick={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
            <button type="button" className="add-close" onClick={() => setAdding(false)} aria-label={ar ? 'إغلاق' : 'Close'}>×</button>
            <TenantAdminSection lang={lang} part="onboard" />
          </div>
        </div>
      )}
      {resetErr && <div className="ts-err" style={{ maxWidth: 720 }}>{resetErr}</div>}

      {resetCreds && (
        <div className="creds" style={{ marginBottom: 16 }}>
          <h3>{ar ? `كلمة مرور جديدة — ${resetCreds.workspace}` : `New password — ${resetCreds.workspace}`}</h3>
          <p className="hint">{ar
            ? 'كلمتهم القديمة توقّفت الآن. أرسل لهم هذه، وسيُطلب منهم تغييرها عند الدخول. لن تظهر مرة أخرى.'
            : 'Their old password has stopped working. Send them this — they will be asked to change it on sign-in. It is not shown again.'}</p>
          <div className="creds-row"><span>{ar ? 'البريد' : 'Email'}</span><code dir="ltr">{resetCreds.email}</code></div>
          {resetCreds.username && (
            <div className="creds-row"><span>{ar ? 'اسم المستخدم' : 'Username'}</span><code dir="ltr">{resetCreds.username}</code></div>
          )}
          <div className="creds-row"><span>{ar ? 'كلمة المرور' : 'Password'}</span><code dir="ltr">{resetCreds.password}</code></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button
              type="button" size="sm"
              onClick={async () => {
                const text = ar
                  ? `رابط الدخول: ${adminRedirectUrl()}\nاسم المستخدم: ${resetCreds.username || resetCreds.email}\nكلمة المرور: ${resetCreds.password}`
                  : `Sign in: ${adminRedirectUrl()}\nUsername: ${resetCreds.username || resetCreds.email}\nPassword: ${resetCreds.password}`;
                try {
                  await navigator.clipboard.writeText(text);
                  setResetCopied(true);
                  setTimeout(() => setResetCopied(false), 2000);
                } catch (_) { /* clipboard blocked — values are on screen */ }
              }}
            >
              {resetCopied ? (ar ? 'تم النسخ ✓' : 'Copied ✓') : (ar ? 'نسخ التفاصيل' : 'Copy details')}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setResetCreds(null); setResetCopied(false); }}>
              {ar ? 'تم' : 'Done'}
            </Button>
          </div>
        </div>
      )}

      {loading ? <div className="hint">…</div> : rows.length === 0 ? (
        <div className="hint">{ar ? 'لا يوجد عملاء بعد.' : 'No clients yet.'}</div>
      ) : (
        <div className="cl-list">
          {rows.map((r) => (
            /* The row is a DIV, not a button: it now contains its own buttons, and a
               button inside a button is invalid and unclickable in places. */
            <Card key={r.id} pad="none" className="cl-row">
              <button type="button" className="cl-open" onClick={() => onOpen(r.id)}>
                <div className="cl-main">
                  <div className="cl-name">{r.name}</div>
                  <div className="cl-domain" dir="ltr">
                    {r.domainStatus && (
                      <span
                        className={`dotmark ${domainStatusMeta(r.domainStatus, ar).tone}`}
                        title={domainStatusMeta(r.domainStatus, ar).label}
                      />
                    )}
                    {r.domain}{r.isPrimary ? ' ★' : ''}
                  </div>
                  {/* Who this workspace belongs to. Without it, a client who loses
                      their password cannot even be identified from here. */}
                  <div className="cl-who" dir="ltr">
                    {r.member
                      ? <>{r.member.email}{r.member.username ? ` · ${r.member.username}` : ''}</>
                      : <span className="cl-none">{ar ? 'لا يوجد عميل مرتبط' : 'no client account'}</span>}
                  </div>
                </div>
                <Badge tone={r.status === 'disabled' ? 'danger' : 'success'}>
                  {r.status === 'disabled' ? (ar ? 'معلّق' : 'Suspended') : (ar ? 'نشط' : 'Active')}
                </Badge>
                <span className="cl-pct">{r.percent}%</span>
              </button>
              {r.member && (
                <div className="cl-actions">
                  {r.member.must_set_password && (
                    <span className="cl-flag">{ar ? 'لم يغيّر كلمة المرور بعد' : 'password not set yet'}</span>
                  )}
                  <Button
                    type="button" variant="secondary" size="sm"
                    loading={resettingId === r.member.user_id}
                    onClick={() => resetPassword(r)}
                  >
                    {ar ? 'إعادة تعيين كلمة المرور' : 'Reset password'}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <AdminStyles />
      <style jsx>{`
        .add-bg {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.6);
          -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 40px 16px; overflow-y: auto;
        }
        .add-panel {
          position: relative; width: 100%; max-width: 560px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg, 16px);
          padding: 24px; box-shadow: 0 24px 70px rgba(0,0,0,0.5);
        }
        .add-close {
          position: absolute; top: 12px; inset-inline-end: 12px;
          width: 32px; height: 32px; border-radius: 50%;
          background: var(--bg-elevated); border: 1px solid var(--border);
          color: var(--text-secondary); font-size: 20px; line-height: 1;
          cursor: pointer; font-family: inherit;
        }
        .add-close:hover { color: var(--text-primary); }
        .cl-list { display: flex; flex-direction: column; gap: 8px; max-width: 720px; }
        .cl-open { display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px 14px; background: none; border: none; cursor: pointer; font-family: inherit; text-align: inherit; color: inherit; }
        .cl-open:hover .cl-name { color: var(--accent); }
        .cl-who { font-size: 11px; color: var(--text-tertiary); margin-top: 3px; }
        .cl-none { color: var(--text-muted); font-style: italic; }
        .cl-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 0 14px 12px; flex-wrap: wrap; }
        .cl-flag { font-size: 11px; color: var(--warning, var(--text-tertiary)); }
        .creds { max-width: 720px; padding: 16px; background: var(--success-bg); border: 1px solid var(--success-border); border-radius: var(--radius-md); }
        .creds h3 { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
        .creds-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); font-size: 13px; }
        .creds-row span { color: var(--text-secondary); }
        .creds-row code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; color: var(--text-primary); user-select: all; }
        .ts-err { padding: 8px 12px; background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); border-radius: var(--radius-md); font-size: 12px; margin-bottom: 12px; }
        /* surface comes from Card; only the row layout is local */
        .cl-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; min-height: 56px; }
        .cl-main { flex: 1; min-width: 0; }
        .cl-name { font-size: 14px; font-weight: 600; }
        .cl-domain { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* status dot — replaces the 🟢/🟡/🔴 emoji, which rendered differently per OS */
        .dotmark { display: inline-block; width: 7px; height: 7px; margin-inline-end: 6px; border-radius: 50%; vertical-align: middle; }
        .dotmark.success { background: var(--success); }
        .dotmark.warning { background: var(--warning); }
        .dotmark.danger { background: var(--danger); }
        .cl-pct { font-size: 13px; font-weight: 700; color: var(--accent); min-width: 42px; text-align: end; flex-shrink: 0; }
      `}</style>
    </div>
  );
}

function AccountEditor({ t, lang, session, setChromeLang }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [username, setUsername] = useState('');
  const [defaultLang, setDefaultLang] = useState('ar');
  const [savingLang, setSavingLang] = useState(false);
  const [savedLangMsg, setSavedLangMsg] = useState('');

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const { tenant } = useTenant();

  useEffect(() => { load(); }, []);
  async function load() {
    const { data: u } = await supabase.from('admin_usernames').select('username').eq('user_id', session.user.id).maybeSingle();
    if (u?.username) setUsername(u.username);
    const { data: p } = await loadProfile(tenant, 'default_lang');
    if (p?.default_lang) setDefaultLang(p.default_lang);
  }

  async function saveDefaultLang(next) {
    setDefaultLang(next); setSavingLang(true);
    try {
      const { error } = await persistProfile(tenant, { default_lang: next });
      if (!error) {
        setSavedLangMsg(t('saved'));
        // Also flip the admin chrome to match — feels weird if default lang doesn't apply
        if (setChromeLang) setChromeLang(next);
        setTimeout(() => setSavedLangMsg(''), 2000);
      } else { toast.error(t('save_failed')); }
    } catch (err) {
      console.error('[account] save lang failed:', err); toast.error(t('save_failed'));
    } finally { setSavingLang(false); }
  }

  async function updatePassword(e) {
    e.preventDefault();
    setPwdErr(''); setPwdMsg('');
    const policyErr = passwordPolicyError(newPwd, confirmPwd);
    if (policyErr) { setPwdErr(t(policyErr)); return; }
    setPwdLoading(true);
    try {
      const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: session.user.email, password: curPwd });
      if (reAuthErr) { setPwdErr(t('invalid_credentials')); return; }
      // Breach check AFTER re-auth, so an unauthenticated caller cannot use this
      // screen to probe whether an arbitrary password is in the corpus.
      const { pwned } = await isPwnedPassword(newPwd);
      if (pwned) { setPwdErr(t('password_pwned')); return; }
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) setPwdErr(error.message);
      else { setPwdMsg(t('password_updated')); setCurPwd(''); setNewPwd(''); setConfirmPwd(''); setTimeout(() => setPwdMsg(''), 3000); }
    } catch (err) {
      console.error('[account] password change failed:', err);
      setPwdErr(t('save_failed'));
    } finally {
      setPwdLoading(false);
    }
  }

  async function deletePortfolio() {
    // Refuse before the dialog, not after — asking someone to type DELETE and
    // only then telling them nothing was selected is worse than not asking.
    if (!tenant) { toast.error(t('save_failed')); return; }

    // NAME the workspace being cleared. The selector at the top of the dashboard
    // means the active workspace is often not the one you were last looking at,
    // and the old dialog said only "delete portfolio" — so a mistimed switch
    // wiped the wrong client's content with no warning that it was theirs.
    const label = tenant.name || tenant.slug;
    const keyword = t('delete_portfolio_keyword');
    const ok = await confirm({
      title: t('delete_portfolio'),
      description: `${t('delete_portfolio_scope').replace('{name}', label)} ${t('delete_portfolio_warning')}`,
      requireText: keyword,
      requireTextLabel: t('type_to_confirm').replace('{word}', keyword),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
    });
    if (!ok) return;

    // Reset ONLY the selected tenant (guarded above). This once had a "singleton"
    // branch that deleted analytics_events and projects with .neq('id', 0) — a
    // predicate every row matches, so it wiped EVERY tenant's projects and
    // analytics, not just one profile — then blanked profile.id = 1, a live
    // client's row. A destructive reset must name its target.

    // The fields a "reset" clears.
    const reset = {
      name: emptyBilingual(), tagline: emptyBilingual(), bio: emptyBilingual(),
      profile_image: '', brand_logo: '',
      links: {}, custom_links: [], custom_fields: [], banners: [], stats: [], cta_buttons: [],
      appearance: {}, sections: { bio: true, custom_fields: true, projects: true, links: true, lang_switcher: true },
    };

    // Delete ONLY this tenant's rows. NEVER an unscoped delete.
    await supabase.from('analytics_events').delete().eq('tenant_id', tenant.id);
    await supabase.from('projects').delete().eq('tenant_id', tenant.id);
    await supabase.from('profile').update(reset).eq('tenant_id', tenant.id);

    toast.success(t('delete_done'));
    window.location.reload();
  }

  const initial = (username || session.user.email).trim()[0].toUpperCase();

  return (
    <div className="editor">
      <h1>{t('account_title')}</h1>

      <h2>{t('signed_in_as')}</h2>
      <div className="user-card">
        <div className="avatar-lg">{initial}</div>
        <div>
          <div className="user-name">{username || '—'}</div>
          <div className="user-email" dir="ltr">{session.user.email}</div>
        </div>
      </div>

      <h2>{t('default_language')}</h2>
      <p className="hint">{t('default_language_hint')}</p>
      <Field id="def-lang" label="">
        <select id="def-lang" value={defaultLang} onChange={(e) => saveDefaultLang(e.target.value)}>
          <option value="ar">العربية (Arabic)</option>
          <option value="en">English</option>
        </select>
      </Field>
      {savingLang && <span className="hint">...</span>}
      {savedLangMsg && <span className="saved-indicator">{savedLangMsg} ✓</span>}


      <h2>{t('change_password')}</h2>
      <form onSubmit={updatePassword} style={{ maxWidth: 500 }}>
        <Field id="pwd-cur" label={t('current_password')}>
          <input id="pwd-cur" type="password" dir="ltr" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field id="pwd-new" label={t('new_password')}>
          <input id="pwd-new" type="password" dir="ltr" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX_CHARS} />
        </Field>
        <Field id="pwd-conf" label={t('confirm_new_password')}>
          <input id="pwd-conf" type="password" dir="ltr" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX_CHARS} />
        </Field>
        {pwdErr && <div className="err">{pwdErr}</div>}
        {pwdMsg && <div className="ok">{pwdMsg} ✓</div>}
        <Button type="submit" loading={pwdLoading} style={{ marginTop: 12 }}>{t('update_password')}</Button>
      </form>

      <h2 className="danger-heading">{t('danger_zone')}</h2>
      <div className="danger-card">
        <div className="danger-desc">{t('delete_portfolio_desc')}</div>
        <Button variant="danger" size="sm" onClick={deletePortfolio}>{t('delete_portfolio')}</Button>
      </div>

      <AdminStyles />
      <style jsx>{`
        .user-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); max-width: 500px; margin-bottom: var(--space-5); }
        .avatar-lg { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #4f6ef2, #2d47a8); display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; color: #fff; }
        .user-name { font-size: 14px; font-weight: 600; }
        .user-email { font-size: 12px; color: var(--text-tertiary); }
        .danger-card { padding: 16px; background: var(--danger-bg); border: 1px solid var(--danger-border); border-radius: var(--radius-md); max-width: 500px; }
        .danger-heading { color: var(--danger); margin-top: 48px; }
        .danger-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; }
        .err { padding: 8px 12px; background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); border-radius: var(--radius-md); font-size: 12px; margin-top: 8px; }
        .ok { padding: 8px 12px; background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); border-radius: var(--radius-md); font-size: 12px; margin-top: 8px; }
      `}</style>
    </div>
  );
}

// =========================================================
// Shared components
// =========================================================
function Field({ id, label, children }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      <style jsx>{`
        .field { margin-bottom: var(--space-4); }
        label { display: block; font-size: 12px; font-weight: 500; color: var(--text-tertiary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
        :global(html[dir="rtl"]) label { text-transform: none; letter-spacing: normal; }
      `}</style>
    </div>
  );
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

// Returns the failing translation key, or null when the file is acceptable.
// (A module-level function can't call the toast hook, so the CALLER reports it.)
function uploadError(file) {
  if (!file.type || !file.type.startsWith('image/')) return 'upload_not_image';
  if (file.size > MAX_UPLOAD_BYTES) return 'upload_too_large';
  return null;
}

function ImageUpload({ value, onUpload, onClear, aspect, hint, t }) {
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const toast = useToast();
  async function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    const bad = uploadError(file);
    if (bad) { toast.error(t(bad)); return; }
    if (aspect) {
      setCropFile(file);
      return;
    }
    // try/finally so a thrown upload (e.g. network drop) can't leave the control
    // stuck in the uploading state; the error surfaces as a toast.
    setUploading(true);
    try { await onUpload(file); }
    catch (err) { console.error(err); toast.error(t('upload_failed')); }
    finally { setUploading(false); }
  }
  async function handleCropDone(blob) {
    const ext = blob.type === 'image/png' ? '.png' : '.jpg';
    const out = new File([blob], cropFile.name.replace(/\.[^.]+$/, ext), { type: blob.type || 'image/jpeg' });
    setCropFile(null);
    setUploading(true);
    try { await onUpload(out); }
    catch (err) { console.error(err); toast.error(t('upload_failed')); }
    finally { setUploading(false); }
  }
  return (
    <div className="iu">
      {value ? (
        <div className="preview">
          <img src={value} alt="" />
          <button type="button" onClick={onClear} className="remove">×</button>
        </div>
      ) : (
        <label className="upload">
          <input type="file" accept="image/*" onChange={handleFile} />
          <span>{uploading ? t('uploading') : `📷 ${t('choose_image')}`}</span>
        </label>
      )}
      {hint && <div className="img-hint">{hint}</div>}
      {cropFile && <CropperModal file={cropFile} aspect={aspect} onDone={handleCropDone} onCancel={() => setCropFile(null)} t={t} />}
      <style jsx>{`
        .iu { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
        .preview { position: relative; display: inline-block; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border); }
        .preview img { max-width: 200px; max-height: 200px; display: block; }
        .remove { position: absolute; top: 6px; inset-inline-end: 6px; width: 26px; height: 26px; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; font-size: 16px; border: none; cursor: pointer; font-family: inherit; }
        .upload { display: inline-flex; align-items: center; padding: 10px 16px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); font-size: 13px; cursor: pointer; transition: var(--transition); }
        .upload:hover { border-color: var(--border-strong); background: var(--bg-hover); }
        .upload input { display: none; }
      `}</style>
    </div>
  );
}

function CropperModal({ file, aspect, onDone, onCancel, t }) {
  const [src, setSrc] = useState(null);
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Escape cancels the crop — it was mouse-only before.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function onImageLoad(e) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    const c = centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect || 1, naturalWidth, naturalHeight), naturalWidth, naturalHeight);
    setCrop(c);
  }

  async function confirmCrop() {
    if (!completedCrop || !imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const canvas = document.createElement('canvas');
    const cropW = completedCrop.width * scaleX;
    const cropH = completedCrop.height * scaleY;
    const MAX_OUT = 1400; // cap output so uploads stay light and load fast on mobile
    const outScale = Math.min(1, MAX_OUT / Math.max(cropW, cropH));
    canvas.width = Math.round(cropW * outScale);
    canvas.height = Math.round(cropH * outScale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      img,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0,
      canvas.width, canvas.height
    );
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    canvas.toBlob((blob) => { if (blob) onDone(blob); }, mime, 0.92);
  }

  return (
    <div className="cm-bg" onClick={onCancel}>
      <div
        className="cm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('crop_image')}
      >
        <div className="cm-head">
          <h3>{t('crop_image')}</h3>
          <button onClick={onCancel} className="cm-close" type="button" aria-label={t('close')}>×</button>
        </div>
        <div className="cm-body">
          {src && (
            <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={aspect} keepSelection>
              <img ref={imgRef} src={src} onLoad={onImageLoad} alt="" style={{ maxHeight: '60vh', maxWidth: '100%' }} />
            </ReactCrop>
          )}
        </div>
        <div className="cm-foot">
          <button onClick={onCancel} className="cm-cancel" type="button">{t('crop_cancel')}</button>
          <button onClick={confirmCrop} className="cm-confirm" type="button">{t('crop_confirm')}</button>
        </div>
      </div>
      <style jsx>{`
        .cm-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .cm { width: 100%; max-width: 720px; max-height: 90vh; background: var(--bg-secondary); border: 1px solid var(--border-strong); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
        .cm-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); }
        .cm-head h3 { font-size: 15px; font-weight: 600; }
        .cm-close { width: 28px; height: 28px; border-radius: 50%; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); font-size: 18px; cursor: pointer; font-family: inherit; }
        .cm-body {
          flex: 1; overflow: auto; padding: 16px;
          display: flex; align-items: center; justify-content: center;
          background-color: #e8e8e8;
          background-image:
            linear-gradient(45deg, #bcbcbc 25%, transparent 25%),
            linear-gradient(-45deg, #bcbcbc 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #bcbcbc 75%),
            linear-gradient(-45deg, transparent 75%, #bcbcbc 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
        }
        .cm-foot { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border); justify-content: flex-end; }
        .cm-cancel { padding: 8px 14px; background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; font-size: 13px; font-family: inherit; }
        .cm-confirm { padding: 8px 16px; background: linear-gradient(180deg, #6d86ff, #4f6ef2); color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-weight: 600; font-size: 13px; font-family: inherit; }
      `}</style>
    </div>
  );
}

function MultiImageUpload({ images, onUpload, onRemove, hint, t }) {
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const valid = files.filter(f => !uploadError(f));
    // one toast per distinct reason, instead of one alert per rejected file
    [...new Set(files.map(uploadError).filter(Boolean))].forEach(k => toast.error(t(k)));
    if (valid.length === 0) return;
    setUploading(true);
    try { for (const f of valid) await onUpload(f); }
    catch (err) { console.error(err); toast.error(t('upload_failed')); }
    finally { setUploading(false); }
  }
  return (
    <div className="multi-upload">
      <div className="thumbs">
        {images.map((img, i) => (
          <div key={i} className="thumb">
            <img src={img} alt="" />
            <button type="button" onClick={() => onRemove(i)}>×</button>
          </div>
        ))}
        <label className="add">
          <input type="file" accept="image/*" multiple onChange={handleFiles} />
          <span>{uploading ? '...' : '+'}</span>
        </label>
      </div>
      {hint && <div className="img-hint">{hint}</div>}
      <style jsx>{`
        .multi-upload { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
        .thumbs { display: grid; grid-template-columns: repeat(auto-fill, 90px); gap: 8px; max-width: 600px; }
        .thumb { position: relative; }
        .thumb img { width: 90px; height: 90px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border); }
        .thumb button { position: absolute; top: 4px; inset-inline-end: 4px; width: 22px; height: 22px; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; font-size: 14px; border: none; cursor: pointer; font-family: inherit; }
        .add { width: 90px; height: 90px; background: var(--bg-elevated); border: 1.5px dashed var(--border-strong); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--text-tertiary); cursor: pointer; transition: var(--transition); }
        .add:hover { border-color: var(--accent); color: var(--accent); }
        input { display: none; }
      `}</style>
    </div>
  );
}

// One global stylesheet for the admin. Previously EditorStyles +
// CardEditorStyles + SharedAdminStyles, which were always mounted together at
// all 10 render sites — so they were three components doing one component's job.
function AdminStyles() {
  return (
    <style jsx global>{`
      /* ---- Editor chrome — headings, inputs, the "start here" callout ---- */
      .editor h1 { font-size: 24px; font-weight: 700; margin-bottom: var(--space-5); letter-spacing: -0.01em; }
      .start-here { position: relative; margin: 0 0 var(--space-6); padding: 16px 18px; background: linear-gradient(180deg, rgba(79,110,242,0.12), rgba(79,110,242,0.04)); border: 1px solid rgba(79,110,242,0.3); border-radius: var(--radius-md); max-width: 520px; }
      .start-here strong { display: block; font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
      .start-here ol { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 4px; }
      .start-here li { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
      .start-close { position: absolute; top: 10px; inset-inline-end: 10px; width: 26px; height: 26px; border-radius: 50%; background: rgba(var(--on-bg),0.06); border: 1px solid var(--border); color: var(--text-secondary); font-size: 18px; line-height: 1; cursor: pointer; font-family: inherit; }
      .start-close:hover { color: var(--text-primary); background: rgba(var(--on-bg),0.12); }
      .editor input[type="text"], .editor input[type="email"], .editor input[type="password"], .editor input[type="url"], .editor input:not([type]), .editor textarea, .editor select {
        width: 100%; max-width: 500px; padding: 10px 14px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary); font-size: 14px; font-family: inherit; transition: var(--transition);
      }
      .editor input:focus, .editor textarea:focus, .editor select:focus { outline: none; border-color: var(--accent); }
      .editor textarea { resize: vertical; min-height: 80px; line-height: 1.6; }
      .editor input[type="color"] { width: 60px; height: 40px; padding: 4px; cursor: pointer; }
      .editor .saved-indicator { font-size: 13px; color: var(--accent); margin-inline-start: 4px; }
      @media (max-width: 720px) {
        .editor h1 { font-size: 20px; margin-bottom: var(--space-4); }
        .editor input[type="text"], .editor input[type="email"], .editor input[type="password"], .editor input[type="url"], .editor input:not([type]), .editor textarea, .editor select {
          max-width: 100%; padding: 12px 14px; font-size: 16px; /* 16px prevents iOS zoom on focus */
        }
      }
      /* ---- Repeating row/card patterns shared by the list editors ---- */
      .img-hint { font-size: var(--text-xs); color: var(--text-muted); line-height: 1.5; max-width: 360px; text-align: start; }
      .editor .hint { font-size: 13px; color: var(--text-tertiary); margin-bottom: var(--space-4); max-width: 560px; line-height: 1.5; }
      .editor .meta { font-size: 11px; color: var(--text-muted); font-weight: 400; text-transform: none; letter-spacing: 0; margin-inline-start: 6px; }
      .editor h2 { margin-top: var(--space-6); font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-3); }
      html[dir="rtl"] .editor h2 { text-transform: none; letter-spacing: normal; }
      .card-row { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-4); margin-bottom: var(--space-3); max-width: 640px; }
      .card-row .row-head { display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-3); }
      .card-row .row-tag { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }
      html[dir="rtl"] .card-row .row-tag { text-transform: none; letter-spacing: normal; }
      .card-row .row-tabs { direction: ltr; display: inline-flex; gap: 2px; background: var(--bg-elevated); border-radius: var(--radius-sm); padding: 3px; }
      .card-row .row-tabs button { padding: 4px 12px; font-size: 12px; color: var(--text-tertiary); border: none; background: none; border-radius: 5px; cursor: pointer; font-family: inherit; }
      .card-row .row-tabs button.active { background: var(--bg-hover); color: var(--text-primary); }
      .card-row .row-actions { margin-inline-start: auto; display: flex; gap: 4px; }
      .card-row .x-small, .x-small { width: 28px; height: 28px; border-radius: 6px; background: var(--bg-elevated); color: var(--text-tertiary); border: 1px solid var(--border); font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-family: inherit; }
      .card-row .x-small:hover:not(:disabled), .x-small:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
      .card-row .x-small:disabled, .x-small:disabled { opacity: 0.3; cursor: not-allowed; }
      /* keyboard focus rings — these small row controls had none */
      .editor .x-small:focus-visible, .editor .brand:focus-visible, .editor .brand-mini:focus-visible,
      .editor .row-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .row-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 100%; }
      .row-grid-2 .field { margin-bottom: 0; }
      @media (max-width: 720px) {
        .row-grid-2 { grid-template-columns: 1fr; }
        .card-row { padding: var(--space-3); }
        .card-row .x-small, .x-small { width: 36px; height: 36px; font-size: 14px; }
      }
      .banner-preview { margin-top: var(--space-3); border-radius: var(--radius-md); padding: 28px 20px; text-align: center; min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .banner-text { font-family: 'Reem Kufi', 'Cairo', 'Manrope', sans-serif; font-size: 28px; font-weight: 700; color: #fff; margin-bottom: 4px; line-height: 1.2; }
      .banner-sub { font-size: 13px; color: rgba(var(--on-bg),0.85); }
      .brand-mini { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: rgba(var(--on-bg),0.92); background: rgba(var(--on-bg),0.05); border: 1px solid rgba(var(--on-bg),0.07); border-radius: 7px; cursor: pointer; font-family: inherit; }
      .brand-mini svg { width: 15px; height: 15px; fill: currentColor; }
      .brand-mini:hover { background: rgba(var(--on-bg),0.08); }
      /* ---- Toggle rows + switches ---- */
      .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); }
      .toggle-row:last-child { border-bottom: none; }
      .switch { width: 36px; height: 20px; background: var(--bg-elevated); border-radius: 20px; position: relative; cursor: pointer; border: 1px solid var(--border); flex-shrink: 0; padding: 0; transition: var(--transition); }
      .switch::after { content: ""; width: 14px; height: 14px; background: var(--text-tertiary); border-radius: 50%; position: absolute; top: 2px; inset-inline-start: 2px; transition: var(--transition); }
      .switch.on { background: var(--accent); border-color: var(--accent); }
      .switch.on::after { background: var(--bg-primary); inset-inline-start: 18px; }
    `}</style>
  );
}
