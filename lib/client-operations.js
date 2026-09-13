// lib/client-operations.js
// -----------------------------------------------------------------------------
// The owner's operations on a customer, as data rather than as code in a page.
//
// ── WHY THESE ARE DESCRIPTORS AND NOT FUNCTIONS THAT CALL SUPABASE ───────
// Every one of these is irreversible or close to it: a password reset emails a
// real person, a revoke takes a live portfolio offline, a delete removes a
// workspace and its login. The thing that can go wrong is not the network call
// — the Edge Functions have been doing these correctly from /console for
// months — it is CALLING THE RIGHT FUNCTION ON THE WRONG ROW.
//
// That is exactly what tests/client-console.test.mjs was written to prevent,
// and its comment says so: "duplicating them into an unproven screen is how one
// gets done twice, or to the wrong row." A second copy of these bodies in a
// second page is that duplication. So the body-building is here, it is pure,
// and a test can assert that each operation names the row it was handed and
// nothing else.
//
// No Supabase, no React. A caller passes a row, gets back { fn, body }, and
// invokes it. The Edge Function re-checks ownership on its own and does not
// trust any of this — a delete must not trust the browser.

/* The three Edge Functions these map onto. Named once so a typo is a build-time
   import error somewhere rather than a silent no-op at 2am. */
export const FN_RECOVERY = 'client-recovery';
export const FN_BILLING = 'billing-subscription';
export const FN_DELETE = 'delete-client';

/* A grant with no end date. `null` is meaningful to set_comp_period and means
   "remove the end date", which is not the same as zero days. */
export const COMP_FOREVER = null;

/* 'convertible' rather than 'grandfather': a grant made today is meant to
   become a paying subscription. The pre-billing seven are the grandfathered
   ones and nothing here should be able to create another. */
export const COMP_KIND = 'convertible';

function memberId(row) {
  return row && row.member && row.member.user_id ? row.member.user_id : null;
}

/* Password reset — emails the customer a link.
   Returns null when the workspace has no login attached, because there is
   nobody to send to. A caller that skipped this check would invoke the function
   with user_id undefined, and "undefined" is not obviously nobody. */
export function resetPasswordCall(row) {
  const uid = memberId(row);
  if (!row || !row.id || !uid) return null;
  return { fn: FN_RECOVERY, body: { action: 'send_welcome', tenant_id: row.id, user_id: uid } };
}

/* Change the address a customer signs in with.
   The email is NOT validated here beyond being non-empty: the function owns
   that rule, and a second opinion in the browser is a rule that can disagree. */
export function changeEmailCall(row, email) {
  const uid = memberId(row);
  const next = String(email || '').trim();
  if (!uid || !next) return null;
  return { fn: FN_RECOVERY, body: { action: 'update_email', user_id: uid, email: next } };
}

/* Free access. `days` null means no end date. */
export function grantFreeCall(row, days = 30) {
  if (!row || !row.id) return null;
  return {
    fn: FN_BILLING,
    body: { action: 'grant_comp', tenant_id: row.id, comp_kind: COMP_KIND, days },
  };
}

/* Renewal. Extending ADDS TO WHAT IS LEFT rather than to today, which is the
   function's behaviour and is worth stating: renewing a customer who still has
   twelve days must not quietly take those twelve away. */
export function setCompPeriodCall(row, days) {
  if (!row || !row.id) return null;
  return { fn: FN_BILLING, body: { action: 'set_comp_period', tenant_id: row.id, days } };
}

/* Revoke — the portfolio goes offline for visitors. The content is untouched. */
export function revokeFreeCall(row) {
  if (!row || !row.id) return null;
  return { fn: FN_BILLING, body: { action: 'cancel', tenant_id: row.id } };
}

/* Delete a workspace and its login.

   THE TYPED SLUG IS PASSED THROUGH RATHER THAN COMPARED HERE, and that is the
   single most important line in this file. The Edge Function compares
   confirm_slug against the tenant's OWN slug server-side. So if a UI bug ever
   hands this the wrong row, the typed slug will not match that row's slug and
   the delete is refused by the database — the wrong-row delete is impossible to
   complete even with a broken screen.

   Checking the match here as well would feel safer and would be worse: a
   browser-side check that passes is not evidence, and if this file ever became
   the only check, a wrong row plus a right-looking slug would go through. */
export function deleteClientCall(row, typedSlug, { force = false } = {}) {
  const typed = String(typedSlug || '').trim();
  if (!row || !row.id || !typed) return null;
  return {
    fn: FN_DELETE,
    body: { tenant_id: row.id, confirm_slug: typed, ...(force ? { force: true } : {}) },
  };
}

/* Whether the operator's typed confirmation matches the row they are looking
   at. This gates the BUTTON — it decides whether to attempt at all — and is
   deliberately separate from the call above, which always passes the typed
   value through for the server to judge. */
export function slugConfirmed(row, typed) {
  if (!row || !row.slug) return false;
  return String(typed || '').trim().toLowerCase() === String(row.slug).toLowerCase();
}

/* What each operation is, for a screen that has to describe it before doing it.

   `destructive` drives the confirmation tone. `irreversible` is narrower and
   means there is no undo at all — a revoked grant can be re-granted and an
   email can be changed back, but a deleted workspace is gone and a password
   reset email cannot be recalled. */
export const OPERATIONS = {
  reset_password: {
    id: 'reset_password',
    destructive: true,
    irreversible: true,      // the email is sent the moment this succeeds
    needsMember: true,
    label: { ar: 'إرسال رابط كلمة مرور', en: 'Send password link' },
  },
  change_email: {
    id: 'change_email',
    destructive: true,
    irreversible: false,
    needsMember: true,
    label: { ar: 'تغيير البريد', en: 'Change email' },
  },
  grant_free: {
    id: 'grant_free',
    destructive: false,
    irreversible: false,
    needsMember: false,
    label: { ar: 'منح وصول مجاني', en: 'Grant free access' },
  },
  set_period: {
    id: 'set_period',
    destructive: false,
    irreversible: false,
    needsMember: false,
    label: { ar: 'تعديل المدّة', en: 'Change period' },
  },
  revoke_free: {
    id: 'revoke_free',
    destructive: true,
    irreversible: false,
    needsMember: false,
    label: { ar: 'إلغاء الوصول المجاني', en: 'Revoke free access' },
  },
  delete_client: {
    id: 'delete_client',
    destructive: true,
    irreversible: true,
    needsMember: false,
    needsSlug: true,
    label: { ar: 'حذف العميل', en: 'Delete client' },
  },
};

/* Whether an operation can be offered for this row at all.
   A disabled control that explains itself beats one that fails on click. */
export function canOperate(opId, row) {
  const op = OPERATIONS[opId];
  if (!op || !row || !row.id) return false;
  if (op.needsMember && !memberId(row)) return false;
  return true;
}
