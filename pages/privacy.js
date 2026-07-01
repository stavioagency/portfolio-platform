import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { privacyContent as content } from '../lib/legal-content';


function readLang() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lang');
}

export default function Privacy() {
  const [lang, setLang] = useState('ar');

  useEffect(() => {
    setLang(readLang() || 'ar');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('lang', lang);
  }, [lang]);

  const c = content[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <>
      <Head>
        <title>{c.title}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="legal-page" dir={dir}>
        <div className="legal-card">
          <div className="legal-top">
            <button className="lang-pill" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}>
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
            <Link href="/" className="close-x" aria-label={c.closeLabel} title={c.closeLabel}>×</Link>
          </div>
          <h1>{c.title}</h1>
          <p className="updated">{c.updated}</p>
          <p className="intro">{c.intro}</p>
          {c.sections.map((s, i) => (
            <section key={i}>
              <h2>{s.h}</h2>
              <p>{s.p}</p>
            </section>
          ))}
          <p className="note">{c.note}</p>
        </div>
        <style jsx>{`
          .legal-page {
            min-height: 100vh;
            display: flex;
            justify-content: center;
            padding: 48px 20px;
            background: var(--bg-primary);
          }
          .legal-card {
            width: 100%;
            max-width: 640px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 32px;
          }
          .legal-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
          }
          .close-x {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            background: rgba(255,255,255,0.06);
            border: 1px solid var(--border);
            border-radius: 50%;
            color: var(--text-secondary);
            font-size: 22px;
            line-height: 1;
            font-family: inherit;
            transition: var(--transition);
          }
          .close-x:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
          .close-x:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
          .lang-pill {
            padding: 6px 12px;
            background: rgba(255,255,255,0.06);
            border: 1px solid var(--border);
            border-radius: 999px;
            color: var(--text-secondary);
            font-size: 12px;
            font-weight: 600;
            font-family: inherit;
          }
          .lang-pill:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
          h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; color: var(--text-primary); }
          .updated { font-size: 12px; color: var(--text-muted); margin-bottom: 20px; }
          .intro { font-size: 14px; line-height: 1.7; color: var(--text-secondary); margin-bottom: 28px; }
          section { margin-bottom: 22px; }
          h2 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
          section p { font-size: 14px; line-height: 1.7; color: var(--text-secondary); }
          .note { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); font-style: italic; }
          @media (max-width: 480px) {
            .legal-card { padding: 20px; }
            h1 { font-size: 20px; }
          }
        `}</style>
      </main>
    </>
  );
}
