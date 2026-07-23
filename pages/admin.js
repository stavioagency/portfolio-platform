import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import Head from 'next/head';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import { supabase } from '../lib/supabase';
import { normalizeHost } from '../lib/tenant';
import { getTranslator } from '../lib/translations';
import { pick, setLangValue, emptyBilingual } from '../lib/i18n';
import { BRAND_ICONS, BRAND_KEYS, normalizeIcon } from '../lib/brand-icons';
import {
  Button, Card, CardHeader, Badge, EmptyState,
  ToastProvider, useToast, ConfirmProvider, useConfirm,
} from '../components/ui';

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
function adminRedirectUrl() {
  const isLocal = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const base = process.env.NEXT_PUBLIC_ADMIN_URL
    || (isLocal ? window.location.origin : 'https://portfolio-platform-designakum.vercel.app');
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
  const [recoveryMode, setRecoveryMode] = useState(false);
  const t = getTranslator(lang);

  useEffect(() => {
    const initial = readLang();
    setLangState(initial);
    applyLang(initial);
    try { setThemeState(localStorage.getItem('admin_theme') || 'dark'); } catch (e) {}

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  function setLang(next) {
    setLangState(next);
    applyLang(next);
  }
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
      {recoveryMode
        ? <SetNewPassword lang={lang} toggleLang={toggleLang} theme={theme} toggleTheme={toggleTheme} onDone={() => setRecoveryMode(false)} />
        : session
          ? <Dashboard session={session} lang={lang} toggleLang={toggleLang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} />
          : <SignIn lang={lang} toggleLang={toggleLang} theme={theme} toggleTheme={toggleTheme} />}
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
function SignIn({ lang, toggleLang, theme, toggleTheme }) {
  const t = getTranslator(lang);
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
    const trimmed = username.trim().toLowerCase();
    const { data: email, error: rpcError } = await supabase.rpc('get_email_for_username', { p_username: trimmed });
    if (rpcError || !email) {
      setError(t('invalid_credentials'));
      setLoading(false); return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(t('invalid_credentials'));
    setLoading(false);
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setForgotLoading(true);
    const raw = forgotIdentifier.trim();
    // Accept a typed email directly; otherwise resolve a username to its email
    // via the same RPC the sign-in form uses. Either way we show the same
    // generic message afterward so we never reveal whether an account exists.
    let email = raw.includes('@') ? raw : null;
    if (!email) {
      const { data } = await supabase.rpc('get_email_for_username', { p_username: raw.toLowerCase() });
      email = data || null;
    }
    if (email) {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: adminRedirectUrl() });
    }
    setForgotLoading(false);
    setForgotDone(true);
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
            <p className="signin-hint">{t('sign_in_hint')}</p>
            <label htmlFor="signin-username">{t('username')}</label>
            <input id="signin-username" name="username" type="text" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus autoComplete="username" spellCheck="false" autoCapitalize="off" />
            <label htmlFor="signin-password">{t('password')}</label>
            <input id="signin-password" name="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            {error && <div className="error">{error}</div>}
            <Button type="submit" block loading={loading}>{loading ? t('signing_in') : t('sign_in')}</Button>
            <button type="button" className="link-btn" onClick={() => setMode('forgot')}>{t('forgot_password_link')}</button>
          </>
        )}
    </AuthShell>
  );
}

// Shared chrome for the two signed-out screens (SignIn + SetNewPassword). Both
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
// Set New Password — shown when Supabase signals PASSWORD_RECOVERY
// (i.e. the admin opened a password-reset email link)
// =========================================================
function SetNewPassword({ lang, toggleLang, theme, toggleTheme, onDone }) {
  const t = getTranslator(lang);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPwd.length < 8) { setError(t('password_too_short')); return; }
    if (newPwd !== confirmPwd) { setError(t('password_mismatch')); return; }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPwd });
    setLoading(false);
    if (updateErr) { setError(updateErr.message); return; }
    setDone(true);
    setTimeout(() => onDone && onDone(), 1200);
  }

  return (
    <AuthShell
      theme={theme} lang={lang} toggleLang={toggleLang} toggleTheme={toggleTheme}
      title={t('set_new_password_heading')} onSubmit={handleSubmit}
    >
        {done ? (
          <p className="signin-hint">{t('password_updated')}</p>
        ) : (
          <>
            <p className="signin-hint">{t('set_new_password_hint')}</p>
            <label htmlFor="new-pwd">{t('new_password')}</label>
            <input id="new-pwd" name="new-pwd" type="password" dir="ltr" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required autoFocus autoComplete="new-password" />
            <label htmlFor="confirm-pwd">{t('confirm_new_password')}</label>
            <input id="confirm-pwd" name="confirm-pwd" type="password" dir="ltr" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required autoComplete="new-password" />
            {error && <div className="error">{error}</div>}
            <Button type="submit" block loading={loading}>{loading ? t('saving') : t('set_new_password_button')}</Button>
          </>
        )}
    </AuthShell>
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

  const TAB_LABELS = {
    profile: t('nav_profile'), card: t('nav_card'), projects: t('nav_projects'),
    links: t('nav_links'), appearance: t('nav_appearance'),
    analytics: t('nav_analytics'), account: t('nav_account'),
  };

  async function navigate(tab) {
    if (tab === activeTab) { setSidebarOpen(false); return; }
    if (dirtyRef.current && !(await confirm(unsavedDialog(t)))) return;
    dirtyRef.current = false;
    setActiveTab(tab);
    setSidebarOpen(false); // auto-close drawer on mobile after picking a tab
  }
  async function signOut() { await supabase.auth.signOut(); }

  // Which tenants may this admin edit? Sourced from tenant_admins for the signed-in
  // user. If nothing is mapped — or the tenant tables aren't readable — we stay in
  // legacy single-profile mode (tenant = null), preserving today's behavior.
  // Which tenants may this admin edit? Sourced from tenant_admins for the signed-in
  // user. If nothing is mapped — or the tenant tables aren't readable — we stay in
  // legacy single-profile mode (tenant = null), preserving today's behavior. Exposed
  // via context so the Create-Tenant flow can refresh the list after onboarding.
  const loadTenants = useCallback(async () => {
    try {
      const uid = session?.user?.id;
      if (!uid) return;
      const { data, error } = await supabase
        .from('tenant_admins')
        .select('tenants ( id, slug, name, status )')
        .eq('user_id', uid);
      // A read failure here is a real misconfiguration (missing grant/policy), so keep
      // it visible — but still fall back to legacy single-profile mode.
      if (error) { console.error('[tenant] tenant_admins read failed:', error.message || error); return; }
      if (!data) return;
      // Keep disabled tenants in the ADMIN list — the owner must be able to see and
      // re-enable a suspended client. Public visibility is enforced by lib/tenant.js.
      const list = data.map(r => r.tenants).filter(Boolean);
      list.sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug)));
      setTenants(list);
      if (list.length === 0) { setTenant(null); return; }
      let stored = null;
      try { stored = localStorage.getItem(TENANT_LS_KEY); } catch (_) {}
      const preferred = list.find(x => String(x.id) === String(stored)) || list[0];
      setTenant(prev => prev || preferred);
    } catch (e) { console.error('[tenant] tenant load error:', e); }
  }, [session]);

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

  return (
    <DirtyContext.Provider value={dirtyRef}>
    <TenantContext.Provider value={{ tenant, tenants, setTenant, reloadTenants: loadTenants, isOwner }}>
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
        <span className="mobile-tab-label">{TAB_LABELS[activeTab]}</span>
        <LangToggleButton lang={lang} onClick={toggleLang} /><ThemeToggleButton theme={theme} onClick={toggleTheme} />
      </header>

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img className={theme !== 'light' ? 'on' : ''} src="/logo.png" alt="ديزاينكم" />
          <img className={theme === 'light' ? 'on' : ''} src="/logo-light.png" alt="" aria-hidden="true" />
        </div>
        <div className="sidebar-header">
          <div className="sidebar-title">⚙️ {t('sidebar_title')}</div>
          <div className="sidebar-header-right">
            <LangToggleButton lang={lang} onClick={toggleLang} /><ThemeToggleButton theme={theme} onClick={toggleTheme} />
            <button type="button" className="drawer-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">×</button>
          </div>
        </div>

        <a href="/" target="_blank" rel="noopener noreferrer" className="view-site-btn">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          {t('view_live_site')}
        </a>

        <nav className="nav">
          {isOwner === false && <NavItem icon="🏠" label={ar ? 'الرئيسية' : 'Home'} active={activeTab === 'home'} onClick={() => navigate('home')} />}
          {isOwner === true && <NavItem icon="👥" label={ar ? 'العملاء' : 'Clients'} active={activeTab === 'clients'} onClick={() => navigate('clients')} />}
          <NavItem icon="👤" label={t('nav_profile')}    active={activeTab === 'profile'}    onClick={() => navigate('profile')} />
          <NavItem icon="🪪" label={t('nav_card')}       active={activeTab === 'card'}       onClick={() => navigate('card')} />
          <NavItem icon="📁" label={t('nav_projects')}   active={activeTab === 'projects'}   onClick={() => navigate('projects')} />
          <NavItem icon="🔗" label={t('nav_links')}      active={activeTab === 'links'}      onClick={() => navigate('links')} />
          <NavItem icon="🎨" label={t('nav_appearance')} active={activeTab === 'appearance'} onClick={() => navigate('appearance')} />
          <div className="nav-sep" aria-hidden="true" />
          <NavItem icon="📊" label={t('nav_analytics')}  active={activeTab === 'analytics'}  onClick={() => navigate('analytics')} />
          <NavItem icon="⚙️" label={t('nav_account')}    active={activeTab === 'account'}    onClick={() => navigate('account')} />
        </nav>

        <div className="sidebar-footer">
          <SidebarUser session={session} t={t} />
          <button onClick={signOut} className="signout-btn">{t('sign_out')}</button>
        </div>
      </aside>

      {/* Backdrop — only visible on mobile when drawer is open */}
      <div className={`backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <main className="content">
        {isOwner && <TenantSelector tenants={tenants} tenant={tenant} onChange={switchTenant} lang={lang} />}
        {activeTab === 'home'       && isOwner === false && <ClientHome key={tenantKey} lang={lang} onNavigate={navigate} />}
        {activeTab === 'clients'    && isOwner === true  && <OwnerClientsOverview lang={lang} onOpen={(id) => { switchTenant(id); navigate('profile'); }} />}
        {activeTab === 'profile'    && <ProfileEditor    key={tenantKey} t={t} lang={lang} />}
        {activeTab === 'card'       && <CardEditor       key={tenantKey} t={t} lang={lang} />}
        {activeTab === 'projects'   && <ProjectsEditor   key={tenantKey} t={t} lang={lang} />}
        {activeTab === 'links'      && <LinksEditor      key={tenantKey} t={t} lang={lang} />}
        {activeTab === 'appearance' && <AppearanceEditor key={tenantKey} t={t} lang={lang} />}
        {activeTab === 'analytics'  && <AnalyticsEditor  key={tenantKey} t={t} lang={lang} />}
        {activeTab === 'account'    && <AccountEditor    key={tenantKey} t={t} lang={lang} session={session} setChromeLang={setLang} />}
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
        .sidebar-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) var(--space-3) var(--space-5); gap: 8px; }
        .sidebar-header-right { display: flex; align-items: center; gap: 6px; }
        .sidebar-title { font-size: 14px; font-weight: 700; }
        .drawer-close { display: none; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); font-size: 20px; cursor: pointer; font-family: inherit; align-items: center; justify-content: center; }
        .nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .nav-sep { height: 1px; background: var(--border); margin: 8px 8px; }
        .sidebar-footer { padding: var(--space-3); border-top: 1px solid var(--border); }
        .view-site-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; margin-bottom: 10px; background: linear-gradient(180deg, rgba(79,110,242,0.12), rgba(79,110,242,0.04)); border: 1px solid rgba(79,110,242,0.25); border-radius: var(--radius-md); color: var(--text-primary); font-size: 12px; font-weight: 500; text-decoration: none; transition: var(--transition); }
        .view-site-btn:hover { background: rgba(79,110,242,0.18); }
        .signout-btn { font-size: 12px; color: var(--text-tertiary); padding: 6px 0; background: none; border: none; cursor: pointer; font-family: inherit; }
        .signout-btn:hover { color: var(--text-primary); }
        .content { flex: 1; padding: var(--space-6) var(--space-8); overflow-y: auto; max-height: 100vh; }

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

          /* Bigger tap targets on mobile */
          .nav-item { padding: 12px 14px; font-size: 14px; min-height: 44px; }
        }
      `}</style>
    </div>
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
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      <style jsx>{`
        .nav-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; color: var(--text-secondary); transition: var(--transition); text-align: start; background: none; border: none; cursor: pointer; font-family: inherit; }
        .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .nav-item.active { background: linear-gradient(180deg, rgba(79,110,242,0.12), rgba(79,110,242,0.04)); color: var(--text-primary); font-weight: 500; box-shadow: inset 0 0 0 1px rgba(79,110,242,0.18); }
        .nav-icon { font-size: 14px; }
      `}</style>
    </button>
  );
}

function SidebarUser({ session, t }) {
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
        <div className="user-status"><span className="dot" />{t('status_live')}</div>
      </div>
      <style jsx>{`
        .user-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #4f6ef2, #2d47a8); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .user-meta { min-width: 0; flex: 1; }
        .user-name { font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .user-status { font-size: 10px; color: #7DD37D; display: flex; align-items: center; gap: 4px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: #7DD37D; box-shadow: 0 0 6px #7DD37D; }
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

// Tenant-scoped data helpers. When a tenant is selected we scope by tenant_id;
// with no tenant we fall back to the legacy single-profile (id = 1) row so an
// un-migrated / unmapped database behaves exactly as it does today.
function loadProfile(tenant, columns = '*') {
  const q = supabase.from('profile').select(columns);
  return (tenant ? q.eq('tenant_id', tenant.id) : q.eq('id', 1)).maybeSingle();
}
function persistProfile(tenant, fields) {
  // Update the existing row by tenant_id (no id=1 hardcode) once a tenant is
  // selected; otherwise keep the legacy upsert. Note: this updates an EXISTING
  // profile row — creating a brand-new tenant's profile needs Section C.
  return tenant
    ? supabase.from('profile').update(fields).eq('tenant_id', tenant.id)
    : supabase.from('profile').upsert({ id: 1, ...fields });
}

// Tenant-isolated storage path: a tenant's media lives under `t-<id>/`; legacy
// (no tenant) keeps the flat filename so existing URLs and singleton mode are
// unchanged. Files are still timestamped, so no cross-tenant overwrite is possible.
function tenantStoragePath(tenant, name) {
  return tenant ? `t-${tenant.id}/${name}` : name;
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
  useEffect(() => {
    if (!dirtyRef) return;
    dirtyRef.current = dirty;
    return () => { dirtyRef.current = false; };
  }, [dirty, dirtyRef]);
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
    const { error } = await persistProfile(tenant, profile);
    setSaving(false);
    if (!error) { setSavedMsg(t('saved')); setDirty(false); }
    else { console.error(error); toast.error(t('save_failed')); }
  }
  async function uploadImage(file) {
    const path = tenantStoragePath(tenant, `profile-${Date.now()}.${file.name.split('.').pop()}`);
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (error) { console.error(error); toast.error(t('upload_failed')); return; }
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    patch({ profile_image: data.publicUrl });
  }
  async function uploadOgImage(file) {
    const path = tenantStoragePath(tenant, `og-${Date.now()}.${file.name.split('.').pop()}`);
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
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
              <button type="button" className="x-small" disabled={i === 0} onClick={() => moveCustomField(f.id, -1)}>↑</button>
              <button type="button" className="x-small" disabled={i === profile.custom_fields.length - 1} onClick={() => moveCustomField(f.id, 1)}>↓</button>
              <button type="button" className="x-small" onClick={() => removeCustomField(f.id)}>×</button>
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
    const { error } = await persistProfile(tenant, profile);
    setSaving(false);
    if (!error) { setSavedMsg(t('saved')); setDirty(false); }
    else { console.error(error); toast.error(t('save_failed')); }
  }
  async function uploadAsset(prefix, file) {
    const path = tenantStoragePath(tenant, `${prefix}-${Date.now()}.${file.name.split('.').pop()}`);
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
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
          <button type="button" className="x-small" disabled={!canUp} onClick={onUp}>↑</button>
          <button type="button" className="x-small" disabled={!canDown} onClick={onDown}>↓</button>
          <button type="button" className="x-small" onClick={onRemove}>×</button>
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
          <button type="button" className="x-small" disabled={!canUp} onClick={onUp}>↑</button>
          <button type="button" className="x-small" disabled={!canDown} onClick={onDown}>↓</button>
          <button type="button" className="x-small" onClick={onRemove}>×</button>
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
        <button type="button" className="brand-mini" onClick={() => setPickerOpen(true)} title={t('pick_icon')}>
          {icon ? <svg viewBox="0 0 24 24"><path d={icon.path} /></svg> : '?'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{icon?.label || t('pick_icon')}</span>
        <div className="row-actions">
          <button type="button" className="x-small" disabled={!canUp} onClick={onUp}>↑</button>
          <button type="button" className="x-small" disabled={!canDown} onClick={onDown}>↓</button>
          <button type="button" className="x-small" onClick={onRemove}>×</button>
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
  const { tenant } = useTenant();

  useEffect(() => { load(); }, []);
  async function load() {
    let q = supabase.from('projects').select('*');
    if (tenant) q = q.eq('tenant_id', tenant.id);
    const { data } = await q.order('display_order');
    setProjects(data || []);
  }

  async function addProject() {
    const nextOrder = projects.length;
    const defaultTitle = { en: 'New Project', ar: 'مشروع جديد' };
    const row = { title: defaultTitle, display_order: nextOrder, images: [] };
    if (tenant) row.tenant_id = tenant.id; // stamp new projects with the active tenant
    const { data, error } = await supabase.from('projects').insert(row).select().single();
    if (data) { setProjects([...projects, data]); setEditing(data); }
    if (error) { console.error(error); toast.error(t('save_failed')); }
  }
  async function updateProject(updated) {
    await supabase.from('projects').update(updated).eq('id', updated.id);
    setProjects(projects.map(p => p.id === updated.id ? updated : p));
    setEditing(updated);
  }
  async function deleteProject(id) {
    if (!(await confirm(deleteDialog(t, t('delete_project_confirm'))))) return;
    await supabase.from('projects').delete().eq('id', id);
    setProjects(projects.filter(p => p.id !== id));
    if (editing?.id === id) setEditing(null);
  }
  async function move(id, dir) {
    const i = projects.findIndex(p => p.id === id); const j = i + dir;
    if (j < 0 || j >= projects.length) return;
    const arr = [...projects]; [arr[i], arr[j]] = [arr[j], arr[i]];
    const updates = arr.map((p, idx) => ({ ...p, display_order: idx }));
    setProjects(updates);
    await Promise.all(updates.map(p => supabase.from('projects').update({ display_order: p.display_order }).eq('id', p.id)));
  }

  if (editing) return <ProjectEditForm project={editing} onSave={updateProject} onBack={() => { setEditing(null); load(); }} onDelete={deleteProject} t={t} lang={lang} />;

  return (
    <div className="editor">
      <div className="editor-header">
        <h1>{t('nav_projects')}</h1>
        <Button size="sm" onClick={addProject}>+ {t('add_project')}</Button>
      </div>
      <p className="hint">{t('empty_rows_note')}</p>

      {projects.length === 0 ? (
        <EmptyState
          icon="📁"
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
                  <button type="button" className="x-small" disabled={i === 0} onClick={() => move(p.id, -1)}>↑</button>
                  <button type="button" className="x-small" disabled={i === projects.length - 1} onClick={() => move(p.id, 1)}>↓</button>
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
    await onSave(data);
    setSaving(false);
    setSavedMsg(t('saved')); setDirty(false);
  }
  async function uploadCover(file) {
    const path = tenantStoragePath(tenant, `project-${data.id}-cover-${Date.now()}.${file.name.split('.').pop()}`);
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (error) { console.error(error); toast.error(t('upload_failed')); return; }
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
    patch({ cover_image: urlData.publicUrl });
  }
  async function uploadGalleryImage(file) {
    const path = tenantStoragePath(tenant, `project-${data.id}-${Date.now()}.${file.name.split('.').pop()}`);
    const { error } = await supabase.storage.from('media').upload(path, file);
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
  const { tenant } = useTenant();

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await loadProfile(tenant, 'custom_links');
    setLinks(data?.custom_links || []);
  }
  function patch(next) { setLinks(next); setDirty(true); }
  async function save() {
    setSaving(true);
    const { error } = await persistProfile(tenant, { custom_links: links });
    setSaving(false);
    if (!error) { setSavedMsg(t('saved')); setDirty(false); }
    else { console.error(error); toast.error(t('save_failed')); }
  }
  function add() { patch([...links, { id: newId(), icon: 'website', label: emptyBilingual(), href: '' }]); }
  function update(id, u) { patch(links.map(l => l.id === id ? { ...l, ...u } : l)); }
  async function remove(id) { if (!(await confirm(removeDialog(t)))) return; patch(links.filter(l => l.id !== id)); }
  function move(id, dir) { const a = [...links]; const i = a.findIndex(l => l.id === id); const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; patch(a); }

  return (
    <div className="editor">
      <h1>{t('links_title')}</h1>
      <p className="hint">{t('links_sub')}</p>

      {links.length === 0 && (
        <EmptyState
          icon="🔗"
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
              <button type="button" className="x-small" disabled={i === 0} onClick={() => move(l.id, -1)}>↑</button>
              <button type="button" className="x-small" disabled={i === links.length - 1} onClick={() => move(l.id, 1)}>↓</button>
            </div>
            <button type="button" className="brand" onClick={() => setPickerForId(l.id)} title={t('pick_icon')}>
              <svg viewBox="0 0 24 24"><path d={icon.path} /></svg>
            </button>
            <input className="input-sm" placeholder={icon.label} value={pick(l.label, lang)} onChange={(e) => update(l.id, { label: setLangValue(l.label, lang, e.target.value) })} style={{ width: 160 }} />
            <input className="input-sm" type="text" dir="ltr" placeholder="https://..." value={l.href || ''} onChange={(e) => update(l.id, { href: e.target.value })} style={{ flex: 1 }} />
            <button type="button" className="x-small" onClick={() => remove(l.id)}>×</button>
          </div>
        );
      })}
      <Button variant="secondary" size="sm" onClick={add}>+ {t('add_link')}</Button>

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
  return (
    <div className="picker-bg" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h3>{t('icon_picker_title')}</h3>
          <button onClick={onClose} className="picker-close" type="button">×</button>
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
    const { error } = await persistProfile(tenant, { appearance });
    setSaving(false);
    if (!error) { setSavedMsg(t('saved')); setDirty(false); }
    else { console.error(error); toast.error(t('save_failed')); }
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

  useEffect(() => { load(); }, [range]);

  async function load() {
    setLoading(true);
    let from;
    const now = new Date();
    if (range === '24h') from = new Date(now - 24 * 3600 * 1000);
    else if (range === '7d') from = new Date(now - 7 * 86400 * 1000);
    else if (range === '30d') from = new Date(now - 30 * 86400 * 1000);
    else from = new Date(0);

    let evq = supabase.from('analytics_events').select('*').gte('created_at', from.toISOString());
    if (tenant) evq = evq.eq('tenant_id', tenant.id);
    const { data: evs } = await evq.order('created_at', { ascending: false });
    let pq = supabase.from('projects').select('id, title');
    if (tenant) pq = pq.eq('tenant_id', tenant.id);
    const { data: projs } = await pq;
    setEvents(evs || []);
    setProjects(projs || []);
    setLoading(false);
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
        <EmptyState icon="📊" title={t('no_data_yet')} compact />
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
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`);
    if (!r.ok) throw new Error(`dns http ${r.status}`);
    const j = await r.json();
    return (j.Answer || []).map((a) => String(a.data || '').replace(/\.$/, '').toLowerCase());
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
  if (status === 'active') return { tone: 'success', dot: '🟢', label: ar ? 'نشط' : 'Active' };
  if (status === 'error') return { tone: 'danger', dot: '🔴', label: ar ? 'فشل' : 'Failed' };
  return { tone: 'warning', dot: '🟡', label: ar ? 'بانتظار DNS' : 'Waiting for DNS' };
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
    const { error } = await supabase.from('tenant_domains')
      .insert({ tenant_id: tenant.id, domain: d, is_primary: domains.length === 0, status: 'pending' });
    setBusy(false);
    if (error) { setErr(error.message || String(error)); return; }
    setNewDomain(''); await load(); setOpenDns(d);
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
          icon="🌐"
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
                <button type="button" className="x-small" onClick={() => removeDomain(d.id)} aria-label="remove">×</button>
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

function TenantAdminSection({ session, lang }) {
  const confirm = useConfirm();
  const { tenant, setTenant, reloadTenants, isOwner } = useTenant();
  const ar = lang === 'ar';

  // Invite a NEW client login (owner-only, via the invite-client Edge Function).
  const [invEmail, setInvEmail] = useState('');
  const [invUser, setInvUser] = useState('');
  const [invBusy, setInvBusy] = useState(false);
  const [invMsg, setInvMsg] = useState('');
  const [invErr, setInvErr] = useState('');
  async function inviteClient(e) {
    e.preventDefault();
    setInvErr(''); setInvMsg('');
    if (!tenant) { setInvErr(ar ? 'اختر مساحة أولًا' : 'Select a workspace first'); return; }
    setInvBusy(true);
    // supabase.functions.invoke attaches the owner's session JWT; the function verifies
    // is_platform_owner server-side before doing anything.
    const { data, error } = await supabase.functions.invoke('invite-client', {
      body: {
        tenant_id: tenant.id,
        email: invEmail.trim(),
        username: invUser.trim(),
        redirect_to: adminRedirectUrl(),
      },
    });
    setInvBusy(false);
    if (error) {
      let detail = error.message;
      try { const b = await error.context?.json?.(); if (b?.error) detail = b.error; } catch (_) {}
      setInvErr(detail || (ar ? 'فشلت الدعوة' : 'Invite failed'));
      return;
    }
    if (data?.error) { setInvErr(data.error); return; }
    setInvEmail(''); setInvUser('');
    setInvMsg((ar ? 'تمت دعوة العميل' : 'Client invited') + (data?.user_created ? '' : ' ✓'));
  }

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [createErr, setCreateErr] = useState('');

  async function createTenant(e) {
    e.preventDefault();
    setCreateErr(''); setCreateMsg('');
    const s = normalizeSlug(slug);
    if (!s) { setCreateErr(ar ? 'أدخل معرّفًا صالحًا' : 'Enter a valid slug'); return; }
    if (RESERVED_SLUGS.includes(s)) {
      setCreateErr(ar ? 'هذا المعرّف محجوز، اختر غيره' : 'That slug is reserved — pick another');
      return;
    }
    setCreating(true);
    try {
      // 1) tenant row
      const { data: tRow, error: tErr } = await supabase.from('tenants')
        .insert({ slug: s, name: name.trim() || s, default_lang: 'ar', status: 'active' })
        .select().single();
      if (tErr) throw tErr;
      // 2) link the current admin as owner FIRST. The profile write is gated by
      //    is_tenant_admin(tenant_id), so we must administer this tenant before we can
      //    create its profile. Roll the tenant back on failure (cascades the mapping).
      const { error: aErr } = await supabase.from('tenant_admins')
        .insert({ tenant_id: tRow.id, user_id: session.user.id, role: 'owner' });
      if (aErr) { await supabase.from('tenants').delete().eq('id', tRow.id); throw aErr; }
      // 3) initial profile row for this tenant (now permitted by is_tenant_admin)
      const { error: pErr } = await supabase.from('profile').insert({ tenant_id: tRow.id, default_lang: 'ar' });
      if (pErr) { await supabase.from('tenants').delete().eq('id', tRow.id); throw pErr; }
      setSlug(''); setName('');
      setCreateMsg(ar ? 'تم إنشاء المساحة' : 'Workspace created');
      await reloadTenants();
      setTenant(tRow);
      try { localStorage.setItem('admin_selected_tenant', String(tRow.id)); } catch (_) {}
    } catch (err) {
      console.error('[tenant] create failed:', err);
      setCreateErr(err?.message || err?.code || (ar ? 'فشل الإنشاء' : 'Creation failed'));
    } finally { setCreating(false); }
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

  // Assign a client as admin of the active tenant. Done through a SECURITY DEFINER
  // RPC because tenant_admins is readable only for your OWN mappings — the client's
  // user_id can't (and shouldn't) be looked up from the browser.
  const [adminUser, setAdminUser] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState('');
  const [assignErr, setAssignErr] = useState('');

  async function assignAdmin(e) {
    e.preventDefault();
    setAssignErr(''); setAssignMsg('');
    if (!tenant) { setAssignErr(ar ? 'اختر مساحة أولًا' : 'Select a workspace first'); return; }
    const u = adminUser.trim();
    if (!u) { setAssignErr(ar ? 'أدخل اسم المستخدم' : 'Enter a username'); return; }
    setAssigning(true);
    const { error } = await supabase.rpc('assign_tenant_admin', { p_tenant_id: tenant.id, p_username: u });
    setAssigning(false);
    if (error) { setAssignErr(error.message || String(error)); return; }
    setAdminUser('');
    setAssignMsg(ar ? 'تم منح الوصول' : 'Access granted');
  }


  return (
    <>
      {isOwner && (
      <>
      <h2>{ar ? 'المساحات (العملاء)' : 'Workspaces (clients)'}</h2>
      <p className="hint">{ar
        ? 'أنشئ مساحة لكل عميل. يتم إنشاء ملف تعريف وربطك كمالك تلقائيًا.'
        : 'Create a workspace per client. A profile is provisioned and you are linked as owner automatically.'}</p>
      <form onSubmit={createTenant} style={{ maxWidth: 500 }}>
        <Field id="tenant-slug" label={ar ? 'المعرّف (slug)' : 'Slug'}>
          <input id="tenant-slug" type="text" dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-studio" />
        </Field>
        <Field id="tenant-name" label={ar ? 'الاسم' : 'Name'}>
          <input id="tenant-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={ar ? 'أكمي ستوديو' : 'Acme Studio'} />
        </Field>
        {createErr && <div className="ts-err">{createErr}</div>}
        {createMsg && <div className="ts-ok">{createMsg} ✓</div>}
        <Button type="submit" loading={creating} style={{ marginTop: 12 }}>
          {ar ? 'إنشاء مساحة' : 'Create workspace'}
        </Button>
      </form>

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
            </div>
          </form>
          {wsErr && <div className="ts-err">{wsErr}</div>}
          {wsMsg && <div className="ts-ok">{wsMsg} ✓</div>}
        </>
      )}

      <h2>{ar ? 'دعوة عميل' : 'Invite client'} <span className="meta">· {tenant?.name || tenant?.slug || (ar ? 'لا توجد مساحة' : 'no workspace')}</span></h2>
      <p className="hint">{ar
        ? 'أنشئ حساب دخول جديد للعميل وأرسل له دعوة بالبريد. يُربط تلقائيًا بهذه المساحة كـ«عميل».'
        : 'Create a new login for the client and email them an invite. They are linked to this workspace as a client automatically.'}</p>
      {tenant ? (
        <form onSubmit={inviteClient} style={{ maxWidth: 500 }}>
          <Field id="inv-email" label={ar ? 'البريد الإلكتروني' : 'Email'}>
            <input id="inv-email" type="email" dir="ltr" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="client@email.com" />
          </Field>
          <Field id="inv-user" label={ar ? 'اسم المستخدم' : 'Username'}>
            <input id="inv-user" type="text" dir="ltr" value={invUser} onChange={(e) => setInvUser(e.target.value)} placeholder="client" />
          </Field>
          {invErr && <div className="ts-err">{invErr}</div>}
          {invMsg && <div className="ts-ok">{invMsg} ✓</div>}
          <Button type="submit" loading={invBusy} style={{ marginTop: 12 }}>
            {ar ? 'إرسال الدعوة' : 'Send invite'}
          </Button>
        </form>
      ) : (
        <div className="hint">{ar ? 'اختر مساحة من الأعلى.' : 'Select a workspace at the top.'}</div>
      )}

      <h2>{ar ? 'مدير العميل' : 'Client admin'} <span className="meta">· {tenant?.name || tenant?.slug || (ar ? 'لا توجد مساحة' : 'no workspace')}</span></h2>
      <p className="hint">{ar
        ? 'امنح مستخدمًا موجودًا (باسم مستخدم) حق إدارة هذه المساحة.'
        : 'Grant an EXISTING user (by username) admin access to this workspace.'}</p>
      {tenant ? (
        <form onSubmit={assignAdmin} style={{ display: 'flex', gap: 8, maxWidth: 500, alignItems: 'flex-start' }}>
          <input type="text" dir="ltr" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} placeholder={ar ? 'اسم المستخدم' : 'username'} />
          <Button type="submit" variant="secondary" size="sm" loading={assigning}>{ar ? 'منح' : 'Grant'}</Button>
        </form>
      ) : (
        <div className="hint">{ar ? 'اختر مساحة من الأعلى.' : 'Select a workspace at the top.'}</div>
      )}
      {assignErr && <div className="ts-err">{assignErr}</div>}
      {assignMsg && <div className="ts-ok">{assignMsg} ✓</div>}
      </>
      )}

      <h2>{ar ? 'موقعك والنطاق' : 'Your website & domain'} <span className="meta">· {tenant?.name || tenant?.slug || (ar ? 'لا توجد مساحة' : 'no workspace')}</span></h2>
      <p className="hint">{ar
        ? `موقعك متاح دائمًا على /${tenant?.slug || 'slug'}. اربط نطاقك المخصص في ثلاث خطوات: أضِف النطاق، أضِف سجل DNS، ثم تحقّق.`
        : `Your site is always live at /${tenant?.slug || 'slug'}. Connect a custom domain in three steps: add it, add the DNS record, then verify.`}</p>
      <DomainManager lang={lang} isOwner={isOwner} />

      <style jsx>{`
        .ts-err { padding: 8px 12px; background: rgba(255,80,80,0.1); color: #ff8080; border-radius: var(--radius-md); font-size: 12px; margin-top: 8px; }
        .ts-ok { padding: 8px 12px; background: rgba(125,211,125,0.1); color: #7dd37d; border-radius: var(--radius-md); font-size: 12px; margin-top: 8px; }
      `}</style>
    </>
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
function ClientOnboardingChecklist({ items, labels, onNavigate, ar }) {
  return (
    <div className="ck">
      {items.map((it) => (
        <Card key={it.key} as="button" interactive pad="none" className={`ck-item ${it.done ? 'done' : ''}`} onClick={() => onNavigate(it.tab)}>
          <span className="ck-box">{it.done ? '✓' : ''}</span>
          <span className="ck-label">{labels[it.key]}</span>
          <span className="ck-arrow">{ar ? '‹' : '›'}</span>
        </Card>
      ))}
      <style jsx>{`
        .ck { display: flex; flex-direction: column; gap: 8px; max-width: 640px; }
        /* surface comes from Card; only the row layout is local */
        .ck-item { display: flex; align-items: center; gap: 12px; padding: 13px 14px; font-size: var(--text-md); min-height: 48px; }
        .ck-box { width: 22px; height: 22px; flex-shrink: 0; border-radius: 6px; border: 1.5px solid var(--border-strong); display: flex; align-items: center; justify-content: center; font-size: 13px; color: #fff; }
        .ck-item.done .ck-box { background: var(--accent); border-color: var(--accent); }
        .ck-item.done .ck-label { color: var(--text-tertiary); text-decoration: line-through; }
        .ck-label { flex: 1; }
        .ck-arrow { color: var(--text-muted); font-size: 18px; }
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
  const LABELS = {
    photo: ar ? 'أضف صورة الملف' : 'Add profile photo',
    bio: ar ? 'اكتب نبذتك' : 'Write your bio',
    project: ar ? 'أضف أول مشروع' : 'Add your first project',
    links: ar ? 'أضف روابط التواصل' : 'Add social links',
    theme: ar ? 'اختر مظهرًا' : 'Choose a theme',
    domain: ar ? 'اربط نطاقك' : 'Connect a domain',
    publish: ar ? 'أضف اسمك وانشر' : 'Add your name & publish',
  };

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
      {!loading && <ClientOnboardingChecklist items={setup.items} labels={LABELS} onNavigate={onNavigate} ar={ar} />}

      <AdminStyles />
      <style jsx>{`
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ids = tenants.map((x) => x.id);
      if (ids.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }
      const [{ data: profiles }, { data: projects }, { data: domains }] = await Promise.all([
        supabase.from('profile').select('tenant_id,name,bio,profile_image,brand_logo,custom_links,appearance').in('tenant_id', ids),
        supabase.from('projects').select('tenant_id').in('tenant_id', ids),
        supabase.from('tenant_domains').select('tenant_id,domain,is_primary').in('tenant_id', ids),
      ]);
      const pcount = {}; (projects || []).forEach((p) => { pcount[p.tenant_id] = (pcount[p.tenant_id] || 0) + 1; });
      const pmap = {}; (profiles || []).forEach((p) => { pmap[p.tenant_id] = p; });
      const dmap = {}; (domains || []).forEach((d) => { (dmap[d.tenant_id] = dmap[d.tenant_id] || []).push(d); });
      const out = tenants.map((x) => {
        const s = computeSetup({ profile: pmap[x.id], projectCount: pcount[x.id] || 0, domainCount: (dmap[x.id] || []).length });
        const dom = (dmap[x.id] || []).find((d) => d.is_primary) || (dmap[x.id] || [])[0];
        return {
          id: x.id, name: x.name || x.slug, status: x.status, percent: s.percent,
          domain: dom?.domain || `/${x.slug}`,
          domainStatus: dom ? dom.status : null,
          isPrimary: !!dom?.is_primary,
        };
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (!cancelled) { setRows(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenants]);

  return (
    <div className="editor">
      <h1>{ar ? 'العملاء' : 'Clients'} <span className="meta">· {rows.length}</span></h1>
      <p className="hint">{ar ? 'نظرة عامة على مساحات العملاء. اضغط لفتح مساحة.' : 'A quick overview of your client workspaces. Tap one to open it.'}</p>
      {loading ? <div className="hint">…</div> : rows.length === 0 ? (
        <div className="hint">{ar ? 'لا يوجد عملاء بعد.' : 'No clients yet.'}</div>
      ) : (
        <div className="cl-list">
          {rows.map((r) => (
            <Card key={r.id} as="button" interactive pad="none" className="cl-row" onClick={() => onOpen(r.id)}>
              <div className="cl-main">
                <div className="cl-name">{r.name}</div>
                <div className="cl-domain" dir="ltr">
                  {r.domainStatus ? `${domainStatusMeta(r.domainStatus, ar).dot} ` : ''}{r.domain}{r.isPrimary ? ' ★' : ''}
                </div>
              </div>
              <Badge tone={r.status === 'disabled' ? 'danger' : 'success'}>
                {r.status === 'disabled' ? (ar ? 'معلّق' : 'Suspended') : (ar ? 'نشط' : 'Active')}
              </Badge>
              <span className="cl-pct">{r.percent}%</span>
            </Card>
          ))}
        </div>
      )}
      <AdminStyles />
      <style jsx>{`
        .cl-list { display: flex; flex-direction: column; gap: 8px; max-width: 720px; }
        /* surface comes from Card; only the row layout is local */
        .cl-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; min-height: 56px; }
        .cl-main { flex: 1; min-width: 0; }
        .cl-name { font-size: 14px; font-weight: 600; }
        .cl-domain { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
    const { error } = await persistProfile(tenant, { default_lang: next });
    setSavingLang(false);
    if (!error) {
      setSavedLangMsg(t('saved'));
      // Also flip the admin chrome to match — feels weird if default lang doesn't apply
      if (setChromeLang) setChromeLang(next);
      setTimeout(() => setSavedLangMsg(''), 2000);
    }
  }

  async function updatePassword(e) {
    e.preventDefault();
    setPwdErr(''); setPwdMsg('');
    if (newPwd.length < 8) { setPwdErr(t('password_too_short')); return; }
    if (newPwd !== confirmPwd) { setPwdErr(t('password_mismatch')); return; }
    setPwdLoading(true);
    const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: session.user.email, password: curPwd });
    if (reAuthErr) { setPwdErr(t('invalid_credentials')); setPwdLoading(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdLoading(false);
    if (error) setPwdErr(error.message);
    else { setPwdMsg(t('password_updated')); setCurPwd(''); setNewPwd(''); setConfirmPwd(''); setTimeout(() => setPwdMsg(''), 3000); }
  }

  async function deletePortfolio() {
    // Same guard as before — the keyword must be typed exactly — but in-app.
    const keyword = t('delete_portfolio_keyword');
    const ok = await confirm({
      title: t('delete_portfolio'),
      description: t('delete_portfolio_warning'),
      requireText: keyword,
      requireTextLabel: t('type_to_confirm').replace('{word}', keyword),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
    });
    if (!ok) return;

    // Reset ONLY the currently selected tenant. In legacy mode (tenant = null) this
    // falls through to the singleton branch and behaves exactly as it does today.
    const tenantMode = !!tenant;

    // The fields a "reset" clears — identical in both modes.
    const reset = {
      name: emptyBilingual(), tagline: emptyBilingual(), bio: emptyBilingual(),
      profile_image: '', brand_logo: '',
      links: {}, custom_links: [], custom_fields: [], banners: [], stats: [], cta_buttons: [],
      appearance: {}, sections: { bio: true, custom_fields: true, projects: true, links: true, lang_switcher: true },
    };

    if (tenantMode) {
      // Future multi-tenant: delete ONLY this tenant's rows. NEVER a global delete.
      await supabase.from('analytics_events').delete().eq('tenant_id', tenant.id);
      await supabase.from('projects').delete().eq('tenant_id', tenant.id);
      await supabase.from('profile').update(reset).eq('tenant_id', tenant.id);
    } else {
      // Current singleton behavior — unchanged.
      await supabase.from('analytics_events').delete().neq('id', 0);
      await supabase.from('projects').delete().neq('id', 0);
      await supabase.from('profile').update(reset).eq('id', 1);
    }

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

      <TenantAdminSection session={session} lang={lang} />

      <h2>{t('change_password')}</h2>
      <form onSubmit={updatePassword} style={{ maxWidth: 500 }}>
        <Field id="pwd-cur" label={t('current_password')}>
          <input id="pwd-cur" type="password" dir="ltr" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field id="pwd-new" label={t('new_password')}>
          <input id="pwd-new" type="password" dir="ltr" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field id="pwd-conf" label={t('confirm_new_password')}>
          <input id="pwd-conf" type="password" dir="ltr" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" required />
        </Field>
        {pwdErr && <div className="err">{pwdErr}</div>}
        {pwdMsg && <div className="ok">{pwdMsg} ✓</div>}
        <Button type="submit" loading={pwdLoading} style={{ marginTop: 12 }}>{t('update_password')}</Button>
      </form>

      <h2 style={{ color: '#ff8080', marginTop: 48 }}>{t('danger_zone')}</h2>
      <div className="danger-card">
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('delete_portfolio_desc')}</div>
        <Button variant="danger" size="sm" onClick={deletePortfolio}>{t('delete_portfolio')}</Button>
      </div>

      <AdminStyles />
      <style jsx>{`
        .user-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); max-width: 500px; margin-bottom: var(--space-5); }
        .avatar-lg { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #4f6ef2, #2d47a8); display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; color: #fff; }
        .user-name { font-size: 14px; font-weight: 600; }
        .user-email { font-size: 12px; color: var(--text-tertiary); }
        .danger-card { padding: 16px; background: rgba(255,80,80,0.05); border: 1px solid rgba(255,80,80,0.2); border-radius: var(--radius-md); max-width: 500px; }
        .err { padding: 8px 12px; background: rgba(255,80,80,0.1); color: #ff8080; border-radius: var(--radius-md); font-size: 12px; margin-top: 8px; }
        .ok { padding: 8px 12px; background: rgba(125,211,125,0.1); color: #7dd37d; border-radius: var(--radius-md); font-size: 12px; margin-top: 8px; }
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
    setUploading(true); await onUpload(file); setUploading(false);
  }
  async function handleCropDone(blob) {
    const ext = blob.type === 'image/png' ? '.png' : '.jpg';
    const out = new File([blob], cropFile.name.replace(/\.[^.]+$/, ext), { type: blob.type || 'image/jpeg' });
    setCropFile(null);
    setUploading(true); await onUpload(out); setUploading(false);
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
      <div className="cm" onClick={(e) => e.stopPropagation()}>
        <div className="cm-head">
          <h3>{t('crop_image')}</h3>
          <button onClick={onCancel} className="cm-close" type="button">×</button>
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
    setUploading(true); for (const f of valid) await onUpload(f); setUploading(false);
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
