// request-password-reset — "forgot password", off Supabase's mailer.
//
// Deployed WITHOUT the JWT gateway check — whoever needs this has no session:
//     supabase functions deploy request-password-reset --no-verify-jwt
//
// Requires supabase/sections/section-j-password-reset.sql to have been applied.
// Without the table the insert fails, which is logged and swallowed like any
// other failure here: this endpoint never tells the caller anything went wrong.
//
// WHY THIS EXISTS
// ---------------
// The button used to call supabase.auth.resetPasswordForEmail(), which hands
// the job to Supabase's built-in mailer. That mailer has effectively never
// delivered on this project (HANDOFF §7: recovery_sent_at set for 2 of 14
// users, confirmation_sent_at for none), so "forgot password" was a dead
// control — press it, nothing arrives, conclude your password is broken.
// signup-start already routes around this through Resend; this is the same
// move for recovery, and it is the last Supabase-template dependency to go.
//
// THE RESPONSE IS ALWAYS THE SAME
// -------------------------------
// { ok: true }, for an address that exists, one that does not, a send that
// failed, and a database that is down. Anything else turns this endpoint into
// an oracle for "is this person a customer" — answerable by anyone, at any
// rate, with no session. The person who owns the mailbox learns what happened;
// whoever posted the form learns nothing. The existing UI already says "if an
// account exists…" and this is what makes that sentence true.
//
// Body:    { email, lang? }
// Returns: { ok: true } — always.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json } from "../_shared/http.ts";
import { emailError, normalizeEmail } from "../_shared/signup-rules.ts";
import { findUserByEmail } from "../_shared/find-user.ts";
import { RESET_TTL_MS, sha256Hex } from "../_shared/reset-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "Designakum <noreply@designakum.site>";
const SITE_URL = Deno.env.get("SIGNUP_SITE_URL") ?? "https://designakum.site";

// Every exit is this object. One constant so a later edit cannot make a branch
// distinguishable by accident — the whole design rests on them being identical.
const SAME_ANSWER = { ok: true };

// How many reset mails one account can trigger in a window. Three is generous
// for the real behaviour this has to allow — press it, miss the mail, press it
// again, check the spam folder, press it once more — and still far below what
// makes an inbox unusable. See the note at the call site for why the limit is
// per account rather than per IP.
const RATE_MAX_PER_WINDOW = 3;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const esc = (v: string) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Which language to write to this person in.
 *
 * The same priority the dashboard uses, and the same one the credentials email
 * uses (invite-client / client-recovery each carry their own copy — see the
 * note on those). Repeated here rather than imported for the reason given
 * there: these functions deploy independently, so a shared module is a
 * deploy-order hazard. tests/password-reset.test.mjs runs this one for real.
 *
 *   admin_lang  what they CHOSE with the toggle. An explicit preference wins.
 *   lang        what they signed up in, or were seeded with. A good guess.
 *   tenant      the workspace's own default_lang.
 *   "ar"        the product is Arabic-first.
 */
export function pickLang(
  meta: Record<string, unknown> | null | undefined,
  tenantDefault?: string | null,
): "ar" | "en" {
  const ok = (v: unknown) => (v === "ar" || v === "en" ? v : null);
  return ok(meta?.admin_lang) ?? ok(meta?.lang) ?? ok(tenantDefault) ?? "ar";
}

/**
 * The reset email, in one language or the other.
 *
 * Pure and exported so both branches can be rendered and asserted from Node —
 * there is no Deno on the machine this is written on, and an email nobody can
 * test is an email that quietly goes out in the wrong language.
 *
 * Styling follows the credentials email deliberately: same card, same button,
 * same 30-minute plain-language footer. A recovery mail that looks unlike every
 * other mail we send is a recovery mail that reads as phishing.
 */
export function resetEmail(
  lang: "ar" | "en",
  v: { url: string; minutes: number },
): { subject: string; html: string } {
  const ar = lang === "ar";
  const t = ar
    ? {
      subject: "إعادة تعيين كلمة مرور ديزاينكم",
      title: "إعادة تعيين كلمة المرور",
      intro:
        "وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط الزر لاختيار كلمة مرور جديدة.",
      cta: "تعيين كلمة مرور جديدة",
      expiry: `الرابط صالح لمدة ${v.minutes} دقيقة، ويعمل مرة واحدة فقط.`,
      footer:
        "إن لم تطلب هذا فتجاهل الرسالة — لم يتغيّر شيء في حسابك، وكلمة مرورك الحالية ما زالت تعمل.",
    }
    : {
      subject: "Reset your Designakum password",
      title: "Reset your password",
      intro:
        "We received a request to reset the password on your account. Use the button below to choose a new one.",
      cta: "Set a new password",
      expiry: `This link works for ${v.minutes} minutes, and only once.`,
      footer:
        "If you did not ask for this, ignore this email — nothing about your account has changed and your current password still works.",
    };

  // dir on the wrapper, not just the document: mail clients strip <html> and
  // an Arabic block laid out left-to-right reads as broken, not as translated.
  const html = `
<div dir="${ar ? "rtl" : "ltr"}" lang="${lang}" style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#0C1530;text-align:${ar ? "right" : "left"}">
  <h1 style="font-size:20px;margin:0 0 6px">${t.title}</h1>
  <p style="font-size:14px;line-height:1.6;color:#475069;margin:0 0 20px">
    ${t.intro}
  </p>
  <p style="margin:0 0 16px">
    <a href="${esc(v.url)}" style="display:inline-block;background:#2C6FE0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600">${t.cta}</a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#475069;margin:0 0 16px">
    ${t.expiry}
  </p>
  <p style="font-size:13px;line-height:1.6;color:#475069;margin:0">
    ${t.footer}
  </p>
</div>`;
  return { subject: t.subject, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(SAME_ANSWER); }

  const email = normalizeEmail(body.email);
  // A malformed address gets the same answer as a real one. It describes the
  // submission rather than the account, so returning the reason would leak
  // nothing — but it would also mean this endpoint has more than one response
  // shape, and the guarantee above is easier to keep than to re-argue.
  if (emailError(email)) return json(SAME_ANSWER);

  // The language the browser is in, used only when the ACCOUNT has no opinion.
  // Someone pressing "forgot password" on the Arabic sign-in screen is telling
  // us something, but less than their own saved preference does.
  const fromBrowser = body.lang === "en" || body.lang === "ar" ? body.lang : null;

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // There is no getUserByEmail in this SDK version, and listUsers does NOT
    // take an email filter however much it looks like it should — see
    // _shared/find-user.ts, which walks the pages. This function previously
    // passed `{ page: 1, perPage: 1, email }` and, because the `email` was
    // dropped, compared the requested address against the single newest
    // account in the project. Every other customer got the "no account"
    // branch below, which is silent by design: hence "returns ok, sends
    // nothing, writes no token row" for all but one person.
    //
    // A lookup FAILURE throws, and is caught and logged by the handler's
    // catch. It must never be confused with an absent account.
    const user = await findUserByEmail(admin, email);
    // No such account. This is the branch the whole "same answer" rule exists
    // for: it must be indistinguishable from the one below, including in how
    // long it takes to anyone who is not timing very carefully.
    if (!user) {
      console.log("[request-password-reset] no account for that address — nothing sent");
      return json(SAME_ANSWER);
    }

    // ---- RATE LIMIT, per account.
    //
    // Built out of the rows this function already writes, because there is no
    // rate-limit table in this project and inventing one for a single caller
    // would be a second store with its own retention and privacy questions.
    // Counting recent tokens for THIS user is free and measures the thing that
    // matters: someone holding the button down against a known address, which
    // is an inbox flood for them and a Resend bill for us.
    //
    // It is deliberately NOT a per-IP limit, and it cannot be one from here: an
    // address with no account writes no row, so there is nothing to count, and
    // the count is keyed to a user rather than to a requester. Supabase's own
    // platform rate limiting sits in front of Edge Functions and is what covers
    // the unknown-address case. Written down rather than left implied.
    //
    // Checked AFTER the user lookup and before anything is written, so a
    // limited request costs one read and still returns SAME_ANSWER — being
    // rate-limited must not be observable either.
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count, error: countErr } = await admin.from("password_reset_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", windowStart);
    // Fail CLOSED: a limiter that stops counting under load is not a limiter,
    // and the cost of being wrong here is one person waiting a few minutes.
    if (countErr) throw new Error(`rate_limit_read_failed: ${countErr.message}`);
    if ((count ?? 0) >= RATE_MAX_PER_WINDOW) {
      console.warn(
        `[request-password-reset] rate limited user=${user.id} (${count} in ${RATE_WINDOW_MS / 60_000}m)`,
      );
      return json(SAME_ANSWER);
    }

    // The workspace's default is the third signal, behind anything the account
    // itself says. Failure here is not fatal: it degrades to `lang`, then to
    // Arabic, which is the same fallback chain everything else uses.
    let tenantLang: string | null = null;
    try {
      const { data: membership } = await admin.from("tenant_admins")
        .select("tenant_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (membership?.tenant_id) {
        const { data: tenantRow } = await admin.from("tenants")
          .select("default_lang").eq("id", membership.tenant_id).maybeSingle();
        tenantLang = tenantRow?.default_lang ?? null;
      }
    } catch (err) {
      console.error("[request-password-reset] tenant lang lookup failed:", err);
    }
    const lang = pickLang(user.user_metadata, tenantLang ?? fromBrowser);

    // 32 bytes of CSPRNG, hex. The RAW token exists in exactly two places for
    // the next 30 minutes — this variable and the URL in the email — and is
    // never written to the database or to a log.
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const token_hash = await sha256Hex(raw);

    // Retire every other live link for this account BEFORE issuing the new one.
    // Two reasons, and the second is the one that matters: a customer who
    // presses the button three times should not leave three working keys in
    // their inbox, and a reset link that was phished earlier stops working the
    // moment the real owner asks for a fresh one.
    //
    // Marked used rather than deleted so the row survives as evidence that a
    // link was issued and superseded — deleting it would erase the only trace.
    const { error: retireErr } = await admin.from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("used_at", null);
    if (retireErr) throw new Error(`retire_failed: ${retireErr.message}`);

    const { error: insErr } = await admin.from("password_reset_tokens").insert({
      user_id: user.id,
      token_hash,
      expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    });
    if (insErr) throw new Error(`insert_failed: ${insErr.message}`);

    // `lang` rides in the URL because the link is routinely opened on a device
    // that has never seen this site — the same reason /signup/verify carries
    // it. The page prefers it over anything the browser remembers.
    const url = `${SITE_URL}/reset-password?token=${encodeURIComponent(raw)}&lang=${lang}`;
    const { subject, html } = resetEmail(lang, {
      url,
      minutes: Math.round(RESET_TTL_MS / 60_000),
    });
    await sendMail(email, subject, html, lang);

    return json(SAME_ANSWER);
  } catch (err) {
    // Swallowed on purpose. A 500 here would answer the question this endpoint
    // refuses to answer: it would fire for a real account whose insert failed
    // and not for an address that does not exist. The log is where this gets
    // noticed; the caller sees success either way.
    console.error("[request-password-reset] failed:", err);
    return json(SAME_ANSWER);
  }
});

// The raw token is inside `html`, so nothing in here logs the body — only the
// status and Resend's own message. Same rule as every other mail path.
async function sendMail(to: string, subject: string, html: string, lang: string) {
  if (!RESEND_API_KEY) {
    console.error("[request-password-reset] RESEND_API_KEY unset — no reset mail sent");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(
        `[request-password-reset] resend rejected ${res.status} from=${MAIL_FROM} lang=${lang}: ${(await res.text()).slice(0, 200)}`,
      );
      return;
    }
    console.log(`[request-password-reset] reset mail sent lang=${lang}`);
  } catch (err) {
    console.error("[request-password-reset] resend threw:", err);
  }
}
