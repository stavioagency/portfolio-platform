// The Studio's Settings screen — the customer's own account.
//
// ── WHAT IT OFFERS, AND WHY IT IS SHORT ──────────────────────────────────
// Changing a password is the one account operation a customer actually
// performs, so it is the one this screen does. The policy and the breach check
// are lib/password-policy.js and lib/pwned-password.js — the same two modules
// the post-reset screen and the admin's account editor use. A second opinion
// about what makes an acceptable password is how one screen accepts what
// another refuses.
//
// ── EMAIL IS SHOWN AND NOT EDITED, AND THAT IS NOT AN OMISSION ───────────
// The platform has no self-service email change: /admin does not offer one
// either, and the only path that exists is an OWNER operation in /console
// (client-recovery / update_email). Building a field here would either
// reimplement an owner-only capability in a customer's screen, or look like it
// worked and silently do nothing. The email is shown, and the screen says how
// it is changed.
//
// ── LANGUAGE AND SIGNING OUT ARE NOT REPEATED HERE ───────────────────────
// Both live in the Studio shell, on every screen. A second copy is a second
// thing to keep in step, and a settings page that merely re-lists controls
// already in view is padding.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { passwordPolicyError, PASSWORD_MIN, PASSWORD_MAX_CHARS } from '../../lib/password-policy';
import { isPwnedPassword } from '../../lib/pwned-password';

/* The policy returns a translation KEY, because its other two callers read
   lib/translations.js. The Studio writes its copy inline, so the keys are
   mapped here rather than the policy being taught a second language system. */
function policyMessage(key, ar) {
  if (key === 'password_too_short') {
    return ar ? `كلمة المرور تحتاج ${PASSWORD_MIN} أحرف على الأقل.` : `Your password needs at least ${PASSWORD_MIN} characters.`;
  }
  if (key === 'password_too_long') {
    return ar ? `الحد الأقصى ${PASSWORD_MAX_CHARS} حرفًا.` : `The maximum is ${PASSWORD_MAX_CHARS} characters.`;
  }
  if (key === 'password_mismatch') {
    return ar ? 'الكلمتان غير متطابقتين.' : 'The two passwords do not match.';
  }
  return '';
}

export default function Settings({ ar, email }) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState('idle');   // idle | saving | saved | error
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setMessage('');

    const key = passwordPolicyError(pwd, confirm);
    if (key) { setState('error'); setMessage(policyMessage(key, ar)); return; }

    setState('saving');
    try {
      /* BREACH CHECK BEFORE THE WRITE. It fails OPEN by design — a password
         service being down must not stop someone securing their account — so a
         false here means "not known to be breached", never "checked and safe". */
      const { pwned } = await isPwnedPassword(pwd);
      if (pwned) {
        setState('error');
        setMessage(ar
          ? 'ظهرت كلمة المرور هذه في تسريب معروف. يلزم اختيار غيرها.'
          : 'This password has appeared in a known breach. Please choose a different one.');
        return;
      }

      /* must_set_password is cleared in the SAME call that sets the password,
         so the two can never disagree: that flag drives the gate for accounts
         created with a temporary password, and a separate write could fail and
         leave it stuck on. Everything else in user_metadata is preserved —
         none of it is ours to discard. */
      const { data: cur } = await supabase.auth.getUser();
      const { error } = await supabase.auth.updateUser({
        password: pwd,
        data: { ...(cur?.user?.user_metadata || {}), must_set_password: false },
      });
      if (error) throw error;

      setPwd(''); setConfirm('');
      setState('saved');
      setMessage(ar ? 'تم تغيير كلمة المرور.' : 'Your password has been changed.');
    } catch (err) {
      setState('error');
      setMessage(err?.message || String(err));
    }
  }

  return (
    <section className="screen">
      <h1>{ar ? 'الحساب' : 'Account'}</h1>

      <div className="block">
        <h2>{ar ? 'البريد الإلكتروني' : 'Email address'}</h2>
        <p className="val" dir="ltr">{email || '—'}</p>
        <p className="note">
          {ar
            ? 'هذا هو بريد تسجيل الدخول. تغييره يتم عبر التواصل معنا.'
            : 'This is the address you sign in with. To change it, get in touch with us.'}
        </p>
      </div>

      <div className="block">
        <h2>{ar ? 'كلمة المرور' : 'Password'}</h2>
        <form onSubmit={submit}>
          <label htmlFor="np">{ar ? 'كلمة مرور جديدة' : 'New password'}</label>
          <input
            id="np" type="password" autoComplete="new-password" dir="ltr"
            value={pwd} onChange={(e) => setPwd(e.target.value)}
            disabled={state === 'saving'}
          />

          <label htmlFor="cp">{ar ? 'تأكيد كلمة المرور' : 'Confirm password'}</label>
          <input
            id="cp" type="password" autoComplete="new-password" dir="ltr"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            disabled={state === 'saving'}
          />

          <p className="hint">
            {ar
              ? `بين ${PASSWORD_MIN} و${PASSWORD_MAX_CHARS} حرفًا.`
              : `Between ${PASSWORD_MIN} and ${PASSWORD_MAX_CHARS} characters.`}
          </p>

          <button type="submit" disabled={state === 'saving' || !pwd || !confirm}>
            {state === 'saving'
              ? (ar ? 'جارٍ الحفظ…' : 'Saving…')
              : (ar ? 'تغيير كلمة المرور' : 'Change password')}
          </button>
        </form>

        {/* role="status" so the outcome is announced, not only painted. */}
        {message && (
          <p className={state === 'error' ? 'msg bad' : 'msg good'} role="status">{message}</p>
        )}
      </div>

      <div className="block">
        <h2>{ar ? 'أشياء أخرى' : 'Anything else'}</h2>
        <p className="note">
          {ar
            ? 'الفواتير وتفاصيل الاشتراك في المحرّر الحالي.'
            : 'Invoices and subscription details are in the current editor.'}
          {' '}
          <a href="/admin">{ar ? 'فتح المحرّر الحالي' : 'Open the current editor'}</a>
        </p>
      </div>

      <style jsx>{`
        .screen { max-width: 620px; }
        h1 { margin: 0 0 var(--space-4); font-size: var(--text-xl); font-family: var(--font-heading); }

        .block { padding: var(--space-4); margin-bottom: var(--space-3);
                 border: 1px solid var(--border-default); border-radius: var(--radius-md);
                 background: var(--surface-card); }
        h2 { margin: 0 0 6px; font-size: var(--text-md); font-weight: 600; }
        .val { margin: 0; font-size: var(--text-md); font-weight: 600; overflow-wrap: anywhere; }
        .note { margin: 6px 0 0; color: var(--text-secondary);
                font-size: var(--text-sm); line-height: 1.7; }

        form { display: flex; flex-direction: column; gap: 6px; margin-top: var(--space-3); }
        label { font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        input {
          width: 100%; min-block-size: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--border-default); border-radius: var(--radius-md);
          background: var(--surface-input); color: var(--text-primary);
          font: inherit; font-size: var(--field-text); text-align: start;
          margin-bottom: var(--space-2);
        }
        input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .hint { margin: 0 0 var(--space-3); color: var(--text-tertiary); font-size: var(--text-xs); }
        button {
          align-self: flex-start; min-height: var(--tap-min); padding: 0 var(--space-4);
          border: 1px solid transparent; border-radius: var(--radius-md);
          background: var(--action-primary-bg); color: var(--action-primary-fg);
          font: inherit; font-size: var(--text-sm); font-weight: 700; cursor: pointer;
        }
        button:disabled { opacity: 0.5; cursor: default; }
        button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        .msg { margin: var(--space-3) 0 0; padding: var(--space-3);
               border-radius: var(--radius-sm); font-size: var(--text-sm); line-height: 1.6; }
        .msg.bad { background: var(--danger-bg); color: var(--danger-ink); }
        .msg.good { background: var(--success-bg); color: var(--success-ink); }
      `}</style>
    </section>
  );
}
