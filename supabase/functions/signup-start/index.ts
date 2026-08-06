// signup-start — the public front door. Creates an UNCONFIRMED account and
// emails a verification link through Resend.
//
// Deployed WITHOUT the JWT gateway check — nobody has a session yet:
//     supabase functions deploy signup-start --no-verify-jwt
//
// WHY ACCOUNT CREATION IS SERVER-SIDE AT ALL
// ------------------------------------------
// A browser `supabase.auth.signUp()` would trigger Supabase's own confirmation
// mailer, which is exactly what we are avoiding: it has never delivered a
// message on this project (12 users, 0 confirmations ever sent). So the account
// is created with admin.createUser({ email_confirm: false }) and the mail goes
// through Resend, the one path proven to work here — see HANDOFF §7 and §7c.
//
// THE RESPONSE IS ALWAYS THE SAME
// -------------------------------
// Three different things can happen behind this endpoint, and the caller can
// distinguish none of them:
//   * a new address       -> create the user, send a verification link
//   * an unconfirmed one  -> send another link, create nothing
//   * a confirmed one     -> send a "you already have an account" mail instead
// The information goes to whoever owns the mailbox and never to whoever posted
// the form. The same rule forgot_password_sent already follows.
//
// Body:    { email, password, workspace_name, slug, lang? }
// Returns: { ok: true } — always, for any of the above.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json } from "../_shared/http.ts";
import { signVerificationToken } from "../_shared/signup-token.ts";
import {
  emailError, normalizeEmail, passwordError, slugError, normalizeSlug, workspaceNameError,
} from "../_shared/signup-rules.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "Designakum <noreply@designakum.site>";
const SITE_URL = Deno.env.get("SIGNUP_SITE_URL") ?? "https://designakum.site";

// A resend throttle that needs no table: the timestamp lives in the user's own
// metadata. Not a substitute for platform rate limiting, but it stops the
// obvious "hold down the resend button" case from turning our Resend quota into
// somebody's inbox flood.
const RESEND_COOLDOWN_MS = 60_000;

// EVERY exit from this function is this response. Kept as one constant so a
// future edit cannot accidentally make one branch distinguishable.
const SAME_ANSWER = { ok: true };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const workspaceName = String(body.workspace_name ?? "").trim();
  const slug = normalizeSlug(body.slug);
  const lang = body.lang === "en" ? "en" : "ar";
  // The plan they clicked on the marketing site, on its way to being
  // remembered. Shape-checked and nothing more: this function cannot see
  // lib/billing-plans.js (different runtime, deployed separately), and
  // guessing at the catalogue here would put a second list of plan codes in
  // the project. billing-checkout resolves it against `provider_plans` when
  // it matters, and answers `plan_not_available` if it has gone stale.
  //
  // Absent or malformed is not an error. It is a preference, not part of the
  // submission — refusing a signup over it would turn a cosmetic problem
  // into a lost account.
  const plan = planCodeShape(body.plan);

  // Validation errors ARE returned plainly. They describe the submission, not
  // whether an account exists, so they leak nothing — and hiding them would
  // leave the user staring at a form that silently does nothing.
  for (const code of [
    emailError(email), passwordError(password),
    workspaceNameError(workspaceName), slugError(slug),
  ]) {
    if (code) return json({ error: code }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    // Is the slug already taken? Checked here for a useful error, and checked
    // AGAIN in signup-verify where the workspace is actually created — this one
    // is a courtesy, that one is the decision. Two people can pass this check
    // simultaneously; only one can pass the unique constraint.
    const { data: taken } = await admin
      .from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (taken) return json({ error: "slug_taken" }, 409);

    const existing = await findUserByEmail(admin, email);

    if (!existing) {
      // NEW ACCOUNT. Unconfirmed, and carrying the workspace it asked for —
      // signup-verify reads these back rather than trusting a second form post,
      // so the workspace that gets created is the one that was verified.
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: {
          pending_workspace_name: workspaceName,
          pending_slug: slug,
          lang,
          ...(plan ? { pending_plan: plan } : {}),
          verification_sent_at: new Date().toISOString(),
        },
      });
      if (error || !created?.user) {
        console.error("[signup-start] createUser failed:", error?.message);
        // Almost certainly a race on the email. Answer as usual: the mailbox
        // owner, if any, gets told what happened.
        return json(SAME_ANSWER);
      }
      await sendVerification(created.user.id, email, lang);
      return json(SAME_ANSWER);
    }

    if (existing.email_confirmed_at) {
      // ALREADY REGISTERED. Nothing is created and no verification link is
      // issued — a confirmed account must never be re-verifiable by a stranger
      // who knows the address. They get a "sign in instead" mail.
      await sendAlreadyRegistered(email, lang);
      return json(SAME_ANSWER);
    }

    // UNCONFIRMED, TRYING AGAIN. Resend, throttled. Deliberately does NOT
    // update the password: an attacker who knows an unverified address must not
    // be able to overwrite the real owner's credentials before they confirm.
    const lastSent = Date.parse(String(existing.user_metadata?.verification_sent_at ?? ""));
    if (Number.isFinite(lastSent) && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
      return json(SAME_ANSWER);
    }
    await admin.auth.admin.updateUserById(existing.id, {
      // Spread the existing object — HANDOFF §9: a replace here would drop the
      // pending workspace and leave verification with nothing to create.
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        // Only when this attempt named one, so returning without a `?plan=`
        // keeps whatever the first attempt chose rather than erasing it.
        ...(plan ? { pending_plan: plan } : {}),
        verification_sent_at: new Date().toISOString(),
      },
    });
    await sendVerification(existing.id, email, lang);
    return json(SAME_ANSWER);
  } catch (err) {
    // Even an unexpected failure answers the same way. The alternative is an
    // error shape that differs by branch, which is the enumeration channel this
    // endpoint exists to close.
    console.error("[signup-start] unexpected:", err);
    return json(SAME_ANSWER);
  }
});

// deno-lint-ignore no-explicit-any
async function findUserByEmail(admin: any, email: string) {
  // listUsers is paginated and there is no getUserByEmail in this SDK version.
  // The filter is applied server-side by GoTrue.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1, email });
  if (error) throw new Error(`user_lookup_failed: ${error.message}`);
  const user = data?.users?.find((u: { email?: string }) => (u.email ?? "").toLowerCase() === email);
  return user ?? null;
}

/**
 * A plan code that is safe to store and to echo back into a URL.
 *
 * Shape only — see where it is called for why this deliberately does not
 * know the catalogue. Mirrors `isPlanCodeShape` in lib/signup-intent.js;
 * they cannot import one another across the runtime boundary, so the rule
 * is written twice and the comment on each points at the other.
 */
function planCodeShape(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(code) ? code : null;
}

async function sendVerification(userId: string, email: string, lang: string) {
  const token = await signVerificationToken(userId);
  const url = `${SITE_URL}/signup/verify?t=${encodeURIComponent(token)}&lang=${lang}`;
  const ar = lang === "ar";
  await sendMail(
    email,
    ar ? "تأكيد بريدك الإلكتروني — ديزاينكم" : "Confirm your email — Designakum",
    ar
      ? `<div dir="rtl" style="font-family:system-ui,sans-serif;line-height:1.8">
           <h2>مرحبًا بك في ديزاينكم</h2>
           <p>اضغط الزر لتأكيد بريدك وإكمال إنشاء حسابك. الرابط صالح لمدة 24 ساعة.</p>
           <p><a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f6ef2;color:#fff;border-radius:12px;text-decoration:none">تأكيد البريد</a></p>
           <p style="font-size:12px;color:#666">إن لم تطلب هذا الحساب، تجاهل هذه الرسالة ولن يحدث شيء.</p>
         </div>`
      : `<div style="font-family:system-ui,sans-serif;line-height:1.8">
           <h2>Welcome to Designakum</h2>
           <p>Confirm your email to finish creating your account. This link works for 24 hours.</p>
           <p><a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f6ef2;color:#fff;border-radius:12px;text-decoration:none">Confirm email</a></p>
           <p style="font-size:12px;color:#666">If you did not request this account, ignore this email and nothing happens.</p>
         </div>`,
  );
}

async function sendAlreadyRegistered(email: string, lang: string) {
  const ar = lang === "ar";
  await sendMail(
    email,
    ar ? "لديك حساب بالفعل — ديزاينكم" : "You already have an account — Designakum",
    ar
      ? `<div dir="rtl" style="font-family:system-ui,sans-serif;line-height:1.8">
           <p>حاول أحدهم إنشاء حساب بهذا البريد، ولديك حساب بالفعل.</p>
           <p><a href="${SITE_URL}/admin">تسجيل الدخول</a> — أو استخدم "نسيت كلمة المرور" إن لزم.</p>
           <p style="font-size:12px;color:#666">لم يتغيّر شيء في حسابك.</p>
         </div>`
      : `<div style="font-family:system-ui,sans-serif;line-height:1.8">
           <p>Someone tried to sign up with this address, and you already have an account.</p>
           <p><a href="${SITE_URL}/admin">Sign in</a> — or use "forgot password" if you need to.</p>
           <p style="font-size:12px;color:#666">Nothing about your account has changed.</p>
         </div>`,
  );
}

// Email is an OPTIMISATION, not a dependency — the same rule invite-client
// follows (HANDOFF §7). A send failure is logged and swallowed: the account
// already exists and the person can ask for another link. Failing the request
// would tell the caller something went wrong for THIS address, which is also a
// small enumeration signal.
async function sendMail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("[signup-start] RESEND_API_KEY unset — no verification mail sent");
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
    if (!res.ok) console.error("[signup-start] resend failed:", res.status, await res.text());
  } catch (err) {
    console.error("[signup-start] resend threw:", err);
  }
}
