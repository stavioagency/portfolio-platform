// Studio copy, bilingual.
//
// Kept here rather than in lib/translations.js for the duration of the Studio
// build: that file is 879 lines shared with pages/admin.js and the public site,
// and Section 1 is a frontend-only slice that must not be able to disturb them.
// When the Studio replaces /admin these keys merge into translations.js and
// this file is deleted.
//
// Copy rules that govern every string below (design.md, blueprint §3.2):
//   * no schema words — never tenant, slug, workspace, draft-as-a-noun,
//     revision, entitlement, published_at
//   * "work" collectively, "piece" singly. Never "projects"
//   * nothing implies the client failed. "could use names", never "missing"
//   * Latin numerals in both locales
//   * Arabic is not a translation of the English — each is written to be
//     natural in its own language, and they diverge where the idiom demands
//
//   * ARABIC USES NO GENDERED DIRECT ADDRESS. Arabic verbs addressed to a
//     person carry grammatical gender, so «انشري» speaks to a woman and
//     «انشر» to a man — and this product has both. Rather than collect a
//     gender at signup or default to masculine and exclude half the clients,
//     Studio copy is written in NEUTRAL, STATE-BASED phrasing:
//       - a verbal noun instead of a command: «النشر», «تغيير الطابع»
//       - a statement of state instead of an instruction:
//         «هذه التغييرات ظاهرة لك فقط»
//       - the passive where it reads naturally: «لم تُراجَع بعد»
//     Unvocalised possessives such as «أعمالك» and «معرضك» are already neutral
//     in writing and are fine. tests/studio-arabic-voice.test.mjs enforces this.

// Arabic counts things differently from English, and getting it wrong is the
// kind of error that marks copy as machine-made:
//
//   1        singular            «عمل واحد»
//   2        DUAL, no numeral    «عملان»      — never «2 عمل»
//   3–10     numeral + plural    «3 أعمال»
//   11+      numeral + singular  «11 عملًا»   — accusative
//
// Latin numerals stay the rule wherever a numeral appears (GRANDMASTER); the
// dual simply does not take one, which is a grammatical fact rather than an
// exception to it.
function arCount(n, { one, two, few, many }) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return few(n);
  return many(n);
}

export const STUDIO_STRINGS = {
  en: {
    // ── publish state — a sentence at rest, never a count ──────────────
    onlyYou: 'Only you can see this.',
    notLive: "Your latest changes aren't live yet",
    upToDate: 'up to date',
    onlyYouChanges: 'Only you can see these changes.',
    visitorsSee: 'This is what visitors see.',
    publish: 'Publish',

    // ── publish confirmation — the one place a count belongs ───────────
    publishCount: (n) => `Publish ${n} ${n === 1 ? 'change' : 'changes'}?`,
    publishFirst: 'Publish your portfolio?',
    publishFirstBody: (address) =>
      `It will be live at ${address}. You can take it down at any time.`,
    unreviewed: (n) =>
      `${n} ${n === 1 ? 'suggestion you have' : 'suggestions you have'} not looked at yet.`,
    notYet: 'not yet',

    // ── the queue ──────────────────────────────────────────────────────
    queueMany: 'A few things waiting',
    queueOne: 'One thing waiting',
    skip: 'skip',

    addWorkTitle: 'Your work goes here.',
    addWorkBody: 'Three to six pieces is a portfolio.',
    addWorkAction: 'add work',

    bioTitle: 'Your bio suggestion is ready.',
    bioBody: 'We wrote something to start from. Keep it, or make it yours.',
    bioKeep: 'keep it',
    bioAnother: 'another way',
    bioMine: 'write mine',

    // "could use" is optional by grammar. Never "missing" — that implies a
    // mistake — and never "waiting", which would echo the heading.
    piecesTitle: (n) =>
      n === 1 ? 'One piece could use a name.' : `${n} pieces could use names.`,
    piecesBody: 'A name helps visitors know what they are looking at.',
    piecesAction: 'name them',

    unpublishedTitle: (n) =>
      n === 1
        ? 'One change is waiting to go live.'
        : `${n} changes are waiting to go live.`,
    unpublishedBody: 'Visitors are still seeing your last published version.',

    // ── empty states ───────────────────────────────────────────────────
    readyTitle: 'Ready when you are.',
    readyBody: 'Nothing is waiting. Publish whenever you like.',
    clearTitle: 'Nothing needs you.',
    clearBody: "It's all up to date.",

    // ── offline ────────────────────────────────────────────────────────
    offlineTitle: 'Your portfolio is offline.',
    offlineBody: 'Your work is safe.',
    reactivate: 'Reactivate',

    // ── chrome ─────────────────────────────────────────────────────────
    live: 'Live',
    copy: 'copy',
    copied: 'copied',
    everythingElse: 'Everything else',
    desktop: 'desktop',
    tablet: 'tablet',
    phone: 'phone',
    editField: (field) => `Edit your ${field}`,
    editPiece: 'Edit that piece',

    // ── editor ──────────────────────────────────────────────────────
    // Never "AI", never "generated". It is an offer.
    suggestion: 'Suggestion',
    panelYou: 'You',
    panelPiece: 'This piece',
    panelLinks: 'Links',
    panelLook: 'Look',
    fName: 'Name', fTitle: 'What you do', fBio: 'Introduction', fPhoto: 'Photo',
    // Names the register — brief — not the concept. "Credibility line" is an
    // internal term and a client should never meet it.
    fShortLine: 'In short',
    // The placeholder is the teacher: a year, a discipline, and nothing else.
    // No adjective, no claim, no exclamation. It sets the register that no
    // rule about marketing language ever would.
    fShortLineHint: 'Photographing since 2014, mostly editorial',
    // "Description" is the word a database uses. "A few words" says what is
    // wanted and how much, and reads like a person asking.
    fCover: 'Cover', fPieceName: 'Name', fDescription: 'A few words',
    // Not "Link" — a bare noun leaves the client guessing what it is for.
    fLink: 'Where to see it',
    fDescriptionHint: 'What it was, and who it was for.',
    fLinkHint: 'A site, an article, anywhere it lives',
    moveEarlier: 'move earlier', moveLater: 'move later',
    saved: 'saved',
    // Ordering is curation, not layout control.
    ordering: 'Where it sits in your work',
    // "Headings" names what changes. "Display font" names a typographic
    // category, which is our vocabulary, not the client's.
    lookAccent: 'Accent', lookFont: 'Headings',
    lookDensity: 'Spacing',
    linksLead: 'Only the ones you fill in appear on your portfolio.',
    // The client supplies WHERE, never the words on the button.
    nextStep: 'The next step',
    nextStepHint: 'Where should people reach you? An email, or a link',
    // A creative reset, offered deliberately — never the panel's default.
    changeDirection: 'Change direction',
    directionsIntro: 'A different direction changes how your portfolio looks. Your words stay yours.',
    backToLook: 'back',
    indexTitle: 'What would you like to change?',
    idxYou: 'You', idxWork: 'Your work', idxLinks: 'Links', idxLook: 'Look',
    fieldNames: { name: 'name', title: 'title', bio: 'bio', pieces: 'work' },
  },

  ar: {
    onlyYou: 'هذا ظاهر لك فقط.',
    notLive: 'تغييراتك الأخيرة لم تظهر للزوار بعد',
    upToDate: 'محدَّث',
    onlyYouChanges: 'هذه التغييرات ظاهرة لك فقط.',
    visitorsSee: 'هذا ما يراه الزوار.',
    publish: 'نشر',

    publishCount: (n) => arCount(n, {
      one: 'نشر تغيير واحد؟',
      two: 'نشر تغييرين؟',
      few: (x) => `نشر ${x} تغييرات؟`,
      many: (x) => `نشر ${x} تغييرًا؟`,
    }),
    publishFirst: 'نشر المعرض؟',
    publishFirstBody: (address) =>
      `سيظهر معرضك على ${address}، ويمكن إخفاؤه في أي وقت.`,
    unreviewed: (n) => arCount(n, {
      one: 'اقتراح واحد ما زال بانتظار قرارك.',
      two: 'اقتراحان ما زالا بانتظار قرارك.',
      few: (x) => `${x} اقتراحات ما زالت بانتظار قرارك.`,
      many: (x) => `${x} اقتراحًا ما زالت بانتظار قرارك.`,
    }),
    notYet: 'ليس الآن',

    queueMany: 'بعض الأمور تنتظرك',
    queueOne: 'أمر واحد ينتظرك',
    skip: 'تخطّي',

    addWorkTitle: 'أعمالك تُعرض هنا.',
    addWorkBody: 'من ثلاثة إلى ستة أعمال تصنع معرضًا.',
    addWorkAction: 'إضافة عمل',

    bioTitle: 'نبذة مقترحة جاهزة.',
    bioBody: 'كتبنا بداية. يمكنك إبقاؤها أو إعادة صياغتها بصوتك.',
    bioKeep: 'تناسبني',
    bioAnother: 'صياغة أخرى',
    bioMine: 'أكتبها بنفسي',

    // Arabic takes its softening from «بعد» (yet). A literal rendering of
    // "could use" lands as «تحتاج» — "need" — which is more corrective than
    // the English this replaced.
    piecesTitle: (n) => arCount(n, {
      one: 'عمل واحد بلا اسم بعد.',
      two: 'عملان بلا أسماء بعد.',
      few: (x) => `${x} أعمال بلا أسماء بعد.`,
      many: (x) => `${x} عملًا بلا أسماء بعد.`,
    }),
    piecesBody: 'الاسم يساعد الزائر على فهم ما يراه.',
    piecesAction: 'أسمّيها',

    unpublishedTitle: (n) => arCount(n, {
      one: 'تغيير واحد ينتظر النشر.',
      two: 'تغييران ينتظران النشر.',
      few: (x) => `${x} تغييرات تنتظر النشر.`,
      many: (x) => `${x} تغييرًا ينتظر النشر.`,
    }),
    unpublishedBody: 'الزوار ما زالوا يرون النسخة المنشورة السابقة.',

    readyTitle: 'جاهز للنشر.',
    readyBody: 'لا شيء ينتظر. النشر متاح في أي وقت.',
    clearTitle: 'لا شيء بانتظارك.',
    clearBody: 'كل شيء محدَّث.',

    offlineTitle: 'معرضك غير متاح الآن.',
    offlineBody: 'أعمالك محفوظة.',
    reactivate: 'إعادة التفعيل',

    live: 'منشور',
    copy: 'نسخ',
    copied: 'تم النسخ',
    everythingElse: 'كل شيء آخر',
    desktop: 'حاسوب',
    tablet: 'لوحي',
    phone: 'جوال',
    editField: (field) => `تحرير ${field}`,
    editPiece: 'تحرير هذا العمل',

    // ── المحرّر ──────────────────────────────────────────────────────
    suggestion: 'اقتراح',
    panelYou: 'عنك',
    panelPiece: 'هذا العمل',
    panelLinks: 'الروابط',
    panelLook: 'المظهر',
    fName: 'الاسم', fTitle: 'مجال عملك', fBio: 'النبذة', fPhoto: 'الصورة',
    fShortLine: 'باختصار',
    fShortLineHint: 'التصوير منذ 2014، غالبًا تحريري',
    fCover: 'الغلاف', fPieceName: 'الاسم', fDescription: 'كلمات قليلة',
    fLink: 'أين يمكن رؤيته',
    fDescriptionHint: 'ما هو، ولمن كان.',
    fLinkHint: 'موقع، مقال، أو أي مكان يظهر فيه',
    moveEarlier: 'تقديمه', moveLater: 'تأخيره',
    saved: 'محفوظ',
    ordering: 'ترتيبه بين أعمالك',
    lookAccent: 'اللون المميّز', lookFont: 'خط العناوين',
    lookDensity: 'المسافات',
    linksLead: 'تظهر الروابط المضافة فقط.',
    nextStep: 'الخطوة التالية',
    nextStepHint: 'أين يمكن الوصول إليك؟ بريد إلكتروني أو رابط',
    changeDirection: 'تغيير الطابع',
    directionsIntro: 'الطابع يغيّر شكل المعرض. الكلمات تبقى كما هي.',
    backToLook: 'رجوع',
    indexTitle: 'ما الذي يمكن تغييره؟',
    idxYou: 'عنك', idxWork: 'أعمالك', idxLinks: 'الروابط', idxLook: 'المظهر',
    fieldNames: { name: 'الاسم', title: 'المسمّى', bio: 'النبذة', pieces: 'الأعمال' },
  },
};

export function studioStrings(lang) {
  return STUDIO_STRINGS[lang] || STUDIO_STRINGS.en;
}
