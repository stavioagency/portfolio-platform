import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import { getTranslator } from '../lib/translations';
import { pick } from '../lib/i18n';
import { resolveTenant } from '../lib/tenant';
import { privacyContent, termsContent } from '../lib/legal-content';
import { BRAND_ICONS, normalizeIcon } from '../lib/brand-icons';

const BANNER_BGS = {
  purple: 'linear-gradient(135deg, #7a72d6, #9FA7FF)',
  blue:   'linear-gradient(135deg, #3b82f6, #06b6d4)',
  sunset: 'linear-gradient(135deg, #ec4899, #f97316)',
  forest: 'linear-gradient(135deg, #10b981, #3b82f6)',
  dark:   'linear-gradient(135deg, #1f2937, #374151)',
};

function readLang() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lang');
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

const FONT_STACKS = {
  manrope:  "'Manrope', 'IBM Plex Sans Arabic', system-ui, sans-serif",
  cairo:    "'Cairo', 'Manrope', system-ui, sans-serif",
  reemkufi: "'Reem Kufi', 'Cairo', serif",
  plexar:   "'IBM Plex Sans Arabic', 'Manrope', sans-serif",
};
const RADIUS_VALUES  = { soft: 12, sharp: 4, pill: 24 };

export default function Home({ slug = null } = {}) {
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lang, setLang] = useState('ar');
  const [bannerIdx, setBannerIdx] = useState(0);
  const [bannerPaused, setBannerPaused] = useState(false);
  const [loadedBanners, setLoadedBanners] = useState(() => new Set([0, 1])); // only active+next load initially
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // 'privacy' | 'terms' | null
  const [aboutOpen, setAboutOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pageUrl, setPageUrl] = useState('');
  // Resolved tenant id for analytics stamping. Null in singleton/default fallback
  // (kept null so inserts behave exactly as before). Set once loadData resolves.
  const [tenantId, setTenantId] = useState(null);
  const pageViewLogged = useRef(false);

  const t = getTranslator(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Canonical / og:url — resolved client-side from the current location
  useEffect(() => {
    if (typeof window !== 'undefined') setPageUrl(window.location.origin + window.location.pathname);
  }, []);

  useEffect(() => {
    loadData();
    // detect admin (we hide setup hints from non-admin visitors)
    supabase.auth.getSession().then(({ data }) => setIsAdmin(!!data.session));
  }, []);

  async function loadData() {
    try {
      // Resolve the active tenant. Until the tenants/tenant_domains tables exist,
      // this fails-safe to the singleton default, so the queries below behave
      // exactly as they do today. (No slug/host routing is wired yet — Batch 4/5.)
      const tenant = await resolveTenant({
        supabase,
        host: typeof window !== 'undefined' ? window.location.hostname : '',
        slug,
      });
      const tenantMode = tenant.mode === 'tenant' && !!tenant.id;
      // Stamp analytics with this tenant when resolved; null keeps singleton behavior.
      setTenantId(tenantMode ? tenant.id : null);

      // A slug route asked for a specific tenant that doesn't exist -> 404.
      // (Don't fall back to the singleton for an explicit slug.) `/` has no slug,
      // so it stays on the singleton path below.
      if (slug && !tenantMode) { setNotFound(true); return; }

      // --- Profile ---
      let profileData;
      if (tenantMode) {
        // Future tenant path: one profile per tenant (needs the migration applied).
        const { data } = await supabase.from('profile').select('*').eq('tenant_id', tenant.id).maybeSingle();
        profileData = data;
      } else {
        // Current singleton behavior — unchanged.
        const { data } = await supabase.from('profile').select('*').eq('id', 1).single();
        profileData = data;
      }

      // --- Projects ---
      let projectsQuery = supabase.from('projects').select('*');
      if (tenantMode) projectsQuery = projectsQuery.eq('tenant_id', tenant.id); // future: scope to tenant
      const { data: projectsData } = await projectsQuery.order('display_order', { ascending: true });

      // NOTE (mt): analytics inserts stamp `tenant_id` from the resolved tenant
      // (see the page_view effect and logEvent). In singleton/default fallback
      // tenantId stays null, so inserts behave exactly as before.

      if (profileData) {
        setProfile(profileData);
        const stored = readLang();
        setLang(stored || profileData.default_lang || 'ar');
      }
      if (projectsData) setProjects(projectsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Apply lang to <html> and persist
  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem('lang', lang);
  }, [lang, dir]);

  // Apply customizable appearance tokens
  useEffect(() => {
    if (!profile?.appearance) return;
    const a = profile.appearance;
    const root = document.documentElement;
    if (a.accent_color) root.style.setProperty('--accent', a.accent_color);
    if (a.bg_color) root.style.setProperty('--bg-primary', a.bg_color);
    if (a.tokens) {
      const tk = a.tokens;
      if (tk.bg)         root.style.setProperty('--bg-primary', tk.bg);
      if (tk.surface)    root.style.setProperty('--bg-secondary', tk.surface);
      if (tk.accent)     root.style.setProperty('--accent', tk.accent);
      if (tk.text)       root.style.setProperty('--text-primary', tk.text);
      if (tk.text_muted) root.style.setProperty('--text-tertiary', tk.text_muted);
      if (tk.border)     root.style.setProperty('--border', tk.border);
    }
    if (a.font_body && FONT_STACKS[a.font_body]) {
      root.style.setProperty('--font-body', FONT_STACKS[a.font_body]);
      root.style.setProperty('--font-sans', FONT_STACKS[a.font_body]);
    }
    if (a.radius  && RADIUS_VALUES[a.radius])   root.style.setProperty('--card-radius', `${RADIUS_VALUES[a.radius]}px`);
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
    pageViewLogged.current = true;
    const row = {
      event_type: 'page_view',
      path: window.location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent.slice(0, 200),
      visitor_id: getVisitorId(),
    };
    if (tenantId) row.tenant_id = tenantId; // singleton fallback: tenantId null -> omitted
    supabase.from('analytics_events').insert(row).then(() => {}).catch(() => {});
  }, [loading, tenantId]);

  // Auto-advance banner every 5s — paused on hover/focus and when reduced-motion is requested
  useEffect(() => {
    const count = profile?.banners?.length || 0;
    if (count < 2 || bannerPaused) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => setBannerIdx(i => (i + 1) % count), 5000);
    return () => clearInterval(id);
  }, [profile?.banners?.length, bannerPaused]);

  // Preload only the active + next banner image (avoids eager-loading all banners at once)
  useEffect(() => {
    const count = profile?.banners?.length || 0;
    if (!count) return;
    setLoadedBanners(prev => {
      const n = new Set(prev);
      n.add(bannerIdx);
      n.add((bannerIdx + 1) % count);
      return n;
    });
  }, [bannerIdx, profile?.banners?.length]);

  if (loading) {
    return (
      <div className="loader-wrap">
        <div className="loader-spinner" />
        <style jsx>{`
          .loader-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-primary); }
          .loader-spinner { width: 32px; height: 32px; border: 2.5px solid rgba(255,255,255,0.1); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
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

  if (!profile) {
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
  const banners = (profile.banners || []).filter(b => {
    if (b.type === 'image') return !!b.image_url;
    return pick(b.text, 'en') || pick(b.text, 'ar');
  });
  const stats = (profile.stats || []).filter(s => pick(s.value, lang) || pick(s.value, 'en') || pick(s.label, lang) || pick(s.label, 'en'));
  const ctas = (profile.cta_buttons || []).filter(b => {
    const hasLabel = pick(b.label, lang) || pick(b.label, 'en') || pick(b.label, 'ar');
    if (!hasLabel) return false;
    return b.action === 'open_projects' || b.href;
  });
  const allLinks = profile.custom_links || [];
  const customFields = profile.custom_fields || [];
  const sections = profile.sections || {};
  const ticker = profile.top_ticker || {};
  const tickerText = pick(ticker.text, lang) || pick(ticker.text, 'en') || pick(ticker.text, 'ar');
  const showTicker = !!ticker.enabled && !!tickerText;

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
    if (tenantId) row.tenant_id = tenantId; // singleton fallback: tenantId null -> omitted
    supabase.from('analytics_events').insert(row).then(() => {}).catch(() => {});
  }
  function onCtaClick(btn) {
    logEvent({ event_type: 'link_click', link_key: btn.icon || 'cta' });
    if (btn.action === 'open_projects') { setProjectsOpen(true); return; }
    if (btn.href) window.open(btn.href, '_blank', 'noopener,noreferrer');
  }
  function onSocialClick(iconKey) {
    logEvent({ event_type: 'link_click', link_key: iconKey });
  }
  function onProjectOpen(projectId) {
    logEvent({ event_type: 'project_view', project_id: projectId });
  }

  // CTAs to render — append auto "open_projects" button if user has projects but no such CTA
  const hasOpenProjectsCta = ctas.some(b => b.action === 'open_projects');
  const showProjects = (sections.projects !== false) && projects.length > 0;
  const finalCtas = (showProjects && !hasOpenProjectsCta)
    ? [...ctas, { id: '__auto_projects', icon: null, label: { en: t('open_portfolio'), ar: t('open_portfolio') }, action: 'open_projects', href: '' }]
    : ctas;

  const cardIsEmpty = banners.length === 0 && stats.length === 0 && finalCtas.length === 0 && !showAbout;

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

      <main className={`page ${showTicker ? 'has-ticker' : ''}`} dir={dir}>
        {/* TOP TICKER — scrolls right-to-left, full-width strip above the card */}
        {showTicker && (
          <div
            className={`ticker speed-${ticker.speed || 'medium'}`}
            style={{ background: ticker.bg_color || '#9FA7FF', color: ticker.text_color || '#0a0a0c' }}
          >
            <div className="ticker-track">
              {/* Repeated copies so the strip fills wide screens seamlessly */}
              {Array.from({ length: 24 }).map((_, i) => (
                <span className="ticker-text" key={i} aria-hidden={i > 0}>{tickerText}</span>
              ))}
            </div>
          </div>
        )}

        <div className="card">

          {/* TOP BAR — lang switcher + socials (brand logo moved to name-block) */}
          <div className="top-bar">
            {langSwitcherOn ? (
              <button className="lang-pill" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
              </button>
            ) : (
              <span />
            )}

            <div className="socials">
              {socialIcons.map((l, i) => {
                const iconKey = normalizeIcon(l.icon);
                const ic = BRAND_ICONS[iconKey];
                if (!ic) return null;
                const href = iconKey === 'whatsapp' && /^[+\d\s]+$/.test(l.href)
                  ? `https://wa.me/${l.href.replace(/[^\d]/g, '')}`
                  : l.href;
                const isMail = iconKey === 'email' && l.href.includes('@');
                return (
                  <a key={i} href={isMail ? `mailto:${l.href}` : href} target="_blank" rel="noopener noreferrer" className="social-icon" aria-label={pick(l.label, lang)} onClick={() => onSocialClick(iconKey)}>
                    <svg viewBox="0 0 24 24"><path d={ic.path} /></svg>
                  </a>
                );
              })}
            </div>
          </div>

          {/* NAME BLOCK — brand logo now sits next to the name (side-by-side header pair) */}
          <div className="name-block">
            <div className="brand-logo">
              {avatarSrc
                ? <img src={avatarSrc} alt={name} />
                : <span>{initial}</span>}
            </div>
            <div className="name-text">
              <h1>{name}</h1>
              {tagline && <p>{tagline}</p>}
              {showAbout && (
                <button className="about-toggle" onClick={() => setAboutOpen(o => !o)}>
                  <span>{aboutOpen ? '↑' : '↓'}</span>
                  {aboutOpen ? t('about_hide') : t('about_show')}
                </button>
              )}
            </div>
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

          {/* BANNER SLIDER (3:2 aspect, more dominant) */}
          {banners.length > 0 && (
            <div className="banner-frame"
              onMouseEnter={() => setBannerPaused(true)}
              onMouseLeave={() => setBannerPaused(false)}
              onFocusCapture={() => setBannerPaused(true)}
              onBlurCapture={() => setBannerPaused(false)}>
              {banners.map((b, i) => (
                <div key={b.id || i}
                  className={`banner ${i === bannerIdx ? 'active' : ''}`}
                  style={b.type === 'image'
                    ? { backgroundImage: loadedBanners.has(i) ? `url(${b.image_url})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: BANNER_BGS[b.bg || 'purple'] }}>
                  {b.type === 'text' && (
                    <div className="banner-content">
                      <div className="banner-text">{pick(b.text, lang) || pick(b.text, 'en')}</div>
                      {(pick(b.subtitle, lang) || pick(b.subtitle, 'en')) && (
                        <div className="banner-sub">{pick(b.subtitle, lang) || pick(b.subtitle, 'en')}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {banners.length > 1 && (
                <div className="banner-dots">
                  {banners.map((_, i) => (
                    <button key={i} className={i === bannerIdx ? 'on' : ''} onClick={() => setBannerIdx(i)} aria-label={`Banner ${i + 1}`} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STATS */}
          {stats.length > 0 && (
            <div className="stats" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
              {stats.map((s, i) => (
                <div key={s.id || i} className="stat">
                  <div className="stat-value">{pick(s.value, lang) || pick(s.value, 'en')}</div>
                  <div className="stat-label">{pick(s.label, lang) || pick(s.label, 'en')}</div>
                </div>
              ))}
            </div>
          )}

          {/* CTA BUTTONS — first is PRIMARY (accent border + tint), rest are ghost */}
          {finalCtas.length > 0 && (
            <div className="ctas">
              {finalCtas.map((b, i) => {
                const iconKey = normalizeIcon(b.icon);
                const ic = iconKey && BRAND_ICONS[iconKey];
                const label = pick(b.label, lang) || pick(b.label, 'en');
                const isPrimary = i === 0;
                return (
                  <button key={b.id || i} className={`cta ${isPrimary ? 'primary' : ''}`} onClick={() => onCtaClick(b)}>
                    {ic && (
                      <span className="cta-icon">
                        <svg viewBox="0 0 24 24"><path d={ic.path} /></svg>
                      </span>
                    )}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty-state nudge — ADMIN ONLY (visitors see nothing extra) */}
          {cardIsEmpty && isAdmin && (
            <div className="setup-hint">
              <p>{t('card_empty_hint_a')} <a href="/admin">/admin → {t('nav_card')}</a> {t('card_empty_hint_b')}</p>
            </div>
          )}
        </div>

        {/* FOOTER — custom user line + legal links */}
        <footer className="footer" style={{ color: footerColor }}>
          <span>{customFooterText || `© ${name} ${new Date().getFullYear()}`}</span>
          <div className="footer-credit">
            <button type="button" className="footer-legal-link" onClick={() => setLegalModal('privacy')}>{lang === 'ar' ? 'الخصوصية' : 'Privacy'}</button>
            <span className="footer-sep" aria-hidden="true">·</span>
            <button type="button" className="footer-legal-link" onClick={() => setLegalModal('terms')}>{lang === 'ar' ? 'الشروط' : 'Terms'}</button>
          </div>
        </footer>

        {/* PROJECTS MODAL */}
        {projectsOpen && (
          <ProjectsModal
            projects={projects}
            t={t}
            lang={lang}
            onClose={() => setProjectsOpen(false)}
            onOpenProject={onProjectOpen}
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
        .page {
          min-height: 100vh;
          background:
            radial-gradient(ellipse 900px 600px at 50% 0%, rgba(159,167,255,0.18), transparent 60%),
            radial-gradient(ellipse 600px 400px at 50% 100%, rgba(159,167,255,0.08), transparent 60%),
            var(--bg-primary);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 80px 20px 40px; /* card sits lower from the top */
        }
        .page.has-ticker { padding-top: 100px; /* extra room when ticker strip is visible */ }

        /* TOP TICKER — scrolls right-to-left always (regardless of page dir) */
        .ticker {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 36px;
          overflow: hidden;
          display: flex;
          align-items: center;
          direction: ltr;
          z-index: 50;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 2px 12px rgba(0,0,0,0.2);
        }
        .ticker-track {
          display: flex;
          width: max-content;
          flex-shrink: 0;
          gap: 60px;
          padding-inline-start: 60px;
          white-space: nowrap;
          animation: tickerScroll linear infinite;
          direction: ltr; /* force LTR so the marquee scrolls predictably */
        }
        .ticker.speed-slow .ticker-track   { animation-duration: 60s; }
        .ticker.speed-medium .ticker-track { animation-duration: 35s; }
        .ticker.speed-fast .ticker-track   { animation-duration: 20s; }
        .ticker:hover .ticker-track { animation-play-state: paused; }
        .ticker-text { display: inline-block; flex-shrink: 0; }
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track { animation: none; transform: none; padding-inline-start: 20px; }
        }
        .card {
          width: 100%;
          max-width: 440px;
          background: linear-gradient(180deg, rgba(30,30,42,0.7), rgba(20,20,28,0.5));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--card-radius, 24px);
          padding: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 8px; }

        /* Lang pill (replaces share button) */
        .lang-pill {
          padding: 7px 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
          color: rgba(255,255,255,0.85);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.04em;
          font-family: inherit;
          transition: var(--transition);
        }
        .lang-pill:hover { background: rgba(255,255,255,0.1); color: #fff; }

        .socials { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
        .social-icon {
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.7);
          transition: var(--transition);
        }
        .social-icon:hover { color: #fff; transform: translateY(-1px); }
        .social-icon svg { width: 15px; height: 15px; fill: currentColor; }

        /* BIGGER brand logo (56px) with accent glow */
        .brand-logo {
          width: 56px; height: 56px;
          border-radius: 50%;
          border: 1.5px solid rgba(159,167,255,0.55);
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 700;
          color: rgba(255,255,255,0.95);
          overflow: hidden;
          flex-shrink: 0;
        }
        .brand-logo img { width: 100%; height: 100%; object-fit: contain; }

        .name-block {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
          padding: 0 6px;
        }
        .name-text {
          flex: 1;
          min-width: 0;
          text-align: start; /* text hugs the avatar — start = right in RTL, left in LTR */
        }
        .name-block h1 {
          font-family: 'Cairo', 'Manrope', sans-serif;
          font-size: 26px; font-weight: 700;
          color: #fff;
          letter-spacing: -0.01em;
          margin-bottom: 4px;
        }
        :global(html[dir="rtl"]) .name-block h1 { letter-spacing: normal; }
        .name-block p { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
        .about-toggle {
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

        .about-section { margin-bottom: 14px; animation: aboutIn 0.25s ease; }
        @keyframes aboutIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

        .bio-block { padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 10px; }
        .bio-block p { font-size: 13px; line-height: 1.6; color: rgba(255,255,255,0.75); text-align: start; }
        .cf-grid { display: flex; flex-direction: column; gap: 1px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; }
        .cf-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; background: rgba(20,20,28,0.6); font-size: 12px; }
        .cf-label { color: rgba(255,255,255,0.5); }
        .cf-value { color: rgba(255,255,255,0.92); font-weight: 500; text-align: end; }

        /* Banner 3:2 (was 16:9) — bigger / more dominant */
        .banner-frame {
          position: relative;
          width: 100%;
          aspect-ratio: 3 / 2;
          border-radius: 18px;
          overflow: hidden;
          margin-bottom: 18px;
          background: rgba(0,0,0,0.2);
        }
        .banner {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .banner.active { opacity: 1; }
        .banner-content { text-align: center; padding: 28px; }
        .banner-text {
          font-family: 'Reem Kufi', 'Cairo', 'Manrope', sans-serif;
          font-size: 36px; font-weight: 700; color: #fff; margin-bottom: 10px;
          line-height: 1.15;
        }
        .banner-sub { font-size: 14px; color: rgba(255,255,255,0.9); line-height: 1.5; }
        .banner-dots { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 5px; }
        .banner-dots button {
          width: 6px; height: 3px; background: rgba(255,255,255,0.4);
          border: none; border-radius: 2px; padding: 0; cursor: pointer;
          transition: var(--transition);
        }
        .banner-dots button.on { width: 20px; background: #fff; }

        .stats {
          display: grid; gap: 1px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .stat {
          padding: 14px 8px;
          text-align: center;
          background: rgba(20,20,28,0.6);
        }
        .stat-value { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 2px; }
        .stat-label { font-size: 11px; color: rgba(255,255,255,0.5); }

        .ctas { display: flex; flex-direction: column; gap: 8px; }
        .cta {
          width: 100%;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          padding: 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--card-radius, 14px);
          color: #fff;
          font-family: inherit;
          font-size: 14px; font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
        }
        .cta:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.14);
          transform: translateY(-1px);
        }
        .cta:active { transform: translateY(0); }

        /* PRIMARY CTA — accent border, subtle accent tint, soft accent shadow */
        .cta.primary {
          background: linear-gradient(180deg, rgba(159,167,255,0.18), rgba(159,167,255,0.08));
          border: 1px solid rgba(159,167,255,0.35);
          box-shadow: 0 4px 14px rgba(159,167,255,0.15), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .cta.primary:hover {
          background: linear-gradient(180deg, rgba(159,167,255,0.25), rgba(159,167,255,0.12));
          border-color: rgba(159,167,255,0.5);
          box-shadow: 0 6px 18px rgba(159,167,255,0.22), inset 0 1px 0 rgba(255,255,255,0.1);
        }

        .cta-icon {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 7px;
          color: rgba(255,255,255,0.9);
        }
        .cta-icon svg { width: 14px; height: 14px; fill: currentColor; }

        .setup-hint {
          padding: 20px;
          text-align: center;
          color: rgba(255,255,255,0.5);
          font-size: 12px;
          background: rgba(159,167,255,0.06);
          border: 1px dashed rgba(159,167,255,0.2);
          border-radius: 12px;
          margin-top: 12px;
        }
        .setup-hint a { color: var(--accent); text-decoration: underline; }

        .footer {
          margin-top: 32px;
          text-align: center;
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          display: flex; flex-direction: column; gap: 6px;
        }
        .footer-credit a { color: rgba(255,255,255,0.55); }
        .footer-credit a:hover { color: #fff; }
        .footer-credit { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .footer-legal-link { color: rgba(255,255,255,0.55); font: inherit; background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; }
        .footer-legal-link:hover { color: #fff; }
        .footer-sep { color: rgba(255,255,255,0.35); user-select: none; }

        /* Mobile spacing tightens */
        @media (max-width: 480px) {
          .page { padding: 24px 12px; }
          .card { padding: 16px; border-radius: var(--card-radius, 20px); }
          .name-block h1 { font-size: 22px; }
          .banner-text { font-size: 28px; }
        }
      `}</style>
    </>
  );
}

function ProjectsModal({ projects, t, lang, onClose, onOpenProject }) {
  // Lightbox holds the active project's whole image set + its details, so we can
  // navigate the slideshow and show project info without the old dropdown.
  const [lightbox, setLightbox] = useState(null); // { images, index, title, desc, meta, url } | null
  const [imgLoaded, setImgLoaded] = useState(false); // stage image load state (spinner + fade-in)
  const touchStartX = useRef(null);
  const stepLightbox = useCallback((delta) => {
    setLightbox(lb => (lb ? { ...lb, index: (lb.index + delta + lb.images.length) % lb.images.length } : lb));
  }, []);
  function onLbTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onLbTouchEnd(e) {
    if (touchStartX.current == null || !lightbox || lightbox.images.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) stepLightbox(dx < 0 ? 1 : -1); // swipe left -> next, right -> prev
    touchStartX.current = null;
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else onClose();
        return;
      }
      // Arrow nav only inside the lightbox and only when there's more than one image.
      // Physical mapping (Left = previous, Right = next) matches the button positions
      // in both LTR and RTL, so it stays predictable.
      if (!lightbox || lightbox.images.length < 2) return;
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden'; // scroll-lock the page behind the modal
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, lightbox, stepLightbox]);

  // Whenever the visible slide changes: show the spinner again for the new image,
  // and warm the browser cache for the immediate next/previous images so stepping
  // feels instant — without eagerly fetching the entire set.
  useEffect(() => {
    if (!lightbox) return;
    setImgLoaded(false);
    if (lightbox.images.length < 2) return;
    const { images, index } = lightbox;
    [(index + 1) % images.length, (index - 1 + images.length) % images.length]
      .forEach(i => { const im = new Image(); im.src = images[i]; });
  }, [lightbox]);

  // Clicking a project opens its slideshow directly (no dropdown step). Prefer the
  // gallery images[]; fall back to the single cover_image; if it has neither but has
  // an external link, just open that. Logs project_view exactly like before.
  function openProject(p, title, desc) {
    onOpenProject?.(p.id);
    const images = (p.images && p.images.length) ? p.images
      : (p.cover_image ? [p.cover_image] : []);
    if (!images.length) {
      // No images to show — if there's an external link, honor it; otherwise no-op.
      if (p.external_url) window.open(p.external_url, '_blank', 'noopener,noreferrer');
      return;
    }
    const meta = [p.client, p.year, p.role].filter(Boolean).join('  ·  ');
    setLightbox({ images, index: 0, title, desc: desc || '', meta, url: p.external_url || null });
  }

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
                    <button type="button" className="pcard-trigger" onClick={() => openProject(p, title, desc)} aria-label={title}>
                      {p.cover_image && (
                        <div className="pcard-cover">
                          <img src={p.cover_image} alt={title} loading="lazy" />
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
      {lightbox && (
        <div
          className="lightbox"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClick={() => setLightbox(null)}
        >
          <button
            className="lb-close"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            aria-label={t('close')}
          >×</button>

          <div
            className="lb-stage"
            onTouchStart={onLbTouchStart}
            onTouchEnd={onLbTouchEnd}
          >
            {lightbox.images.length > 1 && (
              <>
                <button
                  className="lb-nav lb-prev"
                  onClick={(e) => { e.stopPropagation(); stepLightbox(-1); }}
                  aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
                >‹</button>
                <button
                  className="lb-nav lb-next"
                  onClick={(e) => { e.stopPropagation(); stepLightbox(1); }}
                  aria-label={lang === 'ar' ? 'التالي' : 'Next'}
                >›</button>
              </>
            )}
            {!imgLoaded && <div className="lb-spinner" aria-hidden="true" />}
            <img
              key={lightbox.index}
              className={imgLoaded ? 'loaded' : ''}
              src={lightbox.images[lightbox.index]}
              alt={lightbox.title || ''}
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {(lightbox.title || lightbox.desc || lightbox.meta || lightbox.url || lightbox.images.length > 1) && (
            <div className="lb-info" onClick={(e) => e.stopPropagation()}>
              <div className="lb-info-top">
                <div className="lb-info-heading">
                  {lightbox.title && <h3 className="lb-title">{lightbox.title}</h3>}
                  {lightbox.meta && <span className="lb-meta">{lightbox.meta}</span>}
                </div>
                {lightbox.images.length > 1 && (
                  <span className="lb-count" dir="ltr">{lightbox.index + 1} / {lightbox.images.length}</span>
                )}
              </div>
              {lightbox.desc && <p className="lb-desc">{lightbox.desc}</p>}
              {lightbox.url && (
                <div className="lb-actions">
                  <a
                    className="lb-link"
                    href={lightbox.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >{t('view_project')} ↗</a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <style jsx>{`
        .modal-bg {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          z-index: 100;
          display: flex; align-items: flex-start; justify-content: center;
          padding: 40px 20px;
          overflow-y: auto;
          animation: fadeIn 0.2s ease;
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
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
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
        .lightbox {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(8,10,14,0.88);
          -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 14px;
          padding: max(20px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom));
          cursor: zoom-out; overscroll-behavior: contain; animation: fadeIn 0.2s ease;
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
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
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
          animation: fadeIn 0.2s ease;
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
          gap: 12px; padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .legal-modal-top h2 { font-size: 18px; font-weight: 700; color: var(--text-primary); }
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
        .legal-modal-body { padding: 24px; overflow-y: auto; }
        .lm-updated { font-size: 12px; color: var(--text-muted); margin-bottom: 18px; }
        .lm-intro { font-size: 14px; line-height: 1.7; color: var(--text-secondary); margin-bottom: 26px; }
        .legal-modal-body section { margin-bottom: 20px; }
        .legal-modal-body h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
        .legal-modal-body section p { font-size: 14px; line-height: 1.7; color: var(--text-secondary); }
        .lm-note { margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); font-style: italic; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @media (max-width: 480px) {
          .legal-modal-top { padding: 16px 18px; }
          .legal-modal-body { padding: 18px; }
        }
      `}</style>
    </div>
  );
}
