import { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import { getTranslator } from '../lib/translations';
import { pick } from '../lib/i18n';
import { BRAND_ICONS } from '../lib/brand-icons';

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

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('ar');
  const [bannerIdx, setBannerIdx] = useState(0);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const t = getTranslator(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: profileData } = await supabase.from('profile').select('*').eq('id', 1).single();
      const { data: projectsData } = await supabase.from('projects').select('*').order('display_order', { ascending: true });
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
  }, [profile]);

  // Auto-advance banner every 5s
  useEffect(() => {
    const count = profile?.banners?.length || 0;
    if (count < 2) return;
    const id = setInterval(() => setBannerIdx(i => (i + 1) % count), 5000);
    return () => clearInterval(id);
  }, [profile?.banners?.length]);

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

  if (!profile) {
    return (
      <div dir={dir} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12, fontWeight: 600 }}>{t('setup_needed_title')}</h1>
        <p style={{ fontSize: 14, maxWidth: 400, lineHeight: 1.6 }}>
          {t('setup_needed_body')} <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>/admin</code> {t('setup_needed_admin')}
        </p>
      </div>
    );
  }

  const name = pick(profile.name, lang);
  const tagline = pick(profile.tagline, lang);
  const banners = profile.banners || [];
  const stats = profile.stats || [];
  const ctas = profile.cta_buttons || [];
  const links = profile.custom_links || [];
  const langSwitcherOn = profile.sections?.lang_switcher !== false; // default on

  // Top social icons (first 3 from custom_links that have an icon)
  const socialIcons = links
    .filter(l => l.icon && l.href)
    .slice(0, 3);

  const initial = (name || '?').trim()[0] || '?';

  async function handleShare() {
    if (navigator.share) {
      try { await navigator.share({ title: name, url: window.location.href }); }
      catch (e) { /* user cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(window.location.href); alert(t('link_copied')); }
      catch (e) { /* ignore */ }
    }
  }

  function onCtaClick(btn) {
    if (btn.action === 'open_projects') {
      setProjectsOpen(true);
      return;
    }
    if (btn.href) window.open(btn.href, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <Head>
        <title>{name}{tagline ? ` | ${tagline}` : ''}</title>
        <meta name="description" content={pick(profile.bio, lang) || tagline} />
      </Head>

      <main className="page" dir={dir}>
        <div className="card">
          {/* TOP BAR */}
          <div className="top-bar">
            <button className="icon-btn" onClick={handleShare} aria-label={t('share')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>

            <div className="socials">
              {socialIcons.map((l, i) => {
                const ic = BRAND_ICONS[l.icon];
                if (!ic) return null;
                const href = l.icon === 'whatsapp' && /^[+\d\s]+$/.test(l.href) ? `https://wa.me/${l.href.replace(/[^\d]/g, '')}` : l.href;
                const isMail = l.icon === 'email' && l.href.includes('@');
                return (
                  <a key={i} href={isMail ? `mailto:${l.href}` : href} target="_blank" rel="noopener noreferrer" className="social-icon" aria-label={pick(l.label, lang)}>
                    <svg viewBox="0 0 24 24"><path d={ic.path} /></svg>
                  </a>
                );
              })}
            </div>

            <div className="brand-logo">
              {profile.brand_logo
                ? <img src={profile.brand_logo} alt={name} />
                : <span>{initial}</span>}
            </div>
          </div>

          {/* NAME */}
          <div className="name-block">
            <h1>{name}</h1>
            {tagline && <p>{tagline}</p>}
          </div>

          {/* BANNER SLIDER */}
          {banners.length > 0 && (
            <div className="banner-frame">
              {banners.map((b, i) => (
                <div key={b.id || i}
                  className={`banner ${i === bannerIdx ? 'active' : ''}`}
                  style={b.type === 'image'
                    ? { backgroundImage: `url(${b.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
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

          {/* CTA BUTTONS */}
          {ctas.length > 0 && (
            <div className="ctas">
              {ctas.map((b, i) => {
                const ic = b.icon && BRAND_ICONS[b.icon];
                const label = pick(b.label, lang) || pick(b.label, 'en');
                return (
                  <button key={b.id || i} className="cta" onClick={() => onCtaClick(b)}>
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

          {/* Empty-state nudge */}
          {banners.length === 0 && stats.length === 0 && ctas.length === 0 && (
            <div className="setup-hint">
              <p>{t('card_empty_hint_a')} <a href="/admin">/admin → {t('nav_card')}</a> {t('card_empty_hint_b')}</p>
            </div>
          )}

          {/* Lang switcher (small, bottom of card) */}
          {langSwitcherOn && (
            <button className="lang-switch" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
          )}
        </div>

        {/* FOOTER */}
        <footer className="footer">
          <span>© {name} {new Date().getFullYear()}</span>
          <span className="footer-credit">
            {t('copyright_made_by')} <a href="https://designakum.com" target="_blank" rel="noopener noreferrer"><strong>designakum</strong></a>
          </span>
        </footer>

        {/* PROJECTS MODAL */}
        {projectsOpen && (
          <ProjectsModal
            projects={projects}
            t={t}
            lang={lang}
            onClose={() => setProjectsOpen(false)}
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
          padding: 40px 20px;
        }
        .card {
          width: 100%;
          max-width: 440px;
          background: linear-gradient(180deg, rgba(30,30,42,0.7), rgba(20,20,28,0.5));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
        .icon-btn {
          width: 38px; height: 38px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          color: rgba(255,255,255,0.85);
          cursor: pointer;
          transition: var(--transition);
        }
        .icon-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .socials { display: flex; gap: 4px; align-items: center; }
        .social-icon {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.7);
          transition: var(--transition);
        }
        .social-icon:hover { color: #fff; }
        .social-icon svg { width: 15px; height: 15px; fill: currentColor; }
        .brand-logo {
          width: 46px; height: 46px;
          border-radius: 50%;
          border: 1.5px solid rgba(159,167,255,0.5);
          background: rgba(159,167,255,0.08);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; font-weight: 700;
          color: rgba(255,255,255,0.9);
          overflow: hidden;
          flex-shrink: 0;
        }
        .brand-logo img { width: 100%; height: 100%; object-fit: cover; }

        .name-block { text-align: end; margin-bottom: 20px; padding: 0 6px; }
        .name-block h1 {
          font-family: 'Cairo', 'Manrope', sans-serif;
          font-size: 26px; font-weight: 700;
          color: #fff;
          letter-spacing: -0.01em;
          margin-bottom: 4px;
        }
        .name-block p { font-size: 13px; color: rgba(255,255,255,0.5); }

        .banner-frame {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 16px;
          background: rgba(0,0,0,0.2);
        }
        .banner {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .banner.active { opacity: 1; }
        .banner-content { text-align: center; padding: 24px; }
        .banner-text {
          font-family: 'Reem Kufi', 'Cairo', 'Manrope', sans-serif;
          font-size: 30px; font-weight: 700; color: #fff; margin-bottom: 8px;
          line-height: 1.2;
        }
        .banner-sub { font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.5; }
        .banner-dots { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); display: flex; gap: 5px; }
        .banner-dots button {
          width: 6px; height: 3px; background: rgba(255,255,255,0.4);
          border: none; border-radius: 2px; padding: 0; cursor: pointer;
          transition: var(--transition);
        }
        .banner-dots button.on { width: 18px; background: #fff; }

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
          border-radius: 14px;
          color: #fff;
          font-family: inherit;
          font-size: 14px; font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
        }
        .cta:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.14); }
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
          padding: 24px;
          text-align: center;
          color: rgba(255,255,255,0.5);
          font-size: 13px;
        }
        .setup-hint a { color: var(--accent); text-decoration: underline; }

        .lang-switch {
          display: block; margin: 16px auto 0;
          padding: 6px 14px;
          background: none; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px;
          color: rgba(255,255,255,0.55);
          font-size: 11px; cursor: pointer;
          transition: var(--transition);
        }
        .lang-switch:hover { color: #fff; border-color: rgba(255,255,255,0.25); }

        .footer {
          margin-top: 32px;
          text-align: center;
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          display: flex; flex-direction: column; gap: 6px;
        }
        .footer-credit a { color: rgba(255,255,255,0.55); }
        .footer-credit a:hover { color: #fff; }
      `}</style>
    </>
  );
}

function ProjectsModal({ projects, t, lang, onClose }) {
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
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
                const full = pick(p.full_description, lang) || pick(p.full_description, 'en');
                const isOpen = expanded === p.id;
                return (
                  <article key={p.id} className={`pcard ${isOpen ? 'open' : ''}`}>
                    <button className="pcard-trigger" onClick={() => setExpanded(isOpen ? null : p.id)}>
                      {p.cover_image && (
                        <div className="pcard-cover"><img src={p.cover_image} alt={title} loading="lazy" /></div>
                      )}
                      <div className="pcard-meta">
                        <h3>{title}</h3>
                        {desc && <p>{desc}</p>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="pcard-details">
                        {full && <p className="pcard-full">{full}</p>}
                        {p.images && p.images.length > 0 && (
                          <div className="pcard-gallery">
                            {p.images.map((img, i) => <img key={i} src={img} alt="" loading="lazy" />)}
                          </div>
                        )}
                        {p.external_url && (
                          <a href={p.external_url} target="_blank" rel="noopener noreferrer" className="pcard-link">{t('view_project')} →</a>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
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
          animation: fadeIn 0.2s ease;
        }
        .modal {
          width: 100%; max-width: 880px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-strong);
          border-radius: 20px;
          overflow: hidden;
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
        }
        .modal-close:hover { color: #fff; }
        .modal-body { padding: 24px; }
        .modal-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
        .grid { display: flex; flex-direction: column; gap: 12px; }
        .pcard { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; transition: var(--transition); }
        .pcard:hover { border-color: var(--border-strong); }
        .pcard-trigger { display: block; width: 100%; padding: 0; text-align: inherit; background: none; border: none; cursor: pointer; }
        .pcard-cover { width: 100%; aspect-ratio: 1; overflow: hidden; background: var(--bg-primary); }
        .pcard-cover img { width: 100%; height: 100%; object-fit: cover; transition: var(--transition-slow); }
        .pcard:hover .pcard-cover img { transform: scale(1.02); }
        .pcard-meta { padding: 16px 20px; }
        .pcard-meta h3 { font-size: 16px; font-weight: 600; color: #fff; }
        .pcard-meta p { font-size: 13px; color: var(--text-tertiary); margin-top: 4px; }
        .pcard-details { padding: 0 20px 20px; }
        .pcard-full { font-size: 14px; color: var(--text-secondary); line-height: 1.7; padding-top: 12px; border-top: 1px solid var(--border); margin-bottom: 16px; }
        .pcard-gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 16px; }
        .pcard-gallery img { width: 100%; border-radius: 8px; }
        .pcard-link { display: inline-block; padding: 8px 16px; background: var(--accent); color: var(--bg-primary); border-radius: 10px; font-size: 13px; font-weight: 600; }
        @media (min-width: 640px) { .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } }
      `}</style>
    </div>
  );
}
