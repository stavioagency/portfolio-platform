// The preview document — the page the Studio's iframe loads.
//
// This is the HOST for PortfolioRenderer, and it is where all the Studio-facing
// behaviour lives so that the renderer itself can stay pure. It:
//
//   * announces itself when mounted, then renders whatever draft arrives
//   * ignores stale messages, so out-of-order delivery cannot regress the view
//   * translates a click into the NAME of the field that was clicked
//
// It never fetches. It has no data of its own and shows nothing until the
// Studio sends a draft — which is correct: an unpublished portfolio must not
// be reachable by loading a URL.
//
// WHY THIS ROUTE EXISTS, and it is a decision rather than a stopgap.
//
// PortfolioRenderer is the INTENDED FUTURE public renderer. Today's public page
// (pages/index.js) is a different product: a ticker, a banner slider, stats,
// CTA buttons, modals, driven by a different data shape. Merging them now would
// either change the customer's live site — which is out of scope — or make the
// Studio preview show today's design instead of the one being built.
//
// So the two stay separate until the new renderer is feature-complete and
// approved for shipping: "one renderer means one final shipped renderer, not
// premature extraction of a legacy implementation" (blueprint §8.2a).
//
// This route is what lets the future renderer be previewed on real draft data
// in the meantime. When the migration happens, the public page starts calling
// the same component with published data and this host barely changes.

import { useCallback, useEffect, useRef, useState } from 'react';
import PortfolioRenderer from '../../components/portfolio/PortfolioRenderer';

const CHANNEL = {
  READY: 'designakum:preview-ready',
  DRAFT: 'designakum:draft',
  FIELD: 'designakum:field',
  // Bring a region into view. This is how "Work" behaves: it reveals the work
  // inside the portfolio rather than opening a management screen, because the
  // portfolio remains the navigation surface.
  REVEAL: 'designakum:reveal',
};

export default function StudioPreview() {
  const [state, setState] = useState(null);
  const lastSeq = useRef(-1);

  useEffect(() => {
    function onMessage(event) {
      // SECURITY. In production the check is
      //     if (event.origin !== window.location.origin) return;
      // and the reply below uses that exact origin, never '*'. A draft is
      // unpublished content: '*' would hand it to whatever managed to frame
      // this page. Same-origin holds here because the Studio and this route
      // are served by one Next.js app.
      if (event.origin !== window.location.origin) return;

      const msg = event.data;
      if (!msg) return;

      if (msg.type === CHANNEL.REVEAL) {
        const el = document.querySelector(`[data-field="${CSS.escape(msg.field)}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // A brief outline so the eye lands on what was revealed. It fades on
        // its own — nothing in the portfolio stays marked.
        el.classList.add('revealed');
        window.setTimeout(() => el.classList.remove('revealed'), 1400);
        return;
      }

      if (msg.type !== CHANNEL.DRAFT) return;
      // Updates are coalesced upstream to one animation frame, but delivery
      // order is not guaranteed. A sequence number older than what is already
      // rendered is dropped rather than applied.
      if (typeof msg.seq !== 'number' || msg.seq <= lastSeq.current) return;
      lastSeq.current = msg.seq;
      setState({ portfolio: msg.draft, lang: msg.lang || 'en' });
    }

    window.addEventListener('message', onMessage);

    // Announce until answered.
    //
    // A single announcement is not enough, and this was found in a browser
    // rather than reasoned about: React runs child effects BEFORE parent
    // effects, so the frame can announce itself before the Studio has attached
    // the listener that would hear it. Development remounts and any reload of
    // this document reopen the same race. A missed announcement is
    // unrecoverable — the frame would sit empty for the rest of the session,
    // which is the worst possible failure for the screen whose whole job is
    // showing the client their portfolio.
    //
    // So the frame keeps asking, and stops the moment a draft arrives.
    let tries = 0;
    const announce = () => {
      if (window.parent === window) return;      // opened directly, not framed
      window.parent.postMessage({ type: CHANNEL.READY }, window.location.origin);
    };
    announce();
    const timer = window.setInterval(() => {
      tries += 1;
      // Answered, or the Studio is not listening at all. Either way, stop:
      // an unbounded retry would outlive the screen.
      if (lastSeq.current >= 0 || tries > 20) {
        window.clearInterval(timer);
        return;
      }
      announce();
    }, 150);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  // Click → field name. No coordinates, no overlay, no editing affordance
  // inside the portfolio: the renderer labels its regions with data-field and
  // this host reads the label. That is what lets the Studio scroll its editor
  // to the right control without a second renderer.
  const onClick = useCallback((event) => {
    const el = event.target.closest('[data-field]');
    if (!el || window.parent === window) return;
    const field = el.dataset.field;
    if (field === 'portfolio') return;      // the root is not a target
    window.parent.postMessage(
      { type: CHANNEL.FIELD, field },
      window.location.origin,
    );
  }, []);

  return (
    <div
      className="preview-host"
      onClick={onClick}
      // The host is a passive surface; the interactive parts are inside.
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    >
      {state && (
        <PortfolioRenderer
          portfolio={state.portfolio}
          lang={state.lang}
          appearance={state.portfolio?.appearance}
        />
      )}
      <style jsx global>{`
        html, body, #__next { height: 100%; margin: 0; }
        body { background: var(--bg-primary); }

        /* The scrollbar is the single biggest tell that this is an embedded
           thing rather than the client's site. It is 8px of browser chrome
           sitting inside their portfolio, and it also narrows the viewport to
           1272px when the frame is 1280 — so the layout being previewed is not
           quite the layout a visitor gets. Hidden, not disabled: the content
           still scrolls. */
        html {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        html::-webkit-scrollbar { width: 0; height: 0; display: none; }
      `}</style>
      <style jsx>{`
        .preview-host { min-height: 100%; }
        /* The whole portfolio is clickable in preview. The affordance is
           deliberately quiet — this is the client's site, not a form. */
        .preview-host :global([data-field]:not([data-field='portfolio'])) {
          cursor: pointer;
          border-radius: var(--radius-md);
          transition: box-shadow var(--t-ui) var(--ease);
        }
        .preview-host :global([data-field]:not([data-field='portfolio']):hover) {
          box-shadow: 0 0 0 2px var(--brand-line);
        }
        .preview-host :global(.revealed) {
          animation: reveal 1.4s var(--ease) both;
        }
        @keyframes reveal {
          0%   { box-shadow: 0 0 0 0 var(--brand-focus); }
          20%  { box-shadow: 0 0 0 3px var(--brand-focus); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .preview-host :global(.revealed) { animation: none; }
        }
      `}</style>
    </div>
  );
}
