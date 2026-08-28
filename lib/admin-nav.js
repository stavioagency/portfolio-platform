// The client's editor navigation.
//
// FIVE ITEMS, FLAT. It was ten across three groups, and several of them named
// the data model rather than anything the client could see:
//
//   Overview + Home Page   two screens both called some version of "home"
//   Profile + Home Page    identity split across two tabs for no reason a
//                          client could state
//   Links + Buttons        the same three fields (icon, label, URL) in two
//                          places, so people entered their WhatsApp twice
//   Appearance             a theme preset, free colours, a font stack, a
//                          density and a corner radius — every one of them a
//                          way to make a portfolio worse than the template
//   Workspace              developer vocabulary, and custom domains are not
//                          built
//
// What is left is the shape of the portfolio itself: the work, the card, how to
// reach them, whether anyone looked, and the account. A client should be able
// to point at a tab and say what part of their page it changes.
//
// The groups went with them. Three headings over ten items is a table of
// contents for a document nobody was reading; five items need no index.
export function navGroups({ isOwner, ar, t }) {
  return [{
    id: 'main',
    label: null,
    items: [
      { id: 'projects',  icon: 'folder',   label: ar ? 'أعمالي'      : 'My work' },
      { id: 'card',      icon: 'card',     label: ar ? 'بطاقتي'      : 'My card' },
      { id: 'links',     icon: 'link',     label: ar ? 'التواصل'     : 'Contact' },
      { id: 'analytics', icon: 'chart',    label: ar ? 'الزيارات'    : 'Visits' },
      { id: 'account',   icon: 'settings', label: ar ? 'حسابي'       : 'My account' },
    ],
  }];
}
