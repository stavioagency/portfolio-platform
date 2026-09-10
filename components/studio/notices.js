// Notices the Studio shows above whichever screen is open.
//
// ── THE PAYWALL USED TO LIVE HERE, AND DOES NOT ANY MORE ─────────────────
// Until section-z, writing to profile/projects required a subscription, so an
// unpaid customer could open every screen and save nothing. This file carried a
// notice explaining that.
//
// Section-z split the predicate: can_draft_tenant() governs the draft and needs
// only membership, while can_edit_tenant() still gates publishing. A customer
// now BUILDS for free and PAYS to publish, which is what the product always
// meant to say. The paywall moved to the one place it belongs — the publish
// panel — and the notice went with it.
//
// The removal is recorded rather than silent, because "why is there no
// read-only mode?" is a reasonable question to ask of an editor whose product
// has a paywall in it.

/* A workspace whose profile row is missing entirely.
 *
 * Different from empty and different from unpaid: signup creates an empty row,
 * so its ABSENCE means something went wrong at signup rather than that the
 * customer has not started. It is worth its own message because the obvious
 * reading — "blocked write, go and subscribe" — would send them to buy
 * something that cannot fix it. */
export function NoProfileNotice({ ar }) {
  return (
    <div className="np" role="alert">
      <p className="what">{ar ? 'هذا الحساب ناقص إعداد.' : 'This account is missing its setup.'}</p>
      <p className="why">
        {ar
          ? 'لم يُنشأ سجلّ المعرض عند التسجيل. لا يمكن الحفظ حتى يُصلَح، ولن يحلّ الاشتراك المشكلة.'
          : 'The portfolio record was not created at signup. Saving cannot work until that is fixed, and a subscription will not fix it.'}
      </p>
      <style jsx>{`
        .np { margin-bottom: var(--space-5); padding: var(--space-3) var(--space-4);
              border: 1px solid var(--danger-border); border-radius: var(--radius-md);
              background: var(--danger-bg); }
        .what { margin: 0 0 4px; font-size: var(--text-sm); font-weight: 600; color: var(--danger-ink); }
        .why { margin: 0; font-size: var(--text-xs); color: var(--danger-ink); line-height: 1.7; opacity: 0.9; }
      `}</style>
    </div>
  );
}
