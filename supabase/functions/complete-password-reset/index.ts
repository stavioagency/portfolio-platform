// complete-password-reset — spends a reset token and sets the new password.
//
// Deployed WITHOUT the JWT gateway check — the whole point is that the person
// cannot sign in:
//     supabase functions deploy complete-password-reset --no-verify-jwt
//
// Requires supabase/sections/section-j-password-reset.sql to have been applied.
//
// THE TOKEN IS THE ONLY CREDENTIAL, so everything here is about making it hard
// to spend twice and impossible to spend late:
//
//   * the row is CLAIMED before the password is written, in a single
//     conditional UPDATE, so two simultaneous submissions cannot both win;
//   * expiry is checked against the database's own clock in that same
//     statement, not against this function's clock after a read;
//   * the raw token never leaves this process and is never logged.
//
// UNLIKE the signup link, this is single-use, and that is safe here for a
// reason worth writing down: HANDOFF §9 records mail scanners burning
// single-use links by pre-fetching them. /reset-password only RENDERS on GET
// and calls nothing. The token is spent by the POST a human causes by
// submitting the form, which no scanner performs.
//
// Body:    { token, password }
// Returns: { ok: true } | { error: invalid_or_expired_token | password_too_short
//                                 | password_too_long | reset_failed }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json } from "../_shared/http.ts";
import { passwordError } from "../_shared/signup-rules.ts";
import { sha256Hex } from "../_shared/reset-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// One code for "no such token", "already spent" and "too old". They are three
// different states and the caller gets one answer: telling someone which of
// those a value is turns this into a way to test tokens. The page's copy —
// "ask for a new link" — is the right remedy for all three anyway.
const INVALID = "invalid_or_expired_token";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");

  // Shape-check before anything touches the database. 64 hex characters is what
  // request-password-reset issues; anything else cannot match a stored digest,
  // so the query would be a guaranteed miss.
  if (!/^[0-9a-f]{64}$/i.test(token)) return json({ error: INVALID }, 400);

  // The SAME rule signup-start enforces, from the same module — a password
  // accepted at signup and refused at reset (or the reverse) is the kind of
  // inconsistency that reads as a broken form.
  const pwErr = passwordError(password);
  if (pwErr) return json({ error: pwErr }, 400);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const token_hash = await sha256Hex(token.toLowerCase());

    // CLAIM AND CHECK IN ONE STATEMENT.
    //
    // `used_at is null` and `expires_at > now()` are part of the UPDATE's own
    // WHERE clause, so Postgres decides both under the row lock it already
    // takes. A read-then-write would leave a window where two requests both see
    // an unused token and both proceed — with a password reset, that window is
    // an attacker replaying a link at the same moment the owner uses it.
    //
    // now() is the DATABASE's clock. This function's clock is not authoritative
    // and does not need to be.
    const { data: claimed, error: claimErr } = await admin
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", token_hash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id, user_id")
      .maybeSingle();

    if (claimErr) {
      console.error("[complete-password-reset] claim failed:", claimErr.message);
      return json({ error: "reset_failed" }, 500);
    }
    if (!claimed) {
      // Unknown, already spent, or expired — deliberately not distinguished.
      console.warn("[complete-password-reset] rejected: no live token matched");
      return json({ error: INVALID }, 400);
    }

    const { error: pwUpdateErr } = await admin.auth.admin.updateUserById(claimed.user_id, {
      password,
      // Whoever completes this HAS chosen their own password, so the temp-password
      // gate must come down — leaving it on would prompt them to set a password
      // again on the screen straight after setting one.
      user_metadata: { ...(await currentMetadata(admin, claimed.user_id)), must_set_password: false },
    });

    if (pwUpdateErr) {
      // The token is already spent and is NOT put back. Reinstating it on
      // failure would mean a token whose used_at can go from set to null, which
      // is the property the single-use guarantee rests on. The cost is that
      // this person asks for a new link; the alternative costs the guarantee.
      console.error(
        `[complete-password-reset] token claimed but password write failed for user=${claimed.user_id}: ${pwUpdateErr.message}`,
      );
      return json({ error: "reset_failed" }, 500);
    }

    console.log(`[complete-password-reset] password reset for user=${claimed.user_id}`);
    return json({ ok: true });
  } catch (err) {
    console.error("[complete-password-reset] unexpected:", err);
    return json({ error: "reset_failed" }, 500);
  }
});

// user_metadata is REPLACED, not merged, by updateUserById — so it has to be
// read first or everything else in there (admin_lang, the seeded lang) is
// silently dropped. Returns {} on failure rather than throwing: losing metadata
// is bad, failing the reset the person is in the middle of is worse.
// deno-lint-ignore no-explicit-any
async function currentMetadata(admin: any, userId: string): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) throw error;
    return data?.user?.user_metadata ?? {};
  } catch (err) {
    console.error("[complete-password-reset] metadata read failed, writing bare:", err);
    return {};
  }
}
