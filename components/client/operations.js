// The owner's operations on one customer, inside the /client record.
//
// ── WHAT MOVED, AND WHAT DID NOT ─────────────────────────────────────────
// The bodies are lib/client-operations.js — the same builders /console now
// calls, so the two screens cannot drift. What is here is the asking: which
// operations are offered, how an irreversible one is confirmed, and what the
// operator is told afterwards.
//
// ── CONFIRMATION IS INLINE, NOT A MODAL, AND THAT IS DELIBERATE ──────────
// A modal is dismissed by reflex. Every irreversible action here ARMS first:
// the button is replaced in place by what it is about to do and a confirm
// beside it, so the sentence the operator reads is attached to the row they are
// looking at. The delete goes further and will not arm at all until the
// workspace's slug is typed — and the typed value is still sent for the server
// to judge, because the Edge Function compares it against the tenant's own slug
// and that is what makes a wrong-row delete impossible to complete.
//
// ── WHAT IS NOT HERE ─────────────────────────────────────────────────────
// Forcing a delete past a live subscription. It means deleting a customer who
// may still be charged, /console has the full blocked-reason handling, and
// rebuilding that from memory is how the dangerous path becomes the untested
// one. The server's refusal is shown and /console is linked.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  resetPasswordCall, changeEmailCall, grantFreeCall, setCompPeriodCall,
  revokeFreeCall, deleteClientCall, slugConfirmed, canOperate,
} from '../../lib/client-operations';

export default function ClientOperations({ ar, row, onDone }) {
  const [armed, setArmed] = useState('');      // which irreversible action is armed
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState(null);      // { tone: 'ok'|'bad', text }
  const [email, setEmail] = useState('');
  const [typed, setTyped] = useState('');

  const hasLogin = canOperate('reset_password', row);

  /* One runner for every operation, so the busy state, the error shape and the
     reload cannot be done three different ways. A null call means the operation
     was not applicable — that is a bug in the caller, not something to send. */
  async function run(key, call, okText) {
    if (!call) return;
    setBusy(key);
    setSaid(null);
    try {
      const { data, error } = await supabase.functions.invoke(call.fn, { body: call.body });
      const failed = error ? (error.message || String(error)) : (data && data.error) || null;
      if (failed) { setSaid({ tone: 'bad', text: failed }); return; }
      setSaid({ tone: 'ok', text: okText });
      setArmed('');
      setTyped('');
      setEmail('');
      if (onDone) await onDone();
    } catch (e) {
      setSaid({ tone: 'bad', text: e?.message || String(e) });
    } finally {
      setBusy('');
    }
  }

  const Arm = ({ id, label, warning, onConfirm, disabled }) => (
    armed === id ? (
      <span className="arm">
        <span className="warn">{warning}</span>
        <button type="button" className="danger" disabled={busy === id} onClick={onConfirm}>
          {busy === id ? (ar ? 'جارٍ التنفيذ…' : 'Working…') : (ar ? 'تأكيد' : 'Confirm')}
        </button>
        <button type="button" onClick={() => setArmed('')}>{ar ? 'تراجع' : 'Cancel'}</button>
      </span>
    ) : (
      <button type="button" disabled={disabled} onClick={() => { setArmed(id); setSaid(null); }}>
        {label}
      </button>
    )
  );

  return (
    <div className="ops">
      <h3>{ar ? 'إجراءات المشغّل' : 'Operator actions'}</h3>

      {/* ---- the login ------------------------------------------------- */}
      <section>
        <h4>{ar ? 'الحساب' : 'Account'}</h4>
        {!hasLogin ? (
          <p className="none">
            {ar
              ? 'لا يوجد حساب دخول مرتبط بهذه المساحة، فلا إجراءات حساب.'
              : 'No login is attached to this workspace, so there are no account actions.'}
          </p>
        ) : (
          <>
            <p className="val" dir="ltr">{row.member.email}</p>

            <div className="line">
              <Arm
                id="reset"
                label={ar ? 'إرسال رابط كلمة مرور' : 'Send password link'}
                warning={ar
                  ? 'ستصل رسالة إلى العميل فورًا، ولا يمكن سحبها.'
                  : 'The customer is emailed immediately, and it cannot be recalled.'}
                onConfirm={() => run('reset', resetPasswordCall(row),
                  ar ? 'أُرسل رابط كلمة المرور.' : 'The password link was sent.')}
              />
            </div>

            <div className="line">
              <input
                type="email" dir="ltr" placeholder={row.member.email}
                value={email} onChange={(e) => setEmail(e.target.value)}
                aria-label={ar ? 'بريد جديد' : 'New email'}
              />
              <button
                type="button"
                disabled={!email.trim() || busy === 'email'}
                onClick={() => run('email', changeEmailCall(row, email),
                  ar ? 'تم تغيير البريد.' : 'The email was changed.')}
              >
                {busy === 'email' ? (ar ? 'جارٍ…' : 'Working…') : (ar ? 'تغيير البريد' : 'Change email')}
              </button>
            </div>
          </>
        )}
      </section>

      {/* ---- free access ----------------------------------------------- */}
      <section>
        <h4>{ar ? 'الوصول المجاني' : 'Free access'}</h4>
        <div className="line wrap">
          <button type="button" disabled={busy === 'grant30'}
            onClick={() => run('grant30', grantFreeCall(row, 30),
              ar ? 'مُنح وصول مجاني ٣٠ يومًا.' : 'Granted 30 days of free access.')}>
            {ar ? 'منح ٣٠ يومًا' : 'Grant 30 days'}
          </button>
          {/* null days, not zero: null removes the end date, zero would end it
              immediately. */}
          <button type="button" disabled={busy === 'grantever'}
            onClick={() => run('grantever', grantFreeCall(row, null),
              ar ? 'مُنح وصول مجاني دائم.' : 'Granted permanent free access.')}>
            {ar ? 'منح دائم' : 'Grant permanently'}
          </button>
          <button type="button" disabled={busy === 'extend'}
            onClick={() => run('extend', setCompPeriodCall(row, 30),
              ar ? 'أُضيفت ٣٠ يومًا إلى المتبقّي.' : 'Added 30 days to what was left.')}>
            {ar ? 'تمديد ٣٠ يومًا' : 'Extend 30 days'}
          </button>
        </div>
        {/* Extending adds to what is LEFT, not to today. Stated because the
            opposite would quietly shorten a customer who still had time. */}
        <p className="fine">
          {ar
            ? 'التمديد يُضاف إلى المدّة المتبقّية، لا يبدأ من اليوم.'
            : 'Extending adds to the time left, it does not restart from today.'}
        </p>
        <div className="line">
          <Arm
            id="revoke"
            label={ar ? 'إلغاء الوصول المجاني' : 'Revoke free access'}
            warning={ar
              ? 'سيختفي المعرض عن الزوّار. المحتوى يبقى، ويمكن المنح مرة أخرى.'
              : 'The portfolio goes offline for visitors. The content stays and it can be granted again.'}
            onConfirm={() => run('revoke', revokeFreeCall(row),
              ar ? 'أُلغي الوصول المجاني.' : 'Free access was revoked.')}
          />
        </div>
      </section>

      {/* ---- the one that cannot be undone ------------------------------ */}
      <section className="last">
        <h4>{ar ? 'حذف العميل' : 'Delete client'}</h4>
        <p className="fine">
          {ar
            ? 'يُحذف المعرض وحساب الدخول نهائيًا. لا تراجع.'
            : 'The workspace and the login are removed permanently. There is no undo.'}
        </p>
        {/* The slug is typed against THIS row, and the same typed value is sent
            for the server to compare against the tenant's own slug. */}
        <div className="line">
          <input
            type="text" dir="ltr" placeholder={row.slug}
            value={typed} onChange={(e) => setTyped(e.target.value)}
            aria-label={ar ? 'اسم المساحة للتأكيد' : 'Workspace slug to confirm'}
          />
          <button
            type="button"
            className="danger"
            disabled={!slugConfirmed(row, typed) || busy === 'delete'}
            onClick={() => run('delete', deleteClientCall(row, typed),
              ar ? 'حُذف العميل.' : 'The client was deleted.')}
          >
            {busy === 'delete' ? (ar ? 'جارٍ الحذف…' : 'Deleting…') : (ar ? 'حذف نهائي' : 'Delete permanently')}
          </button>
        </div>
        <p className="fine">
          {ar
            ? `يلزم كتابة «${row.slug}» بالضبط لتفعيل الحذف.`
            : `Type “${row.slug}” exactly to enable the delete.`}
        </p>
      </section>

      {said && <p className={said.tone === 'bad' ? 'said bad' : 'said ok'} role="status">{said.text}</p>}

      {/* The one path deliberately left in /console. */}
      <p className="fine">
        {ar
          ? 'حذف عميل باشتراك قد يكون فعّالًا يتم من الكونسول.'
          : 'Deleting a client whose subscription may still charge is done in the console.'}
        {' '}
        <a href="/console">{ar ? 'فتح الكونسول' : 'Open the console'}</a>
      </p>

      <style jsx>{`
        .ops { margin-top: var(--space-4); padding-top: var(--space-4);
               border-top: 1px solid var(--border-default); }
        h3 { margin: 0 0 var(--space-3); font-size: var(--text-md); font-weight: 600; }
        section { margin-bottom: var(--space-4); }
        section.last { padding: var(--space-3); border: 1px solid var(--danger-border);
                       border-radius: var(--radius-md); background: var(--danger-bg); }
        h4 { margin: 0 0 6px; font-size: var(--text-sm); font-weight: 600;
             color: var(--text-secondary); }
        .val { margin: 0 0 var(--space-2); font-size: var(--text-sm); font-weight: 600;
               overflow-wrap: anywhere; }
        .none { margin: 0; color: var(--text-tertiary); font-size: var(--text-sm); line-height: 1.7; }
        .fine { margin: 6px 0 0; color: var(--text-tertiary); font-size: var(--text-xs); line-height: 1.6; }

        .line { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        .line.wrap { flex-wrap: wrap; }
        .arm { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .warn { flex: 1; min-width: 12ch; font-size: var(--text-xs);
                color: var(--warning-ink); line-height: 1.5; }

        input {
          flex: 1; min-width: 0; min-block-size: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--border-default); border-radius: var(--radius-sm);
          background: var(--surface-input); color: var(--text-primary);
          font: inherit; font-size: var(--field-text-compact); text-align: start;
        }
        input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }

        button {
          flex: none; min-height: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--action-secondary-border); border-radius: var(--radius-sm);
          background: var(--action-secondary-bg); color: var(--action-secondary-fg);
          font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer;
        }
        button:disabled { opacity: 0.45; cursor: default; }
        button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        button.danger { background: var(--danger-bg); color: var(--danger-ink);
                        border-color: var(--danger-border); }

        .said { margin: var(--space-3) 0 0; padding: var(--space-3);
                border-radius: var(--radius-sm); font-size: var(--text-sm); line-height: 1.6; }
        .said.ok { background: var(--success-bg); color: var(--success-ink); }
        .said.bad { background: var(--danger-bg); color: var(--danger-ink); }
      `}</style>
    </div>
  );
}
