// The Studio's form primitives.
//
// Four inputs and two wrappers, shared by every section so that a field behaves
// the same way wherever it appears. The old editor grew its own input markup per
// screen and they drifted — different label placement, different counter
// behaviour, two of them with no visible focus ring at all.
//
// ── EVERY FIELD IS LABELLED, AND THE LABEL IS THE LABEL ──────────────────
// Each control is wrapped in a real label element, so the accessible name is the text
// the customer can see and tapping the text focuses the field. Placeholder-as-
// label is not used anywhere: it disappears exactly when someone needs it, and
// it fails every contrast check it is measured against.
//
// ── COUNTERS COUNT DOWN, AND ONLY WHEN THEY MATTER ───────────────────────
// A character counter sitting at "0 / 60" from the moment a screen opens is
// noise. It appears near the limit, which is when it is information.

import { useId } from 'react';
import { pick, setLangValue } from '../../lib/i18n';

/* A group of fields under one heading. The heading is a real <h2> because a
   screen reader user navigates by heading, and the Studio's screens are long
   enough that scrolling past three sections to find "Links" is a genuine cost. */
export function Group({ title, note, children }) {
  return (
    <section className="group">
      {title && <h2>{title}</h2>}
      {note && <p className="note">{note}</p>}
      <div className="fields">{children}</div>
      <style jsx>{`
        .group { margin-bottom: var(--space-6); }
        h2 { margin: 0 0 4px; font-size: var(--text-md); font-weight: 600; }
        .note { margin: 0 0 var(--space-3); font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6; }
        .fields { display: flex; flex-direction: column; gap: var(--space-4); }
      `}</style>
    </section>
  );
}

function Shell({ id, label, hint, error, count, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {/* The error replaces the hint rather than stacking under it: two lines of
          small text under one input is where people stop reading either. */}
      {error
        ? <p className="msg bad" role="alert">{error}</p>
        : hint ? <p className="msg">{hint}</p> : null}
      {count != null && <p className="count">{count}</p>}
      <style jsx>{`
        .field { display: flex; flex-direction: column; gap: 6px; }
        label { font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        .msg { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: 1.6; }
        .msg.bad { color: var(--danger-ink); }
        .count { margin: 0; font-size: var(--text-xs); color: var(--warning-ink); text-align: end; }
      `}</style>
    </div>
  );
}

const inputCss = `
  width: 100%;
  padding: 11px var(--space-3);
  min-block-size: 42px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-input);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-md);
  /* Logical, so an Arabic field aligns to the right without a second rule. */
  text-align: start;
  transition: border-color var(--t-ui) var(--ease);
`;

/* A plain single-language text field. */
export function Text({ label, value, onChange, hint, error, max, placeholder, type = 'text', dir }) {
  const id = useId();
  const v = value == null ? '' : String(value);
  const near = max && v.length > max * 0.8;
  return (
    <Shell id={id} label={label} hint={hint} error={error} count={near ? `${v.length} / ${max}` : null}>
      <input
        id={id}
        type={type}
        value={v}
        dir={dir}
        maxLength={max}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <style jsx>{`
        input { ${inputCss} }
        input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; border-color: var(--border-focus); }
      `}</style>
    </Shell>
  );
}

export function Area({ label, value, onChange, hint, error, max, rows = 4, dir }) {
  const id = useId();
  const v = value == null ? '' : String(value);
  const near = max && v.length > max * 0.8;
  return (
    <Shell id={id} label={label} hint={hint} error={error} count={near ? `${v.length} / ${max}` : null}>
      <textarea
        id={id}
        value={v}
        rows={rows}
        dir={dir}
        maxLength={max}
        aria-invalid={error ? 'true' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <style jsx>{`
        textarea { ${inputCss} resize: vertical; line-height: 1.7; }
        textarea:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; border-color: var(--border-focus); }
      `}</style>
    </Shell>
  );
}

/* A bilingual {ar, en} field, edited in ONE language at a time.
 *
 * WHICH language is the caller's decision, because it is not this component's
 * to make: a portfolio that has not opted into bilingual is edited in its own
 * default language regardless of what the Studio's interface is set to. A
 * client who reads the tool in English still writes an Arabic-only portfolio in
 * Arabic, and asking them for an English bio they never wanted is exactly the
 * "charged a decision they never made" that section-v removed.
 *
 * `dir` follows the CONTENT language, never the interface: an Arabic bio typed
 * into a left-aligned box is the bug this prop exists to prevent. */
export function Bilingual({ label, field, lang, onChange, hint, error, max, area, rows }) {
  const value = pick(field, lang);
  const set = (next) => onChange(setLangValue(field, lang, next));
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const Cmp = area ? Area : Text;
  return <Cmp label={label} value={value} onChange={set} hint={hint} error={error} max={max} rows={rows} dir={dir} />;
}

/* An image field: what is there now, and the two things you can do to it.
 *
 * The file input is CLIPPED rather than hidden — display:none takes it out of
 * the tab order and the control becomes keyboard-unreachable. The label wraps
 * it, so the label is the accessible name and :focus-within is what a keyboard
 * user sees. */
export function Image({ label, value, onChange, onFile, hint, busy, error, ar, round }) {
  return (
    <div className="imgField">
      <p className="lbl">{label}</p>
      <div className="row">
        <span className={round ? 'thumb round' : 'thumb'}>
          {value
            ? <img src={value} alt="" />
            : <span className="none" aria-hidden="true" />}
        </span>
        <div className="acts">
          <label className="up">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onFile(f); }}
            />
            <span>{busy ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : value ? (ar ? 'استبدال' : 'Replace') : (ar ? 'رفع صورة' : 'Upload')}</span>
          </label>
          {value && !busy && (
            <button type="button" className="rm" onClick={() => onChange('')}>
              {ar ? 'إزالة' : 'Remove'}
            </button>
          )}
        </div>
      </div>
      {error ? <p className="msg bad" role="alert">{error}</p> : hint ? <p className="msg">{hint}</p> : null}
      <style jsx>{`
        .imgField { display: flex; flex-direction: column; gap: 6px; }
        .lbl { margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        .row { display: flex; align-items: center; gap: var(--space-3); }
        .thumb {
          flex: none; width: 64px; height: 64px; overflow: hidden;
          border-radius: var(--radius-md); border: 1px solid var(--border-default);
          background: var(--bg-elevated); display: grid; place-items: center;
        }
        .thumb.round { border-radius: 50%; }
        .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .none { width: 18px; height: 18px; border-radius: 4px; background: var(--border-strong); }
        .acts { display: flex; flex-wrap: wrap; gap: 8px; }
        .up {
          display: inline-flex; align-items: center; min-height: 38px; padding: 0 14px;
          border: 1px solid var(--action-secondary-border); border-radius: var(--radius-sm);
          background: var(--action-secondary-bg); color: var(--action-secondary-fg);
          font-size: var(--text-sm); font-weight: 600; cursor: pointer;
        }
        .up:hover { background: var(--action-secondary-bg-hover); }
        .up:focus-within { outline: 2px solid var(--border-focus); outline-offset: 2px; }
                /* CLIPPED, never opacity:0 with pointer-events:none — that is
           invisible AND unreachable, so the control cannot be operated by
           keyboard at all. Clipping keeps it in the tab order; the wrapping
           label is the accessible name and :focus-within is the visible ring. */
        .up input { position: absolute; width: 1px; height: 1px; clip: rect(0, 0, 0, 0); overflow: hidden; }
        .rm {
          min-height: 38px; padding: 0 12px; border: 0; border-radius: var(--radius-sm);
          background: none; color: var(--danger-ink); font: inherit; font-size: var(--text-sm);
          font-weight: 600; cursor: pointer;
        }
        .rm:hover { background: var(--danger-bg); }
        .rm:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .msg { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: 1.6; }
        .msg.bad { color: var(--danger-ink); }
      `}</style>
    </div>
  );
}

/* The save state, in one line, at the bottom of a screen.
 *
 * AUTOSAVE MEANS THERE IS USUALLY NO BUTTON. The customer should not have to
 * think about saving, so the ordinary states are reports rather than controls:
 * "Saving…", then "Saved". A button appears only when something needs a person
 * — a failed write, which autosave deliberately does not retry on its own.
 *
 * FIVE STATES AND NONE OF THEM IS SILENCE. A screen that shows nothing while it
 * writes is the complaint the old editor earned most often: people press again,
 * and the second press is the one that races the first. */
export function SaveRow({ state, error, onRetry, ar }) {
  const said = {
    idle: '',
    dirty: ar ? 'لم يُحفظ بعد…' : 'Not saved yet…',
    saving: ar ? 'جارٍ الحفظ…' : 'Saving…',
    saved: ar ? 'تم الحفظ' : 'Saved',
    error: '',
  }[state];

  return (
    <div className="saveRow" aria-live="polite">
      {state === 'error' ? (
        <span className="bad" role="alert">
          <span className="what">{ar ? 'لم يُحفظ' : 'Not saved'}</span>
          {error && <span className="why">{error}</span>}
          <button type="button" onClick={onRetry}>{ar ? 'إعادة المحاولة' : 'Try again'}</button>
        </span>
      ) : said ? (
        <span className={state === 'saved' ? 'ok' : 'busy'}>
          {state === 'saving' && <span className="spin" aria-hidden="true" />}
          {said}
        </span>
      ) : null}
      <style jsx>{`
        .saveRow {
          position: sticky; inset-block-end: 0;
          display: flex; align-items: center; gap: var(--space-3);
          min-height: 46px; padding: var(--space-2) 0;
          background: linear-gradient(to top, var(--bg-primary) 70%, transparent);
          font-size: var(--text-sm);
        }
        .ok { color: var(--success-ink); }
        .busy { display: inline-flex; align-items: center; gap: 8px; color: var(--text-tertiary); }
        .spin { width: 13px; height: 13px; border-radius: 50%; border: 2px solid var(--border-default);
                border-top-color: var(--text-secondary); animation: sp var(--t-spin) linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
        .bad { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--danger-ink); }
        .why { color: var(--text-secondary); font-size: var(--text-xs); }
        .bad button { border: 0; background: none; color: var(--text-link); font: inherit;
                      font-weight: 600; cursor: pointer; padding: 4px 6px; border-radius: var(--radius-sm); }
        .bad button:hover { background: var(--surface-hover); }
        .bad button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
      `}</style>
    </div>
  );
}
