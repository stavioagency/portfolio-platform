// Work — the customer's projects.
//
// The most important editing screen, and the one with the only genuinely
// destructive action in the Studio.
//
// ── DELETING A PROJECT ASKS, AND THE QUESTION NAMES THE THING ────────────
// "Are you sure?" is not a question anybody can answer. The dialog names the
// project and says what will be lost, because the customer deleting "Untitled"
// and the customer deleting three years of work press the same button.
//
// ── ORDER IS THE ORDER VISITORS SEE ──────────────────────────────────────
// display_order is what the public page reads, so reordering here changes the
// page. Moves save immediately rather than waiting for a Save press: a list
// that reorders on screen and reverts on reload is the worst of both, and a
// half-applied order is worse than either.
//
// ── AN IMAGE IS THE PROJECT ──────────────────────────────────────────────
// A project with no image renders as a gap on the public page. The screen says
// so where it can be acted on rather than letting someone discover it after
// publishing.

import { useCallback, useState } from 'react';
import { Button, Icon } from '../ui';
import { Area, Bilingual, Group, Image, SaveRow, Text } from './fields';
import { pick } from '../../lib/i18n';
import {
  createProject, deleteProject, describeRejection, reorderProjects, saveProject, uploadImage,
} from '../../lib/studio-data';

export const MAX_PROJECTS = 12;
export const MAX_GALLERY = 6;

export function Work({ ar, uiLang, tenant, profile, projects, onProjects }) {
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);

  const contentLang = profile?.bilingual ? uiLang : (profile?.default_lang || tenant?.default_lang || 'ar');
  const editing = projects.find((p) => p.id === editingId) || null;

  const add = useCallback(async () => {
    if (projects.length >= MAX_PROJECTS) return;
    setBusy('add'); setError('');
    try {
      const row = await createProject(tenant.id, projects.length);
      onProjects([...projects, row]);
      setEditingId(row.id);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(''); }
  }, [projects, tenant, onProjects]);

  const move = useCallback(async (id, dir) => {
    const i = projects.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= projects.length) return;
    const next = [...projects];
    [next[i], next[j]] = [next[j], next[i]];
    onProjects(next.map((p, k) => ({ ...p, display_order: k })));
    setBusy(`move-${id}`); setError('');
    try { await reorderProjects(next); }
    catch (e) {
      /* Put it back. A list that shows an order the database refused is a lie
         the customer will only discover after publishing. */
      onProjects(projects);
      setError(e?.message || String(e));
    } finally { setBusy(''); }
  }, [projects, onProjects]);

  const doDelete = useCallback(async (project) => {
    setConfirming(null); setBusy(`del-${project.id}`); setError('');
    try {
      await deleteProject(project.id);
      onProjects(projects.filter((p) => p.id !== project.id));
      if (editingId === project.id) setEditingId(null);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(''); }
  }, [projects, onProjects, editingId]);

  if (editing) {
    return (
      <ProjectEditor
        ar={ar} contentLang={contentLang} tenant={tenant} project={editing}
        onBack={() => setEditingId(null)}
        onSaved={(row) => onProjects(projects.map((p) => (p.id === row.id ? row : p)))}
      />
    );
  }

  return (
    <div className="screen">
      <h1>{ar ? 'أعمالي' : 'Work'}</h1>
      <p className="lede">
        {ar ? 'الترتيب هنا هو ما يراه الزائر، والأقوى يأتي أولًا.' : 'The order here is the order visitors see. Put your strongest first.'}
      </p>

      {error && <p className="err" role="alert">{error}</p>}

      {projects.length === 0 ? (
        <div className="empty">
          <p>{ar ? 'لا توجد أعمال بعد.' : 'No projects yet.'}</p>
          <p className="sub">
            {ar ? 'من ثلاثة إلى ستة أعمال تصنع معرضًا. عمل واحد يقرأ كعيّنة.'
                : 'Three to six makes a portfolio. One reads as a sample.'}
          </p>
          <Button onClick={add} disabled={busy === 'add'}>
            {busy === 'add' ? (ar ? 'جارٍ الإضافة…' : 'Adding…') : (ar ? 'إضافة أول عمل' : 'Add your first project')}
          </Button>
        </div>
      ) : (
        <>
          <ul className="list">
            {projects.map((p, i) => {
              const name = pick(p.title, contentLang) || (ar ? 'بلا اسم' : 'Untitled');
              const cover = p.cover_image || (Array.isArray(p.images) && p.images[0]) || '';
              return (
                <li key={p.id}>
                  <span className="thumb">
                    {cover ? <img src={cover} alt="" /> : <Icon name="image" size={18} />}
                  </span>
                  <span className="meta">
                    <span className="nm">{name}</span>
                    {!cover && <span className="warn">{ar ? 'بلا صورة — يظهر فارغًا' : 'No image — shows as a gap'}</span>}
                  </span>
                  <span className="acts">
                    <button type="button" onClick={() => move(p.id, -1)} disabled={i === 0 || Boolean(busy)}>
                      <Icon name="chevron-up" size={15} />
                      <span className="srOnly">{ar ? 'تحريك لأعلى' : 'Move up'}</span>
                    </button>
                    <button type="button" onClick={() => move(p.id, 1)} disabled={i === projects.length - 1 || Boolean(busy)}>
                      <Icon name="chevron-down" size={15} />
                      <span className="srOnly">{ar ? 'تحريك لأسفل' : 'Move down'}</span>
                    </button>
                    <button type="button" onClick={() => setEditingId(p.id)}>{ar ? 'تحرير' : 'Edit'}</button>
                    <button type="button" className="danger" onClick={() => setConfirming(p)} disabled={Boolean(busy)}>
                      <Icon name="trash" size={15} />
                      <span className="srOnly">{ar ? 'حذف' : 'Delete'}</span>
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {projects.length < MAX_PROJECTS ? (
            <Button variant="ghost" onClick={add} disabled={busy === 'add'}>
              {ar ? 'إضافة عمل' : 'Add a project'}
            </Button>
          ) : (
            <p className="cap">
              {ar ? `الحد ${MAX_PROJECTS} أعمال — وهو أكثر مما يتصفّحه أي زائر.`
                  : `${MAX_PROJECTS} is the limit — more than any visitor scrolls through.`}
            </p>
          )}
        </>
      )}

      {confirming && (
        <ConfirmDelete
          ar={ar}
          name={pick(confirming.title, contentLang)}
          imageCount={(confirming.images || []).length + (confirming.cover_image ? 1 : 0)}
          onCancel={() => setConfirming(null)}
          onConfirm={() => doDelete(confirming)}
        />
      )}

      <style jsx>{`
        .screen { max-width: 720px; }
        h1 { margin: 0 0 4px; font-size: var(--text-2xl); font-family: var(--font-heading); }
        .lede { margin: 0 0 var(--space-5); color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.7; }
        .err { margin: 0 0 var(--space-4); padding: 10px var(--space-3); border-radius: var(--radius-md);
               background: var(--danger-bg); color: var(--danger-ink); font-size: var(--text-sm); }
        .empty { border: 1px dashed var(--border-strong); border-radius: var(--radius-lg);
                 padding: var(--space-6) var(--space-4); text-align: center;
                 display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .empty p { margin: 0; font-size: var(--text-md); }
        .empty .sub { color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-3); line-height: 1.7; }
        .list { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .list li { display: flex; align-items: center; gap: var(--space-3);
                   padding: 10px; border: 1px solid var(--border-default);
                   border-radius: var(--radius-md); background: var(--surface-card); }
        .thumb { flex: none; width: 48px; height: 48px; border-radius: var(--radius-sm);
                 overflow: hidden; background: var(--bg-elevated); display: grid;
                 place-items: center; color: var(--text-tertiary); }
        .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .nm { font-size: var(--text-sm); font-weight: 600; overflow: hidden;
              text-overflow: ellipsis; white-space: nowrap; }
        .warn { font-size: var(--text-xs); color: var(--warning-ink); }
        .acts { display: flex; align-items: center; gap: 2px; flex: none; }
        .acts button { min-width: 34px; min-height: 34px; padding: 0 8px; border: 0;
                       border-radius: var(--radius-sm); background: none;
                       color: var(--text-secondary); font: inherit; font-size: var(--text-xs);
                       cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .acts button:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
        .acts button:disabled { opacity: 0.35; cursor: default; }
        .acts button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .acts .danger:hover:not(:disabled) { background: var(--danger-bg); color: var(--danger-ink); }
        .cap { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }
        .srOnly { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
                  border: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
      `}</style>
    </div>
  );
}

/* The question names the project and says what goes with it. A customer
   deleting a placeholder and a customer deleting three years of work press the
   same button, and only one of them can afford a vague dialog. */
function ConfirmDelete({ ar, name, imageCount, onCancel, onConfirm }) {
  return (
    <div className="wrap" role="dialog" aria-modal="true" aria-labelledby="delTitle">
      <div className="box">
        <h2 id="delTitle">{ar ? 'حذف هذا العمل؟' : 'Delete this project?'}</h2>
        <p>
          {name
            ? (ar ? `سيُحذف «${name}» من معرضك.` : `“${name}” will be removed from your portfolio.`)
            : (ar ? 'سيُحذف هذا العمل من معرضك.' : 'This project will be removed from your portfolio.')}
          {imageCount > 0 && ' '}
          {imageCount > 0 && (ar
            ? `ومعه ${imageCount} من الصور.`
            : `Its ${imageCount} image${imageCount === 1 ? '' : 's'} go with it.`)}
        </p>
        <p className="final">{ar ? 'لا يمكن التراجع عن هذا.' : 'This cannot be undone.'}</p>
        <div className="acts">
          <button type="button" className="keep" onClick={onCancel}>{ar ? 'إبقاء' : 'Keep'}</button>
          <button type="button" className="go" onClick={onConfirm}>{ar ? 'حذف' : 'Delete'}</button>
        </div>
      </div>
      <style jsx>{`
        .wrap { position: fixed; inset: 0; z-index: var(--z-modal); background: rgba(0,0,0,0.55);
                display: grid; place-items: center; padding: var(--gutter); }
        .box { width: 100%; max-width: 420px; background: var(--surface-elevated);
               border-radius: var(--radius-lg); padding: var(--space-5); }
        h2 { margin: 0 0 var(--space-3); font-size: var(--text-lg); }
        p { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.7; }
        .final { color: var(--danger-ink); margin-bottom: var(--space-4); }
        .acts { display: flex; gap: 8px; justify-content: flex-end; }
        .acts button { min-height: 42px; padding: 0 var(--space-4); border-radius: var(--radius-md);
                       font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
        .keep { border: 1px solid var(--action-secondary-border); background: var(--action-secondary-bg);
                color: var(--action-secondary-fg); }
        .go { border: 0; background: var(--action-danger-bg); color: var(--action-danger-fg); }
        .acts button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
      `}</style>
    </div>
  );
}

function ProjectEditor({ ar, contentLang, tenant, project, onBack, onSaved }) {
  const [draft, setDraft] = useState(() => ({
    title: project.title || { ar: '', en: '' },
    description: project.description || { ar: '', en: '' },
    external_url: project.external_url || '',
    cover_image: project.cover_image || '',
    images: Array.isArray(project.images) ? project.images : [],
  }));
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [imgError, setImgError] = useState('');

  const patch = (u) => { setDraft((p) => ({ ...p, ...u })); setDirty(true); setState('idle'); };

  async function upload(kind, file, apply) {
    const rejection = describeRejection(file, ar);
    if (rejection) { setImgError(rejection); return; }
    setImgError(''); setBusy(kind);
    try { apply(await uploadImage(tenant.id, `project-${project.id}-${kind}`, file)); }
    catch (e) { setImgError(e?.message || String(e)); }
    finally { setBusy(''); }
  }

  async function save() {
    setState('saving'); setError('');
    try {
      await saveProject(project.id, draft);
      onSaved({ ...project, ...draft });
      setDirty(false); setState('saved');
    } catch (e) { setError(e?.message || String(e)); setState('error'); }
  }

  return (
    <div className="screen">
      <button type="button" className="back" onClick={onBack}>
        <Icon name="chevron-left" size={16} mirror />
        {ar ? 'كل الأعمال' : 'All work'}
      </button>

      <h1>{pick(draft.title, contentLang) || (ar ? 'عمل جديد' : 'New project')}</h1>

      <Group title={ar ? 'الصورة الرئيسية' : 'Cover image'}
             note={ar ? 'أول ما يراه الزائر. بدونها يظهر العمل فارغًا.'
                      : 'The first thing a visitor sees. Without it the project shows as a gap.'}>
        <Image
          label={ar ? 'الغلاف' : 'Cover'}
          value={draft.cover_image}
          onChange={(v) => patch({ cover_image: v })}
          onFile={(f) => upload('cover', f, (url) => patch({ cover_image: url }))}
          busy={busy === 'cover'}
          error={imgError}
          ar={ar}
          hint={ar ? 'JPG أو PNG أو WebP، حتى ٨ ميغابايت.' : 'JPG, PNG or WebP, up to 8MB.'}
        />
      </Group>

      <Group title={ar ? 'التفاصيل' : 'Details'}>
        <Bilingual label={ar ? 'اسم العمل' : 'Title'} field={draft.title} lang={contentLang}
                   max={70} onChange={(v) => patch({ title: v })} />
        <Bilingual label={ar ? 'الوصف' : 'Description'} field={draft.description} lang={contentLang}
                   max={400} area rows={4} onChange={(v) => patch({ description: v })}
                   hint={ar ? 'ما هو، ولمن، وما الذي حللته.' : 'What it is, who it was for, what you solved.'} />
        <Text label={ar ? 'رابط خارجي' : 'External link'} value={draft.external_url}
              onChange={(v) => patch({ external_url: v })} dir="ltr" placeholder="https://"
              hint={ar ? 'اختياري — بيهانس أو موقع العميل.' : 'Optional — Behance, or the client’s site.'} />
      </Group>

      <Group title={ar ? 'صور إضافية' : 'More images'}
             note={ar ? `حتى ${MAX_GALLERY} صور.` : `Up to ${MAX_GALLERY}.`}>
        <ul className="gallery">
          {draft.images.map((src, i) => (
            <li key={`${src}-${i}`}>
              <img src={src} alt="" />
              <button type="button" onClick={() => patch({ images: draft.images.filter((_, k) => k !== i) })}>
                <Icon name="close" size={14} />
                <span className="srOnly">{ar ? 'إزالة الصورة' : 'Remove image'}</span>
              </button>
            </li>
          ))}
        </ul>
        {draft.images.length < MAX_GALLERY && (
          <label className="add">
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy === 'gallery'}
                   onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) upload('gallery', f, (url) => patch({ images: [...draft.images, url] })); }} />
            <span>{busy === 'gallery' ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : (ar ? 'إضافة صورة' : 'Add an image')}</span>
          </label>
        )}
      </Group>

      <SaveRow state={state} error={error} dirty={dirty} onSave={save} onRetry={save} ar={ar} />

      <style jsx>{`
        .screen { max-width: 620px; }
        .back { display: inline-flex; align-items: center; gap: 6px; margin-bottom: var(--space-3);
                padding: 6px 10px 6px 6px; border: 0; background: none; color: var(--text-secondary);
                font: inherit; font-size: var(--text-sm); cursor: pointer; border-radius: var(--radius-sm); }
        .back:hover { background: var(--surface-hover); color: var(--text-primary); }
        .back:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        h1 { margin: 0 0 var(--space-5); font-size: var(--text-2xl); font-family: var(--font-heading); }
        .gallery { list-style: none; margin: 0 0 var(--space-3); padding: 0;
                   display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
        .gallery li { position: relative; aspect-ratio: 4 / 3; border-radius: var(--radius-md);
                      overflow: hidden; border: 1px solid var(--border-default); }
        .gallery img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .gallery button { position: absolute; inset-block-start: 4px; inset-inline-end: 4px;
                          width: 26px; height: 26px; display: grid; place-items: center;
                          border: 0; border-radius: 50%; background: rgba(0,0,0,0.6);
                          color: #fff; cursor: pointer; }
        .gallery button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .add { display: inline-flex; align-items: center; min-height: 40px; padding: 0 var(--space-4);
               border: 1px solid var(--action-secondary-border); border-radius: var(--radius-md);
               background: var(--action-secondary-bg); color: var(--action-secondary-fg);
               font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
        .add:focus-within { outline: 2px solid var(--border-focus); outline-offset: 2px; }
                /* CLIPPED, never opacity:0 with pointer-events:none — that is
           invisible AND unreachable, so the control cannot be operated by
           keyboard at all. Clipping keeps it in the tab order; the wrapping
           label is the accessible name and :focus-within is the visible ring. */
        .add input { position: absolute; width: 1px; height: 1px; clip: rect(0, 0, 0, 0); overflow: hidden; }
        .srOnly { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
                  border: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
      `}</style>
    </div>
  );
}
