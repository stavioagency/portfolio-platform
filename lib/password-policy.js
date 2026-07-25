// Password policy shared by the two places a password can be set: the
// post-reset SetNewPassword screen and the in-dashboard Account editor.
//
// MAX is 72 *bytes*, not characters, because Supabase hashes with bcrypt and
// bcrypt ignores everything past byte 72. Without an explicit cap, two different
// long passwords can hash identically and both unlock the account — and the user
// is never told their password was truncated. Bytes matter because Arabic letters
// cost 2 bytes and emoji up to 4, so 72 characters is not 72 bytes.

export const PASSWORD_MIN = 8;
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
  if (passwordByteLength(s) > PASSWORD_MAX_BYTES) return 'password_too_long';
  if (confirmPwd !== undefined && s !== String(confirmPwd ?? '')) return 'password_mismatch';
  return '';
}

export default passwordPolicyError;
