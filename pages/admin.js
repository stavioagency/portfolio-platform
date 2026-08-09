import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import { supabase } from '../lib/supabase';
import { normalizeHost } from '../lib/tenant';
import { getTranslator, resolveLang, isLang } from '../lib/translations';
import { pick, setLangValue, emptyBilingual } from '../lib/i18n';
import { BRAND_ICONS, BRAND_KEYS, normalizeIcon, brandColor } from '../lib/brand-icons';
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
import { portfolioUrl, workspaceLabel, credentialsText, whatsappMessage, credentialsFilename } from '../lib/credentials';
import { rememberCredentials, recallCredentials, forgetCredentials, clearAllCredentials } from '../lib/handoff-store';
import { hasPublicContent } from '../lib/profile-content';
import { planFromQuery } from '../lib/signup-intent';
import {
  listPlans, allPlans, getPlan, planName, planChangeKind, monthlyEquivalent,
  formatAmount, formatInterval, DEFAULT_PLAN_CODE, BILLING_CURRENCY,
  billingAmount, toProviderAmount,
} from '../lib/billing-plans';
import {
  deriveBilling, statusLabel, statusSentence, formatBillingDate,
  paymentTone, paymentLabel,
} from '../lib/billing-status';
import { subscribersCsv, exportFilename } from '../lib/billing-export';
import { shouldPollForActivation, POLL_INTERVAL_MS } from '../lib/billing-poll';
import { edgeErrorCode, billingActionError } from '../lib/billing-errors';
import { strandedByDeleting, releaseReport, releaseMessage } from '../lib/account-release';
import { deletionBlock, deletionBlockMessage, deletionUnknownMessage } from '../lib/workspace-deletion';
import {
  Button, Card, CardHeader, Badge, EmptyState, Icon, Skeleton,
  ToastProvider, useToast, ConfirmProvider, useConfirm,
} from '../components/ui';
import PreviewPane from '../components/PreviewPane';
import BrandGlyph from '../components/ui/BrandGlyph';
import ThemePreview from '../components/ThemePreview';
import CredentialsHandoff from '../components/CredentialsHandoff';
import PlanPicker from '../components/billing/PlanPicker';

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
//
// IT IS CONSUMABLE, AND THAT IS THE WHOLE POINT — `let`, not `const`.
//
// This used to be a const, and the bug that made was the "asked to set a password
// again" loop. supabase-js re-emits SIGNED_IN every time the tab regains focus
// (GoTrueClient's visibilitychange handler -> _recoverAndRefresh -> SIGNED_IN, for
// any valid session, not just a real login). The listener below re-arms the
// obligation on SIGNED_IN while this is true — so after someone completed the gate,
// the next tab-away-and-back re-armed it, showed the gate again, AND rewrote the
// localStorage flag, which made the loop survive a reload.
//
// The arrival is a one-shot fact: "this page load began at a password link". Once a
// password has actually been written it has been discharged and must stop speaking.
let passwordLinkArrival = arrivedViaPasswordLinkFn();
function arrivedViaPasswordLink() { return passwordLinkArrival; }
function consumePasswordLinkArrival() { passwordLinkArrival = false; }
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
if (arrivedViaPasswordLink()) markPasswordPending();

// The single place the obligation ends. Discharging it has to clear ALL THREE
// signals — the React state, the persisted flag, and the arrival — or whichever one
// is left standing re-arms the other two. That is exactly how the loop worked.
function dischargePasswordObligation() {
  consumePasswordLinkArrival();
  clearPasswordPending();
}

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

// The canonical admin URL handed to a client in their credentials email. Using ONE
// fixed origin — instead of window.location.origin — means only this URL needs to be
// in the Supabase "Redirect URLs" allowlist, no matter how many client custom domains
// exist. Override per environment with NEXT_PUBLIC_ADMIN_URL; on localhost we keep the
// local origin so dev works.
// The fallback below must ALWAYS be present in Supabase's Redirect URLs allowlist.
// Supabase silently drops a redirect it does not recognise and falls back to the
// Site URL, which is how password recovery once landed on a tenant homepage
// instead of the reset screen (see c835317).
//
// Password reset no longer passes through here at all: it goes to
// /reset-password with our own token, sent by request-password-reset. The
// allowlist still matters for the remaining Supabase-issued links (invites).
function adminRedirectUrl() {
  const isLocal = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const base = process.env.NEXT_PUBLIC_ADMIN_URL
    || (isLocal ? window.location.origin : 'https://designakum.site');
  return `${String(base).replace(/\/+$/, '')}/admin`;
}

// `?lang=` beats what this browser remembers, because it is the only thing a
// customer arriving from /signup/verify brings with them: they may never have
// opened this domain before, so localStorage is empty and the account has not
// been read yet (there is no session at this point in the load). Without it
// every self-signup lands on an Arabic dashboard regardless of the language
// they signed up in.
//
// resolveLang() decides and validates both inputs — the same helper /signup
// and /signup/verify use, not a third copy of the rule.
function langFromUrl() {
  if (typeof window === 'undefined') return null;
  try { return new URLSearchParams(window.location.search).get('lang'); } catch (_) { return null; }
}
function readLang() {
  if (typeof window === 'undefined') return 'ar';
  let stored = null;
  try { stored = localStorage.getItem('lang'); } catch (_) {}
  return resolveLang(langFromUrl(), stored);
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
  const [recoveryMode, setRecoveryMode] = useState(() => arrivedViaPasswordLink() || isPasswordPending());
  // The `?lang=` this page was opened with, captured in the initialiser so it
  // survives being removed from the address bar below. Everything that needs
  // to know "did the URL ask for a language" reads THIS, not the live URL —
  // otherwise stripping the parameter would silently change the answer, and
  // the account's language could then override the instruction the customer
  // arrived with.
  const [urlLang] = useState(() => (typeof window === 'undefined' ? null : langFromUrl()));
  const router = useRouter();
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
      // SIGNED_IN is NOT once per login — it also fires on every tab refocus. This
      // may only re-arm while the arrival is unconsumed; once the gate has been
      // completed, arrivedViaPasswordLink() is false and a refocus is inert.
      if (event === 'SIGNED_IN' && arrivedViaPasswordLink()) { markPasswordPending(); setRecoveryMode(true); }
      // Signing out ends the obligation — the next session decides for itself.
      if (event === 'SIGNED_OUT') { dischargePasswordObligation(); setRecoveryMode(false); }
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
  //
  // TWO account values, in this order:
  //
  //   admin_lang  what they CHOSE, by pressing the language toggle in here.
  //               An explicit preference, and it stays the override.
  //   lang        what they signed up in, written by signup-start. Only a
  //               seed: it says which version of the marketing site they were
  //               reading, which is a good guess for a first session and
  //               nothing more. Before this it was never read at all, so a
  //               brand-new account — which by definition has no admin_lang —
  //               had nothing to go on and defaulted to Arabic.
  //
  // An explicit `?lang=` outranks both and has already been applied by
  // readLang(), so it is left alone here.
  useEffect(() => {
    if (isLang(urlLang)) return;
    const meta = session?.user?.user_metadata;
    const saved = isLang(meta?.admin_lang) ? meta.admin_lang
      : isLang(meta?.lang) ? meta.lang
      : null;
    if (!saved || saved === lang) return;
    setLangState(saved);
    applyLang(saved);
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Drop `?lang=` from the address bar once it has been read and stored.
  //
  // Through the ROUTER, not history.replaceState. A raw replaceState is
  // silently undone here: Next re-syncs the address bar from its own route
  // state after hydration, so the parameter reappears a moment later. Verified
  // by watching it come back — the effect ran, the URL did not change.
  //
  // Deferred until the initial session load settles so this lands after that
  // sync. `shallow` keeps it a URL edit and nothing more: no data fetch, no
  // remount, so nothing on the page re-runs because of it.
  //
  // What it prevents: the value is already in localStorage (applyLang wrote
  // it), so leaving the parameter in place would mean a refresh re-applies an
  // instruction from before the user pressed the language toggle, silently
  // undoing them. `urlLang` above keeps the "the URL asked" fact afterwards.
  useEffect(() => {
    if (loading || !isLang(urlLang)) return;
    if (!router.isReady || !('lang' in router.query)) return;
    const { lang: _dropped, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  }, [loading, urlLang, router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

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


  // Restoring a session is a network round-trip, and a bare "Loading…" string on
  // an empty page is the first thing a returning client sees. Draw the shape of
  // the sign-in card instead, so the screen resolves into it rather than
  // replacing it.
  if (loading) {
    return (
      <div className={`signin-wrap ${theme || 'dark'}`}>
        <div
          className="signin-card signin-skel"
          role="status"
          aria-busy="true"
          aria-label={t('loading')}
        >
          <Skeleton width="55%" height={20} />
          <Skeleton width="100%" height={12} />
          <Skeleton width="100%" height={42} radius="var(--radius-md)" />
          <Skeleton width="100%" height={42} radius="var(--radius-md)" />
          <Skeleton width="100%" height={44} radius="var(--radius-md)" />
        </div>
        <AuthStyles />
      </div>
    );
  }

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
                onDone={() => { dischargePasswordObligation(); setRecoveryMode(false); }}
              />
            )}
          </>
        )
        : <SignIn
            lang={lang} toggleLang={toggleLang} theme={theme} toggleTheme={toggleTheme}
            linkError={authLinkError}
            onPasswordSignIn={() => { dischargePasswordObligation(); setRecoveryMode(false); }}
          />}
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
// `onPasswordSignIn` fires only after credentials are ACCEPTED. Typing a working
// password is the obligation being met, so it is the moment a leftover
// `admin_must_set_password` from some earlier link has to go: without it, a browser
// that once landed on an invite/recovery link and never finished the gate carries
// that flag forever, and gates the customer again on the screen straight after they
// completed a self-serve reset — the second half of the same bug.
//
// It only drops the LOCAL signals. An account that genuinely owes a password still
// says so in user_metadata.must_set_password, which the gate reads independently, so
// a client signing in with an owner-issued temporary password is still gated.
function SignIn({ lang, toggleLang, theme, toggleTheme, linkError, onPasswordSignIn }) {
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
      else onPasswordSignIn && onPasswordSignIn();
    } catch (err) {
      // network / unexpected failure — never leave the button stuck spinning
      console.error('[auth] sign-in failed:', err);
      setError(t('invalid_credentials'));
    } finally {
      setLoading(false);
    }
  }

  // Unchanged on screen. What changed is underneath: this used to hand the job
  // to Supabase's own recovery mailer — the one that has effectively never
  // delivered on this project (HANDOFF §7: recovery_sent_at set for 2 of 14
  // users, confirmation_sent_at for none). It now calls request-password-reset,
  // which sends a branded, language-matched link through Resend, the path
  // signup verification already proved works here.
  //
  // The old API's name is deliberately not written out anywhere in this file:
  // tests/password-reset.test.mjs greps for it to make sure no caller survives,
  // and a mention in a comment is indistinguishable from a real one to grep.
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
      // The request goes out even when the username resolved to nothing, for
      // the reason handleSubmit above spells out: returning early on an unknown
      // identifier answers far faster than a real one, and that timing
      // difference is itself the account-existence leak the generic message is
      // meant to close. The endpoint answers { ok: true } to anything, so an
      // address that cannot exist costs one no-op round-trip and nothing else.
      await supabase.functions.invoke('request-password-reset', {
        // `lang` is what THIS screen is being read in. The endpoint uses it only
        // when the account itself has no preference — which is exactly the case
        // that used to hand an English customer an Arabic email.
        body: { email: email || `${raw.toLowerCase() || 'unknown'}@invalid.local`, lang },
      });
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
      /* Same four-step ramp as .dashboard.dark — see the note there. This is the
         first screen anyone sees, so a flat-white hint sitting at the same weight
         as the heading is the platform's whole first impression. */
      .signin-wrap.dark { --on-bg: 255,255,255; --bg-primary: #060912; --bg-secondary: #0c1428; --bg-elevated: #141d38; --bg-hover: #1d2747; --text-primary: #ffffff; --text-secondary: rgba(255,255,255,0.72); --text-tertiary: rgba(255,255,255,0.5); --text-muted: rgba(255,255,255,0.36); background-color: #060912; }
      /* tokens come from [data-admin-theme='light'] in globals.css */
      .signin-wrap.light { background-color: #ffffff; }
      .signin-card { width: 100%; max-width: 360px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-6); }
      /* The session-restore placeholder: the same card, with the form's blocks
         blanked. One gap rather than per-element spacers. */
      .signin-skel { display: flex; flex-direction: column; gap: var(--space-5); }
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
  // Arriving from /signup/verify with ?plan= means they picked a plan on the
  // marketing site and have just verified their email. Billing is the tab
  // they came for; BillingEditor reads the same parameter and preselects it.
  // Anything else — including a plan code this build does not know — falls
  // through to the normal landing tab rather than opening an empty screen.
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'profile';
    return planFromQuery(window.location.search) ? 'billing' : 'profile';
  });
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
    // An owner has no Billing tab — it belongs to a workspace, and they
    // administer many. Only reachable by an owner opening a ?plan= link that
    // was meant for a client, which would otherwise render an empty panel.
    if (isOwner === true) setActiveTab((prev) => (prev === 'billing' ? 'profile' : prev));
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
  // Issued passwords are held in memory for the session (lib/handoff-store.js).
  // Signing out must drop them, or the next person at this browser inherits
  // every credential set the previous operator had open.
  async function signOut() { clearAllCredentials(); await supabase.auth.signOut(); }

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
          {/* The public site links to these from its footer, but a signed-in
              client had no route to them at all — the terms they are operating
              under were unreachable from inside the product. New tab so an
              unsaved editor is never navigated away from. */}
          <div className="sidebar-legal">
            <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('legal_privacy')}</a>
            <span aria-hidden="true">·</span>
            <a href="/terms" target="_blank" rel="noopener noreferrer">{t('legal_terms')}</a>
          </div>
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
            {activeTab === 'subscribers' && isOwner === true && <SubscribersOverview lang={lang} onOpen={(id) => { switchTenant(id); navigate('profile'); }} />}
            {activeTab === 'billing'    && isOwner === false && <BillingEditor     key={tenantKey} t={t} lang={lang} />}
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
        /* Four DISTINCT text steps, mirroring the light ramp in globals.css
           (1 / .72 / .5 / .36). These four tokens were previously all #ffffff,
           which collapsed every hierarchy the components express through them:
           a section label, a hint and a value all rendered as the same flat
           white. globals.css already calls this bug out and fixes it for the
           light theme — the dark block was reintroducing it underneath. */
        .dashboard.dark { --on-bg: 255,255,255; --bg-primary: #060912; --bg-secondary: #0c1428; --bg-elevated: #141d38; --bg-hover: #1d2747; --text-primary: #ffffff; --text-secondary: rgba(255,255,255,0.72); --text-tertiary: rgba(255,255,255,0.5); --text-muted: rgba(255,255,255,0.36); background-color: #060912; }
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
        .sidebar-legal { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); font-size: var(--text-xs); color: var(--text-muted); }
        .sidebar-legal a { color: var(--text-muted); text-decoration: underline; }
        .sidebar-legal a:hover { color: var(--text-secondary); }
        .sidebar-legal a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
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

// The public CTA gives its label a 16ch column. 22 leaves a little headroom for
// narrow glyphs while still guaranteeing a label that reads as one line.
const CTA_LABEL_MAX = 22;

// Quiet counter that only speaks up as the limit approaches — a permanent
// "3 / 22" on every field is noise.
function CharCount({ value, max }) {
  const n = (value || '').length;
  if (n < max * 0.7) return null;
  return (
    <span className={`char-count ${n >= max ? 'at-limit' : ''}`} aria-live="polite">
      {n} / {max}
      <style jsx>{`
        .char-count {
          display: block;
          margin-top: 4px;
          font-size: var(--text-xs);
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          direction: ltr;
          text-align: start;
        }
        .at-limit { color: var(--warning); }
      `}</style>
    </span>
  );
}

function ButtonRow({ btn, lang, onChange, onRemove, onUp, onDown, canUp, canDown, t }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const icon = btn.icon && BRAND_ICONS[normalizeIcon(btn.icon)];
  return (
    <div className="card-row">
      <div className="row-head">
        <button type="button" className="brand-mini" onClick={() => setPickerOpen(true)} title={t('pick_icon')} aria-label={t('pick_icon')}>
          {icon ? <BrandGlyph icon={btn.icon} size={15} /> : '?'}
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
          {/* Capped at the source. The public button gives a label 16ch and
              ellipsises the rest, so anything much past that was never going to
              be readable — better to stop it being typed than to silently trim
              it on someone's live site. */}
          <input
            id={`bt-l-${btn.id}`}
            value={pick(btn.label, lang)}
            maxLength={CTA_LABEL_MAX}
            onChange={(e) => onChange({ label: setLangValue(btn.label, lang, e.target.value) })}
            placeholder={lang === 'ar' ? 'تواصل معي' : 'Contact me'}
          />
          <CharCount value={pick(btn.label, lang)} max={CTA_LABEL_MAX} />
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
              <BrandGlyph icon={l.icon} size={17} />
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
          {filtered.map(k => {
            // Both surface variants are handed to CSS rather than resolved here,
            // so the picker follows the admin's own light/dark theme without
            // this component having to know which one is active.
            const dark = brandColor(k, 'dark');
            const light = brandColor(k, 'light');
            return (
              <button
                key={k}
                type="button"
                className={`picker-cell ${selected === k ? 'sel' : ''} ${dark ? 'tinted' : ''}`}
                style={dark ? { '--brand': dark, '--brand-light': light } : undefined}
                onClick={() => onPick(k)}
                title={BRAND_ICONS[k].label}
              >
                <BrandGlyph icon={k} size={20} />
                <span>{BRAND_ICONS[k].label}</span>
              </button>
            );
          })}
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
        /* Brand-coloured glyphs make the grid scannable by logo instead of by
           reading 20+ labels. Cell size, padding and the label below are
           unchanged, so the grid still reads as one set. */
        .picker-cell.tinted svg { fill: var(--brand); }
        :global(html[data-admin-theme='light']) .picker-cell.tinted svg { fill: var(--brand-light, var(--brand)); }
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
      <p className="hint">{t('theme_preset_hint')}</p>
      <div className="preset-grid">
        {Object.entries(THEME_PRESETS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            className={`preset ${appearance.theme === k ? 'active' : ''}`}
            onClick={() => applyPreset(k)}
            aria-pressed={appearance.theme === k}
          >
            {/* a miniature of the real card, not a colour chip — see ThemePreview */}
            <div className="preset-shot"><ThemePreview tokens={v.tokens} /></div>
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
        .preset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-bottom: var(--space-5); max-width: 640px; }
        .preset { background: var(--bg-secondary); border: 1.5px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2); cursor: pointer; text-align: center; transition: var(--transition); font-family: inherit; }
        .preset:hover { border-color: var(--border-strong); }
        .preset.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
        .preset:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .preset-shot { border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border); margin-bottom: var(--space-2); }
        .preset-name { font-size: var(--text-sm); color: var(--text-secondary); padding-bottom: var(--space-1); }
        .preset.active .preset-name { color: var(--text-primary); font-weight: 600; }
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
        // Switching the range refetches; a text "Loading…" collapsed the whole
        // stat grid to one line and bounced the page every time. Hold the grid's
        // real geometry instead.
        <div className="stat-grid" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={86} radius="var(--radius-md)" />
          ))}
        </div>
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
      {loading ? (
        <div className="list-skel" aria-busy="true">
          <Skeleton width="100%" height={56} radius="var(--radius-md)" />
          <Skeleton width="100%" height={56} radius="var(--radius-md)" />
        </div>
      ) : domains.length === 0 ? (
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
  // The client's language, chosen by the owner at creation. This used to be
  // hardcoded 'ar' here, which made invite-client's whole language decision a
  // formality: the tenant's default_lang is THE ONLY signal it has (there is no
  // account yet to carry admin_lang or lang), so every invited client was
  // Arabic no matter who they were, and nothing in the UI could change it —
  // the Account tab's language control writes profile.default_lang, a
  // different column governing the public site.
  //
  // It decides more than the email: invite-client seeds the new account's
  // `lang` from it, so it is also the language the client's dashboard opens in
  // on their first sign-in, and the fallback for a later client-recovery send.
  //
  // Defaults to the language the owner is working in, which is right far more
  // often than a fixed value and is still one visible dropdown away from wrong.
  const [invLang, setInvLang] = useState(lang === 'en' ? 'en' : 'ar');
  // Credentials to hand to the client. Held only in memory, shown once.
  const [invCreds, setInvCreds] = useState(null);
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
        .insert({ slug: s, name: invName.trim() || s, default_lang: invLang, status: 'active' })
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
        //    Same choice, deliberately: this column is the PUBLIC site's default
        //    language, which is a different question from the tenant's, but not
        //    one the owner should have to answer twice at creation. Both were
        //    hardcoded 'ar' before. The client can change this one themselves in
        //    Account → Default language, which writes here and nowhere else.
        .insert({ tenant_id: tRow.id, default_lang: invLang });
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
        if (/email_taken|username_taken/i.test(String(msg))) {
          setInvErr(await explainTakenIdentity(msg, invEmail.trim(), ar));
          return;
        }
        setInvErr(msg || (ar ? 'فشلت الدعوة' : 'Invite failed'));
        return;
      }
      if (data?.error) {
        // "Taken" is the failure that used to strand an onboarding. Find out WHO
        // holds the address: if it is an account with no workspace, the fix is
        // one click away in Unattached logins rather than a dead end.
        if (/email_taken|username_taken/i.test(String(data.error))) {
          setInvErr(await explainTakenIdentity(data.error, invEmail.trim(), ar));
          return;
        }
        setInvErr(data.detail ? `${data.error}: ${data.detail}` : data.error);
        return;
      }

      created = null; // succeeded — do not roll back

      // The password is shown ONCE, here. It is not stored and not emailed, so if
      // this is dismissed without copying it the only way back is a reset.
      // Held in the session store as well as local state: this component lives
      // inside the "Add client" panel, so closing that panel used to destroy the
      // only copy of the password in existence. See lib/handoff-store.js.
      const issued = {
        tenantId: tRow.id,
        workspace: workspaceLabel(tRow),
        createdAt: tRow.created_at || null,
        // The client's public address, so the handoff message can point at the
        // site as well as the dashboard.
        url: portfolioUrl(typeof window !== 'undefined' ? window.location.origin : '', tRow.slug),
        signInUrl: adminRedirectUrl(),
        email: data?.email || invEmail.trim(),
        username: data?.username || invUser.trim(),
        password: data?.temp_password || '',
        // The function reports whether it actually delivered. It never fails the
        // request over email, so this can be false while everything else succeeded.
        emailed: data?.emailed === true,
        emailError: data?.email_error || null,
        // invite-client does not return the account id, and the handoff modal
        // needs one to let you correct a mistyped address on the spot. Resolve it
        // from the address we just used. Best-effort: if it fails the modal simply
        // shows the email as read-only and the fix moves to the pending row.
        userId: await resolveUserId(data?.email || invEmail.trim()),
      };
      rememberCredentials(tRow.id, issued);
      setInvCreds(issued);
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

  // THE BILLING GATE ON DELETION.
  //
  // `tenants` cascades into `subscriptions`, `billing_customers`, `payments` and
  // `invoices`. Delete a workspace whose PayPal subscription is still live and
  // the provider_subscription_id — the only thing that could ever cancel it —
  // goes with it. PayPal keeps charging, and nothing on our side knows.
  //
  // So this refuses, rather than cancelling on the owner's behalf. Cancelling is
  // an irreversible call to a payment provider; it belongs to the deliberate
  // button in the Billing tab that already does it, not to a side effect of a
  // different action. Once that cancel lands the state is 'canceling' and this
  // gate opens immediately — the owner does not have to wait out the paid period.
  //
  // FAILS CLOSED. Unlike the members read below, which is best effort, a
  // subscription read that fails blocks the delete: "we could not check" and
  // "there is nothing to check" must never collapse into the same answer.
  async function billingGate(tenantId) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, plan_code, current_period_end, cancel_at_period_end, grace_ends_at, trial_ends_at, provider, provider_subscription_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      console.warn('[tenant] subscription check failed; refusing to delete:', error);
      return deletionUnknownMessage(ar);
    }
    const block = deletionBlock(data);
    return block ? deletionBlockMessage(block, ar) : '';
  }

  // PERMANENTLY delete the active workspace. Distinct from "Delete portfolio" in
  // Account, which only CLEARS a workspace's content and leaves the workspace itself —
  // which is why a suspended demo workspace kept reappearing in the switcher with no
  // way to get rid of it.
  //
  // Every table referencing tenants is ON DELETE CASCADE (profile, projects,
  // tenant_admins, tenant_domains, analytics_events), so one delete removes the lot.
  // RLS already restricts this to platform owners.
  //
  // WHAT THE CASCADE DOES NOT REACH IS auth.users. The account outlives its
  // workspace holding an email that the unique index then refuses to reissue, so
  // deleting a test signup used to burn that address permanently. The delete now
  // finishes the job by releasing the stranded login through the SAME call
  // "Unattached logins" makes — see lib/account-release.js. Nothing is deleted
  // there either: the address is parked and kept in `released_email`.
  async function deleteWorkspace() {
    if (!tenant) return;
    setWsErr(''); setWsMsg('');

    // Before the dialog: refusing after someone has typed a slug to confirm an
    // irreversible action reads as the tool wasting their time, and the answer
    // is the same either way.
    const blocked = await billingGate(tenant.id);
    if (blocked) { setWsErr(blocked); return; }

    const label = tenant.name || tenant.slug;
    // Require the SLUG, not a generic word: the switcher means the active workspace
    // is often not the one you were last looking at, and this is unrecoverable.
    const ok = await confirm({
      title: ar ? 'حذف مساحة العمل نهائيًا؟' : 'Delete workspace permanently?',
      description: ar
        ? `سيؤدي هذا إلى حذف «${label}» بالكامل: الملف الشخصي والمشاريع والنطاقات والإحصائيات ووصول العميل. لا يمكن التراجع. لن يُحذف حساب الدخول، لكن يُحرَّر بريده ليصبح قابلًا للاستخدام من جديد — إلا إذا كان مرتبطًا بمساحة أخرى.`
        : `This permanently deletes "${label}" and everything in it: profile, projects, domains, analytics and client access. It cannot be undone. The LOGIN is not deleted, but its email is released for reuse — unless it belongs to another workspace too.`,
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
      // And again, now. A `pending` subscription activates on a webhook we do
      // not control, and typing a slug takes long enough for one to land. This
      // is the check that actually guards the delete; the one above only saves
      // the typing.
      const stillBlocked = await billingGate(doomed.id);
      if (stillBlocked) { setWsErr(stillBlocked); return; }

      // WHO THIS STRANDS — read BEFORE the delete, because tenant_admins cascades
      // with the tenant and list_workspace_members JOINs it: a moment later there
      // is nobody left to ask about. The RPC is the only way to this; tenant_admins
      // is readable own-row only, so the browser cannot join a workspace to its
      // client without it.
      //
      // Best effort on purpose. Losing this list costs one "Unattached logins"
      // click later, which is exactly where the owner was before — it must never
      // stop a delete the owner has already confirmed.
      let stranded = [];
      try {
        const { data: members, error: membersErr } = await supabase.rpc('list_workspace_members');
        if (membersErr) throw membersErr;
        stranded = strandedByDeleting(members || [], doomed.id);
      } catch (memberErr) {
        console.warn('[tenant] could not read members before delete:', memberErr);
      }

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
      // FREE THE EMAIL. Only now: release_account refuses an account that still
      // has a membership, and until the line above ran, this one did. Every
      // failure is carried into the message rather than thrown — the workspace is
      // already gone, and turning "the address is still held" into a failed
      // delete would describe the wrong thing.
      const report = releaseReport(await releaseAccounts(stranded));
      if (report.failed.length) {
        console.warn('[tenant] workspace deleted; email still held by', report.failed.length, 'login(s)');
      }

      setTenant(null);
      await reloadTenants();
      setWsMsg(releaseMessage(report, ar));
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
            ? 'التعليق يوقف الموقع مؤقتًا ويمكن التراجع عنه. الحذف نهائي ويشمل المشاريع والنطاقات والإحصائيات، ويحرّر بريد الحساب لإعادة استخدامه.'
            : 'Suspending takes the site offline and is reversible. Deleting is permanent — projects, domains and analytics — and frees the account email for reuse.'}</p>
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
        <Field id="inv-lang" label={ar ? 'لغة العميل' : "Client's language"}>
          <select id="inv-lang" value={invLang} onChange={(e) => setInvLang(e.target.value)}>
            <option value="ar">العربية (Arabic)</option>
            <option value="en">English</option>
          </select>
        </Field>
        <p className="hint" style={{ marginTop: -4 }}>{ar
          ? 'لغة لوحة التحكم عند أول دخول للعميل، ولغة موقعه، ولغة أي بريد نرسله له لاحقًا. يستطيع تغييرها بنفسه بعد الدخول.'
          : "The language their dashboard opens in, their site's default, and any email we send them later. They can change it themselves after signing in."}</p>
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
        <CredentialsHandoff
          creds={invCreds}
          lang={lang}
          title={ar ? 'المساحة جاهزة 🎉' : 'Workspace ready 🎉'}
          intro={ar
            ? 'سلّم هذه البيانات للعميل بأي طريقة تناسبك. ستبقى المساحة في «بانتظار التسليم» حتى تؤكد وصولها.'
            : 'Hand these to the client any way you like. The workspace stays in Pending handoff until you confirm they have them.'}
          onUpdateEmail={makeEmailUpdater(invCreds, setInvCreds, ar)}
          onClose={() => setInvCreds(null)}
        />
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
          {/* An em-dash and an empty bar are indistinguishable from "0% done".
              A skeleton says "not known yet", which is the truth. */}
          <div className="ch-status">
            {loading ? <Skeleton width={52} height={22} /> : `${setup.percent}%`}
          </div>
          {!loading && (
            <div className="ch-bar"><div className="ch-bar-fill" style={{ width: `${setup.percent}%` }} /></div>
          )}
        </Card>
      </div>

      <h2>{ar ? 'إجراءات سريعة' : 'Quick actions'}</h2>
      <div className="ch-actions">
        <button className="ch-action" onClick={() => onNavigate('profile')}>👤 {ar ? 'تعديل الملف' : 'Edit profile'}</button>
        <button className="ch-action" onClick={() => onNavigate('projects')}>📁 {ar ? 'إضافة مشروع' : 'Add project'}</button>
        <button className="ch-action" onClick={() => onNavigate('appearance')}>🎨 {ar ? 'تخصيص التصميم' : 'Customize design'}</button>
        <button className="ch-action" onClick={() => onNavigate('account')}>🌐 {ar ? 'ربط نطاق' : 'Connect domain'}</button>
      </div>

      {/* the whole "· 3/7" meta is withheld until the count is known — an
          orphaned separator is worse than no separator */}
      <h2>{ar ? 'أكمل موقعك' : 'Complete your website'}{!loading && <span className="meta">· {setup.done}/{setup.total}</span>}</h2>
      {loading && (
        // Mirrors the guide's own rhythm so the steps fade in place rather than
        // pushing the page down when they arrive.
        <div className="ch-guide-skel" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={64} radius="var(--radius-md)" />
          ))}
        </div>
      )}
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
        .ch-guide-skel { display: flex; flex-direction: column; gap: var(--space-2); max-width: 640px; margin-bottom: var(--space-4); }
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

// One row of the onboarding queue. Every way out of a botched handover lives
// here: re-read the credentials if they are still in this session, correct a
// mistyped address, re-send the welcome, rotate the password, or declare it
// done. None of these create a second user or a second workspace.
function PendingRow({ row, lang, busy, onOpen, onViewCreds, onSendWelcome, onResetPassword, onSaveEmail, onMarkDone }) {
  const ar = lang === 'ar';
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(row.member?.email || '');
  const m = row.member;
  const working = busy === row.id;
  // Whether the password issued for this workspace is still readable in this
  // session. Once it is not, the honest options are re-send or reset — both of
  // which issue a fresh one.
  const stored = recallCredentials(row.id);

  return (
    <Card pad="none" className="cl-row ph-row">
      <button type="button" className="cl-open" onClick={onOpen}>
        <div className="cl-main">
          <div className="cl-name">{row.name}</div>
          <div className="cl-domain" dir="ltr">{row.domain}</div>
          <div className="cl-who" dir="ltr">
            {m
              ? <>{m.email}{m.username ? ` · ${m.username}` : ''}</>
              : <span className="cl-none">{ar ? 'لا يوجد عميل مرتبط' : 'no client account'}</span>}
          </div>
        </div>
        <Badge tone="warning" dot>{ar ? 'بانتظار التسليم' : 'Pending'}</Badge>
      </button>

      {editing ? (
        <form
          className="ph-edit"
          onSubmit={(e) => { e.preventDefault(); onSaveEmail(email.trim()); setEditing(false); }}
        >
          <label htmlFor={`ph-em-${row.id}`}>{ar ? 'بريد العميل' : 'Client email'}</label>
          <div className="ph-edit-row">
            <input
              id={`ph-em-${row.id}`} type="email" dir="ltr" value={email} required
              onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com"
            />
            <Button type="submit" size="sm" loading={working}>{ar ? 'حفظ' : 'Save'}</Button>
            <Button type="button" size="sm" variant="ghost"
              onClick={() => { setEmail(m?.email || ''); setEditing(false); }}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
          <p className="ph-note">{ar
            ? 'يغيّر عنوان الحساب نفسه — لا يُنشئ حسابًا جديدًا.'
            : 'Changes the address on the existing account — it does not create a new one.'}</p>
        </form>
      ) : (
        <div className="cl-actions ph-actions">
          {stored && (
            <Button type="button" size="sm" onClick={onViewCreds}>
              {ar ? 'عرض البيانات' : 'View credentials'}
            </Button>
          )}
          {m && (
            <>
              <Button type="button" variant="secondary" size="sm" loading={working} onClick={onSendWelcome}>
                {ar ? 'إرسال الترحيب' : 'Send welcome email'}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
                {ar ? 'تعديل البريد' : 'Edit email'}
              </Button>
              <Button type="button" variant="secondary" size="sm" loading={working} onClick={onResetPassword}>
                {ar ? 'كلمة مرور جديدة' : 'Reset password'}
              </Button>
            </>
          )}
          <Button type="button" variant="secondary" size="sm" loading={working} onClick={onMarkDone}>
            {ar ? 'تم التسليم' : 'Mark as handed over'}
          </Button>
        </div>
      )}
      <AdminStyles />
      <style jsx>{`
        .ph-actions { flex-wrap: wrap; }
        .ph-edit { padding: var(--space-3) var(--space-4) var(--space-4); border-top: 1px solid var(--border); }
        .ph-edit label { display: block; font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: 6px; }
        .ph-edit-row { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
        .ph-edit-row input { flex: 1 1 220px; min-width: 0; }
        .ph-note { margin-top: 8px; font-size: var(--text-xs); color: var(--text-muted); }
      `}</style>
    </Card>
  );
}

// Turns a client-recovery failure into something an owner can act on.
//
// The first case is the one that matters day to day: supabase/functions/
// client-recovery is committed but NOT DEPLOYED, so until it is, invoking it
// fails at the network layer. Saying so plainly beats a raw "Failed to fetch",
// and every other recovery route on the row still works meanwhile.
// A "taken" email or username is the single most stranding failure in
// onboarding: the workspace has already been created by the time it fires. This
// asks who actually holds the address so the message can point at the remedy —
// an account with no workspace can be released in one click, whereas a live
// client genuinely needs a different address.
async function explainTakenIdentity(code, email, ar) {
  const taken = /username_taken/i.test(String(code));
  const generic = taken
    ? (ar ? 'اسم المستخدم هذا مستخدم بالفعل.' : 'That username is already taken.')
    : (ar ? 'هذا البريد مستخدم بحساب آخر.' : 'That email already belongs to an account.');
  if (taken || !email) return generic;
  try {
    const { data, error } = await supabase.functions.invoke('client-recovery', {
      body: { action: 'lookup_email', email },
    });
    if (error || data?.error || !data?.exists) return generic;
    if (data.is_owner) {
      return ar
        ? 'هذا البريد يخص حساب مالك للمنصة — استخدم بريدًا آخر.'
        : 'That email belongs to a platform owner account — use a different one.';
    }
    if (data.orphaned) {
      return ar
        ? `${generic} لكن حسابه بلا مساحة عمل — حرّره من قسم «حسابات بلا مساحة» بالأسفل ثم أعد المحاولة.`
        : `${generic} It has no workspace though — release it under "Unattached logins" below, then try again.`;
    }
    return ar
      ? `${generic} وهو مرتبط بعميل نشط، لذا استخدم بريدًا مختلفًا.`
      : `${generic} It belongs to an active client, so use a different address.`;
  } catch (_) {
    return generic;
  }
}

// The account id for an address, via the recovery function's read-only lookup.
// Returns null rather than throwing — every caller treats "no id" as "this action
// is unavailable", never as an error worth showing.
// Correct a client's address from inside the handoff modal. Returns { error }
// rather than throwing so the modal can show the reason next to the field.
function makeEmailUpdater(creds, setCreds, ar) {
  return async (email) => {
    if (!creds?.userId) {
      return { error: ar ? 'تعذّر تحديد الحساب.' : 'Could not identify the account.' };
    }
    try {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'update_email', user_id: creds.userId, email },
      });
      const failed = error || data?.error;
      if (failed) return { error: recoveryError(failed, data, ar) };
      // Reflect it immediately — the modal is still open and showing the old one.
      // emailed goes false because the automatic send went to the OLD address;
      // nothing has reached this one yet.
      const next = { ...creds, email, emailed: false, emailError: null };
      rememberCredentials(creds.tenantId, next);
      setCreds(next);
      return {};
    } catch (err) {
      console.error('[handoff] email update failed:', err);
      return { error: ar ? 'تعذّر تحديث البريد.' : 'Could not update the email.' };
    }
  };
}

// Park the addresses of accounts a delete has just stranded, one call each.
//
// The same `release_account` the "Unattached logins" button invokes — owner-gated
// server-side, and it re-checks membership itself, so a stale list here can only
// ever be refused, never acted on wrongly. Sequential because it is almost always
// a single account and a rejected batch is harder to report than a rejected call.
//
// Never throws: every outcome comes back as a row for releaseReport().
async function releaseAccounts(userIds) {
  const out = [];
  for (const user_id of userIds || []) {
    try {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'release_account', user_id },
      });
      const failed = error || data?.error;
      if (failed) console.error('[recovery] release after delete failed:', data?.error || failed?.message);
      out.push({ user_id, ok: !failed, code: String(data?.error || failed?.message || '') });
    } catch (err) {
      console.error('[recovery] release after delete threw:', err);
      out.push({ user_id, ok: false, code: 'invoke_failed' });
    }
  }
  return out;
}

async function resolveUserId(email) {
  if (!email) return null;
  try {
    const { data, error } = await supabase.functions.invoke('client-recovery', {
      body: { action: 'lookup_email', email },
    });
    if (error || data?.error || !data?.exists) return null;
    return data.user_id || null;
  } catch (_) {
    return null;
  }
}

function recoveryError(failed, data, ar) {
  const code = String(data?.error || failed?.message || failed || '');
  if (/not.?found|failed to send|fetch|404/i.test(code)) {
    return ar
      ? 'وظيفة الاسترجاع غير منشورة بعد على Supabase. استخدم النسخ أو واتساب أو إعادة تعيين كلمة المرور حتى يتم نشرها.'
      : 'The recovery function is not deployed to Supabase yet. Use copy, WhatsApp or Reset password until it is.';
  }
  if (/email_taken/i.test(code)) {
    return ar ? 'هذا البريد مستخدم بحساب آخر.' : 'That email already belongs to another account.';
  }
  if (/invalid_email/i.test(code)) {
    return ar ? 'صيغة البريد غير صحيحة.' : 'That email address is not valid.';
  }
  if (/cannot_modify_platform_owner/i.test(code)) {
    return ar ? 'لا يمكن تعديل حساب مالك المنصة من هنا.' : 'A platform owner cannot be modified from here.';
  }
  if (/not_a_client/i.test(code)) {
    return ar ? 'هذا الحساب ليس عميلًا لأي مساحة.' : 'That account is not a client of any workspace.';
  }
  if (/still_has_workspace/i.test(code)) {
    return ar
      ? 'لا يمكن تحرير حساب ما زال مرتبطًا بمساحة عمل — احذف المساحة أولًا.'
      : 'That account still belongs to a workspace — delete the workspace first.';
  }
  return data?.detail ? `${code}: ${data.detail}` : (code || (ar ? 'فشلت العملية' : 'That did not work'));
}

// Where a client actually is, from signals that already existed and were being
// thrown away: handed_over_at, last_sign_in_at from list_workspace_members, and
// whether the site has any real content. Four stages, in the order they happen.
function clientStage(row) {
  const m = row.member;
  if (!m) return { id: 'nologin', tone: 'danger', label: (ar) => (ar ? 'بلا حساب' : 'No login') };
  if (row.pendingHandoff) return { id: 'invited', tone: 'warning', label: (ar) => (ar ? 'بانتظار التسليم' : 'Pending handover') };
  if (!m.last_sign_in_at) return { id: 'never', tone: 'warning', label: (ar) => (ar ? 'لم يدخل بعد' : 'Never signed in') };
  if (!row.live) return { id: 'building', tone: 'default', label: (ar) => (ar ? 'قيد الإعداد' : 'Building') };
  return { id: 'live', tone: 'success', label: (ar) => (ar ? 'منشور' : 'Live') };
}

// "6 days ago" beats a timestamp for the one question being asked: has this
// person shown up recently, or have they gone quiet?
function formatSeen(iso, ar) {
  if (!iso) return ar ? 'لم يسجّل دخوله قط' : 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return ar ? 'اليوم' : 'Today';
  if (days === 1) return ar ? 'أمس' : 'Yesterday';
  if (days < 30) return ar ? `قبل ${days} يومًا` : `${days} days ago`;
  const months = Math.floor(days / 30);
  return ar ? `قبل ${months} شهرًا` : `${months} mo ago`;
}

// One client, one panel. Everything about them lives here — the workspace, its
// address, the login, the credentials and the destructive actions — so managing a
// client never means changing which workspace the whole admin is pointed at.
//
// THE TRICK that makes this cheap: it re-provides TenantContext scoped to THIS
// client. TenantAdminSection and DomainManager already read `tenant` from that
// context, so they work here unmodified, operating on the clicked client while
// the global active workspace stays exactly where it was. Only "Open editor"
// changes that, and it does so explicitly.
function ClientPanel({ row, tenantRow, lang, onClose, onOpenEditor, actions }) {
  const ar = lang === 'ar';
  const outer = useTenant();
  const panelRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const m = row.member;
  const stage = clientStage(row);
  const [editingEmail, setEditingEmail] = useState(false);
  const [draftEmail, setDraftEmail] = useState(m?.email || '');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState('');

  return (
    <div className="cp-bg" onClick={onClose}>
      <aside
        className="cp"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={row.name}
        dir={ar ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cp-head">
          <div className="cp-title">
            <h2>{row.name}</h2>
            <a className="cp-url" href={row.siteUrl} target="_blank" rel="noopener noreferrer" dir="ltr">
              {row.domain}
            </a>
          </div>
          <button type="button" className="cp-x" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}>×</button>
        </header>

        <div className="cp-body">
          <div className="cp-facts">
            <div><dt>{ar ? 'الحالة' : 'Stage'}</dt><dd><Badge tone={stage.tone} dot>{stage.label(ar)}</Badge></dd></div>
            <div><dt>{ar ? 'آخر دخول' : 'Last login'}</dt><dd>{formatSeen(m?.last_sign_in_at, ar)}</dd></div>
            <div>
              <dt>{ar ? 'البريد' : 'Email'}</dt>
              <dd dir="ltr">
                {m?.email || '—'}
                {m && !editingEmail && (
                  <button type="button" className="cp-inline" dir={ar ? 'rtl' : 'ltr'}
                    onClick={() => { setDraftEmail(m.email || ''); setEmailErr(''); setEditingEmail(true); }}>
                    {ar ? 'تعديل' : 'Edit'}
                  </button>
                )}
              </dd>
            </div>
            <div><dt>{ar ? 'اسم المستخدم' : 'Username'}</dt><dd dir="ltr">{m?.username || '—'}</dd></div>
          </div>

          {editingEmail && m && (
            <form
              className="cp-email"
              onSubmit={async (e) => {
                e.preventDefault();
                setEmailErr(''); setEmailBusy(true);
                try {
                  const res = await actions.onSaveEmail(draftEmail.trim());
                  if (res?.error) { setEmailErr(res.error); return; }
                  setEditingEmail(false);
                } finally { setEmailBusy(false); }
              }}
            >
              <label htmlFor={`cp-em-${row.id}`}>{ar ? 'بريد العميل' : 'Client email'}</label>
              <div className="cp-email-row">
                <input id={`cp-em-${row.id}`} type="email" dir="ltr" required autoFocus
                  value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} />
                <Button type="submit" size="sm" loading={emailBusy}>{ar ? 'حفظ' : 'Save'}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingEmail(false)}>
                  {ar ? 'إلغاء' : 'Cancel'}
                </Button>
              </div>
              {emailErr
                ? <p className="cp-email-err">{emailErr}</p>
                : <p className="cp-email-note">{ar
                    ? 'يغيّر العنوان على الحساب نفسه. لا يُرسل شيئًا — استخدم «إرسال الترحيب» بعدها.'
                    : 'Changes the address on the existing account. It sends nothing — use Send welcome email afterwards.'}</p>}
            </form>
          )}

          <div className="cp-actions">
            <Button onClick={onOpenEditor}>{ar ? 'فتح المحرّر' : 'Open editor'}</Button>
            <Button variant="secondary" onClick={() => window.open(row.siteUrl, '_blank', 'noopener')}>
              {ar ? 'عرض الموقع' : 'Open portfolio'}
            </Button>
          </div>

          {m && (
            <>
              <h3 className="cp-h">{ar ? 'بيانات الدخول' : 'Credentials'}</h3>
              <div className="cp-actions">
                {actions.hasCreds && (
                  <Button size="sm" onClick={actions.onViewCreds}>{ar ? 'عرض البيانات' : 'View credentials'}</Button>
                )}
                <Button variant="secondary" size="sm" onClick={actions.onSendWelcome}>
                  {ar ? 'إرسال الترحيب' : 'Send welcome email'}
                </Button>
                <Button variant="secondary" size="sm" onClick={actions.onResetPassword}>
                  {ar ? 'كلمة مرور جديدة' : 'Reset password'}
                </Button>
              </div>
            </>
          )}

          {/* Scoped to THIS client — see the note above the component. */}
          <TenantContext.Provider value={{ ...outer, tenant: tenantRow }}>
            <TenantAdminSection lang={lang} part="settings" />
          </TenantContext.Provider>
        </div>
      </aside>
      <style jsx>{`
        .cp-bg { position: fixed; inset: 0; z-index: var(--z-modal);
          background: rgba(0,0,0,0.55); display: flex; justify-content: flex-end;
          animation: cpFade 0.18s ease; }
        @keyframes cpFade { from { opacity: 0; } to { opacity: 1; } }
        .cp { width: min(560px, 100%); height: 100%; overflow-y: auto;
          background: var(--bg-secondary); border-inline-start: 1px solid var(--border-strong);
          box-shadow: var(--shadow-lg); animation: cpIn 0.22s cubic-bezier(0.4,0,0.2,1); }
        @keyframes cpIn { from { transform: translateX(var(--cp-from, 24px)); opacity: 0; }
                          to { transform: none; opacity: 1; } }
        :global(html[dir='rtl']) .cp { --cp-from: -24px; }
        .cp-head { position: sticky; top: 0; z-index: 1;
          display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3);
          padding: var(--space-5); background: var(--bg-secondary); border-bottom: 1px solid var(--border); }
        .cp-title h2 { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
        .cp-url { font-size: var(--text-sm); color: var(--accent); }
        .cp-x { width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%;
          background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary);
          font-size: 22px; line-height: 1; cursor: pointer; font-family: inherit; }
        .cp-x:hover { color: var(--text-primary); }
        .cp-x:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .cp-body { padding: var(--space-5); }
        .cp-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
          background: var(--border); border: 1px solid var(--border); border-radius: var(--radius-md);
          overflow: hidden; margin-bottom: var(--space-4); }
        .cp-facts > div { background: var(--bg-elevated); padding: 10px var(--space-3); min-width: 0; }
        .cp-facts dt { font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: 3px; }
        .cp-facts dd { margin: 0; font-size: var(--text-md); color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cp-inline { margin-inline-start: 8px; padding: 1px 8px; background: var(--bg-hover);
          border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-secondary);
          font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer; vertical-align: middle; }
        .cp-inline:hover { color: var(--text-primary); border-color: var(--border-strong); }
        .cp-inline:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .cp-email { padding: var(--space-3); margin-bottom: var(--space-4);
          background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius-md); }
        .cp-email label { display: block; font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: 6px; }
        .cp-email-row { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
        .cp-email-row input { flex: 1 1 200px; min-width: 0; padding: 9px var(--space-3);
          background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-primary); font: inherit; font-size: var(--text-md); }
        .cp-email-row input:focus { outline: none; border-color: var(--accent); }
        .cp-email-note { margin-top: 8px; font-size: var(--text-xs); color: var(--text-muted); }
        .cp-email-err { margin-top: 8px; font-size: var(--text-sm); color: var(--danger); }
        .cp-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
        .cp-h { font-size: var(--text-sm); font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--text-tertiary); margin: var(--space-5) 0 var(--space-2); }
        :global(html[dir='rtl']) .cp-h { text-transform: none; letter-spacing: normal; }
        @media (max-width: 640px) {
          .cp { width: 100%; }
          .cp-facts { grid-template-columns: 1fr; }
        }
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
  // False until section-g-handoff.sql is applied; suppresses the whole pending
  // section rather than showing an empty or wrong one.
  const [handoffReady, setHandoffReady] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const confirm = useConfirm();

  // Accounts holding an email/username but belonging to no workspace. They are
  // invisible to list_workspace_members (it JOINs tenant_admins), so they come
  // from the recovery function instead. Empty for most people, most of the time.
  const [openId, setOpenId] = useState(null);
  const [orphans, setOrphans] = useState([]);
  const [orphanBusy, setOrphanBusy] = useState(null);

  async function loadOrphans() {
    try {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'list_orphans' },
      });
      if (error || data?.error) { setOrphans([]); return; }
      setOrphans(data?.orphans || []);
    } catch (_) {
      // Non-fatal: the Clients list is useful without this section.
      setOrphans([]);
    }
  }

  // Frees the email and username WITHOUT deleting the account — the address is
  // parked on an unroutable domain and the originals are kept in metadata.
  async function releaseAccount(o) {
    const ok = await confirm({
      title: ar ? 'تحرير هذا البريد؟' : 'Release this email?',
      description: ar
        ? `سيصبح ${o.email} متاحًا للاستخدام من جديد. لا يُحذف الحساب — يُنقل بريده إلى عنوان محفوظ ويمكن التراجع.`
        : `${o.email} becomes available again. The account is NOT deleted — its address is parked and the original is kept, so this can be undone.`,
      confirmLabel: ar ? 'تحرير' : 'Release',
      cancelLabel: ar ? 'إلغاء' : 'Cancel',
    });
    if (!ok) return;
    setResetErr(''); setOrphanBusy(o.user_id);
    try {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'release_account', user_id: o.user_id },
      });
      const failed = error || data?.error;
      if (failed) { setResetErr(recoveryError(failed, data, ar)); return; }
      setOrphans((list) => list.filter((x) => x.user_id !== o.user_id));
    } catch (err) {
      console.error('[recovery] release failed:', err);
      setResetErr(ar ? 'تعذّر تحرير الحساب.' : 'Could not release the account.');
    } finally { setOrphanBusy(null); }
  }

  // Row-level busy flag, so one row's spinner never freezes the whole queue.
  const [rowBusy, setRowBusy] = useState(null);

  // Re-open the handoff modal for credentials still held in this session. This
  // is the whole point of lib/handoff-store.js: closing the modal is no longer
  // destructive.
  function openStoredCreds(row) {
    const held = recallCredentials(row.id);
    if (held) setResetCreds(held);
  }

  // Same operation as the pending row's editor, shaped for inline display: the
  // panel shows the reason next to the field rather than in a page-level banner.
  async function saveClientEmailFromPanel(row, email) {
    const m = row.member;
    if (!m) return { error: ar ? 'لا يوجد حساب لهذه المساحة.' : 'This workspace has no account.' };
    try {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'update_email', user_id: m.user_id, email },
      });
      const failed = error || data?.error;
      if (failed) return { error: recoveryError(failed, data, ar) };
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, member: { ...r.member, email } } : r)));
      return {};
    } catch (err) {
      console.error('[recovery] panel email update failed:', err);
      return { error: ar ? 'تعذّر تحديث البريد.' : 'Could not update the email.' };
    }
  }

  // Correct a mistyped address on the EXISTING account. No new user, no new
  // workspace — that path (invite-client) would fail on email_taken anyway.
  async function saveClientEmail(row, email) {
    const m = row.member;
    if (!m || !email) return;
    setResetErr(''); setRowBusy(row.id);
    try {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'update_email', user_id: m.user_id, email },
      });
      const failed = error || data?.error;
      if (failed) { setResetErr(recoveryError(failed, data, ar)); return; }
      // Reflect it immediately; the next load re-reads it from the RPC anyway.
      setRows((rs) => rs.map((r) => (r.id === row.id
        ? { ...r, member: { ...r.member, email } } : r)));
    } catch (err) {
      console.error('[recovery] email update failed:', err);
      setResetErr(ar ? 'تعذّر تحديث البريد.' : 'Could not update the email.');
    } finally { setRowBusy(null); }
  }

  // Re-send the welcome. This ISSUES A NEW PASSWORD by necessity — the original
  // is only a hash server-side — so the fresh set is stored and shown, exactly
  // like a first invite.
  async function sendWelcome(row) {
    const m = row.member;
    if (!m) return;
    const ok = await confirm({
      title: ar ? 'إرسال بريد الترحيب؟' : 'Send the welcome email?',
      description: ar
        ? `سيُرسل إلى ${m.email} بكلمة مرور مؤقتة جديدة. الكلمة الحالية ستتوقف فورًا.`
        : `This goes to ${m.email} with a NEW temporary password. Their current one stops working immediately.`,
      confirmLabel: ar ? 'إرسال' : 'Send',
      cancelLabel: ar ? 'إلغاء' : 'Cancel',
    });
    if (!ok) return;
    setResetErr(''); setRowBusy(row.id);
    try {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'send_welcome', user_id: m.user_id },
      });
      const failed = error || data?.error;
      if (failed) { setResetErr(recoveryError(failed, data, ar)); return; }
      const issued = {
        tenantId: row.id,
        workspace: workspaceLabel(row),
        url: portfolioUrl(typeof window !== 'undefined' ? window.location.origin : '', row.slug),
        signInUrl: adminRedirectUrl(),
        email: data?.email || m.email,
        username: data?.username || m.username,
        password: data?.temp_password || '',
        userId: m.user_id,
        emailed: data?.emailed === true,
        emailError: data?.email_error || null,
      };
      rememberCredentials(row.id, issued);
      setResetCreds(issued);
    } catch (err) {
      console.error('[recovery] send welcome failed:', err);
      setResetErr(ar ? 'تعذّر إرسال البريد.' : 'Could not send the email.');
    } finally { setRowBusy(null); }
  }

  // The client has the credentials — move the workspace into the normal list.
  async function markHandedOver(row) {
    setResetErr('');
    setMarkingId(row.id);
    try {
      // An RLS-filtered UPDATE reports success having changed nothing
      // (HANDOFF §6), so the affected rows are what we check, not `error`.
      const { data, error } = await supabase
        .from('tenants')
        .update({ handed_over_at: new Date().toISOString() })
        .eq('id', row.id)
        .select('id');
      if (error || !data || data.length === 0) {
        setResetErr(ar
          ? 'تعذّر تحديث حالة التسليم. أعد المحاولة.'
          : 'Could not update the handoff status. Try again.');
        return;
      }
      // Declared delivered: the password must stop being readable from here.
      forgetCredentials(row.id);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, pendingHandoff: false } : r)));
    } catch (err) {
      console.error('[handoff] mark failed:', err);
      setResetErr(ar ? 'تعذّر تحديث حالة التسليم.' : 'Could not update the handoff status.');
    } finally {
      setMarkingId(null);
    }
  }

  // Recovery path for a client who lost their password.
  //
  // WHY THIS GOES THROUGH client-recovery AND NOT reset-client-password
  // -------------------------------------------------------------------
  // Both functions do the identical thing to the account — same 14-character
  // alphabet, same must_set_password re-arm, same owner and platform-owner
  // guards. The ONLY difference is that client-recovery/send_welcome then mails
  // the branded credentials in the client's own language, and
  // reset-client-password has no mail path at all. Pointing this button at the
  // one without email is why every reset ended with the owner opening Mail by
  // hand: the handoff panel was not falling back after a failed send, it was
  // reporting, correctly, that nothing had ever been attempted.
  //
  // reset-client-password stays as the FALLBACK, for the one case that made it
  // worth having: client-recovery not being reachable. It still resets, and the
  // owner still gets the password on screen to deliver themselves.
  async function resetPassword(row) {
    const m = row.member;
    if (!m) return;
    const ok = await confirm({
      title: ar ? 'إعادة تعيين كلمة المرور؟' : 'Reset this password?',
      description: ar
        ? `سيتم إنشاء كلمة مرور جديدة وتُرسل إلى ${m.email}. كلمتهم الحالية ستتوقف فورًا، وستظهر لك الجديدة مرة واحدة أيضًا.`
        : `A new password will be generated and emailed to ${m.email}. Their current one stops working immediately, and you will also be shown the new one once.`,
      confirmLabel: ar ? 'إعادة التعيين' : 'Reset',
      cancelLabel: ar ? 'إلغاء' : 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    setResetErr(''); setResetCreds(null); setResettingId(m.user_id);

    // Shared by both routes so the panel is populated identically either way.
    const issue = (data, emailed, emailError) => {
      const issued = {
        tenantId: row.id,
        workspace: workspaceLabel(row),
        url: portfolioUrl(typeof window !== 'undefined' ? window.location.origin : '', row.slug),
        signInUrl: adminRedirectUrl(),
        email: data?.email || m.email,
        username: data?.username || m.username,
        password: data?.temp_password || '',
        userId: m.user_id,
        emailed,
        emailError,
      };
      rememberCredentials(row.id, issued);
      setResetCreds(issued);
    };

    try {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'send_welcome', user_id: m.user_id },
      });
      const failed = error || data?.error;
      if (!failed) {
        // The password was rotated AND the send was attempted. `emailed` is the
        // function's own answer, so the panel's manual routes appear only when
        // the mail genuinely did not leave — which is what they are for.
        issue(data, data?.emailed === true, data?.email_error || null);
        return;
      }

      // A real, explicable rejection — not a client of any workspace, a platform
      // owner, a bad id. Retrying against the other function would fail the same
      // way for the same reason, so say so instead of resetting anything.
      const code = String(data?.error || error?.message || '');
      const unreachable = /not.?found|failed to send|fetch|404/i.test(code);
      if (!unreachable) {
        setResetErr(recoveryError(failed, data, ar));
        return;
      }

      // client-recovery is not deployed or not reachable. Reset anyway through
      // the function that has no mail path, and let the panel say plainly that
      // delivery is now the owner's job.
      console.error('[reset] client-recovery unreachable, falling back to reset-client-password:', code);
      const { data: fb, error: fbErr } = await supabase.functions.invoke('reset-client-password', {
        body: { user_id: m.user_id },
      });
      if (fbErr) {
        let msg = fbErr.message;
        try {
          const b = await fbErr.context?.json?.();
          if (b?.detail) msg = `${b.error || 'reset_failed'}: ${b.detail}`;
          else if (b?.error) msg = b.error;
        } catch (_) {}
        setResetErr(msg || (ar ? 'فشلت إعادة التعيين' : 'Reset failed'));
        return;
      }
      if (fb?.error) { setResetErr(fb.detail ? `${fb.error}: ${fb.detail}` : fb.error); return; }
      issue(fb, false, 'recovery_function_unavailable');
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
      const [{ data: profiles }, { data: projects }, { data: domains }, { data: members }, handoff] = await Promise.all([
        supabase.from('profile').select('tenant_id,name,bio,profile_image,brand_logo,custom_links,appearance').in('tenant_id', ids),
        supabase.from('projects').select('tenant_id').in('tenant_id', ids),
        supabase.from('tenant_domains').select('tenant_id,domain,is_primary').in('tenant_id', ids),
        // Which email belongs to which workspace. Has to be an RPC: tenant_admins and
        // admin_usernames are both readable only for your OWN rows, so the browser
        // cannot join a workspace to its client. Owner-gated inside the function, and
        // it never returns platform owners — only clients.
        supabase.rpc('list_workspace_members'),
        // Pending-handoff state. Its own query, and its own failure mode: the
        // column arrives with supabase/sections/section-g-handoff.sql, so until
        // that migration is applied this SELECT errors with 42703 and every
        // workspace is treated as already handed over. The Clients list then
        // behaves exactly as it did before the feature rather than breaking.
        supabase.from('tenants').select('id,handed_over_at').in('id', ids),
      ]);
      const handoffReady = !handoff.error;
      if (handoff.error) console.warn('[handoff] column not available yet:', handoff.error.message);
      const hmap = {};
      (handoff.data || []).forEach((t) => { hmap[t.id] = t.handed_over_at; });
      const pcount = {}; (projects || []).forEach((p) => { pcount[p.tenant_id] = (pcount[p.tenant_id] || 0) + 1; });
      const pmap = {}; (profiles || []).forEach((p) => { pmap[p.tenant_id] = p; });
      const dmap = {}; (domains || []).forEach((d) => { (dmap[d.tenant_id] = dmap[d.tenant_id] || []).push(d); });
      const mmap = {}; (members || []).forEach((m) => { mmap[m.tenant_id] = m; });
      const out = tenants.map((x) => {
        const s = computeSetup({ profile: pmap[x.id], projectCount: pcount[x.id] || 0, domainCount: (dmap[x.id] || []).length });
        const dom = (dmap[x.id] || []).find((d) => d.is_primary) || (dmap[x.id] || [])[0];
        return {
          id: x.id, slug: x.slug, name: x.name || x.slug, status: x.status, percent: s.percent,
          // "Live" means a visitor would see a real page, not that a row exists —
          // the same test the public site uses to decide whether to render.
          live: hasPublicContent(pmap[x.id], pcount[x.id] || 0),
          siteUrl: portfolioUrl(typeof window !== 'undefined' ? window.location.origin : '', x.slug) || `/${x.slug}`,
          domain: dom?.domain || `/${x.slug}`,
          domainStatus: dom ? dom.status : null,
          isPrimary: !!dom?.is_primary,
          member: mmap[x.id] || null,
          pendingHandoff: handoffReady && !hmap[x.id],
        };
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (!cancelled) { setRows(out); setHandoffReady(handoffReady); setLoading(false); }
      if (!cancelled) loadOrphans();
    })();
    return () => { cancelled = true; };
  }, [tenants, adding]);

  // Split once. When the handoff column is missing every row reports
  // pendingHandoff:false, so `pending` is empty and this renders as one list.
  const pending = rows.filter((r) => r.pendingHandoff);
  const active = rows.filter((r) => !r.pendingHandoff);

  return (
    <div className="editor">
      {/* One list, one primary action. Onboarding used to live at the bottom of the
          Account screen, under this person's own password change, which is why
          nobody could find it or tell the two apart. */}
      <div className="editor-header">
        <h1>{ar ? 'المواقع' : 'Sites'} <span className="meta">· {rows.length}</span></h1>
        <Button size="sm" onClick={() => setAdding(true)}>+ {ar ? 'إضافة عميل' : 'Add client'}</Button>
      </div>
      <p className="hint">{ar
        ? 'كل عميل هو مساحة وموقع واحد. اضغط عليه لإدارته دون تبديل مساحة العمل النشطة.'
        : 'One client is one workspace and one site. Tap to manage them without switching the active workspace.'}</p>

      {/* The four questions worth answering at a glance. Every number here comes
          from data the list already loaded — none of it needed a new query. */}
      {!loading && rows.length > 0 && (
        <div className="cl-stats">
          {[
            [ar ? 'العملاء' : 'Clients', rows.length, ''],
            [ar ? 'منشور' : 'Live', rows.filter((r) => r.live).length, 'ok'],
            [ar ? 'لم يدخل بعد' : 'Never signed in', rows.filter((r) => r.member && !r.member.last_sign_in_at).length, 'warn'],
            [ar ? 'يحتاج انتباهك' : 'Needs you', rows.filter((r) => r.pendingHandoff || !r.member).length, 'warn'],
          ].map(([label, n, tone]) => (
            <div key={label} className={`cl-stat ${n > 0 ? tone : ''}`}>
              <span className="cl-stat-n">{n}</span>
              <span className="cl-stat-l">{label}</span>
            </div>
          ))}
        </div>
      )}

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
        <CredentialsHandoff
          creds={resetCreds}
          lang={lang}
          title={ar ? 'كلمة مرور جديدة' : 'New password'}
          intro={ar
            ? 'كلمتهم القديمة توقّفت الآن. سلّم هذه البيانات، وسيُطلب منهم تغييرها عند الدخول.'
            : 'Their old password has stopped working. Hand these over — they will be asked to change it on sign-in.'}
          onUpdateEmail={makeEmailUpdater(resetCreds, setResetCreds, ar)}
          onClose={() => setResetCreds(null)}
        />
      )}

      {loading ? (
        <div className="list-skel" aria-busy="true">
          <Skeleton width="100%" height={56} radius="var(--radius-md)" />
          <Skeleton width="100%" height={56} radius="var(--radius-md)" />
          <Skeleton width="100%" height={56} radius="var(--radius-md)" />
        </div>
      ) : rows.length === 0 ? (
        <div className="hint">{ar ? 'لا يوجد عملاء بعد.' : 'No clients yet.'}</div>
      ) : (
        <>
        {/* UNATTACHED LOGINS — accounts whose workspace was deleted. They keep
            holding an email and a username, which is why that address cannot be
            reused; releasing frees both without destroying the account. Hidden
            entirely when there are none, which is the normal state. */}
        {orphans.length > 0 && (
          <section className="orph">
            <h2 className="ph-title">
              {ar ? 'حسابات بلا مساحة' : 'Unattached logins'}
              <span className="meta">· {orphans.length}</span>
            </h2>
            <p className="hint">{ar
              ? 'مساحاتها حُذفت لكن الحساب بقي محتفظًا بالبريد واسم المستخدم — لذلك لا يمكن إعادة استخدامهما. التحرير يعيدهما دون حذف الحساب.'
              : 'Their workspace was deleted but the account kept the email and username — which is why that address cannot be reused. Releasing frees both without deleting anything.'}</p>
            <div className="cl-list">
              {orphans.map((o) => (
                <Card key={o.user_id} pad="none" className="cl-row orph-row">
                  <div className="cl-open orph-main">
                    <div className="cl-main">
                      <div className="cl-name" dir="ltr">{o.email || '—'}</div>
                      <div className="cl-who" dir="ltr">
                        {o.username ? `@${o.username} · ` : ''}
                        {ar ? 'أُنشئ' : 'created'} {o.created_at ? String(o.created_at).slice(0, 10) : '—'}
                        {' · '}
                        {o.last_sign_in_at
                          ? (ar ? 'سجّل دخوله من قبل' : 'has signed in before')
                          : (ar ? 'لم يسجّل دخوله قط' : 'never signed in')}
                      </div>
                    </div>
                    {o.released
                      ? <Badge tone="success" dot>{ar ? 'محرَّر' : 'Released'}</Badge>
                      : <Badge tone="warning" dot>{ar ? 'يحجز بريدًا' : 'Holding an email'}</Badge>}
                  </div>
                  {!o.released && (
                    <div className="cl-actions">
                      <Button
                        type="button" variant="secondary" size="sm"
                        loading={orphanBusy === o.user_id}
                        onClick={() => releaseAccount(o)}
                      >
                        {ar ? 'تحرير البريد' : 'Release email'}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* PENDING HANDOVER — the onboarding queue. A workspace sits here from
            the moment it is created until the admin confirms the client actually
            received their login. Every recovery route lives on the row, so a
            mistyped address is a two-click fix rather than a lost workspace. */}
        {pending.length > 0 && (
          <section className="ph">
            <h2 className="ph-title">
              {ar ? 'بانتظار التسليم' : 'Pending handover'}
              <span className="meta">· {pending.length}</span>
            </h2>
            <p className="hint">{ar
              ? 'أُنشئت هذه المساحات ولم تؤكد بعد أن العميل استلم بياناته. صحّح البريد أو أعد إرسال الترحيب من هنا — لا حاجة لإنشاء مساحة جديدة.'
              : 'Created, but you have not confirmed the client has their login. Fix the address or re-send the welcome from here — never by making a second workspace.'}</p>
            <div className="cl-list">
              {pending.map((r) => (
                <PendingRow
                  key={r.id}
                  row={r}
                  lang={lang}
                  busy={rowBusy}
                  onOpen={() => setOpenId(r.id)}
                  onViewCreds={() => openStoredCreds(r)}
                  onSendWelcome={() => sendWelcome(r)}
                  onResetPassword={() => resetPassword(r)}
                  onSaveEmail={(email) => saveClientEmail(r, email)}
                  onMarkDone={() => markHandedOver(r)}
                />
              ))}
            </div>
          </section>
        )}

        {pending.length > 0 && active.length > 0 && (
          <h2 className="ph-title">{ar ? 'العملاء النشطون' : 'Active clients'} <span className="meta">· {active.length}</span></h2>
        )}
        <div className="cl-list">
          {active.map((r) => (
            /* The row is a DIV, not a button: it now contains its own buttons, and a
               button inside a button is invalid and unclickable in places. */
            <Card key={r.id} pad="none" className="cl-row">
              <button type="button" className="cl-open" onClick={() => setOpenId(r.id)}>
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
                {r.status === 'disabled'
                  ? <Badge tone="danger" dot>{ar ? 'معلّق' : 'Suspended'}</Badge>
                  : <Badge tone={clientStage(r).tone} dot>{clientStage(r).label(ar)}</Badge>}
                <span className="cl-pct">{formatSeen(r.member?.last_sign_in_at, ar)}</span>
              </button>
              {r.member && (
                <div className="cl-actions">
                  {/* === true, matching SetPasswordGate at the top of this file.
                      HARDENING, NOT A BUG FIX: every stored value today is a
                      real jsonb boolean, so loose truthiness behaves
                      identically and this changes nothing for current users.
                      It matters because user_metadata is schemaless — anything
                      writing the STRING "false" would make this render
                      "password not set yet" forever, and the natural response
                      to that flag is to reset the password or re-send the
                      welcome, both of which DESTROY a working password (§7d).
                      Cheap guard against an expensive failure. */}
                  {r.member.must_set_password === true && (
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
        </>
      )}
      {openId && (() => {
        const r = rows.find((x) => x.id === openId);
        const t = tenants.find((x) => x.id === openId) || r;
        if (!r) return null;
        return (
          <ClientPanel
            row={r}
            tenantRow={t}
            lang={lang}
            onClose={() => setOpenId(null)}
            onOpenEditor={() => { setOpenId(null); onOpen(r.id); }}
            actions={{
              hasCreds: !!recallCredentials(r.id),
              onViewCreds: () => openStoredCreds(r),
              onSaveEmail: (email) => saveClientEmailFromPanel(r, email),
              onSendWelcome: () => sendWelcome(r),
              onResetPassword: () => resetPassword(r),
            }}
          />
        );
      })()}

      <AdminStyles />
      <style jsx>{`
        .cl-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: var(--space-2); max-width: 720px; margin-bottom: var(--space-5); }
        .cl-stat { padding: var(--space-3); background: var(--bg-elevated);
          border: 1px solid var(--border); border-radius: var(--radius-md); }
        .cl-stat.ok { border-color: var(--success-border); }
        .cl-stat.warn { border-color: var(--warning-border); }
        .cl-stat-n { display: block; font-size: var(--text-2xl); font-weight: 700;
          line-height: 1.1; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .cl-stat.ok .cl-stat-n { color: var(--success); }
        .cl-stat.warn .cl-stat-n { color: var(--warning); }
        .cl-stat-l { display: block; margin-top: 2px; font-size: var(--text-xs); color: var(--text-tertiary); }
        .ph { margin-bottom: var(--space-6); }
        .orph { margin-bottom: var(--space-6); }
        .orph :global(.orph-row) { border-color: var(--border-strong); }
        .orph-main { cursor: default; }
        .ph-title { margin-top: var(--space-5); }
        /* A pending workspace is an open task, not a fault — warning, not danger. */
        .ph :global(.ph-row) { border-color: var(--warning-border); background: var(--warning-bg); }
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
        .cl-pct { font-size: var(--text-xs); color: var(--text-muted); min-width: 76px; text-align: end; flex-shrink: 0; white-space: nowrap; }
      `}</style>
    </div>
  );
}

// =========================================================
// Billing — the client's own subscription
// =========================================================
// Where a customer manages the funding source behind their subscription. It is
// PayPal's own page, not ours — there is nothing on this origin that could
// change a card, which is the point of using a hosted provider.
const PAYPAL_ACCOUNT_URL = 'https://www.paypal.com/myaccount/autopay/';

// Every billing call goes through here. `edgeErrorCode` is what makes the
// server's own error code visible at all — supabase-js hides a non-2xx body
// behind error.context and reports the same generic sentence otherwise.
// Throws the CODE, so callers can map it or show it.
async function invokeBilling(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  const code = await edgeErrorCode(error, data);
  if (code) throw new Error(code);
  return data;
}

// Reads `subscriptions`, `payments` and `billing_customers`, all of which the
// browser may SELECT for its own tenant and may not write at all — see
// supabase/sections/section-h-billing.sql. Every mutation here goes through the
// billing-subscription Edge Function, which changes PayPal FIRST and lets the
// webhook write the row.
//
// There is no card on file to display, because with PayPal there is no card on
// file: the funding source lives in the customer's PayPal account and is
// managed there. This screen shows which PayPal account is attached and links
// out for anything else.
function BillingEditor({ t, lang }) {
  const ar = lang === 'ar';
  const confirm = useConfirm();
  const toast = useToast();

  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sub, setSub] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [payments, setPayments] = useState([]);
  // Preselected from `?plan=` when they arrive straight from signup, so the
  // plan chosen on the marketing site is the one already highlighted here.
  // Read once, in the initialiser: doing it in an effect would overwrite a
  // choice they had already changed by hand.
  const [selected, setSelected] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_PLAN_CODE;
    return planFromQuery(window.location.search) || DEFAULT_PLAN_CODE;
  });
  const [busy, setBusy] = useState(false);

  // Both readers have taken their copy by now (Dashboard chose the tab, the
  // initialiser above chose the plan), so drop it from the URL. Same reason
  // the ?checkout= flag is dropped: a refresh or a back-navigation should not
  // silently re-apply an intent from minutes ago and override a choice the
  // person has since made by hand.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('plan')) return;
      url.searchParams.delete('plan');
      window.history.replaceState({}, '', url.toString());
    } catch (_) {}
  }, []);

  const plans = useMemo(() => listPlans(), []);
  const billing = useMemo(() => deriveBilling(sub), [sub]);
  const currentPlan = sub?.plan_code ? getPlan(sub.plan_code) : null;

  const load = useCallback(async () => {
    if (!tenant) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [subRes, payRes, custRes] = await Promise.all([
        supabase.from('subscriptions').select('*').eq('tenant_id', tenant.id).maybeSingle(),
        supabase.from('payments')
          .select('id, created_at, amount, currency, status, description, failure_reason')
          .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(24),
        supabase.from('billing_customers').select('email, provider').eq('tenant_id', tenant.id).maybeSingle(),
      ]);
      // A read error here is a real misconfiguration (the migration not applied,
      // a missing policy) and must stay visible rather than rendering as "not
      // subscribed" — which would invite a client to buy something twice.
      if (subRes.error) throw new Error(subRes.error.message);

      setSub(subRes.data ?? null);
      setPayments(payRes.data ?? []);
      setCustomer(custRes.data ?? null);
      const code = subRes.data?.plan_code;
      setSelected(code && getPlan(code) ? code : DEFAULT_PLAN_CODE);
    } catch (err) {
      console.error('[billing] load failed:', err);
      setError(t('billing_load_failed'));
    } finally {
      // try/finally, not a trailing setLoading: a throw here otherwise leaves
      // the screen stuck on its skeleton forever (HANDOFF §8).
      setLoading(false);
    }
  }, [tenant, t]);

  useEffect(() => { load(); }, [load]);

  // POST-CHECKOUT ACTIVATION POLL.
  //
  // Activation is asynchronous by design: the customer returns from PayPal the
  // moment they approve, but the subscription only becomes real when the
  // ACTIVATED webhook lands — ~40 seconds later in the verified run. Fetching
  // once on mount therefore renders "pending" indefinitely.
  //
  // shouldPollForActivation() holds the decision (and its tests); this is the
  // timer around it. See lib/billing-poll.js for why BOTH conditions matter.
  const [pollAttempts, setPollAttempts] = useState(0);
  const [returnedFromCheckout, setReturnedFromCheckout] = useState(false);

  useEffect(() => {
    try {
      const flag = new URLSearchParams(window.location.search).get('checkout');
      setReturnedFromCheckout(flag === 'success');
    } catch (_) {}
  }, []);

  const polling = shouldPollForActivation({
    state: billing.state, returnedFromCheckout, attempts: pollAttempts,
  });

  useEffect(() => {
    if (!polling) {
      // Resolved, or gave up. Drop the flag from the URL so a refresh or a
      // back-navigation cannot restart the countdown.
      if (returnedFromCheckout && billing.state !== 'pending') {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('checkout');
          window.history.replaceState({}, '', url.toString());
        } catch (_) {}
        setReturnedFromCheckout(false);
      }
      return undefined;
    }
    // A timeout re-armed by the attempt counter, not an interval: load() is
    // async, and an interval would stack requests if one were slow.
    const id = setTimeout(() => { setPollAttempts((n) => n + 1); load(); }, POLL_INTERVAL_MS);
    // Cleared on unmount, or a tab switch mid-poll leaves a timer calling
    // load() against a screen that is no longer mounted.
    return () => clearTimeout(id);
  }, [polling, returnedFromCheckout, billing.state, load]);

  // Checkout is a PAGE, not a modal, and it is the same page the owner's
  // payment link opens. One checkout, two doors — see /subscribe.
  function goToCheckout(planCode) {
    const params = new URLSearchParams({ plan: planCode, tenant: tenant.id });
    if (tenant.name || tenant.slug) params.set('w', tenant.name || tenant.slug);
    window.location.href = `/subscribe?${params.toString()}`;
  }

  // Every mutation takes the same shape: ask the Edge Function, which asks
  // PayPal, then reload from the database. Nothing is written locally on
  // optimism — a row that says "cancelled" while PayPal keeps billing is the
  // worst outcome available here.
  async function callBilling(body) {
    return await invokeBilling('billing-subscription', { tenant_id: tenant.id, ...body });
  }

  async function changePlan() {
    const kind = planChangeKind(sub?.plan_code, selected);
    if (kind === 'same' || !kind) return;
    const target = getPlan(selected);
    const ok = await confirm({
      title: kind === 'upgrade' ? t('billing_upgrade_to') : t('billing_downgrade_to'),
      description: `${target.name[ar ? 'ar' : 'en']} — ${formatAmount(target.amount, lang)} ${formatInterval(target, lang)}. ${
        kind === 'upgrade' ? t('billing_upgrade_note') : t('billing_downgrade_note')}`,
      confirmLabel: t('billing_apply_change'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await callBilling({ action: 'change_plan', plan_code: selected });
      // PayPal often wants the customer to agree to a new price. When it does,
      // NOTHING has changed yet, so send them to approve rather than showing a
      // plan they are not on.
      if (res.requires_approval && res.approve_url) {
        window.location.href = res.approve_url;
        return;
      }
      toast.success(t('saved'));
      await load();
    } catch (_) {
      toast.error(t('save_failed'));
    } finally { setBusy(false); }
  }

  async function cancelSubscription() {
    const ok = await confirm({
      title: t('billing_cancel_title'),
      description: t('billing_cancel_desc'),
      confirmLabel: t('billing_cancel_confirm'),
      cancelLabel: t('billing_keep'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await callBilling({ action: 'cancel' });
      await load();
    } catch (_) {
      toast.error(t('save_failed'));
    } finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div className="editor">
        <h1>{t('billing_title')}</h1>
        <div className="list-skel" aria-busy="true">
          <Skeleton width="100%" height={120} radius="var(--radius-md)" />
          <Skeleton width="100%" height={72} radius="var(--radius-md)" />
          <Skeleton width="100%" height={140} radius="var(--radius-md)" />
        </div>
        <AdminStyles />
      </div>
    );
  }

  if (error) {
    return (
      <div className="editor">
        <h1>{t('billing_title')}</h1>
        <EmptyState
          icon="⚠️"
          title={error}
          action={<Button variant="secondary" size="sm" onClick={load}>{t('billing_retry')}</Button>}
        />
        <AdminStyles />
      </div>
    );
  }

  // A cancelling subscription is still ENTITLED — they paid for the rest of the
  // period — but it must not be changed. PayPal cancellation is terminal, so a
  // revise against it returns an error, and offering an upgrade to someone who
  // just cancelled is a poor thing to do regardless.
  const canChangePlan = billing.entitled
    && billing.state !== 'comped'
    && billing.state !== 'canceling'
    && billing.state !== 'canceled';

  return (
    <div className="editor">
      <h1>{t('billing_title')}</h1>
      <p className="hint">{t('billing_sub')}</p>

      {/* ---- CURRENT PLAN ---------------------------------------------- */}
      {billing.state === 'none' ? (
        <>
          <EmptyState
            icon="✦"
            title={t('billing_none_title')}
            description={t('billing_none_desc')}
          />
          <h2>{t('billing_choose_plan')}</h2>
          <PlanPicker plans={plans} value={selected} onChange={setSelected} lang={lang} />
          <div className="bl-cta">
            <Button onClick={() => goToCheckout(selected)}>{t('billing_subscribe')}</Button>
            <span className="bl-secure">{t('billing_secure_note')}</span>
          </div>
        </>
      ) : (
        <>
          <Card pad="lg" className="bl-plan">
            <div className="bl-plan-head">
              <div>
                <div className="bl-plan-name">{planName(sub.plan_code, lang)}</div>
                {currentPlan && (
                  <div className="bl-plan-price">
                    {formatAmount(currentPlan.amount, lang)} · {formatInterval(currentPlan, lang)}
                  </div>
                )}
              </div>
              <Badge tone={billing.tone} dot>{statusLabel(billing.state, lang)}</Badge>
            </div>
            <p className="bl-sentence">{statusSentence(billing, lang)}</p>

            {/* A failed payment is the one state that needs an action rather
                than a status. The action is at PAYPAL, not here: the funding
                source lives in their PayPal account, so there is nothing this
                screen could collect that would fix it. */}
            {billing.state === 'past_due' && (
              <div className="bl-alert warn">
                <span>{ar
                  ? `يتبقّى ${billing.daysLeft} يومًا قبل إيقاف الوصول.`
                  : `${billing.daysLeft} days left before access stops.`}</span>
                <span className="bl-alert-actions">
                  <a className="bl-alert-link" href={PAYPAL_ACCOUNT_URL} target="_blank" rel="noopener noreferrer">
                    {t('billing_retry_now')}
                  </a>
                </span>
              </div>
            )}

            {/* Approved nowhere yet — created at PayPal and abandoned before
                approval. Starting a fresh checkout is the way out. */}
            {billing.state === 'pending' && (
              <div className="bl-alert warn">
                {/* "Finish approving at PayPal" is WRONG for someone who just
                    did — they are waiting on our webhook, not on themselves.
                    While polling, say what is actually happening; once the
                    window closes, fall back to the actionable message. */}
                <span>{polling ? t('billing_confirming_payment') : t('billing_finish_approval')}</span>
                {!polling && (
                  <Button size="sm" onClick={() => goToCheckout(sub.plan_code)}>{t('billing_subscribe')}</Button>
                )}
              </div>
            )}

            {/* PayPal cancellation is TERMINAL — a cancelled subscription
                cannot be reactivated through the API, so this offers a new
                subscription rather than a "resume" button that would fail. */}
            {billing.state === 'canceling' && (
              <div className="bl-alert warn">
                <span>{ar
                  ? `الوصول متاح حتى ${formatBillingDate(billing.endsAt, lang)}.`
                  : `Access runs until ${formatBillingDate(billing.endsAt, lang)}.`}</span>
                <Button size="sm" onClick={() => goToCheckout(sub.plan_code)}>{t('billing_subscribe_again')}</Button>
              </div>
            )}

            {billing.state === 'comped' && <p className="bl-comped">{t('billing_comped_note')}</p>}
          </Card>

          {/* ---- PAYMENT METHOD ------------------------------------------ */}
          {/* There is no card to show. PayPal holds the funding source and is
              where it is changed — this is a link out, not a form. */}
          {billing.state !== 'comped' && (
            <>
              <h2>{t('billing_payment_method')}</h2>
              <Card pad="md" className="bl-card-row">
                <div>
                  <div className="bl-card-num">{t('billing_paypal_account')}</div>
                  <div className="bl-card-exp" dir="ltr">
                    {customer?.email || t('billing_no_paypal_account')}
                  </div>
                </div>
                <a className="bl-out" href={PAYPAL_ACCOUNT_URL} target="_blank" rel="noopener noreferrer">
                  {t('billing_manage_at_paypal')}
                </a>
              </Card>
              <p className="hint">{t('billing_manage_at_paypal_hint')}</p>
            </>
          )}

          {/* ---- CHANGE PLAN --------------------------------------------- */}
          {canChangePlan && (
            <>
              <h2>{t('billing_change_plan')}</h2>
              <PlanPicker
                plans={plans}
                value={selected}
                onChange={setSelected}
                lang={lang}
                currentCode={sub.plan_code}
                disabled={busy}
              />
              {selected !== sub.plan_code && (
                <div className="bl-cta">
                  <Button loading={busy} onClick={changePlan}>{t('billing_apply_change')}</Button>
                  <span className="bl-secure">
                    {planChangeKind(sub.plan_code, selected) === 'upgrade'
                      ? t('billing_upgrade_note')
                      : t('billing_downgrade_note')}
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---- HISTORY ----------------------------------------------------- */}
      <h2>{t('billing_history')}</h2>
      {payments.length === 0 ? (
        <p className="hint">{t('billing_history_empty')}</p>
      ) : (
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <th scope="col">{t('billing_col_date')}</th>
                <th scope="col" className="bl-col-desc">{t('billing_col_desc')}</th>
                <th scope="col">{t('billing_col_amount')}</th>
                <th scope="col">{t('billing_col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatBillingDate(p.created_at, lang)}</td>
                  {/* description is written by the webhook and is not
                      translated — it names the plan that was charged. */}
                  <td className="bl-col-desc">{p.description || planName(sub?.plan_code, lang)}</td>
                  {/* Charged in the BILLING currency, so it is rendered in that
                      currency — showing a USD debit as riyals would not match
                      their statement. */}
                  <td className="bl-amount">{formatAmount(p.amount, lang, p.currency || BILLING_CURRENCY)}</td>
                  <td><Badge tone={paymentTone(p.status)}>{paymentLabel(p.status, lang)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- CANCEL ------------------------------------------------------ */}
      {canChangePlan && billing.state !== 'canceling' && (
        <>
          <h2 className="bl-danger-heading">{t('billing_cancel')}</h2>
          <Card pad="md" className="bl-danger">
            <div className="bl-danger-desc">{t('billing_cancel_desc')}</div>
            <Button variant="danger" size="sm" loading={busy} onClick={cancelSubscription}>
              {t('billing_cancel_confirm')}
            </Button>
          </Card>
        </>
      )}

      <p className="bl-powered">{t('billing_powered_by')}</p>

      <AdminStyles />
      <style jsx>{`
        .bl-plan-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
        .bl-plan-name { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
        .bl-plan-price { margin-top: 2px; font-size: var(--text-sm); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
        .bl-sentence { margin: var(--space-3) 0 0; font-size: var(--text-md); color: var(--text-secondary); line-height: 1.6; }
        .bl-comped { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--text-tertiary); line-height: 1.6; }
        .bl-alert {
          display: flex; align-items: center; justify-content: space-between;
          gap: var(--space-3); flex-wrap: wrap;
          margin-top: var(--space-4); padding: var(--space-3);
          border-radius: var(--radius-md); font-size: var(--text-sm); line-height: 1.5;
        }
        .bl-alert.warn { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border); }
        .bl-alert-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .bl-cta { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-4); }
        .bl-secure { font-size: var(--text-xs); color: var(--text-tertiary); max-width: 42ch; line-height: 1.5; }
        .bl-card-num { font-size: var(--text-md); font-weight: 600; }
        .bl-card-exp { font-size: var(--text-xs); color: var(--text-tertiary); margin-top: 2px; }
        /* Links out to PayPal, styled as secondary buttons. Anchors rather than
           <Button> because they navigate away — a button that leaves the site
           is a lie to anyone using a screen reader or a middle click. */
        .bl-out, .bl-alert-link {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 6px var(--space-3); border-radius: var(--radius-md);
          border: 1px solid var(--border-strong); background: var(--bg-elevated);
          color: var(--text-primary); font-size: var(--text-sm); font-weight: 600;
          text-decoration: none; white-space: nowrap;
        }
        .bl-out:hover, .bl-alert-link:hover { border-color: var(--accent); color: var(--accent); }
        .bl-out:focus-visible, .bl-alert-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .bl-table-wrap { max-width: 640px; overflow-x: auto; }
        .bl-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
        .bl-table th {
          text-align: start; font-weight: 600; color: var(--text-tertiary);
          font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em;
          padding: 0 var(--space-3) var(--space-2); white-space: nowrap;
        }
        :global(html[dir='rtl']) .bl-table th { text-transform: none; letter-spacing: normal; }
        .bl-table td { padding: var(--space-3); border-top: 1px solid var(--border); color: var(--text-secondary); vertical-align: middle; }
        .bl-amount { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary); }
        .bl-danger-heading { color: var(--danger); margin-top: var(--space-8); }
        .bl-danger-desc { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-3); line-height: 1.6; }
        .bl-powered { margin-top: var(--space-6); font-size: var(--text-xs); color: var(--text-muted); }
        @media (max-width: 720px) {
          .bl-plan-head { flex-direction: column; }
          /* The description is the first thing to go on a narrow screen — the
             date, amount and status are what the row is read for. */
          .bl-col-desc { display: none; }
        }
      `}</style>
      <style jsx global>{`
        .editor .bl-plan { max-width: 640px; }
        .editor .bl-card-row {
          max-width: 640px; display: flex; align-items: center;
          justify-content: space-between; gap: var(--space-3); flex-wrap: wrap;
        }
        .editor .bl-danger { max-width: 640px; background: var(--danger-bg); border-color: var(--danger-border); }
      `}</style>
    </div>
  );
}

// =========================================================
// Subscribers — the owner's view of every paying workspace
// =========================================================
// The workspace list comes from `tenants`, which the admin has already loaded;
// the subscription for each comes from `subscriptions`, which an OWNER may read
// for every tenant because is_tenant_admin() is true for platform owners. The
// client email comes from list_workspace_members(), the same owner-gated RPC
// the Sites screen uses — tenant_admins and admin_usernames are readable only
// for your own rows, so there is no way to join it in the browser.
const SUBSCRIBER_FILTERS = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'active', ar: 'نشط', en: 'Active' },
  { id: 'inactive', ar: 'غير نشط', en: 'Inactive' },
  { id: 'failed', ar: 'دفعات متعثّرة', en: 'Failed payments' },
];

function SubscribersOverview({ lang, onOpen }) {
  const { tenants } = useTenant();
  const ar = lang === 'ar';
  const confirm = useConfirm();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [linkFor, setLinkFor] = useState(null); // { name, url } — the generated payment link

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      try {
        const ids = tenants.map((x) => x.id);
        if (ids.length === 0) { if (!cancelled) setRows([]); return; }
        const [subsRes, membersRes] = await Promise.all([
          supabase.from('subscriptions')
            .select('tenant_id, plan_code, status, comp_kind, amount, currency, current_period_end, cancel_at_period_end, grace_ends_at, trial_ends_at, created_at')
            .in('tenant_id', ids),
          supabase.rpc('list_workspace_members'),
        ]);
        if (subsRes.error) throw new Error(subsRes.error.message);

        const submap = {};
        (subsRes.data || []).forEach((s) => { submap[s.tenant_id] = s; });
        const memmap = {};
        (membersRes.data || []).forEach((m) => { memmap[m.tenant_id] = m; });

        const out = tenants.map((tenantRow) => ({
          id: tenantRow.id,
          name: tenantRow.name || tenantRow.slug,
          slug: tenantRow.slug,
          email: memmap[tenantRow.id]?.email || '',
          subscription: submap[tenantRow.id] || null,
        }));
        if (!cancelled) setRows(out);
      } catch (err) {
        console.error('[subscribers] load failed:', err);
        // Distinguishable from "nobody has subscribed": an empty list because
        // the query failed would read as zero revenue.
        if (!cancelled) setError(ar ? 'تعذّر تحميل بيانات الاشتراكات.' : 'Could not load subscription data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenants, reloadToken, ar]);

  // Derive once per row, here, so the list, the filters, the tiles and the CSV
  // all describe the same subscription the same way.
  const derived = useMemo(
    () => rows.map((r) => ({ ...r, billing: deriveBilling(r.subscription) })),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return derived.filter((r) => {
      if (q && ![r.name, r.slug, r.email].some((v) => String(v || '').toLowerCase().includes(q))) return false;
      if (filter === 'active') return r.billing.entitled;
      if (filter === 'inactive') return !r.billing.entitled;
      if (filter === 'failed') return r.billing.state === 'past_due' || r.billing.state === 'expired';
      return true;
    });
  }, [derived, query, filter]);

  const stats = useMemo(() => {
    const paying = derived.filter((r) => r.billing.entitled && r.billing.state !== 'comped');
    // Monthly recurring revenue, in DISPLAY currency minor units: every paying
    // plan normalised to a month so annual and monthly subscribers are
    // comparable. Deliberately the quoted price rather than the dollar figure —
    // this number is read against a Saudi business's own targets.
    const mrr = paying.reduce((sum, r) => {
      const plan = getPlan(r.subscription?.plan_code);
      if (!plan) return sum;
      return sum + (monthlyEquivalent(plan) ?? 0);
    }, 0);
    return {
      subscribers: derived.filter((r) => r.billing.entitled).length,
      paying: paying.length,
      failing: derived.filter((r) => r.billing.state === 'past_due').length,
      mrr,
    };
  }, [derived]);

  function exportCsv() {
    // Built in the browser from what is already loaded — no export endpoint,
    // nothing extra leaves the database.
    const csv = subscribersCsv(visible, lang);
    // The BOM is what makes Excel open a UTF-8 file with Arabic names intact;
    // without it every workspace name arrives as mojibake.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename('subscribers');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function cancelFor(row) {
    const ok = await confirm({
      title: ar ? 'إلغاء اشتراك هذا العميل؟' : "Cancel this client's subscription?",
      description: ar
        ? `${row.name} سيحتفظ بوصوله حتى نهاية الفترة المدفوعة، ثم يتوقف التجديد. لا يتم استرداد أي مبلغ تلقائيًا.`
        : `${row.name} keeps access until the end of the period they have paid for, then renewal stops. Nothing is refunded automatically.`,
      confirmLabel: ar ? 'إلغاء التجديد' : 'Turn off renewal',
      cancelLabel: ar ? 'رجوع' : 'Back',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await invokeBilling('billing-subscription', {
        action: 'cancel', tenant_id: row.id, reason: 'Cancelled by Designakum on request',
      });
      toast.success(ar ? 'تم إيقاف التجديد.' : 'Renewal turned off.');
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error('[subscribers] cancel failed:', err);
      toast.error(billingActionError(err?.message, lang));
    } finally {
      setBusyId(null);
    }
  }

  // Record whether a comped workspace is a permanent grant or one we intend to
  // convert to a paying subscription. See section-m-convertible-comps.sql.
  //
  // THIS CHANGES NOTHING THE CLIENT CAN SEE, AND NOTHING THEY CAN DO. comp_kind
  // is metadata: tenant_has_active_subscription() does not read it, so the
  // workspace is exactly as entitled afterwards, and billing-checkout still
  // refuses every comped tenant whatever its kind. It records intent so a later
  // change can act on it.
  //
  // The confirmation is deliberately ASYMMETRIC. Making a workspace convertible
  // changes a promise made to a real client — they were told the access was
  // permanent — so it is confirmed. Making it permanent again is the safe
  // direction and the undo, and friction on an undo is friction in the wrong
  // place.
  async function changeCompKind(row, kind) {
    if (kind === 'convertible') {
      const ok = await confirm({
        title: ar ? 'اجعل هذه المساحة قابلة للتحويل؟' : 'Make this workspace convertible?',
        description: ar
          ? `${row.name} لديه وصول مجاني دائم. هذا يجعله مؤهلًا لأن يُطلب منه الدفع لاحقًا. وصوله لا يتغيّر الآن، والتراجع ممكن في أي وقت.`
          : `${row.name} was granted permanent free access. This makes them eligible to be asked to pay later. Their access does not change now, and it is reversible at any time.`,
        confirmLabel: ar ? 'اجعله قابلًا للتحويل' : 'Make convertible',
        cancelLabel: ar ? 'رجوع' : 'Back',
      });
      if (!ok) return;
    }
    setBusyId(row.id);
    try {
      const data = await invokeBilling('billing-subscription', {
        action: 'set_comp_kind', tenant_id: row.id, comp_kind: kind,
      });
      // `changed` comes back false when the value was re-applied. Reporting a
      // no-op as a change teaches an operator to distrust the message.
      toast.success(data?.changed === false
        ? (ar ? 'بدون تغيير.' : 'No change.')
        : (ar ? 'تم التحديث.' : 'Updated.'));
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error('[subscribers] comp_kind failed:', err);
      toast.error(billingActionError(err?.message, lang));
    } finally {
      setBusyId(null);
    }
  }

  // Mirror the plan catalogue into PayPal. This has to be driven from here
  // rather than from a script, because billing-plans-sync is owner-gated
  // against the CALLER's own JWT — which only exists in a signed-in browser.
  //
  // The plan list is sent from lib/billing-plans.js, in the BILLING currency
  // and as the decimal string PayPal expects. What gets created is therefore
  // exactly what this screen is showing.
  async function syncPlans() {
    // allPlans, not listPlans: the provider catalogue must mirror everything
    // including the hidden test plan, or there is nothing to test against.
    const plans = allPlans().map((p) => {
      const billed = billingAmount(p.code);
      return {
        code: p.code,
        amount: toProviderAmount(billed.amount, billed.currency),
        currency: billed.currency,
        interval: p.interval,
        interval_count: p.intervalCount,
      };
    });
    setBusyId('sync');
    try {
      const data = await invokeBilling('billing-plans-sync', { plans });
      const created = (data.results || []).filter((r) => r.created).length;
      const failed = (data.results || []).filter((r) => r.error);
      if (failed.length > 0) {
        console.error('[plans-sync] failures:', failed);
        toast.error(`${failed.length} plan(s) failed: ${failed.map((f) => f.error).join("; ")}`);
      } else {
        toast.success(ar
          ? `تمت المزامنة (${data.environment}): ${created} خطة جديدة`
          : `Synced (${data.environment}): ${created} new plan(s)`);
      }
    } catch (err) {
      console.error('[plans-sync] failed:', err);
      toast.error(billingActionError(err?.message, lang));
    } finally {
      setBusyId(null);
    }
  }

  // DOOR 2 of checkout: a link the owner sends over WhatsApp to a client who
  // has never signed in. The grant is signed server-side and names the tenant
  // and the plan, so the recipient cannot edit the URL into a cheaper plan or
  // somebody else's workspace.
  async function createPaymentLink(row, planCode) {
    setBusyId(row.id);
    try {
      const data = await invokeBilling('billing-subscription', {
        action: 'create_link', tenant_id: row.id, plan_code: planCode,
      });
      const params = new URLSearchParams({ t: data.grant, plan: planCode, w: row.name });
      setLinkFor({ name: row.name, url: `${window.location.origin}/subscribe?${params.toString()}` });
    } catch (err) {
      // SAY WHAT WENT WRONG. The first version of this reported every failure
      // as "Could not create the link", which was true and useless: the actual
      // cause was a 404 from an undeployed function, and neither the operator
      // nor the logs said so. An opaque toast on an operator tool costs more
      // than the two lines it saves.
      console.error('[subscribers] link failed:', err);
      toast.error(billingActionError(err?.message, lang));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <h1>{ar ? 'المشتركون' : 'Subscribers'} <span className="meta">· {derived.length}</span></h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={syncPlans} loading={busyId === 'sync'}>
            {ar ? 'مزامنة الخطط مع باي بال' : 'Sync plans to PayPal'}
          </Button>
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={visible.length === 0}>
            {ar ? 'تصدير CSV' : 'Export CSV'}
          </Button>
        </div>
      </div>
      <p className="hint">{ar
        ? 'من يدفع، على أي خطة، ومتى يتجدّد. التصدير يشمل ما هو ظاهر بعد البحث والتصفية.'
        : 'Who is paying, on what plan, and when it renews. The export covers whatever the search and filter are showing.'}</p>

      {!loading && derived.length > 0 && (
        <div className="cl-stats">
          {[
            [ar ? 'مشتركون' : 'Subscribers', String(stats.subscribers), ''],
            [ar ? 'مدفوع' : 'Paying', String(stats.paying), 'ok'],
            [ar ? 'دفعات متعثّرة' : 'Failing', String(stats.failing), 'warn'],
            [ar ? 'الإيراد الشهري' : 'MRR', formatAmount(stats.mrr, lang), ''],
          ].map(([label, value, tone]) => (
            <div key={label} className={`cl-stat ${value !== '0' ? tone : ''}`}>
              <span className="cl-stat-n">{value}</span>
              <span className="cl-stat-l">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sb-controls">
        <input
          type="text"
          className="sb-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ar ? 'ابحث بالاسم أو الرابط أو البريد' : 'Search by name, slug or email'}
          aria-label={ar ? 'بحث' : 'Search'}
        />
        <div className="sb-filters" role="group" aria-label={ar ? 'تصفية' : 'Filter'}>
          {SUBSCRIBER_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`sb-chip ${filter === f.id ? 'on' : ''}`}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {ar ? f.ar : f.en}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="ts-err" style={{ maxWidth: 720 }}>{error}</div>}

      {/* The generated payment link, shown once so it can be copied into
          WhatsApp. It is not stored: regenerating one is free, and a list of
          live payment links sitting in the UI is a thing to leak. */}
      {linkFor && (
        <div className="add-bg" onClick={() => setLinkFor(null)}>
          <div className="add-panel" onClick={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
            <button type="button" className="add-close" onClick={() => setLinkFor(null)} aria-label={ar ? 'إغلاق' : 'Close'}>×</button>
            <h2 style={{ marginTop: 0 }}>{ar ? 'رابط الدفع' : 'Payment link'}</h2>
            <p className="hint">{ar
              ? `أرسل هذا الرابط إلى ${linkFor.name}. يعمل بدون تسجيل دخول، ويمكن فتحه أكثر من مرة، وتنتهي صلاحيته بعد 14 يومًا.`
              : `Send this to ${linkFor.name}. It works without signing in, survives being opened more than once, and expires after 14 days.`}</p>
            <textarea readOnly rows={3} value={linkFor.url} dir="ltr" onFocus={(e) => e.target.select()} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => { navigator.clipboard?.writeText(linkFor.url); toast.success(ar ? 'نُسخ' : 'Copied'); }}>
                {ar ? 'نسخ الرابط' : 'Copy link'}
              </Button>
              <a
                className="bl-out"
                href={`https://wa.me/?text=${encodeURIComponent(linkFor.url)}`}
                target="_blank" rel="noopener noreferrer"
              >
                {ar ? 'إرسال عبر واتساب' : 'Send on WhatsApp'}
              </a>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="list-skel" aria-busy="true">
          <Skeleton width="100%" height={64} radius="var(--radius-md)" />
          <Skeleton width="100%" height={64} radius="var(--radius-md)" />
          <Skeleton width="100%" height={64} radius="var(--radius-md)" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon="🔍"
          title={derived.length === 0
            ? (ar ? 'لا يوجد مشتركون بعد.' : 'No subscribers yet.')
            : (ar ? 'لا نتائج مطابقة.' : 'Nothing matches that.')}
          description={derived.length === 0
            ? (ar ? 'ستظهر المساحات هنا فور اشتراكها.' : 'Workspaces appear here as soon as they subscribe.')
            : (ar ? 'جرّب بحثًا أو تصفية أخرى.' : 'Try a different search or filter.')}
        />
      ) : (
        <div className="cl-list">
          {visible.map((r) => {
            const plan = r.subscription?.plan_code ? getPlan(r.subscription.plan_code) : null;
            const when = r.billing.renewsAt || r.billing.endsAt;
            return (
              <Card key={r.id} pad="none" className="cl-row">
                <button type="button" className="cl-open" onClick={() => onOpen(r.id)}>
                  <div className="cl-main">
                    <div className="cl-name">{r.name}</div>
                    <div className="cl-who" dir="ltr">{r.email}</div>
                  </div>
                  <span className="sb-plan">
                    {planName(r.subscription?.plan_code, lang)}
                    {plan && <span className="sb-amount"> · {formatAmount(plan.amount, lang)}</span>}
                  </span>
                  <Badge tone={r.billing.tone} dot>{statusLabel(r.billing.state, lang)}</Badge>
                  <span className="cl-pct">
                    {when ? formatBillingDate(when, lang) : '—'}
                  </span>
                </button>
                <div className="cl-actions">
                  {/* A workspace that is not paying is one to chase, so the
                      payment link lives exactly where that is noticed. Comped
                      workspaces are excluded: they were granted access
                      deliberately and are not a collections problem. */}
                  {!r.billing.entitled && (
                    <>
                      <span className="cl-flag">{ar ? 'أرسل رابط دفع:' : 'Send a payment link:'}</span>
                      {allPlans().map((p) => (
                        <Button
                          key={p.code}
                          type="button" variant="secondary" size="sm"
                          loading={busyId === r.id}
                          onClick={() => createPaymentLink(r, p.code)}
                        >
                          {p.hidden ? (ar ? 'اختبار' : 'TEST') : p.name[ar ? 'ar' : 'en']}
                        </Button>
                      ))}
                    </>
                  )}
                  {/* COMP INTENT. A SIBLING of the payment-link block above,
                      never inside it, and that separation is the whole point:
                      the links render on `!entitled`, comps are entitled, so a
                      comp gets none of them — grandfather or convertible alike.
                      Nothing here opens a checkout or mints a link. Marking a
                      comp convertible records intent for a later change; today
                      billing-checkout still refuses every comped tenant. */}
                  {r.billing.state === 'comped' && (
                    <>
                      <span className="cl-flag">
                        {r.subscription?.comp_kind === 'convertible'
                          ? (ar ? 'وصول ممنوح — قابل للتحويل' : 'Granted — convertible')
                          : (ar ? 'وصول ممنوح — دائم' : 'Granted — permanent')}
                      </span>
                      <Button
                        type="button" variant="secondary" size="sm"
                        loading={busyId === r.id}
                        onClick={() => changeCompKind(
                          r,
                          r.subscription?.comp_kind === 'convertible' ? 'grandfather' : 'convertible',
                        )}
                      >
                        {r.subscription?.comp_kind === 'convertible'
                          ? (ar ? 'اجعله دائمًا' : 'Make permanent')
                          : (ar ? 'اجعله قابلًا للتحويل' : 'Make convertible')}
                      </Button>
                    </>
                  )}
                  {r.billing.entitled && r.billing.state !== 'comped' && !r.subscription?.cancel_at_period_end && (
                    <Button
                      type="button" variant="secondary" size="sm"
                      loading={busyId === r.id}
                      onClick={() => cancelFor(r)}
                    >
                      {ar ? 'إلغاء التجديد' : 'Turn off renewal'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AdminStyles />
      <style jsx>{`
        .cl-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: var(--space-2); max-width: 720px; margin-bottom: var(--space-5); }
        .cl-stat { padding: var(--space-3); background: var(--bg-elevated);
          border: 1px solid var(--border); border-radius: var(--radius-md); }
        .cl-stat.ok { border-color: var(--success-border); }
        .cl-stat.warn { border-color: var(--warning-border); }
        .cl-stat-n { display: block; font-size: var(--text-xl); font-weight: 700;
          line-height: 1.2; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .cl-stat.ok .cl-stat-n { color: var(--success); }
        .cl-stat.warn .cl-stat-n { color: var(--warning); }
        .cl-stat-l { display: block; margin-top: 2px; font-size: var(--text-xs); color: var(--text-tertiary); }
        .sb-controls { display: flex; align-items: center; gap: var(--space-3);
          flex-wrap: wrap; max-width: 720px; margin-bottom: var(--space-4); }
        .sb-search { flex: 1 1 240px; }
        .sb-filters { display: inline-flex; gap: 4px; padding: 3px;
          background: var(--bg-elevated); border-radius: var(--radius-sm); flex-wrap: wrap; }
        .sb-chip { padding: 5px 12px; font-size: var(--text-sm); font-family: inherit;
          color: var(--text-tertiary); background: none; border: none;
          border-radius: 6px; cursor: pointer; white-space: nowrap; }
        .sb-chip:hover { color: var(--text-primary); }
        .sb-chip.on { background: var(--bg-hover); color: var(--text-primary); font-weight: 600; }
        .sb-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .cl-list { display: flex; flex-direction: column; gap: 8px; max-width: 720px; }
        .cl-open { display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px 14px;
          background: none; border: none; cursor: pointer; font-family: inherit;
          text-align: inherit; color: inherit; }
        .cl-open:hover .cl-name { color: var(--accent); }
        .cl-main { flex: 1; min-width: 0; }
        .cl-name { font-size: 14px; font-weight: 600; }
        .cl-who { font-size: 11px; color: var(--text-tertiary); margin-top: 3px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sb-plan { font-size: var(--text-xs); color: var(--text-tertiary); white-space: nowrap; }
        .sb-amount { font-variant-numeric: tabular-nums; }
        .cl-actions { display: flex; align-items: center; justify-content: flex-end;
          gap: 10px; padding: 0 14px 12px; flex-wrap: wrap; }
        .cl-pct { font-size: var(--text-xs); color: var(--text-muted); min-width: 92px;
          text-align: end; flex-shrink: 0; white-space: nowrap; }
        @media (max-width: 720px) {
          /* The plan word duplicates the amount already shown on the row above
             it once the row wraps, and it is the least useful thing here. */
          .sb-plan { display: none; }
          .cl-pct { min-width: 0; }
        }
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
      /* Shared shape for "a list is being fetched" — used by the domain list and
         the workspace-members list, which both previously rendered a lone "…". */
      .list-skel { display: flex; flex-direction: column; gap: var(--space-2); max-width: 640px; margin-bottom: var(--space-4); }
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
