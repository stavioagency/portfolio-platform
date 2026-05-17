import { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import { getTranslator } from '../lib/translations';
import { pick } from '../lib/i18n';

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('ar');
  const [expandedProject, setExpandedProject] = useState(null);

  const t = getTranslator(lang);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: profileData } = await supabase
        .from('profile')
        .select('*')
        .eq('id', 1)
        .single();

      const { data: projectsData } = await supabase
        .from('projects')
        .select('*')
        .order('display_order', { ascending: true });

      if (profileData) {
        setProfile(profileData);
        setLang(profileData.default_lang || 'ar');
      }
      if (projectsData) setProjects(projectsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)'
      }}>
        <div className="loader-spinner" />
        <style jsx>{`
          .loader-spinner {
            width: 32px;
            height: 32px;
            border: 2.5px solid rgba(255,255,255,0.1);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '20px',
        color: 'var(--text-secondary)'
      }}>
        <h1 style={{ fontSize: '20px', marginBottom: '12px', fontWeight: 600 }}>
          Setup needed
        </h1>
        <p style={{ fontSize: '14px', maxWidth: '400px', lineHeight: 1.6 }}>
          The database is connected but there's no profile data yet.
          Go to <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>/admin</code> to set up your portfolio.
        </p>
      </div>
    );
  }

  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const name = pick(profile.name, lang);
  const tagline = pick(profile.tagline, lang);
  const bio = pick(profile.bio, lang);

  return (
    <>
      <Head>
        <title>{name}{tagline ? ` | ${tagline}` : ''}</title>
        <meta name="description" content={bio || tagline} />
      </Head>

      <main dir={dir} className="main">
        {/* Header */}
        <header className="header">
          <div className="profile-block">
            {profile.profile_image && (
              <div className="profile-image">
                <img src={profile.profile_image} alt={name} />
              </div>
            )}
            <div className="profile-text">
              <h1>{name}</h1>
              <p>{tagline}</p>
            </div>
          </div>

          <button
            className="lang-toggle"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
        </header>

        {/* Bio */}
        {bio && (
          <section className="bio">
            <p>{bio}</p>
          </section>
        )}

        {/* Projects */}
        <section className="projects-section">
          <h2 className="section-title">{t('projects')}</h2>

          {projects.length === 0 ? (
            <p className="empty-state">{t('no_projects')}</p>
          ) : (
            <div className="projects-grid">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  expanded={expandedProject === project.id}
                  onToggle={() => setExpandedProject(
                    expandedProject === project.id ? null : project.id
                  )}
                  t={t}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="footer">
          <p>© {name} {new Date().getFullYear()}</p>
        </footer>

        <style jsx>{`
          .main {
            max-width: 880px;
            margin: 0 auto;
            padding: var(--space-8) var(--space-5);
            min-height: 100vh;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: var(--space-4);
            margin-bottom: var(--space-6);
          }

          .profile-block {
            display: flex;
            align-items: center;
            gap: var(--space-4);
          }

          .profile-image {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            overflow: hidden;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            flex-shrink: 0;
          }

          .profile-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .profile-text h1 {
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.01em;
            margin-bottom: 2px;
          }

          .profile-text p {
            font-size: 14px;
            color: var(--text-tertiary);
          }

          .lang-toggle {
            padding: 8px 14px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 12px;
            font-weight: 600;
            transition: var(--transition);
          }

          .lang-toggle:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
            border-color: var(--border-strong);
          }

          .bio {
            padding: var(--space-5);
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            margin-bottom: var(--space-8);
          }

          .bio p {
            font-size: 15px;
            line-height: 1.7;
            color: var(--text-secondary);
          }

          .projects-section {
            margin-bottom: var(--space-10);
          }

          .section-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: var(--space-5);
          }

          .empty-state {
            padding: var(--space-10) var(--space-5);
            text-align: center;
            color: var(--text-muted);
            font-size: 14px;
          }

          .projects-grid {
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
          }

          .footer {
            margin-top: var(--space-10);
            padding-top: var(--space-5);
            border-top: 1px solid var(--border);
            text-align: center;
            color: var(--text-muted);
            font-size: 12px;
          }
        `}</style>
      </main>
    </>
  );
}

function ProjectCard({ project, expanded, onToggle, t, lang }) {
  const title = pick(project.title, lang);
  const description = pick(project.description, lang);
  const fullDescription = pick(project.full_description, lang);
  return (
    <article className={`project-card ${expanded ? 'expanded' : ''}`}>
      <button className="project-trigger" onClick={onToggle}>
        {project.cover_image && (
          <div className="project-cover">
            <img src={project.cover_image} alt={title} loading="lazy" />
          </div>
        )}
        <div className="project-meta">
          <h3>{title}</h3>
          {description && <p>{description}</p>}
          <span className="expand-cue">
            {expanded ? '−' : '+'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="project-details">
          {fullDescription && (
            <p className="full-description">{fullDescription}</p>
          )}

          {project.images && project.images.length > 0 && (
            <div className="project-gallery">
              {project.images.map((img, i) => (
                <img key={i} src={img} alt="" loading="lazy" />
              ))}
            </div>
          )}

          {project.external_url && (
            <a
              href={project.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="project-link"
            >
              {t('view_project')} →
            </a>
          )}
        </div>
      )}

      <style jsx>{`
        .project-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition: var(--transition);
        }

        .project-card:hover {
          border-color: var(--border-strong);
        }

        .project-card.expanded {
          background: var(--bg-elevated);
        }

        .project-trigger {
          display: block;
          width: 100%;
          padding: 0;
          text-align: inherit;
          background: none;
        }

        .project-cover {
          width: 100%;
          height: 200px;
          overflow: hidden;
          background: var(--bg-primary);
        }

        .project-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: var(--transition-slow);
        }

        .project-card:hover .project-cover img {
          transform: scale(1.02);
        }

        .project-meta {
          padding: var(--space-5);
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
        }

        .project-meta h3 {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .project-meta p {
          font-size: 14px;
          color: var(--text-tertiary);
          line-height: 1.6;
        }

        .expand-cue {
          position: absolute;
          top: var(--space-5);
          inset-inline-end: var(--space-5);
          font-size: 20px;
          color: var(--text-tertiary);
          font-weight: 300;
        }

        .project-details {
          padding: 0 var(--space-5) var(--space-5);
          animation: expandIn 0.3s ease;
        }

        @keyframes expandIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .full-description {
          font-size: 15px;
          line-height: 1.7;
          color: var(--text-secondary);
          margin-bottom: var(--space-5);
          padding-top: var(--space-4);
          border-top: 1px solid var(--border);
        }

        .project-gallery {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-2);
          margin-bottom: var(--space-4);
        }

        .project-gallery img {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          border-radius: var(--radius-md);
        }

        .project-link {
          display: inline-block;
          padding: 10px 18px;
          background: var(--accent);
          color: var(--bg-primary);
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 600;
          transition: var(--transition);
        }

        .project-link:hover {
          background: var(--accent-hover);
        }
      `}</style>
    </article>
  );
}
