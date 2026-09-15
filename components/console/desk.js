/* The operator desk: support, reports, health and the audit log.
 *
 * Four screens that did not exist before Section AA, mounted as tabs inside
 * /console rather than as a second console — the whole point of the owner
 * surface is that there is ONE of it. Support arriving somewhere the payments
 * are not is how a client gets chased for money they already paid.
 *
 * ── THESE SCREENS READ; console-desk.js DECIDES ─────────────────────────
 * Every ordering, alarm and count comes from lib/console-desk.js, which is pure
 * and tested. Nothing here re-derives "is this appeal late": a screen that
 * answers that in two places answers it two ways the day one is edited.
 *
 * ── AUTHORIZATION IS THE DATABASE'S ──────────────────────────────────────
 * Not one query here checks who is asking. is_platform_owner() and RLS decide,
 * exactly as the rest of /console does, so a customer who typed this URL gets
 * empty lists rather than someone else's business.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Badge, Button, EmptyState, Icon } from '../ui';
import { deskOrder, groupReports, healthIssues, appealIsOverdue, APPEAL_HOURS } from '../../lib/console-desk';

const when = (v) => (v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function ConsoleDesk({ ar, view, tenants }) {
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState({});
  const [reports, setReports] = useState([]);
  const [audit, setAudit] = useState([]);
  const [notices, setNotices] = useState([]);
  const [domains, setDomains] = useState([]);
  const [payments, setPayments] = useState([]);
  const [openThread, setOpenThread] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);

  const t = (a, e) => (ar ? a : e);

  const load = useCallback(async () => {
    const [th, rp, au, no, dm, pay] = await Promise.all([
      supabase.from('support_threads').select('*').limit(200),
      supabase.from('reports').select('*').limit(300),
      supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('operator_notices').select('*').limit(200),
      supabase.from('tenant_domains').select('*').limit(100),
      supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    setThreads(th.data || []);
    setReports(rp.data || []);
    setAudit(au.data || []);
    setNotices(no.data || []);
    setDomains(dm.data || []);
    setPayments(pay.data || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openOne = useCallback(async (thread) => {
    setOpenThread(thread);
    setReply('');
    const { data } = await supabase.from('support_messages')
      .select('*').eq('thread_id', thread.id).order('created_at');
    setMessages((m) => ({ ...m, [thread.id]: data || [] }));
    // Read state is per person: marking this read must not clear it for the
    // other owner, which a column on the thread would do.
    const { data: me } = await supabase.auth.getUser();
    if (me?.user?.id) {
      await supabase.from('support_reads')
        .upsert({ thread_id: thread.id, user_id: me.user.id, read_at: new Date().toISOString() });
    }
  }, []);

  async function send() {
    if (!openThread || !reply.trim()) return;
    setBusy(true); setSaid(null);
    try {
      const { data: me } = await supabase.auth.getUser();
      const { error } = await supabase.from('support_messages').insert({
        thread_id: openThread.id, author_id: me?.user?.id ?? null, body: reply.trim(), via: 'app',
      });
      if (error) throw error;
      await openOne(openThread);
      await load();
    } catch (e) {
      setSaid(e?.message || String(e));
    } finally { setBusy(false); }
  }

  async function setStatus(thread, status) {
    setBusy(true); setSaid(null);
    try {
      // The CHECK requires both halves: a closed thread carries when it closed.
      const patch = { status, closed_at: status === 'closed' ? new Date().toISOString() : null };
      const { error } = await supabase.from('support_threads').update(patch).eq('id', thread.id);
      if (error) throw error;
      await load();
      setOpenThread((o) => (o && o.id === thread.id ? { ...o, ...patch } : o));
    } catch (e) {
      setSaid(e?.message || String(e));
    } finally { setBusy(false); }
  }

  const nameOf = (id) => (tenants || []).find((x) => x.id === id)?.slug || null;

  let body = null;

  if (view === 'support' && openThread) {
    const list = messages[openThread.id] || [];
    body = (
      <>
        <Button size="sm" variant="ghost" onClick={() => setOpenThread(null)}>{t('رجوع', 'Back')}</Button>
        <h3>{openThread.subject}</h3>
        <p className="meta">
          {openThread.kind === 'appeal' ? t('اعتراض', 'Appeal') : t('دعم', 'Support')}
          {' · '}{nameOf(openThread.tenant_id) || t('بلا مساحة', 'no workspace')}
        </p>
        {appealIsOverdue(openThread) && (
          <Badge tone="danger">{t(`تجاوز ${APPEAL_HOURS} ساعة`, `Past ${APPEAL_HOURS}h`)}</Badge>
        )}
        <div className="thread">
          {list.length === 0 && <p className="meta">{t('لا رسائل بعد.', 'No messages yet.')}</p>}
          {list.map((m) => (
            <div key={m.id} className="msg">
              <p>{m.body}</p>
              <span className="meta">{when(m.created_at)} · {m.via}</span>
            </div>
          ))}
        </div>
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4}
                  placeholder={t('الرد…', 'Reply…')} aria-label={t('الرد', 'Reply')} />
        <div className="row">
          <Button size="sm" disabled={busy || !reply.trim()} onClick={() => void send()}>
            {t('إرسال', 'Send')}
          </Button>
          {openThread.status !== 'closed' ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus(openThread, 'closed')}>
              {t('إغلاق', 'Close')}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setStatus(openThread, 'open')}>
              {t('إعادة فتح', 'Reopen')}
            </Button>
          )}
        </div>
        {said && <p className="bad" role="status">{said}</p>}
      </>
    );

  } else if (view === 'support') {
    const ordered = deskOrder(threads);
    body = (
      <>
        {ordered.length === 0 ? (
          <EmptyState icon={<Icon name="message" size={24} />} title={t('لا محادثات.', 'No conversations.')} compact />
        ) : ordered.map((th) => (
          <button key={th.id} type="button" className="row-btn" onClick={() => void openOne(th)}>
            <span className="grow">
              <b>{th.subject}</b>
              <span className="meta">{nameOf(th.tenant_id) || '—'} · {when(th.last_message_at || th.created_at)}</span>
            </span>
            {th.kind === 'appeal' && (
              <Badge tone={appealIsOverdue(th) ? 'danger' : 'warning'}>{t('اعتراض', 'Appeal')}</Badge>
            )}
            <Badge tone={th.status === 'closed' ? 'neutral' : 'accent'}>{th.status}</Badge>
          </button>
        ))}
      </>
    );

  } else if (view === 'reports') {
    const groups = groupReports(reports);
    body = (
      <>
        {groups.length === 0 ? (
          <EmptyState icon={<Icon name="alert" size={24} />} title={t('لا بلاغات.', 'No reports.')} compact />
        ) : groups.map((g) => (
          <div key={g.tenant_id} className="card">
            <b>{nameOf(g.tenant_id) || g.tenant_id}</b>
            {/* Distinct sources, never the raw count: ten reports from one
                upset person must not look like ten people agreeing. */}
            <p className="meta">
              {t(`${g.open} مفتوح · ${g.distinctSources} مصدر مختلف`,
                 `${g.open} open · ${g.distinctSources} distinct sources`)}
            </p>
            <ul>
              {g.reports.slice(0, 5).map((r) => (
                <li key={r.id}>{r.reason}{r.note ? ` — ${r.note}` : ''}</li>
              ))}
            </ul>
          </div>
        ))}
      </>
    );

  } else if (view === 'health') {
    const issues = healthIssues({ tenants, threads, payments, notices, domains });
    body = (
      <>
        {issues.length === 0 ? (
          <EmptyState icon={<Icon name="check" size={24} />} title={t('لا شيء معطّل.', 'Nothing is broken.')} compact />
        ) : issues.map((i, n) => (
          <div key={`${i.issue}-${n}`} className="card bad-card">
            <b>{i.detail}</b>
            <p className="meta">{i.subject} · {when(i.since)}</p>
          </div>
        ))}
      </>
    );

  } else {
    body = (
      <>
        {audit.length === 0 ? (
        <EmptyState icon={<Icon name="clock" size={24} />} title={t('لا سجل بعد.', 'Nothing logged yet.')} compact />
      ) : audit.map((a) => (
        <div key={a.id} className="card">
          <b>{a.action}</b>
          <p className="meta">{a.subject_type} {a.subject_id} · {when(a.created_at)}</p>
        </div>
      ))}
      </>
    );
  }

  return (
    <div className="desk">
      {body}
      <style jsx>{`
  .desk { display: flex; flex-direction: column; gap: 10px; margin-top: var(--space-3); }
  h3 { margin: 0; font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
  .meta { margin: 0; color: var(--text-tertiary); font-size: var(--text-xs); line-height: 1.6; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .row-btn { display: flex; align-items: center; gap: 8px; inline-size: 100%;
             min-block-size: var(--tap-min); padding: var(--space-3);
             border: 1px solid var(--border-default); border-radius: var(--radius-md);
             background: var(--surface-card); color: var(--text-primary);
             font: inherit; text-align: start; cursor: pointer; }
  .row-btn:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
  .grow { display: flex; flex-direction: column; gap: 2px; flex: 1; min-inline-size: 0; }
  .card { padding: var(--space-3); border: 1px solid var(--border-default);
          border-radius: var(--radius-md); background: var(--surface-card);
          color: var(--text-primary); }
  .bad-card { border-color: var(--danger-border); background: var(--danger-bg); color: var(--danger-ink); }
  .card ul { margin: 6px 0 0; padding-inline-start: 18px; font-size: var(--text-sm); line-height: 1.7; }
  .thread { display: flex; flex-direction: column; gap: 8px; }
  .msg { padding: var(--space-3); border-radius: var(--radius-md);
         background: var(--surface-elevated); color: var(--text-primary); }
  .msg p { margin: 0 0 4px; font-size: var(--text-sm); line-height: 1.7; }
  textarea { inline-size: 100%; min-block-size: 96px; padding: var(--space-3);
             border: 1px solid var(--border-default); border-radius: var(--radius-sm);
             background: var(--surface-input); color: var(--text-primary);
             font: inherit; font-size: var(--field-text-compact); }
  textarea:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
  .bad { margin: 0; color: var(--danger-ink); font-size: var(--text-sm); }
`}</style>
    </div>
  );
}
