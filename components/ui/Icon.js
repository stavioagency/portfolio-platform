// Icon — a small inline SVG set, so the admin can drop its emoji navigation
// without pulling in an icon library.
//
// Rules:
//   * one 24x24 viewBox and one stroke weight for every glyph, so sizes match
//   * stroke="currentColor" — icons inherit the surrounding text colour
//   * decorative by default (aria-hidden); pass a `title` when it carries meaning
//   * RTL: glyphs are direction-neutral except the few marked below, which are
//     mirrored under [dir="rtl"] via the `mirror` prop.

const ICONS = {
  home: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </>
  ),
  // Billing and Subscribers. Deliberately NOT the `card` glyph above, which is
  // already the Home Page tab — two tabs sharing an icon reads as a bug.
  receipt: (
    <>
      <path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  palette: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  chart: (
    <>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  // directional — pass mirror
  external: (
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  menu: (
    <>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),
  close: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  // "add" — replaces the literal "+ " that used to be typed into button labels
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="2 7 12 13 22 7" />
    </>
  ),
  // generic chat bubble, used for the WhatsApp handoff action. Deliberately NOT
  // the WhatsApp brand mark: BRAND_ICONS glyphs are solid fills, and one filled
  // glyph in a row of stroked ones breaks the uniform weight the button system
  // exists to hold. The label says WhatsApp.
  message: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />,
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <line x1="10.7" y1="12.3" x2="21" y2="2" />
      <line x1="18" y1="5" x2="21" y2="8" />
    </>
  ),

  // ---- State and attention -------------------------------------------------
  // The existing set covers navigation, which is why the admin still reaches
  // for an emoji whenever it needs to say something is late, paused or
  // retrying. These are the glyphs the owner's attention system and the
  // client's status lines need. Same 24x24 grid and stroke weight as above —
  // a set is only a set if a new glyph is indistinguishable in weight from an
  // old one.
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12.5" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13.5" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </>
  ),
  pause: (
    <>
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </>
  ),
  // Directional: a play triangle points the way text runs, so it mirrors.
  play: <path d="M7 4.8v14.4a1 1 0 0 0 1.5.87l12-7.2a1 1 0 0 0 0-1.74l-12-7.2A1 1 0 0 0 7 4.8z" />,
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <polyline points="20.5 3.5 20.5 9 15 9" />
    </>
  ),
  'credit-card': (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="15" x2="10" y2="15" />
    </>
  ),
  'trend-up': (
    <>
      <polyline points="3 17 9.5 10.5 13.5 14.5 21 7" />
      <polyline points="15.5 7 21 7 21 12.5" />
    </>
  ),
  'trend-down': (
    <>
      <polyline points="3 7 9.5 13.5 13.5 9.5 21 17" />
      <polyline points="15.5 17 21 17 21 11.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <polyline points="21 16 15.5 10.5 5 20" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Replaces the 🔍 the admin still uses for search.
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.2" y1="15.2" x2="21" y2="21" />
    </>
  ),
};

export const ICON_NAMES = Object.keys(ICONS);

export default function Icon({ name, size = 16, strokeWidth = 1.75, mirror = false, title, className = '', ...rest }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <svg
      className={`ui-icon ${mirror ? 'mirror' : ''} ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {glyph}
      <style jsx>{`
        .ui-icon { display: block; flex-shrink: 0; }
        :global([dir='rtl']) .ui-icon.mirror { transform: scaleX(-1); }
      `}</style>
    </svg>
  );
}
