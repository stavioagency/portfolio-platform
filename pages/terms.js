import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const content = {
  ar: {
    title: 'الشروط والأحكام',
    updated: 'آخر تحديث: 2026',
    intro: 'توضح هذه الصفحة الشروط الأساسية لاستخدام خدمة ديزاينكم لبناء المواقع الشخصية. هذه الصفحة مبدئية وعملية لمرحلة مبكرة من المشروع، وليست استشارة قانونية نهائية — ويجب مراجعتها من جهة قانونية مختصة قبل التوسع أو استقبال عدد كبير من العملاء.',
    sections: [
      {
        h: 'قبول الشروط',
        p: 'باستخدامك لخدمة ديزاينكم ولوحة التحكم الخاصة بها، فإنك توافق على هذه الشروط.',
      },
      {
        h: 'وصف الخدمة',
        p: 'ديزاينكم تقدم خدمة بناء وإدارة موقع شخصي ثنائي اللغة (عربي/إنجليزي) عبر لوحة تحكم سهلة الاستخدام، دون الحاجة لخبرة برمجية.',
      },
      {
        h: 'مسؤوليات العميل',
        p: 'أنت مسؤول عن المحتوى الذي ترفعه (الصور، النصوص، الروابط)، وتقر بامتلاكك الحق في استخدامه، وبعدم رفع أي محتوى مخالف للأنظمة.',
      },
      {
        h: 'حدود الخدمة',
        p: 'تُقدَّم الخدمة كما هي دون ضمان تشغيل مستمر بنسبة ١٠٠٪، خصوصًا في هذه المرحلة المبكرة من المنتج.',
      },
      {
        h: 'الملكية الفكرية',
        p: 'يملك العميل محتواه الخاص بالكامل. تملك ديزاينكم المنصة والبرمجيات والتصميم العام للخدمة.',
      },
      {
        h: 'إنهاء الحساب',
        p: 'يمكن لأي من الطرفين إنهاء الاشتراك في الخدمة، مع التواصل المسبق عبر البريد أدناه.',
      },
      {
        h: 'حدود المسؤولية',
        p: 'لا تتحمل ديزاينكم مسؤولية أي أضرار غير مباشرة ناتجة عن استخدام الخدمة، إلى الحد الذي يسمح به النظام المعمول به.',
      },
      {
        h: 'القانون المعمول به والاختصاص القضائي',
        p: 'هذه الشروط مُعدّة لعمل تجاري يُدار من المملكة العربية السعودية ودولة قطر. يجب تحديد القانون والاختصاص القضائي النهائي بشكل رسمي قبل التوسع أو استقبال عدد كبير من العملاء.',
      },
      {
        h: 'التغييرات على هذه الشروط',
        p: 'قد تُحدَّث هذه الشروط من وقت لآخر. سيتم نشر أي تحديث على هذه الصفحة.',
      },
      {
        h: 'التواصل',
        p: 'يمكنك التواصل معنا عبر قناة التواصل الرسمية الخاصة بـ Designakum.',
      },
    ],
    note: 'ملاحظة: هذه الشروط مؤقتة ومناسبة لمرحلة مبكرة من المنتج، وسيتم تحديثها ومراجعتها قانونيًا لاحقًا.',
    backHome: 'العودة إلى البورتفوليو',
  },
  en: {
    title: 'Terms & Conditions',
    updated: 'Last updated: 2026',
    intro: "This page outlines the basic terms for using designakum's portfolio-building service. This is an early-stage, practical placeholder — not final legal advice — and should be reviewed by a qualified legal professional before scaling or taking on significant customer volume.",
    sections: [
      {
        h: 'Acceptance of terms',
        p: 'By using the designakum service and its admin dashboard, you agree to these terms.',
      },
      {
        h: 'Description of service',
        p: 'designakum provides a bilingual (Arabic/English) personal portfolio website, built and managed through an easy-to-use admin dashboard, with no coding required.',
      },
      {
        h: 'Customer responsibilities',
        p: "You are responsible for the content you upload (images, text, links), and you confirm you have the right to use it and that it does not violate applicable regulations.",
      },
      {
        h: 'Service limitations',
        p: "The service is provided as-is, without a guarantee of 100% uptime, particularly at this early product stage.",
      },
      {
        h: 'Intellectual property',
        p: 'You fully own your own content. designakum owns the platform, software, and overall service design.',
      },
      {
        h: 'Account termination',
        p: 'Either party may end the service subscription, with prior notice via the email below.',
      },
      {
        h: 'Limitation of liability',
        p: "designakum is not liable for indirect damages arising from use of the service, to the extent permitted by applicable law.",
      },
      {
        h: 'Governing law & jurisdiction',
        p: 'These terms are intended for a business operating from Saudi Arabia and Qatar. The final governing law and jurisdiction should be confirmed before scaling or taking significant customer volume.',
      },
      {
        h: 'Changes to these terms',
        p: 'These terms may be updated from time to time. Any update will be posted on this page.',
      },
      {
        h: 'Contact',
        p: 'Contact us through the official Designakum contact channel.',
      },
    ],
    note: 'Note: these terms are a temporary, early-stage placeholder and will be updated and legally reviewed later.',
    backHome: 'Back to Portfolio',
  },
};

function readLang() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lang');
}

export default function Terms() {
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
        <Link href="/" className="back-corner">{c.backHome}</Link>
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
            top: 24px;
            inset-inline-start: 20px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
            transition: var(--transition);
            z-index: 2;
          }
          .back-corner:hover { background: var(--bg-hover); border-color: var(--border-strong); }
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
