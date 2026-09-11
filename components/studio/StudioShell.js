// StudioShell — the frame every Studio screen is drawn inside.
//
// WHAT IT IS RESPONSIBLE FOR: navigation, direction, and the two pieces of
// context a customer needs on every screen — which portfolio they are editing
// and whether it is live. Nothing else. It renders no section content and knows
// no section's data, so a screen can be built or rebuilt without touching this
// file.
//
// ── IT IS A WORKSPACE, NOT A DASHBOARD ───────────────────────────────────
// The old editor's chrome announced itself: a full-width bar, a title repeated
// on every screen, a row of badges. This is deliberately quiet — a rail on the
// left, a thin status line, and the rest of the screen given to the work. The
// customer should read their own content first and the tool second.
//
// ── DIRECTION IS STRUCTURAL, NOT TRANSLATED ──────────────────────────────
// Everything here is laid out with LOGICAL properties — inline-start, not left.
// Set dir="rtl" and the rail moves to the right, the icons lead correctly, and
// the mobile bar mirrors, with no second stylesheet and no RTL overrides. That
// is the difference between an Arabic product and an English product with the
// strings swapped.
//
// ── MOBILE IS NOT A NARROW DESKTOP ───────────────────────────────────────
// Below the breakpoint the rail becomes a bottom bar carrying the five primary
// sections, because those are the five things people came to do and a thumb
// reaches the bottom of a phone. "More" opens as a sheet rather than trying to
// fit nine items into a strip nobody can hit.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui';
import { studioNav } from '../../lib/studio-nav';

export default function StudioShell({
  section,
  onSection,
  lang = 'ar',
  onLang,
  status = null,        // { published, hasChanges, slug } | null while unknown
  account = null,       // { email }
  workspace = null,     // the name of the portfolio being edited
  workspaces = null,    // every portfolio this account may edit
  workspaceId = null,
  onWorkspace = () => {},
  onSignOut,
  children,
}) {
  const ar = lang === 'ar';
  const nav = studioNav(ar);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  // A sheet that cannot be dismissed by the gesture everybody already knows is
  // a trap. Escape and an outside click both close it.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    const onDown = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [moreOpen]);

  const inMore = nav.more.items.some((i) => i.id === section);
  const go = (id) => { setMoreOpen(false); onSection(id); };

  return (
    <div className="studio" dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'}>
      {/* ── THE RAIL (desktop) ────────────────────────────────────────── */}
      <nav className="rail" aria-label={ar ? 'أقسام الاستوديو' : 'Studio sections'}>
        <div className="mark" aria-hidden="true">D</div>

        <ul className="items">
          {nav.primary.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={section === item.id ? 'item on' : 'item'}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => go(item.id)}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <ul className="items rest">
          <li className="sep" role="presentation" />
          {nav.more.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={section === item.id ? 'item quiet on' : 'item quiet'}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => go(item.id)}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="foot">
          {/* WHICH PORTFOLIO AM I EDITING.
              A customer has exactly one workspace and sees a label. A platform
              owner is enrolled as an admin of EVERY tenant, so for them this is
              a chooser — without it the Studio silently opened whichever row
              sorted first, which was a real client's portfolio.
              The prompt's own rule: an operator must never accidentally act on
              the wrong customer, and identity must be explicit. */}
          {workspaces && workspaces.length > 1 ? (
            <label className="pick">
              <span className="srOnly">{ar ? 'المعرض' : 'Portfolio'}</span>
              <select value={workspaceId || ''} onChange={(e) => onWorkspace(e.target.value)}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name || w.slug}</option>
                ))}
              </select>
            </label>
          ) : workspace ? <p className="ws" title={workspace}>{workspace}</p> : null}
          {account && <p className="who" title={account.email}>{account.email}</p>}
          <div className="footRow">
            {/* Named in the language it switches TO, which is the only label
                that tells you what pressing it does. */}
            <button type="button" className="chip" onClick={() => onLang(ar ? 'en' : 'ar')}>
              {ar ? 'EN' : 'ع'}
            </button>
            <button type="button" className="chip" onClick={onSignOut}>
              <Icon name="logout" size={15} />
              <span className="srOnly">{ar ? 'تسجيل الخروج' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ── THE WORK AREA ─────────────────────────────────────────────── */}
      <div className="pane">
        <StatusLine status={status} ar={ar} />
        <main className="body">{children}</main>
      </div>

      {/* ── THE BOTTOM BAR (mobile) ───────────────────────────────────── */}
      <nav className="bar" aria-label={ar ? 'أقسام الاستوديو' : 'Studio sections'}>
        {nav.primary.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? 'tab on' : 'tab'}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => go(item.id)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={inMore || moreOpen ? 'tab on' : 'tab'}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <Icon name="menu" size={19} />
          <span>{nav.more.label}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheetWrap" role="dialog" aria-modal="true" aria-label={nav.more.label}>
          <div className="sheet" ref={moreRef}>
            {nav.more.items.map((item) => (
              <button key={item.id} type="button" className={section === item.id ? 'row on' : 'row'} onClick={() => go(item.id)}>
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="sheetFoot">
              <button type="button" className="row" onClick={() => { setMoreOpen(false); onLang(ar ? 'en' : 'ar'); }}>
                <Icon name="globe" size={18} />
                <span>{ar ? 'English' : 'العربية'}</span>
              </button>
              <button type="button" className="row" onClick={onSignOut}>
                <Icon name="logout" size={18} />
                <span>{ar ? 'تسجيل الخروج' : 'Sign out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .studio {
          /* dvh, with vh kept above it as the fallback: on a phone 100vh counts
             the strip behind the URL bar, so the shell claimed more height than
             was ever visible underneath a fixed bottom bar. */
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: var(--font-body);
        }

        /* ── RAIL ─────────────────────────────────────────────────────── */
        .rail {
          flex: none;
          width: 232px;
          display: none;
          flex-direction: column;
          gap: var(--space-2);
          padding: var(--space-5) var(--space-3);
          border-inline-end: 1px solid var(--border-default);
          background: var(--bg-secondary);
          position: sticky;
          top: 0;
          height: 100vh;
        }
        .mark {
          width: 34px; height: 34px;
          display: grid; place-items: center;
          border-radius: var(--radius-md);
          background: var(--brand);
          color: var(--accent-fg);
          font-weight: 800;
          margin: 0 var(--space-2) var(--space-4);
        }
        .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
        .rest { margin-top: auto; }
        .sep { height: 1px; background: var(--border-default); margin: var(--space-3) var(--space-2); }
        .item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 9px var(--space-3);
          border: 0;
          border-radius: var(--radius-md);
          background: none;
          color: var(--text-secondary);
          font: inherit;
          font-size: var(--text-sm);
          /* Logical, so Arabic mirrors without a second rule. */
          text-align: start;
          cursor: pointer;
          transition: background var(--t-ui) var(--ease), color var(--t-ui) var(--ease);
        }
        .item:hover { background: var(--surface-hover); color: var(--text-primary); }
        .item.on { background: var(--brand-soft); color: var(--text-primary); font-weight: 600; }
        .item.quiet { color: var(--text-tertiary); }
        .item.quiet:hover { color: var(--text-secondary); }
        .item:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        .foot { margin-top: var(--space-3); }
        .pick { display: block; margin: 0 var(--space-2) var(--space-2); }
        .pick select {
          width: 100%; min-block-size: 36px; padding: 0 8px;
          border: 1px solid var(--border-default); border-radius: var(--radius-sm);
          background: var(--surface-input); color: var(--text-primary);
          font: inherit; font-size: var(--text-xs); font-weight: 600;
        }
        .pick select:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .ws {
          margin: 0 0 2px;
          padding-inline: var(--space-3);
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-secondary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .who {
          margin: 0 0 var(--space-2);
          padding-inline: var(--space-3);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .footRow { display: flex; gap: 6px; padding-inline: var(--space-2); }
        .chip {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          min-width: 38px; height: 34px; padding: 0 10px;
          border: 1px solid var(--action-secondary-border);
          border-radius: var(--radius-sm);
          background: var(--action-secondary-bg);
          color: var(--action-secondary-fg);
          font: inherit; font-size: var(--text-xs); font-weight: 600;
          cursor: pointer;
        }
        .chip:hover { background: var(--action-secondary-bg-hover); }
        .chip:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        /* ── WORK AREA ────────────────────────────────────────────────── */
        .pane { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .body {
          flex: 1;
          width: 100%;
          max-width: var(--content-max);
          margin-inline: auto;
          padding: var(--space-5) var(--gutter) calc(var(--space-10) + 64px);
        }

        /* ── BOTTOM BAR ───────────────────────────────────────────────── */
        .bar {
          position: fixed;
          inset-block-end: 0; inset-inline: 0;
          display: flex;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-default);
          padding-bottom: env(safe-area-inset-bottom);
          z-index: 20;
        }
        .tab {
          flex: 1;
          min-width: 0;
          /* A thumb target, not a link. */
          min-height: var(--tap-min);
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          padding: 8px 2px;
          border: 0; background: none;
          color: var(--text-tertiary);
          font: inherit; font-size: 10px;
          cursor: pointer;
        }
        .tab span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tab.on { color: var(--text-link); }
        .tab:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }

        .sheetWrap {
          position: fixed; inset: 0; z-index: 30;
          background: rgba(0, 0, 0, 0.5);
          display: flex; align-items: flex-end;
        }
        .sheet {
          width: 100%;
          background: var(--surface-elevated);
          border-top-left-radius: var(--radius-xl);
          border-top-right-radius: var(--radius-xl);
          padding: var(--space-4) var(--space-3) calc(var(--space-4) + 64px);
          animation: rise var(--t-enter) var(--ease-pop) both;
        }
        @keyframes rise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
        .row {
          width: 100%;
          display: flex; align-items: center; gap: var(--space-3);
          min-height: var(--tap-min);
          padding: 0 var(--space-3);
          border: 0; border-radius: var(--radius-md);
          background: none; color: var(--text-secondary);
          font: inherit; font-size: var(--text-md); text-align: start;
          cursor: pointer;
        }
        .row.on { background: var(--brand-soft); color: var(--text-primary); font-weight: 600; }
        .row:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }
        .sheetFoot { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-default); }

        .srOnly {
          position: absolute; width: 1px; height: 1px;
          margin: -1px; padding: 0; border: 0;
          overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
        }

        @media (prefers-reduced-motion: reduce) {
          .sheet { animation: none; }
          .item { transition: none; }
        }

        /* The rail replaces the bar once there is room for it. 900px rather than
           a tablet width: the rail costs 232px, and below this the work area
           gets narrower than the content it has to hold. */
        @media (min-width: 900px) {
          .rail { display: flex; }
          .bar, .sheetWrap { display: none; }
          .body { padding-bottom: var(--space-10); }
        }
      `}</style>
    </div>
  );
}

// THE ONE PIECE OF CONTEXT ON EVERY SCREEN: is this live, and is what I am
// looking at what visitors see? Everything else about the portfolio's state
// belongs on Home, where there is room to explain it.
//
// It renders NOTHING until the answer is known. A status line that says "Draft"
// while it is still loading has told the customer something false.
function StatusLine({ status, ar }) {
  if (!status) return null;
  const { published, hasChanges, slug } = status;
  const tone = !published ? 'draft' : hasChanges ? 'changed' : 'live';
  const label = !published
    ? (ar ? 'مسودة — غير منشور' : 'Draft — not published')
    : hasChanges
      ? (ar ? 'منشور — لديك تغييرات لم تُنشر' : 'Published — you have unpublished changes')
      : (ar ? 'منشور' : 'Published');

  return (
    <div className={`line ${tone}`}>
      <span className="dot" aria-hidden="true" />
      <span className="txt">{label}</span>
      {published && slug && (
        <a className="open" href={`/${slug}`} target="_blank" rel="noreferrer">
          {ar ? 'عرض الصفحة' : 'View page'}
          <Icon name="external" size={13} />
        </a>
      )}
      <style jsx>{`
        .line {
          display: flex; align-items: center; gap: var(--space-2);
          padding: 10px var(--gutter);
          border-bottom: 1px solid var(--border-default);
          font-size: var(--text-xs);
          color: var(--text-secondary);
          background: var(--bg-secondary);
        }
        .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--text-tertiary); }
        .live .dot { background: var(--success); }
        .changed .dot { background: var(--warning); }
        .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .open {
          margin-inline-start: auto;
          display: inline-flex; align-items: center; gap: 5px;
          color: var(--text-link); text-decoration: none; font-weight: 600;
          white-space: nowrap;
        }
        .open:hover { text-decoration: underline; }
        .open:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: 4px; }
      `}</style>
    </div>
  );
}
