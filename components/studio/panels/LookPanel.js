// Look — accent, display font, spacing.
//
// This is where "not a website builder" is honoured or lost. Every option is
// one we would defend in an agency presentation: short closed lists, named
// choices rather than values, and nothing that lets a client produce a bad
// portfolio.
//
// THE PANEL OPENS ON THE CONTROLS, NEVER ON THE DIRECTIONS.
//
// Choosing a direction is a creative RESET, not a normal edit. Putting three
// whole-portfolio alternatives in front of someone who came to adjust one
// colour invites them to second-guess a decision they already made well — and
// a reset offered casually stops reading as a reset. So it is a deliberate
// step, taken only when asked for.

import { useState } from 'react';
import FocusPanel from '../FocusPanel';
import { studioStrings } from '../../../lib/studio/strings';
import { LOOK_CONTROLS, LOOK_MODES, defaultLookMode } from '../../../lib/studio/editor';

// Human names for each option. The client never sees 'royal' or a hex value.
const OPTION_LABEL = {
  en: {
    royal: 'Royal', ink: 'Ink', sand: 'Sand', olive: 'Olive',
    manrope: 'Modern', reem: 'Kufic',
    roomy: 'Roomy', tight: 'Close',
  },
  ar: {
    royal: 'أزرق', ink: 'رمادي', sand: 'رملي', olive: 'زيتي',
    manrope: 'حديث', reem: 'كوفي',
    roomy: 'واسع', tight: 'متقارب',
  },
};

const GROUPS = [
  ['accent', 'lookAccent'],
  ['font', 'lookFont'],
  ['density', 'lookDensity'],
];

export default function LookPanel({
  draft,
  lang,
  directions = [],
  onClose,
  onLook,
  onApplyDirection,
}) {
  const s = studioStrings(lang);
  const [mode, setMode] = useState(defaultLookMode());
  const labels = OPTION_LABEL[lang] || OPTION_LABEL.en;
  const look = draft.appearance || {};

  if (mode === LOOK_MODES.DIRECTIONS) {
    return (
      <FocusPanel
        title={s.changeDirection}
        onClose={onClose}
        footer={
          <button type="button" className="back" onClick={() => setMode(LOOK_MODES.CONTROLS)}>
            ← {s.backToLook}
          </button>
        }
      >
        {/* Said plainly, because it is the client's fear: a reset that eats
            their writing. It does not — applyDirection reads appearance only. */}
        <p className="intro">{s.directionsIntro}</p>
        <div className="dirs">
          {directions.map((d) => (
            <button
              key={d.id}
              type="button"
              className="dir"
              onClick={() => { onApplyDirection(d); setMode(LOOK_MODES.CONTROLS); }}
            >
              <span className="name">{d.label[lang] || d.label.en}</span>
              <span className="why">{d.why[lang] || d.why.en}</span>
            </button>
          ))}
        </div>

        <style jsx>{`
          .intro { margin: 0; font-size: 13px; color: var(--text-secondary); }
          .dirs { display: grid; gap: var(--space-2); }
          .dir {
            font: inherit;
            cursor: pointer;
            text-align: start;
            display: grid;
            gap: 2px;
            padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-sm);
            background: var(--bg-primary);
            border: 1px solid var(--border);
            transition: border-color var(--t-ui) var(--ease);
          }
          .dir:hover { border-color: var(--brand-line); }
          .name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
          .why { font-size: 12.5px; color: var(--text-tertiary); }
          .back {
            font: inherit;
            cursor: pointer;
            border: 0;
            background: none;
            color: var(--text-secondary);
            font-size: 13px;
            padding: 0;
          }
        `}</style>
      </FocusPanel>
    );
  }

  return (
    <FocusPanel title={s.panelLook} onClose={onClose} footer={<span>✓ {s.saved}</span>}>
      {GROUPS.map(([key, labelKey]) => (
        <div key={key} className="group">
          <span className="lbl">{s[labelKey]}</span>
          <div className="opts" role="group">
            {LOOK_CONTROLS[key].map((option) => (
              <button
                key={option}
                type="button"
                className={look[key] === option ? 'opt on' : 'opt'}
                aria-pressed={look[key] === option}
                onClick={() => onLook(key, option)}
              >
                {labels[option] || option}
              </button>
            ))}
          </div>
        </div>
      ))}

      {directions.length > 0 && (
        <button type="button" className="reset" onClick={() => setMode(LOOK_MODES.DIRECTIONS)}>
          {s.changeDirection}
        </button>
      )}

      <style jsx>{`
        .group { display: grid; gap: 6px; }
        .lbl { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
        .opts { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .opt {
          font: inherit;
          cursor: pointer;
          font-size: 13px;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          background: var(--bg-primary);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          transition: border-color var(--t-ui) var(--ease), color var(--t-ui) var(--ease);
        }
        .opt:hover { color: var(--text-primary); }
        .opt.on {
          border-color: var(--brand-line);
          background: var(--brand-soft);
          color: var(--text-primary);
          font-weight: 600;
        }
        /* Quiet and last. A reset should never compete with the controls it
           sits beneath. */
        .reset {
          font: inherit;
          cursor: pointer;
          justify-self: start;
          border: 0;
          background: none;
          padding: 0;
          font-size: 13px;
          color: var(--text-tertiary);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .reset:hover { color: var(--text-primary); }
      `}</style>
    </FocusPanel>
  );
}
