// PortfolioRenderer — the single renderer for a client's portfolio.
//
// ONE RENDERER, TWO INPUTS (blueprint §8.2, §8.5):
//
//     published data  →  PortfolioRenderer  →  the public site      (not yet)
//     draft data      →  PortfolioRenderer  →  the Studio preview   (today)
//
// Whoever supplies the data decides what it means. This component does not.
//
// ── Status, so nobody mistakes the destination for the present ────────────
// This is the INTENDED FUTURE public renderer. The public site still runs its
// own implementation in pages/index.js, which is a different product: a
// ticker, a banner slider, stats, CTA buttons, modals, a different data shape.
// The two were deliberately NOT merged — merging now would either change the
// customer's live site or make the Studio preview show today's design instead
// of the one being built.
//
//     "One renderer means one final shipped renderer, not premature
//      extraction of a legacy implementation."  — blueprint §8.2a
//
// The migration is a change of CALLER, not a rewrite, and it stays that way
// only while the contract below holds. tests/portfolio-renderer-contract.test.mjs
// enforces it.
//
// ── The contract ─────────────────────────────────────────────────────────
// It is a PURE rendering layer. Given the same props it produces the same
// output, in any host, with no ambient knowledge.
//
// It receives:   portfolio content · language and direction · appearance
// It renders:    the portfolio
//
// It must NOT, ever:
//   * fetch data, or touch Supabase, or read a URL
//   * know that the Studio exists
//   * know anything about publishing, drafts or snapshots
//   * know anything about authentication, tenants or entitlement
//   * decide whether what it is rendering is live
//
// A prop named `isDraft`, `isPreview` or `tenantId` appearing here is the
// signal that the boundary has been breached. If the preview needs to look
// different from the public page, that difference belongs to the host, not
// here — otherwise the preview stops being proof of what visitors will see,
// which is the entire reason this component is shared.
//
// ── data-field ───────────────────────────────────────────────────────────
// Regions carry a `data-field` attribute naming what they are. That is
// semantic annotation, not Studio knowledge: the renderer labels its parts and
// has no opinion about who reads the labels. The public site ignores them
// entirely; the Studio preview host uses them to map a click to an editor
// field without an overlay or a coordinate. Nothing here listens for clicks.

import { useEffect, useRef } from 'react';
// Bilingual fields are { ar, en } (blueprint §9). The shared reader already
// falls back rather than rendering a hole — a visitor must never meet an empty
// heading because one translation is outstanding — and tolerates the legacy
// plain-string values. Do not reimplement it here.
import { pick } from '../../lib/i18n';
// Input is stored raw and sanitised on the way out, as everywhere else in the
// product — a tenant-entered destination is attacker-controllable.
import { safeUrl } from '../../lib/safe-url';

const DENSITY = {
  tight: { pad: 'var(--space-6)', gap: 'var(--space-3)' },
  roomy: { pad: 'var(--space-10)', gap: 'var(--space-4)' },
};

// Appearance arrives as NAMES, not values — 'royal', not '#2A6BCE'. The client
// picks from a short list and the rendering of each name is ours, so a
// portfolio cannot drift away from the contrast guarantees by carrying a raw
// colour. An unknown name falls back rather than rendering something broken.
const ACCENT = {
  royal: '#598CD9',
  ink: '#8A90A8',
  sand: '#C8A87A',
  olive: '#8FA57A',
};
const HEADING_FONT = {
  manrope: "'Manrope', system-ui, sans-serif",
  reem: "'Reem Kufi', 'IBM Plex Sans Arabic', system-ui, sans-serif",
};

// THE NEXT STEP — the label is ours, not the client's.
//
// The client supplies a destination and nothing else (docs/design/next-step.md).
// Asking a photographer to write button copy is asking them to do a job they
// did not come here for, and the failure mode is loud: "CLICK HERE!!" on a page
// sold as premium.
//
// The Arabic is nominal on purpose. «تواصل معي» is an imperative addressed to
// the visitor, and Arabic imperatives carry gender — so it would be wrong for
// half of everyone who opens the page. The neutral-voice rule (design.md 11)
// was written for the Studio addressing the client; it applies just as much to
// the portfolio addressing a visitor.
const NEXT_STEP_LABEL = { en: 'Get in touch', ar: 'للتواصل' };

// One destination, two shapes: an email becomes a mailto link, a URL is used as
// given. The client types where to reach them; telling the difference is the
// product's job.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function actionHref(destination) {
  const raw = String(destination == null ? '' : destination).trim();
  if (!raw) return '';
  return safeUrl(EMAIL.test(raw) ? `mailto:${raw}` : raw);
}

export default function PortfolioRenderer({
  portfolio,
  lang = 'en',
  dir,
  appearance,
}) {
  // Entrances play on FIRST PAINT ONLY (design.md motion rules). The Studio
  // pushes a draft update on every keystroke; re-running entrances on each one
  // would make the page twitch while the client types, which is precisely the
  // decorative motion the brand forbids. A ref, not state — this must never
  // itself cause a render.
  const painted = useRef(false);
  useEffect(() => { painted.current = true; }, []);
  const entering = !painted.current;

  const data = portfolio || {};
  const look = appearance || data.appearance || {};
  const direction = dir || (lang === 'ar' ? 'rtl' : 'ltr');
  const pieces = data.pieces || [];
  const links = (data.links || []).filter((l) => (l.url || '').trim());
  // Sections come from content, never toggles: no destination simply means the
  // portfolio has no next step, which is a complete portfolio.
  const nextStep = actionHref(data.action && data.action.destination);
  const density = DENSITY[look.density] || DENSITY.roomy;

  // The client's accent overrides the app's only for this subtree. Everything
  // else comes from the design system, so a portfolio cannot drift away from
  // the type scale, spacing rhythm or contrast guarantees.
  const scope = {
    '--pf-accent': ACCENT[look.accent] || 'var(--brand)',
    '--pf-heading': HEADING_FONT[look.font] || 'var(--font-heading)',
    '--pf-pad': density.pad,
    '--pf-gap': density.gap,
  };

  const enter = (i) => ({
    className: entering ? 'enter' : undefined,
    style: entering ? { animationDelay: `calc(var(--t-stag) * ${i})` } : undefined,
  });

  return (
    <article
      className="portfolio"
      dir={direction}
      lang={lang}
      style={scope}
      data-field="portfolio"
    >
      {/* IDENTITY — introduces the work, never replaces it. Name and one
          line, and nothing else above the work. */}
      <header className="identity">
        <h1 {...enter(0)} data-field="name">{pick(data.name, lang)}</h1>
        {pick(data.title, lang) && (
          <p className="role" {...enter(1)} data-field="title">
            {pick(data.title, lang)}
          </p>
        )}
      </header>

      {/* THE WORK — first, largest, and the reason the page exists. */}
      {pieces.length > 0 && (
        <section className="work" {...enter(2)} data-field="pieces">
          {pieces.map((piece) => (
            <figure key={piece.id} className="piece" data-field={`piece:${piece.id}`}>
              {/* THE WORK KEEPS ITS NATURAL RATIO.
                  A real cover renders as an <img> at its own proportions —
                  nothing is cropped to a house shape. A piece with no image
                  yet falls back to its declared ratio so the layout can still
                  be reasoned about. */}
              {piece.cover ? (
                <img
                  className="cover"
                  src={piece.cover}
                  alt={pick(piece.name, lang) || ''}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div
                  className="cover"
                  style={{
                    aspectRatio: piece.ratio || 3 / 2,
                    // Width-driven, never height-driven. Setting an explicit
                    // height here and letting max-width clamp it SQUASHES the
                    // box — the ratio silently changes, which is worse than a
                    // crop because it distorts rather than trims. Deriving the
                    // width instead means aspect-ratio always decides the
                    // height, and the band is respected because the width can
                    // never exceed band × ratio.
                    width: `min(100%, calc(var(--band-piece) * ${piece.ratio || 3 / 2}))`,
                    background: piece.tone || 'var(--bg-elevated)',
                  }}
                  role="img"
                  aria-label={pick(piece.name, lang) || undefined}
                />
              )}
              {/* An unnamed piece renders NO caption. This is the visitor's
                  view: Studio state such as "Unnamed" must never leak into it. */}
              {pick(piece.name, lang) && (
                <figcaption>{pick(piece.name, lang)}</figcaption>
              )}
            </figure>
          ))}
        </section>
      )}

      {/* INTRODUCTION — after the work. A stranger judges a creative by their
          work and only then becomes curious about the person; words placed
          first ask to be read by someone who has not decided to care yet.
          Sequenced, never hidden. */}
      {pick(data.bio, lang) && (
        <section className="intro" {...enter(3)}>
          <p data-field="bio">{pick(data.bio, lang)}</p>
          {/* THE SHORT LINE — a footnote to the introduction, and NESTED
              inside it on purpose. It can never render without the paragraph
              it annotates: a claim standing on its own is the register this
              field exists to avoid, and the nesting makes that structural
              rather than a rule someone has to remember. */}
          {pick(data.shortLine, lang) && (
            <p className="shortLine" data-field="shortLine">
              {pick(data.shortLine, lang)}
            </p>
          )}
        </section>
      )}

      {/* THE NEXT STEP — after the work and after the context, never above the
          work (hierarchy §3b). The portfolio earns the visitor's intent before
          it asks for anything. */}
      {nextStep && (
        <div className="nextStep" {...enter(4)} data-field="action">
          <a href={nextStep}>{NEXT_STEP_LABEL[lang] || NEXT_STEP_LABEL.en}</a>
        </div>
      )}

      {links.length > 0 && (
        <nav className="links" {...enter(5)} data-field="links">
          {links.map((link) => (
            <span key={link.id} className="link">{link.label}</span>
          ))}
        </nav>
      )}

      <style jsx>{`
        .portfolio {
          padding: var(--pf-pad) calc(var(--pf-pad) * 1.1);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: var(--font-body);
          min-height: 100%;
        }
        /* IDENTITY SIZING — the constraint, not a style preference.
           Attention is spent in two currencies: AREA belongs to the work,
           TYPOGRAPHIC WEIGHT belongs to the name. They do not compete, which
           is why the name can be the heaviest text on the page and still be
           small. Set as a headline it would compete with the work; set as a
           label it introduces it.
           The identity block must never be taller than the first row of work
           — that is the checkable form of "identity introduces the work, it
           does not replace it", and it is what keeps a real piece above the
           fold on a 375px phone. */
        .identity { margin-bottom: var(--space-5); }
        h1 {
          font-family: var(--pf-heading);
          font-size: clamp(22px, 2.1vw, 30px);
          line-height: 1.12;
          letter-spacing: -0.02em;
          margin: 0 0 4px;
          font-weight: 800;
        }
        /* Arabic takes no negative tracking — it breaks letter joining. */
        .portfolio[dir='rtl'] h1 { letter-spacing: 0; }
        .role {
          margin: 0;
          color: var(--text-secondary);
          font-size: 15px;
        }

        /* THE WORK
           ─────────────────────────────────────────────────────────────────
           The rule: **the work keeps its natural ratio. Hierarchy comes from
           position and scale, not cropping.**

           Nothing is cropped and nothing is packed by an algorithm. Each piece
           is drawn at its own proportions inside a HEIGHT BAND, so:

             * a piece taller than it is wide renders NARROWER, never taller —
               a 9:16 phone screenshot ends up phone-sized, which is what it
               should look like
             * a piece wider than the band allows is limited by the column
               instead, and its height drops
             * within a row every piece lands on the same height, so rows stay
               even while WIDTHS express the shape of the work

           That evenness falls out of the constraints. There is no packing
           pass, no measurement, and no reordering — the client's sequence is
           rendered exactly as they curated it.

           The first piece gets a taller band: it is larger because it is
           first, which is emphasis by scale and position rather than by
           re-cutting the image. The band is deliberately moderate — a lead
           that consumes the whole screen turns a portfolio into a landing
           page. */
        .work {
          /* The band is expressed in vw, not vh.
             Height units were the first attempt and they are wrong twice over:
             a band that tracks viewport HEIGHT decides how much horizontal room
             a piece takes, which is a non sequitur — and inside the Studio's
             preview frame vh resolves against the FRAME, so the same portfolio
             rendered smaller in the preview than a visitor would ever see it.
             Width is what the layout is actually competing for, so width is
             what the band is measured in.
             The value is tuned so an ordinary landscape ratio FILLS its column
             — anything from about 3:2 up — while a tall piece hits the band
             first and renders narrower instead. */
          /* Tuned so the band is roughly the column width divided by 1.8:
             anything up to a 16:9 frame is limited by HEIGHT, which is what
             keeps every piece in a row landing on the same height. Only a
             wider-than-16:9 panorama is limited by the column instead. */
          --band: clamp(170px, 24vw, 340px);
          /* Slightly more room for the first piece on a wide screen — enough
             to read as first, not enough to read as a hero. */
          --band-lead: clamp(210px, 32vw, 430px);
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--pf-gap);
          /* Pieces sit at the top of their row and at the reading edge, so a
             narrow piece reads as deliberate rather than as a gap. Mirrors in
             RTL without a second rule. */
          align-items: start;
          justify-items: start;
        }
        /* The figure fills its column so that the cover's max-width has a
           real column to measure against. Without this the figure shrink-wraps
           the image, max-width resolves against that shrunken box, and a wide
           piece overflows into the next column — measured at 122% of its
           column before this line existed. */
        .piece {
          margin: 0;
          width: 100%;
          min-width: 0;
          --band-piece: var(--band);
        }
        /* Larger because it is first. */
        .piece:first-child { grid-column: 1 / -1; }

        .cover {
          display: block;
          max-width: 100%;
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
        }
        /* A real image carries its own proportions, so it is BOUNDED rather
           than sized: only maximums are set, so it shrinks to fit whichever
           constraint binds first and can never distort. */
        img.cover {
          max-height: var(--band-piece);
          width: auto;
          height: auto;
        }
        /* THE FIRST PIECE RECEIVES PRIORITY THROUGH POSITION AND RHYTHM, NOT
           FORCED SIZE. NATURAL PROPORTIONS ALWAYS WIN OVER EMPHASIS.

           On a wide screen it is allowed a little more room — the one
           difference between the lead and the rest is how much space it may
           occupy, never how it is cut. It also gets a beat of extra separation
           before the rest of the work begins, which is rhythm rather than
           scale and costs the image nothing. */
        .piece:first-child {
          --band-piece: var(--band-lead);
          margin-block-end: var(--space-3);
        }
        figcaption {
          margin-top: var(--space-2);
          font-size: 13px;
          color: var(--text-tertiary);
        }

        /* INTRODUCTION — after the work, in full. */
        .intro { margin-top: var(--space-8); }
        .intro p {
          margin: 0;
          max-width: 46ch;
          font-size: 17px;
          color: var(--text-secondary);
        }
        /* Quieter than the bio it annotates. If it ever reads louder than the
           paragraph above it, the hierarchy has inverted. */
        .intro .shortLine {
          margin-top: var(--space-3);
          font-size: 14px;
          color: var(--text-tertiary);
        }
        .nextStep { margin-top: var(--space-6); }
        .nextStep a {
          display: inline-block;
          font-size: 15px;
          font-weight: 600;
          color: var(--pf-accent);
          text-decoration: none;
          border: 1px solid currentColor;
          border-radius: var(--radius-sm);
          padding: 10px 18px;
          transition: background var(--t-ui) var(--ease);
        }
        .nextStep a:hover { background: var(--bg-secondary); }
        .links {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-4);
          margin-top: var(--space-5);
        }
        .link { font-size: 14px; color: var(--pf-accent); }
        .enter {
          animation: pf-enter var(--t-enter) var(--ease) both;
        }
        @keyframes pf-enter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .enter { animation: none; }
        }
        @media (max-width: 720px) {
          .intro p { font-size: 15px; }
        }
        @media (max-width: 520px) {
          /* One column on a phone. Two-up at this width is two thumbnails,
             which is the gallery wall the presentation rule forbids. The
             bands narrow so a lead piece still leaves the next one hinted at
             below it, rather than filling the screen on its own. */
          .work {
            grid-template-columns: 1fr;
            /* One column, so the band is a large fraction of the screen width
               — a landscape piece fills it and a tall piece still leaves the
               next one hinted at below.

               THE LEAD GETS NO EXTRA SIZE HERE. In a single column every piece
               is already full width, so a larger band could only ever be paid
               for by cropping or distortion. On a phone the first piece is
               first because it is first: it is the only work visible without
               scrolling, and the extra beat below it does the rest. Giving it
               a taller band was hero treatment under another name. */
            --band: clamp(150px, 48vw, 260px);
            --band-lead: var(--band);
          }
        }
      `}</style>
    </article>
  );
}
