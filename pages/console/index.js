// /console — the operator's product.
//
// A SHELL, DELIBERATELY EMPTY. Phase 1's migration strategy is existing system
// → new shell → move features across one at a time → retire the old one. This
// is the second step and nothing more: pages/admin.js is untouched and remains
// the working product. Every panel here says what will live in it, so the route
// is honest about being unfinished rather than half-implementing screens that
// already work elsewhere.
//
// Reserved since 51ae194, so no customer can hold the slug `console`.
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { AppShell, ShellGate } from '../../components/shell';
import { consoleNav, navItemIds, defaultItemId } from '../../lib/shell-nav';
import { getTranslator } from '../../lib/translations';
import { readLang, applyLang, readTheme, applyTheme } from '../../lib/shell-prefs';

export default function ConsolePage() {
  const [lang, setLang] = useState('ar');
  const [theme, setTheme] = useState('dark');
  const [active, setActive] = useState(null);

  useEffect(() => {
    const l = readLang();
    setLang(l);
    applyLang(l);
    const t = readTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const ar = lang === 'ar';
  const t = getTranslator(lang);
  const groups = consoleNav({ ar, t });
  // Validate before rendering: a stale link or a hand-typed id must not land
  // someone on a blank panel.
  const activeId = navItemIds(groups).includes(active) ? active : defaultItemId(groups);

  function toggleLang() {
    const next = ar ? 'en' : 'ar';
    setLang(next);
    applyLang(next);
  }
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <>
      <Head>
        <title>{ar ? 'الكونسول — ديزاينكم' : 'Console — Designakum'}</title>
        {/* Not a public page. Keep it out of every index. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <ShellGate require="owner" lang={lang}>
        {() => (
          <AppShell
            variant="console"
            groups={groups}
            activeId={activeId}
            onNavigate={setActive}
            lang={lang}
            onToggleLang={toggleLang}
            theme={theme}
            onToggleTheme={toggleTheme}
            title={ar ? 'الكونسول' : 'Console'}
            subtitle={ar ? 'إدارة المنصّة' : 'Platform operations'}
          >
            <Placeholder id={activeId} groups={groups} ar={ar} />
          </AppShell>
        )}
      </ShellGate>
    </>
  );
}

function Placeholder({ id, groups, ar }) {
  const item = groups.flatMap((g) => g.items).find((i) => i.id === id);
  return (
    <div className="ph">
      <div className="eyebrow">{ar ? 'قيد الإنشاء' : 'Not built yet'}</div>
      <h1>{item ? item.label : (ar ? 'الكونسول' : 'Console')}</h1>
      <p>
        {ar
          ? 'هذه الشاشة ستنتقل إلى هنا من لوحة التحكم الحالية. حتى ذلك الحين، استخدم /admin — لم يتغيّر فيها شيء.'
          : 'This screen will move here from the current dashboard. Until then use /admin, which is unchanged.'}
      </p>
      <style jsx>{`
        .ph { display: grid; gap: var(--space-3); justify-items: start; }
        h1 { margin: 0; font-size: var(--text-2xl); font-weight: 700; letter-spacing: var(--track-tight); }
        /* Arabic is cursive, so letter-spacing severs the joins between letterforms.
           --track-tight is Latin-only; RTL resets it. Same override FocusPanel and
           OwnerBar already carry on their headings. */
        :global([dir='rtl']) h1 { letter-spacing: 0; }
        p { margin: 0; color: var(--text-secondary); max-inline-size: var(--measure); line-height: var(--leading-normal); }
      `}</style>
    </div>
  );
}
