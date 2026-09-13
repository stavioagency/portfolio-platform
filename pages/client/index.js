/* /client — the Designakum owner console.
 *
 * ONE OWNER EXPERIENCE. /console already does this job and does it correctly;
 * this is a consolidation onto the route the product is standardising on, not a
 * reimplementation of it. Both read the same tables through the same policies.
 *
 * ── /console IS NOT TOUCHED, AND WILL NOT BE UNTIL THIS IS PROVEN ────────
 * /console keeps every operation it has, including the destructive ones. This
 * screen deliberately does NOT reimplement deleting a client, resetting a
 * password or changing an account's email: those are irreversible operations on
 * real customers, they work today, and duplicating them into an unproven screen
 * is how an operator ends up performing one twice or on the wrong row. Each is
 * linked to where it works. They move here only after this screen has been used
 * in anger.
 *
 * ── AUTHORIZATION IS THE DATABASE'S ──────────────────────────────────────
 * is_platform_owner() decides, exactly as /console does, and it returns false
 * for every customer. This page renders nothing before that answer arrives.
 * Just as important: the gate is not what protects the DATA. Every table below
 * is owner-readable only by RLS, so a customer who typed this URL would see an
 * empty console rather than someone else's business — the gate is a courtesy on
 * top of a real boundary, never instead of one.
 */

import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/ui';
import ClientOperations from '../../components/client/operations';
import {
  FILTERS, applyFilter, endingSoon, rankCustomers, searchCustomers, summarise, toCustomer,
} from '../../lib/client-overview';
import { formatBillingDate, statusLabel } from '../../lib/billing-status';

const LANG_KEY = 'lang';

export default function ClientConsole() {
  const [phase, setPhase] = useState('loading'); // loading | signedout | denied | ready | error
  const [error, setError] = useState('');
  const [lang, setLang] = useState('ar');
  const [rows, setRows] = useState([]);
  const [invites, setInvites] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);

  const ar = lang === 'ar';

  useEffect(() => {
    try { setLang(localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar'); } catch (e) { /* default */ }
    /* The operator's console is designed dark and has no toggle — it is one
       person's working tool, and admin_theme is the CLIENT editor's setting.
       Reading that here would let a customer's choice repaint this screen. */
    document.documentElement.setAttribute('data-admin-theme', 'dark');
  }, []);

  const boot = useCallback(async () => {
    setPhase('loading'); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      /* No sign-in form here: one login screen for the platform, at /admin,
         which reads ?next= and sends them straight back. */
      if (!session) { setPhase('signedout'); return; }

      const { data: isOwner } = await supabase.rpc('is_platform_owner');
      if (isOwner !== true) { setPhase('denied'); return; }

      const [{ data: tenants, error: tErr }, { data: subs, error: sErr }, { data: inv }, { data: members }] =
        await Promise.all([
          supabase.from('tenants')
            .select('id, slug, name, status, created_at, published_at')
            .order('created_at', { ascending: false }),
          supabase.from('subscriptions').select('*'),
          supabase.from('free_access_invites').select('*').is('claimed_at', null)
            .order('created_at', { ascending: false }),
          /* The login attached to each workspace, read the same way /console
             reads it — through the Edge Function, because auth.users is not a
             table this or any browser may select from. It FAILS SOFT: a
             workspace with no member is a real state (an invite never claimed),
             and losing this read must cost the account operations, not the
             whole screen. */
          supabase.functions.invoke('client-recovery', { body: { action: 'list_orphans' } })
            .then((r) => ({ data: (r && r.data && r.data.members) || [] }), () => ({ data: [] })),
        ]);
      if (tErr) throw tErr;
      if (sErr) throw sErr;

      const byTenant = new Map((subs || []).map((s) => [s.tenant_id, s]));
      const memberByTenant = new Map(
        (members || []).filter((m) => m && m.tenant_id).map((m) => [m.tenant_id, m]),
      );
      setRows((tenants || []).map((t) => ({
        ...toCustomer(t, byTenant.get(t.id)),
        /* Carried alongside the derived customer rather than inside it:
           toCustomer() is pure and tested, and the login is not part of what a
           customer IS — it is what an operator needs to act on one. */
        member: memberByTenant.get(t.id) || null,
      })));
      setInvites(inv || []);
      setPhase('ready');
    } catch (e) {
      setError(e?.message || String(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  const stats = useMemo(() => summarise(rows), [rows]);
  const shown = useMemo(
    () => rankCustomers(searchCustomers(applyFilter(rows, filter), query)),
    [rows, filter, query],
  );
  const open = rows.find((r) => r.id === openId) || null;

  const title = ar ? 'العملاء — ديزايناكم' : 'Clients — Designakum';

  if (phase !== 'ready') {
    return (
      <>
        <Head><title>{title}</title></Head>
        <Gate phase={phase} ar={ar} error={error} onRetry={boot} />
      </>
    );
  }

  return (
    <>
      <Head><title>{title}</title></Head>
      <div className="con" dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'}>
        <header className="top">
          <span className="brand">DESIGNAKUM</span>
          <h1>{ar ? 'العملاء' : 'Clients'}</h1>
          <div className="tools">
            <a className="chip" href="/console">{ar ? 'الأدوات الكاملة' : 'Full tools'}</a>
            <button type="button" className="chip" onClick={() => {
              const next = ar ? 'en' : 'ar';
              setLang(next);
              try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* ignore */ }
            }}>{ar ? 'EN' : 'ع'}</button>
          </div>
        </header>

        <Summary stats={stats} ar={ar} filter={filter} onFilter={setFilter} />

        <div className="find">
          <label>
            <span className="srOnly">{ar ? 'بحث' : 'Search'}</span>
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              placeholder={ar ? 'اسم أو عنوان' : 'Name or address'}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="count">
            {shown.length === rows.length
              ? (ar ? `${rows.length} عميلًا` : `${rows.length} clients`)
              : (ar ? `${shown.length} من ${rows.length}` : `${shown.length} of ${rows.length}`)}
          </p>
        </div>

        {shown.length === 0 ? (
          <p className="none">{ar ? 'لا نتائج.' : 'Nothing matches.'}</p>
        ) : (
          <ul className="rows">
            {shown.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setOpenId(c.id)}>
                  <span className="who">
                    <b>{c.name || c.slug}</b>
                    <em>/{c.slug}</em>
                  </span>
                  <StateChip c={c} ar={ar} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Invites invites={invites} ar={ar} />

        {open && (
          <Detail
            c={open}
            ar={ar}
            lang={lang}
            onClose={() => setOpenId(null)}
            /* Re-read after an operation: every number on the summary behind
               this panel may have just changed. A DELETED customer needs
               nothing extra — `open` is derived from rows.find, so once the row
               is gone this panel unmounts on its own rather than sitting over a
               record that no longer exists. */
            onChanged={boot}
          />
        )}
      </div>

      <style jsx>{`
        .con { min-height: 100vh; min-height: 100dvh; background: var(--bg-primary); color: var(--text-primary);
               font-family: var(--font-body); padding: var(--space-5) var(--gutter) var(--space-10);
               max-width: 900px; margin-inline: auto; }
        .top { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-3);
               margin-bottom: var(--space-5); }
        .brand { font-size: var(--text-xs); color: var(--text-tertiary); }
        h1 { margin: 0; font-size: var(--text-2xl); font-family: var(--font-heading); }
        .tools { margin-inline-start: auto; display: flex; gap: 8px; }
        .chip { display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px;
                border: 1px solid var(--action-secondary-border); border-radius: var(--radius-sm);
                background: var(--action-secondary-bg); color: var(--action-secondary-fg);
                font: inherit; font-size: var(--text-xs); font-weight: 600;
                text-decoration: none; cursor: pointer; }
        .chip:hover { background: var(--action-secondary-bg-hover); }
        .chip:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .find { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3);
                margin: var(--space-5) 0 var(--space-3); }
        .find label { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px;
                      padding: 0 var(--space-3); min-block-size: 42px;
                      border: 1px solid var(--border-default); border-radius: var(--radius-md);
                      background: var(--surface-input); color: var(--text-tertiary); }
        /* --field-text-compact, not --text-sm: 16px on a phone, so focusing
           the search box does not zoom the console. */
        .find input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text-primary);
                      font: inherit; font-size: var(--field-text-compact); }
        .find input:focus { outline: none; }
        .find label:focus-within { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .count { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }
        .none { color: var(--text-tertiary); font-size: var(--text-sm); }
        .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .rows button { width: 100%; display: flex; align-items: center; gap: var(--space-3);
                       min-height: 54px; padding: 0 var(--space-3);
                       border: 1px solid var(--border-default); border-radius: var(--radius-md);
                       background: var(--surface-card); color: inherit; font: inherit;
                       text-align: start; cursor: pointer; }
        .rows button:hover { background: var(--surface-hover); }
        .rows button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .who b { font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .who em { font-style: normal; font-size: var(--text-xs); color: var(--text-tertiary); }
        .srOnly { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
                  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
      `}</style>
    </>
  );
}

/* Every number is a filter, so every number can be opened. A total nobody can
   click into is a number nobody can act on. */
function Summary({ stats, ar, filter, onFilter }) {
  const cells = [
    { id: 'all', n: stats.total, label: ar ? 'الكل' : 'All' },
    { id: 'live', n: stats.live, label: ar ? 'مباشر' : 'Live' },
    { id: 'lapsed', n: stats.lapsed, label: ar ? 'منتهٍ' : 'Lapsed', tone: stats.lapsed ? 'warn' : '' },
    { id: 'ending-soon', n: stats.endingSoon, label: ar ? 'ينتهي قريبًا' : 'Ending soon', tone: stats.endingSoon ? 'warn' : '' },
    { id: 'comped', n: stats.comped, label: ar ? 'وصول مجاني' : 'Free access' },
    { id: 'never-published', n: stats.neverPublished, label: ar ? 'لم يُنشر' : 'Unpublished' },
  ];
  return (
    <div className="sum" role="group" aria-label={ar ? 'ملخص' : 'Summary'}>
      {cells.map((c) => (
        <button key={c.id} type="button" aria-pressed={filter === c.id}
                className={`${filter === c.id ? 'on' : ''} ${c.tone || ''}`}
                onClick={() => onFilter(c.id)}>
          <b>{c.n}</b>
          <span>{c.label}</span>
        </button>
      ))}
      <style jsx>{`
        .sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 8px; }
        button { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3);
                 border: 1px solid var(--border-default); border-radius: var(--radius-md);
                 background: var(--surface-card); color: var(--text-secondary);
                 font: inherit; text-align: start; cursor: pointer; }
        button.on { border-color: var(--brand-line); background: var(--brand-soft); color: var(--text-primary); }
        button.warn b { color: var(--warning-ink); }
        button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        b { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
        span { font-size: var(--text-xs); }
      `}</style>
    </div>
  );
}

function StateChip({ c, ar }) {
  const tone = c.live ? 'ok' : c.offlineReason === 'never-published' ? 'quiet' : 'warn';
  const text = c.live
    ? (endingSoon(c) && typeof c.billing.daysLeft === 'number'
      ? (ar ? `مباشر · ${c.billing.daysLeft}d` : `Live · ${c.billing.daysLeft}d`)
      : (ar ? 'مباشر' : 'Live'))
    : c.offlineReason === 'never-published' ? (ar ? 'لم يُنشر' : 'Unpublished')
      : c.offlineReason === 'disabled' ? (ar ? 'موقوف' : 'Disabled')
        : (ar ? 'غير مشترك' : 'Not entitled');
  return (
    <span className={`chip ${tone}`}>
      {text}
      <style jsx>{`
        .chip { flex: none; padding: 4px 10px; border-radius: 999px; font-size: var(--text-xs);
                font-weight: 600; background: var(--neutral-bg); color: var(--neutral-ink); }
        .ok { background: var(--success-bg); color: var(--success-ink); }
        .warn { background: var(--warning-bg); color: var(--warning-ink); }
        .quiet { background: var(--bg-elevated); color: var(--text-tertiary); }
      `}</style>
    </span>
  );
}

/* The customer record. READ ONLY, on purpose — see the file header.
   Every destructive operation is named and linked to /console, where it works
   today, rather than being duplicated into a screen nobody has used yet. */
function Detail({ c, ar, lang, onClose, onChanged }) {
  const rows = [
    { k: ar ? 'العنوان' : 'Address', v: `designakum.site/${c.slug}` },
    { k: ar ? 'الحالة' : 'Status', v: c.live ? (ar ? 'مباشر' : 'Live') : (ar ? 'غير مرئي للزوّار' : 'Not visible to visitors') },
    { k: ar ? 'الاشتراك' : 'Subscription', v: statusLabel(c.billing.state, lang) },
    { k: ar ? 'ينتهي' : 'Ends', v: c.billing.renewsAt ? formatBillingDate(c.billing.renewsAt, lang) : '—' },
    { k: ar ? 'أول نشر' : 'First published', v: c.publishedAt ? formatBillingDate(c.publishedAt, lang) : (ar ? 'لم يُنشر' : 'Never') },
    { k: ar ? 'أُنشئ' : 'Created', v: c.createdAt ? formatBillingDate(c.createdAt, lang) : '—' },
  ];
  return (
    <div className="wrap" role="dialog" aria-modal="true" aria-label={c.name || c.slug}>
      <div className="box">
        <header>
          <h2>{c.name || c.slug}</h2>
          <button type="button" onClick={onClose}>
            <Icon name="close" size={18} />
            <span className="srOnly">{ar ? 'إغلاق' : 'Close'}</span>
          </button>
        </header>

        <dl>
          {rows.map((r) => (<div key={r.k}><dt>{r.k}</dt><dd>{r.v}</dd></div>))}
        </dl>

        {!c.live && (
          <p className="why">
            {c.offlineReason === 'never-published' && (ar ? 'العميل لم ينشر معرضه بعد — لا يوجد خلل.' : 'The customer has not published yet — nothing is wrong.')}
            {c.offlineReason === 'not-entitled' && (ar ? 'الاشتراك منتهٍ، والصفحة لا تظهر للزوّار الآن.' : 'The subscription has lapsed and the page does not render for visitors.')}
            {c.offlineReason === 'disabled' && (ar ? 'أوقفها مشغّل المنصّة.' : 'An operator switched this workspace off.')}
          </p>
        )}

        <div className="acts">
          <a className="go" href={`/${c.slug}`} target="_blank" rel="noreferrer">
            {ar ? 'فتح المعرض' : 'Open portfolio'}<Icon name="external" size={13} />
          </a>
        </div>

        {/* The operations used to be a LINK to /console, because this screen was
            read-only for a whole phase while it proved itself. They are here
            now, built on the same lib/client-operations.js builders /console
            calls, so the two cannot drift. */}
        <ClientOperations ar={ar} row={c} onDone={onChanged} />
      </div>
      <style jsx>{`
        .wrap { position: fixed; inset: 0; z-index: var(--z-modal); background: rgba(0,0,0,0.6);
                display: grid; place-items: center; padding: var(--gutter); }
        .box { width: 100%; max-width: 460px; background: var(--surface-elevated);
               border-radius: var(--radius-lg); padding: var(--space-5); }
        header { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
        h2 { margin: 0; font-size: var(--text-lg); flex: 1; min-width: 0; }
        header button { flex: none; width: 34px; height: 34px; display: grid; place-items: center;
                        border: 0; border-radius: var(--radius-sm); background: none;
                        color: var(--text-tertiary); cursor: pointer; }
        header button:hover { background: var(--surface-hover); color: var(--text-primary); }

        /* THUMB TARGETS. Every control here is comfortably clickable with a
           mouse and too small for a finger: --tap-min is 44px and these sit at
           32-38. Raised only on a phone, so the desktop layout is unchanged. */
        @media (max-width: 720px) {
          .chip { min-height: var(--tap-min); }
          header button { width: var(--tap-min); height: var(--tap-min); }
        }
        header button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        dl { margin: 0 0 var(--space-4); display: flex; flex-direction: column; gap: 8px; }
        dl div { display: flex; gap: var(--space-3); font-size: var(--text-sm); }
        dt { flex: none; width: 40%; color: var(--text-tertiary); }
        dd { margin: 0; flex: 1; min-width: 0; overflow-wrap: anywhere; }
        .why { margin: 0 0 var(--space-4); padding: 10px var(--space-3); border-radius: var(--radius-md);
               background: var(--bg-elevated); font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.7; }
        .acts { display: flex; flex-wrap: wrap; gap: 8px; }
        .go { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 var(--space-4);
              border-radius: var(--radius-md); background: var(--action-primary-bg);
              color: var(--action-primary-fg); text-decoration: none; font-size: var(--text-sm); font-weight: 600; }
        .go.quiet { background: var(--action-secondary-bg); color: var(--action-secondary-fg);
                    border: 1px solid var(--action-secondary-border); }
        .go:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .srOnly { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
                  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
      `}</style>
    </div>
  );
}

/* Open free-access grants: addresses owed a period that have not signed up yet.
   Read-only here; granting and revoking stay in /console with the rest of the
   operations, so there is exactly one place each of them happens. */
function Invites({ invites, ar }) {
  if (!invites.length) return null;
  return (
    <section className="inv">
      <h2>{ar ? 'دعوات وصول مجاني مفتوحة' : 'Open free-access grants'}</h2>
      <ul>
        {invites.map((i) => (
          <li key={i.id}>
            <span className="em">{i.email}</span>
            <span className="d">{ar ? `${i.days} يومًا` : `${i.days} days`}</span>
          </li>
        ))}
      </ul>
      <p className="note">
        {ar ? 'تُدار من الأدوات الكاملة.' : 'Granted and revoked in the full tools.'}
      </p>
      <style jsx>{`
        .inv { margin-top: var(--space-6); }
        h2 { margin: 0 0 var(--space-3); font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        ul { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        li { display: flex; gap: var(--space-3); align-items: center; font-size: var(--text-sm);
             padding: 8px var(--space-3); border: 1px solid var(--border-default);
             border-radius: var(--radius-md); background: var(--surface-card); }
        .em { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .d { flex: none; color: var(--text-tertiary); font-size: var(--text-xs); }
        .note { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }
      `}</style>
    </section>
  );
}

function Gate({ phase, ar, error, onRetry }) {
  const body = {
    loading: { title: ar ? 'جارٍ الفتح…' : 'Opening…' },
    signedout: {
      title: ar ? 'تسجيل الدخول مطلوب' : 'Sign in required',
      text: ar ? 'شاشة دخول واحدة للمنصّة، وستعود إلى هنا بعدها.' : 'One login screen for the platform, and it returns you here.',
      action: { href: '/admin?next=/client', label: ar ? 'تسجيل الدخول' : 'Sign in' },
    },
    denied: {
      title: ar ? 'هذه الصفحة لمشغّلي المنصّة' : 'This page is for platform operators',
      text: ar ? 'حسابك ليس حساب مشغّل. لإدارة معرضك، افتح الاستوديو.' : 'Your account is not an operator account. To manage your portfolio, open the Studio.',
      action: { href: '/studio', label: ar ? 'الاستوديو' : 'Studio' },
    },
    error: {
      title: ar ? 'تعذّر فتح الصفحة' : 'Could not open the console',
      text: ar ? 'لم يتغيّر شيء.' : 'Nothing was changed.',
    },
  }[phase];

  return (
    <div className="gate" dir={ar ? 'rtl' : 'ltr'}>
      <div className="box">
        <h1>{body.title}</h1>
        {body.text && <p>{body.text}</p>}
        {phase === 'error' && error && <code>{error}</code>}
        {body.action && <a href={body.action.href}>{body.action.label}</a>}
        {phase === 'error' && <button type="button" onClick={onRetry}>{ar ? 'إعادة المحاولة' : 'Try again'}</button>}
      </div>
      <style jsx>{`
        .gate { min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: var(--gutter);
                background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-body); }
        .box { max-width: 42ch; text-align: center; display: flex; flex-direction: column;
               align-items: center; gap: var(--space-3); }
        h1 { margin: 0; font-size: var(--text-xl); font-family: var(--font-heading); }
        p { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.7; }
        code { font-size: var(--text-xs); color: var(--text-tertiary); word-break: break-word; }
        a, button { display: inline-flex; align-items: center; min-height: 42px; padding: 0 var(--space-5);
                    border: 0; border-radius: var(--radius-md); background: var(--action-primary-bg);
                    color: var(--action-primary-fg); text-decoration: none; font: inherit;
                    font-size: var(--text-sm); font-weight: 700; cursor: pointer; }
        a:focus-visible, button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
      `}</style>
    </div>
  );
}
