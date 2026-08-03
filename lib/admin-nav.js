// Admin navigation information architecture — a pure data model, kept out of
// pages/admin.js so the visibility rules can be unit-tested without React.
// See tests/admin-nav.test.mjs.

// =========================================================
// Navigation information architecture
// =========================================================
// The admin used to be a flat list of nine tabs, which read as a settings panel
// rather than a product. The same tabs are now grouped by what the person is
// actually doing: building the website, reading its numbers, administering it —
// with platform-level work (managing other people's websites) kept separate and
// visible to owners only.
//
// Visibility rules are UNCHANGED from the flat list: Home is client-only,
// Clients is owner-only, and while ownership is still being resolved
// (isOwner === null) neither appears. RLS remains the actual authority.
export function navGroups({ isOwner, ar, t }) {
  const groups = [];

  if (isOwner === true) {
    groups.push({
      id: 'platform',
      label: ar ? 'المنصّة' : 'Platform',
      items: [{ id: 'clients', icon: 'users', label: ar ? 'المواقع' : 'Sites' }],
    });
  }

  groups.push({
    id: 'website',
    label: ar ? 'الموقع' : 'Website',
    items: [
      // "Overview", not "Home": the existing nav_card tab is already labelled
      // "Home Page" / "الصفحة الرئيسية", and two adjacent Home entries read as a
      // bug. The tab id stays `home` — only the label disambiguates.
      ...(isOwner === false ? [{ id: 'home', icon: 'home', label: ar ? 'نظرة عامة' : 'Overview' }] : []),
      { id: 'profile', icon: 'user', label: t('nav_profile') },
      { id: 'card', icon: 'card', label: t('nav_card') },
      { id: 'projects', icon: 'folder', label: t('nav_projects') },
      { id: 'links', icon: 'link', label: t('nav_links') },
      { id: 'appearance', icon: 'palette', label: t('nav_appearance') },
    ],
  });

  groups.push({
    id: 'insights',
    label: ar ? 'الإحصاءات' : 'Insights',
    items: [{ id: 'analytics', icon: 'chart', label: t('nav_analytics') }],
  });

  groups.push({
    id: 'settings',
    label: ar ? 'الإعدادات' : 'Settings',
    items: [
      // Workspace settings and the domain manager are OWNER tools that belong to
      // a specific client, so for owners they live in that client's panel on the
      // Sites page — one object, one place. A client still gets this tab, because
      // for them it is simply "my website's address" and there is no list to open
      // it from.
      ...(isOwner === false ? [{ id: 'domains', icon: 'globe', label: ar ? 'مساحة العمل' : 'Workspace' }] : []),
      { id: 'account', icon: 'settings', label: t('nav_account') },
    ],
  });

  return groups;
}
