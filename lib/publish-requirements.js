// lib/publish-requirements.js
// -----------------------------------------------------------------------------
// What a portfolio must have before publishing it does a visitor any good.
//
// SPLIT OUT FROM lib/studio-publish.js SO IT CAN BE TESTED DIRECTLY. That module
// talks to the database, and importing it under the test runner constructs a
// Supabase client against absent environment variables — which throws before a
// single assertion runs. The rules below are pure and are the part worth
// testing, so they live where a test can reach them.
//
// ── ONE LIST, TWO READERS ────────────────────────────────────────────────
// The publish button and the checklist beside it both read this. Two
// definitions of "ready" is exactly how a checklist and a button end up
// disagreeing, and the customer is the one who finds out.
//
// NOT A VALIDATION LAYER. The database has no such constraint and should not
// grow one. This is the product's opinion about what makes a page worth
// showing, which is the kind of thing that belongs in the application.

import { hasBilingualText } from './profile-content.js';

/* What a portfolio must have before publishing it does a visitor any good.
   These are the SAME four things Home lists, deliberately: two different
   definitions of "ready" is how a checklist and a button end up disagreeing.

   Not a validation layer — the database has no such constraint and should not
   grow one. It is the product's opinion about what makes a page worth showing,
   which is exactly the kind of thing that belongs in the application. */
export function publishRequirements(profile, projectCount, ar) {
  const p = profile || {};
  return [
    {
      id: 'name',
      ok: hasBilingualText(p.name),
      section: 'profile',
      label: ar ? 'اسمك' : 'Your name',
      why: ar ? 'بدون اسم لا تظهر الصفحة إطلاقًا.' : 'Without a name the page does not render at all.',
    },
    {
      id: 'title',
      ok: hasBilingualText(p.tagline),
      section: 'profile',
      label: ar ? 'مجالك' : 'What you do',
      why: ar ? 'سطر واحد يخبر الزائر بمن أنت.' : 'One line telling a visitor who you are.',
    },
    {
      id: 'work',
      ok: projectCount > 0,
      section: 'work',
      label: ar ? 'عمل واحد على الأقل' : 'At least one project',
      why: ar ? 'المعرض بلا أعمال صفحة عن شخص، لا معرض.' : 'A portfolio with no work is a page about someone, not a portfolio.',
    },
    {
      id: 'contact',
      ok: Array.isArray(p.custom_links) && p.custom_links.some((l) => l && l.href),
      section: 'links',
      label: ar ? 'طريقة للتواصل' : 'A way to reach you',
      why: ar ? 'وإلا فلا سبيل لأحد أن يصل إليك.' : 'Otherwise nobody who likes your work can reach you.',
    },
  ];
}

export function isReadyToPublish(profile, projectCount) {
  return publishRequirements(profile, projectCount, false).every((r) => r.ok);
}
