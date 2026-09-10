// The Studio's navigation, as data.
//
// FIVE PRIMARY ITEMS AND ONE GROUPED REST. The customer's mental model is the
// portfolio itself — who I am, what I made, how it looks, how to reach me — and
// each primary item names a part of the page they can point at. Everything that
// is account or platform business (a domain, a bill, a visitor count) is real
// work but it is not portfolio-editing, so it sits behind "More" rather than
// competing with the five things people came here to do.
//
// This replaces lib/admin-nav.js for the Studio only. /admin keeps its own nav
// and its own file, untouched, for as long as it stays the live editor.
//
// WHY THE SPLIT IS NOT COSMETIC: the old editor put Visits between Contact and
// My account, so a customer scanning for "where do I change my bio" read past
// an analytics screen to find it. Editing and administering are different
// activities and reading one list for both is what made the old admin feel like
// a control panel.

export const STUDIO_SECTIONS = ['home', 'profile', 'work', 'appearance', 'links',
  'domain', 'visitors', 'plan', 'settings'];

export const DEFAULT_SECTION = 'home';

export function isStudioSection(id) {
  return STUDIO_SECTIONS.includes(id);
}

// `ar` rather than a translator: these labels are the product's own vocabulary
// and belong beside each other where they can be read as a set. Arabic is
// written as Arabic a designer would say, not as a translation of the English.
export function studioNav(ar) {
  return {
    primary: [
      { id: 'home',       icon: 'home',    label: ar ? 'الرئيسية' : 'Home' },
      { id: 'profile',    icon: 'user',    label: ar ? 'التعريف'  : 'Profile' },
      { id: 'work',       icon: 'folder',  label: ar ? 'أعمالي'   : 'Work' },
      { id: 'appearance', icon: 'palette', label: ar ? 'المظهر'   : 'Appearance' },
      { id: 'links',      icon: 'link',    label: ar ? 'التواصل'  : 'Links' },
    ],
    more: {
      label: ar ? 'المزيد' : 'More',
      items: [
        { id: 'domain',   icon: 'globe',    label: ar ? 'النطاق'   : 'Domain' },
        { id: 'visitors', icon: 'chart',    label: ar ? 'الزيارات' : 'Visitors' },
        { id: 'plan',     icon: 'receipt',  label: ar ? 'الاشتراك' : 'Plan' },
        { id: 'settings', icon: 'settings', label: ar ? 'الحساب'   : 'Settings' },
      ],
    },
  };
}

// Flat list, for anything that needs to resolve an id to a label without caring
// where it sits.
export function studioSectionLabel(id, ar) {
  const nav = studioNav(ar);
  const all = [...nav.primary, ...nav.more.items];
  const found = all.find((i) => i.id === id);
  return found ? found.label : '';
}

export default studioNav;
