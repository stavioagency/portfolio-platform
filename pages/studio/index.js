// /studio — the client's product.
//
// Same shape and same discipline as /console: a shell, deliberately empty, with
// pages/admin.js untouched and still the working product. See that file's
// header for the migration reasoning.
//
// The one difference is density. The studio is where somebody builds their
// portfolio over long sittings, so it is the roomier variant and its content
// column is narrower — a document rather than an operational surface.
//
// Reserved since 51ae194, so no customer can hold the slug `studio`.
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { AppShell, ShellGate } from '../../components/shell';
import { studioNav, navItemIds, defaultItemId } from '../../lib/shell-nav';
import { getTranslator } from '../../lib/translations';
import { readLang, applyLang, readTheme, applyTheme } from '../../lib/shell-prefs';
import StudioHome from '../../components/studio/StudioHome';

export default function StudioPage() {
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
  const groups = studioNav({ ar, t });
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
        <title>{ar ? 'الاستوديو — ديزاينكم' : 'Studio — Designakum'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <ShellGate require="client" lang={lang}>
        {() => (
          <AppShell
            variant="studio"
            groups={groups}
            activeId={activeId}
            onNavigate={setActive}
            lang={lang}
            onToggleLang={toggleLang}
            theme={theme}
            onToggleTheme={toggleTheme}
            title={ar ? 'الاستوديو' : 'Studio'}
            subtitle={ar ? 'موقعك الشخصي' : 'Your portfolio'}
          >
            {/* `home` is the Studio's home screen — the attention queue and
                the live preview. Every other item is still a placeholder and
                still moves here from /admin in its own section. */}
            {activeId === 'home'
              ? <StudioHome lang={lang} />
              : <Placeholder id={activeId} groups={groups} ar={ar} />}
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
      <h1>{item ? item.label : (ar ? 'الاستوديو' : 'Studio')}</h1>
      <p>
        {ar
          ? 'هذه الشاشة ستنتقل إلى هنا من لوحة التحكم الحالية. حتى ذلك الحين، /admin ما زالت تعمل كما هي.'
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
