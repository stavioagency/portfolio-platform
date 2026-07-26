// Does this URL fragment/query mean "the user arrived by a link that must end in
// them choosing a password"?
//
// Supabase sends two such links and they behave differently:
//   recovery -> fires PASSWORD_RECOVERY, which the app can listen for.
//   invite   -> fires SIGNED_IN, which is indistinguishable from a normal login.
//
// So the link TYPE is the only reliable signal for an invite. Matching only
// `recovery` dropped an invited client straight into the dashboard with a live
// session and no password they had ever chosen: everything worked until they signed
// out, and then they were locked out of an account they appeared to own, with
// password reset — which needs email — as the only way back.
//
// Read this at module load, BEFORE supabase-js finishes its async init: the client
// strips the hash while exchanging the token, which can happen before an
// onAuthStateChange listener is even subscribed.

const TYPE_RE = /(^|[#&?])type=(recovery|invite)(&|$)/;

export function isPasswordLink(hash, search) {
  return TYPE_RE.test(String(hash ?? '')) || TYPE_RE.test(String(search ?? ''));
}

// Convenience wrapper for the browser. SSR-safe: no window means no link.
export function arrivedViaPasswordLink() {
  if (typeof window === 'undefined') return false;
  return isPasswordLink(window.location.hash, window.location.search);
}

// A CONSUMED or EXPIRED link does not come back with a token — Supabase redirects
// to `#error=access_denied&error_code=otp_expired&error_description=...` with no
// `type=` at all. So the password-link check above is false, no session is created,
// and the user was dumped on a bare sign-in form with no clue why: they clicked a
// real invite and the app simply asked them to log in with a password they had
// never set. Read the error so the reason can be shown instead.
export function readAuthLinkError(hash, search) {
  const parse = (raw) => {
    const s = String(raw ?? '').replace(/^[#?]/, '');
    if (!s) return null;
    const p = new URLSearchParams(s);
    const code = p.get('error_code') || p.get('error');
    if (!code) return null;
    return {
      code,
      description: (p.get('error_description') || '').replace(/\+/g, ' '),
    };
  };
  return parse(hash) || parse(search);
}

export function readAuthLinkErrorFromWindow() {
  if (typeof window === 'undefined') return null;
  return readAuthLinkError(window.location.hash, window.location.search);
}

// Is this the specific "link no longer usable" case, as opposed to some other auth
// error? Those are the ones a NEW invite or reset link fixes.
export function isExpiredLinkError(err) {
  if (!err) return false;
  const c = String(err.code || '').toLowerCase();
  const d = String(err.description || '').toLowerCase();
  return c.includes('expired') || c === 'access_denied' || d.includes('expired') || d.includes('invalid');
}

export default isPasswordLink;
