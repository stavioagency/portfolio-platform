// lib/working-hours.js — is the client available right now?
//
// This replaces the manual "available now" switch with an expiry (section-s).
// That one was a stopgap: it told the truth only for as long as the client
// remembered to set it, and the moment they forgot, the card lied.
//
// Hours cannot go stale. The client says when they work, once, and the answer
// is recomputed on every page load from the clock.
//
// WHY NOT PRESENCE. The original idea was to read the client's real online
// status from WhatsApp, Telegram or Discord. WhatsApp's Cloud API has no
// presence endpoint; a Telegram bot cannot see a user's status, and reading it
// needs an MTProto session logged in AS the user, which is against their terms;
// only Discord can genuinely do it, and Discord is not where these clients are.
// See docs/features/live-availability.md.
//
// TIMEZONE. Fixed to Asia/Riyadh, deliberately, and not a client setting. The
// hours belong to the CLIENT, not the visitor -- "available until 5" means five
// o'clock where the designer is sitting, and a visitor in London reading it in
// their own timezone would be told something false. Every client on the
// platform is Saudi. When that stops being true this becomes one field, and
// this comment is the note explaining what to change.
export const HOURS_TZ = 'Asia/Riyadh';

// 0 = Sunday, matching Date#getDay, because the Saudi working week starts there
// and a Sunday-first array needs no translation at either end.
export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// "09:00" -> 540. Returns null for anything that is not HH:MM in range, so a
// malformed value disables the feature rather than producing a wrong answer.
export function minutesOf(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// The wall clock in the client's timezone, as { day, minutes }. Intl is used
// rather than an offset constant because Riyadh does not observe DST today but
// hardcoding +03:00 would silently break if that ever changed.
export function nowIn(tz = HOURS_TZ, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  // hour12:false yields "24" for midnight in some engines; normalise it.
  const hour = Number(get('hour')) % 24;
  return { day, minutes: hour * 60 + Number(get('minute')) };
}

// Is the client inside their working hours right now?
//
// A range that ENDS BEFORE IT STARTS wraps past midnight -- 22:00 to 02:00 is a
// real shift, and treating it as an empty range would quietly mark a night
// worker permanently unavailable. On a wrapping range the "day" that matters is
// the day the shift STARTED, so 01:00 on Monday belongs to Sunday's shift.
export function isOpen(hours, at = new Date()) {
  if (!hours || hours.enabled === false) return false;
  const from = minutesOf(hours.from);
  const to = minutesOf(hours.to);
  if (from === null || to === null || from === to) return false;

  const days = Array.isArray(hours.days) ? hours.days : [];
  if (days.length === 0) return false;

  const { day, minutes } = nowIn(hours.tz || HOURS_TZ, at);
  if (day < 0) return false;

  if (from < to) return days.includes(day) && minutes >= from && minutes < to;

  // Wrapped. Either late on a working day, or early on the morning after one.
  if (minutes >= from) return days.includes(day);
  if (minutes < to) return days.includes((day + 6) % 7);
  return false;
}
