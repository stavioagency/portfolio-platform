/* The last five columns that lived only in /admin.
 *
 * `sections` (what shows at all), `top_ticker`, `footer`, `favicon_url` and
 * `seo`. Porting these is what finally lets the legacy editor be deleted: with
 * Quick Facts already moved, these were the whole remaining gap.
 *
 * Split into two exports rather than one screen because they answer two
 * different questions. PageParts is "what is on my page"; SiteIdentity is "what
 * does my page look like somewhere else" — a browser tab, a search result, a
 * message someone pastes the link into. A client looking for one is never
 * looking for the other.
 */
import { useCallback, useState } from 'react';
import { saveProfile, uploadImage, describeRejection } from '../../lib/studio-data';
import { useAutosave } from '../../lib/use-autosave';
import { supabase } from '../../lib/supabase';
import { offeredLangs, liveLangs } from '../../lib/published-langs';

const bi = (v) => (v && typeof v === 'object' ? v : { ar: '', en: '' });

/* The five toggles, with the labels a client would use for them. `projects` is
   deliberately absent from this list: a portfolio with its work switched off is
   a link page, and turning the work off is what the Work screen's own emptiness
   already expresses. */
const SECTION_KEYS = [
  ['bio', 'النبذة', 'About'],
  ['links', 'الروابط', 'Links'],
  ['custom_fields', 'الحقول الإضافية', 'Extra fields'],
  ['lang_switcher', 'زر تبديل اللغة', 'Language switch'],
];

export function PageParts({ ar, uiLang, tenant, profile, onSaved, canEdit = true }) {
  const [draft, setDraft] = useState(() => ({
    sections: profile?.sections || { bio: true, links: true, custom_fields: true, lang_switcher: true, projects: true },
    top_ticker: profile?.top_ticker || { enabled: false, text: { ar: '', en: '' }, bg_color: '#9FA7FF', text_color: '#0a0a0c', speed: 'medium' },
    footer: profile?.footer || { text: { ar: '', en: '' }, color: 'rgba(var(--on-bg),0.3)' },
  }));

  const saver = useAutosave(useCallback(async (d) => {
    await saveProfile(tenant.id, { sections: d.sections, top_ticker: d.top_ticker, footer: d.footer });
    onSaved({ ...profile, ...d });
  }, [tenant, profile, onSaved]));

  const patch = (u) => {
    if (!canEdit) return;
    setDraft((prev) => { const next = { ...prev, ...u }; saver.schedule(next); return next; });
  };

  // The language the CONTENT is written in, the rule the rest of the Studio
  // follows: a bilingual page edits the language you are reading, a single
  // language page always edits its own.
  const lang = profile?.bilingual ? uiLang : (profile?.default_lang || 'ar');
  const ticker = draft.top_ticker;
  const footer = draft.footer;

  return (
    <section className="bits">
      <h2>{ar ? 'أجزاء الصفحة' : 'Page parts'}</h2>

      <fieldset>
        <legend>{ar ? 'ما يظهر' : 'What shows'}</legend>
        {SECTION_KEYS.map(([key, a, e]) => (
          <label key={key} className="check">
            <input
              type="checkbox" disabled={!canEdit}
              checked={draft.sections?.[key] !== false}
              onChange={(ev) => patch({ sections: { ...draft.sections, [key]: ev.target.checked } })}
            />
            <span>{ar ? a : e}</span>
          </label>
        ))}
      </fieldset>

      {/* Which languages are LIVE, which is not the same as which the client
          writes in. Only shown when there are two to choose between: a control
          offering one option is a control that does nothing. */}
      {offeredLangs(profile).length > 1 && (
        <fieldset>
          <legend>{ar ? 'اللغات المنشورة' : 'Published languages'}</legend>
          <p className="hint">
            {ar
              ? 'يمكن نشر لغة والاحتفاظ بالأخرى قيد الكتابة.'
              : 'You can publish one language while the other is still being written.'}
          </p>
          {offeredLangs(profile).map((code) => {
            const live = liveLangs(profile, tenant);
            const on = live.includes(code);
            const lastOne = on && live.length === 1;
            return (
              <label key={code} className="check">
                <input
                  type="checkbox" checked={on}
                  /* The last live language cannot be switched off: a page in
                     no language is a blank page, and the database ignores such
                     a subset anyway -- so the control says so rather than
                     accepting a click that does nothing. */
                  disabled={!canEdit || lastOne}
                  onChange={(ev) => {
                    const next = ev.target.checked
                      ? [...live, code]
                      : live.filter((l) => l !== code);
                    void supabase.from('tenants')
                      .update({ published_langs: next })
                      .eq('id', tenant.id)
                      .then(() => onSaved({ ...profile }));
                  }}
                />
                <span>{code === 'ar' ? (ar ? 'العربية' : 'Arabic') : (ar ? 'الإنجليزية' : 'English')}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      <fieldset>
        <legend>{ar ? 'الشريط العلوي' : 'Top ticker'}</legend>
        <label className="check">
          <input type="checkbox" checked={!!ticker.enabled} disabled={!canEdit}
                 onChange={(ev) => patch({ top_ticker: { ...ticker, enabled: ev.target.checked } })} />
          <span>{ar ? 'تشغيل الشريط' : 'Show the ticker'}</span>
        </label>
        {ticker.enabled && (
          <>
            <label className="field">
              <span>{ar ? 'النص' : 'Text'}</span>
              <input type="text" maxLength={120} disabled={!canEdit}
                     value={bi(ticker.text)[lang] || ''}
                     onChange={(ev) => patch({ top_ticker: { ...ticker, text: { ...bi(ticker.text), [lang]: ev.target.value } } })} />
            </label>
            <div className="colours">
              <label className="field">
                <span>{ar ? 'الخلفية' : 'Background'}</span>
                <input type="color" value={ticker.bg_color || '#9FA7FF'} disabled={!canEdit}
                       onChange={(ev) => patch({ top_ticker: { ...ticker, bg_color: ev.target.value } })} />
              </label>
              <label className="field">
                <span>{ar ? 'النص' : 'Text'}</span>
                <input type="color" value={ticker.text_color || '#0a0a0c'} disabled={!canEdit}
                       onChange={(ev) => patch({ top_ticker: { ...ticker, text_color: ev.target.value } })} />
              </label>
            </div>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>{ar ? 'التذييل' : 'Footer'}</legend>
        <label className="field">
          <span>{ar ? 'سطر التذييل' : 'Footer line'}</span>
          <input type="text" maxLength={160} disabled={!canEdit}
                 value={bi(footer.text)[lang] || ''}
                 onChange={(ev) => patch({ footer: { ...footer, text: { ...bi(footer.text), [lang]: ev.target.value } } })} />
        </label>
      </fieldset>

      <style jsx>{`
        .bits { display: flex; flex-direction: column; gap: var(--space-4); }
        h2 { margin: 0; font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
        fieldset { margin: 0; padding: var(--space-3); border: 1px solid var(--border-default);
                   border-radius: var(--radius-md); background: var(--surface-card);
                   color: var(--text-primary); display: flex; flex-direction: column; gap: 10px; }
        legend { padding: 0 6px; font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        .check { display: flex; align-items: center; gap: 8px; min-block-size: var(--tap-min);
                 font-size: var(--text-sm); color: var(--text-primary); }
        .field { display: flex; flex-direction: column; gap: 6px; color: var(--text-primary); }
        .field > span { font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary); }
        .colours { display: flex; gap: 12px; }
        input[type='text'] { min-block-size: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--border-default); border-radius: var(--radius-sm);
          background: var(--surface-input); color: var(--text-primary);
          font: inherit; font-size: var(--field-text-compact); }
        input[type='color'] { min-block-size: var(--tap-min); inline-size: 64px;
          border: 1px solid var(--border-default); border-radius: var(--radius-sm);
          background: var(--surface-input); }
        input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
      `}</style>
    </section>
  );
}

export function SiteIdentity({ ar, uiLang, tenant, profile, onSaved, canEdit = true }) {
  const [draft, setDraft] = useState(() => ({
    favicon_url: profile?.favicon_url || '',
    seo: profile?.seo || { title: { ar: '', en: '' }, description: { ar: '', en: '' }, og_image: '' },
  }));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const saver = useAutosave(useCallback(async (d) => {
    await saveProfile(tenant.id, { favicon_url: d.favicon_url, seo: d.seo });
    onSaved({ ...profile, ...d });
  }, [tenant, profile, onSaved]));

  const patch = (u) => {
    if (!canEdit) return;
    setDraft((prev) => { const next = { ...prev, ...u }; saver.schedule(next); return next; });
  };

  const lang = profile?.bilingual ? uiLang : (profile?.default_lang || 'ar');
  const seo = draft.seo;

  async function pick(kind, file) {
    const rejection = describeRejection(file, ar);
    if (rejection) { setErr(rejection); return; }
    setErr(''); setBusy(kind);
    try {
      const url = await uploadImage(tenant.id, kind, file);
      if (kind === 'favicon') patch({ favicon_url: url });
      else patch({ seo: { ...seo, og_image: url } });
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(''); }
  }

  return (
    <section className="ident">
      <h2>{ar ? 'هوية الموقع' : 'Site identity'}</h2>
      <p className="hint">
        {ar
          ? 'ما يظهر في تبويب المتصفح، ونتائج البحث، وعند مشاركة الرابط.'
          : 'What shows in a browser tab, in search results, and when someone shares your link.'}
      </p>

      <label className="field">
        <span>{ar ? 'عنوان الصفحة' : 'Page title'}</span>
        <input type="text" maxLength={70} disabled={!canEdit}
               value={bi(seo.title)[lang] || ''}
               onChange={(e) => patch({ seo: { ...seo, title: { ...bi(seo.title), [lang]: e.target.value } } })} />
      </label>

      <label className="field">
        <span>{ar ? 'الوصف' : 'Description'}</span>
        <textarea rows={3} maxLength={160} disabled={!canEdit}
                  value={bi(seo.description)[lang] || ''}
                  onChange={(e) => patch({ seo: { ...seo, description: { ...bi(seo.description), [lang]: e.target.value } } })} />
      </label>

      <div className="field">
        <span>{ar ? 'أيقونة التبويب' : 'Tab icon'}</span>
        {/* The input is CLIPPED, never hidden: display:none takes it out of the
            tab order, so a keyboard could not reach it at all. The label is the
            accessible name and :focus-within is the visible ring. */}
        <label className="up">
          <input type="file" accept="image/jpeg,image/png,image/webp"
                 disabled={!canEdit || busy === 'favicon'}
                 onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick('favicon', f); }} />
          {busy === 'favicon' ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : (ar ? 'اختيار صورة' : 'Choose an image')}
        </label>
        {draft.favicon_url && <img src={draft.favicon_url} alt="" width={32} height={32} />}
      </div>

      <div className="field">
        <span>{ar ? 'صورة المشاركة' : 'Share image'}</span>
        <label className="up">
          <input type="file" accept="image/jpeg,image/png,image/webp"
                 disabled={!canEdit || busy === 'og'}
                 onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick('og', f); }} />
          {busy === 'og' ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : (ar ? 'اختيار صورة' : 'Choose an image')}
        </label>
        {seo.og_image && <img className="og" src={seo.og_image} alt="" />}
      </div>

      {err && <p className="bad" role="status">{err}</p>}

      <style jsx>{`
        .up { display: inline-flex; align-items: center; justify-content: center;
              min-block-size: var(--tap-min); padding: 0 var(--space-3);
              border: 1px solid var(--action-secondary-border);
              border-radius: var(--radius-sm);
              background: var(--action-secondary-bg); color: var(--action-secondary-fg);
              font-size: var(--text-xs); font-weight: 600; cursor: pointer; }
        .up:focus-within { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        /* Clipped, not hidden: display:none would drop it from the tab order. */
        .up input { position: absolute; width: 1px; height: 1px; clip: rect(0, 0, 0, 0); overflow: hidden; }
        .ident { display: flex; flex-direction: column; gap: var(--space-3); }
        h2 { margin: 0; font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
        .hint { margin: 0; color: var(--text-tertiary); font-size: var(--text-xs); line-height: 1.6; }
        .field { display: flex; flex-direction: column; gap: 6px; color: var(--text-primary); }
        .field > span { font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        input[type='text'], textarea { padding: var(--space-3);
          border: 1px solid var(--border-default); border-radius: var(--radius-sm);
          background: var(--surface-input); color: var(--text-primary);
          font: inherit; font-size: var(--field-text-compact); }
        input[type='text'] { min-block-size: var(--tap-min); padding-block: 0; }
        textarea { min-block-size: 76px; }
        input:focus-visible, textarea:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        img { border-radius: var(--radius-sm); }
        .og { inline-size: 100%; max-inline-size: 320px; block-size: auto; }
        .bad { margin: 0; color: var(--danger-ink); font-size: var(--text-sm); }
      `}</style>
    </section>
  );
}
