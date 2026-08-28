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


// Bilingual, like everything else the operator sees. Arabic follows the
// constitution's rule 11: no verb aimed at a person, so these are verbal nouns
// and statements of state rather than commands. tests/admin-arabic-voice
// enforces it across the tree, this file included.
const S = {
  en: {
    clients: 'Clients', removed: 'Removed',
    search: 'Search name, address or email',
    colClient: 'Client', colEmail: 'Email', colAccess: 'Access', colRemoved: 'Removed',
    noMatch: 'No client matches that.', noneRemoved: 'Nobody has been removed.',
    noLogin: 'no login', suspended: 'Suspended', free: 'Free', pieces: 'pieces', was: 'was',
    portfolio: 'Portfolio', editor: 'Editor', manage: 'Manage',
    signinTitle: 'Sign in to manage clients',
    signinDesc: 'Use the same login as the dashboard, then come back here.',
    signinGo: 'Go to sign in',
    deniedTitle: 'This area is for the platform owner',
    deniedDesc: 'Your account manages a portfolio, not the platform.',
    deniedGo: 'Go to my dashboard',
    access: 'Access', workspace: 'Workspace', login: 'Login', noAccount: 'no account attached',
    loginEmail: 'Login email', changeEmail: 'Change email', save: 'Save', cancel: 'Cancel',
    password: 'Password',
    passwordDesc: 'A new password is generated and emailed to them. You never see it.',
    resetPassword: 'Reset password',
    freeAccess: 'Free access',
    hasComp: 'This client has complimentary access.',
    grantDesc: 'Give full access with no payment. Reversible.',
    grant: 'Grant free access', revoke: 'Revoke free access',
    removeTitle: 'Remove this client',
    removeDesc: 'Deletes their portfolio, their content and their login. Their email becomes free to sign up with again. This cannot be undone.',
    removeBtn: 'Delete permanently',
    openPortfolio: 'Open portfolio ↗', openEditor: 'Open editor ↗',
    confirmPrompt: 'This permanently deletes {name}, their portfolio and their login.\nTheir email becomes free to sign up with again. This cannot be undone.\n\nType the address to confirm: {slug}',
    confirmMismatch: 'That did not match. Nothing was deleted.',
    del_done: 'Client deleted. Their email is free to use again.',
    del_blocked_title: 'A subscription is still open',
    del_blocked_desc: 'PayPal still has a {state} subscription for this client ({env}, {id}). Cancelling it at PayPal first is the clean route. Deleting anyway is allowed — the subscription id is recorded in Removed so it is not lost.',
    del_force: 'Delete anyway',
    resetConfirmTitle: 'Reset this password?',
    resetConfirmDesc: 'A new password will be generated and emailed to {email}. Their current one stops working immediately.',
    reset: 'Reset',
    grantTitle: 'Grant free access?',
    grantConfirmDesc: '{name} gets full access with no payment. Reversible at any time.',
    revokeTitle: 'Revoke free access?',
    revokeConfirmDesc: '{name} loses access until they subscribe. Their content is untouched.',
    noLoginAttached: 'No login account is attached to this client.',
    passwordSent: 'Password reset and emailed.',
    emailChanged: 'Login email changed.',
    granted: 'Free access granted.', revoked: 'Free access revoked.',
    failDelete: 'Could not delete this client',
    addClient: 'Add client', addTitle: 'New client',
    fName: 'Name', fAddress: 'Portfolio link', fEmail: 'Email', fUsername: 'Username',
    fLang: 'Their language', create: 'Create client',
    slugHint: 'This becomes their web address.',
    credsTitle: 'Their sign-in details', credsNote: 'Shown once. Copy them now — the password is not stored anywhere.',
    copy: 'Copy', copied: 'Copied', done: 'Done',
    created: 'Client created.',
    revenue: 'Revenue', paying: 'Paying', freeCount: 'On free access', notPaying: 'Not paying',
    thisMonth: 'Collected this month', allTime: 'Collected all time',
  },
  ar: {
    clients: 'العملاء', removed: 'المحذوفون',
    search: 'بحث بالاسم أو العنوان أو البريد',
    colClient: 'العميل', colEmail: 'البريد', colAccess: 'الوصول', colRemoved: 'تاريخ الحذف',
    noMatch: 'لا يوجد عميل مطابق.', noneRemoved: 'لم يُحذف أحد.',
    noLogin: 'بلا حساب', suspended: 'معلّق', free: 'مجاني', pieces: 'أعمال', was: 'كان',
    portfolio: 'المعرض', editor: 'المحرّر', manage: 'إدارة',
    signinTitle: 'تسجيل الدخول لإدارة العملاء',
    signinDesc: 'نفس حساب لوحة التحكم، ثم الرجوع إلى هنا.',
    signinGo: 'الانتقال لتسجيل الدخول',
    deniedTitle: 'هذه المنطقة لمالك المنصّة',
    deniedDesc: 'حسابك يدير معرضًا، لا المنصّة.',
    deniedGo: 'الانتقال إلى لوحتي',
    access: 'الوصول', workspace: 'المساحة', login: 'الحساب', noAccount: 'لا يوجد حساب مرتبط',
    loginEmail: 'بريد الدخول', changeEmail: 'تغيير البريد', save: 'حفظ', cancel: 'إلغاء',
    password: 'كلمة المرور',
    passwordDesc: 'تُنشأ كلمة مرور جديدة وتُرسل إليهم بالبريد. لا تظهر لك أبدًا.',
    resetPassword: 'إعادة تعيين كلمة المرور',
    freeAccess: 'الوصول المجاني',
    hasComp: 'هذا العميل لديه وصول مجاني.',
    grantDesc: 'وصول كامل بلا دفع. قابل للتراجع.',
    grant: 'منح وصول مجاني', revoke: 'سحب الوصول المجاني',
    removeTitle: 'حذف هذا العميل',
    removeDesc: 'يحذف معرضه ومحتواه وحسابه. بريده يصبح متاحًا للتسجيل من جديد. لا يمكن التراجع عن هذا.',
    removeBtn: 'حذف نهائي',
    openPortfolio: 'فتح المعرض ↗', openEditor: 'فتح المحرّر ↗',
    confirmPrompt: 'هذا يحذف {name} ومعرضه وحسابه نهائيًا.\nبريده يصبح متاحًا للتسجيل من جديد. لا يمكن التراجع.\n\nكتابة العنوان للتأكيد: {slug}',
    confirmMismatch: 'لم يطابق. لم يُحذف شيء.',
    del_done: 'تم حذف العميل. بريده متاح للاستخدام من جديد.',
    del_blocked_title: 'هناك اشتراك ما زال مفتوحًا',
    del_blocked_desc: 'لدى باي بال اشتراك بحالة {state} لهذا العميل ({env}، {id}). إلغاؤه في باي بال أولًا هو الطريق النظيف. الحذف رغم ذلك متاح — ورقم الاشتراك يُسجَّل في «المحذوفون» حتى لا يضيع.',
    del_force: 'الحذف رغم ذلك',
    resetConfirmTitle: 'إعادة تعيين كلمة المرور؟',
    resetConfirmDesc: 'ستُنشأ كلمة مرور جديدة وتُرسل إلى {email}. كلمتهم الحالية تتوقف فورًا.',
    reset: 'إعادة التعيين',
    grantTitle: 'منح وصول مجاني؟',
    grantConfirmDesc: '{name} يحصل على وصول كامل بلا دفع. قابل للتراجع في أي وقت.',
    revokeTitle: 'سحب الوصول المجاني؟',
    revokeConfirmDesc: '{name} يفقد الوصول حتى الاشتراك. محتواه لا يتغيّر.',
    noLoginAttached: 'لا يوجد حساب دخول مرتبط بهذا العميل.',
    passwordSent: 'أُعيد تعيين كلمة المرور وأُرسلت.',
    emailChanged: 'تم تغيير بريد الدخول.',
    granted: 'تم منح الوصول المجاني.', revoked: 'تم سحب الوصول المجاني.',
    failDelete: 'تعذّر حذف هذا العميل',
    addClient: 'إضافة عميل', addTitle: 'عميل جديد',
    fName: 'الاسم', fAddress: 'رابط المعرض', fEmail: 'البريد', fUsername: 'اسم المستخدم',
    fLang: 'لغته', create: 'إنشاء العميل',
    slugHint: 'هذا يصبح عنوان موقعهم.',
    credsTitle: 'بيانات الدخول', credsNote: 'تظهر مرة واحدة. نسخها الآن ضروري — كلمة المرور لا تُحفظ في أي مكان.',
    copy: 'نسخ', copied: 'تم النسخ', done: 'تم',
    created: 'تم إنشاء العميل.',
    revenue: 'الإيرادات', paying: 'يدفعون', freeCount: 'وصول مجاني', notPaying: 'لا يدفعون',
    thisMonth: 'المحصّل هذا الشهر', allTime: 'المحصّل الإجمالي',
  },
};

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
  const [phase, setPhase] = useState('loading');   // loading | signedout | denied | ready
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [creds, setCreds] = useState(null);
  const [busy, setBusy] = useState('');
  const [view, setView] = useState('clients');   // clients | archived
  const [archived, setArchived] = useState([]);
  const [payments, setPayments] = useState([]);
  // Same stored preference the admin writes, so the operator does not switch
  // language twice. Read after mount: the server cannot know it.
  const [lang, setLang] = useState('ar');
  useEffect(() => {
    try { setLang(localStorage.getItem('lang') === 'en' ? 'en' : 'ar'); } catch (e) { /* default */ }
  }, []);
  const ar = lang === 'ar';
  const t = (k) => (S[lang] || S.en)[k] ?? k;
  function toggleLang() {
    const next = ar ? 'en' : 'ar';
    setLang(next);
    try { localStorage.setItem('lang', next); } catch (e) { /* ignore */ }
  }

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
    // Bouncing straight to /admin made this look like it had no sign-in at all.
    // Say what is happening instead. There is deliberately no sign-in FORM here:
    // one login screen for the platform is the whole point, and it lives at
    // /admin, which reads ?next= and sends them straight back here rather than
    // dropping them on the dashboard to retype the URL.
    if (!session) { setPhase('signedout'); return; }
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
    const { data: gone } = await supabase
      .from('deleted_clients').select('*').order('deleted_at', { ascending: false });
    setArchived(gone || []);
    // Money actually received. `payments` is the ledger the webhook writes; it
    // is not recomputed here, only summed.
    const { data: pays } = await supabase
      .from('payments').select('amount, currency, status, created_at');
    setPayments(pays || []);
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

  // `amount` is stored in minor units (integer), so it is divided once here and
  // nowhere else. Only succeeded payments count -- a failed charge is not money.
  const money = useMemo(() => {
    const ok = payments.filter((p) => ['succeeded', 'completed', 'paid'].includes(String(p.status)));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const sum = (list) => list.reduce((n, p) => n + (Number(p.amount) || 0), 0) / 100;
    const cur = ok[0]?.currency || 'USD';
    return {
      all: sum(ok),
      month: sum(ok.filter((p) => new Date(p.created_at).getTime() >= monthStart)),
      currency: cur,
      paying: rows.filter((r) => r.billing.entitled && r.billing.state !== 'comped').length,
      free: rows.filter((r) => r.billing.state === 'comped').length,
      unpaid: rows.filter((r) => !r.billing.entitled).length,
    };
  }, [payments, rows]);
  const fmtMoney = (n) => `${money.currency} ${n.toFixed(2)}`;

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
      title: t('resetConfirmTitle'),
      description: t('resetConfirmDesc').replace('{email}', row.member.email),
      confirmLabel: t('reset'), tone: 'danger',
    });
    if (!ok) return;
    await run(`reset:${row.id}`, async () => {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'send_welcome', tenant_id: row.id, user_id: row.member.user_id },
      });
      return error ? (error.message || 'Reset failed') : (data?.error || null);
    }, t('passwordSent'));
  }

  async function changeEmail(row, email) {
    return run(`email:${row.id}`, async () => {
      const { data, error } = await supabase.functions.invoke('client-recovery', {
        body: { action: 'update_email', user_id: row.member.user_id, email },
      });
      return error ? (error.message || 'Could not change the email') : (data?.error || null);
    }, t('emailChanged'));
  }

  async function grantFree(row) {
    const ok = await confirm({
      title: t('grantTitle'),
      description: t('grantConfirmDesc').replace('{name}', row.name || row.slug),
      confirmLabel: t('grant'),
    });
    if (!ok) return;
    await run(`comp:${row.id}`, async () => {
      const { data, error } = await supabase.functions.invoke('billing-subscription', {
        body: { action: 'grant_comp', tenant_id: row.id, comp_kind: 'convertible' },
      });
      return error ? (error.message || 'Could not grant access') : (data?.error || null);
    }, t('granted'));
  }

  async function revokeFree(row) {
    const ok = await confirm({
      title: t('revokeTitle'),
      description: t('revokeConfirmDesc').replace('{name}', row.name || row.slug),
      confirmLabel: t('revoke'), tone: 'danger',
    });
    if (!ok) return;
    await run(`revoke:${row.id}`, async () => {
      const { data, error } = await supabase.functions.invoke('billing-subscription', {
        body: { action: 'cancel', tenant_id: row.id },
      });
      return error ? (error.message || 'Could not revoke') : (data?.error || null);
    }, t('revoked'));
  }

  // Removes the workspace and the client's login outright. The Edge Function
  // re-checks ownership, refuses while a subscription could still be charged,
  // and requires the slug back as confirmation -- none of which is enforced
  // here, because a delete must not trust the browser.
  async function deleteClient(row) {
    const typed = window.prompt(
      t('confirmPrompt').replace('{name}', row.name || row.slug).replace('{slug}', row.slug),
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== row.slug.toLowerCase()) {
      toast.error(t('confirmMismatch'));
      return;
    }
    const attempt = async (force) => {
      const { data, error } = await supabase.functions.invoke('delete-client', {
        body: { tenant_id: row.id, confirm_slug: typed.trim(), ...(force ? { force: true } : {}) },
      });
      if (error) return { blocked: await readFnBlock(error, t) };
      return { err: data?.error || null };
    };

    setBusy(`del:${row.id}`);
    let first;
    try { first = await attempt(false); } finally { setBusy(''); }

    // 409 means a subscription could still be charged. Offer the override
    // rather than a dead end -- a live `pending` that was never approved would
    // otherwise make the workspace undeletable forever. The orphaned id is
    // recorded in the archive either way.
    if (first.blocked?.kind === 'subscription_live') {
      const b = first.blocked;
      const go = await confirm({
        title: t('del_blocked_title'),
        description: t('del_blocked_desc')
          .replace('{state}', b.state)
          .replace('{env}', b.environment || '—')
          .replace('{id}', b.provider_subscription_id || '—'),
        confirmLabel: t('del_force'),
        tone: 'danger',
      });
      if (!go) return;
      await run(`del:${row.id}`, async () => (await attempt(true)).err, t('del_done'));
      setOpenId(null);
      return;
    }
    if (first.blocked) { toast.error(first.blocked.message); return; }
    if (first.err) { toast.error(first.err); return; }
    toast.success(t('del_done'));
    await load();
    setOpenId(null);
  }

  // Creating a client is two steps, the same two the admin used: insert the
  // workspace (owner-only by RLS), then invite-client attaches a login to it
  // and returns credentials once. Nothing is reimplemented.
  async function createClient(form) {
    const slug = form.slug.trim().toLowerCase();
    setBusy('create');
    try {
      const { data: tRow, error: tErr } = await supabase.from('tenants')
        .insert({ slug, name: form.name.trim() || slug, default_lang: form.lang, status: 'active' })
        .select().single();
      if (tErr) {
        toast.error(/duplicate|unique/i.test(tErr.message) ? `"${slug}" is taken.` : tErr.message);
        return false;
      }
      const { data, error } = await supabase.functions.invoke('invite-client', {
        body: { tenant_id: tRow.id, email: form.email.trim(), username: form.username.trim() },
      });
      if (error || data?.error) {
        let msg = data?.error || error?.message;
        try { const b = await error?.context?.json?.(); if (b?.detail) msg = `${b.error}: ${b.detail}`; } catch (e) {}
        // The workspace exists but has no login. Leave it -- deleting it here
        // could race the invite, and the console can remove it deliberately.
        toast.error(String(msg));
        await load();
        return false;
      }
      setCreds({
        workspace: form.name.trim() || slug,
        url: `${window.location.origin}/${slug}`,
        email: data?.email || form.email.trim(),
        username: data?.username || form.username.trim(),
        password: data?.temp_password || '',
      });
      toast.success(t('created'));
      await load();
      return true;
    } catch (e) {
      toast.error(String(e?.message || e));
      return false;
    } finally { setBusy(''); }
  }

  // ---- render ---------------------------------------------------------------

  if (phase === 'loading') {
    return <Shell lang={lang}><div className="skel">{[0,1,2,3,4].map((i) => <Skeleton key={i} width="100%" height={52} radius="10px" />)}</div></Shell>;
  }
  if (phase === 'signedout') {
    return (
      <Shell lang={lang}>
        <EmptyState
          icon={<Icon name="user" size={24} />}
          title={t('signinTitle')}
          description={t('signinDesc')}
          action={<Button onClick={() => window.location.assign('/admin?next=/console')}>{t('signinGo')}</Button>}
        />
      </Shell>
    );
  }

  if (phase === 'denied') {
    return (
      <Shell lang={lang}>
        <EmptyState
          icon={<Icon name="alert-triangle" size={24} />}
          title={t('deniedTitle')}
          description={t('deniedDesc')}
          action={<Button onClick={() => window.location.assign('/admin')}>{t('deniedGo')}</Button>}
        />
      </Shell>
    );
  }

  return (
    <Shell lang={lang}>
      <div className="head">
        <h1>
          {view === 'clients' ? t('clients') : t('removed')}
          <span className="count">{view === 'clients' ? rows.length : archived.length}</span>
        </h1>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'clients'}
                  className={view === 'clients' ? 'on' : ''} onClick={() => setView('clients')}>{t('clients')}</button>
          <button type="button" role="tab" aria-selected={view === 'archived'}
                  className={view === 'archived' ? 'on' : ''} onClick={() => setView('archived')}>{t('removed')}</button>
        </div>
        {view === 'clients' && (
          <Button size="sm" onClick={() => setAdding(true)}>+ {t('addClient')}</Button>
        )}
        <button type="button" className="lang" onClick={toggleLang} aria-label={ar ? 'Switch to English' : 'التبديل إلى العربية'}>
          {ar ? 'EN' : 'ع'}
        </button>
        {view === 'clients' && (
          <input
            className="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('search')} aria-label={t('search')}
          />
        )}
      </div>

      {view === 'clients' && (
        <div className="money">
          <div className="m"><b>{fmtMoney(money.month)}</b><span>{t('thisMonth')}</span></div>
          <div className="m"><b>{fmtMoney(money.all)}</b><span>{t('allTime')}</span></div>
          <div className="m"><b>{money.paying}</b><span>{t('paying')}</span></div>
          <div className="m"><b>{money.free}</b><span>{t('freeCount')}</span></div>
          <div className="m"><b>{money.unpaid}</b><span>{t('notPaying')}</span></div>
        </div>
      )}

      {view === 'archived' ? (
        archived.length === 0 ? (
          <EmptyState icon={<Icon name="users" size={24} />} title={t('noneRemoved')} compact />
        ) : (
          <div className="table" role="table">
            <div className="tr arc th" role="row">
              <span role="columnheader">{t('colClient')}</span>
              <span role="columnheader">{t('colEmail')}</span>
              <span role="columnheader">{t('colRemoved')}</span>
            </div>
            {archived.map((a) => (
              <div className="tr arc" role="row" key={a.id}>
                <span role="cell" className="c-name">
                  <b>{a.name || a.slug}</b>
                  <span className="slug" dir="ltr">/{a.slug} · {a.projects_count} {t('pieces')}</span>
                </span>
                <span role="cell" className="c-email" dir="ltr">{a.email || <i>{t('noLogin')}</i>}</span>
                <span role="cell" className="c-email">
                  {new Date(a.deleted_at).toLocaleDateString('en-GB')}
                  {a.billing_state && <span className="slug"> · {t('was')} {a.billing_state}</span>}
                </span>
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Icon name="users" size={24} />} title={t('noMatch')} compact />
      ) : (
        <div className="table" role="table">
          <div className="tr th" role="row">
            <span role="columnheader">{t('colClient')}</span>
            <span role="columnheader">{t('colEmail')}</span>
            <span role="columnheader">{t('colAccess')}</span>
            <span role="columnheader" />
          </div>
          {filtered.map((r) => (
            <div className="tr" role="row" key={r.id}>
              <span role="cell" className="c-name">
                <b>{r.name || r.slug}</b>
                <span className="slug" dir="ltr">/{r.slug}</span>
              </span>
              <span role="cell" className="c-email" dir="ltr">{r.member?.email || <i>{t('noLogin')}</i>}</span>
              <span role="cell">
                <Badge tone={accessTone(r)}>{accessLabel(r, t)}</Badge>
                {r.status === 'disabled' && <Badge tone="danger">{t('suspended')}</Badge>}
              </span>
              <span role="cell" className="c-act">
                <Button size="sm" variant="ghost" onClick={() => window.open(`/${r.slug}`, '_blank', 'noopener')}>{t('portfolio')}</Button>
                <Button size="sm" variant="ghost" onClick={() => window.open('/admin', '_blank', 'noopener')}>{t('editor')}</Button>
                <Button size="sm" variant="secondary" onClick={() => setOpenId(r.id)}>{t('manage')}</Button>
              </span>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddClientPanel
          t={t} busy={busy}
          onClose={() => setAdding(false)}
          onCreate={async (form) => { if (await createClient(form)) setAdding(false); }}
        />
      )}

      {creds && <CredentialsPanel t={t} creds={creds} onClose={() => setCreds(null)} />}

      {open && (
        <ManagePanel
          row={open}
          busy={busy}
          t={t}
          ar={ar}
          onClose={() => setOpenId(null)}
          onResetPassword={() => resetPassword(open)}
          onChangeEmail={(email) => changeEmail(open, email)}
          onGrantFree={() => grantFree(open)}
          onRevokeFree={() => revokeFree(open)}
          onDelete={() => deleteClient(open)}
        />
      )}

      <style jsx>{`
        .head { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-5); }
        h1 { font-size: var(--text-2xl); font-weight: 700; margin: 0; }
        .count { margin-inline-start: var(--space-2); font-size: var(--text-md); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
        .tabs { display: inline-flex; gap: 2px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 3px; }
        .tabs button { padding: 6px 14px; min-height: 34px; border: none; background: none; border-radius: var(--radius-sm);
                       color: var(--text-tertiary); font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
        .tabs button.on { background: var(--bg-elevated); color: var(--text-primary); }
        .tabs button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .lang { min-width: 44px; min-height: 40px; padding: 0 12px; background: var(--bg-secondary); border: 1px solid var(--border);
                border-radius: var(--radius-md); color: var(--text-secondary); font: inherit; font-weight: 700; cursor: pointer; }
        .lang:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .search { margin-inline-start: auto; min-width: 260px; flex: 1 1 260px; max-width: 380px; padding: 10px 14px; min-height: 44px;
                  background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md);
                  color: var(--text-primary); font: inherit; }
        .search:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 2px var(--brand-focus); }
        .skel { display: flex; flex-direction: column; gap: var(--space-2); }
        .money { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-3); margin-bottom: var(--space-5); }
        .m { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-4); }
        .m b { display: block; font-size: var(--text-xl); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-primary); }
        .m span { display: block; margin-top: 2px; font-size: var(--text-sm); color: var(--text-tertiary); }
        @media (max-width: 860px) { .money { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        .table { display: flex; flex-direction: column; }
        .tr { display: grid; grid-template-columns: 1.4fr 1.6fr 0.9fr auto; gap: var(--space-3); align-items: center;
              padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
        .th { font-size: var(--text-sm); font-weight: 600; color: var(--text-tertiary); border-bottom-color: var(--border-strong); }
        .c-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .slug { font-size: var(--text-sm); color: var(--text-tertiary); }
        .c-email { font-size: var(--text-sm); color: var(--text-secondary); overflow-wrap: anywhere; }
        .c-email i { color: var(--text-muted); }
        .c-act { display: flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap; }
        .arc { grid-template-columns: 1.4fr 1.6fr 1fr; opacity: 0.75; }
        @media (max-width: 860px) {
          .tr { grid-template-columns: 1fr; gap: var(--space-2); }
          .th { display: none; }
          .c-act { justify-content: flex-start; }
        }
      `}</style>
    </Shell>
  );
}

// supabase-js puts a non-2xx Edge Function body inside error.context. Reading
// it is what turns "Edge Function returned a non-2xx status code" into the
// actual reason, which for a delete is usually "the subscription is still live".
async function readFnBlock(error, t) {
  try {
    const body = await error?.context?.json?.();
    if (!body) return { kind: 'unknown', message: t('failDelete') };
    if (body.error === 'subscription_live') {
      return {
        kind: 'subscription_live',
        state: body.state,
        environment: body.environment,
        provider_subscription_id: body.provider_subscription_id,
      };
    }
    return { kind: body.error, message: body.detail || body.error };
  } catch (e) {
    return { kind: 'unknown', message: 'Could not delete this client' };
  }
}

function accessLabel(r, t) {
  if (r.billing.state === 'comped') return t('free');
  return statusLabel(r.billing.state, t('free') === 'Free' ? 'en' : 'ar');
}
function accessTone(r) {
  if (r.billing.state === 'comped') return 'accent';
  return r.billing.entitled ? 'success' : 'neutral';
}

function ManagePanel({ row, busy, t, ar, onClose, onResetPassword, onChangeEmail, onGrantFree, onRevokeFree, onDelete }) {
  const [email, setEmail] = useState(row.member?.email || '');
  const [editing, setEditing] = useState(false);
  const comped = row.billing.state === 'comped';

  return (
    <div className="bg" onClick={onClose} role="presentation">
      <div className="panel" role="dialog" aria-modal="true" aria-label={`${t('manage')} ${row.name || row.slug}`} onClick={(e) => e.stopPropagation()}>
        <div className="ph">
          <div>
            <b>{row.name || row.slug}</b>
            <div className="sub" dir="ltr">/{row.slug}</div>
          </div>
          <button type="button" className="x" onClick={onClose} aria-label={t('cancel')}>×</button>
        </div>

        <dl className="facts">
          <dt>{t('access')}</dt><dd>{accessLabel(row, t)}</dd>
          <dt>{t('workspace')}</dt><dd>{row.status}</dd>
          <dt>{t('login')}</dt><dd dir="ltr">{row.member?.email || t('noAccount')}</dd>
        </dl>

        {row.member && (
          <section>
            <h3>{t('loginEmail')}</h3>
            {editing ? (
              <form onSubmit={async (e) => { e.preventDefault(); if (await onChangeEmail(email.trim())) setEditing(false); }}>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required dir="ltr" aria-label={t('loginEmail')} />
                <div className="row">
                  <Button type="submit" size="sm" loading={busy === `email:${row.id}`}>{t('save')}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setEmail(row.member.email || ''); setEditing(false); }}>{t('cancel')}</Button>
                </div>
              </form>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{t('changeEmail')}</Button>
            )}
          </section>
        )}

        <section>
          <h3>{t('password')}</h3>
          <p>{t('passwordDesc')}</p>
          <Button size="sm" variant="secondary" loading={busy === `reset:${row.id}`} onClick={onResetPassword} disabled={!row.member}>
            {t('resetPassword')}
          </Button>
        </section>

        <section>
          <h3>{t('freeAccess')}</h3>
          {comped ? (
            <>
              <p>{t('hasComp')}</p>
              <Button size="sm" variant="danger" loading={busy === `revoke:${row.id}`} onClick={onRevokeFree}>{t('revoke')}</Button>
            </>
          ) : (
            <>
              <p>{t('grantDesc')}</p>
              <Button size="sm" variant="secondary" loading={busy === `comp:${row.id}`} onClick={onGrantFree}>{t('grant')}</Button>
            </>
          )}
        </section>

        <section className="danger">
          <h3>{t('removeTitle')}</h3>
          <p>{t('removeDesc')}</p>
          <Button size="sm" variant="danger" loading={busy === `del:${row.id}`} onClick={onDelete}>
            {t('removeBtn')}
          </Button>
        </section>

        <section className="links">
          <Button size="sm" variant="ghost" onClick={() => window.open(`/${row.slug}`, '_blank', 'noopener')}>{t('openPortfolio')}</Button>
          <Button size="sm" variant="ghost" onClick={() => window.open('/admin', '_blank', 'noopener')}>{t('openEditor')}</Button>
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
        .danger { border-top: 1px solid var(--danger-border); padding-top: var(--space-4); }
        .danger h3 { color: var(--danger-ink); }
      `}</style>
    </div>
  );
}


function AddClientPanel({ t, busy, onClose, onCreate }) {
  const [f, setF] = useState({ name: '', slug: '', email: '', username: '', lang: 'ar' });
  // The address is derived from the name until it is edited, so the common case
  // is two fields rather than four. Same rule the admin's invite used.
  const [slugTouched, setSlugTouched] = useState(false);
  const slug = (slugTouched ? f.slug : f.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="bg" onClick={onClose} role="presentation">
      <div className="panel" role="dialog" aria-modal="true" aria-label={t('addTitle')} onClick={(e) => e.stopPropagation()}>
        <div className="ph">
          <b>{t('addTitle')}</b>
          <button type="button" className="x" onClick={onClose} aria-label={t('cancel')}>×</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onCreate({ ...f, slug }); }}>
          {/* Explicit htmlFor/id rather than wrapping: the association is then
              visible without knowing what <Input> renders, which is what
              tests/label-association.test.mjs checks and what a screen reader
              relies on. */}
          <label htmlFor="nc-name">{t('fName')}</label>
          <Input id="nc-name" value={f.name} onChange={set('name')} required />

          <label htmlFor="nc-slug">{t('fAddress')}</label>
          <Input id="nc-slug" value={slug} dir="ltr"
                 onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value }); }} required />
          <span className="hint" dir="ltr">designakum.site/{slug || '…'}</span>

          <label htmlFor="nc-email">{t('fEmail')}</label>
          <Input id="nc-email" type="email" value={f.email} onChange={set('email')} dir="ltr" required />

          <label htmlFor="nc-username">{t('fUsername')}</label>
          <Input id="nc-username" value={f.username} onChange={set('username')} dir="ltr" required />

          <label htmlFor="nc-lang">{t('fLang')}</label>
          <div>
            <select id="nc-lang" value={f.lang} onChange={set('lang')}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="row">
            <Button type="submit" loading={busy === 'create'}>{t('create')}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          </div>
        </form>
      </div>
      <style jsx>{`
        .bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: flex-end; z-index: 60; }
        .panel { inline-size: min(440px, 100%); block-size: 100%; overflow-y: auto; background: var(--bg-primary);
                 border-inline-start: 1px solid var(--border); padding: var(--space-5); }
        .ph { display: flex; align-items: center; justify-content: space-between; margin-block-end: var(--space-4); }
        .ph b { font-size: var(--text-xl); }
        .x { inline-size: 44px; block-size: 44px; border: none; background: none; color: var(--text-secondary); font-size: 22px; cursor: pointer; }
        form { display: flex; flex-direction: column; gap: var(--space-2); }
        label { font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        .hint { font-size: var(--text-sm); color: var(--text-tertiary); margin-block-end: var(--space-2); }
        form > :global(*) { width: 100%; }
        select { padding: 10px 14px; min-height: 44px; background: var(--bg-secondary); border: 1px solid var(--border);
                 border-radius: var(--radius-md); color: var(--text-primary); font: inherit; }
        .row { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
      `}</style>
    </div>
  );
}

// Shown ONCE. The password is not stored anywhere -- GoTrue keeps only a hash --
// so if this is dismissed without copying, the only way back is a reset.
function CredentialsPanel({ t, creds, onClose }) {
  const [copied, setCopied] = useState(false);
  const block = `${creds.workspace}\n${creds.url}\n${creds.email}\n${creds.username}\n${creds.password}`;
  return (
    <div className="bg" role="presentation">
      <div className="panel" role="dialog" aria-modal="true" aria-label={t('credsTitle')}>
        <b>{t('credsTitle')}</b>
        <p>{t('credsNote')}</p>
        <pre dir="ltr">{block}</pre>
        <div className="row">
          <Button size="sm" variant="secondary" onClick={async () => {
            try { await navigator.clipboard.writeText(block); setCopied(true); } catch (e) { /* no clipboard */ }
          }}>{copied ? t('copied') : t('copy')}</Button>
          <Button size="sm" onClick={onClose}>{t('done')}</Button>
        </div>
      </div>
      <style jsx>{`
        .bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 70; padding: var(--space-4); }
        .panel { inline-size: min(460px, 100%); background: var(--bg-primary); border: 1px solid var(--border);
                 border-radius: var(--radius-lg); padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
        b { font-size: var(--text-xl); }
        p { margin: 0; font-size: var(--text-sm); color: var(--text-tertiary); line-height: 1.5; }
        pre { margin: 0; padding: var(--space-4); background: var(--bg-secondary); border: 1px solid var(--border);
              border-radius: var(--radius-md); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-size: var(--text-sm); white-space: pre-wrap; word-break: break-all; color: var(--text-primary); }
        .row { display: flex; gap: var(--space-2); }
      `}</style>
    </div>
  );
}

function Shell({ children, lang = 'ar' }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return (
    <>
      <Head>
        <title>Clients — Designakum</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="wrap" dir={dir} lang={lang}>{children}</main>
      <style jsx>{`
        .wrap { max-inline-size: 1080px; margin: 0 auto; padding: var(--gutter); }
        @media (max-width: 720px) { .wrap { padding: 16px; } }
      `}</style>
    </>
  );
}
