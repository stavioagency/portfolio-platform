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
import { Appearance, Links, Profile } from '../../components/studio/sections';
import { Work } from '../../components/studio/work';
import { DEFAULT_SECTION, isStudioSection, studioSectionLabel } from '../../lib/studio-nav';
import { hasPublicContent } from '../../lib/profile-content';
import { loadProjects, loadWorkspaces } from '../../lib/studio-data';
import { hasUnpublishedChanges, isEntitled } from '../../lib/studio-publish';
import { PublishPanel, Preview } from '../../components/studio/publish';
import { NoProfileNotice } from '../../components/studio/notices';

const THEME_KEY = 'admin_theme';
const LANG_KEY = 'admin_lang';
const WORKSPACE_KEY = 'studio_workspace';

export default function StudioPage() {
  const router = useRouter();
  const [phase, setPhase] = useState('loading');  // loading | signedout | noworkspace | ready | error
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  /* null means "not answered yet" for both. A status line that says "Published"
     or a button that says "you cannot" before the database has answered is a
     claim the screen has not earned. */
  const [changes, setChanges] = useState(null);
  const [entitled, setEntitled] = useState(null);
  const [previewToken, setPreviewToken] = useState(0);
  const [workspaces, setWorkspaces] = useState([]);
  const [lang, setLangState] = useState('ar');
  const [section, setSection] = useState(DEFAULT_SECTION);

  const ar = lang === 'ar';

  /* The section lives in the URL so a screen can be linked, reloaded and
     shared, and so the back button does what everyone expects.
     READ FROM location.search, NOT router.query. On this page — statically
     optimised, no getServerSideProps — router.query was observed EMPTY while
     isReady was already true and the address bar plainly read ?s=work, so
     /studio?s=work silently opened Home. Deep links into a section were broken
     and nothing said so. window.location is the address bar, which is the thing
     the customer actually pasted, and it is right in dev, in production and on
     first paint. popstate covers the back button. */
  useEffect(() => {
    const read = () => {
      let q = '';
      try { q = new URLSearchParams(window.location.search).get('s') || ''; } catch (e) { /* ignore */ }
      setSection(isStudioSection(q) ? q : DEFAULT_SECTION);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

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

      /* Scoped by MEMBERSHIP, not by reading `tenants` directly — that table is
         world-readable, so an unscoped select hands every customer the whole
         platform's list. See lib/studio-data.loadWorkspaces. */
      const tenants = await loadWorkspaces();
      if (!tenants || tenants.length === 0) { setPhase('noworkspace'); return; }
      setWorkspaces(tenants);

      /* A remembered choice wins, when it is still one of theirs. Without this
         an owner — who administers every tenant — is returned to whichever row
         sorts first on every single load, which is not the one they were
         working on. */
      let chosen = null;
      try {
        const saved = localStorage.getItem(WORKSPACE_KEY);
        chosen = saved ? tenants.find((x) => x.id === saved) : null;
      } catch (e) { /* private mode */ }
      const t = chosen || tenants[0];
      setTenant(t);

      /* Projects are loaded in full rather than counted: Work needs the rows,
         and Home's count must come from the SAME read, or the two screens can
         disagree about how many projects exist. */
      const [{ data: profile, error: pErr }, rows] = await Promise.all([
        supabase.from('profile').select('*').eq('tenant_id', t.id).maybeSingle(),
        loadProjects(t.id),
      ]);
      if (pErr) throw pErr;

      setProfile(profile || null);
      setProjects(rows);
      setSnapshot({ published: Boolean(t.published_at) });
      setPhase('ready');

      /* Asked AFTER the screen is usable, not before: neither answer is needed
         to render, and blocking the whole Studio on two extra round trips is
         how a tool starts feeling slow. */
      hasUnpublishedChanges(t.id).then(setChanges);
      isEntitled(t.id).then(setEntitled);
    } catch (e) {
      /* Never a blank screen and never a frozen button: say what happened, say
         that nothing was changed, and offer the one action that can help. */
      setError(e?.message || String(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  /* The draft changed, so both "is there anything to publish" and the preview
     are now stale. The check is the database's byte comparison, not a guess
     from what just happened on screen — a save that wrote the same value back
     is not a change, and only the database can say so. */
  const draftChanged = useCallback(() => {
    if (!tenant) return;
    setPreviewToken((v) => v + 1);
    hasUnpublishedChanges(tenant.id).then(setChanges);
  }, [tenant]);

  const onProfile = useCallback((next) => { setProfile(next); draftChanged(); }, [draftChanged]);
  const onProjectsChanged = useCallback((next) => { setProjects(next); draftChanged(); }, [draftChanged]);

  const signOut = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
    window.location.replace('/admin');
  }, []);

  /* EDITING NO LONGER REQUIRES PAYING. section-z split the predicate:
     can_draft_tenant() governs profile and projects and needs only membership,
     while can_edit_tenant() still gates publish_tenant(). A customer builds for
     free and pays to publish, so the only thing that can stop a save here is a
     missing profile row — and the paywall lives in the publish panel, which is
     the one place it is true. */
  const hasProfileRow = profile !== null;
  const canEdit = hasProfileRow;

  const status = useMemo(() => {
    if (!snapshot || !tenant) return null;
    return { published: snapshot.published, hasChanges: changes === true, slug: tenant.slug };
  }, [snapshot, tenant, changes]);

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
        workspace={tenant?.name || tenant?.slug || ''}
        workspaces={workspaces}
        workspaceId={tenant?.id || ''}
        onWorkspace={(id) => {
          /* A full reload rather than swapping state: every screen holds a
             draft of the workspace it opened with, and switching underneath
             them would leave a half-edited Profile pointed at somebody else's
             portfolio — which is the exact accident this selector exists to
             prevent. */
          try { localStorage.setItem(WORKSPACE_KEY, id); } catch (e) { /* ignore */ }
          window.location.assign('/studio');
        }}
        onSignOut={signOut}
      >
        {/* Said once, above whichever screen is open, rather than once per
            field. A subscription would not fix a missing row, so this must
            never be mistaken for the paywall — which lives on Home. */}
        {!hasProfileRow && <NoProfileNotice ar={ar} />}

        {section === 'home' && (
          <Home ar={ar} tenant={tenant} profile={profile} projectCount={projects.length}
                published={snapshot.published} entitled={entitled} changes={changes}
                previewToken={previewToken} onRefreshPreview={draftChanged}
                onSection={goSection}
                onPublished={() => { setSnapshot({ published: true }); setChanges(false); }} />
        )}
        {section === 'profile' && (
          <Profile ar={ar} uiLang={lang} tenant={tenant} profile={profile} onSaved={onProfile}
                   canEdit={canEdit} />
        )}
        {section === 'work' && (
          <Work ar={ar} uiLang={lang} tenant={tenant} profile={profile}
                projects={projects} onProjects={onProjectsChanged} canEdit={canEdit} />
        )}
        {section === 'appearance' && (
          <Appearance ar={ar} tenant={tenant} profile={profile} onSaved={onProfile}
                      canEdit={canEdit} />
        )}
        {section === 'links' && (
          <Links ar={ar} tenant={tenant} profile={profile} onSaved={onProfile}
                 canEdit={canEdit} />
        )}
        {['domain', 'visitors', 'plan', 'settings'].includes(section) && (
          <NotYet ar={ar} section={section} />
        )}
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
function Home({ ar, tenant, profile, projectCount, published, entitled, changes,
                previewToken, onRefreshPreview, onSection, onPublished }) {
  /* hasPublicContent() is the same check the public page uses to decide whether
     a portfolio renders at all — reused rather than restated, so this screen
     cannot disagree with the page it describes. The publishing CHECKLIST is not
     duplicated here: PublishPanel owns the one definition of "ready", because
     two lists is how a checklist and a button end up contradicting each other. */
  const renderable = hasPublicContent(profile, projectCount);

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

      <PublishPanel
        ar={ar} tenant={tenant} profile={profile} projectCount={projectCount}
        published={published} entitled={entitled} hasChanges={changes === true}
        onSection={onSection} onPublished={onPublished}
      />

      <Preview ar={ar} slug={tenant.slug} token={previewToken} onRefresh={onRefreshPreview} />

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

