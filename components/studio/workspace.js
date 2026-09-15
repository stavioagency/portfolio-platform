/* Workspace name, and the getting-started guide.
 *
 * The last two things /admin could do that the Studio could not. Two of the
 * five supposed "tool" gaps turned out not to be gaps at all -- Work already
 * has multi-image galleries and Links already picks icons from the same brand
 * set -- so this is what actually remained.
 *
 * ── THE SLUG IS DELIBERATELY NOT HERE ────────────────────────────────────
 * /admin let the address be edited. It is not offered in the Studio and that
 * is a decision, not an omission: the slug IS every link a client has ever
 * shared -- their bio, their business cards, a client's bookmark -- and
 * changing it breaks all of them silently, with no redirect and no warning to
 * whoever saved it. That is not a self-service action. It stays an owner
 * operation in /console, where the person doing it knows what it costs, and
 * the screen says so rather than quietly lacking a field.
 *
 * Also not ported: /admin's manual image cropper. uploadImage() already
 * compresses and fits an avatar to MAX_AVATAR_DIMENSION on the way up, so the
 * crop it produced is done automatically. A hand-crop is a real feature and it
 * can come back on its own merits; it is not a reason to keep 5,172 lines
 * alive.
 */
import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAutosave } from '../../lib/use-autosave';
import { GUIDE_STEPS, nextStep } from '../../lib/onboarding-guide';

export function Workspace({ ar, tenant, onRenamed, canEdit = true }) {
  const [name, setName] = useState(tenant?.name || '');
  const [said, setSaid] = useState('');

  const saver = useAutosave(useCallback(async (value) => {
    const { error } = await supabase.from('tenants').update({ name: value }).eq('id', tenant.id);
    if (error) throw error;
    if (onRenamed) onRenamed(value);
  }, [tenant, onRenamed]));

  return (
    <section className="ws">
      <h2>{ar ? 'مساحة العمل' : 'Workspace'}</h2>

      <label className="field">
        <span>{ar ? 'اسم المساحة' : 'Workspace name'}</span>
        <input type="text" maxLength={80} value={name} disabled={!canEdit}
               onChange={(e) => { setName(e.target.value); if (canEdit) saver.schedule(e.target.value); }} />
        <span className="hint">
          {ar ? 'للاستخدام الداخلي فقط. لا يظهر للزوّار.' : 'Used internally. Visitors never see it.'}
        </span>
      </label>

      <div className="field">
        <span>{ar ? 'عنوان الصفحة' : 'Page address'}</span>
        <p className="addr" dir="ltr">/{tenant?.slug}</p>
        {/* Stated, not hidden. A missing field reads as something unfinished;
            this says what the rule is and why. */}
        <span className="hint">
          {ar
            ? 'لا يمكن تغييره من هنا: العنوان هو كل رابط شاركته من قبل، وتغييره يكسرها جميعًا دون تحويل. تواصل معنا لتغييره.'
            : 'Not editable here: this address is every link you have ever shared, and changing it breaks all of them with no redirect. Contact us to change it.'}
        </span>
      </div>

      {said && <p className="bad">{said}</p>}

      <style jsx>{`
        .ws { display: flex; flex-direction: column; gap: var(--space-3); }
        h2 { margin: 0; font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
        .field { display: flex; flex-direction: column; gap: 6px; color: var(--text-primary); }
        .field > span:first-child { font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        .hint { color: var(--text-tertiary); font-size: var(--text-xs); line-height: 1.6; }
        .addr { margin: 0; font-size: var(--text-md); font-weight: 600; color: var(--text-primary); }
        input { min-block-size: var(--tap-min); padding: 0 var(--space-3);
                border: 1px solid var(--border-default); border-radius: var(--radius-sm);
                background: var(--surface-input); color: var(--text-primary);
                font: inherit; font-size: var(--field-text-compact); }
        input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .bad { margin: 0; color: var(--danger-ink); font-size: var(--text-sm); }
      `}</style>
    </section>
  );
}

/* The getting-started guide. One step open at a time — the next one that is not
   done — because a checklist that opens all of them is a wall of text, and the
   client only needs to know what to do next. */
export function Guide({ ar, doneMap, onNavigate }) {
  const next = nextStep(doneMap || {});
  const [open, setOpen] = useState(next?.id || null);
  const lang = ar ? 'ar' : 'en';
  const done = doneMap || {};
  const left = GUIDE_STEPS.filter((s) => !done[s.id]).length;

  return (
    <section className="guide">
      <h2>{left === 0
        ? (ar ? 'اكتمل الإعداد' : 'Setup complete')
        : (ar ? 'خطوات البداية' : 'Getting started')}</h2>
      {left === 0 && (
        <p className="hint">{ar ? 'صفحتك جاهزة للنشر.' : 'Your page is ready to publish.'}</p>
      )}
      {left > 0 && (<>
      <p className="hint">
        {ar ? `بقي ${left} من ${GUIDE_STEPS.length}` : `${left} of ${GUIDE_STEPS.length} left`}
      </p>

      {GUIDE_STEPS.map((step) => {
        const isDone = !!done[step.id];
        const isOpen = open === step.id;
        return (
          <div key={step.id} className={isDone ? 'step is-done' : 'step'}>
            <button type="button" className="head" aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : step.id)}>
              <span className="tick" aria-hidden="true">{isDone ? '✓' : '○'}</span>
              <span className="ttl">{step.title[lang]}</span>
            </button>
            {isOpen && (
              <div className="body">
                <p>{step.why[lang]}</p>
                <ol>{(step.how[lang] || []).map((h, i) => <li key={i}>{h}</li>)}</ol>
                {onNavigate && step.tab && (
                  <button type="button" className="go" onClick={() => onNavigate(step.tab)}>
                    {ar ? 'الانتقال' : 'Take me there'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      </>)}
      <style jsx>{`
  .guide { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
  .hint { margin: 0; color: var(--text-tertiary); font-size: var(--text-xs); line-height: 1.6; }
  .step { border: 1px solid var(--border-default); border-radius: var(--radius-md);
          background: var(--surface-card); color: var(--text-primary); overflow: hidden; }
  .step.is-done { opacity: 0.66; }
  .head { display: flex; align-items: center; gap: 10px; inline-size: 100%;
          min-block-size: var(--tap-min); padding: var(--space-3);
          border: 0; background: transparent; color: var(--text-primary);
          font: inherit; font-size: var(--text-sm); font-weight: 600;
          text-align: start; cursor: pointer; }
  .head:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }
  .tick { color: var(--text-tertiary); }
  .ttl { flex: 1; min-inline-size: 0; }
  .body { padding: 0 var(--space-3) var(--space-3); color: var(--text-secondary); }
  .body p { margin: 0 0 8px; font-size: var(--text-sm); line-height: 1.7; }
  .body ol { margin: 0; padding-inline-start: 20px; font-size: var(--text-sm); line-height: 1.8; }
  .go { min-block-size: var(--tap-min); margin-top: 10px; padding: 0 var(--space-3);
        border: 1px solid var(--action-secondary-border); border-radius: var(--radius-sm);
        background: var(--action-secondary-bg); color: var(--action-secondary-fg);
        font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer; }
  .go:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
`}</style>
    </section>
  );
}
