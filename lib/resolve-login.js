// Decides how to interpret whatever someone typed into the sign-in box.
//
// The sign-in form used to accept ONLY a username: it passed the input straight
// to get_email_for_username, and a null result produced "username or password is
// incorrect" WITHOUT ever checking the password. Typing your own email address
// therefore always failed, which reads as a broken password — and since the
// forgot-password form does accept an email, the reset link became the only way
// back in, every single time. This splits the two cases so both work.
//
// Kept deliberately loose: the goal is only to decide which lookup to attempt,
// not to validate the address. Supabase is the authority on whether an email is
// real, and a wrong guess here just means one failed sign-in, never a lockout.

export function parseLoginIdentifier(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { kind: 'empty', value: '' };
  // An "@" anywhere means treat it as an email — the same test the
  // forgot-password form already uses, so the two screens agree.
  if (value.includes('@')) return { kind: 'email', value };
  // Usernames are stored lowercased and trimmed by get_email_for_username.
  return { kind: 'username', value: value.toLowerCase() };
}

export default parseLoginIdentifier;
