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
// stored. Every route out of here — clipboard, WhatsApp, email, PDF — carries
// the same facts. Email is one of them, not the channel the workspace depends on.
//
// THE SHAPE: the credentials are NOT the first thing on screen. A summary of
// what was created comes first, then four equal ways to deliver it, and the raw
// values sit behind a reveal. Delivering is the job; reading the password off
// the screen is the fallback, so the layout leads with the job.

import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from './ui';
import {
  credentialsText,
  whatsappMessage,
  mailtoLink,
  credentialsFilename,
} from '../lib/credentials';
import { buildCredentialsPdf } from '../lib/credentials-pdf';

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

// The four steps an onboarding actually passes through. Steps 1 and 2 are
// already behind us by the time this modal exists — showing them completed is
// what makes the remaining work read as "one step left", not "a wall of buttons".
const STEPS = {
  en: ['Create workspace', 'Workspace created', 'Choose how to share', 'Done'],
  ar: ['إنشاء المساحة', 'تم الإنشاء', 'اختر طريقة التسليم', 'تم'],
};

function ProgressRail({ current, ar }) {
  const labels = ar ? STEPS.ar : STEPS.en;
  return (
    <ol className="rail" aria-label={ar ? 'مراحل الإعداد' : 'Setup progress'}>
      {labels.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'next';
        return (
          <li key={label} className={`rail-step ${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="rail-dot">{state === 'done' ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="rail-label">{label}</span>
          </li>
        );
      })}
      <style jsx>{`
        .rail { display: flex; list-style: none; margin: 0; padding: 0; gap: var(--space-2); }
        .rail-step { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center;
          gap: 6px; position: relative; }
        /* the connector sits behind the dots and stops at the last step */
        .rail-step:not(:last-child)::after {
          content: ''; position: absolute; top: 11px; height: 2px; z-index: 0;
          inset-inline-start: calc(50% + 14px); inset-inline-end: calc(-50% + 14px);
          background: var(--border);
        }
        .rail-step.done::after { background: var(--success); }
        .rail-dot { position: relative; z-index: 1;
          width: 24px; height: 24px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
          background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-tertiary); }
        .rail-step.done .rail-dot { background: var(--success-bg); border-color: var(--success-border); color: var(--success); }
        .rail-step.now .rail-dot { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
        .rail-label { font-size: var(--text-xs); line-height: 1.3; text-align: center; color: var(--text-muted); }
        .rail-step.now .rail-label { color: var(--text-primary); font-weight: 600; }
        .rail-step.done .rail-label { color: var(--text-tertiary); }
        @media (max-width: 560px) { .rail-label { display: none; } .rail { justify-content: center; } }
      `}</style>
    </ol>
  );
}

// One delivery route. Equal weight by design — the point of the screen is that
// no single channel is the one the workspace depends on.
function ShareCard({ icon, title, hint, cta, tone, onPick, done }) {
  return (
    <button type="button" className={`sc ${tone} ${done ? 'used' : ''}`} onClick={onPick}>
      <span className="sc-ico"><Icon name={done ? 'check' : icon} size={18} /></span>
      <span className="sc-title">{title}</span>
      <span className="sc-hint">{hint}</span>
      <span className="sc-cta">{cta}</span>
      <style jsx>{`
        .sc { display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: var(--space-4) var(--space-3);
          background: var(--bg-elevated); border: 1px solid var(--border);
          border-radius: var(--radius-md); cursor: pointer; font-family: inherit;
          text-align: center; transition: var(--transition); }
        .sc:hover { border-color: var(--border-strong); transform: translateY(-1px); }
        .sc:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .sc-ico { width: 38px; height: 38px; border-radius: 50%; display: inline-flex;
          align-items: center; justify-content: center; margin-bottom: 2px; }
        .mail .sc-ico   { background: rgba(79,110,242,.16); color: #7d92ff; }
        .copy .sc-ico   { background: var(--success-bg); color: var(--success); }
        .chat .sc-ico   { background: var(--success-bg); color: var(--success); }
        .file .sc-ico   { background: rgba(150,110,242,.16); color: #b39cff; }
        .sc.used .sc-ico { background: var(--success-bg); color: var(--success); }
        .sc-title { font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
        .sc-hint { font-size: var(--text-xs); line-height: 1.4; color: var(--text-tertiary); }
        .sc-cta { margin-top: var(--space-2); font-size: var(--text-sm); font-weight: 600;
          color: var(--accent); }
        .sc.used .sc-cta { color: var(--success); }
      `}</style>
    </button>
  );
}

export default function CredentialsHandoff({ creds, lang = 'en', title, intro, onClose }) {
  const ar = lang === 'ar';
  // Has the admin taken the credentials out of this screen by ANY route? Closing
  // before that is the failure this whole feature exists to prevent.
  const [delivered, setDelivered] = useState(false);
  const [used, setUsed] = useState({});
  const [revealed, setRevealed] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') e.preventDefault(); } // no accidental dismissal
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Focus the dialog itself rather than a control — Button is a plain function
    // component, so a ref on it would neither work nor be silent.
    modalRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);

  if (!creds) return null;

  function mark(key) {
    setUsed((u) => ({ ...u, [key]: true }));
    setDelivered(true);
  }

  async function copyAll() { if (await copy(credentialsText(creds, lang))) mark('copy'); }
  async function copyChat() { if (await copy(whatsappMessage(creds, lang))) mark('chat'); }
  function sendMail() { window.location.href = mailtoLink(creds, lang); mark('mail'); }

  function downloadPdf() {
    try {
      const blob = new Blob([buildCredentialsPdf(creds)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = credentialsFilename(creds, 'pdf');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      mark('file');
    } catch (err) {
      console.error('[handoff] pdf failed:', err);
    }
  }

  function requestClose() {
    if (delivered) { onClose(); return; }
    const ok = window.confirm(ar
      ? 'لم تسلّم بيانات الدخول بعد. كلمة المرور لن تظهر مرة أخرى — هل تريد الإغلاق؟'
      : "You haven't delivered the credentials yet. The password is not shown again — close anyway?");
    if (ok) onClose();
  }

  const created = creds.createdAt ? new Date(creds.createdAt) : new Date();
  // Latin numerals in both locales — HANDOFF §1.
  const createdLabel = created.toLocaleDateString(ar ? 'ar-SA-u-nu-latn' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="ch-bg" role="dialog" aria-modal="true" aria-label={title} dir={ar ? 'rtl' : 'ltr'}>
      <div className="ch-modal" ref={modalRef} tabIndex={-1}>
        <div className="ch-head">
          <ProgressRail current={delivered ? 3 : 2} ar={ar} />
        </div>

        <div className="ch-body">
          <div className="ch-hero">
            <span className="ch-tick"><Icon name="check" size={18} /></span>
            <h2>{title}</h2>
            {intro && <p>{intro}</p>}
          </div>

          {/* What exists now — the facts about the workspace, before the raw
              secrets. Status is real (tenants.status); there is no plan tier in
              this product, so none is invented here. */}
          <dl className="ch-summary">
            <div><dt>{ar ? 'اسم المساحة' : 'Workspace'}</dt><dd>{creds.workspace || '—'}</dd></div>
            <div><dt>{ar ? 'تاريخ الإنشاء' : 'Created'}</dt><dd>{createdLabel}</dd></div>
            <div><dt>{ar ? 'الموقع' : 'Portfolio'}</dt><dd className="ltr">{creds.url || '—'}</dd></div>
            <div><dt>{ar ? 'الحالة' : 'Status'}</dt><dd><span className="ch-pill">{ar ? 'نشط' : 'Active'}</span></dd></div>
          </dl>

          <div className={`ch-mail ${creds.emailed ? 'ok' : 'warn'}`}>
            <Icon name={creds.emailed ? 'check' : 'mail'} size={14} />
            <span>
              {creds.emailed
                ? (ar ? `أُرسل بريد تلقائي إلى ${creds.email}` : `Emailed automatically to ${creds.email}`)
                : (ar ? 'لم يُرسل بريد — اختر طريقة تسليم من الأسفل' : 'No email was sent — pick a delivery route below')}
            </span>
          </div>
          {!creds.emailed && creds.emailError && creds.emailError !== 'not_configured' && (
            <p className="ch-mail-detail" dir="ltr">{creds.emailError}</p>
          )}

          <h3 className="ch-q">{ar ? 'كيف تريد تسليم بيانات الدخول؟' : 'How would you like to share the login details?'}</h3>
          <div className="ch-cards">
            {creds.email && (
              <ShareCard tone="mail" icon="mail" done={used.mail}
                title={ar ? 'إرسال بالبريد' : 'Send email'}
                hint={ar ? 'يفتح بريدك برسالة جاهزة' : 'Opens your mail app, message ready'}
                cta={used.mail ? (ar ? 'تم' : 'Sent') : (ar ? 'إرسال' : 'Send email')}
                onPick={sendMail} />
            )}
            <ShareCard tone="copy" icon="copy" done={used.copy}
              title={ar ? 'نسخ البيانات' : 'Copy credentials'}
              hint={ar ? 'اسم المستخدم وكلمة المرور' : 'Username and password'}
              cta={used.copy ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ' : 'Copy')}
              onPick={copyAll} />
            <ShareCard tone="chat" icon="message" done={used.chat}
              title={ar ? 'رسالة واتساب' : 'Copy WhatsApp'}
              hint={ar ? 'رسالة جاهزة للإرسال' : 'A ready-to-send message'}
              cta={used.chat ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ الرسالة' : 'Copy message')}
              onPick={copyChat} />
            <ShareCard tone="file" icon="download" done={used.file}
              title={ar ? 'تنزيل PDF' : 'Download PDF'}
              hint={ar ? 'ورقة بيانات للطباعة' : 'A printable credentials sheet'}
              cta={used.file ? (ar ? 'تم التنزيل' : 'Downloaded') : (ar ? 'تنزيل' : 'Download')}
              onPick={downloadPdf} />
          </div>

          <div className="ch-or"><span>{ar ? 'أو' : 'or'}</span></div>

          <button type="button" className="ch-reveal" onClick={() => setRevealed((v) => !v)} aria-expanded={revealed}>
            <Icon name={revealed ? 'close' : 'user'} size={14} />
            {revealed ? (ar ? 'إخفاء البيانات' : 'Hide login details') : (ar ? 'عرض بيانات الدخول' : 'View login details')}
          </button>

          {revealed && (
            <div className="ch-rows">
              <Row label={ar ? 'اسم المستخدم' : 'Username'} value={creds.username} mono ar={ar} />
              <Row label={ar ? 'كلمة المرور' : 'Password'} value={creds.password} mono ar={ar} />
              <Row label={ar ? 'البريد' : 'Email'} value={creds.email} ar={ar} />
              <Row label={ar ? 'رابط الدخول' : 'Sign in'} value={creds.signInUrl} ar={ar} />
            </div>
          )}
        </div>

        <div className="ch-foot">
          <p className={delivered ? 'ok' : ''}>
            {delivered
              ? (ar ? 'تم التسليم. كلمة المرور لن تظهر مرة أخرى.' : 'Delivered. This password is not shown again.')
              : (ar ? 'كلمة المرور لن تظهر مرة أخرى.' : 'This password is not shown again.')}
          </p>
          <Button variant={delivered ? 'primary' : 'ghost'} onClick={requestClose}>
            {ar ? 'إغلاق' : 'Close'}
          </Button>
        </div>
      </div>

      <style jsx>{`
        .ch-bg { position: fixed; inset: 0; z-index: var(--z-modal);
          background: rgba(0,0,0,0.72); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; padding: var(--space-4);
          animation: chIn 0.18s ease; }
        @keyframes chIn { from { opacity: 0; } to { opacity: 1; } }
        .ch-modal { width: 100%; max-width: 620px; max-height: 92vh; display: flex; flex-direction: column;
          background: var(--bg-secondary); border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
        .ch-head { padding: var(--space-5) var(--space-5) var(--space-4); border-bottom: 1px solid var(--border); }
        .ch-body { padding: var(--space-5); overflow-y: auto; }

        .ch-hero { text-align: center; margin-bottom: var(--space-5); }
        .ch-tick { display: inline-flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; border-radius: 50%; margin-bottom: var(--space-3);
          background: var(--success-bg); border: 1px solid var(--success-border); color: var(--success); }
        .ch-hero h2 { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
        .ch-hero p { font-size: var(--text-md); line-height: 1.6; color: var(--text-tertiary);
          max-width: 46ch; margin-inline: auto; }

        .ch-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
          background: var(--border); border: 1px solid var(--border); border-radius: var(--radius-md);
          overflow: hidden; margin: 0 0 var(--space-4); }
        .ch-summary > div { background: var(--bg-elevated); padding: 12px var(--space-3); min-width: 0; }
        .ch-summary dt { font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: 3px; }
        .ch-summary dd { margin: 0; font-size: var(--text-md); font-weight: 600; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ch-summary dd.ltr { direction: ltr; text-align: start; }
        .ch-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: var(--text-xs);
          font-weight: 700; background: var(--success-bg); color: var(--success);
          border: 1px solid var(--success-border); }

        .ch-mail { display: flex; align-items: center; gap: var(--space-2); padding: 10px var(--space-3);
          border-radius: var(--radius-sm); font-size: var(--text-sm); margin-bottom: var(--space-4); }
        .ch-mail.ok { background: var(--success-bg); border: 1px solid var(--success-border); color: var(--success); }
        .ch-mail.warn { background: var(--warning-bg); border: 1px solid var(--warning-border); color: var(--warning); }
        .ch-mail-detail { font-size: var(--text-xs); color: var(--text-muted); margin: -10px 0 var(--space-4); }

        .ch-q { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary);
          margin: 0 0 var(--space-3); text-align: center; }
        .ch-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
          gap: var(--space-2); margin-bottom: var(--space-4); }

        .ch-or { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3);
          color: var(--text-muted); font-size: var(--text-sm); }
        .ch-or::before, .ch-or::after { content: ''; flex: 1; height: 1px; background: var(--border); }

        .ch-reveal { width: 100%; display: inline-flex; align-items: center; justify-content: center;
          gap: var(--space-2); min-height: 42px; padding: 0 var(--space-4);
          background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-md);
          color: var(--text-secondary); font-family: inherit; font-size: var(--text-md); font-weight: 600;
          cursor: pointer; transition: var(--transition); }
        .ch-reveal:hover { background: var(--bg-hover); color: var(--text-primary); }
        .ch-reveal:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .ch-rows { border: 1px solid var(--border); border-radius: var(--radius-md);
          overflow: hidden; margin-top: var(--space-3); }

        .ch-foot { display: flex; align-items: center; justify-content: space-between;
          gap: var(--space-4); flex-wrap: wrap; padding: var(--space-4) var(--space-5);
          border-top: 1px solid var(--border); background: var(--bg-primary); }
        .ch-foot p { font-size: var(--text-sm); color: var(--text-tertiary); flex: 1; min-width: 180px; line-height: 1.5; }
        .ch-foot p.ok { color: var(--success); }

        @media (max-width: 640px) {
          .ch-bg { padding: 0; align-items: stretch; }
          .ch-modal { max-width: none; max-height: 100vh; border-radius: 0; border: none; }
          .ch-summary { grid-template-columns: 1fr; }
          .ch-foot :global(.ui-btn) { width: 100%; }
        }
      `}</style>
    </div>
  );
}
