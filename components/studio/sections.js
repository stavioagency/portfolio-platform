// The Studio's four editing screens: Profile, Work, Appearance, Links.
//
// They share one shape. Each holds a local draft, marks itself dirty on change,
// and writes only the fields it owns through lib/studio-data — never the whole
// row, so two screens cannot overwrite each other with a stale copy of the rest.
//
// ── THE CONTENT LANGUAGE IS NOT THE INTERFACE LANGUAGE ───────────────────
// A portfolio that has not opted into bilingual is written in its OWN default
// language whatever the Studio is set to. Someone reading the tool in English
// still writes an Arabic-only portfolio in Arabic; asking them for an English
// bio they never wanted is the decision section-v removed from the product.
//
// ── NOTHING IS DELETED TO MAKE A SCREEN SIMPLER ──────────────────────────
// Turning bilingual off hides the second language; it does not clear it. The
// text stays in the row and comes back the moment it is turned on again, and
// the screen says so, because "will this delete my Arabic?" is the first thing
// anyone sensibly asks before pressing it.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Icon } from '../ui';
import { Area, Bilingual, Group, Image, SaveRow, Text } from './fields';
import { pick } from '../../lib/i18n';
import { ACCENTS, accentPatch, currentAccent } from '../../lib/studio-appearance';
import {
  createProject, deleteProject as removeProject, describeRejection,
  reorderProjects, saveProfile, saveProject, uploadImage,
} from '../../lib/studio-data';

/* Shared save behaviour. Kept here rather than in each screen because the
   error path is the part that gets forgotten, and forgetting it once means a
   customer believes work was saved that was not. */
function useSaver(save) {
  const [state, setState] = useState('idle');   // idle | saving | saved | error
  const [error, setError] = useState('');
  const run = useCallback(async (payload) => {
    setState('saving'); setError('');
    try { await save(payload); setState('saved'); return true; }
    catch (e) { setError(e?.message || String(e)); setState('error'); return false; }
  }, [save]);
  return { state, error, run, reset: () => { setState('idle'); setError(''); } };
}

/* ── PROFILE ─────────────────────────────────────────────────────────── */

export function Profile({ ar, uiLang, tenant, profile, onSaved }) {
  const [draft, setDraft] = useState(() => ({
    name: profile?.name || { ar: '', en: '' },
    tagline: profile?.tagline || { ar: '', en: '' },
    bio: profile?.bio || { ar: '', en: '' },
    profile_image: profile?.profile_image || '',
    bilingual: profile?.bilingual === true,
    default_lang: profile?.default_lang || tenant?.default_lang || 'ar',
  }));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgError, setImgError] = useState('');

  const saver = useSaver(async (d) => {
    await saveProfile(tenant.id, {
      name: d.name, tagline: d.tagline, bio: d.bio,
      profile_image: d.profile_image, bilingual: d.bilingual, default_lang: d.default_lang,
    });
    onSaved({ ...profile, ...d });
  });

  const patch = (u) => { setDraft((p) => ({ ...p, ...u })); setDirty(true); saver.reset(); };

  /* The language the CONTENT is written in — the rule /admin already follows. */
  const contentLang = draft.bilingual ? uiLang : draft.default_lang;

  async function onImage(file) {
    const rejection = describeRejection(file, ar);
    if (rejection) { setImgError(rejection); return; }
    setImgError(''); setBusy(true);
    try { patch({ profile_image: await uploadImage(tenant.id, 'profile', file, { avatar: true }) }); }
    catch (e) { setImgError(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  const save = async () => { if (await saver.run(draft)) setDirty(false); };

  return (
    <div className="screen">
      <h1>{ar ? 'التعريف' : 'Profile'}</h1>
      <p className="lede">
        {ar ? 'من أنت وماذا تعمل. هذا أول ما يقرأه الزائر.' : 'Who you are and what you do. This is the first thing a visitor reads.'}
      </p>

      <Group title={ar ? 'لغة المحتوى' : 'Content language'}
             note={ar
               ? 'اختيار لغتين يعني كتابة كل حقل مرتين، ويظهر للزائر مبدّل لغة.'
               : 'Choosing two languages means writing every field twice, and gives visitors a language switch.'}>
        <div className="langPick" role="radiogroup" aria-label={ar ? 'لغة المحتوى' : 'Content language'}>
          {[
            { id: 'ar', label: ar ? 'العربية فقط' : 'Arabic only' },
            { id: 'en', label: ar ? 'الإنجليزية فقط' : 'English only' },
            { id: 'both', label: ar ? 'اللغتان' : 'Both' },
          ].map((opt) => {
            const on = opt.id === 'both' ? draft.bilingual : (!draft.bilingual && draft.default_lang === opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={on ? 'opt on' : 'opt'}
                onClick={() => patch(opt.id === 'both'
                  ? { bilingual: true }
                  : { bilingual: false, default_lang: opt.id })}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {/* The question everybody asks before pressing it. */}
        <p className="reassure">
          {ar
            ? 'تغيير هذا لا يحذف أي نص كتبته — النص المخفي يعود عند إعادة التفعيل.'
            : 'Changing this deletes nothing you have written — hidden text returns if you switch back.'}
        </p>
      </Group>

      <Group title={ar ? 'من أنت' : 'Who you are'}>
        <Image
          label={ar ? 'صورتك' : 'Your picture'}
          value={draft.profile_image}
          onChange={(v) => patch({ profile_image: v })}
          onFile={onImage}
          busy={busy}
          error={imgError}
          ar={ar}
          round
          hint={ar ? 'JPG أو PNG أو WebP، حتى ٨ ميغابايت.' : 'JPG, PNG or WebP, up to 8MB.'}
        />
        <Bilingual
          label={ar ? 'الاسم' : 'Name'}
          field={draft.name} lang={contentLang} max={60}
          onChange={(v) => patch({ name: v })}
          hint={ar ? 'بدون اسم لا تظهر الصفحة إطلاقًا.' : 'Without a name the page does not render at all.'}
        />
        <Bilingual
          label={ar ? 'المسمّى المهني' : 'What you do'}
          field={draft.tagline} lang={contentLang} max={80}
          onChange={(v) => patch({ tagline: v })}
          hint={ar ? 'سطر واحد: «مصمم هويات» أو «مصور أعراس».' : 'One line: “Identity designer”, “Wedding photographer”.'}
        />
        <Bilingual
          label={ar ? 'نبذة' : 'About you'}
          field={draft.bio} lang={contentLang} max={400} area rows={5}
          onChange={(v) => patch({ bio: v })}
          hint={ar ? 'سطران أو ثلاثة. يقرؤها الزائر بعد أن يرى أعمالك.' : 'Two or three lines. A visitor reads this after seeing your work.'}
        />
      </Group>

      <SaveRow state={saver.state} error={saver.error} dirty={dirty} onSave={save} onRetry={save} ar={ar} />

      <style jsx>{`
        .screen { max-width: 620px; }
        h1 { margin: 0 0 4px; font-size: var(--text-2xl); font-family: var(--font-heading); }
        .lede { margin: 0 0 var(--space-5); color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.7; }
        .langPick { display: flex; flex-wrap: wrap; gap: 8px; }
        .opt {
          min-height: 40px; padding: 0 var(--space-4);
          border: 1px solid var(--border-default); border-radius: var(--radius-md);
          background: var(--surface-card); color: var(--text-secondary);
          font: inherit; font-size: var(--text-sm); cursor: pointer;
        }
        .opt.on { background: var(--brand-soft); border-color: var(--brand-line); color: var(--text-primary); font-weight: 600; }
        .opt:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .reassure { margin: var(--space-2) 0 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: 1.6; }
      `}</style>
    </div>
  );
}

/* ── APPEARANCE ──────────────────────────────────────────────────────── */

export function Appearance({ ar, tenant, profile, onSaved }) {
  const initial = useMemo(() => currentAccent(profile?.appearance), [profile]);
  const [picked, setPicked] = useState(initial.id);
  const [dirty, setDirty] = useState(false);

  const saver = useSaver(async (id) => {
    const next = accentPatch(profile?.appearance, id);
    if (!next) throw new Error('Unknown colour');
    await saveProfile(tenant.id, { appearance: next });
    onSaved({ ...profile, appearance: next });
  });

  const save = async () => { if (await saver.run(picked)) setDirty(false); };

  return (
    <div className="screen">
      <h1>{ar ? 'المظهر' : 'Appearance'}</h1>
      <p className="lede">
        {ar
          ? 'التخطيط والمسافات والخطوط من تصميم ديزايناكم، واللون لك. هذا يبقي كل معرض مرتبًا مهما كان الاختيار.'
          : 'Designakum owns the layout, spacing and type. The colour is yours. That is what keeps every portfolio tidy whatever you pick.'}
      </p>

      <Group title={ar ? 'لون التمييز' : 'Accent colour'}
             note={ar
               ? 'يُستخدم في الأزرار والروابط والتفاصيل المميّزة في صفحتك.'
               : 'Used for buttons, links and the highlighted details on your page.'}>
        <div className="swatches" role="radiogroup" aria-label={ar ? 'لون التمييز' : 'Accent colour'}>
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={picked === a.id}
              className={picked === a.id ? 'sw on' : 'sw'}
              onClick={() => { setPicked(a.id); setDirty(true); saver.reset(); }}
            >
              <span className="dot" style={{ background: a.hex }} aria-hidden="true">
                {picked === a.id && <Icon name="check" size={14} />}
              </span>
              <span className="nm">{pick(a.label, ar ? 'ar' : 'en')}</span>
            </button>
          ))}
        </div>

        {/* A colour saved before this list existed is not silently reassigned to
            one of ours — the customer is told what they have and chooses. */}
        {!initial.unset && !initial.known && (
          <p className="custom">
            {ar
              ? `لونك الحالي (${initial.hex}) لم يعد ضمن الألوان المتاحة. اختيار لون جديد سيستبدله.`
              : `Your current colour (${initial.hex}) is no longer on the list. Picking a new one replaces it.`}
          </p>
        )}
      </Group>

      <SaveRow state={saver.state} error={saver.error} dirty={dirty && Boolean(picked)} onSave={save} onRetry={save} ar={ar} />

      <style jsx>{`
        .screen { max-width: 620px; }
        h1 { margin: 0 0 4px; font-size: var(--text-2xl); font-family: var(--font-heading); }
        .lede { margin: 0 0 var(--space-5); color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.7; }
        .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
        .sw {
          display: flex; align-items: center; gap: var(--space-3);
          min-height: 46px; padding: 0 var(--space-3);
          border: 1px solid var(--border-default); border-radius: var(--radius-md);
          background: var(--surface-card); color: var(--text-secondary);
          font: inherit; font-size: var(--text-sm); text-align: start; cursor: pointer;
        }
        .sw.on { border-color: var(--brand-line); background: var(--brand-soft); color: var(--text-primary); font-weight: 600; }
        .sw:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .dot { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
        .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .custom { margin: var(--space-3) 0 0; font-size: var(--text-xs); color: var(--warning-ink); line-height: 1.6; }
      `}</style>
    </div>
  );
}

/* ── LINKS ───────────────────────────────────────────────────────────── */

/* The platforms offered. Every one is a key lib/brand-icons.js already draws,
   so a link the customer adds gets a recognisable mark on their page rather
   than a generic chain. */
export const LINK_KINDS = [
  { id: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/9665…' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { id: 'x', label: 'X', placeholder: 'https://x.com/…' },
  { id: 'telegram', label: 'Telegram', placeholder: 'https://t.me/…' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/…' },
  { id: 'behance', label: 'Behance', placeholder: 'https://behance.net/…' },
  { id: 'dribbble', label: 'Dribbble', placeholder: 'https://dribbble.com/…' },
  { id: 'github', label: 'GitHub', placeholder: 'https://github.com/…' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@…' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…' },
  { id: 'email', label: 'Email', placeholder: 'you@example.com' },
  { id: 'website', label: 'Website', placeholder: 'https://…' },
];

export const MAX_LINKS = 8;

export function Links({ ar, tenant, profile, onSaved }) {
  const [rows, setRows] = useState(() =>
    (Array.isArray(profile?.custom_links) ? profile.custom_links : [])
      .map((l, i) => ({ key: `k${i}`, icon: l.icon || '', href: l.href || '' })));
  const [dirty, setDirty] = useState(false);

  const saver = useSaver(async (list) => {
    /* Only rows with a destination are written. An empty row is someone who
       started and changed their mind, not a link, and a blank entry on a public
       page is an invisible target a visitor can press by accident. */
    const clean = list.filter((r) => r.icon && r.href.trim())
      .map((r) => ({ icon: r.icon, href: r.href.trim(), label: '' }));
    await saveProfile(tenant.id, { custom_links: clean });
    onSaved({ ...profile, custom_links: clean });
  });

  const patch = (next) => { setRows(next); setDirty(true); saver.reset(); };
  const add = () => { if (rows.length < MAX_LINKS) patch([...rows, { key: `k${Date.now()}`, icon: 'whatsapp', href: '' }]); };
  const set = (key, u) => patch(rows.map((r) => (r.key === key ? { ...r, ...u } : r)));
  const drop = (key) => patch(rows.filter((r) => r.key !== key));

  const save = async () => { if (await saver.run(rows)) setDirty(false); };

  return (
    <div className="screen">
      <h1>{ar ? 'التواصل' : 'Links'}</h1>
      <p className="lede">
        {ar ? 'أين يمكن للناس أن يجدوك. ما تتركه فارغًا لا يظهر.' : 'Where people can find you. Anything you leave empty does not appear.'}
      </p>

      {rows.length === 0 ? (
        <div className="empty">
          <p>{ar ? 'لا توجد روابط بعد.' : 'No links yet.'}</p>
          <p className="sub">{ar ? 'رابط واحد يكفي للبداية.' : 'One is enough to start.'}</p>
          <Button onClick={add}>{ar ? 'إضافة رابط' : 'Add a link'}</Button>
        </div>
      ) : (
        <>
          <ul className="rows">
            {rows.map((r) => (
              <li key={r.key}>
                <label className="pick">
                  <span className="srOnly">{ar ? 'المنصّة' : 'Platform'}</span>
                  <select value={r.icon} onChange={(e) => set(r.key, { icon: e.target.value })}>
                    {LINK_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </label>
                <label className="dest">
                  <span className="srOnly">{ar ? 'الرابط' : 'Destination'}</span>
                  <input
                    type="text" dir="ltr" value={r.href}
                    placeholder={(LINK_KINDS.find((k) => k.id === r.icon) || {}).placeholder || ''}
                    onChange={(e) => set(r.key, { href: e.target.value })}
                  />
                </label>
                <button type="button" className="del" onClick={() => drop(r.key)}>
                  <Icon name="close" size={16} />
                  <span className="srOnly">{ar ? 'حذف الرابط' : 'Remove link'}</span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length < MAX_LINKS && (
            <Button variant="ghost" onClick={add}>{ar ? 'إضافة رابط' : 'Add a link'}</Button>
          )}
          {rows.length >= MAX_LINKS && (
            <p className="cap">{ar ? `الحد ${MAX_LINKS} روابط.` : `${MAX_LINKS} is the limit.`}</p>
          )}
        </>
      )}

      <SaveRow state={saver.state} error={saver.error} dirty={dirty} onSave={save} onRetry={save} ar={ar} />

      <style jsx>{`
        .screen { max-width: 620px; }
        h1 { margin: 0 0 4px; font-size: var(--text-2xl); font-family: var(--font-heading); }
        .lede { margin: 0 0 var(--space-5); color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.7; }
        .empty { border: 1px dashed var(--border-strong); border-radius: var(--radius-lg);
                 padding: var(--space-6) var(--space-4); text-align: center;
                 display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .empty p { margin: 0; font-size: var(--text-md); }
        .empty .sub { color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-3); }
        .rows { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .rows li { display: flex; gap: 8px; align-items: center; }
        .pick { flex: none; }
        .dest { flex: 1; min-width: 0; }
        select, input {
          width: 100%; min-block-size: 42px; padding: 0 var(--space-3);
          border: 1px solid var(--border-default); border-radius: var(--radius-md);
          background: var(--surface-input); color: var(--text-primary);
          font: inherit; font-size: var(--text-sm);
        }
        select { min-width: 120px; }
        select:focus-visible, input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .del { flex: none; width: 38px; height: 38px; display: grid; place-items: center;
               border: 0; border-radius: var(--radius-sm); background: none;
               color: var(--text-tertiary); cursor: pointer; }
        .del:hover { background: var(--danger-bg); color: var(--danger-ink); }
        .del:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .cap { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }
        .srOnly { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
                  border: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
      `}</style>
    </div>
  );
}
