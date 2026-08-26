// BilingualField — one control carrying both languages.
//
// Two rules make this more than a text input, and both come from "Arabic is a
// real mode, not a translation layer":
//
// 1. THE LANGUAGE SWITCH LIVES ON THE FIELD, never on the page. A page-level
//    toggle silently changes what you are editing, so a client can type a
//    sentence into the wrong language without ever being told.
//
// 2. TEXT DIRECTION FOLLOWS THE FIELD'S LANGUAGE, NOT THE INTERFACE'S. An
//    Arabic value is right-to-left while the surrounding Studio is in English.
//    This is the whole claim, expressed at the level of a single input: the
//    Arabic half of a portfolio is not an afterthought rendered in an English
//    frame.
//
// The empty second language is shown as a quiet fact, never an error and never
// a blocker on publishing — a portfolio in one language is a valid portfolio.

import { useState } from 'react';
import { pick } from '../../lib/i18n';

export default function BilingualField({
  label,
  value,
  onChange,
  uiLang = 'en',
  multiline = false,
  autoFocus = false,
  placeholder = '',
  // A hard cap, with NO counter. The limit is what stops a field becoming a
  // second paragraph; a "42 / 90" meter would invite filling it, exactly as an
  // image quota would.
  maxLength,
}) {
  // Which half is being edited. Starts on the interface language because that
  // is almost always the one the client is thinking in.
  const [editing, setEditing] = useState(uiLang);

  const current = (value && value[editing]) || '';
  const other = editing === 'ar' ? 'en' : 'ar';
  const otherEmpty = !((value && value[other]) || '').trim();

  const Tag = multiline ? 'textarea' : 'input';

  return (
    <label className="field">
      <span className="row">
        <span className="label">{label}</span>
        <span className="langs" role="group">
          {['ar', 'en'].map((code) => (
            <button
              key={code}
              type="button"
              className={code === editing ? 'on' : ''}
              aria-pressed={code === editing}
              onClick={() => setEditing(code)}
            >
              {code === 'ar' ? 'ع' : 'EN'}
            </button>
          ))}
        </span>
      </span>

      <Tag
        className={multiline ? 'input area' : 'input'}
        value={current}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={multiline ? 4 : undefined}
        maxLength={maxLength}
        // The field's own direction and language — not the interface's.
        dir={editing === 'ar' ? 'rtl' : 'ltr'}
        lang={editing}
        onChange={(e) => onChange(editing, e.target.value)}
      />

      {otherEmpty && (
        <span className="hint">
          {uiLang === 'ar'
            ? (other === 'en' ? 'لا توجد نسخة إنجليزية بعد.' : 'لا توجد نسخة عربية بعد.')
            : (other === 'ar' ? 'No Arabic version yet.' : 'No English version yet.')}
        </span>
      )}

      <style jsx>{`
        .field { display: grid; gap: 6px; }
        .row { display: flex; align-items: center; gap: var(--space-3); }
        .label {
          flex: 1;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .langs {
          display: flex;
          gap: 2px;
          padding: 2px;
          background: var(--bg-primary);
          border-radius: 6px;
        }
        .langs button {
          font: inherit;
          cursor: pointer;
          border: 0;
          background: transparent;
          color: var(--text-tertiary);
          font-size: 11.5px;
          line-height: 1;
          padding: 4px 7px;
          border-radius: 4px;
          transition: background var(--t-ui) var(--ease), color var(--t-ui) var(--ease);
        }
        .langs button.on {
          background: var(--bg-elevated);
          color: var(--text-primary);
          font-weight: 600;
        }
        .input {
          font: inherit;
          font-size: 14px;
          width: 100%;
          color: var(--text-primary);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 9px 11px;
          transition: border-color var(--t-ui) var(--ease),
                      box-shadow var(--t-ui) var(--ease);
        }
        .input:focus {
          outline: none;
          border-color: var(--brand-line);
          box-shadow: 0 0 0 3px var(--brand-focus);
        }
        .area { resize: vertical; min-height: 84px; line-height: 1.5; }
        /* A quiet fact, not a warning. No amber, no icon, no count of
           "incomplete" anything — a portfolio in one language is valid. */
        .hint { font-size: 12px; color: var(--text-tertiary); }
      `}</style>
    </label>
  );
}
