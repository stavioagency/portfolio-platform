// The console's decisions, tested where they are decided.
//
// Almost every test below is about NOT raising a false alarm: a closed appeal
// that is weeks old, a suspension that was properly communicated, ten reports
// from one upset person. The operator console is read by two people who will
// act on what it says, and an alarm that cries wolf gets ignored exactly when
// it finally matters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPEAL_HOURS, appealIsOverdue, deskOrder, unreadCount,
  groupReports, healthIssues, suspensionIsWhole,
} from '../lib/console-desk.js';

const NOW = Date.parse('2026-09-15T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

// ── the 48-hour promise ──────────────────────────────────────────────────

test('an appeal past 48 hours is overdue', () => {
  assert.equal(APPEAL_HOURS, 48);
  assert.ok(appealIsOverdue({ kind: 'appeal', status: 'open', created_at: hoursAgo(49) }, NOW));
  assert.ok(!appealIsOverdue({ kind: 'appeal', status: 'open', created_at: hoursAgo(47) }, NOW));
});

test('A CLOSED APPEAL IS NEVER OVERDUE, HOWEVER OLD', () => {
  // The promise is to ANSWER, and closing is what records the answer. Counting
  // closed threads turns every appeal we handled into a permanent accusation.
  assert.ok(!appealIsOverdue({ kind: 'appeal', status: 'closed', created_at: hoursAgo(900) }, NOW));
});

test('a support question is not on the appeal clock', () => {
  assert.ok(!appealIsOverdue({ kind: 'support', status: 'open', created_at: hoursAgo(900) }, NOW));
});

// ── the order an owner works in ──────────────────────────────────────────

test('overdue appeals come first and closed threads sink', () => {
  const order = deskOrder([
    { id: 'closed', kind: 'support', status: 'closed', created_at: hoursAgo(1) },
    { id: 'chat', kind: 'support', status: 'open', created_at: hoursAgo(2), last_message_at: hoursAgo(2) },
    { id: 'late', kind: 'appeal', status: 'open', created_at: hoursAgo(80) },
    { id: 'fresh', kind: 'appeal', status: 'open', created_at: hoursAgo(3) },
  ], NOW).map((t) => t.id);
  assert.deepEqual(order, ['late', 'fresh', 'chat', 'closed']);
});

test('a long thread answered this morning does not sink', () => {
  // Sorting by created_at would bury it under threads opened yesterday.
  const [first] = deskOrder([
    { id: 'quiet', kind: 'support', status: 'open', created_at: hoursAgo(20), last_message_at: hoursAgo(20) },
    { id: 'old-but-live', kind: 'support', status: 'open', created_at: hoursAgo(500), last_message_at: hoursAgo(1) },
  ], NOW);
  assert.equal(first.id, 'quiet');
});

// ── the badge is per owner ───────────────────────────────────────────────

test('one owner reading a notice does not clear the other badge', () => {
  const notices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(unreadCount(notices, ['a']), 2);
  assert.equal(unreadCount(notices, []), 3);
  assert.equal(unreadCount(notices, new Set(['a', 'b', 'c'])), 0);
});

// ── reports ──────────────────────────────────────────────────────────────

test('TEN REPORTS ABOUT ONE PORTFOLIO ARE ONE THING TO LOOK AT', () => {
  // Ungrouped, one upset person filing repeatedly is indistinguishable from a
  // real problem. distinctSources is what tells them apart.
  const reports = Array.from({ length: 10 }, (_, i) => ({
    id: String(i), tenant_id: 't1', status: 'new', reporter_key: 'same-person',
  }));
  const [g] = groupReports(reports);
  assert.equal(g.reports.length, 10);
  assert.equal(g.open, 10);
  assert.equal(g.distinctSources, 1);
});

test('the portfolio more people reported sorts first', () => {
  const groups = groupReports([
    { tenant_id: 'quiet', status: 'new', reporter_key: 'a' },
    { tenant_id: 'loud', status: 'new', reporter_key: 'a' },
    { tenant_id: 'loud', status: 'new', reporter_key: 'b' },
  ]);
  assert.equal(groups[0].tenant_id, 'loud');
});

// ── what is quietly wrong ────────────────────────────────────────────────

test('a suspension the client was never told about is raised', () => {
  const [issue] = healthIssues({
    tenants: [{ slug: 'x', suspended_at: hoursAgo(5), suspend_reason: 'reported', suspend_reason_sent_at: null }],
  }, NOW);
  assert.equal(issue.issue, 'suspension_reason_not_sent');
});

test('telling the client clears it', () => {
  const issues = healthIssues({
    tenants: [{ slug: 'x', suspended_at: hoursAgo(5), suspend_reason: 'reported', suspend_reason_sent_at: hoursAgo(4) }],
  }, NOW);
  assert.deepEqual(issues, []);
});

test('a healthy platform raises nothing at all', () => {
  // The alarm that cries wolf is ignored when it finally matters.
  assert.deepEqual(healthIssues({
    tenants: [{ slug: 'ok', published_at: hoursAgo(100), entitled: true }],
    threads: [{ kind: 'appeal', status: 'closed', created_at: hoursAgo(900) }],
    payments: [{ status: 'succeeded' }],
    notices: [{ created_at: hoursAgo(5), sent_at: hoursAgo(5) }],
    domains: [{ domain: 'a.com', status: 'active' }],
  }, NOW), []);
});

test('an undrained outbox is visible, because silence is its only symptom', () => {
  const [issue] = healthIssues({
    notices: [{ summary: 'a report', created_at: hoursAgo(4), sent_at: null }],
  }, NOW);
  assert.equal(issue.issue, 'notice_unsent');
});

test('a live page with no active subscription is raised', () => {
  const [issue] = healthIssues({
    tenants: [{ slug: 'lapsed', published_at: hoursAgo(50), entitled: false }],
  }, NOW);
  assert.equal(issue.issue, 'published_without_entitlement');
});

// ── accountability ───────────────────────────────────────────────────────

test('a suspension with no actor or no reason is not whole', () => {
  assert.ok(suspensionIsWhole({ suspended_at: null }));
  assert.ok(suspensionIsWhole({ suspended_at: 'x', suspended_by: 'u', suspend_reason: 'r' }));
  assert.ok(!suspensionIsWhole({ suspended_at: 'x', suspended_by: null, suspend_reason: 'r' }));
  assert.ok(!suspensionIsWhole({ suspended_at: 'x', suspended_by: 'u', suspend_reason: null }));
});
