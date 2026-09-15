/* The quick facts: rating, client count, and working hours.
 *
 * Ported from /admin's QuickFacts as part of closing the parity gap that stops
 * the Studio replacing the legacy editor. Nine profile columns were editable in
 * /admin and nowhere else; these four are the ones a visitor sees on the card,
 * so they are the ones a client notices missing first.
 *
 * ── EACH SLOT HAS ONE MEANING AND A CONTROL THAT CANNOT BE MISUSED ──────
 * The rating is CHOSEN from a list so it cannot become a sentence. The client
 * count is a number with no label field beside it, because a client who can
 * write the word can write a sentence, which is how the old strip ended up
 * three lines tall. Availability is DERIVED from working hours and is never
 * typed at all — a page that says "available" while the hours say otherwise is
 * two facts disagreeing in public.
 */
import { useCallback, useState } from 'react';
import { saveProfile } from '../../lib/studio-data';
import { isOpen } from '../../lib/working-hours';
import { useAutosave } from '../../lib/use-autosave';

/* 5.0 down to 3.0 in tenths. Nothing below three: a self-chosen rating that
   low is not a rating, it is a mistake nobody wants published. */
const RATING_CHOICES = Array.from({ length: 21 }, (_, i) => Number((5 - i * 0.1).toFixed(1)));

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6];

export function Facts({ ar, tenant, profile, onSaved, canEdit = true }) {
  const [draft, setDraft] = useState(() => ({
    rating: profile?.rating ?? null,
    client_count: profile?.client_count ?? null,
    hours: profile?.hours || null,
  }));

  const saver = useAutosave(useCallback(async (d) => {
    // availability is written from the hours rather than from a control: it is
    // the same fact, and two writable copies of one fact drift.
    const availability = d.hours && d.hours.enabled !== false
      ? { open: isOpen(d.hours) }
      : null;
    await saveProfile(tenant.id, {
      rating: d.rating, client_count: d.client_count, hours: d.hours, availability,
    });
    onSaved({ ...profile, ...d, availability });
  }, [tenant, profile, onSaved]));

  const patch = (u) => {
    if (!canEdit) return;
    setDraft((prev) => { const next = { ...prev, ...u }; saver.schedule(next); return next; });
  };

  const hours = draft.hours;
  const days = Array.isArray(hours?.days) ? hours.days : [];
  const enabled = !!hours && hours.enabled !== false;

  const setHours = (u) => patch({
    hours: { enabled: true, days: [], from: '09:00', to: '17:00', ...(hours || {}), ...u },
  });
  const toggleDay = (d) => setHours({
    days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b),
  });

  const dayLabels = ar
    ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <section className="facts">
      <h2>{ar ? 'الحقائق السريعة' : 'Quick facts'}</h2>
      <p className="hint">
        {ar
          ? 'تظهر في الشريط أعلى صفحتك. اتركها فارغة إن لم تكن مناسبة.'
          : 'These show in the strip on your page. Leave any of them empty if it does not fit.'}
      </p>

      <label className="field">
        <span>{ar ? 'التقييم' : 'Rating'}</span>
        <select
          value={draft.rating ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ rating: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">{ar ? 'بدون' : 'None'}</option>
          {RATING_CHOICES.map((v) => <option key={v} value={v}>{`★ ${v.toFixed(1)}`}</option>)}
        </select>
      </label>

      <label className="field">
        <span>{ar ? 'عدد العملاء' : 'Clients'}</span>
        <input
          type="number" min="0" max="999999" step="1" inputMode="numeric"
          value={draft.client_count ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ client_count: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </label>

      <div className="field">
        <label className="check">
          <input
            type="checkbox" checked={enabled} disabled={!canEdit}
            onChange={(e) => (e.target.checked ? setHours({ enabled: true }) : patch({ hours: null }))}
          />
          <span>{ar ? 'عرض ساعات العمل' : 'Show working hours'}</span>
        </label>

        {enabled && (
          <>
            <div className="days">
              {DAY_KEYS.map((d) => (
                <button
                  key={d} type="button" disabled={!canEdit}
                  className={days.includes(d) ? 'day on' : 'day'}
                  aria-pressed={days.includes(d)}
                  onClick={() => toggleDay(d)}
                >
                  {dayLabels[d]}
                </button>
              ))}
            </div>
            <div className="range">
              <input type="time" value={hours?.from || '09:00'} disabled={!canEdit}
                     aria-label={ar ? 'من' : 'From'}
                     onChange={(e) => setHours({ from: e.target.value })} />
              <span aria-hidden="true">–</span>
              <input type="time" value={hours?.to || '17:00'} disabled={!canEdit}
                     aria-label={ar ? 'إلى' : 'To'}
                     onChange={(e) => setHours({ to: e.target.value })} />
            </div>
            <p className="hint">
              {isOpen(hours)
                ? (ar ? 'صفحتك تعرض «متاح الآن».' : 'Your page is showing “available now”.')
                : (ar ? 'صفحتك تعرض «خارج ساعات العمل».' : 'Your page is showing “outside working hours”.')}
            </p>
          </>
        )}
      </div>

      <style jsx>{`
        .facts { display: flex; flex-direction: column; gap: var(--space-3); }
        h2 { margin: 0; font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
        .hint { margin: 0; color: var(--text-tertiary); font-size: var(--text-xs); line-height: 1.6; }
        .field { display: flex; flex-direction: column; gap: 6px; color: var(--text-primary); }
        .field > span { font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        select, input[type='number'], input[type='time'] {
          min-block-size: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--border-default); border-radius: var(--radius-sm);
          background: var(--surface-input); color: var(--text-primary);
          font: inherit; font-size: var(--field-text-compact);
        }
        select:focus-visible, input:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .check { display: flex; align-items: center; gap: 8px; font-size: var(--text-sm); color: var(--text-primary); }
        .days { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .day { min-block-size: var(--tap-min); padding: 0 var(--space-3);
               border: 1px solid var(--border-default); border-radius: var(--radius-sm);
               background: var(--surface-card); color: var(--text-secondary);
               font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer; }
        .day.on { background: var(--surface-hover); color: var(--text-primary); border-color: var(--border-strong); }
        .day:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .range { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
      `}</style>
    </section>
  );
}

export default Facts;
