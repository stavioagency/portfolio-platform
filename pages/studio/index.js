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
import { Facts } from '../../components/studio/facts';
import { PageParts, SiteIdentity } from '../../components/studio/pagebits';
import { Workspace, Guide } from '../../components/studio/workspace';
import { History } from '../../components/studio/history';
import { Work } from '../../components/studio/work';
import { DEFAULT_SECTION, isStudioSection, studioSectionLabel } from '../../lib/studio-nav';
import { hasPublicContent } from '../../lib/profile-content';
import { loadProjects, loadWorkspaces } from '../../lib/studio-data';
import { hasUnpublishedChanges, isEntitled } from '../../lib/studio-publish';
import { PublishPanel, Preview } from '../../components/studio/publish';
import { NoProfileNotice } from '../../components/studio/notices';
import Plan from '../../components/studio/plan';
import Visitors from '../../components/studio/visitors';
import Domain from '../../components/studio/domain';
import Settings from '../../components/studio/settings';
import { planFromQuery } from '../../lib/signup-intent';

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
  /* The plan the signup funnel asked for, or null. Held rather than read
     where it is used, because the URL it came from is erased below. */
  const [intentPlan, setIntentPlan] = useState(null);

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

  /* ── WHAT THE SIGNUP FUNNEL SENDS, AND WHY IT IS READ IN TWO PARTS ─────
     /signup?plan=yearly carries the visitor's chosen plan through email
     verification, and verify.js passes BOTH `plan` and `lang` on to the
     editor. /admin has always consumed them; the Studio consumed neither, so
     pointing the funnel here would have silently dropped a paying customer's
     plan and opened an Arabic Studio for an English customer -- the exact
     failure the comment in verify.js describes.

     LANGUAGE IS APPLIED IMMEDIATELY, because the screen that renders first for
     someone arriving from their inbox is usually the signed-out gate, and it
     has to be in their language too.

     THE PLAN IS NOT, AND THAT SEPARATION IS THE WHOLE POINT. A customer
     clicking the link in their email has NOT signed in on this device. They
     land here with no session, the gate sends them to /admin, and they come
     back. If the plan were consumed and erased on mount it would be gone
     before the gate could carry it across that bounce -- the same dropped
     plan, one step later and harder to see. So it is consumed only once there
     is a session for it to mean anything to, and until then it stays in the
     address bar where signInHref() can pick it up. */
  useEffect(() => {
    let asked = null;
    try { asked = new URLSearchParams(window.location.search).get('lang'); } catch (e) { return; }
    if (asked === 'ar' || asked === 'en') setLang(asked);
  }, [setLang]);

  /* The plan, once, and only when signed in. `spent` rather than a ref because
     it is state the render below legitimately depends on. */
  const [planSpent, setPlanSpent] = useState(false);
  useEffect(() => {
    if (phase !== 'ready' || planSpent) return;

    let search = '';
    try { search = window.location.search; } catch (e) { return; }

    /* NOT trusted as a price or an entitlement: planFromQuery checks it against
       the sellable catalogue and returns null for anything else, and
       billing-checkout prices it server-side regardless. The worst a tampered
       value can do here is preselect nothing. */
    const requested = planFromQuery(search);
    let params = null;
    try { params = new URLSearchParams(search); } catch (e) { return; }

    setPlanSpent(true);
    if (!requested) return;
    setIntentPlan(requested);

    /* An explicit ?s= is the customer's own navigation and outranks the
       funnel's intent. Without one, a plan means "they came here to pay". */
    const explicit = isStudioSection(params.get('s') || '');
    if (!explicit) setSection('plan');

    /* Spent, so it leaves the address bar -- a reload must not re-apply an
       intent already acted on, which is what /admin does with the same
       parameter. The section replaces it rather than simply vanishing, because
       in this Studio the section IS the URL: dropping both would make a reload
       silently reopen Home. replaceState, not push, so Back leaves the Studio
       rather than returning to a spent link. */
    try {
      const url = new URL(window.location.href);
      /* The query is REBUILT rather than having the spent keys removed from it.
         Removing them reads better but spells `.delete(`, and the read-only
         guard in tests/studio-shell.test.mjs matches that substring to keep a
         Supabase write out of this file. The guard is blunt on purpose and is
         not worth loosening for a phrasing -- and stating the whole query is
         the more honest description anyway: after the funnel's intent is spent,
         a Studio URL carries its section and nothing else. */
      const keep = new URLSearchParams();
      const sec = explicit ? params.get('s') : 'plan';
      if (sec) keep.set('s', sec);
      url.search = keep.toString();
      window.history.replaceState({}, '', url.toString());
    } catch (e) { /* a browser without URL(): the intent is still applied */ }
  }, [phase, planSpent]);

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
    window.location.replace('/signin');
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
        {/* The getting-started guide, ported from /admin. It lives on Home
            because that is the screen a client lands on, and a checklist you
            have to go looking for is a checklist nobody finishes. */}
        {section === 'home' && profile && (
          <Guide
            ar={ar}
            doneMap={{
              publish: Boolean(profile?.name?.ar || profile?.name?.en),
              picture: Boolean(profile?.profile_image),
              links: Array.isArray(profile?.links) ? profile.links.length > 0
                : Object.keys(profile?.links || {}).length > 0,
              work: projects.length > 0,
              bio: Boolean(profile?.bio?.ar || profile?.bio?.en),
            }}
            onNavigate={goSection}
          />
        )}
        {section === 'profile' && (
          <>
            <Profile ar={ar} uiLang={lang} tenant={tenant} profile={profile} onSaved={onProfile}
                     canEdit={canEdit} />
            {/* The quick facts live under Profile because that is where a
                client looks for "the strip at the top of my page". They were
                editable only in /admin until now, which is one of the nine
                columns keeping the legacy editor alive. */}
            <Facts ar={ar} tenant={tenant} profile={profile} onSaved={onProfile} canEdit={canEdit} />
          </>
        )}
        {section === 'work' && (
          <Work ar={ar} uiLang={lang} tenant={tenant} profile={profile}
                projects={projects} onProjects={onProjectsChanged} canEdit={canEdit} />
        )}
        {section === 'appearance' && (
          <>
            <Appearance ar={ar} tenant={tenant} profile={profile} onSaved={onProfile}
                        canEdit={canEdit} />
            {/* What is ON the page, as opposed to what colour it is. Ported
                from /admin, where these five columns lived alone. */}
            <PageParts ar={ar} uiLang={lang} tenant={tenant} profile={profile}
                       onSaved={onProfile} canEdit={canEdit} />
          </>
        )}
        {section === 'links' && (
          <Links ar={ar} tenant={tenant} profile={profile} onSaved={onProfile}
                 canEdit={canEdit} />
        )}
        {section === 'plan' && (
          <Plan ar={ar} tenant={tenant} entitled={entitled} initialPlan={intentPlan} />
        )}
        {/* `plan` has left this list: it is a real screen now, and the funnel
            points at it. The other three still honestly say "not yet". */}
        {section === 'visitors' && (
          <Visitors ar={ar} tenant={tenant} published={snapshot.published} />
        )}
        {section === 'domain' && (
          <Domain ar={ar} tenant={tenant} entitled={entitled} />
        )}
        {section === 'settings' && (
          <>
            <Settings ar={ar} email={session?.user?.email || ''} />
            {/* How the page looks somewhere ELSE -- a browser tab, a search
                result, a pasted link. A different question from what is on it. */}
            <SiteIdentity ar={ar} uiLang={lang} tenant={tenant} profile={profile}
                          onSaved={onProfile} canEdit={canEdit} />
            <Workspace ar={ar} tenant={tenant} canEdit={canEdit}
                       onRenamed={(n) => setTenant((prev) => (prev ? { ...prev, name: n } : prev))} />
            {/* Section AB captures a version on every publish; this is where a
                client reads them and puts one back. */}
            <History ar={ar} tenant={tenant} canEdit={canEdit}
                     onRestored={() => { setSnapshot({ published: true }); setChanges(false); }} />
          </>
        )}
      </StudioShell>
    </>
  );
}

/* Every non-ready state in one place, so none of them can be the blank screen
   the old editor showed while a session was restoring. */
function Gate({ phase, ar, error, onRetry }) {
  /* THE SIGN-IN LINK HAS TO CARRY WHERE THEY WERE GOING.
     It used to be the constant '/admin?next=/studio', which is correct for
     someone who simply typed the URL and wrong for everyone arriving from the
     signup funnel: their link is /studio?plan=yearly, they have no session on
     this device, and a constant `next` drops the plan at the bounce and returns
     them to a Studio that never heard of it. The same is true of any deep link
     -- ?s=work sent an unauthenticated customer back to Home.

     COMPUTED IN AN EFFECT, NOT DURING RENDER. This page is statically
     optimised, so a render that reads window.location produces different markup
     on the server and the client and React hydration mismatches on the href.
     Starting from the constant and correcting after mount keeps the first paint
     identical -- and keeps the literal in this file, which is what
     tests/studio-shell.test.mjs pins.

     nextAfterSignIn() in /admin honours only a same-origin absolute path, so
     this cannot be turned into an open redirect by a crafted link. */
  const [signInHref, setSignInHref] = useState('/admin?next=/studio');
  useEffect(() => {
    try {
      const here = window.location.pathname + window.location.search;
      const q = new URLSearchParams();
      q.set('next', here.startsWith('/studio') ? here : '/studio');
      /* THE LOGIN SCREEN NEEDS THE LANGUAGE TOO, and it is not in `next`.
         /admin reads its own ?lang= (langFromUrl) and otherwise falls back to
         what this browser remembers -- which is nothing, for someone opening
         the link on a phone they have never signed in on. Without this an
         English customer read an English gate, pressed Sign in, and got an
         Arabic login form, then an English Studio again. */
      q.set('lang', ar ? 'ar' : 'en');
      setSignInHref(`/admin?${q.toString()}`);
    } catch (e) { /* keep the constant */ }
  }, [ar]);

  const body = {
    loading: { title: ar ? 'جارٍ الفتح…' : 'Opening…', text: '' },
    signedout: {
      title: ar ? 'تسجيل الدخول للمتابعة' : 'Sign in to continue',
      text: ar
        ? 'الاستوديو خاص بحسابك، والعودة إلى هنا تلقائية بعد تسجيل الدخول.'
        : 'The Studio is tied to your account. Sign in and we will bring you straight back.',
      action: { href: signInHref, label: ar ? 'تسجيل الدخول' : 'Sign in' },
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
        .gate { min-height: 100vh; min-height: 100dvh; display: grid; place-items: center;
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
/* NotYet stood here. It rendered "this section is being built" for domain,
   visitors, plan and settings and sent the customer to /admin. All four are
   real screens now, so the component had no caller left -- and a placeholder
   with no caller is worse than none: the next person to add a section finds a
   ready-made way to ship a signpost instead of a screen. */


