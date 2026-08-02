// CredentialsHandoff — the one screen that hands a workspace to its client.
//
// WHY A SHARED COMPONENT: this panel existed twice, once after "Add client" and
// once after "Reset password", as two near-identical inline blocks that had
// already drifted (one showed the email, the other did not). Both now render
// this, so a fix lands in both places and the two flows say the same thing.
//
// WHY A MODAL: it used to be a block appended below a long form. On a laptop the
// password could render below the fold, and it shared the page with the form
// that produced it, so it read as a side note rather than the one artefact of
// the whole operation. A modal cannot be scrolled past.
//
// THE POINT: the password is generated server-side, shown once, and never
// stored. Every route out of here — clipboard, WhatsApp, email, file — carries
// the same text from lib/credentials.js. Email is one of them, not the channel
// the workspace depends on.

import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from './ui';
import {
  credentialsText,
  whatsappMessage,
  mailtoLink,
  credentialsFilename,
} from '../lib/credentials';

// Clipboard writes reject on an insecure origin or without a user gesture. The
// values are all on screen and selectable, so a failure degrades to "select it
// by hand" rather than to a lost password.
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    return false;
  }
}

function CopyButton({ value, label, ar }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!value) return null;
  return (
    <button
      type="button"
      className={`ch-copy ${done ? 'done' : ''}`}
      title={label}
      aria-label={label}
      onClick={async () => {
        if (!(await copy(value))) return;
        setDone(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1800);
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={14} />
      <span className="ch-sr">{done ? (ar ? 'تم النسخ' : 'Copied') : label}</span>
      {/* styled-jsx scopes a <style jsx> block to the JSX of the component it is
          written in. These styles therefore live HERE, next to the markup they
          style — putting them in the parent silently matched nothing, which
          left the copy button unstyled and this label visible on screen. */}
      <style jsx>{`
        .ch-copy {
          flex: 0 0 30px; width: 30px; height: 30px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--bg-hover);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          cursor: pointer;
          transition: var(--transition);
        }
        .ch-copy:hover { color: var(--text-primary); border-color: var(--border-strong); }
        .ch-copy.done { color: var(--success); border-color: var(--success-border); background: var(--success-bg); }
        .ch-copy:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .ch-sr {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
      `}</style>
    </button>
  );
}

function Row({ label, value, mono = false, ar }) {
  if (!value) return null;
  return (
    <div className="ch-row">
      <span className="ch-key">{label}</span>
      <code className={mono ? 'mono' : ''} dir="ltr">{value}</code>
      <CopyButton value={value} label={`${ar ? 'نسخ' : 'Copy'} ${label}`} ar={ar} />
      <style jsx>{`
        .ch-row {
          display: flex; align-items: center; gap: var(--space-3);
          padding: 10px var(--space-3);
          background: var(--bg-elevated);
          border-bottom: 1px solid var(--border);
        }
        .ch-row:last-child { border-bottom: none; }
        .ch-key { flex: 0 0 33%; font-size: var(--text-sm); color: var(--text-tertiary); }
        .ch-row code {
          flex: 1; min-width: 0;
          font-family: inherit; font-size: var(--text-md); color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          text-align: start;
          user-select: all;
        }
        .ch-row code.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.02em; }
        @media (max-width: 640px) { .ch-key { flex-basis: 40%; } }
      `}</style>
    </div>
  );
}

export default function CredentialsHandoff({ creds, lang = 'en', title, intro, onClose }) {
  const ar = lang === 'ar';
  // Whether the admin has taken the credentials out of this screen by ANY route.
  // Closing before that is the failure this whole feature exists to prevent, so
  // it asks first.
  const [delivered, setDelivered] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') e.preventDefault(); } // no accidental dismissal
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Focus the dialog itself rather than a control — Button is a plain
    // function component, so a ref on it would neither work nor be silent.
    modalRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);

  if (!creds) return null;

  const allText = credentialsText(creds, lang);
  const waText = whatsappMessage(creds, lang);

  function markDelivered() { setDelivered(true); }

  async function copyAll() {
    if (!(await copy(allText))) return;
    setCopiedAll(true);
    markDelivered();
    setTimeout(() => setCopiedAll(false), 1800);
  }

  // A .txt rather than a PDF: a real PDF needs a rendering library, and this
  // repo runs on five runtime dependencies. Plain text opens everywhere, is
  // searchable, and carries exactly the same content.
  function download() {
    try {
      const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = credentialsFilename(creds);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      markDelivered();
    } catch (err) {
      console.error('[handoff] download failed:', err);
    }
  }

  function requestClose() {
    if (delivered) { onClose(); return; }
    const ok = window.confirm(ar
      ? 'لم تنسخ بيانات الدخول بعد. كلمة المرور لن تظهر مرة أخرى — هل تريد الإغلاق؟'
      : "You haven't copied the credentials yet. The password is not shown again — close anyway?");
    if (ok) onClose();
  }

  return (
    <div className="ch-bg" role="dialog" aria-modal="true" aria-label={title} dir={ar ? 'rtl' : 'ltr'}>
      <div className="ch-modal" ref={modalRef} tabIndex={-1}>
        <div className="ch-head">
          <div className="ch-head-text">
            <h2>{title}</h2>
            {intro && <p>{intro}</p>}
          </div>
        </div>

        <div className="ch-body">
          {/* Email is reported, never assumed. It can fail while everything else
              succeeded — see HANDOFF §7. */}
          <div className={`ch-mail ${creds.emailed ? 'ok' : 'warn'}`}>
            <Icon name={creds.emailed ? 'check' : 'mail'} size={14} />
            <span>
              {creds.emailed
                ? (ar ? `أُرسل بريد تلقائي إلى ${creds.email}` : `Emailed automatically to ${creds.email}`)
                : (ar ? 'لم يُرسل بريد — سلّم البيانات بنفسك من هنا' : 'No email was sent — hand these over yourself below')}
            </span>
          </div>
          {!creds.emailed && creds.emailError && creds.emailError !== 'not_configured' && (
            <p className="ch-mail-detail" dir="ltr">{creds.emailError}</p>
          )}

          <div className="ch-rows">
            <Row label={ar ? 'المساحة' : 'Workspace'} value={creds.workspace} ar={ar} />
            <Row label={ar ? 'الموقع' : 'Portfolio'} value={creds.url} ar={ar} />
            <Row label={ar ? 'اسم المستخدم' : 'Username'} value={creds.username} mono ar={ar} />
            <Row label={ar ? 'كلمة المرور' : 'Password'} value={creds.password} mono ar={ar} />
            <Row label={ar ? 'البريد' : 'Email'} value={creds.email} ar={ar} />
          </div>

          <div className="ch-actions">
            <Button onClick={copyAll}>
              <Icon name={copiedAll ? 'check' : 'copy'} size={15} />
              {copiedAll ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ كل البيانات' : 'Copy all')}
            </Button>
            <Button variant="secondary" onClick={async () => { if (await copy(waText)) markDelivered(); }}>
              <Icon name="message" size={15} />
              {ar ? 'نسخ رسالة واتساب' : 'Copy WhatsApp message'}
            </Button>
            {creds.email && (
              <Button
                variant="secondary"
                onClick={() => { window.location.href = mailtoLink(creds, lang); markDelivered(); }}
              >
                <Icon name="mail" size={15} />
                {ar ? 'إرسال بالبريد' : 'Send email'}
              </Button>
            )}
            <Button variant="secondary" onClick={download}>
              <Icon name="download" size={15} />
              {ar ? 'تنزيل ملف' : 'Download'}
            </Button>
          </div>
        </div>

        <div className="ch-foot">
          <p className={delivered ? 'ok' : ''}>
            {delivered
              ? (ar ? 'تم أخذ البيانات. تبقى المساحة في «بانتظار التسليم» حتى تؤكد وصولها.' : 'Credentials taken. The workspace stays in Pending handoff until you confirm the client has them.')
              : (ar ? 'كلمة المرور لن تظهر مرة أخرى.' : 'This password is not shown again.')}
          </p>
          <Button variant={delivered ? 'primary' : 'ghost'} onClick={requestClose}>
            {ar ? 'إغلاق' : 'Close'}
          </Button>
        </div>
      </div>

      <style jsx>{`
        .ch-bg {
          position: fixed; inset: 0; z-index: var(--z-modal);
          background: rgba(0,0,0,0.72);
          -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: var(--space-4);
          animation: chIn 0.18s ease;
        }
        @keyframes chIn { from { opacity: 0; } to { opacity: 1; } }
        .ch-modal {
          width: 100%; max-width: 520px; max-height: 90vh;
          display: flex; flex-direction: column;
          background: var(--bg-secondary);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
        }
        .ch-head { padding: var(--space-5) var(--space-5) var(--space-4); border-bottom: 1px solid var(--border); }
        .ch-head h2 { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-1); }
        .ch-head p { font-size: var(--text-md); line-height: 1.6; color: var(--text-tertiary); }
        .ch-body { padding: var(--space-5); overflow-y: auto; }

        .ch-mail {
          display: flex; align-items: center; gap: var(--space-2);
          padding: 10px var(--space-3);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          margin-bottom: var(--space-4);
        }
        .ch-mail.ok { background: var(--success-bg); border: 1px solid var(--success-border); color: var(--success); }
        .ch-mail.warn { background: var(--warning-bg); border: 1px solid var(--warning-border); color: var(--warning); }
        .ch-mail-detail { font-size: var(--text-xs); color: var(--text-muted); margin: -10px 0 var(--space-4); }

        .ch-rows {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
          margin-bottom: var(--space-4);
        }
        .ch-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }

        .ch-foot {
          display: flex; align-items: center; justify-content: space-between;
          gap: var(--space-4); flex-wrap: wrap;
          padding: var(--space-4) var(--space-5);
          border-top: 1px solid var(--border);
          background: var(--bg-primary);
        }
        .ch-foot p { font-size: var(--text-sm); color: var(--text-tertiary); flex: 1; min-width: 180px; line-height: 1.5; }
        .ch-foot p.ok { color: var(--success); }

        @media (max-width: 640px) {
          .ch-bg { padding: 0; align-items: stretch; }
          .ch-modal { max-width: none; max-height: 100vh; border-radius: 0; border: none; }
          .ch-actions :global(.ui-btn) { flex: 1 1 100%; }
          .ch-foot :global(.ui-btn) { width: 100%; }
        }
      `}</style>
    </div>
  );
}
