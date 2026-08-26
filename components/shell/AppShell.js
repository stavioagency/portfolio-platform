// AppShell — the chrome both Phase 1 products are built inside.
//
// PRESENTATIONAL ON PURPOSE. It fetches nothing, knows no Supabase, and decides
// no permissions. It is handed groups, an active id and a language, and it
// renders navigation. Every privileged decision stays where it already is: RLS
// in the database, and the visibility rules in lib/admin-nav.js. A shell that
// queried for itself would become a second place where "who is this person"
// is answered, which is exactly the confusion the /console + /studio split is
// meant to end.
//
// DENSITY IS THE VARIANT, and it is the only thing that differs between the
// two. The console is an operational surface — lists, tables, many rows read
// quickly — so it is tighter. The studio is a making surface, used for long
// stretches on one thing at a time, so it breathes. Both come from the same
// spacing tokens; neither invents a value. That is the brand position in
// practice: premium through spacing, typography and hierarchy rather than
// through ornament, and no gradient or glow anywhere in this file.
//
// RTL comes from logical properties throughout — inline-start/end, not
// left/right — so Arabic is a `dir` flip and not a second stylesheet.
import { useState } from 'react';
import Icon from '../ui/Icon';

export default function AppShell({
  variant = 'studio',          // 'console' | 'studio' — density only
  groups = [],                 // from lib/shell-nav.js
  activeId = null,
  onNavigate = () => {},
  lang = 'ar',
  onToggleLang = null,
  theme = 'dark',
  onToggleTheme = null,
  title = '',                  // the product name in this language
  subtitle = '',               // workspace / context line
  headerActions = null,        // right-hand slot: save bar, preview toggle…
  footer = null,               // sidebar foot: user, sign out
  children,
}) {
  const ar = lang === 'ar';
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={`shell ${variant}`} data-shell={variant}>
      <header className="shell-head">
        <button
          type="button"
          className="nav-toggle"
          aria-label={ar ? 'القائمة' : 'Menu'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <Icon name={navOpen ? 'close' : 'menu'} size={18} />
        </button>

        <div className="head-id">
          <span className="head-title">{title}</span>
          {subtitle && <span className="head-sub">{subtitle}</span>}
        </div>

        <div className="head-actions">
          {headerActions}
          {onToggleTheme && (
            <button
              type="button"
              className="chip"
              onClick={onToggleTheme}
              aria-label={theme === 'light' ? (ar ? 'الوضع الداكن' : 'Dark mode') : (ar ? 'الوضع الفاتح' : 'Light mode')}
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
            </button>
          )}
          {onToggleLang && (
            <button type="button" className="chip lang" onClick={onToggleLang}>
              {ar ? 'EN' : 'ع'}
            </button>
          )}
        </div>
      </header>

      <div className="shell-body">
        {/* aria-hidden is NOT used to hide the closed drawer: it stays in the
            tree so its links remain reachable at desktop widths, where the same
            element is the permanent sidebar. */}
        <nav className={`shell-nav ${navOpen ? 'open' : ''}`} aria-label={ar ? 'التنقل' : 'Navigation'}>
          {groups.map((group) => (
            <div className="nav-group" key={group.id}>
              {/* The group label uses the global .eyebrow, which is where the
                  Arabic treatment already lives: no tracking, no uppercase,
                  Reem Kufi, brand-tinted. Latin gets the tracked caps. One
                  class, both languages, nothing to patch per component. */}
              <div className="eyebrow nav-label">{group.label}</div>
              <ul>
                {group.items.map((item) => {
                  const active = item.id === activeId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`nav-item ${active ? 'active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => { onNavigate(item.id); setNavOpen(false); }}
                      >
                        <Icon name={item.icon} size={16} />
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {footer && <div className="nav-foot">{footer}</div>}
        </nav>

        {/* The scroll container is the main element, not the page: the sidebar
            must not scroll away from a long editor. */}
        <main className="shell-main">
          <div className="shell-content">{children}</div>
        </main>
      </div>

      <style jsx>{`
        /* Density, and nothing else, is what the variant changes. Both columns
           of values are existing spacing tokens. */
        .shell {
          --shell-nav-w: 248px;
          --shell-gap: var(--space-5);
          --shell-pad-y: var(--space-6);
          --shell-item-y: 9px;
          --shell-max: var(--content-max);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
          color: var(--text-primary);
        }
        .shell.console {
          --shell-nav-w: 232px;
          --shell-gap: var(--space-4);
          --shell-pad-y: var(--space-5);
          --shell-item-y: 7px;
        }
        .shell.studio {
          --shell-nav-w: 264px;
          --shell-gap: var(--space-6);
          --shell-pad-y: var(--space-8);
          --shell-item-y: 10px;
          /* One column of content, per the editor. The console is a wide
             operational surface; the studio is a document. */
          --shell-max: 960px;
        }

        .shell-head {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--gutter);
          border-block-end: 1px solid var(--border);
          background: var(--bg-secondary);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .head-id { display: flex; flex-direction: column; min-width: 0; }
        .head-title { font-weight: 700; font-size: var(--text-sm); line-height: 1.2; }
        .head-sub {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .head-actions {
          margin-inline-start: auto;
          display: flex; align-items: center; gap: var(--space-2);
        }
        .chip {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 32px; min-height: 32px; padding: 0 8px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-family: inherit; font-size: var(--text-xs); font-weight: 600;
          cursor: pointer;
          transition: border-color var(--t-ui) var(--ease), background-color var(--t-ui) var(--ease);
        }
        .chip:hover { border-color: var(--border-strong); }
        .chip:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        .nav-toggle {
          display: none;
          align-items: center; justify-content: center;
          min-width: 40px; min-height: 40px;
          background: none; border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-primary); cursor: pointer;
        }

        .shell-body { display: flex; flex: 1; min-height: 0; align-items: flex-start; }

        .shell-nav {
          inline-size: var(--shell-nav-w);
          flex-shrink: 0;
          padding: var(--shell-gap) var(--space-4);
          border-inline-end: 1px solid var(--border);
          position: sticky;
          top: 57px;
          max-block-size: calc(100vh - 57px);
          overflow-y: auto;
          display: flex; flex-direction: column; gap: var(--shell-gap);
        }
        .nav-group ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
        .nav-label { margin-block-end: var(--space-2); }
        .nav-item {
          inline-size: 100%;
          display: flex; align-items: center; gap: var(--space-3);
          padding: var(--shell-item-y) var(--space-3);
          background: none; border: 0;
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-family: inherit; font-size: var(--text-sm); font-weight: 600;
          text-align: start;
          cursor: pointer;
          transition: background-color var(--t-ui) var(--ease), color var(--t-ui) var(--ease);
        }
        .nav-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
        .nav-item:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }
        /* Active is a flat brand tint with a brand rule on the leading edge.
           No gradient, no glow, no raised shadow — the mark is flat, and an
           "active" state that looks pressed is depth this system does not use. */
        .nav-item.active {
          background: var(--brand-soft);
          color: var(--brand-eyebrow);
          box-shadow: inset 2px 0 0 0 var(--brand);
        }
        :global([dir='rtl']) .nav-item.active { box-shadow: inset -2px 0 0 0 var(--brand); }

        .nav-foot {
          margin-block-start: auto;
          padding-block-start: var(--space-4);
          border-block-start: 1px solid var(--border);
        }

        .shell-main { flex: 1; min-inline-size: 0; }
        .shell-content {
          max-inline-size: var(--shell-max);
          margin-inline: auto;
          padding: var(--shell-pad-y) var(--gutter);
        }

        @media (max-width: 860px) {
          .nav-toggle { display: inline-flex; }
          .shell-body { display: block; }
          .shell-nav {
            position: fixed;
            inset-block: 57px 0;
            inset-inline-start: 0;
            inline-size: min(80vw, 300px);
            max-block-size: none;
            background: var(--bg-secondary);
            z-index: 30;
            transform: translateX(-100%);
            transition: transform var(--t-enter) var(--ease);
          }
          :global([dir='rtl']) .shell-nav { transform: translateX(100%); }
          .shell-nav.open { transform: none; }
          .shell-content { padding-inline: 16px; }
        }
      `}</style>
    </div>
  );
}
