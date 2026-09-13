// lib/studio-visitors.js
// -----------------------------------------------------------------------------
// What the Visitors screen counts, as pure functions.
//
// SPLIT FROM THE COMPONENT ON PURPOSE. The counting is the part worth testing
// and the part that can be quietly wrong — a unique-visitor count that double
// counts, or a day bucket that lands in the wrong day, is invisible in review
// and obvious to a customer comparing two numbers. None of this touches
// Supabase, so a test can reach all of it.
//
// THE EVENT SHAPE IS NOT OURS TO INVENT. /admin has read `analytics_events`
// since long before the Studio existed, and these are the same three event
// types and the same visitor_id it reads (pages/admin.js). Two definitions of
// "a visit" is how two screens end up disagreeing in front of the person who
// owns the number.

export const EVENT_PAGE_VIEW = 'page_view';
export const EVENT_PROJECT_VIEW = 'project_view';
export const EVENT_LINK_CLICK = 'link_click';

/* The ranges offered, shortest first. `days: null` means "everything", which is
   the only honest option for a portfolio published last week. */
export const RANGES = [
  { id: '24h', days: 1, label: { ar: '٢٤ ساعة', en: '24 hours' } },
  { id: '7d', days: 7, label: { ar: '٧ أيام', en: '7 days' } },
  { id: '30d', days: 30, label: { ar: '٣٠ يومًا', en: '30 days' } },
  { id: 'all', days: null, label: { ar: 'كل الوقت', en: 'All time' } },
];

export const DEFAULT_RANGE = '7d';

export function rangeById(id) {
  return RANGES.find((r) => r.id === id) || RANGES.find((r) => r.id === DEFAULT_RANGE);
}

/* The ISO timestamp a range starts at, for the database query.
   `all` returns null rather than epoch-zero: a `gte` on 1970 is a filter the
   database still has to apply, and "no lower bound" is what is meant. */
export function rangeStart(id, now = Date.now()) {
  const r = rangeById(id);
  if (r.days === null) return null;
  return new Date(now - r.days * 86400 * 1000).toISOString();
}

/* The four numbers on the screen.

   UNIQUE VISITORS COUNTS DISTINCT visitor_id AND DROPS EMPTY ONES. A missing
   visitor_id is not a visitor — treating null as an identity collapses every
   anonymous hit into one person, which understates the number rather than
   overstating it, and either way it is a number nobody can act on. */
export function summariseVisits(events) {
  const rows = Array.isArray(events) ? events : [];
  const pageViews = rows.filter((e) => e && e.event_type === EVENT_PAGE_VIEW);
  const unique = new Set(pageViews.map((e) => e.visitor_id).filter(Boolean));
  return {
    visits: pageViews.length,
    visitors: unique.size,
    projectViews: rows.filter((e) => e && e.event_type === EVENT_PROJECT_VIEW).length,
    linkClicks: rows.filter((e) => e && e.event_type === EVENT_LINK_CLICK).length,
  };
}

/* Page views per day, oldest first, with EMPTY DAYS INCLUDED.

   The gaps are the point. A chart drawn only from days that have events shows
   a flat line for a portfolio nobody visited on four of seven days, which reads
   as steady traffic rather than as four silent days. Buckets are keyed by the
   local calendar date, because the customer reads "Tuesday" as their Tuesday.

   Returns [] for a null range ("all time"), where there is no defined number
   of days to draw and a chart would be inventing a window. */
export function visitsByDay(events, rangeId, now = Date.now()) {
  const r = rangeById(rangeId);
  if (r.days === null) return [];

  const key = (d) => {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  const counts = new Map();
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || e.event_type !== EVENT_PAGE_VIEW) continue;
    const k = key(e.created_at);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }

  // One bucket per day in the range, including today.
  const days = [];
  for (let i = r.days - 1; i >= 0; i -= 1) {
    const d = new Date(now - i * 86400 * 1000);
    const k = key(d);
    days.push({ day: k, count: counts.get(k) || 0 });
  }
  return days;
}

/* WHY THERE IS NOTHING TO SHOW — the difference between "nobody came" and
   "nobody could have come" matters more here than any number.

   A portfolio that was never published has no visitors because it has never
   been reachable, and showing that customer four zeros invites them to
   conclude their work is unpopular. The zeros are true and the reading is
   wrong, so the screen says which case it is. */
export function emptyReason({ published, total }) {
  if (!published) return 'never-published';
  if (!total) return 'no-visits';
  return null;
}
