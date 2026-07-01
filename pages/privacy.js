import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const content = {
  ar: {
    title: 'سياسة الخصوصية',
    updated: 'آخر تحديث: 2026',
    intro: 'توضح هذه الصفحة كيف تتعامل ديزاينكم مع بياناتك عند استخدام منصة بناء المواقع الشخصية. هذه الصفحة مبدئية وعملية لمرحلة مبكرة من المشروع، وليست استشارة قانونية نهائية — ويجب مراجعتها من جهة قانونية مختصة قبل التوسع أو استقبال عدد كبير من العملاء.',
    sections: [
      {
        h: 'البيانات التي نجمعها',
        p: 'محتوى موقعك الشخصي (الاسم، النبذة، الصور، الروابط، المشاريع)، بيانات حساب لوحة التحكم (اسم المستخدم والبريد الإلكتروني)، وبيانات تصفح مجهولة (عدد الزيارات، الصفحة المُحيلة، الدولة) لغرض الإحصائيات.',
      },
      {
        h: 'كيف نستخدم هذه البيانات',
        p: 'لعرض موقعك الشخصي للزوار، ولتزويدك بإحصائيات الزيارات داخل لوحة التحكم، ولتشغيل خدمة تسجيل الدخول والاستعادة الآمنة لحسابك.',
      },
      {
        h: 'الجهات الخارجية المستخدمة',
        p: 'نستخدم Supabase لتخزين البيانات والصور وإدارة الحسابات، ونستخدم Vercel لاستضافة الموقع. لا تُشارك بياناتك مع أي جهة تسويقية أو إعلانية.',
      },
      {
        h: 'ملفات تعريف الارتباط والتخزين المحلي',
        p: 'نستخدم التخزين المحلي في متصفحك فقط لأغراض وظيفية: حفظ لغة العرض المفضلة، وتفضيل الوضع الداكن/الفاتح في لوحة التحكم، ومعرّف زائر مجهول للإحصائيات. لا نستخدم أي تتبع إعلاني.',
      },
      {
        h: 'التحكم في بياناتك',
        p: 'يمكنك تعديل أو حذف محتوى موقعك في أي وقت من لوحة التحكم. لطلب حذف حسابك بالكامل، تواصل معنا عبر البريد أدناه.',
      },
      {
        h: 'التواصل',
        p: 'يمكنك التواصل معنا عبر قناة التواصل الرسمية الخاصة بـ Designakum.',
      },
    ],
    note: 'ملاحظة: هذه السياسة مؤقتة ومناسبة لمرحلة مبكرة من المنتج، وسيتم تحديثها ومراجعتها قانونيًا لاحقًا.',
    closeLabel: 'إغلاق الصفحة القانونية',
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: 2026',
    intro: "This page explains how designakum handles your data when you use our portfolio-building platform. This is an early-stage, practical placeholder — not final legal advice — and should be reviewed by a qualified legal professional before scaling or taking on significant customer volume.",
    sections: [
      {
        h: 'Data we collect',
        p: 'Your portfolio content (name, bio, images, links, projects), admin account data (username and email), and anonymous visitor analytics (visit counts, referrer, country) for statistics purposes.',
      },
      {
        h: 'How we use this data',
        p: "To display your portfolio to visitors, to give you visitor analytics inside your admin dashboard, and to run secure sign-in and account recovery.",
      },
      {
        h: 'Third parties involved',
        p: 'We use Supabase for data, image storage, and account management, and Vercel for hosting. Your data is never shared with advertising or marketing third parties.',
      },
      {
        h: 'Cookies & local storage',
        p: "We use your browser's local storage only for functional purposes: remembering your preferred display language, your admin dark/light preference, and an anonymous visitor id for analytics. We do not use advertising trackers.",
      },
      {
        h: 'Your control over your data',
        p: 'You can edit or delete your portfolio content at any time from the admin dashboard. To request full account deletion, contact us at the email below.',
      },
      {
        h: 'Contact',
        p: 'Contact us through the official Designakum contact channel.',
      },
    ],
    note: 'Note: this policy is a temporary, early-stage placeholder and will be updated and legally reviewed later.',
    closeLabel: 'Close legal page',
  },
};

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
        <Link href="/" className="back-corner" style={{ [dir === 'rtl' ? 'right' : 'left']: '20px' }} aria-label={c.closeLabel} title={c.closeLabel}>×</Link>
        <div className="legal-card">
          <div className="legal-top">
            <button className="lang-pill" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}>
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
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
            padding: 88px 20px 48px;
            background: var(--bg-primary);
            position: relative;
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
            justify-content: flex-end;
            align-items: center;
            margin-bottom: 24px;
          }
          .back-corner {
            position: absolute;
            top: 20px;
            width: 56px;
            height: 56px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f5efe0;
            color: #14203f;
            border: 1px solid rgba(0,0,0,0.12);
            border-radius: 50%;
            font-size: 34px;
            line-height: 1;
            cursor: pointer;
            box-shadow: 0 6px 20px rgba(0,0,0,0.35);
            transition: var(--transition);
            z-index: 2;
          }
          .back-corner:hover { background: #ffffff; transform: scale(1.06); box-shadow: 0 8px 26px rgba(0,0,0,0.45); }
          .back-corner:focus-visible { outline: 3px solid #14203f; outline-offset: 3px; }
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
