/* /signin — the one door into the platform.
 *
 * This was the top of pages/admin.js, which was 5,172 lines and was BOTH the
 * login screen and the editor. That is why deleting the editor could not simply
 * delete the file: /studio, the password reset and the signup page all sent
 * people to /admin to sign in, so removing it would have locked every client
 * out of a product that was otherwise working.
 *
 * So the door was lifted out and the editor deleted underneath it. Everything
 * here -- the sign-in form, the invite and recovery link handling, the
 * must-set-password gate -- is unchanged from the file it came from. What is
 * gone is everything below it.
 */
import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import { supabase } from '../lib/supabase';
// Moved to lib/domains.js so the Studio can offer custom domains without a
// second implementation of DNS verification. Same code, imported back.
import {
  VERCEL_A_RECORD, VERCEL_CNAME, normalizeDomain, isApexDomain,
  checkDomainDns, domainStatusMeta,
} from '../lib/domains';
import { getTranslator, resolveLang, isLang } from '../lib/translations';
import { passwordPolicyError, PASSWORD_MIN, PASSWORD_MAX_CHARS } from '../lib/password-policy';
import { isPwnedPassword } from '../lib/pwned-password';
import {
  arrivedViaPasswordLink as arrivedViaPasswordLinkFn,
  readAuthLinkErrorFromWindow,
  isExpiredLinkError,
} from '../lib/auth-link';
import { parseLoginIdentifier } from '../lib/resolve-login';
import {
  listPlans, allPlans, getPlan, planName, planChangeKind, monthlyEquivalent,
  formatAmount, formatInterval, DEFAULT_PLAN_CODE, BILLING_CURRENCY,
  billingAmount, toProviderAmount,
} from '../lib/billing-plans';
import {
  deriveBilling, statusLabel, statusSentence, formatBillingDate,
  paymentTone, paymentLabel,
} from '../lib/billing-status';
import {
  Button, Card, CardHeader, PageHeader, Badge, EmptyState, Icon, Skeleton, Money,
  ToastProvider, useToast, ConfirmProvider, useConfirm,
} from '../components/ui';
import PreviewPane from '../components/PreviewPane';
import BrandGlyph from '../components/ui/BrandGlyph';
import ThemePreview from '../components/ThemePreview';
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
// Where to go once signed in. /console sends people here to authenticate, and
// without this they landed on the dashboard and had to retype the URL. Only a
// same-origin ABSOLUTE PATH is honoured -- never a full URL -- so this cannot
// be turned into an open redirect by a crafted link.
function nextAfterSignIn() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = new URLSearchParams(window.location.search).get('next');
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
  } catch (_) { return null; }
}

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

// The five gradients a TEXT banner can use. Named so the client picks a mood
// rather than a hex value — the one place on the card where they choose a
// colour, and a short list is what keeps it from producing something worse
// than the template.
const BANNER_BGS = {
  purple: { name: 'Purple', gradient: 'linear-gradient(135deg, #7a72d6, #9FA7FF)' },
  blue:   { name: 'Blue',   gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)' },
  sunset: { name: 'Sunset', gradient: 'linear-gradient(135deg, #ec4899, #f97316)' },
  forest: { name: 'Forest', gradient: 'linear-gradient(135deg, #10b981, #3b82f6)' },
  dark:   { name: 'Dark',   gradient: 'linear-gradient(135deg, #1f2937, #374151)' },
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
export default function SignInPage() {
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
      // Someone sent here to authenticate goes back where they came from --
      // /console does this. Not while a password is still owed: the gate has to
      // run first, or they would be bounced away mid-obligation.
      if (event === 'SIGNED_IN' && s && !arrivedViaPasswordLink() && !isPasswordPending()) {
        const dest = nextAfterSignIn();
        if (dest) { window.location.replace(dest); return; }
      }
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
            {/* Signed in: this route is only the door now. The editor is the
                Studio, and the password gate still renders on top so an
                invited client cannot slip past it by being redirected. */}
            <RedirectToStudio ar={lang === 'ar'} />
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
  // The visible glyph is "EN" / "ع", which does not say what the control DOES.
  // The name is written in the language being switched TO, because that is the
  // language the person choosing it reads.
  const name = lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية';
  return (
    <button type="button" onClick={onClick} className="lang-toggle-btn" title={targetLabel} aria-label={name}>
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

function ThemeToggleButton({ theme, lang, onClick }) {
  const isDark = theme !== 'light';
  // This button is icon-only, so `title` was its ONLY accessible name — and it
  // was hardcoded English, announced verbatim to a screen reader in an Arabic
  // UI. Both the name and the tooltip follow the interface language now, which
  // is why this needs `lang` at all. It names the mode it switches TO, matching
  // LangToggleButton beside it.
  const label = lang === 'ar'
    ? (isDark ? 'الوضع الفاتح' : 'الوضع الداكن')
    : (isDark ? 'Light mode' : 'Dark mode');
  return (
    <button type="button" onClick={onClick} className="theme-toggle-btn" title={label} aria-label={label}>
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
                    ? 'انتهت صلاحية الرابط أو تم استخدامه من قبل. يلزم دعوة جديدة أو رابط إعادة تعيين.'
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
          <LangToggleButton lang={lang} onClick={toggleLang} /><ThemeToggleButton theme={theme} lang={lang} onClick={toggleTheme} />
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
      /* The local --accent/--accent-hover/--accent-fg overrides that used to sit
         here pinned this surface to #4f6ef2, which is neither the brand nor the
         theme's own accent. They shadowed the token layer, so setting the brand
         in globals.css had no effect on the two surfaces that matter most.
         Removed: the accent now inherits from the theme. --border/--border-strong
         stay, because those are a genuine local derivation from --on-bg. */
      .signin-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; color: var(--text-primary); --border: rgba(var(--on-bg),0.1); --border-strong: rgba(var(--on-bg),0.2); transition: background-color var(--t-ui); }
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
      /* Zero, not the keyword "normal". They render identically, since that
         keyword IS the initial value, but the guard reads for a literal 0
         because it is unambiguous -- and a reset the guard cannot recognise is
         a reset that has quietly stopped being checked. */
      html[dir="rtl"] .signin-card label { text-transform: none; letter-spacing: 0; }
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
        <h2 id="gate-title">{ar ? 'كلمة المرور' : 'Choose your password'}</h2>
        {done ? (
          <p className="gate-hint">{t('password_updated')} ✓</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="gate-hint">{ar
              ? 'حسابك جاهز. كلمة المرور الآن تتيح تسجيل الدخول لاحقًا — وبدونها لا رجوع بعد تسجيل الخروج.'
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
/* Signed in and on the door: go to the Studio.
 *
 * A replace() rather than a push, so Back does not bounce the client between
 * the door and the room. Rendered as a component rather than done in an effect
 * up in the page body, because the password gate has to be able to render ON
 * TOP of it -- an invited client who still owes a password must meet the gate,
 * not a redirect that outruns it.
 */
function RedirectToStudio({ ar }) {
  useEffect(() => { window.location.replace('/studio'); }, []);
  return (
    <p style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
      {ar ? 'جارٍ الفتح…' : 'Opening…'}
    </p>
  );
}
