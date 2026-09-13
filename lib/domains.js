// lib/domains.js
// -----------------------------------------------------------------------------
// Custom domains: the rules, shared by every screen that offers them.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
// All of this lived inside pages/admin.js, which meant the Studio could only
// offer custom domains by reimplementing DNS verification. Two implementations
// of "does this domain point at us" is how one screen tells a customer their
// domain is active while the other says it is still pending — and the customer
// is the one who finds out.
//
// Nothing here is new. Every function below is the admin's, moved, and the
// admin now imports them back. That is the whole point: one definition, two
// readers, and the behaviour is identical because it is the same code.
//
// ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────
// No Supabase and no React. The reads and writes belong to the screens (and to
// RLS, which is what actually decides whether a write is allowed). This module
// decides only what a domain IS, what record it needs, and what DNS says about
// it — the parts that are pure and therefore testable.
import { normalizeHost } from './tenant.js';

/* Where a custom domain has to point. Both are Vercel's and both are public;
   they are constants rather than environment values because a wrong one here
   produces a customer whose domain never verifies and no error anywhere. */
export const VERCEL_A_RECORD = '76.76.21.21';
export const VERCEL_CNAME = 'cname.vercel-dns.com';

/* Host only.
   The scheme and path are stripped HERE and the rest is delegated to the
   resolver's own normalizeHost, so a stored domain is normalized exactly like
   an incoming request host. Duplicating that logic would let a saved domain
   silently never match at runtime — which is a domain that looks configured,
   verifies green, and serves nothing. */
export function normalizeDomain(v) {
  return normalizeHost(String(v || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
}

/* Two labels or fewer is an apex: example.com, not www.example.com.
   It decides which record the customer is told to create, so it is not
   cosmetic — an apex cannot take a CNAME. */
export function isApexDomain(d) {
  return String(d || '').split('.').filter(Boolean).length <= 2;
}

/* Shape only, never availability. A domain that parses is worth attempting;
   whether it resolves is DNS's answer, not a regular expression's. */
export function isValidDomain(d) {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(String(d || ''));
}

/* The exact record the customer has to create at their provider.
   One function so the instructions panel and any future copy-to-clipboard
   cannot drift from what checkDomainDns actually looks for. */
export function dnsRecordFor(domain) {
  const apex = isApexDomain(domain);
  return {
    type: apex ? 'A' : 'CNAME',
    host: apex ? '@' : String(domain || '').split('.')[0],
    value: apex ? VERCEL_A_RECORD : VERCEL_CNAME,
  };
}

/* Verify straight from the browser over public DNS-over-HTTPS — no backend.

   THE CRITICAL DISTINCTION IS "UNREACHABLE" VERSUS "NO RECORDS". If the DNS
   API cannot be reached — offline, blocked by an extension, a hostile network —
   that is NOT evidence of missing DNS. Treating it as such would let Verify
   downgrade a perfectly working domain to pending, and the customer would go
   and "fix" DNS that was never broken. So the result carries `reachable`, and
   callers must not write a status when it is false. */
export async function checkDomainDns(domain, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return { reachable: false, ok: false, hasAnyRecord: false };

  const q = async (type) => {
    // Abort a stalled request so Verify cannot spin forever on a flaky network.
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    try {
      const r = await doFetch(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
        ctrl ? { signal: ctrl.signal } : undefined,
      );
      if (!r.ok) throw new Error(`dns http ${r.status}`);
      const j = await r.json();
      return (j.Answer || []).map((a) => String(a.data || '').replace(/\.$/, '').toLowerCase());
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    const [cname, a] = await Promise.all([q('CNAME'), q('A')]);
    const ok = cname.some((v) => v.includes('vercel-dns.com')) || a.includes(VERCEL_A_RECORD);
    return { reachable: true, ok, hasAnyRecord: cname.length > 0 || a.length > 0 };
  } catch (_) {
    return { reachable: false, ok: false, hasAnyRecord: false };
  }
}

/* What to store after a check, or null for "do not touch the row".

   Null is the whole reason this is a function. An unreachable DNS service must
   leave the existing status alone; returning a status for that case is exactly
   the bug the `reachable` flag exists to prevent. */
export function nextStatusFromDns(res) {
  if (!res || !res.reachable) return null;
  if (res.ok) return 'active';
  return res.hasAnyRecord ? 'error' : 'pending';
}

/* The three states a domain row can be in, as label and tone.
   `error` is "a record exists but points elsewhere", which is a different thing
   from "no record yet" — the first needs correcting, the second needs waiting,
   and telling them apart is most of what makes this screen useful. */
export function domainStatusMeta(status, ar) {
  if (status === 'active') return { tone: 'success', label: ar ? 'نشط' : 'Active' };
  if (status === 'error') return { tone: 'danger', label: ar ? 'فشل' : 'Failed' };
  return { tone: 'warning', label: ar ? 'بانتظار DNS' : 'Waiting for DNS' };
}
