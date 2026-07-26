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

export default isPasswordLink;
