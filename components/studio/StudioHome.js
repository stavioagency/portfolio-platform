// Studio Home — the `home` item of the studio shell.
//
// Answers ONE question: what should I do next? (design.md §6)
//
// Reading order, and the reason for it:
//   1. the portfolio      — largest thing on screen. They came to see their work
//   2. what is waiting    — few, optional, each one a link to the thing it names
//   3. address, and depth — "Everything else" is where a returning client with
//                           an intent goes directly
//
// Not a dashboard: no tiles, no charts, no counters, no completion percentage.
// A percentage would turn a portfolio into a form to complete, which is the
// feeling this product exists to remove.
//
// SECTION 1 — frontend only. The data is mock and publishing mutates local
// state; both arrive for real in their own sections. The architecture around
// them is not mock: one renderer, a real draft channel, and draft and published
// as genuinely separate objects.
//
// Language and theme belong to the shell (AppShell + lib/shell-prefs). This
// component receives `lang` and never reaches for it itself.

import { useCallback, useEffect, useMemo, useState } from 'react';
import OwnerBar from './OwnerBar';
import PublishSheet from './PublishSheet';
import PortfolioPreview from './PortfolioPreview';
import AttentionQueue from './AttentionQueue';
import StudioIndex from './StudioIndex';
import YouPanel from './panels/YouPanel';
import PiecePanel from './panels/PiecePanel';
import LinksPanel from './panels/LinksPanel';
import LookPanel from './panels/LookPanel';
import {
  PANELS,
  intentForField,
  intentForIndex,
  setField,
  setPieceField,
  updatePiece,
  setLook,
  moveEarlier,
  moveLater,
  keepSuggestion,
  applyDirection,
  setActionDestination,
} from '../../lib/studio/editor';
import { DIRECTIONS } from '../../lib/studio/mock-portfolio';
import {
  diff,
  publishState,
  queueItems,
  unreviewedSuggestions,
  QUEUE_IDS,
} from '../../lib/studio/draft';
import { studioStrings } from '../../lib/studio/strings';
import FirstRun from './FirstRun';
import { firstDraft, isUntouched } from '../../lib/studio/first-draft';
import { mockDraft, mockPublished, mockEmpty, PERSONAS, MOCK_ADDRESS } from '../../lib/studio/mock-portfolio';

export default function StudioHome({ lang = 'en' }) {
  const [draft, setDraft] = useState(mockDraft);
  const [published, setPublished] = useState(mockPublished);
  const [offline, setOffline] = useState(false);
  // The preview must show the truth of what visitors will see, so it starts on
  // the device the CLIENT is holding. Set after mount rather than during
  // render — the server cannot know a viewport, and guessing would hydrate
  // wrong.
  const [view, setView] = useState('desktop');
  useEffect(() => {
    const w = window.innerWidth;
    setView(w < 768 ? 'phone' : w < 1100 ? 'tablet' : 'desktop');
  }, []);
  const [skipped, setSkipped] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState('');
  // What is being edited, if anything. `null` is the resting state, and at
  // rest zero form fields exist on the page.
  const [editing, setEditing] = useState(null);
  const [indexOpen, setIndexOpen] = useState(false);
  // A reveal request for the portfolio. The nonce lets the same region be
  // revealed twice in a row.
  const [reveal, setReveal] = useState(null);

  const s = studioStrings(lang);
  const state = publishState(draft, published, { offline });
  // Blueprint §6.2, first row: an untouched client gets the three-step first
  // run and NOTHING ELSE on the page. Not "all three steps done" — a client
  // who has written a bio but added no photo has started, and dropping them
  // back onto a blank slate would discard what they just did.
  const firstRun = isUntouched(draft);
  const { count, parts } = useMemo(() => diff(draft, published), [draft, published]);
  const items = useMemo(
    () => queueItems(draft, { skipped, published }),
    [draft, skipped, published],
  );

  const say = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 1600);
  }, []);

  // An intent is either "open this panel" or "reveal this region". Nothing
  // else: there is no third kind of destination, which is what stops a
  // management screen appearing.
  const act = useCallback((intent) => {
    if (!intent) return;
    setIndexOpen(false);
    if (intent.reveal) {
      // Work reveals the portfolio and opens NOTHING. The portfolio remains
      // the navigation surface; a piece is edited by touching that piece.
      setEditing(null);
      setReveal({ field: intent.reveal, nonce: Date.now() });
      return;
    }
    setEditing(intent);
  }, []);

  // A first-run step becomes the same kind of intent everything else does.
  // There is no fourth destination invented for it: name and photo are the
  // "you" panel, and a piece opens the first empty slot the client was handed.
  // Reusing intents is what stops the first run becoming a second product with
  // its own navigation.
  const onFirstRunStep = useCallback((id) => {
    if (id === 'piece') {
      const slot = (draft.pieces || [])[0];
      if (slot) { act({ panel: PANELS.PIECE, pieceId: slot.id, focus: 'name' }); return; }
      act(intentForIndex('work'));
      return;
    }
    // 'photo' never reaches here: FirstRun does not make that step a button
    // while the Studio has no photo control. If that changes, this is where it
    // routes.
    act({ panel: PANELS.YOU, focus: 'name' });
  }, [act, draft.pieces]);

  // Clicking the portfolio opens the panel for what was clicked.
  const onFieldClick = useCallback((field) => act(intentForField(field)), [act]);

  const onQueueAction = useCallback((item, action) => {
    // Section 1 resolves the bio offer locally so the queue can be seen to
    // empty. "another way" and "write mine" belong to the editor.
    if (item.id === QUEUE_IDS.BIO_SUGGESTION && action === 'keep') {
      setDraft((d) => ({ ...d, bioIsSuggestion: false }));
      return;
    }
    say(s.editField(s.fieldNames[item.field] || item.field));
  }, [s, say]);

  // Every edit lands in the draft immediately. Draft changes save
  // automatically; publishing is the deliberate action that makes changes
  // visible to visitors — so there is no save button anywhere below.
  const onField = useCallback((field, l, v) => {
    // Typing your own words IS rewriting, so the offer ends here too — not
    // only when the "write mine" button is pressed. A suggestion that survived
    // the client replacing it would be telling them their own sentence is
    // still ours. keepSuggestion is a no-op on fields that carry no offer.
    setDraft((d) => keepSuggestion(setField(d, field, l, v), field));
  }, []);

  const onPieceField = useCallback((id, field, l, v) => {
    setDraft((d) => setPieceField(d, id, field, l, v));
  }, []);

  const onPiecePatch = useCallback((id, patch) => {
    setDraft((d) => updatePiece(d, id, patch));
  }, []);

  const onLook = useCallback((key, value) => {
    setDraft((d) => setLook(d, key, value));
  }, []);

  const onLink = useCallback((id, label, url) => {
    setDraft((d) => {
      const links = d.links || [];
      const exists = links.some((l) => l.id === id);
      return {
        ...d,
        links: exists
          ? links.map((l) => (l.id === id ? { ...l, url } : l))
          : [...links, { id, label, url }],
      };
    });
  }, []);

  const onDestination = useCallback((value) => {
    setDraft((d) => setActionDestination(d, value));
  }, []);

  // Ordering is curation, not layout control. An impossible move returns the
  // same array, so a dead click cannot invent an unpublished change.
  const onMoveEarlier = useCallback((id) => {
    setDraft((d) => ({ ...d, pieces: moveEarlier(d.pieces, id) }));
  }, []);
  const onMoveLater = useCallback((id) => {
    setDraft((d) => ({ ...d, pieces: moveLater(d.pieces, id) }));
  }, []);

  const onKeepSuggestion = useCallback((field) => {
    setDraft((d) => keepSuggestion(d, field));
  }, []);

  // Section 1 has no generator, so "another way" is honest about that rather
  // than faking a second suggestion.
  const onAnotherSuggestion = useCallback(() => {
    say(lang === 'ar' ? 'صياغة أخرى — قريبًا' : 'Another way — coming soon');
  }, [say, lang]);

  // A direction is a creative reset and touches PRESENTATION ONLY. It cannot
  // overwrite a word the client wrote — enforced in applyDirection, not here.
  const onApplyDirection = useCallback((direction) => {
    setDraft((d) => applyDirection(d, direction));
  }, []);

  const onPublish = useCallback(() => {
    // Local promotion only — no snapshot, no network. Enough to prove the
    // states are separate and that every indicator follows from the data.
    setPublished(JSON.parse(JSON.stringify(draft)));
    setSheetOpen(false);
  }, [draft]);

  const rtl = lang === 'ar';

  return (
    // The direction is declared HERE, from the language this screen was given,
    // rather than inherited from <html>. The document defaults to Arabic, so a
    // component that trusts the ambient direction renders English text in an
    // RTL frame — which is what happened the first time this was opened in a
    // browser: "3 pieces could use names." came out as "pieces could use
    // names 3.". Direction belongs to whoever knows the language.
    <div className="home" dir={rtl ? 'rtl' : 'ltr'} lang={lang}>
      {/* ── SECTION 1 SCAFFOLDING — not part of the design ─────────────
          Lets the states be reviewed without a backend. Deleted with the
          mock data. */}
      <div className="scaffold">
        <span>section 1</span>
        <button type="button" onClick={() => { setDraft(mockDraft()); setPublished(mockPublished()); setOffline(false); setSkipped([]); }}>changes pending</button>
        <button type="button" onClick={() => { const d = mockDraft(); d.bioIsSuggestion = false; setDraft(d); setPublished(JSON.parse(JSON.stringify(d))); setOffline(false); }}>up to date</button>
        <button type="button" onClick={() => { const d = mockDraft(); setDraft(d); setPublished(null); setOffline(false); }}>never published</button>
        <button type="button" onClick={() => { setDraft(mockEmpty()); setPublished(null); setOffline(false); }}>empty</button>
        <button type="button" onClick={() => { setDraft(firstDraft({ name: 'Noura Al-Harbi' })); setPublished(null); setOffline(false); setSkipped([]); }}>first run</button>
        <button type="button" onClick={() => setOffline((v) => !v)}>offline</button>
        {/* Persona fixtures — for judging the work layout against real
            disciplines, not part of the product. */}
        {Object.keys(PERSONAS).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => { const d = JSON.parse(JSON.stringify(PERSONAS[key])); setDraft(d); setPublished(JSON.parse(JSON.stringify(d))); setOffline(false); setSkipped([]); }}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDraft((d) => ({
            ...d,
            title: { en: 'Portrait photographer, Riyadh', ar: 'مصوّرة بورتريه، الرياض' },
          }))}
        >
          simulate an edit
        </button>
      </div>

      <OwnerBar
        name={draft.name}
        lang={lang}
        state={state}
        onPublish={() => setSheetOpen(true)}
      />

      {offline && (
        <section className="offline">
          <div className="txt">
            <b>{s.offlineTitle}</b>
            {s.offlineBody}
          </div>
          <button type="button" className="go">{s.reactivate}</button>
        </section>
      )}

      {sheetOpen && (
        <PublishSheet
          lang={lang}
          parts={parts}
          count={count}
          unreviewed={unreviewedSuggestions(draft)}
          address={MOCK_ADDRESS}
          firstPublish={state === 'never'}
          onConfirm={onPublish}
          onDismiss={() => setSheetOpen(false)}
        />
      )}

      {/* The portfolio and the open panel sit SIDE BY SIDE. The panel never
          covers the portfolio and is never a modal: if the client cannot see
          the effect of what they are changing, the panel has failed at the one
          job it has. Below 900px they stack, portfolio first, so the result is
          still above the controls. */}
      <div className={editing ? 'stageWrap editing' : 'stageWrap'}>
        <div className="stageCol">
          <PortfolioPreview
            draft={draft}
            lang={lang}
            view={view}
            onFieldClick={onFieldClick}
            reveal={reveal}
          />
        </div>

        {editing && (
          <div className="panelCol">
            {editing.panel === PANELS.YOU && (
              <YouPanel
                draft={draft}
                lang={lang}
                focus={editing.focus}
                onClose={() => setEditing(null)}
                onField={onField}
                onKeepSuggestion={onKeepSuggestion}
                onAnotherSuggestion={onAnotherSuggestion}
              />
            )}
            {editing.panel === PANELS.PIECE && (
              <PiecePanel
                draft={draft}
                pieceId={editing.pieceId}
                lang={lang}
                focus={editing.focus}
                onClose={() => setEditing(null)}
                onPieceField={onPieceField}
                onPiecePatch={onPiecePatch}
                onMoveEarlier={onMoveEarlier}
                onMoveLater={onMoveLater}
              />
            )}
            {editing.panel === PANELS.LINKS && (
              <LinksPanel
                draft={draft}
                lang={lang}
                onClose={() => setEditing(null)}
                onLink={onLink}
                onDestination={onDestination}
              />
            )}
            {editing.panel === PANELS.LOOK && (
              <LookPanel
                draft={draft}
                lang={lang}
                directions={DIRECTIONS}
                onClose={() => setEditing(null)}
                onLook={onLook}
                onApplyDirection={onApplyDirection}
              />
            )}
          </div>
        )}
      </div>

      <div className="previewFoot">
        {/* Says plainly what the frame is showing — the honest answer to
            "is this what visitors see?" */}
        <span>
          {state === 'never' ? s.onlyYou : count > 0 ? s.onlyYouChanges : s.visitorsSee}
        </span>
        <span className="spacer" />
        {/* The device switcher. Its whole job is answering "what will visitors
            see before I publish" — on the three machines they will actually
            use. */}
        <div className="seg">
          {['desktop', 'tablet', 'phone'].map((device) => (
            <button
              key={device}
              type="button"
              aria-pressed={view === device}
              onClick={() => setView(device)}
            >
              {s[device]}
            </button>
          ))}
        </div>
      </div>

      {/* Blueprint §5.4: the first run sits under the preview, which is
          "already there, already showing the real empty portfolio". The queue
          does not appear at all — there is nothing waiting for someone who has
          not started, and a queue on an empty portfolio is a list of things
          they have failed to do. */}
      {firstRun && !editing && (
        <FirstRun draft={draft} lang={lang} onStep={onFirstRunStep} />
      )}

      {/* One thing at a time: while a panel is open the queue steps aside
          rather than competing with it. */}
      {!firstRun && !editing && !indexOpen && (
        <AttentionQueue
          items={items}
          lang={lang}
          firstPublish={state === 'never'}
          onAction={onQueueAction}
          onSkip={(id) => setSkipped((prev) => [...prev, id])}
          onPublish={() => setSheetOpen(true)}
        />
      )}

      {indexOpen && (
        <StudioIndex
          lang={lang}
          onChoose={(entry) => act(intentForIndex(entry))}
          onClose={() => setIndexOpen(false)}
        />
      )}

      <footer className="foot">
        {state !== 'never' && !offline && (
          <span className="addr">
            <span className="livedot" aria-hidden="true" />
            {s.live} · {MOCK_ADDRESS}
          </span>
        )}
        <span className="spacer" />
        {/* Depth is reached, not displayed — and during the first run it is not
            even offered. "Nothing else on the page" is the whole instruction. */}
        {!firstRun && (
          <button type="button" className="more" onClick={() => { setEditing(null); setIndexOpen((v) => !v); }}>
            {s.everythingElse} <span aria-hidden="true">{rtl ? '←' : '→'}</span>
          </button>
        )}
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}

      <style jsx>{`
        .home { display: block; }

        /* Room to breathe above the portfolio, so it reads as presented rather
           than as the next thing stacked under the header — and so the client's
           name in the chrome does not sit directly on top of the same name
           rendered large inside their site. */
        .stageWrap { margin-top: var(--space-5); }
        .stageCol { min-width: 0; }
        @media (min-width: 900px) {
          .stageWrap.editing {
            display: grid;
            /* The portfolio keeps the majority of the width. It does not shrink
               into a thumbnail because a panel opened. */
            grid-template-columns: minmax(0, 1.9fr) minmax(280px, 0.9fr);
            gap: var(--space-4);
            align-items: start;
          }
        }
        @media (max-width: 899px) {
          /* Stacked, portfolio FIRST — the result stays above the controls.
             This deliberately does NOT use position: sticky. A sticky panel
             pinned to the bottom lifts itself over the portfolio, which is the
             one thing the panel may never do: it was measured overlapping the
             frame exactly, on a 375px viewport. Plain stacking keeps the
             portfolio uncovered and the page simply scrolls. */
          .stageWrap.editing { display: grid; gap: var(--space-3); }
        }

        .scaffold {
          display: flex;
          gap: var(--space-2);
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: var(--space-4);
          padding: 6px 8px;
          border: 1px dashed var(--border-strong);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 11.5px;
        }
        .scaffold button {
          font: inherit;
          cursor: pointer;
          background: var(--bg-hover);
          color: var(--text-secondary);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 3px 8px;
        }

        .offline {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          flex-wrap: wrap;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-3) var(--space-5);
          margin-bottom: var(--space-4);
          font-size: 13.5px;
          color: var(--text-secondary);
        }
        .offline .txt { flex: 1; min-width: 200px; }
        .offline b { display: block; color: var(--text-primary); font-weight: 600; }

        .previewFoot {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-3) 2px 0;
          font-size: 13.5px;
          /* Secondary, not tertiary. "Only you can see these changes" is the
             answer to the question the client is actually asking while they
             look at the frame; it should not be the faintest text on screen. */
          color: var(--text-secondary);
          flex-wrap: wrap;
        }
        .spacer { flex: 1; }
        .seg {
          display: flex;
          gap: 2px;
          padding: 2px;
          background: var(--bg-secondary);
          border-radius: 7px;
        }
        .seg button {
          font: inherit;
          cursor: pointer;
          border: 0;
          background: transparent;
          border-radius: 5px;
          padding: 4px 11px;
          font-size: 12.5px;
          color: var(--text-secondary);
          transition: background var(--t-ui) var(--ease);
        }
        .seg button[aria-pressed='true'] {
          background: var(--bg-elevated);
          color: var(--text-primary);
          font-weight: 600;
        }

        .foot {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-wrap: wrap;
          margin-top: var(--space-5);
          padding-top: var(--space-4);
          border-top: 1px solid var(--border);
          font-size: 13.5px;
          color: var(--text-secondary);
        }
        .addr { display: inline-flex; align-items: center; gap: var(--space-2); }
        .livedot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--success, #3ECF8E);
        }
        .more {
          font: inherit;
          cursor: pointer;
          border: 0;
          background: none;
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
          display: inline-flex;
          gap: var(--space-2);
        }
        .more:hover { color: var(--brand); }

        .go {
          font: inherit;
          cursor: pointer;
          border: 0;
          border-radius: var(--radius-sm);
          padding: 7px 13px;
          font-size: 13px;
          font-weight: 600;
          background: var(--accent);
          color: var(--accent-fg);
        }

        .toast {
          position: fixed;
          bottom: var(--space-5);
          inset-inline-start: 50%;
          transform: translateX(-50%);
          background: var(--bg-elevated);
          border: 1px solid var(--border-strong);
          color: var(--text-primary);
          padding: 9px var(--space-4);
          border-radius: var(--radius-sm);
          font-size: 13.5px;
          pointer-events: none;
          z-index: 5;
        }
      `}</style>
    </div>
  );
}
