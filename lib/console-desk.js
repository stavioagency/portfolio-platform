// lib/console-desk.js
// -----------------------------------------------------------------------------
// The console's decisions, with no database and no React in them.
//
// Every function here answers a question the owner console has to ask — which
// threads are overdue, what is quietly broken, how many notices this owner has
// not seen — and answers it from plain rows. The screens read; this decides.
// That split is why these can be tested at all, and the operator console is
// exactly the place where "it looked right" is not evidence: a wrong answer
// here is a suspension nobody revisits or an appeal nobody answers.

/** The promise made to a suspended client. Read in one place, stated once. */
export const APPEAL_HOURS = 48;

/** Milliseconds, so the arithmetic below never repeats the conversion. */
const HOUR = 60 * 60 * 1000;

/**
 * Is this appeal past the promise?
 *
 * A closed thread is never overdue, however old: the promise is to ANSWER, and
 * answering is what closing records. Counting closed threads would turn every
 * resolved appeal into a permanent accusation.
 */
export function appealIsOverdue(thread, now = Date.now()) {
  if (!thread || thread.kind !== 'appeal') return false;
  if (thread.status === 'closed') return false;
  const opened = Date.parse(thread.created_at);
  if (!Number.isFinite(opened)) return false;
  return now - opened > APPEAL_HOURS * HOUR;
}

/**
 * Threads in the order an owner should work them.
 *
 * Appeals first — they are the only ones on a clock — then by how long the last
 * message has gone unanswered. Closed threads sink. Sorting by `created_at`
 * instead would bury a three-week conversation that got a reply this morning.
 */
export function deskOrder(threads, now = Date.now()) {
  const rank = (t) => {
    if (t.status === 'closed') return 3;
    if (appealIsOverdue(t, now)) return 0;
    if (t.kind === 'appeal') return 1;
    return 2;
  };
  const when = (t) => Date.parse(t.last_message_at || t.created_at) || 0;
  return [...(threads || [])].sort((a, b) => rank(a) - rank(b) || when(a) - when(b));
}

/**
 * How many notices THIS owner has not seen.
 *
 * Both owners are notified of everything, so the badge is per person: a notice
 * Faisal has read is not one you have read. Reads are passed in as a Set of
 * notice ids rather than looked up here, so this stays pure.
 */
export function unreadCount(notices, readIds) {
  const seen = readIds instanceof Set ? readIds : new Set(readIds || []);
  return (notices || []).filter((n) => n && !seen.has(n.id)).length;
}

/**
 * Reports, grouped by the tenant they are about.
 *
 * Grouped because ten reports about one portfolio are ONE thing to look at, not
 * ten. Ungrouped, a single upset person filing repeatedly looks exactly like a
 * real problem — which is the brigading failure the schema deliberately does not
 * try to solve with a threshold.
 */
export function groupReports(reports) {
  const by = new Map();
  for (const r of reports || []) {
    if (!r || !r.tenant_id) continue;
    if (!by.has(r.tenant_id)) {
      by.set(r.tenant_id, { tenant_id: r.tenant_id, reports: [], open: 0, sources: new Set() });
    }
    const g = by.get(r.tenant_id);
    g.reports.push(r);
    if (r.status === 'new' || r.status === 'reviewing') g.open += 1;
    if (r.reporter_key) g.sources.add(r.reporter_key);
  }
  return [...by.values()]
    .map((g) => ({ ...g, distinctSources: g.sources.size }))
    .sort((a, b) => b.open - a.open || b.distinctSources - a.distinctSources);
}

/**
 * What is quietly wrong right now.
 *
 * Every row is a state no other screen shows and nothing raises on its own: the
 * client does not know, and neither does anybody else until somebody looks here.
 * Derived on read rather than stored, because a cached copy of "what is broken"
 * is wrong for exactly as long as nobody refreshes it.
 */
export function healthIssues({ tenants = [], threads = [], payments = [], notices = [], domains = [] } = {}, now = Date.now()) {
  const out = [];

  for (const t of tenants) {
    if (!t) continue;
    // Suspended with a reason nobody was told. Telling them is the decision;
    // an untold reason is that decision quietly unkept.
    if (t.suspended_at && t.suspend_reason && !t.suspend_reason_sent_at) {
      out.push({ issue: 'suspension_reason_not_sent', subject: t.slug,
        detail: 'Suspended, and the client has not been told why', since: t.suspended_at });
    }
    // Published while not entitled: the page is up and the subscription is not.
    if (t.published_at && !t.suspended_at && t.entitled === false) {
      out.push({ issue: 'published_without_entitlement', subject: t.slug,
        detail: 'A live page whose subscription is not active', since: t.published_at });
    }
  }

  for (const th of threads) {
    if (appealIsOverdue(th, now)) {
      out.push({ issue: 'appeal_past_promise', subject: th.subject,
        detail: `An appeal older than the ${APPEAL_HOURS} hours we promised`, since: th.created_at });
    }
  }

  for (const p of payments) {
    if (p && p.status === 'failed') {
      out.push({ issue: 'payment_failed', subject: p.tenant_id,
        detail: `A payment failed: ${p.failure_reason || 'no reason given'}`, since: p.created_at });
    }
  }

  for (const d of domains) {
    if (d && d.status && d.status !== 'active') {
      out.push({ issue: 'domain_stuck', subject: d.domain,
        detail: `A custom domain that is ${d.status}`, since: d.created_at });
    }
  }

  // The outbox not draining. If the sender has stopped, every promise that
  // depends on an email is quietly broken and the pile is the only symptom.
  for (const n of notices) {
    if (n && !n.sent_at && Date.parse(n.created_at) < now - HOUR) {
      out.push({ issue: 'notice_unsent', subject: n.summary,
        detail: 'An operator email has not gone out', since: n.created_at });
    }
  }

  return out.sort((a, b) => (Date.parse(a.since) || 0) - (Date.parse(b.since) || 0));
}

/** A suspension is only whole when somebody can be held to it. */
export function suspensionIsWhole(tenant) {
  if (!tenant || !tenant.suspended_at) return true;
  return Boolean(tenant.suspended_by && tenant.suspend_reason);
}
