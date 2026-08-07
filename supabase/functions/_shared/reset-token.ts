// reset-token.ts — the two facts request-password-reset and
// complete-password-reset MUST agree on: how a token is hashed, and how long
// it lives.
//
// WHY THIS ONE IS SHARED WHEN THE EMAIL TEMPLATES ARE NOT
// -------------------------------------------------------
// invite-client and client-recovery each keep their own copy of the credentials
// email, on the argument that they deploy independently and a shared module is
// a deploy-order hazard. That argument is about a template, where drift makes a
// message look wrong and someone eventually notices.
//
// Drift here is different in kind. If the two sides disagree about the hash,
// EVERY reset link stops working — the writer stores one digest and the reader
// computes another, and nothing matches, ever. That failure is total, silent
// until a customer reports it, and impossible to diagnose from either file
// alone. A shared module makes it unrepresentable, which is worth more than the
// deploy-order risk it takes on. Deploy both functions when this file changes.
//
// Nothing here touches Deno, so tests/password-reset.test.mjs imports it
// directly rather than lifting it out of the source.

/**
 * How long a reset link lives. 30 minutes: long enough to survive mail delays
 * and someone finishing what they were doing, short enough that a link sitting
 * in an unattended inbox is not a standing key to the account.
 */
export const RESET_TTL_MS = 30 * 60 * 1000;

/**
 * SHA-256 of a raw token, lowercase hex.
 *
 * SHA-256 rather than bcrypt/argon on purpose: the input is 32 bytes of CSPRNG
 * output, so there is no dictionary to attack and nothing for a slow KDF to
 * buy. What the hash is for is making the STORED row useless — the table ends
 * up in backups and in any dump taken for debugging, and raw tokens would make
 * every one of those an account-takeover artefact for half an hour.
 *
 * Available in both Deno and Node 18+ via WebCrypto, which is what lets the
 * test assert the exact digest both sides will compute.
 */
export async function sha256Hex(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
