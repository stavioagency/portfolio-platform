// Who a workspace deletion strands, and what to say about it afterwards.
//
// THE PROBLEM THIS EXISTS FOR
// ---------------------------
// Deleting a workspace cascades every table that references `tenants` —
// including `tenant_admins` — but it never touches `auth.users`. The account
// survives holding an email that `users_email_partial_key` (UNIQUE on email)
// then refuses to hand to anybody else, forever. That is how six accounts,
// including the owner's own address, ended up unreusable.
//
// `client-recovery`'s `release_account` already fixes ONE such account: it parks
// the address on an unroutable .invalid domain, keeps the original in
// `released_email`, and drops the username row. It has always been reachable
// only by hand, from "Unattached logins", AFTER someone noticed. These helpers
// let pages/admin.js make the same call automatically at the one moment the
// stranding is certain — the delete it just performed.
//
// Nothing here talks to Supabase. The decision of WHOSE address may be freed is
// the part worth testing, so it lives apart from the call that acts on it.

/**
 * The accounts that a delete of `tenantId` would leave with no workspace at all.
 *
 * `members` is `list_workspace_members()` — every workspace/account pairing the
 * owner can see, platform owners excluded by the RPC itself. Anyone appearing
 * against a DIFFERENT workspace is left out: they still have somewhere to sign
 * in to, and parking their address would lock them out of a site they are
 * using. That is the same refusal `release_account` makes server-side
 * (`still_has_workspace`, 409) — this is the client half of it, and the point
 * of having both is that the address is never even offered up for a live
 * client.
 *
 * Must be called BEFORE the delete. Afterwards the membership rows are gone and
 * this function's input no longer mentions the workspace at all.
 */
export function strandedByDeleting(members, tenantId) {
  const doomedTenant = String(tenantId ?? '');
  if (!doomedTenant) return [];

  const here = new Set();
  const elsewhere = new Set();
  for (const m of members || []) {
    const userId = m?.user_id ? String(m.user_id) : '';
    if (!userId) continue;
    if (String(m.tenant_id ?? '') === doomedTenant) here.add(userId);
    else elsewhere.add(userId);
  }
  return [...here].filter((userId) => !elsewhere.has(userId));
}

/**
 * Sort the release attempts into what happened.
 *
 * `still_has_workspace` is NOT a failure. strandedByDeleting has already
 * excluded those, so seeing one means a membership was created between the read
 * and the release — in which case refusing is the right answer and the address
 * is correctly still theirs.
 */
export function releaseReport(results) {
  const freed = [];
  const kept = [];
  const failed = [];
  for (const r of results || []) {
    if (r?.ok) freed.push(r.user_id);
    else if (r?.code === 'still_has_workspace') kept.push(r.user_id);
    else failed.push(r.user_id);
  }
  return { freed, kept, failed };
}

/**
 * The one line the owner reads when the delete finishes.
 *
 * A failed release is reported plainly rather than swallowed: the workspace IS
 * gone either way, and the difference the owner cares about is whether they can
 * reuse that address now or have to go and free it by hand. Naming the screen
 * that does it turns a dead end into a next step — the same choice the invite
 * screen's "taken address" message already makes.
 */
export function releaseMessage(report, ar) {
  const deleted = ar ? 'تم حذف المساحة' : 'Workspace deleted';
  if (report?.failed?.length) {
    return ar
      ? `${deleted} — لكن بريد الحساب ما زال محجوزًا. حرّره من «حسابات بلا مساحة».`
      : `${deleted} — but the login still holds its email. Free it under "Unattached logins".`;
  }
  if (report?.freed?.length) {
    return ar
      ? `${deleted}، وأصبح بريده متاحًا من جديد`
      : `${deleted}, and its email is free to use again`;
  }
  // Nothing to free: an empty workspace, or a client who belongs elsewhere too.
  return deleted;
}
