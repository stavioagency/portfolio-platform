// lib/studio-publish.js
// -----------------------------------------------------------------------------
// Publishing, and the reasons publishing is not available yet.
//
// ── THE GATE IS THE DATABASE'S, AND STAYS THERE ──────────────────────────
// publish_tenant() checks can_edit_tenant() itself and raises 42501 when the
// workspace is not entitled. Nothing in this file may become a second opinion
// about that: hiding the button is a courtesy, not a control, and a product
// that relies on a hidden button has no gate at all.
//
// What this file adds is the ANSWER TO "WHY NOT". A disabled Publish button
// with no explanation is the complaint the old sidebar earned — it looked the
// same whether there was something to publish or not, so the honest reading was
// "I have no idea whether my changes are live".
//
// ── TWO DIFFERENT REFUSALS, NEVER CONFLATED ──────────────────────────────
//   NOT READY   the portfolio is missing something a visitor needs. The
//               customer can fix this themselves, and each item says how.
//   NOT PAID    the portfolio is finished but the workspace cannot publish.
//               Nothing the customer writes will change it.
// Showing a payment wall to someone who has not written their name yet, or a
// checklist to someone who has finished and simply has not paid, sends them to
// work on the wrong thing.
//
// The requirement list itself lives in lib/publish-requirements.js — pure, and
// therefore testable without a database client.

import { supabase } from './supabase';

/* Whether the draft differs from what visitors currently see.
   Answered by the database, which serialises the draft and compares BYTES
   against the published snapshot (section-x) — not by a timestamp, because
   profile.updated_at moves when someone opens a field and closes it again, and
   `projects` has no updated_at at all, so a reordered or deleted piece would be
   invisible to that test.

   Returns null on failure rather than false: "no pending changes" is a claim,
   and a failed check has not earned it. */
export async function hasUnpublishedChanges(tenantId) {
  if (!tenantId) return null;
  try {
    const { data, error } = await supabase.rpc('has_unpublished_changes', { tid: tenantId });
    if (error) return null;
    return data === true;
  } catch (e) { return null; }
}

/* Whether the workspace is entitled to publish at all.
   Used ONLY to explain the refusal in advance. publish_tenant() decides. */
export async function isEntitled(tenantId) {
  if (!tenantId) return null;
  try {
    const { data, error } = await supabase.rpc('tenant_has_active_subscription', { tid: tenantId });
    if (error) return null;
    return data === true;
  } catch (e) { return null; }
}

/* Publish. Returns { ok, at } or { ok: false, reason, message }.
 *
 * The error codes are the database's own and are mapped here rather than shown
 * raw: '42501' is the entitlement refusal and 'P0002' means there is no profile
 * row to serialise, which is a different problem with a different fix. */
export async function publish(tenantId, ar) {
  if (!tenantId) return { ok: false, reason: 'no-tenant', message: ar ? 'لا يوجد معرض.' : 'No portfolio.' };
  try {
    const { data, error } = await supabase.rpc('publish_tenant', { tid: tenantId });
    if (error) {
      if (error.code === '42501') {
        return {
          ok: false,
          reason: 'not-entitled',
          message: ar
            ? 'النشر يحتاج اشتراكًا نشطًا. لم يتغيّر شيء في معرضك.'
            : 'Publishing needs an active subscription. Nothing in your portfolio has changed.',
        };
      }
      if (error.code === 'P0002') {
        return {
          ok: false,
          reason: 'no-profile',
          message: ar
            ? 'لا يوجد ما يُنشر بعد — المعلومات الأساسية ناقصة.'
            : 'There is nothing to publish yet. Add your details first.',
        };
      }
      return { ok: false, reason: 'failed', message: error.message || String(error) };
    }
    return { ok: true, at: data || null };
  } catch (e) {
    return { ok: false, reason: 'failed', message: e?.message || String(e) };
  }
}

/* THERE IS NO UNPUBLISH, AND THAT IS NOT AN OVERSIGHT.
   Nothing in the database removes a published snapshot, and adding one would be
   a new destructive operation on live customer content — a different decision,
   with its own failure modes, that this phase has no mandate to make. A
   portfolio goes offline when the subscription lapses, which is the mechanism
   that already exists and is already tested. Recorded here so the absence reads
   as a decision rather than as something forgotten. */
export const UNPUBLISH_SUPPORTED = false;
