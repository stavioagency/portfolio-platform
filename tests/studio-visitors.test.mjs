// The Visitors screen's arithmetic.
//
// Every assertion here is a way a visit count can be quietly wrong: a unique
// visitor counted twice, an anonymous hit counted as a person, a day bucket
// landing in the wrong day, or an empty day silently dropped so four silent
// days read as steady traffic. None of it is visible in review and all of it is
// obvious to the customer who owns the number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGES, DEFAULT_RANGE, rangeById, rangeStart,
  summariseVisits, visitsByDay, emptyReason,
  EVENT_PAGE_VIEW, EVENT_PROJECT_VIEW, EVENT_LINK_CLICK,
} from '../lib/studio-visitors.js';

const at = (iso, type = EVENT_PAGE_VIEW, visitor = 'v1') => ({
  created_at: iso, event_type: type, visitor_id: visitor,
});

// ── ranges ───────────────────────────────────────────────────────────────

test('an unknown range falls back to the default rather than crashing', () => {
  assert.equal(rangeById('not-a-range').id, DEFAULT_RANGE);
  assert.equal(rangeById(undefined).id, DEFAULT_RANGE);
});

test('"all time" has no lower bound', () => {
  // Not epoch-zero: a gte on 1970 is a filter the database still applies, and
  // "no lower bound" is what is actually meant.
  assert.equal(rangeStart('all'), null);
});

test('a bounded range starts the right number of days back', () => {
  const now = Date.parse('2026-09-13T12:00:00.000Z');
  assert.equal(rangeStart('24h', now), new Date(now - 86400000).toISOString());
  assert.equal(rangeStart('7d', now), new Date(now - 7 * 86400000).toISOString());
  assert.equal(rangeStart('30d', now), new Date(now - 30 * 86400000).toISOString());
});

test('every range carries both languages', () => {
  for (const r of RANGES) {
    assert.ok(r.label.ar && r.label.en, `${r.id} is missing a label`);
  }
});

// ── the four numbers ─────────────────────────────────────────────────────

test('the same visitor across many page views is one visitor', () => {
  const events = [
    at('2026-09-13T01:00:00Z', EVENT_PAGE_VIEW, 'v1'),
    at('2026-09-13T02:00:00Z', EVENT_PAGE_VIEW, 'v1'),
    at('2026-09-13T03:00:00Z', EVENT_PAGE_VIEW, 'v2'),
  ];
  const s = summariseVisits(events);
  assert.equal(s.visits, 3, 'three visits');
  assert.equal(s.visitors, 2, 'two people');
});

test('an anonymous hit is not a visitor', () => {
  // Treating null as an identity collapses every anonymous hit into one
  // person — a number nobody can act on.
  const s = summariseVisits([
    at('2026-09-13T01:00:00Z', EVENT_PAGE_VIEW, null),
    at('2026-09-13T02:00:00Z', EVENT_PAGE_VIEW, ''),
    at('2026-09-13T03:00:00Z', EVENT_PAGE_VIEW, 'v1'),
  ]);
  assert.equal(s.visits, 3);
  assert.equal(s.visitors, 1, 'only the identified visitor counts');
});

test('the three event types are counted separately', () => {
  const s = summariseVisits([
    at('2026-09-13T01:00:00Z', EVENT_PAGE_VIEW),
    at('2026-09-13T01:00:00Z', EVENT_PROJECT_VIEW),
    at('2026-09-13T01:00:00Z', EVENT_PROJECT_VIEW),
    at('2026-09-13T01:00:00Z', EVENT_LINK_CLICK),
  ]);
  assert.deepEqual(
    { visits: s.visits, projectViews: s.projectViews, linkClicks: s.linkClicks },
    { visits: 1, projectViews: 2, linkClicks: 1 },
  );
});

test('rubbish in does not throw', () => {
  // This reads a production table; a malformed row must not take the screen out.
  for (const bad of [null, undefined, 'nope', [null, undefined, {}, { event_type: 'x' }]]) {
    const s = summariseVisits(bad);
    assert.equal(typeof s.visits, 'number');
  }
});

// ── the daily chart ──────────────────────────────────────────────────────

test('a silent day is a zero, not a missing bucket', () => {
  // The gaps are the point: a chart drawn only from days that have events shows
  // a flat line for four silent days, which reads as steady traffic.
  const now = Date.parse('2026-09-13T12:00:00Z');
  const days = visitsByDay([at(new Date(now).toISOString())], '7d', now);
  assert.equal(days.length, 7, 'seven buckets for seven days');
  assert.equal(days.filter((d) => d.count === 0).length, 6, 'six silent days');
  assert.equal(days[days.length - 1].count, 1, 'today carries the event');
});

test('the chart runs oldest first', () => {
  const now = Date.parse('2026-09-13T12:00:00Z');
  const days = visitsByDay([], '7d', now);
  const keys = days.map((d) => d.day);
  assert.deepEqual([...keys].sort(), keys, 'buckets must already be in order');
});

test('only page views are charted', () => {
  const now = Date.parse('2026-09-13T12:00:00Z');
  const days = visitsByDay([
    at(new Date(now).toISOString(), EVENT_PAGE_VIEW),
    at(new Date(now).toISOString(), EVENT_LINK_CLICK),
    at(new Date(now).toISOString(), EVENT_PROJECT_VIEW),
  ], '7d', now);
  assert.equal(days[days.length - 1].count, 1, 'a click is not a visit');
});

test('all time draws no chart rather than inventing a window', () => {
  assert.deepEqual(visitsByDay([at('2026-09-13T01:00:00Z')], 'all'), []);
});

// ── the empty state ──────────────────────────────────────────────────────

test('never published is distinguished from nobody came', () => {
  // Four zeros on an unpublished portfolio invites the customer to conclude
  // their work is unpopular. The zeros are true and the reading is wrong.
  assert.equal(emptyReason({ published: false, total: 0 }), 'never-published');
  assert.equal(emptyReason({ published: true, total: 0 }), 'no-visits');
  assert.equal(emptyReason({ published: true, total: 5 }), null);
});
