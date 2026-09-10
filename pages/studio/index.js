/* /studio — the customer's Studio.
 *
 * THE CUSTOMER-FACING MANAGEMENT EXPERIENCE. It replaces what /admin does for
 * customers; /admin stays exactly as it is and stays the live editor until
 * Studio proves equivalent, because breaking the tool eleven workspaces are
 * using is not a redesign.
 *
 * ── WHAT THIS PHASE BUILDS ───────────────────────────────────────────────
 * The shell and Home. Navigation, direction, account context, and a Home that
 * reports the REAL state of the customer's portfolio from the real database.
 * The five editing screens land next; until then they say so plainly rather
 * than showing an empty frame that reads as broken.
 *
 * ── AUTHENTICATION IS REUSED, NOT REBUILT ────────────────────────────────
 * There is ONE login screen for the platform and it lives at /admin. It already
 * reads ?next= and returns you where you came from, which is exactly how
 * /console gets you signed in. Studio does the same rather than growing a
 * second sign-in form: two login screens is two places for a session bug to
 * live, and the existing one already handles verification arrivals, recovery
 * links and the set-password gate.
 *
 * ── AUTHORIZATION IS THE DATABASE'S, NOT THIS FILE'S ─────────────────────
 * Everything below reads through the authenticated client under RLS. A customer
 * sees their own workspaces because is_tenant_admin() says so, not because this
 * page filtered a list. Nothing here is a security boundary and nothing here
 * should ever become one.
 */

import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { Button, Icon } from '../../components/ui';
import StudioShell from '../../components/studio/StudioShell';
import { DEFAULT_SECTION, isStudioSection, studioSectionLabel } from '../../lib/studio-nav';
import { hasPublicContent } from '../../lib/profile-content';

const THEME_KEY = 'admin_theme';
const LANG_KEY = 'admin_lang';

export default function StudioPage() {
  const router = useRouter();
  const [phase, setPhase] = useState('loading');  // loading | signedout | noworkspace | ready | error
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [lang, setLangState] = useState('ar');
  const [section, setSection] = useState(DEFAULT_SECTION);

  const ar = lang === 'ar';

  /* The section lives in the URL so a screen can be linked, reloaded and
     shared, and so the back button does what everyone expects. */
  useEffect(() => {
    if (!router.isReady) return;
    const q = typeof router.query.s === 'string' ? router.query.s : '';
    setSection(isStudioSection(q) ? q : DEFAULT_SECTION);
  }, [router.isReady, router.query.s]);

  const goSection = useCallback((id) => {
    setSection(id);
    router.push({ pathname: '/studio', query: id === DEFAULT_SECTION ? {} : { s: id } },
      undefined, { shallow: true });
  }, [router]);

  /* Language is remembered under the SAME key the existing editor uses, so a
     customer who chose Arabic in /admin does not choose it again here. One
     account, one language preference. */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored === 'ar' || stored === 'en') setLangState(stored);
      document.documentElement.setAttribute('data-admin-theme', localStorage.getItem(THEME_KEY) || 'light');
    } catch (e) { /* private mode: fall through to the defaults */ }
  }, []);

  const setLang = useCallback((next) => {
    setLangState(next);
    try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('dir', ar ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', ar ? 'ar' : 'en');
  }, [ar]);

  const boot = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) { setPhase('signedout'); return; }
      setSession(s);

      /* RLS decides what comes back. A customer gets the workspaces they
         administer; nothing here filters by anything. */
      const { data: tenants, error: tErr } = await supabase
        .from('tenants')
        .select('id, slug, name, status, default_lang, published_at')
        .order('created_at', { ascending: true });
      if (tErr) throw tErr;
      if (!tenants || tenants.length === 0) { setPhase('noworkspace'); return; }

      const t = tenants[0];
      setTenant(t);

      const [{ data: profile, error: pErr }, { count, error: cErr }] = await Promise.all([
        supabase.from('profile').select('*').eq('tenant_id', t.id).maybeSingle(),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      ]);
      if (pErr) throw pErr;
      if (cErr) throw cErr;

      setSnapshot({
        profile: profile || null,
        projectCount: count || 0,
        published: Boolean(t.published_at),
      });
      setPhase('ready');
    } catch (e) {
      /* Never a blank screen and never a frozen button: say what happened, say
         that nothing was changed, and offer the one action that can help. */
      setError(e?.message || String(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  const signOut = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
    window.location.replace('/admin');
  }, []);

  const status = useMemo(() => {
    if (!snapshot || !tenant) return null;
    return { published: snapshot.published, hasChanges: false, slug: tenant.slug };
  }, [snapshot, tenant]);

  const title = ar ? 'الاستوديو — ديزايناكم' : 'Studio — Designakum';

  if (phase !== 'ready') {
    return (
      <>
        <Head><title>{title}</title></Head>
        <Gate phase={phase} ar={ar} error={error} onRetry={boot} />
      </>
    );
  }

  return (
    <>
      <Head><title>{title}</title></Head>
      <StudioShell
        section={section}
        onSection={goSection}
        lang={lang}
        onLang={setLang}
        status={status}
        account={{ email: session?.user?.email || '' }}
        onSignOut={signOut}
      >
        {section === 'home'
          ? <Home ar={ar} tenant={tenant} snapshot={snapshot} onSection={goSection} />
          : <NotYet ar={ar} section={section} />}
      </StudioShell>
    </>
  );
}

/* Every non-ready state in one place, so none of them can be the blank screen
   the old editor showed while a session was restoring. */
function Gate({ phase, ar, error, onRetry }) {
  const body = {
    loading: { title: ar ? 'جارٍ الفتح…' : 'Opening…', text: '' },
    signedout: {
      title: ar ? 'تسجيل الدخول للمتابعة' : 'Sign in to continue',
      text: ar
        ? 'الاستوديو خاص بحسابك، والعودة إلى هنا تلقائية بعد تسجيل الدخول.'
        : 'The Studio is tied to your account. Sign in and we will bring you straight back.',
      action: { href: '/admin?next=/studio', label: ar ? 'تسجيل الدخول' : 'Sign in' },
    },
    noworkspace: {
      title: ar ? 'لا يوجد معرض على هذا الحساب' : 'No portfolio on this account',
      text: ar
        ? 'هذا الحساب ليس مرتبطًا بأي معرض بعد. إن كنت تظن أن هذا خطأ، تواصل معنا.'
        : 'This account is not linked to a portfolio yet. If you think that is wrong, get in touch.',
    },
    error: {
      title: ar ? 'تعذّر فتح الاستوديو' : 'Could not open the Studio',
      text: ar
        ? 'لم نتمكن من قراءة بياناتك. لم يتغيّر شيء في معرضك.'
        : 'We could not read your data. Nothing in your portfolio has changed.',
    },
  }[phase];

  return (
    <div className="gate" dir={ar ? 'rtl' : 'ltr'}>
      <div className="box">
        {phase === 'loading' && <span className="spin" aria-hidden="true" />}
        <h1>{body.title}</h1>
        {body.text && <p>{body.text}</p>}
        {/* The real message is kept, quietly: "something went wrong" alone is
            unactionable for the one person who could act on it. */}
        {phase === 'error' && error && <code>{error}</code>}
        {body.action && <Button as="a" href={body.action.href}>{body.action.label}</Button>}
        {phase === 'error' && (
          <Button onClick={onRetry}>
            <Icon name="refresh" size={15} />{ar ? 'إعادة المحاولة' : 'Try again'}
          </Button>
        )}
      </div>
      <style jsx>{`
        .gate { min-height: 100vh; display: grid; place-items: center;
                background: var(--bg-primary); color: var(--text-primary);
                font-family: var(--font-body); padding: var(--gutter); }
        .box { max-width: 40ch; text-align: center; display: flex; flex-direction: column;
               align-items: center; gap: var(--space-3); }
        h1 { margin: 0; font-size: var(--text-xl); font-family: var(--font-heading); }
        p { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.7; }
        code { font-size: var(--text-xs); color: var(--text-tertiary); word-break: break-word; }
        .spin { width: 22px; height: 22px; border-radius: 50%;
                border: 2px solid var(--border-default); border-top-color: var(--brand);
                animation: sp var(--t-spin) linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
      `}</style>
    </div>
  );
}

/* HOME — orientation, not analytics.
 *
 * It answers the four questions a customer opens the Studio with: is my page
 * live, is it finished, what should I do next, and where is it. Nothing here is
 * a statistic and nothing is invented — every line is read from the customer's
 * own rows, and hasPublicContent() is the same check the public page already
 * uses to decide whether a portfolio renders at all. */
function Home({ ar, tenant, snapshot, onSection }) {
  const { profile, projectCount, published } = snapshot;
  const renderable = hasPublicContent(profile, projectCount);

  const steps = [
    { id: 'name', ok: hasText(profile?.name), section: 'profile', label: ar ? 'اسمك' : 'Your name' },
    { id: 'title', ok: hasText(profile?.tagline), section: 'profile', label: ar ? 'مجالك' : 'What you do' },
    { id: 'projects', ok: projectCount > 0, section: 'work', label: ar ? 'عمل واحد على الأقل' : 'At least one project' },
    { id: 'links', ok: Array.isArray(profile?.custom_links) && profile.custom_links.length > 0,
      section: 'links', label: ar ? 'طريقة للتواصل' : 'A way to reach you' },
  ];
  const remaining = steps.filter((s) => !s.ok);

  return (
    <div className="home">
      <header className="head">
        <h1>{ar ? 'استوديو المعرض' : 'Portfolio Studio'}</h1>
        <p>{tenant.name || tenant.slug}</p>
      </header>

      <section className="card">
        <h2>{ar ? 'حالة معرضك' : 'Your portfolio'}</h2>
        {published ? (
          <p className="state live">
            {ar ? 'معرضك منشور ويمكن لأي شخص زيارته.' : 'Your portfolio is published and anyone can visit it.'}
          </p>
        ) : (
          <p className="state">
            {renderable
              ? (ar ? 'معرضك جاهز للنشر ولم يُنشر بعد.' : 'Your portfolio is ready to publish and has not been published yet.')
              : (ar ? 'معرضك ما زال مسودة، والأساسيات غير مكتملة بعد.' : 'Your portfolio is still a draft. Finish the basics first.')}
          </p>
        )}
        <p className="url">
          <span>{ar ? 'عنوانك' : 'Your address'}</span>
          <code>designakum.site/{tenant.slug}</code>
        </p>
      </section>

      <section className="card">
        <h2>{ar ? 'الأساسيات' : 'The basics'}</h2>
        <ul className="checks">
          {steps.map((s) => (
            <li key={s.id} className={s.ok ? 'ok' : ''}>
              <span className="tick" aria-hidden="true">
                {s.ok ? <Icon name="check" size={14} /> : <span className="empty" />}
              </span>
              <span className="lbl">{s.label}</span>
              {!s.ok && (
                <button type="button" className="fix" onClick={() => onSection(s.section)}>
                  {ar ? 'إضافة' : 'Add'}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="note">
          {remaining.length === 0
            ? (ar ? 'كل الأساسيات مكتملة.' : 'Every basic is complete.')
            : (ar ? `بقي ${remaining.length} من ${steps.length}.` : `${remaining.length} of ${steps.length} left.`)}
        </p>
      </section>

      <section className="card">
        <h2>{ar ? 'أعمالك' : 'Your work'}</h2>
        <p className="state">
          {projectCount === 0
            ? (ar ? 'لا توجد أعمال بعد.' : 'No projects yet.')
            : (ar ? `${projectCount} عمل في معرضك.` : `${projectCount} in your portfolio.`)}
        </p>
        <Button onClick={() => onSection('work')}>
          {projectCount === 0 ? (ar ? 'إضافة أول عمل' : 'Add your first project') : (ar ? 'إدارة الأعمال' : 'Manage work')}
        </Button>
      </section>

      <style jsx>{`
        .home { display: flex; flex-direction: column; gap: var(--space-4); }
        .head h1 { margin: 0 0 4px; font-size: var(--text-2xl); font-family: var(--font-heading); }
        .head p { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); }
        .card { border: 1px solid var(--border-default); border-radius: var(--radius-lg);
                background: var(--surface-card); padding: var(--space-4); }
        h2 { margin: 0 0 var(--space-3); font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        .state { margin: 0 0 var(--space-3); font-size: var(--text-md); line-height: 1.7; }
        .state.live { color: var(--success-ink); }
        .url { margin: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline;
               font-size: var(--text-xs); color: var(--text-tertiary); }
        .url code { color: var(--text-primary); }
        .checks { list-style: none; margin: 0 0 var(--space-3); padding: 0;
                  display: flex; flex-direction: column; gap: var(--space-2); }
        .checks li { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-sm); }
        .tick { flex: none; width: 20px; height: 20px; display: grid; place-items: center;
                border-radius: 50%; background: var(--bg-elevated); color: var(--text-tertiary); }
        .ok .tick { background: var(--success-bg); color: var(--success-ink); }
        .empty { width: 7px; height: 7px; border-radius: 50%; background: var(--border-strong); display: block; }
        .lbl { min-width: 0; }
        .ok .lbl { color: var(--text-secondary); }
        .fix { margin-inline-start: auto; border: 0; background: none; cursor: pointer;
               color: var(--text-link); font: inherit; font-size: var(--text-xs); font-weight: 600;
               padding: 4px 6px; border-radius: var(--radius-sm); }
        .fix:hover { background: var(--surface-hover); }
        .fix:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .note { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }
        @media (min-width: 900px) { .home { max-width: 720px; } }
      `}</style>
    </div>
  );
}

/* An honest placeholder. /admin is still the working editor for these screens,
   so this says where the customer can do the thing today rather than showing an
   empty frame that reads as broken. It is deleted screen by screen as each is
   built and must never become a permanent part of the product. */
function NotYet({ ar, section }) {
  return (
    <div className="notyet">
      <h1>{studioSectionLabel(section, ar)}</h1>
      <p>
        {ar
          ? 'هذا القسم قيد البناء في الاستوديو الجديد. حتى ذلك الحين يمكنك إدارته من المحرر الحالي.'
          : 'This section is being built in the new Studio. Until then you can manage it in the current editor.'}
      </p>
      <Button as="a" href="/admin">{ar ? 'فتح المحرر الحالي' : 'Open the current editor'}</Button>
      <style jsx>{`
        .notyet { max-width: 46ch; display: flex; flex-direction: column; gap: var(--space-3);
                  align-items: flex-start; padding-top: var(--space-5); }
        h1 { margin: 0; font-size: var(--text-xl); font-family: var(--font-heading); }
        p { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.7; }
      `}</style>
    </div>
  );
}

function hasText(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v !== 'object') return false;
  return Object.values(v).some((s) => typeof s === 'string' && s.trim() !== '');
}
