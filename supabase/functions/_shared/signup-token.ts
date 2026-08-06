// signup-token.ts — the email-verification link's token.
//
// Same construction as grant.ts (HMAC-SHA256 over a base64url payload, expiry
// inside the signature, constant-time verify), with two deliberate differences:
//
//   * ITS OWN SECRET. SIGNUP_TOKEN_SECRET, never BILLING_GRANT_SECRET. The
//     blast radii are not comparable: a leaked billing secret lets someone
//     start a checkout they would have to pay for, a leaked signup secret lets
//     them verify an email address they do not own.
//
//   * A `k` (kind) claim, checked on verify. Even with separate secrets, a
//     token minted for one purpose must not be spendable at another — that is
//     the class of bug where a password-reset link turns out to also confirm an
//     email, or vice versa.
//
// REUSABLE, NOT SINGLE-USE, and 24 hours long. HANDOFF §9 records what
// single-use links have already cost this project: they are burned by mail
// scanners that pre-fetch the URL before the human ever clicks, and the
// legitimate recipient then lands on a dead page. A token that cannot be burned
// is the direct answer. Confirming an already-confirmed email is a no-op, so
// re-clicking is harmless, and a resend mints an ADDITIONAL valid token rather
// than invalidating the previous one.
const SECRET = Deno.env.get("SIGNUP_TOKEN_SECRET") ?? "";

const TTL_SECONDS = 24 * 60 * 60;
const KIND = "verify_email";

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Uint8Array<ArrayBuffer>, not ArrayBufferLike: WebCrypto's BufferSource
// rejects the latter because it could be backed by a SharedArrayBuffer.
function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  if (!SECRET || SECRET.length < 32) {
    // A short or missing secret is a forgeable token, and a forgeable
    // verification token means anyone can confirm anyone's address. Refuse to
    // sign rather than issue something that only looks authoritative.
    throw new Error("signup_token_secret_missing_or_too_short");
  }
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signVerificationToken(userId: string, ttlSeconds = TTL_SECONDS): Promise<string> {
  const payload = JSON.stringify({
    u: userId,
    k: KIND,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  const body = b64urlEncode(new TextEncoder().encode(payload));
  const sig = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body));
  return `v1.${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

// Returns the user id, or null for ANY failure — malformed, wrong signature,
// wrong purpose, expired. The caller cannot tell those apart and must not: a
// verification endpoint that explains WHY a token failed is an oracle for
// probing them.
export async function verifyVerificationToken(token: string): Promise<string | null> {
  try {
    const parts = String(token ?? "").split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const [, body, sig] = parts;

    // crypto.subtle.verify is constant-time; comparing two signature strings
    // would not be.
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(),
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!claims?.u || claims?.k !== KIND || !claims?.e) return null;
    if (Number(claims.e) * 1000 < Date.now()) return null;
    return String(claims.u);
  } catch (_) {
    return null;
  }
}
