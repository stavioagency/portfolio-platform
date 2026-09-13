// The Studio's Visitors screen.
//
// READ ONLY, and that is the whole design. Nothing here writes, and there is no
// operation to get wrong — it reads `analytics_events` through the same RLS
// that scopes every other read in the Studio, and counts. /admin has read this
// table since long before the Studio existed; the counting rules live in
// lib/studio-visitors.js so both screens can agree on what "a visit" is rather
// than each holding an opinion.
//
// WHAT IT DELIBERATELY DOES NOT DO: referrers, countries, devices, sessions,
// funnels. The table holds three event types and a visitor id. A dashboard that
// implies more than the data contains is worse than a small honest one, and the
// customer here is a designer checking whether anyone saw their work — not an
// analyst.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  RANGES, DEFAULT_RANGE, rangeStart, summariseVisits, visitsByDay, emptyReason,
} from '../../lib/studio-visitors';

export default function Visitors({ ar, tenant, published }) {
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [events, setEvents] = useState(null);   // null = not answered yet
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!tenant) return;
    setEvents(null);
    setError('');
    try {
      /* Scoped by tenant AND by RLS. The explicit eq() is not the security
         boundary — the policy is — but without it an owner, who is a member of
         every workspace, would read the whole platform's traffic into one
         customer's screen. */
      let q = supabase
        .from('analytics_events')
        .select('event_type, visitor_id, created_at')
        .eq('tenant_id', tenant.id);
      const from = rangeStart(range);
      if (from) q = q.gte('created_at', from);

      const { data, error: e } = await q.order('created_at', { ascending: false });
      if (e) throw e;
      setEvents(data || []);
    } catch (e) {
      setError(e?.message || String(e));
      setEvents([]);
    }
  }, [tenant, range]);

  useEffect(() => { load(); }, [load]);

  const loading = events === null;
  const stats = summariseVisits(events || []);
  const days = visitsByDay(events || [], range);
  const reason = loading ? null : emptyReason({ published, total: stats.visits });
  const peak = days.reduce((m, d) => Math.max(m, d.count), 0);

  const numbers = [
    { id: 'visits', n: stats.visits, label: ar ? 'زيارة' : 'Visits' },
    { id: 'visitors', n: stats.visitors, label: ar ? 'زائر' : 'Visitors' },
    { id: 'projects', n: stats.projectViews, label: ar ? 'فتح عمل' : 'Project views' },
    { id: 'links', n: stats.linkClicks, label: ar ? 'نقرة تواصل' : 'Contact clicks' },
  ];

  return (
    <section className="screen">
      <h1>{ar ? 'الزيارات' : 'Visitors'}</h1>
      <p className="lede">
        {ar
          ? 'ما يُقاس هنا هو صفحتك المنشورة وحدها. المسودّة والمعاينة لا تُحتسبان.'
          : 'This measures your published page only. Your draft and preview are never counted.'}
      </p>

      <div className="ranges" role="group" aria-label={ar ? 'المدة' : 'Period'}>
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={range === r.id ? 'range on' : 'range'}
            aria-pressed={range === r.id}
            onClick={() => setRange(r.id)}
          >
            {ar ? r.label.ar : r.label.en}
          </button>
        ))}
      </div>

      {error && (
        <p className="err">
          {ar ? 'تعذّرت قراءة الزيارات. لم يتغيّر شيء في معرضك.' : 'Could not read your visits. Nothing in your portfolio has changed.'}
        </p>
      )}

      {/* The grid keeps its geometry while loading. A text "Loading…" collapses
          four tiles to one line and bounces the page on every range change. */}
      <div className="nums">
        {numbers.map((n) => (
          <div className="tile" key={n.id}>
            <div className="n">{loading ? '—' : n.n.toLocaleString(ar ? 'ar-EG' : 'en-US')}</div>
            <div className="lbl">{n.label}</div>
          </div>
        ))}
      </div>

      {/* WHY THERE IS NOTHING, when there is nothing. Four zeros on a portfolio
          that was never published invites the customer to conclude their work is
          unpopular; the zeros are true and the reading is wrong. */}
      {reason === 'never-published' && (
        <p className="note">
          {ar
            ? 'معرضك لم يُنشر بعد، فلا أحد يستطيع زيارته. الأرقام تبدأ بعد النشر.'
            : 'Your portfolio has not been published yet, so nobody can visit it. These numbers start after you publish.'}
        </p>
      )}
      {reason === 'no-visits' && (
        <p className="note">
          {ar
            ? 'لا زيارات في هذه المدّة. مشاركة الرابط هي أسرع طريقة لأول زيارة.'
            : 'No visits in this period. Sharing your link is the quickest way to the first one.'}
        </p>
      )}

      {!loading && !reason && days.length > 0 && (
        <div className="chart" aria-hidden="true">
          {days.map((d) => (
            <div className="bar" key={d.day} title={`${d.day}: ${d.count}`}>
              {/* A day with no visits still draws a 2px floor, so the row reads
                  as a timeline rather than as missing data. */}
              <span style={{ height: peak ? `${Math.max(2, (d.count / peak) * 100)}%` : '2px' }} />
            </div>
          ))}
        </div>
      )}
      {!loading && !reason && days.length > 0 && (
        <p className="axis">
          {ar
            ? `الزيارات يوميًا — الأعلى ${peak.toLocaleString('ar-EG')} في يوم`
            : `Visits per day — peak ${peak.toLocaleString('en-US')} in a day`}
        </p>
      )}

      <style jsx>{`
        .screen { max-width: 720px; }
        h1 { margin: 0 0 6px; font-size: var(--text-xl); font-family: var(--font-heading); }
        .lede { margin: 0 0 var(--space-4); color: var(--text-secondary);
                font-size: var(--text-sm); line-height: 1.7; }

        .ranges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--space-4); }
        .range {
          min-height: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--action-secondary-border); border-radius: var(--radius-sm);
          background: var(--action-secondary-bg); color: var(--action-secondary-fg);
          font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer;
        }
        .range.on { background: var(--brand-soft); border-color: var(--brand-line); color: var(--text-primary); }
        .range:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        .err { margin: 0 0 var(--space-3); padding: var(--space-3);
               border-radius: var(--radius-sm); background: var(--danger-bg);
               color: var(--danger-ink); font-size: var(--text-sm); }

        .nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 8px; margin-bottom: var(--space-4); }
        .tile { padding: var(--space-3); border: 1px solid var(--border-default);
                border-radius: var(--radius-md); background: var(--surface-card); }
        .n { font-size: var(--text-2xl); font-weight: 700; font-family: var(--font-heading);
             line-height: 1.2; font-variant-numeric: tabular-nums; }
        .lbl { margin-top: 2px; font-size: var(--text-xs); color: var(--text-tertiary); }

        .note { margin: 0; padding: var(--space-3); border-radius: var(--radius-sm);
                background: var(--surface-hover); color: var(--text-secondary);
                font-size: var(--text-sm); line-height: 1.7; }

        .chart { display: flex; align-items: flex-end; gap: 2px; height: 96px;
                 padding: var(--space-3); border: 1px solid var(--border-default);
                 border-radius: var(--radius-md); background: var(--surface-card); }
        .bar { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
        .bar span { display: block; width: 100%; border-radius: 2px; background: var(--brand); }
        .axis { margin: 6px 0 0; font-size: var(--text-xs); color: var(--text-tertiary); }
      `}</style>
    </section>
  );
}
