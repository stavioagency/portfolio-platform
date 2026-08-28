// expiry-notices — warns a client before their free access runs out.
//
// Runs once a day, called by pg_cron (section-w). It is the ONE thing in this
// system that needs a scheduler: the expiry itself needs none, because
// tenant_has_active_subscription() compares the deadline to now() on every
// read. Sending an email is the only part a database cannot do by being read.
//
// IT MAKES NO DECISIONS ABOUT WHO IS DUE. comps_needing_notice() answers that,
// so "when do we warn" is one SQL function and is checkable with a select
// rather than by reading Deno. This sends what it is handed and records what it
// sent.
//
// IDEMPOTENT, AND THE ORDER MATTERS. The notice row is written BEFORE the mail
// goes out, and a failed send deletes it again. Writing after would mean a
// crash between the two sends the same warning every day until someone notices;
// writing before, with a rollback, means the worst case is a warning that is
// never sent — which is the quieter failure, and the console still shows the
// client as ending soon.
//
// Deployed WITHOUT the JWT gateway check — the caller is pg_cron inside the
// database, which has no user session:
//     supabase functions deploy expiry-notices --no-verify-jwt
// It is protected by a shared secret instead (CRON_SECRET), because the URL is
// otherwise open to the internet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "Designakum <no-reply@designakum.site>";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SITE = Deno.env.get("PUBLIC_SITE_URL") ?? "https://designakum.site";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Arabic, and no verb aimed at a person: this product collects no gender and
// «جدّد» would pick one. State the fact and name the place, the same rule
// docs/design/design.md §11 applies to every other string a client reads.
function body(days: number, slug: string) {
  const when = days <= 1 ? "غدًا" : `خلال ${days} أيام`;
  return {
    subject: days <= 1 ? "وصولك المجاني ينتهي غدًا" : `وصولك المجاني ينتهي خلال ${days} أيام`,
    html: `
      <div dir="rtl" style="font-family:Tajawal,system-ui,sans-serif;font-size:15px;line-height:1.8;color:#111">
        <p>الوصول المجاني لموقعك ينتهي <strong>${when}</strong>.</p>
        <p>بعد ذلك يتوقف ظهور الموقع للزوار، ويبقى كل المحتوى كما هو في لوحة التحكم.</p>
        <p><a href="${SITE}/admin" style="color:#2A6BCE">لوحة التحكم</a> &nbsp;·&nbsp;
           <a href="${SITE}/${slug}" style="color:#2A6BCE">${SITE}/${slug}</a></p>
      </div>`.trim(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // The only gate. Without it this endpoint would let anyone on the internet
  // burn a client's one warning by triggering the send early.
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: due, error } = await admin.rpc("comps_needing_notice");
  if (error) return json({ error: "query_failed", detail: error.message }, 500);
  if (!due || due.length === 0) return json({ ok: true, sent: 0, considered: 0 });

  let sent = 0;
  const failures: string[] = [];

  for (const row of due) {
    // Claim it first. A unique violation here means another run already has it.
    const { error: claimErr } = await admin.from("comp_expiry_notices").insert({
      tenant_id: row.tenant_id, kind: row.kind, period_end: row.period_end,
    });
    if (claimErr) continue; // 23505, or a real fault — either way, do not send

    // Who to write to. The membership carries the login, and a workspace with
    // no login attached simply has nobody to warn.
    const { data: members } = await admin
      .from("tenant_admins").select("user_id").eq("tenant_id", row.tenant_id).limit(1);
    const userId = members?.[0]?.user_id;
    let email = "";
    if (userId) {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      email = u?.user?.email ?? "";
    }

    const rollback = async (why: string) => {
      failures.push(`${row.slug}: ${why}`);
      await admin.from("comp_expiry_notices").delete()
        .eq("tenant_id", row.tenant_id).eq("kind", row.kind).eq("period_end", row.period_end);
    };

    if (!email) { await rollback("no address"); continue; }
    if (!RESEND_API_KEY) { await rollback("RESEND_API_KEY unset"); continue; }

    const mail = body(row.days_left, row.slug);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: MAIL_FROM, to: [email], subject: mail.subject, html: mail.html }),
      });
      if (!res.ok) { await rollback(`resend ${res.status}`); continue; }
      sent++;
    } catch (err) {
      await rollback(String((err as Error).message));
    }
  }

  console.log(`[expiry-notices] considered=${due.length} sent=${sent} failed=${failures.length}`);
  return json({ ok: true, considered: due.length, sent, failures });
});
