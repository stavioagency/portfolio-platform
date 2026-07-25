// Password policy shared by the two places a password can be set: the
// post-reset SetNewPassword screen and the in-dashboard Account editor.
//
// MAX_CHARS is a product decision by the owner (2026-07-26), not a security
// measure — a maximum length cannot make a password harder to guess. It is set
// deliberately low, so note the trade-off: password managers generate 25-40
// character passwords, and those users must now pick something shorter by hand.
// Raising this number is safe at any time; lowering it locks out existing
// passwords, so it should not be reduced further without a reset plan.
//
// MAX_BYTES is the separate, real constraint: Supabase hashes with bcrypt, which
// ignores everything past byte 72, so a longer password is silently truncated and
// a different long password could unlock the same account. It is kept as a
// backstop because characters are not bytes — 20 emoji is 80 bytes, over the
// bcrypt limit even though it is only 20 characters.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_CHARS = 20;
export const PASSWORD_MAX_BYTES = 72;

export function passwordByteLength(pwd) {
  const s = String(pwd ?? '');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
}

// Returns the translation key of the first violated rule, or '' when acceptable.
// Order matters: length problems are reported before the mismatch, so a user who
// typo'd a too-short password is told the useful thing first.
export function passwordPolicyError(pwd, confirmPwd) {
  const s = String(pwd ?? '');
  if (s.length < PASSWORD_MIN) return 'password_too_short';
  if (s.length > PASSWORD_MAX_CHARS) return 'password_too_long';
  if (passwordByteLength(s) > PASSWORD_MAX_BYTES) return 'password_too_long';
  if (confirmPwd !== undefined && s !== String(confirmPwd ?? '')) return 'password_mismatch';
  return '';
}

export default passwordPolicyError;
