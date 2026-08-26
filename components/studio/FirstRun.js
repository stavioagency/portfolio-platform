// The three-step first run — blueprint §5.4, "the most important screen in the
// product."
//
// NOT A DASHBOARD AND NOT A CHECKLIST OF THE PROFILE. One question, three
// steps, nothing else on the page. There is deliberately no completion
// percentage: a percentage turns a portfolio into a form to finish, which is
// the exact feeling this product exists to remove (StudioHome's own header
// says the same thing about its queue).
//
// The order is name -> photo -> first piece and it is not arbitrary. An
// unnamed portfolio does not render at all, so the one field with a structural
// consequence is the one asked for first.
//
// All three steps are visible at once, and the next one is merely marked. The
// blueprint shows three steps, not a wizard: a client who already has a photo
// ready should be able to go straight to it.
import { firstRunSteps } from '../../lib/studio/first-draft';
import { studioStrings } from '../../lib/studio/strings';

// The photo step has nowhere to go yet. YouPanel refuses a photo control on
// purpose -- "a dead control teaches a client that the product is unfinished,
// and invites a click that cannot be answered" -- and it is right, so the fix
// belongs here rather than there. The step stays visible, because the blueprint
// specifies three and a client should see the shape of what is ahead, but it is
// not a button and it says what it is. Design law 4: absence is worded.
const NOT_ACTIONABLE = new Set(['photo']);

export default function FirstRun({ draft, lang = 'en', onStep }) {
  const s = studioStrings(lang);
  const { steps, next } = firstRunSteps(draft);

  const COPY = {
    name: { label: s.stepName, why: s.stepNameWhy },
    photo: { label: s.stepPhoto, why: s.stepPhotoWhy },
    piece: { label: s.stepPiece, why: s.stepPieceWhy },
  };

  return (
    <section className="fr" aria-labelledby="fr-lead">
      <h2 id="fr-lead" className="lead">{s.firstRunLead}</h2>
      <p className="sub">{s.firstRunSub}</p>

      <ol className="steps">
        {steps.map((step, i) => {
          const ready = !NOT_ACTIONABLE.has(step.id) || step.done;
          const body = (
            <>
              {/* The marker is a state, not a decoration: it says done or it
                  says which number this is. */}
              <span className="mark" aria-hidden="true">
                {step.done ? '✓' : i + 1}
              </span>
              <span className="txt">
                <span className="label">{COPY[step.id].label}</span>
                <span className="why">{ready ? COPY[step.id].why : s.stepNotReady}</span>
              </span>
              {step.done && <span className="state">{s.stepDone}</span>}
            </>
          );
          return (
            <li
              key={step.id}
              className={[step.done ? 'done' : '', step.id === next ? 'next' : '', ready ? '' : 'waiting']
                .filter(Boolean).join(' ')}
            >
              {ready
                ? <button type="button" onClick={() => onStep && onStep(step.id)}>{body}</button>
                : <div className="row">{body}</div>}
            </li>
          );
        })}
      </ol>

      <style jsx>{`
        .fr { margin-block-start: var(--space-6); max-inline-size: var(--measure); }

        /* The one lead on this screen (§6.2). It is the only --text-3xl here
           and there is no competing heading. */
        .lead {
          margin: 0;
          font-size: var(--text-3xl);
          font-weight: 800;
          line-height: var(--leading-tight);
          letter-spacing: var(--track-tight);
          color: var(--text-primary);
        }
        /* Arabic is cursive: tracking severs the joins, and the display face
           carries the presence instead (§3.6 rule 1). */
        :global([dir='rtl']) .lead { letter-spacing: 0; font-family: var(--font-display-ar); }

        .sub {
          margin: var(--space-3) 0 0;
          font-size: var(--text-lg);
          line-height: var(--leading-normal);
          color: var(--text-secondary);
        }
        :global([dir='rtl']) .sub { line-height: var(--leading-arabic); }

        .steps {
          list-style: none;
          margin: var(--space-6) 0 0;
          padding: 0;
          display: grid;
          gap: var(--space-2);
        }

        .steps button,
        .steps .row {
          inline-size: 100%;
          display: flex;
          align-items: flex-start;
          gap: var(--space-4);
          padding: var(--space-4);
          /* One panel treatment (§6.1): surface and a hairline, never a fill
             AND a shadow AND a border all doing the same job. */
          background: var(--surface-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          text-align: start;
          font: inherit;
          color: inherit;
          /* 44px minimum target, and these are the primary controls here. */
          min-block-size: 44px;
          transition: border-color var(--t-ui) var(--ease), background var(--t-ui) var(--ease);
        }
        .steps button { cursor: pointer; }
        @media (hover: hover) {
          .steps button:hover { border-color: var(--border-strong); background: var(--surface-hover); }
        }
        /* A step that cannot be acted on yet recedes rather than looking
           broken, and offers no affordance at all. */
        .waiting .label { color: var(--text-secondary); }
        .waiting .mark { color: var(--text-muted); border-color: var(--border-default); }
        .steps button:active { transition-duration: var(--t-press); }
        .steps button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        .mark {
          flex-shrink: 0;
          inline-size: 26px;
          block-size: 26px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          border: 1px solid var(--border-strong);
          font-size: var(--text-sm);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--text-secondary);
        }
        .done .mark {
          border-color: transparent;
          background: var(--success-bg);
          color: var(--success-ink);
        }
        /* The step they are on is the only one carrying the brand. Blue means
           "act here" and nothing else (§2.3). */
        .next .mark { border-color: var(--accent); color: var(--accent); }

        .txt { display: grid; gap: 2px; min-inline-size: 0; }
        .label { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); }
        .why { font-size: var(--text-md); color: var(--text-tertiary); line-height: var(--leading-normal); }
        :global([dir='rtl']) .why { line-height: var(--leading-arabic); }

        /* A finished step steps back rather than being crossed out: nothing
           here should imply the client failed at anything. */
        .done .label { color: var(--text-secondary); }
        .state {
          margin-inline-start: auto;
          align-self: center;
          flex-shrink: 0;
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--success-ink);
        }

        @media (max-width: 720px) {
          .lead { font-size: var(--text-2xl); }
          .sub { font-size: var(--text-md); }
        }
      `}</style>
    </section>
  );
}
