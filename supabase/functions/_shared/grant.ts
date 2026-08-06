// grant.ts — the signed token behind the owner's payment link.
//
// THE PROBLEM IT SOLVES
// ---------------------
// Checkout has two doors (see pages/subscribe.js): the client opens it from
// their dashboard, or the owner sends them a link over WhatsApp. Door one has a
// JWT. Door two has nothing — the recipient may never have signed in, which is
// the entire reason the link exists.
//
// So door two carries a grant: a token saying "this tenant may start a checkout
// for this plan, until this time", signed with a secret only the server knows.
// It authorises ONE narrow thing. It is not a session, it cannot read anything,
// and possessing it lets you do nothing but pay someone else's bill.
//
// WHY NOT A DATABASE ROW
// ----------------------
// A stateless token cannot be "already used" — and HANDOFF §9 records what
// single-use links cost this project: mail scanners pre-fetch them, and the
// legitimate recipient then arrives at a dead page. A payment link must survive
// being opened twice, forwarded, and clicked again after a failed card.
//
// FORMAT  v1.<base64url(payload)>.<base64url(hmac)>
// PAYLOAD {t: tenantId, p: planCode, e: expiryEpochSeconds}
const SECRET = Deno.env.get("BILLING_GRANT_SECRET") ?? "";

// 14 days. Long enough to survive a slow client and a weekend, short enough
// that a link forwarded into a group chat stops working.
const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60;

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>: WebCrypto's
// BufferSource will not accept the latter, because it could be backed by a
// SharedArrayBuffer. Allocating the buffer here rather than using
// Uint8Array.from is what pins the type.
function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  if (!SECRET || SECRET.length < 32) {
    // A short or missing secret is a forgeable token. Refuse rather than sign
    // something that looks authoritative and is not.
    throw new Error("billing_grant_secret_missing_or_too_short");
  }
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signGrant(
  tenantId: string,
  planCode: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const payload = JSON.stringify({
    t: tenantId,
    p: planCode,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  const body = b64urlEncode(new TextEncoder().encode(payload));
  const sig = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body));
  return `v1.${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

export interface Grant {
  tenantId: string;
  planCode: string;
}

// Returns null for ANY failure — malformed, wrong signature, expired. The
// caller cannot tell the three apart, and should not: distinguishing them for
// the client turns the token into an oracle.
export async function verifyGrant(token: string): Promise<Grant | null> {
  try {
    const parts = String(token ?? "").split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const [, body, sig] = parts;

    // crypto.subtle.verify is constant-time, which a string comparison of the
    // two signatures would not be.
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(),
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!claims?.t || !claims?.p || !claims?.e) return null;
    if (Number(claims.e) * 1000 < Date.now()) return null;
    return { tenantId: String(claims.t), planCode: String(claims.p) };
  } catch (_) {
    return null;
  }
}
