// /console — the owner's client management.
//
// One screen: a list of clients and the handful of things an operator actually
// does to one. It exists because those same capabilities live inside a
// 6,700-line /admin that is primarily a CLIENT's editor, and finding them there
// is the annoying part.
//
// IT DUPLICATES NO BUSINESS LOGIC. Every action calls the same Edge Function
// the admin already calls -- client-recovery for account operations,
// billing-subscription for entitlement -- and entitlement is read through
// deriveBilling(), the same helper. If a rule changes it changes in one place
// and both screens follow.
//
// Access is owner-only, enforced by the DATABASE: is_platform_owner() gates the
// gate here, and every function it calls re-checks on the server. Hiding the UI
// is not the boundary.
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { supabase } from '../../lib/supabase';
import { deriveBilling, statusLabel } from '../../lib/billing-status';
import { Button, Badge, Input, EmptyState, Icon, Skeleton, ToastProvider, useToast, ConfirmProvider, useConfirm } from '../../components/ui';

export default function ConsolePage() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Console />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Console() {
  const toast = useToast();
  const confirm = useConfirm();
  const [phase, setPhase] = useState('loading');   // loading | denied | ready
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState('');

  // Same stored preference the admin uses, applied on mount. _document.js
  // initialises it before paint; this keeps it correct after hydration and is
  // what makes /console honest in the theme-init route list.
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-admin-theme', localStorage.getItem('admin_theme') || 'dark');
    } catch (e) { /* private mode: fall through to the default */ }
  }, []);

  useEffect(() => { boot(); }, []);

  async function boot() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.replace('/admin'); return; }
    // The database decides. This call returns false for every client.
    const { data: isOwner } = await supabase.rpc('is_platform_owner');
    if (isOwner !== true) { setPhase('denied'); return; }
    await load();
    setPhase('ready');
  }

  async function load() {
    const [{ data: tenants }, { data: subs }, { data: members }] = await Promise.all([
      supabase.from('tenants').select('id, slug, name, status, created_at').order('created_at', { ascending: false }),
      supabase.from('subscriptions').select('*'),
      supabase.functions.invoke('client-recovery', { body: { action: 'list_orphans' } }).then(
        (r) => ({ data: r?.data?.members || [] }), () => ({ data: [] }),
      ),
    ]);
    const subByTenant = new Map((subs || []).map((s) => [s.tenant_id, s]));
    const memberByTenant = new Map((members || []).filter((m) => m.tenant_id).map((m) => [m.tenant_id, m]));
    setRows((tenants || []).map((t) => ({
      ...t,
      billing: deriveBilling(subByTenant.get(t.id)),
      subscription: subByTenant.get(t.id) || null,
      member: memberByTenant.get(t.id) || null,
    })));
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => [r.name, r.slug, r.member?.email, r.member?.username]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)));
  }, [rows, q]);

  const open = rows.find((r) => r.id === openId) || null;

  // ---- actions. Each one calls exactly what /admin calls. -------------------

  async function run(key, fn, okMsg) {
    setBusy(key);
    try {
      const err = await fn();
      if (err) { toast.error(err); return false; }
      if (okMsg) toast.success(okMsg);
      await load();
      return true;
    } catch (e) {
      toast.error(String(e?.message || e));
      return false;
    } finally { setBusy(''); }
  }

  async function resetPassword(row) {
    if (!row.member) { toast.error('No login account is attached to this client.'); return; }
    const ok = await confirm({
      title: 'Reset this password?',
      description: `A new password will be generated and emailed to ${row.member.email}. Their current one stops working immediately.`,
      confirmLabel: 'Reset', tone: 'danger',
    });
    if (!ok) return;
    await run(`reset:${row.id}`, async () => {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'send_welcome', tenant_id: row.id, user_id: row.member.user_id },
      });
      return error ? (error.message || 'Reset failed') : (data?.error || null);
    }, 'Password reset and emailed.');
  }

  async function changeEmail(row, email) {
    return run(`email:${row.id}`, async () => {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'update_email', user_id: row.member.user_id, email },
      });
      return error ? (error.message || 'Could not change the email') : (data?.error || null);
    }, 'Login email changed.');
  }

  async function grantFree(row) {
    const ok = await confirm({
      title: 'Grant free access?',
      description: `${row.name || row.slug} gets full access with no payment. Reversible at any time.`,
      confirmLabel: 'Grant',
    });
    if (!ok) return;
    await run(`comp:${row.id}`, async () => {
      const { data, error } = await supabase.functions.invoke('billing-subscription', {
        body: { action: 'grant_comp', tenant_id: row.id, comp_kind: 'convertible' },
      });
      return error ? (error.message || 'Could not grant access') : (data?.error || null);
    }, 'Free access granted.');
  }

  async function revokeFree(row) {
    const ok = await confirm({
      title: 'Revoke free access?',
      description: `${row.name || row.slug} loses access until they subscribe. Their content is untouched.`,
      confirmLabel: 'Revoke', tone: 'danger',
    });
    if (!ok) return;
    await run(`revoke:${row.id}`, async () => {
      const { data, error } = await supabase.functions.invoke('billing-subscription', {
        body: { action: 'cancel', tenant_id: row.id },
      });
      return error ? (error.message || 'Could not revoke') : (data?.error || null);
    }, 'Free access revoked.');
  }

  // ---- render ---------------------------------------------------------------

  if (phase === 'loading') {
    return <Shell><div className="skel">{[0,1,2,3,4].map((i) => <Skeleton key={i} width="100%" height={52} radius="10px" />)}</div></Shell>;
  }
  if (phase === 'denied') {
    return (
      <Shell>
        <EmptyState
          icon={<Icon name="alert-triangle" size={24} />}
          title="This area is for the platform owner"
          description="Your account manages a portfolio, not the platform."
          action={<Button onClick={() => window.location.assign('/admin')}>Go to my dashboard</Button>}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="head">
        <h1>Clients <span className="count">{rows.length}</span></h1>
        <input
          className="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, address or email" aria-label="Search clients"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Icon name="users" size={24} />} title="No client matches that." compact />
      ) : (
        <div className="table" role="table">
          <div className="tr th" role="row">
            <span role="columnheader">Client</span>
            <span role="columnheader">Email</span>
            <span role="columnheader">Access</span>
            <span role="columnheader" />
          </div>
          {filtered.map((r) => (
            <div className="tr" role="row" key={r.id}>
              <span role="cell" className="c-name">
                <b>{r.name || r.slug}</b>
                <span className="slug" dir="ltr">/{r.slug}</span>
              </span>
              <span role="cell" className="c-email" dir="ltr">{r.member?.email || <i>no login</i>}</span>
              <span role="cell">
                <Badge tone={accessTone(r)}>{accessLabel(r)}</Badge>
                {r.status === 'disabled' && <Badge tone="danger">Suspended</Badge>}
              </span>
              <span role="cell" className="c-act">
                <Button size="sm" variant="ghost" onClick={() => window.open(`/${r.slug}`, '_blank', 'noopener')}>Portfolio</Button>
                <Button size="sm" variant="ghost" onClick={() => window.open('/admin', '_blank', 'noopener')}>Editor</Button>
                <Button size="sm" variant="secondary" onClick={() => setOpenId(r.id)}>Manage</Button>
              </span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <ManagePanel
          row={open}
          busy={busy}
          onClose={() => setOpenId(null)}
          onResetPassword={() => resetPassword(open)}
          onChangeEmail={(email) => changeEmail(open, email)}
          onGrantFree={() => grantFree(open)}
          onRevokeFree={() => revokeFree(open)}
        />
      )}

      <style jsx>{`
        .head { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-5); }
        h1 { font-size: var(--text-2xl); font-weight: 700; margin: 0; }
        .count { margin-inline-start: var(--space-2); font-size: var(--text-md); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
        .search { margin-inline-start: auto; min-width: 260px; flex: 1 1 260px; max-width: 380px; padding: 10px 14px; min-height: 44px;
                  background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md);
                  color: var(--text-primary); font: inherit; }
        .search:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 2px var(--brand-focus); }
        .skel { display: flex; flex-direction: column; gap: var(--space-2); }
        .table { display: flex; flex-direction: column; }
        .tr { display: grid; grid-template-columns: 1.4fr 1.6fr 0.9fr auto; gap: var(--space-3); align-items: center;
              padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
        .th { font-size: var(--text-sm); font-weight: 600; color: var(--text-tertiary); border-bottom-color: var(--border-strong); }
        .c-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .slug { font-size: var(--text-sm); color: var(--text-tertiary); }
        .c-email { font-size: var(--text-sm); color: var(--text-secondary); overflow-wrap: anywhere; }
        .c-email i { color: var(--text-muted); }
        .c-act { display: flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap; }
        @media (max-width: 860px) {
          .tr { grid-template-columns: 1fr; gap: var(--space-2); }
          .th { display: none; }
          .c-act { justify-content: flex-start; }
        }
      `}</style>
    </Shell>
  );
}

function accessLabel(r) {
  if (r.billing.state === 'comped') return 'Free';
  return statusLabel(r.billing.state, 'en');
}
function accessTone(r) {
  if (r.billing.state === 'comped') return 'accent';
  return r.billing.entitled ? 'success' : 'neutral';
}

function ManagePanel({ row, busy, onClose, onResetPassword, onChangeEmail, onGrantFree, onRevokeFree }) {
  const [email, setEmail] = useState(row.member?.email || '');
  const [editing, setEditing] = useState(false);
  const comped = row.billing.state === 'comped';

  return (
    <div className="bg" onClick={onClose} role="presentation">
      <div className="panel" role="dialog" aria-modal="true" aria-label={`Manage ${row.name || row.slug}`} onClick={(e) => e.stopPropagation()}>
        <div className="ph">
          <div>
            <b>{row.name || row.slug}</b>
            <div className="sub" dir="ltr">/{row.slug}</div>
          </div>
          <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <dl className="facts">
          <dt>Access</dt><dd>{accessLabel(row)}</dd>
          <dt>Workspace</dt><dd>{row.status}</dd>
          <dt>Login</dt><dd dir="ltr">{row.member?.email || 'no account attached'}</dd>
        </dl>

        {row.member && (
          <section>
            <h3>Login email</h3>
            {editing ? (
              <form onSubmit={async (e) => { e.preventDefault(); if (await onChangeEmail(email.trim())) setEditing(false); }}>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required dir="ltr" aria-label="New login email" />
                <div className="row">
                  <Button type="submit" size="sm" loading={busy === `email:${row.id}`}>Save</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setEmail(row.member.email || ''); setEditing(false); }}>Cancel</Button>
                </div>
              </form>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change email</Button>
            )}
          </section>
        )}

        <section>
          <h3>Password</h3>
          <p>A new password is generated and emailed to them. You never see it.</p>
          <Button size="sm" variant="secondary" loading={busy === `reset:${row.id}`} onClick={onResetPassword} disabled={!row.member}>
            Reset password
          </Button>
        </section>

        <section>
          <h3>Free access</h3>
          {comped ? (
            <>
              <p>This client has complimentary access.</p>
              <Button size="sm" variant="danger" loading={busy === `revoke:${row.id}`} onClick={onRevokeFree}>Revoke free access</Button>
            </>
          ) : (
            <>
              <p>Give full access with no payment. Reversible.</p>
              <Button size="sm" variant="secondary" loading={busy === `comp:${row.id}`} onClick={onGrantFree}>Grant free access</Button>
            </>
          )}
        </section>

        <section className="links">
          <Button size="sm" variant="ghost" onClick={() => window.open(`/${row.slug}`, '_blank', 'noopener')}>Open portfolio ↗</Button>
          <Button size="sm" variant="ghost" onClick={() => window.open('/admin', '_blank', 'noopener')}>Open editor ↗</Button>
        </section>
      </div>

      <style jsx>{`
        .bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: flex-end; z-index: 60; }
        .panel { inline-size: min(440px, 100%); block-size: 100%; overflow-y: auto; background: var(--bg-primary);
                 border-inline-start: 1px solid var(--border); padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-5); }
        .ph { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
        .ph b { font-size: var(--text-xl); }
        .sub { font-size: var(--text-sm); color: var(--text-tertiary); margin-top: 2px; }
        .x { inline-size: 44px; block-size: 44px; border: none; background: none; color: var(--text-secondary); font-size: 22px; cursor: pointer; }
        .x:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .facts { display: grid; grid-template-columns: auto 1fr; gap: var(--space-2) var(--space-4); margin: 0; font-size: var(--text-md); }
        dt { color: var(--text-tertiary); }
        dd { margin: 0; color: var(--text-primary); overflow-wrap: anywhere; }
        section { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
        h3 { margin: 0; font-size: var(--text-md); font-weight: 700; }
        p { margin: 0; font-size: var(--text-sm); color: var(--text-tertiary); line-height: 1.5; }
        .row { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
        .links { flex-direction: row; gap: var(--space-2); flex-wrap: wrap; }
      `}</style>
    </div>
  );
}

function Shell({ children }) {
  return (
    <>
      <Head>
        <title>Clients — Designakum</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="wrap">{children}</main>
      <style jsx>{`
        .wrap { max-inline-size: 1080px; margin: 0 auto; padding: var(--gutter); }
        @media (max-width: 720px) { .wrap { padding: 16px; } }
      `}</style>
    </>
  );
}
