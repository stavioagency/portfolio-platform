// LegalPage — the shared shell for /privacy and /terms.
//
// Those two pages were byte-identical apart from which content object they
// imported, so every fix had to be made twice and the two had already drifted
// in nothing but name. The layout lives here once; the pages are now just a
// content binding.
//
// Content comes from lib/legal-content.js, which is also what the public
// portfolio's footer modal renders — one source of truth for the legal copy in
// both places.
//
// Spacing uses the --space-* scale rather than the ad-hoc 6/20/22/28/32px values
// the pages carried before, so the rhythm matches the rest of the product.

import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

function readLang() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lang');
}

export default function LegalPage({ content, sibling }) {
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

  const c = content[lang] || content.en;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const ar = lang === 'ar';
  // The other legal document, so neither page is a dead end. Its title comes
  // from the same bilingual content object, so the link is never untranslated.
  const siblingTitle = sibling ? (sibling.content[lang] || sibling.content.en).title : null;

  return (
    <>
      <Head>
        <title>{c.title}</title>
        {/* noindex is deliberate: this page is served on EVERY tenant domain as
            well as the platform's own, so indexing it would publish the same
            document under dozens of hosts. */}
        <meta name="robots" content="noindex" />
      </Head>
      <main className="legal-page" dir={dir}>
        <div className="legal-card">
          <div className="legal-top">
            <button
              className="lang-pill"
              onClick={() => setLang(ar ? 'en' : 'ar')}
              title={ar ? 'Switch to English' : 'التحويل إلى العربية'}
            >
              {ar ? 'EN' : 'ع'}
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
          {sibling && (
            <div className="legal-nav">
              {/* The arrow points the way the reader moves, which is leftwards
                  in Arabic — a literal "→" is placed at the visual left by the
                  bidi algorithm and would then point back at the text. */}
              <Link href={sibling.href} className="legal-nav-link">{siblingTitle} {ar ? '←' : '→'}</Link>
              <Link href="/" className="legal-nav-back">{ar ? 'العودة للموقع' : 'Back to site'}</Link>
            </div>
          )}
        </div>
        <style jsx>{`
          .legal-page {
            min-height: 100vh;
            display: flex;
            justify-content: center;
            padding: var(--space-8) var(--space-5);
            background: var(--bg-primary);
          }
          .legal-card {
            width: 100%;
            max-width: 640px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: var(--space-6);
          }
          .legal-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--space-5);
          }
          .close-x {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            background: rgba(var(--on-bg), 0.06);
            border: 1px solid var(--border);
            border-radius: 50%;
            color: var(--text-secondary);
            font-size: 22px;
            line-height: 1;
            font-family: inherit;
            transition: var(--transition);
          }
          .close-x:hover { background: rgba(var(--on-bg), 0.1); color: var(--text-primary); }
          .close-x:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
          .lang-pill {
            padding: 6px var(--space-3);
            background: rgba(var(--on-bg), 0.06);
            border: 1px solid var(--border);
            border-radius: 999px;
            color: var(--text-secondary);
            font-size: var(--text-sm);
            font-weight: 600;
            font-family: inherit;
            transition: var(--transition);
          }
          .lang-pill:hover { background: rgba(var(--on-bg), 0.1); color: var(--text-primary); }
          .lang-pill:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

          h1 { font-size: var(--text-2xl); font-weight: 700; margin-bottom: var(--space-1); color: var(--text-primary); }
          .updated { font-size: var(--text-sm); color: var(--text-muted); margin-bottom: var(--space-5); }
          .intro { font-size: var(--text-md); line-height: 1.7; color: var(--text-secondary); margin-bottom: var(--space-6); }
          section { margin-bottom: var(--space-5); }
          h2 { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-1); }
          section p { font-size: var(--text-md); line-height: 1.7; color: var(--text-secondary); }
          .note {
            margin-top: var(--space-6);
            padding-top: var(--space-5);
            border-top: 1px solid var(--border);
            font-size: var(--text-sm);
            color: var(--text-muted);
            font-style: italic;
          }
          /* Neither document should be a dead end — the two are read together. */
          .legal-nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-4);
            flex-wrap: wrap;
            margin-top: var(--space-5);
            padding-top: var(--space-5);
            border-top: 1px solid var(--border);
          }
          .legal-nav-link { font-size: var(--text-md); font-weight: 600; color: var(--accent); }
          .legal-nav-link:hover { text-decoration: underline; }
          .legal-nav-back { font-size: var(--text-md); color: var(--text-tertiary); }
          .legal-nav-back:hover { color: var(--text-primary); }
          .legal-nav-link:focus-visible,
          .legal-nav-back:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }

          @media (max-width: 640px) {
            .legal-page { padding: var(--space-5) var(--space-4); }
            .legal-card { padding: var(--space-5) var(--space-4); }
            h1 { font-size: var(--text-xl); }
          }
        `}</style>
      </main>
    </>
  );
}
