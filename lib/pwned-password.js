// Checks a candidate password against HaveIBeenPwned's Pwned Passwords range API.
//
// WHY THIS EXISTS: Supabase ships exactly this as "Prevent use of leaked
// passwords", but it is gated to the Pro plan and this project is on Free. The
// underlying API is public and free, so the check is reimplemented here.
//
// WHAT IT IS AND IS NOT: a GUARDRAIL, not enforcement. Supabase's version runs
// inside GoTrue and therefore covers every path that sets a password; this runs in
// our own admin UI, so anything calling the Supabase API directly bypasses it. That
// trade is acceptable because the risk being addressed is a user CHOOSING a
// password that already sits in a breach corpus — not an attacker deliberately
// setting a pwned password on an account they already control, which only harms
// them. If the project moves to Pro, enable the real setting and delete this.
//
// K-ANONYMITY: we SHA-1 the password and send only the first FIVE hex characters.
// The API returns roughly 800 hash suffixes with breach counts, and the match is
// done locally. The password never leaves the browser, and neither does its full
// hash — the server cannot tell which of the ~800 candidates was being asked about.
// Never send the full hash, and never log the password or the hash.

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 3000;

// SHA-1 via WebCrypto. Available in browsers on HTTPS and in Node 18+, which is
// what lets the tests run this without a DOM.
export async function sha1Hex(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

// Returns { pwned, count, checked }.
//
// `checked: false` means the lookup could not be completed — offline, DNS failure,
// timeout, a non-200, a malformed body. Callers MUST FAIL OPEN in that case and
// allow the password. Blocking on an unreachable third party would mean a hiccup at
// api.pwnedpasswords.com locks someone out of setting a password, including a user
// mid-reset who has no other way back into their account. A rare weak password is a
// much better outcome than a hard lockout on the only recovery path.
export async function isPwnedPassword(pwd, { fetchImpl, timeoutMs = TIMEOUT_MS } = {}) {
  const miss = { pwned: false, count: 0, checked: false };
  const s = String(pwd ?? '');
  if (!s) return miss;

  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return miss;

  let hash;
  try {
    hash = await sha1Hex(s);
  } catch (_) {
    return miss; // no WebCrypto (e.g. plain HTTP) -> fail open
  }
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  // Do not let a hanging request block the submit button indefinitely.
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await doFetch(RANGE_URL + prefix, {
      signal: controller ? controller.signal : undefined,
      headers: { 'Add-Padding': 'true' }, // pad the response so its SIZE leaks nothing
    });
    if (!res || !res.ok) return miss;
    const body = await res.text();
    return { ...parseRange(body, suffix), checked: true };
  } catch (_) {
    return miss;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Body is one "SUFFIX:COUNT" per line. Padded responses include decoy entries with
// a count of 0, which must be treated as "not found" — that is the whole point of
// the padding, so it cannot be used to infer the real answer from the row count.
export function parseRange(body, suffix) {
  const want = String(suffix ?? '').toUpperCase();
  for (const line of String(body ?? '').split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    if (line.slice(0, sep).trim().toUpperCase() !== want) continue;
    const count = parseInt(line.slice(sep + 1).trim(), 10);
    if (!Number.isFinite(count) || count <= 0) return { pwned: false, count: 0 };
    return { pwned: true, count };
  }
  return { pwned: false, count: 0 };
}

export default isPwnedPassword;
