import { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import { getTranslator } from '../lib/translations';
import { pick, setLangValue, emptyBilingual } from '../lib/i18n';
import { BRAND_ICONS, BRAND_KEYS } from '../lib/brand-icons';

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const BANNER_BGS = {
  purple: { name: 'Purple',  gradient: 'linear-gradient(135deg, #7a72d6, #9FA7FF)' },
  blue:   { name: 'Blue',    gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)' },
  sunset: { name: 'Sunset',  gradient: 'linear-gradient(135deg, #ec4899, #f97316)' },
  forest: { name: 'Forest',  gradient: 'linear-gradient(135deg, #10b981, #3b82f6)' },
  dark:   { name: 'Dark',    gradient: 'linear-gradient(135deg, #1f2937, #374151)' },
};

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

export default function Admin() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLangState] = useState('ar');

  useEffect(() => {
    const initial = readLang();
    setLangState(initial);
    applyLang(initial);

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  function toggleLang() {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLangState(next);
    applyLang(next);
  }

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  return (
    <>
      <Head><title>Admin Dashboard</title></Head>
      {session
        ? <Dashboard session={session} lang={lang} toggleLang={toggleLang} />
        : <SignIn lang={lang} toggleLang={toggleLang} />}
    </>
  );
}

function SignIn({ lang, toggleLang }) {
  const t = getTranslator(lang);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const trimmed = username.trim().toLowerCase();
    const { data: email, error: rpcError } = await supabase
      .rpc('get_email_for_username', { p_username: trimmed });

    if (rpcError || !email) {
      setError(t('invalid_credentials'));
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(t('invalid_credentials'));
    setLoading(false);
  }

  return (
    <div className="signin-wrap">
      <form className="signin-card" onSubmit={handleSubmit}>
        <div className="signin-top">
          <h1>{t('sign_in_heading')}</h1>
          <button type="button" onClick={toggleLang} className="lang-btn">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
        </div>
        <p className="signin-hint">{t('sign_in_hint')}</p>

        <label>{t('username')}</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          spellCheck="false"
          autoCapitalize="off"
        />

        <label>{t('password')}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? t('signing_in') : t('sign_in')}
        </button>
      </form>

      <style jsx>{`
        .signin-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .signin-card {
          width: 100%;
          max-width: 360px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
        }
        .signin-top {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 4px;
        }
        h1 { font-size: 22px; font-weight: 700; }
        .lang-btn {
          padding: 4px 10px; background: var(--bg-elevated);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          font-size: 11px; color: var(--text-secondary);
        }
        .lang-btn:hover { color: var(--text-primary); }
        .signin-hint { font-size: 13px; color: var(--text-tertiary); margin-bottom: var(--space-5); }
        label {
          display: block; font-size: 12px; font-weight: 500;
          color: var(--text-tertiary); margin: var(--space-4) 0 6px;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        input {
          width: 100%; padding: 11px 14px;
          background: var(--bg-elevated); border: 1px solid var(--border);
          border-radius: var(--radius-md); color: var(--text-primary);
          font-size: 14px; transition: var(--transition);
        }
        input:focus { outline: none; border-color: var(--accent); }
        button[type="submit"] {
          width: 100%; padding: 12px;
          background: var(--accent); color: var(--bg-primary);
          border-radius: var(--radius-md); font-weight: 600; font-size: 14px;
          margin-top: var(--space-5); transition: var(--transition);
        }
        button[type="submit"]:hover:not(:disabled) { background: var(--accent-hover); }
        button[type="submit"]:disabled { opacity: 0.5; cursor: not-allowed; }
        .error {
          margin-top: var(--space-4); padding: 10px 12px;
          background: rgba(255, 80, 80, 0.1); color: #ff8080;
          border-radius: var(--radius-md); font-size: 13px;
        }
      `}</style>
    </div>
  );
}

function Dashboard({ session, lang, toggleLang }) {
  const [activeTab, setActiveTab] = useState('profile');
  const t = getTranslator(lang);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">⚙️ Dashboard</div>
          <button onClick={toggleLang} className="lang-btn">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
        </div>

        <nav className="nav">
          <NavItem icon="👤" label={t('nav_profile')} active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
          <NavItem icon="🪪" label={t('nav_card')} active={activeTab === 'card'} onClick={() => setActiveTab('card')} />
          <NavItem icon="📁" label={t('nav_projects')} active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />
          <NavItem icon="🔗" label={t('nav_links')} active={activeTab === 'links'} onClick={() => setActiveTab('links')} />
          <NavItem icon="🎨" label={t('nav_appearance')} active={activeTab === 'appearance'} onClick={() => setActiveTab('appearance')} />
        </nav>

        <div className="sidebar-footer">
          <a href="/" target="_blank" rel="noopener noreferrer" className="view-site-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            {t('view_live_site')}
          </a>
          <div className="user-email">{session.user.email}</div>
          <button onClick={signOut} className="signout-btn">{t('sign_out')}</button>
        </div>
      </aside>

      <main className="content">
        {activeTab === 'profile' && <ProfileEditor t={t} />}
        {activeTab === 'card' && <CardEditor t={t} lang={lang} />}
        {activeTab === 'projects' && <ProjectsEditor t={t} />}
        {activeTab === 'links' && <LinksEditor t={t} />}
        {activeTab === 'appearance' && <AppearanceEditor t={t} />}
      </main>

      <style jsx>{`
        .dashboard {
          display: flex;
          min-height: 100vh;
        }
        .sidebar {
          width: 240px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: var(--space-4);
        }
        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3) var(--space-3) var(--space-5);
        }
        .sidebar-title {
          font-size: 14px;
          font-weight: 700;
        }
        .lang-btn {
          padding: 4px 10px;
          background: var(--bg-elevated);
          border-radius: var(--radius-sm);
          font-size: 11px;
          color: var(--text-secondary);
        }
        .nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }
        .sidebar-footer {
          padding: var(--space-3);
          border-top: 1px solid var(--border);
        }
        .view-site-btn {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px 12px; margin-bottom: 10px;
          background: linear-gradient(180deg, rgba(159,167,255,0.12), rgba(159,167,255,0.04));
          border: 1px solid rgba(159,167,255,0.25);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: 12px; font-weight: 500;
          text-decoration: none;
          transition: var(--transition);
        }
        .view-site-btn:hover { background: rgba(159,167,255,0.18); }
        .user-email {
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 8px;
          word-break: break-all;
        }
        .signout-btn {
          font-size: 12px;
          color: var(--text-tertiary);
          padding: 6px 0;
        }
        .signout-btn:hover { color: var(--text-primary); }
        .content {
          flex: 1;
          padding: var(--space-6) var(--space-8);
          overflow-y: auto;
          max-height: 100vh;
        }
        @media (max-width: 720px) {
          .dashboard { flex-direction: column; }
          .sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border); }
          .content { padding: var(--space-5); }
        }
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
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          color: var(--text-secondary);
          transition: var(--transition);
          text-align: start;
        }
        .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .nav-item.active { background: var(--bg-elevated); color: var(--text-primary); font-weight: 500; }
        .nav-icon { font-size: 14px; }
      `}</style>
    </button>
  );
}

// ============ EDITORS ============

function ProfileEditor({ t }) {
  const [profile, setProfile] = useState({
    name: '', tagline: '', bio: '', profile_image: '', default_lang: 'ar'
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('profile').select('*').eq('id', 1).maybeSingle();
    if (data) setProfile(data);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('profile').upsert({ ...profile, id: 1 });
    setSaving(false);
    if (!error) {
      setSavedMsg(t('saved'));
      setTimeout(() => setSavedMsg(''), 2000);
    } else {
      alert(error.message);
    }
  }

  async function uploadImage(file) {
    const ext = file.name.split('.').pop();
    const path = `profile-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (error) { alert(error.message); return; }
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    setProfile({ ...profile, profile_image: data.publicUrl });
  }

  return (
    <div className="editor">
      <h1>{t('nav_profile')}</h1>

      <Field label={`${t('name')} · EN`}>
        <input value={pick(profile.name, 'en')} onChange={(e) => setProfile({ ...profile, name: setLangValue(profile.name, 'en', e.target.value) })} />
      </Field>
      <Field label={`${t('name')} · AR`}>
        <input dir="rtl" value={pick(profile.name, 'ar')} onChange={(e) => setProfile({ ...profile, name: setLangValue(profile.name, 'ar', e.target.value) })} />
      </Field>

      <Field label={`${t('tagline')} · EN`}>
        <input value={pick(profile.tagline, 'en')} onChange={(e) => setProfile({ ...profile, tagline: setLangValue(profile.tagline, 'en', e.target.value) })} />
      </Field>
      <Field label={`${t('tagline')} · AR`}>
        <input dir="rtl" value={pick(profile.tagline, 'ar')} onChange={(e) => setProfile({ ...profile, tagline: setLangValue(profile.tagline, 'ar', e.target.value) })} />
      </Field>

      <Field label={`${t('bio')} · EN`}>
        <textarea rows={4} value={pick(profile.bio, 'en')} onChange={(e) => setProfile({ ...profile, bio: setLangValue(profile.bio, 'en', e.target.value) })} />
      </Field>
      <Field label={`${t('bio')} · AR`}>
        <textarea dir="rtl" rows={4} value={pick(profile.bio, 'ar')} onChange={(e) => setProfile({ ...profile, bio: setLangValue(profile.bio, 'ar', e.target.value) })} />
      </Field>

      <Field label={t('profile_image')}>
        <ImageUpload value={profile.profile_image} onUpload={uploadImage} onClear={() => setProfile({ ...profile, profile_image: '' })} />
      </Field>

      <Field label={t('language_default')}>
        <select value={profile.default_lang || 'ar'} onChange={(e) => setProfile({ ...profile, default_lang: e.target.value })}>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </Field>

      <div className="actions">
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? '...' : t('save')}
        </button>
        {savedMsg && <span className="saved-indicator">{savedMsg} ✓</span>}
      </div>

      <EditorStyles />
    </div>
  );
}

function ProjectsEditor({ t }) {
  const [projects, setProjects] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('projects').select('*').order('display_order');
    setProjects(data || []);
  }

  async function addProject() {
    const nextOrder = projects.length;
    const { data, error } = await supabase
      .from('projects')
      .insert({ title: { en: 'New Project', ar: '' }, display_order: nextOrder, images: [] })
      .select()
      .single();
    if (data) { setProjects([...projects, data]); setEditing(data); }
    if (error) alert(error.message);
  }

  async function updateProject(updated) {
    await supabase.from('projects').update(updated).eq('id', updated.id);
    setProjects(projects.map(p => p.id === updated.id ? updated : p));
    setEditing(updated);
  }

  async function deleteProject(id) {
    if (!confirm('Delete this project?')) return;
    await supabase.from('projects').delete().eq('id', id);
    setProjects(projects.filter(p => p.id !== id));
    if (editing?.id === id) setEditing(null);
  }

  if (editing) {
    return <ProjectEditForm project={editing} onSave={updateProject} onBack={() => setEditing(null)} onDelete={deleteProject} t={t} />;
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <h1>{t('nav_projects')}</h1>
        <button className="primary" onClick={addProject}>+ {t('add_project')}</button>
      </div>

      {projects.length === 0 ? (
        <p className="empty">{t('no_projects')}</p>
      ) : (
        <div className="project-list">
          {projects.map((p) => {
            const title = pick(p.title, 'en') || pick(p.title, 'ar');
            const desc = pick(p.description, 'en') || pick(p.description, 'ar');
            return (
              <button key={p.id} className="project-row" onClick={() => setEditing(p)}>
                {p.cover_image && <img src={p.cover_image} alt="" />}
                <div className="project-row-meta">
                  <div className="project-row-title">{title}</div>
                  {desc && <div className="project-row-desc">{desc}</div>}
                </div>
                <span className="chevron">›</span>
              </button>
            );
          })}
        </div>
      )}

      <EditorStyles />
      <style jsx>{`
        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-5);
        }
        .project-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .project-row {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-3);
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          width: 100%;
          text-align: start;
          transition: var(--transition);
        }
        .project-row:hover { background: var(--bg-hover); border-color: var(--border-strong); }
        .project-row img {
          width: 44px; height: 44px; object-fit: cover;
          border-radius: var(--radius-sm); flex-shrink: 0;
        }
        .project-row-meta { flex: 1; min-width: 0; }
        .project-row-title { font-size: 14px; font-weight: 600; }
        .project-row-desc {
          font-size: 12px; color: var(--text-tertiary);
          margin-top: 2px; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .chevron { color: var(--text-muted); font-size: 18px; }
        .empty { color: var(--text-muted); font-size: 14px; padding: var(--space-8); text-align: center; }
      `}</style>
    </div>
  );
}

function ProjectEditForm({ project, onSave, onBack, onDelete, t }) {
  const [data, setData] = useState(project);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  async function save() {
    setSaving(true);
    await onSave(data);
    setSaving(false);
    setSavedMsg(t('saved'));
    setTimeout(() => setSavedMsg(''), 2000);
  }

  async function uploadCover(file) {
    const path = `project-${data.id}-cover-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (error) return alert(error.message);
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
    setData({ ...data, cover_image: urlData.publicUrl });
  }

  async function uploadGalleryImage(file) {
    const path = `project-${data.id}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('media').upload(path, file);
    if (error) return alert(error.message);
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
    setData({ ...data, images: [...(data.images || []), urlData.publicUrl] });
  }

  function removeImage(idx) {
    setData({ ...data, images: data.images.filter((_, i) => i !== idx) });
  }

  const displayTitle = pick(data.title, 'en') || pick(data.title, 'ar') || 'Project';

  return (
    <div className="editor">
      <button onClick={onBack} className="back-btn">← {t('back')}</button>

      <h1>{displayTitle}</h1>

      <Field label={`${t('project_title')} · EN`}>
        <input value={pick(data.title, 'en')} onChange={(e) => setData({ ...data, title: setLangValue(data.title, 'en', e.target.value) })} />
      </Field>
      <Field label={`${t('project_title')} · AR`}>
        <input dir="rtl" value={pick(data.title, 'ar')} onChange={(e) => setData({ ...data, title: setLangValue(data.title, 'ar', e.target.value) })} />
      </Field>

      <Field label={`${t('project_description')} · EN`}>
        <input value={pick(data.description, 'en')} onChange={(e) => setData({ ...data, description: setLangValue(data.description, 'en', e.target.value) })} placeholder="Short summary" />
      </Field>
      <Field label={`${t('project_description')} · AR`}>
        <input dir="rtl" value={pick(data.description, 'ar')} onChange={(e) => setData({ ...data, description: setLangValue(data.description, 'ar', e.target.value) })} placeholder="ملخص قصير" />
      </Field>

      <Field label="Full Description · EN">
        <textarea rows={5} value={pick(data.full_description, 'en')} onChange={(e) => setData({ ...data, full_description: setLangValue(data.full_description, 'en', e.target.value) })} />
      </Field>
      <Field label="Full Description · AR">
        <textarea dir="rtl" rows={5} value={pick(data.full_description, 'ar')} onChange={(e) => setData({ ...data, full_description: setLangValue(data.full_description, 'ar', e.target.value) })} />
      </Field>

      <Field label={t('cover_image')}>
        <ImageUpload value={data.cover_image} onUpload={uploadCover} onClear={() => setData({ ...data, cover_image: '' })} />
      </Field>

      <Field label="External Link (optional)">
        <input value={data.external_url || ''} onChange={(e) => setData({ ...data, external_url: e.target.value })} placeholder="https://..." />
      </Field>

      <Field label={t('project_images')}>
        <MultiImageUpload images={data.images || []} onUpload={uploadGalleryImage} onRemove={removeImage} />
      </Field>

      <div className="actions">
        <button className="primary" onClick={save} disabled={saving}>{saving ? '...' : t('save')}</button>
        <button className="danger" onClick={() => onDelete(data.id)}>{t('delete')}</button>
        {savedMsg && <span className="saved-indicator">{savedMsg} ✓</span>}
      </div>

      <EditorStyles />
      <style jsx>{`
        .back-btn {
          font-size: 13px;
          color: var(--text-tertiary);
          margin-bottom: var(--space-4);
          padding: 4px 0;
        }
        .back-btn:hover { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

function LinksEditor({ t }) {
  const [links, setLinks] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('profile').select('links').eq('id', 1).maybeSingle();
    setLinks(data?.links || {});
  }

  async function save() {
    setSaving(true);
    await supabase.from('profile').upsert({ id: 1, links });
    setSaving(false);
    setSavedMsg(t('saved'));
    setTimeout(() => setSavedMsg(''), 2000);
  }

  const platforms = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'twitter', label: 'X / Twitter' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'behance', label: 'Behance' },
    { key: 'whatsapp', label: 'WhatsApp (number)' },
    { key: 'email', label: 'Email' },
    { key: 'website', label: 'Website' }
  ];

  return (
    <div className="editor">
      <h1>{t('nav_links')}</h1>

      {platforms.map(p => (
        <Field key={p.key} label={p.label}>
          <input
            value={links[p.key] || ''}
            onChange={(e) => setLinks({ ...links, [p.key]: e.target.value })}
            placeholder={p.key === 'whatsapp' ? '966500000000' : p.key === 'email' ? 'you@example.com' : 'https://...'}
          />
        </Field>
      ))}

      <div className="actions">
        <button className="primary" onClick={save} disabled={saving}>{saving ? '...' : t('save')}</button>
        {savedMsg && <span className="saved-indicator">{savedMsg} ✓</span>}
      </div>

      <EditorStyles />
    </div>
  );
}

function AppearanceEditor({ t }) {
  const [appearance, setAppearance] = useState({
    accent_color: '#9FA7FF',
    bg_color: '#0a0a0c'
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('profile').select('appearance').eq('id', 1).maybeSingle();
    if (data?.appearance) setAppearance(data.appearance);
  }

  async function save() {
    setSaving(true);
    await supabase.from('profile').upsert({ id: 1, appearance });
    setSaving(false);
    setSavedMsg(t('saved'));
    setTimeout(() => setSavedMsg(''), 2000);
  }

  return (
    <div className="editor">
      <h1>{t('nav_appearance')}</h1>

      <Field label={t('accent_color')}>
        <input type="color" value={appearance.accent_color} onChange={(e) => setAppearance({ ...appearance, accent_color: e.target.value })} />
      </Field>

      <Field label={t('background_dark')}>
        <input type="color" value={appearance.bg_color} onChange={(e) => setAppearance({ ...appearance, bg_color: e.target.value })} />
      </Field>

      <div className="actions">
        <button className="primary" onClick={save} disabled={saving}>{saving ? '...' : t('save')}</button>
        {savedMsg && <span className="saved-indicator">{savedMsg} ✓</span>}
      </div>

      <EditorStyles />
    </div>
  );
}

// ============ CARD EDITOR ============

function CardEditor({ t, lang }) {
  const [profile, setProfile] = useState({ banners: [], stats: [], cta_buttons: [], brand_logo: '' });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('profile')
      .select('banners, stats, cta_buttons, brand_logo')
      .eq('id', 1)
      .maybeSingle();
    if (data) {
      setProfile({
        banners: data.banners || [],
        stats: data.stats || [],
        cta_buttons: data.cta_buttons || [],
        brand_logo: data.brand_logo || '',
      });
    }
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('profile').upsert({ id: 1, ...profile });
    setSaving(false);
    if (!error) {
      setSavedMsg(t('saved'));
      setTimeout(() => setSavedMsg(''), 2000);
    } else {
      alert(error.message);
    }
  }

  async function uploadAsset(prefix, file) {
    const path = `${prefix}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (error) { alert(error.message); return null; }
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadBrandLogo(file) {
    const url = await uploadAsset('brand-logo', file);
    if (url) setProfile({ ...profile, brand_logo: url });
  }

  // --- Banners ---
  function addBanner() {
    if ((profile.banners?.length || 0) >= 5) return;
    setProfile({
      ...profile,
      banners: [...(profile.banners || []), {
        id: newId(), type: 'text', text: emptyBilingual(), subtitle: emptyBilingual(), bg: 'purple', image_url: '',
      }]
    });
  }
  function updateBanner(id, updates) {
    setProfile({ ...profile, banners: profile.banners.map(b => b.id === id ? { ...b, ...updates } : b) });
  }
  function removeBanner(id) {
    if (!confirm('Remove this banner?')) return;
    setProfile({ ...profile, banners: profile.banners.filter(b => b.id !== id) });
  }
  function moveBanner(id, dir) {
    const arr = [...profile.banners];
    const i = arr.findIndex(b => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setProfile({ ...profile, banners: arr });
  }
  async function uploadBannerImage(bannerId, file) {
    const url = await uploadAsset(`banner-${bannerId}`, file);
    if (url) updateBanner(bannerId, { image_url: url });
  }

  // --- Stats ---
  function addStat() {
    if ((profile.stats?.length || 0) >= 3) return;
    setProfile({
      ...profile,
      stats: [...(profile.stats || []), {
        id: newId(), label: emptyBilingual(), value: emptyBilingual(),
      }]
    });
  }
  function updateStat(id, updates) {
    setProfile({ ...profile, stats: profile.stats.map(s => s.id === id ? { ...s, ...updates } : s) });
  }
  function removeStat(id) {
    setProfile({ ...profile, stats: profile.stats.filter(s => s.id !== id) });
  }
  function moveStat(id, dir) {
    const arr = [...profile.stats];
    const i = arr.findIndex(s => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setProfile({ ...profile, stats: arr });
  }

  // --- CTA Buttons ---
  function addButton() {
    setProfile({
      ...profile,
      cta_buttons: [...(profile.cta_buttons || []), {
        id: newId(), icon: 'whatsapp', label: emptyBilingual(), action: 'link', href: '',
      }]
    });
  }
  function updateButton(id, updates) {
    setProfile({ ...profile, cta_buttons: profile.cta_buttons.map(b => b.id === id ? { ...b, ...updates } : b) });
  }
  function removeButton(id) {
    setProfile({ ...profile, cta_buttons: profile.cta_buttons.filter(b => b.id !== id) });
  }
  function moveButton(id, dir) {
    const arr = [...profile.cta_buttons];
    const i = arr.findIndex(b => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setProfile({ ...profile, cta_buttons: arr });
  }

  return (
    <div className="editor">
      <h1>{t('card_title')}</h1>
      <p className="hint">{t('card_sub')}</p>

      <h2>{t('brand_logo')}</h2>
      <p className="hint">{t('brand_logo_hint')}</p>
      <ImageUpload
        value={profile.brand_logo}
        onUpload={uploadBrandLogo}
        onClear={() => setProfile({ ...profile, brand_logo: '' })}
      />

      <h2>{t('banners_title')} <span className="meta">· {t('banners_sub')} · {(profile.banners?.length || 0)}/5</span></h2>
      {profile.banners?.map((banner, i) => (
        <BannerRow
          key={banner.id} banner={banner}
          onChange={(u) => updateBanner(banner.id, u)}
          onRemove={() => removeBanner(banner.id)}
          onUp={() => moveBanner(banner.id, -1)}
          onDown={() => moveBanner(banner.id, 1)}
          canUp={i > 0} canDown={i < profile.banners.length - 1}
          uploadImage={(f) => uploadBannerImage(banner.id, f)}
          t={t} lang={lang}
        />
      ))}
      {(profile.banners?.length || 0) < 5 && (
        <button className="btn-add" onClick={addBanner}>+ {t('banner_add')}</button>
      )}

      <h2>{t('stats_title')} <span className="meta">· {t('stats_sub')} · {(profile.stats?.length || 0)}/3</span></h2>
      {profile.stats?.map((stat, i) => (
        <StatRow
          key={stat.id} stat={stat}
          onChange={(u) => updateStat(stat.id, u)}
          onRemove={() => removeStat(stat.id)}
          onUp={() => moveStat(stat.id, -1)}
          onDown={() => moveStat(stat.id, 1)}
          canUp={i > 0} canDown={i < profile.stats.length - 1}
          t={t}
        />
      ))}
      {(profile.stats?.length || 0) < 3 && (
        <button className="btn-add" onClick={addStat}>+ {t('stat_add')}</button>
      )}

      <h2>{t('buttons_title')} <span className="meta">· {t('buttons_sub')}</span></h2>
      {profile.cta_buttons?.map((btn, i) => (
        <ButtonRow
          key={btn.id} btn={btn}
          onChange={(u) => updateButton(btn.id, u)}
          onRemove={() => removeButton(btn.id)}
          onUp={() => moveButton(btn.id, -1)}
          onDown={() => moveButton(btn.id, 1)}
          canUp={i > 0} canDown={i < profile.cta_buttons.length - 1}
          t={t}
        />
      ))}
      <button className="btn-add" onClick={addButton}>+ {t('button_add')}</button>

      <div className="actions">
        <button className="primary" onClick={save} disabled={saving}>{saving ? '...' : t('save')}</button>
        {savedMsg && <span className="saved-indicator">{savedMsg} ✓</span>}
      </div>

      <EditorStyles />
      <CardEditorStyles />
    </div>
  );
}

function BannerRow({ banner, onChange, onRemove, onUp, onDown, canUp, canDown, uploadImage, t, lang }) {
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
            <Field label={`${t('banner_text')} · EN`}>
              <input value={pick(banner.text, 'en')} onChange={(e) => onChange({ text: setLangValue(banner.text, 'en', e.target.value) })} placeholder="Welcome" />
            </Field>
            <Field label={`${t('banner_text')} · AR`}>
              <input dir="rtl" value={pick(banner.text, 'ar')} onChange={(e) => onChange({ text: setLangValue(banner.text, 'ar', e.target.value) })} placeholder="أهلاً وسهلاً" />
            </Field>
            <Field label={`${t('banner_subtitle')} · EN`}>
              <input value={pick(banner.subtitle, 'en')} onChange={(e) => onChange({ subtitle: setLangValue(banner.subtitle, 'en', e.target.value) })} placeholder="Optional" />
            </Field>
            <Field label={`${t('banner_subtitle')} · AR`}>
              <input dir="rtl" value={pick(banner.subtitle, 'ar')} onChange={(e) => onChange({ subtitle: setLangValue(banner.subtitle, 'ar', e.target.value) })} placeholder="اختياري" />
            </Field>
          </div>
          <Field label={t('banner_bg')}>
            <select value={banner.bg || 'purple'} onChange={(e) => onChange({ bg: e.target.value })}>
              {Object.entries(BANNER_BGS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </Field>
          <div className="banner-preview" style={{ background: BANNER_BGS[banner.bg || 'purple'].gradient }}>
            <div className="banner-text" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{previewText || '...'}</div>
            {previewSub && <div className="banner-sub" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{previewSub}</div>}
          </div>
        </>
      ) : (
        <Field label={t('banner_upload')}>
          <ImageUpload value={banner.image_url} onUpload={uploadImage} onClear={() => onChange({ image_url: '' })} />
        </Field>
      )}
    </div>
  );
}

function StatRow({ stat, onChange, onRemove, onUp, onDown, canUp, canDown, t }) {
  return (
    <div className="card-row">
      <div className="row-head">
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stat</span>
        <div className="row-actions">
          <button type="button" className="x-small" disabled={!canUp} onClick={onUp}>↑</button>
          <button type="button" className="x-small" disabled={!canDown} onClick={onDown}>↓</button>
          <button type="button" className="x-small" onClick={onRemove}>×</button>
        </div>
      </div>
      <div className="row-grid-2">
        <Field label={`${t('stat_label')} · EN`}>
          <input value={pick(stat.label, 'en')} onChange={(e) => onChange({ label: setLangValue(stat.label, 'en', e.target.value) })} placeholder="Rating" />
        </Field>
        <Field label={`${t('stat_label')} · AR`}>
          <input dir="rtl" value={pick(stat.label, 'ar')} onChange={(e) => onChange({ label: setLangValue(stat.label, 'ar', e.target.value) })} placeholder="التقييم" />
        </Field>
        <Field label={`${t('stat_value')} · EN`}>
          <input value={pick(stat.value, 'en')} onChange={(e) => onChange({ value: setLangValue(stat.value, 'en', e.target.value) })} placeholder="★ 4.9" />
        </Field>
        <Field label={`${t('stat_value')} · AR`}>
          <input dir="rtl" value={pick(stat.value, 'ar')} onChange={(e) => onChange({ value: setLangValue(stat.value, 'ar', e.target.value) })} placeholder="★ 4.9" />
        </Field>
      </div>
    </div>
  );
}

function ButtonRow({ btn, onChange, onRemove, onUp, onDown, canUp, canDown, t }) {
  const icon = btn.icon && BRAND_ICONS[btn.icon];
  return (
    <div className="card-row">
      <div className="row-head">
        <div className="brand-mini">
          {icon && <svg viewBox="0 0 24 24"><path d={icon.path} /></svg>}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{icon?.label || 'Pick an icon'}</span>
        <div className="row-actions">
          <button type="button" className="x-small" disabled={!canUp} onClick={onUp}>↑</button>
          <button type="button" className="x-small" disabled={!canDown} onClick={onDown}>↓</button>
          <button type="button" className="x-small" onClick={onRemove}>×</button>
        </div>
      </div>
      <Field label={t('button_icon')}>
        <select value={btn.icon || ''} onChange={(e) => onChange({ icon: e.target.value })}>
          <option value="">— choose an icon —</option>
          {BRAND_KEYS.map(k => <option key={k} value={k}>{BRAND_ICONS[k].label}</option>)}
        </select>
      </Field>
      <div className="row-grid-2">
        <Field label={`${t('button_label')} · EN`}>
          <input value={pick(btn.label, 'en')} onChange={(e) => onChange({ label: setLangValue(btn.label, 'en', e.target.value) })} placeholder="Contact me on WhatsApp" />
        </Field>
        <Field label={`${t('button_label')} · AR`}>
          <input dir="rtl" value={pick(btn.label, 'ar')} onChange={(e) => onChange({ label: setLangValue(btn.label, 'ar', e.target.value) })} placeholder="تواصل معي عبر واتساب" />
        </Field>
      </div>
      <Field label={t('button_action')}>
        <select value={btn.action || 'link'} onChange={(e) => onChange({ action: e.target.value })}>
          <option value="link">{t('button_action_link')}</option>
          <option value="open_projects">{t('button_action_open_projects')}</option>
        </select>
      </Field>
      {btn.action !== 'open_projects' && (
        <Field label={t('button_href')}>
          <input type="url" value={btn.href || ''} onChange={(e) => onChange({ href: e.target.value })} placeholder="https://wa.me/97450000000" />
        </Field>
      )}
    </div>
  );
}

function CardEditorStyles() {
  return (
    <style jsx global>{`
      .editor .hint { font-size: 13px; color: var(--text-tertiary); margin-bottom: var(--space-4); max-width: 560px; line-height: 1.5; }
      .editor .meta { font-size: 11px; color: var(--text-muted); font-weight: 400; text-transform: none; letter-spacing: 0; margin-inline-start: 6px; }
      .editor h2 { margin-top: var(--space-6); font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-3); }
      .card-row {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-4);
        margin-bottom: var(--space-3);
        max-width: 640px;
      }
      .card-row .row-head { display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-3); }
      .card-row .row-tabs { display: inline-flex; gap: 2px; background: var(--bg-elevated); border-radius: var(--radius-sm); padding: 3px; }
      .card-row .row-tabs button { padding: 4px 12px; font-size: 12px; color: var(--text-tertiary); border: none; background: none; border-radius: 5px; cursor: pointer; }
      .card-row .row-tabs button.active { background: var(--bg-hover); color: var(--text-primary); }
      .card-row .row-actions { margin-inline-start: auto; display: flex; gap: 4px; }
      .card-row .x-small {
        width: 28px; height: 28px; border-radius: 6px;
        background: var(--bg-elevated); color: var(--text-tertiary);
        border: 1px solid var(--border);
        font-size: 13px; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .card-row .x-small:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
      .card-row .x-small:disabled { opacity: 0.3; cursor: not-allowed; }
      .row-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 100%; }
      .row-grid-2 .field { margin-bottom: 0; }
      .banner-preview {
        margin-top: var(--space-3);
        border-radius: var(--radius-md);
        padding: 28px 20px;
        text-align: center;
        min-height: 120px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .banner-text {
        font-family: 'Reem Kufi', 'Cairo', 'Manrope', sans-serif;
        font-size: 28px; font-weight: 700; color: #fff; margin-bottom: 4px;
        line-height: 1.2;
      }
      .banner-sub { font-size: 13px; color: rgba(255,255,255,0.85); }
      .brand-mini {
        width: 30px; height: 30px;
        display: flex; align-items: center; justify-content: center;
        color: rgba(255,255,255,0.92);
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 7px;
      }
      .brand-mini svg { width: 15px; height: 15px; fill: currentColor; }
      .btn-add {
        padding: 8px 14px;
        background: var(--bg-elevated);
        color: var(--text-primary);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        font-size: 13px;
        cursor: pointer;
      }
      .btn-add:hover { border-color: var(--border-strong); }
    `}</style>
  );
}

// ============ SHARED COMPONENTS ============

function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      <style jsx>{`
        .field { margin-bottom: var(--space-4); }
        label {
          display: block; font-size: 12px; font-weight: 500;
          color: var(--text-tertiary); margin-bottom: 6px;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
      `}</style>
    </div>
  );
}

function ImageUpload({ value, onUpload, onClear }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await onUpload(file);
    setUploading(false);
  }

  if (value) {
    return (
      <div className="preview">
        <img src={value} alt="" />
        <button type="button" onClick={onClear} className="remove">×</button>
        <style jsx>{`
          .preview {
            position: relative; display: inline-block;
            border-radius: var(--radius-md); overflow: hidden;
            border: 1px solid var(--border);
          }
          .preview img { max-width: 200px; max-height: 200px; display: block; }
          .remove {
            position: absolute; top: 6px; right: 6px;
            width: 26px; height: 26px;
            background: rgba(0,0,0,0.7); color: white;
            border-radius: 50%; font-size: 16px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <label className="upload">
      <input type="file" accept="image/*" onChange={handleFile} />
      <span>{uploading ? 'Uploading...' : '📷 Choose image'}</span>
      <style jsx>{`
        .upload {
          display: inline-flex; align-items: center;
          padding: 10px 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 13px; cursor: pointer;
          transition: var(--transition);
        }
        .upload:hover { border-color: var(--border-strong); background: var(--bg-hover); }
        input { display: none; }
      `}</style>
    </label>
  );
}

function MultiImageUpload({ images, onUpload, onRemove }) {
  const [uploading, setUploading] = useState(false);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    setUploading(true);
    for (const f of files) await onUpload(f);
    setUploading(false);
    e.target.value = '';
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
      <style jsx>{`
        .thumbs {
          display: grid;
          grid-template-columns: repeat(auto-fill, 90px);
          gap: 8px;
        }
        .thumb { position: relative; }
        .thumb img {
          width: 90px; height: 90px; object-fit: cover;
          border-radius: var(--radius-sm); border: 1px solid var(--border);
        }
        .thumb button {
          position: absolute; top: 4px; right: 4px;
          width: 22px; height: 22px;
          background: rgba(0,0,0,0.7); color: white;
          border-radius: 50%; font-size: 14px;
        }
        .add {
          width: 90px; height: 90px;
          background: var(--bg-elevated);
          border: 1.5px dashed var(--border-strong);
          border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; color: var(--text-tertiary); cursor: pointer;
          transition: var(--transition);
        }
        .add:hover { border-color: var(--accent); color: var(--accent); }
        input { display: none; }
      `}</style>
    </div>
  );
}

function EditorStyles() {
  return (
    <style jsx global>{`
      .editor h1 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: var(--space-5);
        letter-spacing: -0.01em;
      }
      .editor input[type="text"],
      .editor input[type="email"],
      .editor input[type="password"],
      .editor input:not([type]),
      .editor textarea,
      .editor select {
        width: 100%;
        max-width: 500px;
        padding: 10px 14px;
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-size: 14px;
        transition: var(--transition);
      }
      .editor input:focus,
      .editor textarea:focus,
      .editor select:focus {
        outline: none; border-color: var(--accent);
      }
      .editor textarea { resize: vertical; min-height: 80px; line-height: 1.6; }
      .editor input[type="color"] {
        width: 60px; height: 40px; padding: 4px;
        cursor: pointer;
      }
      .editor .actions {
        display: flex; gap: 10px; align-items: center;
        margin-top: var(--space-6);
        padding-top: var(--space-5);
        border-top: 1px solid var(--border);
      }
      .editor button.primary {
        padding: 10px 20px;
        background: var(--accent); color: var(--bg-primary);
        border-radius: var(--radius-md);
        font-weight: 600; font-size: 14px;
        transition: var(--transition);
      }
      .editor button.primary:hover:not(:disabled) { background: var(--accent-hover); }
      .editor button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .editor button.danger {
        padding: 10px 16px;
        background: rgba(255, 80, 80, 0.1); color: #ff8080;
        border-radius: var(--radius-md); font-size: 13px;
        transition: var(--transition);
      }
      .editor button.danger:hover { background: rgba(255, 80, 80, 0.18); }
      .editor .saved-indicator {
        font-size: 13px;
        color: var(--accent);
        margin-inline-start: 4px;
      }
    `}</style>
  );
}
