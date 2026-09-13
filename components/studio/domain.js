// The Studio's Domain screen.
//
// SAME RULES AS /admin, LITERALLY. Every decision this screen makes — how a
// domain is normalised, which record an apex needs, what DNS said, what may be
// written afterwards — comes from lib/domains.js, which is the admin's own code
// moved out so both can import it. Two implementations of "does this domain
// point at us" is how one screen tells a customer their domain is active while
// the other says pending.
//
// ── WHAT STOPS A WRITE HERE IS RLS, NOT THIS FILE ────────────────────────
// `tenant_domains` is gated by can_edit_tenant(), which requires a PAYING
// subscription — unlike profile and projects, which only need membership since
// section-z. So an unpaid customer's insert is refused by the database. This
// screen says so before they type rather than letting them find out from an
// error, but the screen is the courtesy and the policy is the boundary.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  normalizeDomain, isValidDomain, dnsRecordFor,
  checkDomainDns, nextStatusFromDns, domainStatusMeta,
} from '../../lib/domains';
import { Icon } from '../ui';

export default function Domain({ ar, tenant, entitled }) {
  const [rows, setRows] = useState(null);      // null = not answered yet
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [checked, setChecked] = useState({});  // id -> message after a Verify

  const load = useCallback(async () => {
    if (!tenant) return;
    try {
      const { data, error: e } = await supabase
        .from('tenant_domains').select('*').eq('tenant_id', tenant.id).order('created_at');
      if (e) throw e;
      setRows(data || []);
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
    }
  }, [tenant]);

  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError('');
    const d = normalizeDomain(input);
    if (!isValidDomain(d)) {
      setError(ar ? 'يلزم نطاق صالح مثل example.com' : 'Enter a valid domain like example.com');
      return;
    }
    if ((rows || []).some((x) => x.domain === d)) {
      setError(ar ? 'هذا النطاق مضاف بالفعل' : 'That domain is already added');
      return;
    }
    setBusy('add');
    try {
      /* is_primary on the FIRST domain only. A workspace with one domain and no
         primary serves nothing, and a partial unique index allows exactly one. */
      const { error: e2 } = await supabase.from('tenant_domains').insert({
        tenant_id: tenant.id,
        domain: d,
        is_primary: (rows || []).length === 0,
        status: 'pending',
      });
      if (e2) throw e2;
      setInput('');
      await load();
    } catch (e2) {
      setError(e2?.message || String(e2));
    } finally {
      setBusy('');
    }
  }

  async function verify(row) {
    setBusy(`v:${row.id}`);
    try {
      const res = await checkDomainDns(row.domain);
      const next = nextStatusFromDns(res);

      /* NULL MEANS LEAVE THE ROW ALONE. The DNS service being unreachable says
         nothing about the customer's DNS, and writing a status here would
         downgrade a working domain and send them to fix what is not broken. */
      if (next === null) {
        setChecked((m) => ({ ...m, [row.id]: ar
          ? 'تعذّر التحقق الآن؛ خدمة DNS غير متاحة. لم تتغيّر الحالة.'
          : 'Could not check right now — the DNS service is unreachable. Nothing was changed.' }));
        return;
      }

      await supabase.from('tenant_domains').update({ status: next }).eq('id', row.id);
      setChecked((m) => ({ ...m, [row.id]: next === 'active'
        ? (ar ? 'تم التحقق. النطاق يشير إلينا.' : 'Verified. The domain points to us.')
        : next === 'error'
          ? (ar ? 'يوجد سجل DNS لكنه يشير إلى مكان آخر.' : 'A DNS record exists but points somewhere else.')
          : (ar ? 'لا يوجد سجل بعد. قد يستغرق الانتشار حتى ٤٨ ساعة.' : 'No record yet. Propagation can take up to 48 hours.') }));
      await load();
    } finally {
      setBusy('');
    }
  }

  async function makePrimary(row) {
    setBusy(`p:${row.id}`);
    try {
      /* Cleared tenant-wide FIRST: a partial unique index allows one primary,
         so setting the new one before clearing the old is a constraint error. */
      await supabase.from('tenant_domains').update({ is_primary: false }).eq('tenant_id', tenant.id);
      await supabase.from('tenant_domains').update({ is_primary: true }).eq('id', row.id);
      await load();
    } finally {
      setBusy('');
    }
  }

  const list = rows || [];

  return (
    <section className="screen">
      <h1>{ar ? 'النطاق' : 'Domain'}</h1>
      <p className="lede">
        {ar
          ? 'يمكن عرض معرضك على نطاقك الخاص بدل العنوان الافتراضي. العنوان الافتراضي يبقى يعمل دائمًا.'
          : 'Your portfolio can be served on your own domain instead of the default address. The default keeps working either way.'}
      </p>

      {/* Said BEFORE they type, not after the database refuses. Adding a domain
          needs a paying subscription; drafting does not. */}
      {entitled === false && (
        <p className="gate">
          {ar
            ? 'ربط نطاق خاص متاح مع اشتراك فعّال. بناء المعرض ومعاينته يبقيان مجانيين.'
            : 'Connecting your own domain needs an active subscription. Building and previewing stay free.'}
        </p>
      )}

      <form className="add" onSubmit={add}>
        <label className="sr" htmlFor="dm">{ar ? 'النطاق' : 'Domain'}</label>
        <input
          id="dm"
          type="text"
          dir="ltr"
          placeholder="example.com"
          value={input}
          disabled={entitled === false || busy === 'add'}
          onChange={(ev) => setInput(ev.target.value)}
        />
        <button type="submit" disabled={entitled === false || busy === 'add' || !input.trim()}>
          {busy === 'add' ? (ar ? 'جارٍ الإضافة…' : 'Adding…') : (ar ? 'إضافة' : 'Add')}
        </button>
      </form>

      {error && <p className="err">{error}</p>}

      {rows === null && <p className="muted">{ar ? 'جارٍ القراءة…' : 'Reading…'}</p>}

      {rows !== null && list.length === 0 && (
        <p className="muted">
          {ar
            ? 'لا نطاق مربوط. معرضك يعمل على العنوان الافتراضي.'
            : 'No domain connected. Your portfolio works on its default address.'}
        </p>
      )}

      <ul className="rows">
        {list.map((row) => {
          const meta = domainStatusMeta(row.status, ar);
          const rec = dnsRecordFor(row.domain);
          return (
            <li className="row" key={row.id}>
              <div className="head">
                <span className="dm" dir="ltr">{row.domain}</span>
                <span className={`badge ${meta.tone}`}>{meta.label}</span>
                {row.is_primary && <span className="badge primary">{ar ? 'الأساسي' : 'Primary'}</span>}
              </div>

              {/* The record is shown for every domain that is not yet active,
                  not hidden behind a disclosure: it is the one thing the
                  customer has to act on, and it is why they are on this screen. */}
              {row.status !== 'active' && (
                <div className="dns">
                  <div className="dns-t">
                    {ar ? 'هذا السجل يُضاف عند مزوّد نطاقك:' : 'Add this record at your domain provider:'}
                  </div>
                  <dl>
                    <div><dt>{ar ? 'النوع' : 'Type'}</dt><dd dir="ltr">{rec.type}</dd></div>
                    <div><dt>{ar ? 'الاسم' : 'Host'}</dt><dd dir="ltr">{rec.host}</dd></div>
                    <div><dt>{ar ? 'القيمة' : 'Value'}</dt><dd dir="ltr">{rec.value}</dd></div>
                  </dl>
                </div>
              )}

              {checked[row.id] && <p className="said">{checked[row.id]}</p>}

              <div className="acts">
                <button type="button" onClick={() => verify(row)} disabled={busy === `v:${row.id}`}>
                  <Icon name="refresh" size={14} />
                  {busy === `v:${row.id}` ? (ar ? 'جارٍ التحقق…' : 'Checking…') : (ar ? 'تحديث الحالة' : 'Check now')}
                </button>
                {!row.is_primary && (
                  <button type="button" onClick={() => makePrimary(row)} disabled={busy === `p:${row.id}`}>
                    {ar ? 'تعيينه أساسيًا' : 'Make primary'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Removing a domain takes a live address offline. It stays in /admin
          with its confirmation rather than being rebuilt here from memory. */}
      {list.length > 0 && (
        <p className="muted foot">
          {ar ? 'لحذف نطاق، من المحرّر الحالي.' : 'To remove a domain, use the current editor.'}
          {' '}
          <a href="/admin">{ar ? 'فتح المحرّر الحالي' : 'Open the current editor'}</a>
        </p>
      )}

      <style jsx>{`
        .screen { max-width: 720px; }
        h1 { margin: 0 0 6px; font-size: var(--text-xl); font-family: var(--font-heading); }
        .lede { margin: 0 0 var(--space-4); color: var(--text-secondary);
                font-size: var(--text-sm); line-height: 1.7; }
        .gate { margin: 0 0 var(--space-4); padding: var(--space-3);
                border-radius: var(--radius-sm); background: var(--warning-bg);
                color: var(--warning-ink); font-size: var(--text-sm); line-height: 1.7; }

        .sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
              clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
        .add { display: flex; gap: 8px; margin-bottom: var(--space-3); }
        .add input {
          flex: 1; min-width: 0; min-block-size: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--border-default); border-radius: var(--radius-md);
          background: var(--surface-input); color: var(--text-primary);
          font: inherit; font-size: var(--field-text); text-align: start;
        }
        .add input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .add button {
          flex: none; min-height: var(--tap-min); padding: 0 var(--space-4);
          border: 1px solid transparent; border-radius: var(--radius-md);
          background: var(--action-primary-bg); color: var(--action-primary-fg);
          font: inherit; font-size: var(--text-sm); font-weight: 700; cursor: pointer;
        }
        .add button:disabled { opacity: 0.5; cursor: default; }
        .add button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        .err { margin: 0 0 var(--space-3); padding: var(--space-3);
               border-radius: var(--radius-sm); background: var(--danger-bg);
               color: var(--danger-ink); font-size: var(--text-sm); }
        .muted { color: var(--text-tertiary); font-size: var(--text-sm); line-height: 1.7; }
        .foot { margin-top: var(--space-4); }

        .rows { list-style: none; margin: 0; padding: 0; display: flex;
                flex-direction: column; gap: var(--space-3); }
        .row { border: 1px solid var(--border-default); border-radius: var(--radius-md);
               background: var(--surface-card); padding: var(--space-4); }
        .head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .dm { font-weight: 700; font-size: var(--text-md); overflow-wrap: anywhere; }
        .badge { font-size: var(--text-xs); font-weight: 600; border-radius: 999px;
                 padding: 2px 10px; border: 1px solid; }
        .badge.success { background: var(--success-bg); color: var(--success-ink); border-color: var(--success-border); }
        .badge.danger { background: var(--danger-bg); color: var(--danger-ink); border-color: var(--danger-border); }
        .badge.warning { background: var(--warning-bg); color: var(--warning-ink); border-color: var(--warning-border); }
        .badge.primary { background: var(--brand-soft); color: var(--text-primary); border-color: var(--brand-line); }

        .dns { margin-top: var(--space-3); padding: var(--space-3);
               border-radius: var(--radius-sm); background: var(--surface-hover); }
        .dns-t { font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; }
        dl { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-3); }
        dl div { min-width: 0; }
        dt { font-size: var(--text-xs); color: var(--text-tertiary); }
        dd { margin: 0; font-size: var(--text-sm); font-weight: 600; overflow-wrap: anywhere; }

        .said { margin: var(--space-3) 0 0; font-size: var(--text-xs);
                color: var(--text-secondary); line-height: 1.6; }

        .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: var(--space-3); }
        .acts button {
          display: inline-flex; align-items: center; gap: 6px;
          min-height: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--action-secondary-border); border-radius: var(--radius-sm);
          background: var(--action-secondary-bg); color: var(--action-secondary-fg);
          font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer;
        }
        .acts button:disabled { opacity: 0.5; cursor: default; }
        .acts button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
      `}</style>
    </section>
  );
}
