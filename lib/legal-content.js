// Shared legal copy — single source of truth for both the standalone
// /privacy & /terms pages AND the footer modal popups on the portfolio page.
// Shape: { ar: {...}, en: {...} } with keys: title, updated, intro, sections[{h,p}], note, closeLabel.
// Not final legal advice — early-stage placeholder, to be reviewed properly later.

export const privacyContent = {
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

export const termsContent = {
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
    closeLabel: 'إغلاق الصفحة القانونية',
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
    closeLabel: 'Close legal page',
  },
};
