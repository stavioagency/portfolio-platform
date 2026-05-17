import { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import { getTranslator } from '../lib/translations';

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
          <NavItem icon="📁" label={t('nav_projects')} active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />
          <NavItem icon="🔗" label={t('nav_links')} active={activeTab === 'links'} onClick={() => setActiveTab('links')} />
          <NavItem icon="🎨" label={t('nav_appearance')} active={activeTab === 'appearance'} onClick={() => setActiveTab('appearance')} />
        </nav>

        <div className="sidebar-footer">
          <div className="user-email">{session.user.email}</div>
          <button onClick={signOut} className="signout-btn">{t('sign_out')}</button>
        </div>
      </aside>

      <main className="content">
        {activeTab === 'profile' && <ProfileEditor t={t} />}
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

      <Field label={t('name')}>
        <input value={profile.name || ''} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
      </Field>

      <Field label={t('tagline')}>
        <input value={profile.tagline || ''} onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} />
      </Field>

      <Field label={t('bio')}>
        <textarea rows={4} value={profile.bio || ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
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
      .insert({ title: 'New Project', display_order: nextOrder, images: [] })
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
          {projects.map((p) => (
            <button key={p.id} className="project-row" onClick={() => setEditing(p)}>
              {p.cover_image && <img src={p.cover_image} alt="" />}
              <div className="project-row-meta">
                <div className="project-row-title">{p.title}</div>
                {p.description && <div className="project-row-desc">{p.description}</div>}
              </div>
              <span className="chevron">›</span>
            </button>
          ))}
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

  return (
    <div className="editor">
      <button onClick={onBack} className="back-btn">← {t('back')}</button>

      <h1>{data.title || 'Project'}</h1>

      <Field label={t('project_title')}>
        <input value={data.title || ''} onChange={(e) => setData({ ...data, title: e.target.value })} />
      </Field>

      <Field label={t('project_description')}>
        <input value={data.description || ''} onChange={(e) => setData({ ...data, description: e.target.value })} placeholder="Short summary" />
      </Field>

      <Field label="Full Description">
        <textarea rows={5} value={data.full_description || ''} onChange={(e) => setData({ ...data, full_description: e.target.value })} />
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
