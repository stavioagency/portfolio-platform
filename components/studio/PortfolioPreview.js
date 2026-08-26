// PortfolioPreview — the Studio's window onto the real portfolio.
//
// ONE COMPONENT, TWO SIZES (blueprint §8.5). Studio Home and the editor both
// use this. Building a second, smaller preview for the home screen would
// recreate the second renderer the architecture exists to prevent — just at
// component level instead of page level.
//
// What it owns:
//   * the iframe, and the handshake with the document inside it
//   * sequence numbers, so out-of-order delivery cannot regress the view
//   * viewport truth: each mode runs at a REAL width and is scaled only in
//     apparent size, so "mobile" is genuinely the mobile layout and not a
//     shrunken desktop one
//   * translating a field click into a callback for the host
//
// What it does not own: what the draft means, or whether it is published.

import { useCallback, useEffect, useRef, useState } from 'react';

const CHANNEL = {
  READY: 'designakum:preview-ready',
  DRAFT: 'designakum:draft',
  FIELD: 'designakum:field',
  REVEAL: 'designakum:reveal',
};

// REAL VIEWPORT WIDTHS — three devices, because "will this work on a phone"
// and "will this work on an iPad" are different questions and a client cannot
// answer either from one desktop-shaped preview.
//
// They are named for what a VISITOR is holding, not for a screen size class.
// The client is previewing someone else's experience, not managing breakpoints.
//
// The frame genuinely runs at these widths, so the portfolio's own media
// queries fire exactly as they will for a visitor. The CSS scale that fits the
// frame into the Studio changes its apparent SIZE and nothing else: layout,
// wrapping and breakpoints are all computed at the true width. This is a real
// device preview, never a screenshot of one.
//
// 834 rather than 768 for tablet on purpose: 768 is itself a common breakpoint
// value, and previewing exactly on a boundary tells you the least.
export const DEVICES = { desktop: 1280, tablet: 834, phone: 390 };
const WIDTHS = DEVICES;

export default function PortfolioPreview({
  draft,
  lang = 'en',
  view = 'desktop',
  onFieldClick,
  // { field, nonce } — the nonce lets the SAME region be revealed twice in a
  // row, which a bare field name could not express.
  reveal = null,
  className = '',
}) {
  const frameRef = useRef(null);
  const stageRef = useRef(null);
  const seq = useRef(0);
  const [scale, setScale] = useState(1);
  const rafRef = useRef(0);

  // The latest draft, readable from an event handler that was registered once.
  // Without this the handler would close over the draft it was created with and
  // answer a re-announcement with stale content.
  const latest = useRef({ draft, lang });
  latest.current = { draft, lang };

  const post = useCallback(() => {
    const frame = frameRef.current;
    if (!frame || !frame.contentWindow) return;
    seq.current += 1;
    frame.contentWindow.postMessage(
      {
        type: CHANNEL.DRAFT,
        seq: seq.current,
        draft: latest.current.draft,
        lang: latest.current.lang,
      },
      window.location.origin,      // never '*' — a draft is unpublished content
    );
  }, []);

  // Listen for the frame announcing itself, and for field clicks coming back.
  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg) return;
      // Answer EVERY announcement, not just the first: the frame re-announces
      // whenever its document is replaced, and a one-way latch would leave it
      // blank for the rest of the session.
      if (msg.type === CHANNEL.READY) post();
      if (msg.type === CHANNEL.FIELD && onFieldClick) onFieldClick(msg.field);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onFieldClick, post]);

  // Push on every draft change, coalesced to one animation frame. The
  // perceptual budget is --t-press: beyond that it stops feeling like typing
  // into a page.
  //
  // NEVER gated on having heard from the frame. The gate that used to be here
  // was the mirror of the first handshake bug: the frame is answered once and
  // stops announcing, so a Studio that remounts and loses the flag would wait
  // for an announcement that never comes again, and the portfolio would
  // silently stop updating while the client types.
  //
  // The rule, now on both sides: neither may depend on having heard from the
  // other. The frame asks until answered; the Studio sends whenever it has
  // something to say. A message that arrives too early is ignored, which costs
  // nothing.
  useEffect(() => {
    // requestAnimationFrame does not fire in a hidden tab, so coalescing
    // through it alone means a change made while the tab is in the background
    // is never sent at all. Nobody is typing into a hidden tab, so there is
    // nothing to coalesce there — send it straight away and stay deterministic.
    if (typeof document !== 'undefined' && document.hidden) {
      post();
      return undefined;
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(post);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draft, lang, post]);

  // Ask the frame to bring a region into view.
  useEffect(() => {
    if (!reveal || !reveal.field) return;
    const frame = frameRef.current;
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(
      { type: CHANNEL.REVEAL, field: reveal.field },
      window.location.origin,
    );
  }, [reveal]);

  // Fit the real viewport width into whatever space the stage has.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => {
      const width = stage.clientWidth;
      if (width > 0) setScale(width / WIDTHS[view]);
    };
    measure();
    // The stage height is a clamp() on viewport height, so it changes on
    // resize without any class changing — observe the element, not the window.
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [view]);

  const width = WIDTHS[view];
  const rtl = lang === 'ar';

  return (
    <div ref={stageRef} className={`stage ${view} ${className}`}>
      <iframe
        ref={frameRef}
        src="/studio/preview"
        title="Your portfolio"
        // A document that has just loaded may have announced itself before this
        // component was listening. Sending on load closes that window without
        // relying on the frame to ask again.
        onLoad={post}
        // No allow-same-origin removal: the channel requires a real origin so
        // both sides can verify each other.
        style={{
          width: `${width}px`,
          height: scale > 0 ? `${100 / scale}%` : '100%',
          transform: `scale(${scale})`,
          transformOrigin: rtl ? 'top right' : 'top left',
        }}
      />
      <style jsx>{`
        /* This is the client's site, so it is presented as a document rather
           than as a panel: raised slightly off the page, with a hairline
           instead of a card border.
           The hover border-highlight that used to be here has been removed —
           lighting up the whole frame on hover is how a widget behaves, and it
           announced "embedded preview" on every mouse move. The affordance
           that matters lives inside the frame, where hovering an actual
           region outlines that region. */
        .stage {
          position: relative;
          overflow: hidden;
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: 0 18px 40px -24px rgba(0, 0, 0, 0.75);
        }

        /* Height follows the viewport: rich on a large display, never so tall
           on a laptop that the attention queue falls below the fold. The floor
           is what keeps this a portfolio rather than a thumbnail. */
        /* 46vh, not 40: at 40 the first row of work was clipped through the
           middle of every image on a 900px display, so the client's first
           impression of their own portfolio was a cropped strip. 46vh clears
           the row on a normal laptop and still leaves "A few things waiting"
           and its first item above the fold at 768px. */
        /* Each device gets a stage shaped roughly like the device, so the
           preview reads as that machine rather than as a letterbox. */
        .stage.desktop { height: clamp(240px, 46vh, 560px); }
        .stage.tablet {
          height: clamp(320px, 52vh, 620px);
          max-width: 640px;
          margin-inline: auto;
        }
        .stage.phone {
          height: clamp(320px, 48vh, 560px);
          max-width: 390px;
          margin-inline: auto;
        }
        @media (max-width: 820px) {
          .stage.desktop { height: clamp(200px, 30vh, 320px); }
        }

        iframe {
          display: block;
          border: 0;
          background: var(--bg-primary);
        }
      `}</style>
    </div>
  );
}
