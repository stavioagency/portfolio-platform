import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import { getTranslator } from '../lib/translations';
import { pick } from '../lib/i18n';
import { fetchPublicPortfolio } from '../lib/tenant';
import { privacyContent, termsContent } from '../lib/legal-content';
import { BRAND_ICONS, normalizeIcon, brandColor } from '../lib/brand-icons';
import { safeUrl } from '../lib/safe-url';
import { hasPublicContent } from '../lib/profile-content';
import BrandGlyph from '../components/ui/BrandGlyph';
import { isOpen } from '../lib/working-hours';

function readLang() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lang');
}

// The admin's live preview loads this page in an iframe on the SAME ORIGIN, so it
// shares one localStorage with the dashboard. Anything this page persists is
// therefore written on the admin's behalf, whether or not the admin wanted it.
function isPreviewContext() {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('preview') === '1') return true;
    return window.self !== window.top;
  } catch (_) {
    return true; // cross-origin frame check threw — treat as embedded and persist nothing
  }
}

function getVisitorId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem('visitor_id');
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('visitor_id', id);
  }
  return id;
}

// The portfolio is set in Tajawal, which is the original's font and the only
// one this page uses. It was four client-selectable stacks and a three-value
// radius scale; both were presentation controls and both are gone -- see the
// appearance effect below for why. The stack keeps Arabic and Latin fallbacks
// so the page is legible in the moment before the webfont lands.
const PF_FONT = "'Tajawal', 'IBM Plex Sans Arabic', system-ui, sans-serif";

export default function Home({ slug = null } = {}) {
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Distinct from notFound: the lookup itself failed. A paying client must not
  // be told their site does not exist because of a transient error.
  const [loadFailed, setLoadFailed] = useState(false);
  const [lang, setLang] = useState('ar');
  // Captured on the FIRST RENDER, before the persist effect below can run. That
  // effect used to fire on mount with the default 'ar' and overwrite the stored
  // preference — so by the time loadData read it, the visitor's real choice was
  // already gone, and the admin (same origin, via the preview iframe) was reset to
  // Arabic on its next load. Read once, up front, and nothing can clobber it.
  const storedLangRef = useRef(readLang());
  const [workIdx, setWorkIdx] = useState(0);
  const [loadedSlides, setLoadedSlides] = useState(() => new Set([0, 1])); // only active+next load initially
  const [projectsOpen, setProjectsOpen] = useState(false);
  // The piece a visitor is currently looking at, already resolved to what the
  // Lightbox needs. Owned HERE rather than inside the projects modal, because
  // the card opens a piece directly now — the modal is no longer the only way
  // in, and two owners of one lightbox is two lightboxes.
  const [openPiece, setOpenPiece] = useState(null);
  const [legalModal, setLegalModal] = useState(null); // 'privacy' | 'terms' | null
  const [aboutOpen, setAboutOpen] = useState(false);
  const [pageUrl, setPageUrl] = useState('');
  // Resolved tenant id for analytics stamping. Always set once the page renders —
  // an unresolved tenant 404s before this is ever used.
  const [tenantId, setTenantId] = useState(null);
  const pageViewLogged = useRef(false);

  const t = getTranslator(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Canonical / og:url — resolved client-side from the current location
  useEffect(() => {
    if (typeof window !== 'undefined') setPageUrl(window.location.origin + window.location.pathname);
  }, []);

  useEffect(() => { loadData(); }, []);

  // True only when the admin's preview pane asked for it.
  const isPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('preview') === '1';

  // Reads the DRAFT rows for a slug, but only for someone allowed to see them.
  // RLS does the deciding: the "Tenant admins read profile/projects" policies
  // added in section-q return nothing to anyone else, so this cannot leak.
  async function loadDraftForPreview(slugName) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data: t } = await supabase
        .from('tenants').select('id').eq('slug', String(slugName || '').toLowerCase()).maybeSingle();
      if (!t) return null;
      const [{ data: prof }, { data: projs }] = await Promise.all([
        supabase.from('profile').select('*').eq('tenant_id', t.id).maybeSingle(),
        supabase.from('projects').select('*').eq('tenant_id', t.id).order('display_order', { ascending: true }),
      ]);
      if (!prof) return null;
      return { tenant_id: t.id, profile: prof, projects: projs || [] };
    } catch (e) {
      return null;
    }
  }

  async function loadData() {
    try {
      // PREVIEW MODE. The admin's preview pane loads this page with ?preview=1.
      // It must show the DRAFT -- what the client is editing right now -- not the
      // published snapshot, or "preview" would just be a second window onto the
      // live site and there would be no way to see a change before publishing it.
      //
      // This is not a hole: it reads profile/projects directly, which since
      // section-q requires an authenticated session that is a tenant admin. An
      // anonymous visitor adding ?preview=1 gets nothing back and falls through
      // to the published path below.
      if (isPreview) {
        const draft = await loadDraftForPreview(slug);
        if (draft) {
          setTenantId(draft.tenant_id);
          // In preview the expiry has to be checked here: this path reads the
          // draft row directly and never goes through the function.
          setProfile(draft.profile);
          setLang(storedLangRef.current || draft.profile?.default_lang || 'ar');
          setProjects(draft.projects);
          return;
        }
        // Not signed in, or not this client's admin: fall through and show the
        // published site rather than an error. A preview of someone else's
        // portfolio is simply the public one.
      }

      // ONE read, server-gated. get_public_portfolio() resolves the tenant,
      // checks status and entitlement inside Postgres, and returns only the
      // PUBLISHED snapshot. The draft tables are no longer readable by anon,
      // so this is the whole public data path now (section-q).
      const { ok, portfolio } = await fetchPublicPortfolio({
        supabase,
        host: typeof window !== 'undefined' ? window.location.hostname : '',
        slug,
      });

      // The lookup failed rather than resolving to nothing. Say so instead of
      // rendering a 404 over a working, paid-for site.
      if (!ok) { setLoadFailed(true); return; }

      // Resolved to nothing: unknown slug/host, disabled workspace, lapsed
      // subscription, or never published. All 404 alike, deliberately — telling
      // them apart would leak which slugs exist.
      if (!portfolio) { setNotFound(true); return; }

      setTenantId(portfolio.tenant_id || null);
      // The snapshot carries the same field names the tables did, so everything
      // downstream of here is unchanged.
      const profileData = portfolio.profile || null;
      const projectsData = Array.isArray(portfolio.projects) ? portfolio.projects : [];

      if (profileData) {
        setProfile(profileData);
        setLang(storedLangRef.current || profileData.default_lang || 'ar');
      }
      setProjects(projectsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Apply lang to <html>, and persist only when it is genuinely this visitor's choice.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    // Do NOT persist while still loading: at that point `lang` is only the 'ar'
    // placeholder, and writing it destroys the stored preference we are about to
    // apply. And never persist from the admin's preview iframe — it shares this
    // origin, so it would be silently rewriting the dashboard's own language.
    if (loading || isPreviewContext()) return;
    localStorage.setItem('lang', lang);
  }, [lang, dir, loading]);

  // Apply customizable appearance tokens
  useEffect(() => {
    if (!profile?.appearance) return;
    const a = profile.appearance;
    const root = document.documentElement;
    // ONLY THE ACCENT. The page background, the surfaces, the text ramp, the
    // border colour, the font stack and the corner radius used to be client
    // settings too, and together they are what produced the page this redesign
    // replaces: f9designer's own site rendered lilac from edge to edge because
    // tokens.bg had been set to the accent colour, and nothing stopped it.
    //
    // design.md draws the line: "The client controls content and emphasis.
    // Designakum controls structure and presentation." A background colour is
    // presentation. So is a radius, and so is a font. The frame is ours; the
    // work in it is theirs.
    //
    // NOTHING IS DELETED. Every one of those values is still in the database,
    // untouched. The admin is being rebuilt one control at a time, and only the
    // ones this design turned out to need come back.
    const accent = a.tokens?.accent || a.accent_color;
    if (accent) root.style.setProperty('--accent', accent);
  }, [profile]);

  // Apply custom favicon (uploaded via the admin) to the browser tab
  useEffect(() => {
    if (!profile?.favicon_url) return;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = profile.favicon_url;
  }, [profile]);

  // Log page_view once per mount. Deferred until loadData has resolved (loading
  // flips false) so the resolved tenantId is available to stamp; the ref guard
  // keeps it to a single insert.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loading || pageViewLogged.current) return;
    // The admin's live-preview iframe loads this page with ?preview=1. Skip
    // analytics for it so an owner's editing session never inflates the
    // tenant's own page_view count. This suppresses a side-effect only; the
    // page renders identically. (Also guards any nested-iframe embedding.)
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1' || window.self !== window.top) return;
    pageViewLogged.current = true;
    const row = {
      event_type: 'page_view',
      path: window.location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent.slice(0, 200),
      visitor_id: getVisitorId(),
    };
    if (tenantId) row.tenant_id = tenantId; // always set here; guard kept for safety
    supabase.from('analytics_events').insert(row).then(() => {}).catch(() => {});
  }, [loading, tenantId]);

  // THERE IS NO AUTO-ADVANCE, and its removal is deliberate rather than an
  // oversight in the port. A carousel that steps itself every five seconds is
  // motion on a timer, forever, on every visit — it communicates none of the
  // four things motion may communicate (design.md §5) and it takes the choice
  // of which piece leads away from the client, who ordered them. The visitor
  // moves it, or it does not move.

  // Preload only the active + next slide (avoids fetching the whole set at once)
  useEffect(() => {
    const count = projects.length;
    if (!count) return;
    setLoadedSlides(prev => {
      const n = new Set(prev);
      n.add(workIdx);
      n.add((workIdx + 1) % count);
      return n;
    });
  }, [workIdx, projects.length]);

  // A centred spinner on an empty page tells a visitor nothing except that
  // something is missing. This is the same card, at the same width, in the same
  // place, with its real blocks blanked — so the page never jumps when the data
  // lands, and the shape of what is coming is legible immediately.
  if (loading) {
    return (
      <div className="skel-page" dir={dir}>
        {/* role="status" already implies aria-live="polite" */}
        <div className="skel-card" role="status" aria-busy="true">
          <span className="sr-only">{t('loading')}</span>
          {/* Holds the top bar's height without inventing a social-icon count —
              that row is variable-length, so any fixed number of dots would be
              wrong for most tenants. */}
          <div className="skel-top">
            <span className="sk sk-avatar" />
            <span className="sk sk-pill" />
          </div>
          <div className="skel-name-text">
            <span className="sk sk-line lg" />
            <span className="sk sk-line sm" />
          </div>
          <span className="sk sk-work" />
          <div className="skel-ctas">
            <span className="sk sk-cta" />
          </div>
        </div>
        <style jsx>{`
          /* Geometry, gradient and font are copied from .page / .card below.
             The two must stay identical or the swap from skeleton to content
             becomes a visible jump -- which is the whole reason the skeleton is
             a card rather than a spinner. */
          .skel-page {
            min-height: 100vh;
            font-family: ${PF_FONT};
            background: linear-gradient(#050507 0%, #0a0a14 55%, #6a70ab 100%) fixed;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 50px 20px 40px;
          }
          .skel-card {
            width: 100%;
            max-width: 330px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 35px;
            padding: 25px;
          }
          .sr-only {
            position: absolute; width: 1px; height: 1px;
            padding: 0; margin: -1px; overflow: hidden;
            clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
          }
          .sk {
            display: block;
            background: rgba(255,255,255,0.07);
            background-image: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%);
            background-size: 220% 100%;
            animation: skelSweep 1.4s ease-in-out infinite;
            border-radius: 8px;
          }
          :global(html[dir='rtl']) .sk { animation-direction: reverse; }
          @keyframes skelSweep {
            0%   { background-position: 120% 0; }
            100% { background-position: -120% 0; }
          }
          /* 30px keeps the row at the real top bar's height (the social icons
             are 30px, taller than the 28px pill). */
          /* 55px is the mark's height, which is what sets the real top row. */
          .skel-top { display: flex; align-items: center; justify-content: space-between; min-height: 55px; }
          .sk-pill { width: 32px; height: 32px; border-radius: 10px; }
          .sk-avatar { width: 55px; height: 55px; border-radius: 50%; flex-shrink: 0; }
          /* flex-start on the CROSS axis follows the writing direction: the
             right edge in Arabic, the left in English. That is the reading
             edge, and it is where the real name block sits (text-align: start). */
          .skel-name-text { margin-top: 15px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
          .sk-line.lg { height: 19px; width: 45%; }
          .sk-line.sm { height: 12px; width: 60%; }
          /* 20px matches --pf-stack on the real card — the skeleton and the
             content it becomes must agree, or the swap is a visible jump. */
          .sk-work { width: 100%; height: 170px; border-radius: 20px; margin-top: 20px; }
          .skel-ctas { margin-top: 20px; }
          .sk-cta { width: 100%; height: 52px; border-radius: 18px; }
        `}</style>
      </div>
    );
  }

  // The lookup failed rather than resolving to nothing. A 404 here would tell a
  // paying client their site does not exist because a request blipped, so this
  // says what is actually true and offers a retry.
  if (loadFailed) {
    return (
      <div dir={dir} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
        <p style={{ fontSize: 15, maxWidth: 420, lineHeight: 1.7, marginBottom: 16 }}>
          {lang === 'ar' ? 'تعذّر تحميل الموقع الآن. قد يكون الاتصال بطيئًا.' : 'This site could not be loaded right now. The connection may be slow.'}
        </p>
        <button
          type="button"
          onClick={() => { setLoadFailed(false); setLoading(true); loadData(); }}
          style={{ padding: '10px 18px', minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
        >
          {lang === 'ar' ? 'إعادة المحاولة' : 'Try again'}
        </button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div dir={dir} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
        <h1 style={{ fontSize: 40, marginBottom: 8, fontWeight: 700 }}>404</h1>
        <p style={{ fontSize: 14, maxWidth: 400, lineHeight: 1.6 }}>{t('portfolio_not_found')}</p>
      </div>
    );
  }

  // A profile ROW existing is not the same as a profile having CONTENT. A freshly
  // created workspace has a row with nothing in it, which used to fall through to the
  // card below and render as a nameless "?" avatar with a bare copyright line. Treat
  // "row exists but is empty" exactly like "no row": show the setup screen.
  if (!profile || !hasPublicContent(profile, projects.length)) {
    return (
      <div dir={dir} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12, fontWeight: 600 }}>{t('setup_needed_title')}</h1>
        <p style={{ fontSize: 14, maxWidth: 400, lineHeight: 1.6 }}>
          {t('setup_needed_body')} <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }} dir="ltr">/admin</code> {t('setup_needed_admin')}
        </p>
      </div>
    );
  }

  const name = pick(profile.name, lang);
  const tagline = pick(profile.tagline, lang);
  const bio = pick(profile.bio, lang);
  // THE WORK. What used to be a separate "banners" array — promotional images
  // sitting above the portfolio, which a visitor read as the client's work when
  // it was not — is now the client's actual pieces. One image list, and it is
  // the one that was always the point.
  //
  // A piece needs something to show: its cover, or the first image of its set.
  // One with neither cannot lead the card and is left to the lightbox.
  //
  // NO sections.projects CHECK. The visibility toggles are being retired — a
  // section appears when it has content and does not when it has none — and
  // that toggle in particular was doing real damage: it was set to false on the
  // two workspaces that actually have pieces, which is most of why the page
  // reads as a link card rather than a portfolio.
  const pieces = projects
    .map(p => ({
      raw: p,
      cover: p.cover_image || (Array.isArray(p.images) ? p.images[0] : null) || null,
      title: pick(p.title, lang) || pick(p.title, 'en') || '',
    }))
    .filter(p => !!p.cover);
  // THE STRIP — three defined facts, not three free-text boxes.
  //
  // It was an array of {value, label} pairs the client typed by hand, and what
  // they typed says why this changed: all three clients who filled it in used
  // slot 2 for "am I available", by hand, with no way for it to ever expire.
  // Roza's said "no" and would have said "no" forever.
  //
  // Each slot now has ONE meaning and its own control, and the labels are gone
  // entirely — the icon says what the number is.
  const rating = (() => {
    const n = Number(profile.rating);
    return Number.isFinite(n) && n > 0 && n <= 5 ? n : null;
  })();
  const clientCount = (() => {
    const n = Number(profile.client_count);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  })();
  // Hours that exist and are switched on. Whether they are open RIGHT NOW is a
  // separate question, asked at render time so the answer can never be stale.
  const hasHours = !!(profile.hours && profile.hours.enabled !== false
    && Array.isArray(profile.hours.days) && profile.hours.days.length > 0);
  const openNow = hasHours && isOpen(profile.hours);
  const showStrip = rating !== null || clientCount !== null || hasHours;
  const ctas = (profile.cta_buttons || []).filter(b => {
    const hasLabel = pick(b.label, lang) || pick(b.label, 'en') || pick(b.label, 'ar');
    if (!hasLabel) return false;
    return b.action === 'open_projects' || b.href;
  });
  const allLinks = profile.custom_links || [];
  const customFields = profile.custom_fields || [];
  const sections = profile.sections || {};
  // THE TICKER IS GONE. A marquee across the top of the page, scrolling
  // forever: it moves continuously, it communicates none of the four things
  // motion may communicate (design.md §5), it cannot be read at a glance, and
  // it was the loudest element on a page whose product sells calm. It also sat
  // above the work, which nothing but identity and quiet chrome may do.
  //
  // It is switched ON for two live workspaces, so this removes something a
  // visitor sees today. That is the intent, not an accident of the port.
  // profile.top_ticker is left in the database untouched.

  const footer = profile.footer || {};
  const customFooterText = pick(footer.text, lang) || pick(footer.text, 'en') || pick(footer.text, 'ar');
  const footerColor = footer.color || 'rgba(255,255,255,0.3)';
  const showBio = sections.bio !== false && bio;
  const showCustomFields = sections.custom_fields !== false && customFields.length > 0;
  const showAbout = showBio || showCustomFields;
  const showLinks = sections.links !== false; // honor toggle
  const langSwitcherOn = sections.lang_switcher !== false;
  const avatarSrc = profile.brand_logo || profile.profile_image || null;
  // SEO overrides (admin → Profile → SEO), falling back to auto-derived values
  const seo = profile.seo || {};
  const seoTitle = pick(seo.title, lang) || `${name}${tagline ? ` | ${tagline}` : ''}`;
  const seoDesc = pick(seo.description, lang) || bio || tagline;
  const shareImage = seo.og_image || avatarSrc;

  // Top social icons (first 3 with icon + href), only if section enabled
  const socialIcons = showLinks
    ? allLinks.filter(l => l.icon && l.href)
    : [];

  const initial = (name || '?').trim()[0] || '?';

  function logEvent(payload) {
    if (typeof window === 'undefined') return;
    const row = { visitor_id: getVisitorId(), ...payload };
    if (tenantId) row.tenant_id = tenantId; // always set here; guard kept for safety
    supabase.from('analytics_events').insert(row).then(() => {}).catch(() => {});
  }
  function onCtaClick(btn) {
    logEvent({ event_type: 'link_click', link_key: btn.icon || 'cta' });
    if (btn.action === 'open_projects') { setProjectsOpen(true); return; }
    const dest = safeUrl(btn.href);
    if (dest) window.open(dest, '_blank', 'noopener,noreferrer');
  }
  function onSocialClick(iconKey) {
    logEvent({ event_type: 'link_click', link_key: iconKey });
  }
  // Resolve a project ROW into the flat shape the Lightbox renders, and show it.
  // Prefers the gallery images[]; falls back to the single cover_image; a piece
  // with neither but with an external link just opens the link, which is what
  // the projects grid did before the lightbox was extracted.
  function showPiece(p, title, desc) {
    logEvent({ event_type: 'project_view', project_id: p.id });
    const images = (p.images && p.images.length) ? p.images
      : (p.cover_image ? [p.cover_image] : []);
    if (!images.length) {
      const dest = safeUrl(p.external_url);
      if (dest) window.open(dest, '_blank', 'noopener,noreferrer');
      return;
    }
    setOpenPiece({
      images,
      title: title || pick(p.title, lang) || pick(p.title, 'en') || '',
      desc: desc || pick(p.description, lang) || pick(p.description, 'en') || '',
      meta: [p.client, p.year, p.role].filter(Boolean).join('  ·  '),
      url: p.external_url || null,
    });
  }

  // THE NEXT STEP — and there is exactly one of it.
  //
  // This was a stack of up to six buttons, the first filled in the tenant's
  // accent and the rest ghosts. A page with five equal asks has none, and the
  // "first one is the important one" rule was a layout decision the client was
  // being charged for without being told. Contact now lives in the icon row at
  // the top of the card, which is where the original put it and the reason the
  // bottom of the card can end on a single thing to press.
  //
  // The auto-appended "open my portfolio" button is gone with it: the work is
  // ON the card now, so a button whose job was to go and find it has nothing
  // left to do.
  //
  // The other buttons are still in the database and still in the editor. What
  // happens to them is an admin question, and the admin is being rebuilt one
  // control at a time.
  const action = ctas[0] || null;

  return (
    <>
      <Head>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        {pageUrl && <link rel="canonical" href={pageUrl} />}
        {/* Open Graph (link previews on iMessage / WhatsApp / Slack / Discord) */}
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:type" content="profile" />
        {pageUrl && <meta property="og:url" content={pageUrl} />}
        {shareImage && <meta property="og:image" content={shareImage} />}
        {/* Twitter / X */}
        <meta name="twitter:card" content={shareImage ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDesc} />
        {shareImage && <meta name="twitter:image" content={shareImage} />}
      </Head>

      <main className="page" dir={dir}>
        <div className="card">

          {/* TOP ROW — the mark, the contact glyphs, and the language switch.
              The mark and the glyphs sit together at the inline END (the right,
              in Arabic); the language switch sits alone at the inline START.
              That is the original's composition, and it mirrors correctly: the
              identity leads in both directions.

              CONTACT LIVES HERE, as icons, and this is the whole reason the
              card can end with a single button. The original put contact at the
              top precisely so the bottom of the card had one thing to press. */}
          <div className="top-bar">
            <div className="identity-marks">
              <div className="brand-logo">
                {avatarSrc
                  ? <img
                      src={avatarSrc}
                      alt={name}
                      width="55"
                      height="55"
                      decoding="async"
                      /* above the fold and an LCP candidate — never lazy */
                      fetchPriority="high"
                    />
                  : <span>{initial}</span>}
              </div>

              <div className="socials">
              {socialIcons.map((l, i) => {
                const iconKey = normalizeIcon(l.icon);
                const ic = BRAND_ICONS[iconKey];
                if (!ic) return null;
                const rawHref = iconKey === 'whatsapp' && /^[+\d\s]+$/.test(l.href)
                  ? `https://wa.me/${l.href.replace(/[^\d]/g, '')}`
                  : l.href;
                const isMail = iconKey === 'email' && (l.href || '').includes('@');
                const href = safeUrl(isMail ? `mailto:${l.href}` : rawHref);
                if (!href) return null; // drop links with an unsafe/empty scheme
                // NOT brand-coloured, and that reversed an earlier decision.
                // Four platform colours in a 96px row is four things asking to
                // be looked at, in the one place the design has reserved for
                // the mark and the name -- design.md §4, "only one element may
                // be loud at a time, and it is never chrome". The original
                // sets them all in white on identical chips, so the row reads
                // as one control rather than a strip of stickers, and the
                // shapes still say which platform is which.
                return (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-icon"
                    /* The client's own label if they wrote one, and the
                       platform's name if they did not. It usually is not
                       written: four of roza's links and all of f9designer's
                       reached the page as links with NO accessible name at all
                       — a screen reader announced four consecutive "link"s and
                       nothing else. An icon-only control must carry its name in
                       the markup, and BRAND_ICONS already knows every one. */
                    aria-label={pick(l.label, lang) || ic.label}
                    onClick={() => onSocialClick(iconKey)}
                  >
                    <BrandGlyph icon={iconKey} size={15} />
                  </a>
                );
              })}
              </div>
            </div>

            {langSwitcherOn ? (
              <button className="lang-pill" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
              </button>
            ) : (
              <span />
            )}
          </div>

          {/* NAME — under the marks, aligned to the reading edge, and SMALL.
              19px is not an oversight: on a page whose largest element is the
              client's work, a name set as a headline competes with it, and a
              name set as a label does not (hierarchy §4). It is still the
              heaviest text on the card. */}
          <div className="name-block">
            <h1>{name}</h1>
            {tagline && <p>{tagline}</p>}
            {showAbout && (
              <button className="about-toggle" onClick={() => setAboutOpen(o => !o)}>
                <span>{aboutOpen ? '↑' : '↓'}</span>
                {aboutOpen ? t('about_hide') : t('about_show')}
              </button>
            )}
          </div>

          {/* ABOUT (collapsible: bio + custom fields) */}
          {aboutOpen && (
            <div className="about-section">
              {showBio && (
                <div className="bio-block">
                  <p>{bio}</p>
                </div>
              )}
              {showCustomFields && (
                <div className="cf-grid">
                  {customFields.map(f => {
                    const fl = pick(f.label, lang) || pick(f.label, 'en');
                    const fv = pick(f.value, lang) || pick(f.value, 'en');
                    if (!fl && !fv) return null;
                    return (
                      <div key={f.id} className="cf-row">
                        {fl && <span className="cf-label">{fl}</span>}
                        {fv && <span className="cf-value">{fv}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* THE WORK — the client's pieces, in the order they chose.
              This is the single biggest element on the card, and it is the one
              thing a visitor is here to judge. Tapping it opens the piece. */}
          {pieces.length > 0 && (
            <div className="work-frame">
              {pieces.map((pc, i) => (
                <div
                  key={pc.raw.id}
                  className={`work-slide ${i === workIdx ? 'active' : ''}`}
                  aria-hidden={i !== workIdx}
                >
                  {/* A real <img> rather than a CSS background-image. This is
                      the biggest thing on the card and usually the LCP element,
                      and a background-image cannot carry a priority hint, cannot
                      be decoded off the main thread, and is invisible to the
                      preload scanner. Slides beyond the active+next pair
                      render no <img> at all. */}
                  {loadedSlides.has(i) && (
                    <img
                      className="work-img"
                      src={pc.cover}
                      alt={pc.title}
                      decoding="async"
                      loading={i === 0 ? 'eager' : 'lazy'}
                      fetchPriority={i === 0 ? 'high' : 'low'}
                    />
                  )}
                </div>
              ))}

              {/* One control over the whole frame, so the target is the image
                  itself rather than a caption or a corner. */}
              <button
                type="button"
                className="work-open"
                onClick={() => showPiece(pieces[workIdx].raw)}
                aria-label={pieces[workIdx].title || t('open_portfolio')}
              />

              {pieces.length > 1 && (
                <>
                  {/* Physical mapping: left is previous, right is next, in both
                      directions. The arrows sit where they are pointed. */}
                  <button
                    type="button"
                    className="work-nav prev"
                    onClick={() => setWorkIdx(i => (i - 1 + pieces.length) % pieces.length)}
                    aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
                  >‹</button>
                  <button
                    type="button"
                    className="work-nav next"
                    onClick={() => setWorkIdx(i => (i + 1) % pieces.length)}
                    aria-label={lang === 'ar' ? 'التالي' : 'Next'}
                  >›</button>
                  <div className="work-dots">
                    {pieces.map((pc, i) => (
                      <button
                        key={pc.raw.id}
                        type="button"
                        className={i === workIdx ? 'on' : ''}
                        onClick={() => setWorkIdx(i)}
                        aria-label={pc.title || `${i + 1}`}
                        aria-current={i === workIdx}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* THE STRIP — a rating, a client count, and whether they are
              working right now. No labels: the icon carries the meaning, which
              is what the client asked for and what stops the strip growing
              three lines tall the moment somebody writes a sentence. */}
          {showStrip && (
            <div className="stats">
              {rating !== null && (
                <div className="stat">
                  <span className="stat-icon star" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                      <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                    </svg>
                  </span>
                  {/* toFixed(1) so 5 reads as "5.0" beside a neighbour's "4.9"
                      — a bare 5 next to 4.9 looks like a different kind of
                      number. Latin digits in both languages, per design.md. */}
                  <span className="stat-value">{rating.toFixed(1)}</span>
                  <span className="sr-only">{lang === 'ar' ? 'التقييم' : 'Rating'}</span>
                </div>
              )}

              {clientCount !== null && (
                <div className="stat">
                  <span className="stat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
                    </svg>
                  </span>
                  <span className="stat-value">{clientCount.toLocaleString('en-US')}</span>
                  <span className="sr-only">{lang === 'ar' ? 'عميل' : 'clients'}</span>
                </div>
              )}

              {hasHours && (
                <div className="stat">
                  <span className={`avail-dot ${openNow ? 'on' : ''}`} aria-hidden="true" />
                  <span className="stat-value">{openNow ? t('avail_open') : t('avail_closed')}</span>
                </div>
              )}
            </div>
          )}

          {/* THE ONE ACTION */}
          {action && (() => {
            const iconKey = normalizeIcon(action.icon);
            const ic = iconKey && BRAND_ICONS[iconKey];
            const label = pick(action.label, lang) || pick(action.label, 'en');
            // The platform's own colour, same as the icon row above it. On the
            // dark ghost button a brand green or blue reads as itself, which is
            // the whole point of showing a glyph at all.
            const tint = ic ? brandColor(iconKey, 'dark') : null;
            return (
              <button
                className={`cta ${ic ? '' : 'no-icon'}`}
                style={tint ? { '--brand': tint } : undefined}
                onClick={() => onCtaClick(action)}
                title={label}
              >
                {ic && (
                  <span className={`cta-icon ${tint ? 'tinted' : ''}`}>
                    <BrandGlyph icon={iconKey} size={22} />
                  </span>
                )}
                <span className="cta-label">{label}</span>
              </button>
            );
          })()}

          {/* THE SETUP NUDGE IS GONE. It rendered a dashed box pointing at
              /admin into the customer's own published site — the product
              talking to itself on somebody's portfolio. It was gated on the
              viewer being signed in, which made it invisible to visitors and
              therefore easy to keep, but a page that is finished work on
              display has no business carrying a note to its author. The editor
              is where a client is told their card is empty. */}
        </div>

        {/* FOOTER — custom user line + legal links */}
        <footer className="footer" style={{ color: footerColor }}>
          <span>{customFooterText || `© ${name} ${new Date().getFullYear()}`}</span>
          <div className="footer-credit">
            <button type="button" className="footer-legal-link" onClick={() => setLegalModal('privacy')}>{t('legal_privacy')}</button>
            <span className="footer-sep" aria-hidden="true">·</span>
            <button type="button" className="footer-legal-link" onClick={() => setLegalModal('terms')}>{t('legal_terms')}</button>
          </div>
        </footer>

        {/* PROJECTS MODAL */}
        {projectsOpen && (
          <ProjectsModal
            projects={projects}
            t={t}
            lang={lang}
            onClose={() => setProjectsOpen(false)}
            onOpenPiece={showPiece}
          />
        )}

        {/* A PIECE, FULL SIZE. Rendered from here so it can be opened either by
            the work slider on the card or from the projects modal. */}
        {openPiece && (
          <Lightbox
            piece={openPiece}
            t={t}
            lang={lang}
            onClose={() => setOpenPiece(null)}
          />
        )}

        {/* LEGAL MODAL (footer Privacy / Terms) */}
        {legalModal && (
          <LegalModal
            content={legalModal === 'privacy' ? privacyContent : termsContent}
            lang={lang}
            onClose={() => setLegalModal(null)}
          />
        )}
      </main>

      <style jsx>{`
        /* ---- THE PORTFOLIO'S OWN TOKENS -------------------------------------
           The public portfolio is not the admin, and it does not inherit the
           admin's visual language. It is dark-only, Arabic-first, and every
           value below was measured out of the running original at
           docs/design/original-portfolio-reference.md rather than chosen here.

           They live as tokens for one reason: the card used to be about forty
           separate rgba() literals, each one picked to look like its neighbour,
           and that is exactly how a surface drifts. There is now one place to
           change what "the card" or "the gap" means.

           --pf-accent is the ONLY value a tenant supplies. */
        .page {
          --pf-page-top:  #050507;
          --pf-page-mid:  #0a0a14;
          --pf-page-foot: #6a70ab;

          --pf-card-w:   330px;
          --pf-card-r:   35px;
          --pf-card-pad: 25px;
          /* ONE vertical gap for the whole card. The original separates every
             block by exactly 20px with no exceptions, and that single number is
             most of why it reads as composed. */
          --pf-stack:    20px;
          /* The one measured exception. The name sits 15px under the header row
             rather than 20 because the avatar's circle carries its own optical
             space above the text -- a full gap there reads as a hole. */
          --pf-stack-tight: 15px;

          --pf-surface:      rgba(255,255,255,0.05);
          --pf-raised:       rgba(255,255,255,0.08);
          --pf-raised-lit:   rgba(255,255,255,0.10);
          --pf-well:         rgba(0,0,0,0.20);
          --pf-hairline:     rgba(255,255,255,0.08);
          --pf-hairline-lit: rgba(255,255,255,0.10);

          --pf-ink:       #ffffff;
          --pf-ink-dim:   rgba(255,255,255,0.60);
          --pf-ink-faint: rgba(255,255,255,0.50);

          --pf-accent: var(--accent, #9FA7FF);

          min-height: 100vh;
          font-family: ${PF_FONT};
          /* FIXED, deliberately. The violet then rises from the bottom of the
             VIEWPORT rather than the bottom of the document, so it stays where
             it was composed to be however tall the page grows. The original
             does the same. */
          background: linear-gradient(
            var(--pf-page-top)  0%,
            var(--pf-page-mid)  55%,
            var(--pf-page-foot) 100%
          ) fixed;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 50px 20px 40px;
        }
        .card {
          --card-stack: var(--pf-stack);
          --card-stack-sm: 12px;
          width: 100%;
          max-width: var(--pf-card-w);
          /* A FLAT translucent surface, not a gradient. The card is 5% white
             over the page's own violet, which is what lets the gradient show
             THROUGH it -- the reason the original's card looks like glass on a
             lit page rather than a dark rectangle sitting on one. The 180deg
             gradient it used to carry made it opaque and killed that entirely. */
          background: var(--pf-surface);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--pf-hairline);
          border-radius: var(--pf-card-r);
          padding: var(--pf-card-pad);
          box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        }
        .top-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        /* The mark and the contact glyphs travel together at the inline end. */
        .identity-marks { display: flex; align-items: center; gap: 12px; min-width: 0; }

        /* The language switch. Sized and shaped like the original's share
           button, because it occupies that corner and the corner has a weight:
           chrome, quiet, out of the way (hierarchy §5). */
        .lang-pill {
          height: 32px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--pf-raised-lit);
          border-radius: 10px;
          color: var(--pf-ink);
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          flex-shrink: 0;
          transition: background-color 300ms ease;
        }
        /* Latin only — 'EN' is an abbreviation and tracks; the Arabic 'ع' must
           not (design.md §10). */
        :global(html[dir='ltr']) .lang-pill { letter-spacing: 0.04em; }
        .lang-pill:hover { background: rgba(255,255,255,0.2); }
        .lang-pill:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }

        .socials { display: flex; gap: 6px; align-items: center; }
        .social-icon {
          width: 28px; height: 28px;
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px;
          background: var(--pf-raised);
          color: var(--pf-ink);
          transition: background-color 300ms ease, transform 300ms ease;
        }
        .social-icon:hover { background: var(--pf-raised-lit); transform: translateY(-3px); }
        .social-icon:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .social-icon:hover { transform: none; } }

        /* The mark, ringed in the tenant's accent — the one place on the card
           where the accent is structural rather than incidental. */
        .brand-logo {
          width: 55px; height: 55px;
          border-radius: 50%;
          border: 2px solid var(--pf-accent);
          padding: 2px;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 700;
          color: var(--pf-ink);
          overflow: hidden;
          flex-shrink: 0;
        }
        .brand-logo img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }

        .name-block {
          margin-top: var(--pf-stack-tight);
          text-align: start; /* start = right in Arabic, left in English */
        }
        .name-block h1 {
          font-size: 19px; font-weight: 700;
          color: var(--pf-ink);
          line-height: 1.2;
        }
        /* The original letter-spaces this heading by 0.5px. It is NOT copied:
           Arabic is cursive and tracking severs the joins between letterforms
           (design.md §10). It is the one measured value from the reference that
           is deliberately not transferred. */
        .name-block p {
          font-size: 12px;
          color: var(--pf-ink-faint);
          margin-top: 4px;
        }
        .about-toggle {
          margin-top: 8px;
          padding: 4px 12px;
          font-size: 11px;
          color: rgba(255,255,255,0.6);
          background: none;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          cursor: pointer;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: var(--transition);
        }
        .about-toggle:hover { color: #fff; border-color: rgba(255,255,255,0.25); }

        .about-section { margin-top: var(--card-stack); animation: aboutIn 0.25s ease; }
        @keyframes aboutIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

        .bio-block { padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: var(--card-stack-sm); }
        .bio-block p { font-size: 13px; line-height: 1.6; color: rgba(255,255,255,0.75); text-align: start; }
        .cf-grid { display: flex; flex-direction: column; gap: 1px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; }
        .cf-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; background: rgba(20,20,28,0.6); font-size: 12px; }
        .cf-label { color: rgba(255,255,255,0.5); }
        .cf-value { color: rgba(255,255,255,0.92); font-weight: 500; text-align: end; }

        /* ---- THE WORK ------------------------------------------------------
           A FIXED HEIGHT BAND, not an aspect ratio. Every piece is drawn into
           the same 170px strip at object-fit: cover, so the card's proportions
           are the card's and do not change with whatever the client uploaded.
           It is a crop, and that is the honest trade: this is a 330px card, and
           a card whose height moves with each slide is not a card. The full,
           uncropped piece is one tap away in the lightbox. */
        .work-frame {
          position: relative;
          width: 100%;
          height: 170px;
          border: 1px solid var(--pf-hairline-lit);
          border-radius: 20px;
          overflow: hidden;
          margin-top: var(--card-stack);
          background: var(--pf-well);
        }
        .work-slide {
          position: absolute; inset: 0;
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .work-slide.active { opacity: 1; }
        .work-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

        /* The whole frame is the target. */
        .work-open {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          background: none; border: none; padding: 0;
          cursor: pointer;
          z-index: 1;
        }
        .work-open:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: -4px; }

        /* Hidden until the pointer is over the frame, exactly as the original
           has them. They are navigation for a visitor who is already looking;
           painted at rest they would be two more things on a card that is
           trying to have one. Keyboard focus reveals them too — a control that
           can be tabbed to but not seen is worse than no control. */
        .work-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
          background: rgba(0,0,0,0.5);
          color: var(--pf-ink);
          font-size: 18px; line-height: 1;
          border: none; cursor: pointer;
          opacity: 0;
          transition: opacity 300ms ease, background-color 300ms ease;
          z-index: 2;
        }
        .work-nav.prev { left: 10px; }
        .work-nav.next { right: 10px; }
        .work-frame:hover .work-nav,
        .work-nav:focus-visible { opacity: 1; }
        .work-nav:hover { background: rgba(0,0,0,0.7); }
        .work-nav:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }
        /* A pointer that cannot hover never reveals them, so on a phone the
           dots and the swipe of a finger across the images are the whole
           control surface — which is what the original does too. */
        @media (hover: none) { .work-nav { display: none; } }

        .work-dots {
          position: absolute;
          bottom: 12px; left: 50%;
          transform: translateX(-50%);
          display: flex; gap: 6px;
          z-index: 2;
        }
        .work-dots button {
          width: 6px; height: 6px;
          background: rgba(255,255,255,0.3);
          border: none; border-radius: 50%;
          padding: 0; cursor: pointer;
          transition: width 300ms ease, background-color 300ms ease, border-radius 300ms ease;
        }
        .work-dots button.on {
          width: 18px;
          border-radius: 10px;
          background: var(--pf-accent);
        }
        .work-dots button:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 3px; }
        @media (prefers-reduced-motion: reduce) {
          .work-slide, .work-nav, .work-dots button { transition: none; }
        }

        /* Small, quiet, and only ever present when it is true -- the whole
           point is that it removes itself. A pulsing dot was rejected: the
           brand forbids perpetual motion, and a badge that breathes at you is
           louder than the fact it carries. */
        /* ONE WELL, not three tiles.
           The stats used to be a grid of bordered cells on their own darker
           background — three boxes, each with a hairline, each reading as a
           separate claim. The original is a single recessed strip with the
           figures spaced across it, and the difference is the whole character
           of the block: a strip is one quiet fact about the client, three tiles
           are three assertions competing with the work above them. */
        .stats {
          display: flex;
          justify-content: space-between;
          align-items: stretch;
          gap: 4px;
          padding: 12px;
          background: var(--pf-well);
          border-radius: 20px;
          margin-top: var(--card-stack);
        }
        /* Each slot is icon + value on ONE line. They used to stack a value
           over a label, which is what made the strip grow when a label wrapped
           -- there is no label to wrap any more. */
        .stat {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }
        .stat-icon { display: inline-flex; flex-shrink: 0; color: var(--pf-ink); }
        /* The star is the one gold thing on the card, and it is gold for the
           obvious reason: a star that is not star-coloured reads as an
           asterisk. It does not use the tenant accent -- a rating means the
           same thing on everyone's portfolio, so it is not theirs to tint. */
        .stat-icon.star { color: #FFC93C; }
        .avail-dot {
          inline-size: 7px; block-size: 7px;
          border-radius: 50%;
          flex-shrink: 0;
          background: var(--pf-ink-faint);
        }
        .avail-dot.on { background: #34C759; }
        .sr-only {
          position: absolute; width: 1px; height: 1px;
          padding: 0; margin: -1px; overflow: hidden;
          clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        /* unicode-bidi on both: a stat is a self-contained string, and without
           it the RTL page reorders neutral characters against the author's
           intent — "2+" renders as "+2" and "connect." as ".connect". A rating
           or a count displayed backwards is a correctness bug, not a nicety. */
        /* White, with the colour carried by the icon beside it. The figures
           were in the tenant accent, which put the accent in three places on a
           card that only needs it in one -- and it made a rating look like a
           link. unicode-bidi keeps "4.9" from being reordered on the RTL page. */
        .stat-value {
          font-size: 14px; font-weight: 700; color: var(--pf-ink);
          line-height: 1.4;
          white-space: nowrap;
          unicode-bidi: plaintext;
        }

        /* ---- THE ONE ACTION -------------------------------------------------
           A GHOST BUTTON, not a filled one, and that is a reversal worth
           stating. The old primary was a solid fill of the tenant's accent with
           a contrast-checked ink on top — good engineering answering the wrong
           question. It was filled because it had to out-shout four other
           buttons. There are no other buttons now, so the only thing it has to
           be louder than is nothing, and the card's one raised surface is
           already enough to read as pressable.

           It also stops the accent from appearing three times on one card. The
           accent is the mark's ring and the stat figures; the button is white
           on white-8%, exactly as the original has it.

           NOTE: no backticks in these comments — the whole block is a template
           literal and one would end it mid-stylesheet. */
        .cta {
          width: 100%;
          height: 52px;
          margin-top: var(--card-stack);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 0 16px;
          background: var(--pf-raised);
          border: 1px solid var(--pf-hairline-lit);
          border-radius: 18px;
          color: var(--pf-ink);
          font-family: inherit;
          font-size: 14px; font-weight: 700;
          cursor: pointer;
          overflow: hidden;
          /* PAINT-ONLY STATE CHANGES. Nothing below can reflow, so the button
             is byte-identical in width at rest, on hover and on press. */
          transition:
            background-color 300ms ease,
            border-color 300ms ease;
        }

        /* THE SHINE. A 40%-wide band of white at 15% crossing the button on
           hover, over 0.8s. It is the original's one flourish and the only
           motion left on the card, and it earns its place by being feedback:
           it fires on the pointer arriving and it does not repeat, idle or
           loop. Composited transform, so it costs a paint and nothing else. */
        .cta::after {
          content: "";
          position: absolute;
          top: -50%; left: -100%;
          width: 40%; height: 200%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent);
          transform: rotate(30deg);
          transition: left 800ms ease;
          pointer-events: none;
        }
        .cta { position: relative; }

        /* Hover is gated on a real hovering pointer. Touch browsers otherwise
           latch :hover after a tap and leave the button in its hovered state
           until something else is tapped. */
        @media (hover: hover) {
          .cta:hover { background: var(--pf-raised-lit); }
          .cta:hover::after { left: 150%; }
        }
        .cta:active { background: rgba(255,255,255,0.06); }
        .cta:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 3px; }
        @media (prefers-reduced-motion: reduce) {
          .cta, .cta::after { transition: none; }
          .cta:hover::after { left: -100%; }
        }

        /* The icon and the label are centred AS A GROUP — there is no fixed
           icon gutter. A reserved column exists to align glyphs down a stack of
           buttons, and there is no stack any more; holding the column would
           strand a short label off-centre for a symmetry nobody can see. */
        .cta-icon {
          flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          color: var(--pf-accent);
        }
        .cta-icon.tinted { color: var(--brand); }
        .cta-label {
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          /* plaintext makes the label its own bidi paragraph, so an English
             label on an Arabic page keeps its trailing punctuation at the end
             instead of having it flipped to the front. */
          unicode-bidi: plaintext;
        }

        /* On the same 20px rhythm as everything inside the card — the footer is
           the last block in the stack, not a separate region needing its own
           number. The client's line is 12px at 80% (the original's), and the
           legal links below it are quieter still: they are a platform
           obligation and must be reachable, but they are not the client's
           words and should not read as loudly as the line that is. */
        .footer {
          margin-top: var(--pf-stack);
          text-align: center;
          font-size: 12px; font-weight: 500;
          opacity: 0.8;
          display: flex; flex-direction: column; gap: 8px;
        }
        .footer-credit { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 11px; }
        .footer-legal-link { color: var(--pf-ink-faint); font: inherit; background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; }
        .footer-legal-link:hover { color: var(--pf-ink); }
        .footer-legal-link:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; border-radius: 2px; }
        .footer-sep { color: var(--pf-ink-faint); user-select: none; }

        /* The card is 330px wide and does not change on a phone -- it already
           fits a 375px viewport with margin, so the old shrink-the-padding rule
           was correcting for a width this design no longer has. Only the page's
           own breathing room comes in. */
        @media (max-width: 480px) {
          .page { padding: 30px 12px 32px; }
        }
      `}</style>
    </>
  );
}

// =========================================================
// LIGHTBOX — one piece of the client's work, full size.
//
// Moved out of ProjectsModal on 2026-08-28 with its behaviour unchanged. It
// moved because the card itself now opens a piece: the work is ON the page —
// the slider is the pieces — so the route to a full-size image no longer runs
// through a grid inside a modal. Two callers, one implementation.
//
// It owns no data. `piece` is already resolved to { images, title, desc, meta,
// url } by whoever opens it, so this component never has to know what a project
// row looks like.
// =========================================================
function Lightbox({ piece, t, lang, onClose }) {
  const [index, setIndex] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false); // spinner + fade-in per slide
  const touchStartX = useRef(null);
  const images = piece.images;

  const step = useCallback((delta) => {
    setIndex(i => (i + delta + images.length) % images.length);
  }, [images.length]);

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current == null || images.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); // swipe left -> next, right -> prev
    touchStartX.current = null;
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      // Arrow nav only when there is more than one image. Physical mapping
      // (Left = previous, Right = next) matches the button positions in both
      // LTR and RTL, so it stays predictable.
      if (images.length < 2) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    }
    document.addEventListener('keydown', onKey);
    // RESTORE, do not clear. This used to set overflow back to '' on unmount,
    // which was correct only while the lightbox was the sole thing locking the
    // page. It can now open above a modal that is also locked, and clearing
    // would let the page scroll behind something still open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, step, images.length]);

  // Whenever the visible slide changes: show the spinner again for the new
  // image, and warm the browser cache for the immediate next/previous images so
  // stepping feels instant — without eagerly fetching the entire set.
  useEffect(() => {
    setImgLoaded(false);
    if (images.length < 2) return;
    [(index + 1) % images.length, (index - 1 + images.length) % images.length]
      .forEach(i => { const im = new Image(); im.src = images[i]; });
  }, [index, images]);

  return (
    <>
    <div
      className="lightbox"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onClick={() => onClose()}
    >
      <button
        className="lb-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label={t('close')}
      >×</button>

      <div
        className="lb-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {images.length > 1 && (
          <>
            <button
              className="lb-nav lb-prev"
              onClick={(e) => { e.stopPropagation(); step(-1); }}
              aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
            >‹</button>
            <button
              className="lb-nav lb-next"
              onClick={(e) => { e.stopPropagation(); step(1); }}
              aria-label={lang === 'ar' ? 'التالي' : 'Next'}
            >›</button>
          </>
        )}
        {!imgLoaded && <div className="lb-spinner" aria-hidden="true" />}
        <img
          key={index}
          className={imgLoaded ? 'loaded' : ''}
          src={images[index]}
          alt={piece.title || ''}
          decoding="async"
          /* the visitor is staring straight at it — jump the queue */
          fetchPriority="high"
          onLoad={() => setImgLoaded(true)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {(piece.title || piece.desc || piece.meta || piece.url || images.length > 1) && (
        <div className="lb-info" onClick={(e) => e.stopPropagation()}>
          <div className="lb-info-top">
            <div className="lb-info-heading">
              {piece.title && <h3 className="lb-title">{piece.title}</h3>}
              {piece.meta && <span className="lb-meta">{piece.meta}</span>}
            </div>
            {images.length > 1 && (
              <span className="lb-count" dir="ltr">{index + 1} / {images.length}</span>
            )}
          </div>
          {piece.desc && <p className="lb-desc">{piece.desc}</p>}
          {safeUrl(piece.url) && (
            <div className="lb-actions">
              <a
                className="lb-link"
                href={safeUrl(piece.url)}
                target="_blank"
                rel="noopener noreferrer"
              >{t('view_project')} ↗</a>
            </div>
          )}
        </div>
      )}
    </div>
      <style jsx>{`
        .lightbox {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(8,10,14,0.88);
          -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 14px;
          padding: max(20px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom));
          cursor: zoom-out; overscroll-behavior: contain; animation: fade 0.2s ease;
        }
        .lb-stage { position: relative; flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
        .lb-stage img {
          max-width: min(96vw, 1200px); max-height: 100%; width: auto; height: auto;
          object-fit: contain; border-radius: 10px; cursor: default;
          box-shadow: 0 20px 70px rgba(0,0,0,0.6);
          opacity: 0; transition: opacity 0.18s ease;
        }
        .lb-stage img.loaded { opacity: 1; }
        .lb-spinner {
          position: absolute; inset: 0; margin: auto; width: 34px; height: 34px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.18); border-top-color: rgba(255,255,255,0.85);
          animation: spin var(--t-spin) linear infinite;
        }
        .lb-close {
          position: fixed; top: max(14px, env(safe-area-inset-top)); right: 14px;
          width: 44px; height: 44px; border-radius: 50%;
          background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18);
          color: #fff; font-size: 24px; line-height: 1; cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center; z-index: 210;
          -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
          transition: background 0.15s ease;
        }
        .lb-close:hover { background: rgba(255,255,255,0.24); }
        .lb-nav {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 48px; height: 48px; border-radius: 50%;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18);
          color: #fff; font-size: 28px; line-height: 1; padding-bottom: 3px; cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center; z-index: 210;
          -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
          transition: background 0.15s ease;
        }
        .lb-nav:hover { background: rgba(255,255,255,0.2); }
        .lb-prev { left: 8px; }
        .lb-next { right: 8px; }
        .lb-info {
          flex: 0 0 auto; width: 100%; max-width: 720px;
          display: flex; flex-direction: column; gap: 8px;
          text-align: start; color: #fff;
        }
        .lb-info-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .lb-info-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .lb-title { color: #fff; font-size: 15px; font-weight: 700; }
        .lb-meta { color: rgba(255,255,255,0.55); font-size: 12px; }
        .lb-count { color: rgba(255,255,255,0.55); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; flex: 0 0 auto; }
        .lb-desc { color: rgba(255,255,255,0.8); font-size: 13px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .lb-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
        .lb-link {
          color: #fff; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer;
          background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22);
          padding: 6px 14px; border-radius: 999px; text-decoration: none;
          -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
          transition: background 0.15s ease;
        }
        .lb-link:hover { background: rgba(255,255,255,0.24); }
        @media (max-width: 600px) {
          .lb-nav { width: 44px; height: 44px; }
          .lb-title { font-size: 14px; }
        }
      `}</style>
    </>
  );
}


function ProjectsModal({ projects, t, lang, onClose, onOpenPiece }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // scroll-lock the page behind the modal
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <>
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="modal-head">
          <h2>{t('portfolio_title')}</h2>
          <button className="modal-close" onClick={onClose} aria-label={t('close')}>×</button>
        </div>
        <div className="modal-body">
          {projects.length === 0 ? (
            <p className="modal-empty">{t('no_projects')}</p>
          ) : (
            <div className="grid">
              {projects.map(p => {
                const title = pick(p.title, lang) || pick(p.title, 'en');
                const desc = pick(p.description, lang) || pick(p.description, 'en');
                const count = (p.images && p.images.length) || (p.cover_image ? 1 : 0);
                return (
                  <article key={p.id} className="pcard">
                    <button type="button" className="pcard-trigger" onClick={() => onOpenPiece(p, title, desc)} aria-label={title}>
                      {p.cover_image && (
                        <div className="pcard-cover">
                          <img src={p.cover_image} alt={title} loading="lazy" decoding="async" />
                          {count > 1 && <span className="pcard-badge" dir="ltr">{count}</span>}
                        </div>
                      )}
                      <div className="pcard-meta">
                        <h3>{title}</h3>
                        {desc && <p>{desc}</p>}
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
      <style jsx>{`
        .modal-bg {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          z-index: 100;
          display: flex; align-items: flex-start; justify-content: center;
          padding: 40px 20px;
          overflow-y: auto;
          animation: fade 0.2s ease;
        }
        .modal {
          width: 100%; max-width: 880px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-strong);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 30px 80px rgba(0,0,0,0.5);
          animation: slideUp 0.3s ease;
        }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
        }
        .modal-head h2 { font-size: 18px; font-weight: 700; color: #fff; }
        .modal-close {
          width: 36px; height: 36px;
          background: var(--bg-elevated); border: 1px solid var(--border);
          border-radius: 50%; font-size: 20px; color: var(--text-secondary);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          font-family: inherit;
        }
        .modal-close:hover { color: #fff; }
        .modal-body { padding: 24px; }
        .modal-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
        .grid { display: flex; flex-direction: column; gap: 12px; }
        .pcard { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; transition: var(--transition); }
        .pcard:hover { border-color: var(--border-strong); box-shadow: 0 8px 30px rgba(0,0,0,0.22); }
        .pcard-trigger:active .pcard-meta h3 { opacity: 0.8; }
        .pcard-trigger { display: block; width: 100%; padding: 0; text-align: inherit; background: none; border: none; cursor: pointer; font-family: inherit; }
        .pcard-cover { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: var(--bg-primary); }
        .pcard-badge { position: absolute; top: 8px; inset-inline-end: 8px; min-width: 22px; height: 22px; padding: 0 7px; border-radius: 11px; background: rgba(0,0,0,0.6); color: #fff; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
        .pcard-cover img { width: 100%; height: 100%; object-fit: cover; transition: var(--transition-slow); }
        .pcard:hover .pcard-cover img { transform: scale(1.02); }
        .pcard-meta { padding: 16px 20px; }
        .pcard-meta h3 { font-size: 16px; font-weight: 600; color: #fff; }
        .pcard-meta p { font-size: 13px; color: var(--text-tertiary); margin-top: 4px; }
        @media (min-width: 640px) { .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } }
      `}</style>
    </>
  );
}

// =========================================================
// Legal Modal — footer Privacy / Terms popup (content from lib/legal-content.js)
// =========================================================
function LegalModal({ content, lang, onClose }) {
  const c = content[lang] || content.en;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const closeRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus(); // move focus into the modal for keyboard users
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="legal-bg" onClick={onClose}>
      <div className="legal-modal" dir={dir} onClick={(e) => e.stopPropagation()}>
        <div className="legal-modal-top">
          <h2>{c.title}</h2>
          <button ref={closeRef} className="legal-close" onClick={onClose} aria-label={c.closeLabel} title={c.closeLabel}>×</button>
        </div>
        <div className="legal-modal-body">
          <p className="lm-updated">{c.updated}</p>
          <p className="lm-intro">{c.intro}</p>
          {c.sections.map((s, i) => (
            <section key={i}>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </section>
          ))}
          <p className="lm-note">{c.note}</p>
        </div>
      </div>
      <style jsx>{`
        .legal-bg {
          position: fixed; inset: 0; z-index: 150;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px;
          animation: fade 0.2s ease;
        }
        .legal-modal {
          width: 100%; max-width: 640px; max-height: 85vh;
          display: flex; flex-direction: column;
          background: var(--bg-secondary);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          box-shadow: 0 24px 70px rgba(0,0,0,0.5);
          animation: slideUp 0.25s ease;
          overflow: hidden;
        }
        .legal-modal-top {
          display: flex; align-items: center; justify-content: space-between;
          gap: var(--space-3); padding: var(--space-4) var(--space-5);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .legal-modal-top h2 { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
        .legal-close {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; flex-shrink: 0;
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border);
          border-radius: 50%;
          color: var(--text-secondary);
          font-size: 24px; line-height: 1;
          cursor: pointer; font-family: inherit;
          transition: var(--transition);
        }
        .legal-close:hover { background: rgba(255,255,255,0.12); color: var(--text-primary); }
        .legal-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        /* Same scale as the standalone /privacy and /terms pages, which render
           this identical copy — the two presentations of one document should
           not have two different rhythms. */
        .legal-modal-body { padding: var(--space-5); overflow-y: auto; }
        .lm-updated { font-size: var(--text-sm); color: var(--text-muted); margin-bottom: var(--space-5); }
        .lm-intro { font-size: var(--text-md); line-height: 1.7; color: var(--text-secondary); margin-bottom: var(--space-6); }
        .legal-modal-body section { margin-bottom: var(--space-5); }
        .legal-modal-body h3 { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-1); }
        .legal-modal-body section p { font-size: var(--text-md); line-height: 1.7; color: var(--text-secondary); }
        .lm-note { margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--border); font-size: var(--text-sm); color: var(--text-muted); font-style: italic; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @media (max-width: 480px) {
          .legal-modal-top { padding: var(--space-4); }
          .legal-modal-body { padding: var(--space-4); }
        }
      `}</style>
    </div>
  );
}
