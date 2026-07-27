// The client-facing guide to building their portfolio.
//
// WHY THIS IS CONTENT, NOT UI: the old checklist was seven labels — "Add profile
// photo", "Write your bio" — which tells someone WHAT to click and nothing about
// what to actually write, or why it matters. People who have never built a
// portfolio do not get stuck on where the button is; they get stuck on what to put
// in the box. So every step here carries four things:
//
//   title  what to do
//   why    what it changes for them, in one honest sentence
//   how    2-4 concrete actions, in order
//   tip    what "good" looks like, so they can judge their own work
//
// ORDER IS DELIBERATE. It is sequenced by how much each step changes the page for a
// visitor, not by which admin screen it lives on. Name first, because an unnamed
// site does not render at all; the custom domain last, because it is the only step
// that costs money and changes nothing about the site itself.
//
// Every string is bilingual. `ar` is the primary audience — write it as Arabic that
// a designer would actually say, not a translation of the English.

export const GUIDE_STEPS = [
  {
    id: 'publish',
    tab: 'profile',
    title: { ar: 'اكتب اسمك ومسمّاك', en: 'Add your name and title' },
    why: {
      ar: 'بدون اسم لا يظهر موقعك إطلاقًا — يرى الزائر صفحة فارغة. هذه أول خطوة وأهمها.',
      en: "Without a name your site does not render at all — a visitor sees an empty page. This is the first thing and the most important.",
    },
    how: {
      ar: [
        'افتح «الملف الشخصي».',
        'اكتب اسمك بالعربية والإنجليزية — الحقلان منفصلان.',
        'اكتب المسمّى: «مصمم جرافيك»، «مصوّر»، «مخرج فيديو».',
        'اضغط «حفظ».',
      ],
      en: [
        'Open Profile.',
        'Write your name in Arabic and in English — they are separate fields.',
        'Add your title: "Graphic Designer", "Photographer", "Video Editor".',
        'Press Save.',
      ],
    },
    tip: {
      ar: 'املأ اللغتين. الزائر من الخليج غالبًا يقرأ بالعربية، والعميل الأجنبي بالإنجليزية — والحقل الفارغ يظهر فارغًا.',
      en: 'Fill both languages. A Gulf visitor usually reads Arabic and a foreign client reads English — an empty field shows up empty.',
    },
  },
  {
    id: 'photo',
    tab: 'profile',
    title: { ar: 'أضف صورتك أو شعارك', en: 'Add your photo or logo' },
    why: {
      ar: 'الصورة أول ما تقع عليه العين، وهي الفرق بين موقع شخصي وصفحة مجهولة.',
      en: 'The photo is the first thing anyone looks at, and it is the difference between a personal site and an anonymous page.',
    },
    how: {
      ar: [
        'في «الملف الشخصي»، اضغط على دائرة الصورة.',
        'اختر صورة واضحة لوجهك، أو شعارك إن كنت تعمل باسم علامة.',
        'قصّ الصورة داخل الدائرة ثم احفظ.',
      ],
      en: [
        'In Profile, click the photo circle.',
        'Pick a clear photo of your face, or your logo if you work under a brand name.',
        'Crop it inside the circle, then save.',
      ],
    },
    tip: {
      ar: 'وجه واضح وخلفية بسيطة. تُضغط الصورة تلقائيًا، فلا تقلق من حجمها.',
      en: 'A clear face and a simple background. Images are compressed automatically, so file size is not your problem.',
    },
  },
  {
    id: 'bio',
    tab: 'profile',
    title: { ar: 'اكتب نبذة قصيرة', en: 'Write a short bio' },
    why: {
      ar: 'النبذة تجيب على سؤال الزائر: «هل هذا الشخص يفعل ما أحتاجه؟» — وتُقرأ خلال ثوانٍ.',
      en: 'Your bio answers the visitor\'s only question — "does this person do what I need?" — and it gets read in seconds.',
    },
    how: {
      ar: [
        'في «الملف الشخصي»، انزل إلى «النبذة».',
        'اكتب سطرين إلى ثلاثة: ماذا تصمّم، ولمن.',
        'اكتبها بالعربية والإنجليزية.',
      ],
      en: [
        'In Profile, scroll to Bio.',
        'Write two or three lines: what you design, and who for.',
        'Write it in Arabic and English.',
      ],
    },
    tip: {
      ar: '«أصمّم هويات بصرية للمقاهي والمطاعم» أوضح بكثير من «مصمم مبدع وشغوف».',
      en: '"I design brand identities for cafés and restaurants" says far more than "creative and passionate designer".',
    },
  },
  {
    id: 'project',
    tab: 'projects',
    title: { ar: 'أضف أول مشروع', en: 'Add your first project' },
    why: {
      ar: 'هذا هو الموقع كله. الناس لا توظّفك بسبب نبذتك، بل بسبب ما تراه من أعمالك.',
      en: 'This is the whole point of the site. Nobody hires you for your bio — they hire you for the work they can see.',
    },
    how: {
      ar: [
        'افتح «المشاريع» ثم «إضافة مشروع».',
        'ضع عنوانًا، وارفع صورة الغلاف — أقوى صورة لديك.',
        'أضف بقية الصور داخل المشروع؛ تُعرض كشرائح.',
        'اكتب سطرًا عن المشروع: العميل، السنة، دورك فيه.',
      ],
      en: [
        'Open Projects, then Add project.',
        'Give it a title and upload a cover image — your strongest one.',
        'Add the rest of the images inside the project; they display as a slideshow.',
        'Write a line about it: the client, the year, your role.',
      ],
    },
    tip: {
      ar: 'ثلاثة مشاريع ممتازة أفضل من عشرة متوسطة. رتّبها بالأسهم بحيث يكون أقواها أولًا.',
      en: 'Three excellent projects beat ten average ones. Use the arrows to order them so your strongest is first.',
    },
  },
  {
    id: 'links',
    tab: 'links',
    title: { ar: 'أضف روابط التواصل', en: 'Add your contact links' },
    why: {
      ar: 'بدون طريقة تواصل، الزائر المعجب بعملك يغلق الصفحة ولا يعود.',
      en: 'With no way to reach you, a visitor who likes your work closes the tab and never comes back.',
    },
    how: {
      ar: [
        'افتح «الروابط».',
        'أضف واتساب أولًا — أسرع طريقة يتواصل بها العميل في السعودية.',
        'أضف إنستقرام أو بيهانس إن كان عملك معروضًا هناك.',
      ],
      en: [
        'Open Links.',
        'Add WhatsApp first — the fastest way a client in Saudi will actually contact you.',
        'Add Instagram or Behance if your work lives there too.',
      ],
    },
    tip: {
      ar: 'اكتب رقم الواتساب بصيغة +966… ويتحوّل تلقائيًا إلى رابط محادثة مباشر.',
      en: 'Enter WhatsApp as +966… and it becomes a direct chat link automatically.',
    },
  },
  {
    id: 'theme',
    tab: 'appearance',
    title: { ar: 'اختر مظهر الموقع', en: 'Choose how it looks' },
    why: {
      ar: 'الألوان والخط يجعلان الموقع يبدو لك أنت، لا قالبًا جاهزًا — وهذا ما يميّزك عن غيرك.',
      en: 'Colours and type make the site look like you rather than a template — which is the part that sets you apart.',
    },
    how: {
      ar: [
        'افتح «المظهر».',
        'اختر أحد الأنماط الجاهزة كنقطة بداية.',
        'عدّل اللون المميّز ليطابق هويتك.',
        'راقب المعاينة على اليمين أثناء التعديل.',
      ],
      en: [
        'Open Appearance.',
        'Pick one of the ready-made themes as a starting point.',
        'Adjust the accent colour to match your brand.',
        'Watch the live preview as you change things.',
      ],
    },
    tip: {
      ar: 'لون مميّز واحد يكفي. كثرة الألوان تجعل الموقع يبدو أقل احترافية، لا أكثر.',
      en: 'One accent colour is enough. More colours make a site look less professional, not more.',
    },
  },
  {
    id: 'domain',
    tab: 'domains',
    title: { ar: 'اربط نطاقك الخاص', en: 'Connect your own domain' },
    why: {
      ar: 'موقعك يعمل الآن على رابطنا. النطاق الخاص يجعله yourname.com — يبدو أكثر جدية عند إرساله لعميل.',
      en: 'Your site already works on our address. Your own domain makes it yourname.com — which reads as more serious when you send it to a client.',
    },
    how: {
      ar: [
        'اشترِ نطاقًا من أي مزوّد (GoDaddy أو Namecheap).',
        'افتح «مساحة العمل» وأضف النطاق.',
        'انسخ سجل DNS المعروض وأضفه عند مزوّد النطاق.',
        'اضغط «تحقّق». قد يستغرق الأمر حتى ساعة.',
      ],
      en: [
        'Buy a domain from any provider (GoDaddy, Namecheap).',
        'Open Workspace and add the domain.',
        'Copy the DNS record shown and add it at your domain provider.',
        'Press Verify. It can take up to an hour.',
      ],
    },
    tip: {
      ar: 'اختياري تمامًا، ويمكن تأجيله. موقعك مباشر ويعمل من دونه.',
      en: 'Entirely optional and easy to postpone. Your site is live and working without it.',
    },
  },
];

// The first thing that is still undone — what the guide should open on, and what the
// "next step" prompt should point at. Returns null once everything is complete.
export function nextStep(doneMap) {
  return GUIDE_STEPS.find((s) => !doneMap[s.id]) || null;
}

export default GUIDE_STEPS;
