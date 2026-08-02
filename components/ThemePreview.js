// ThemePreview — a miniature of the real portfolio card, painted with a theme
// preset's own tokens.
//
// WHY: the Appearance editor used to offer each preset as a 42px swatch showing
// the letters "Aa" plus a name. That tells a client what the background colour
// is, and nothing about what their website will LOOK like — they had to pick one
// blind, save, and read the live preview to find out. This draws the actual card
// layout at ~1/6
// scale, so the choice is visible before it is made. It draws the blocks that
// actually carry the palette — avatar, name, banner, and the primary/secondary
// CTA pair — rather than every element of the card; at this size more blocks
// read as noise, not as detail.
//
// It is deliberately pure CSS driven by the SAME `tokens` object the public site
// consumes, not a screenshot and not a second copy of the design:
//   - nothing is stored, so there is no image to regenerate when the card
//     changes and no per-tenant rows to keep in sync;
//   - a new preset added to THEME_PRESETS gets a correct preview for free.
//
// It is decorative — the preset's real name is rendered next to it by the
// caller — so the whole block is aria-hidden.

export default function ThemePreview({ tokens }) {
  const t = tokens || {};
  const bg = t.bg || '#0a0a0c';
  const surface = t.surface || '#131318';
  const accent = t.accent || '#9FA7FF';
  const text = t.text || '#ffffff';
  const muted = t.text_muted || 'rgba(255,255,255,0.45)';
  const border = t.border || 'rgba(255,255,255,0.06)';

  return (
    <div className="tp" style={{ background: bg }} aria-hidden="true">
      <div className="tp-card" style={{ background: surface, borderColor: border }}>
        <div className="tp-head">
          <span className="tp-avatar" style={{ background: accent }} />
          <span className="tp-lines">
            <span className="tp-line" style={{ background: text }} />
            <span className="tp-line short" style={{ background: muted }} />
          </span>
        </div>
        <span className="tp-banner" style={{ background: accent }} />
        <span className="tp-cta primary" style={{ background: accent }} />
        <span className="tp-cta ghost" style={{ background: bg, borderColor: border }} />
      </div>
      <style jsx>{`
        .tp {
          /* 3:2, matching the proportions of the card it depicts */
          aspect-ratio: 3 / 2;
          width: 100%;
          padding: 7px;
          display: flex;
          overflow: hidden;
        }
        .tp-card {
          flex: 1;
          min-width: 0;
          border: 1px solid;
          /* Fixed roundness: this thumbnail communicates the COLOUR theme, and
             corner style is an independent control further down the editor.
             Wiring the two together made the swatches shift when you changed a
             setting they are not about. */
          border-radius: 6px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tp-head { display: flex; align-items: center; gap: 4px; }
        .tp-avatar { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
        .tp-lines { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .tp-line { display: block; height: 3px; border-radius: 2px; width: 72%; }
        .tp-line.short { width: 44%; opacity: 0.85; }
        .tp-banner { display: block; flex: 1; min-height: 12px; border-radius: 4px; opacity: 0.9; }
        .tp-cta { display: block; height: 6px; border-radius: 3px; }
        .tp-cta.ghost { border: 1px solid; }
      `}</style>
    </div>
  );
}
