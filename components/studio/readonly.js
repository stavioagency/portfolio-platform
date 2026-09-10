// The read-only notice.
//
// ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────
// Production RLS says: reads are `is_tenant_admin`, writes are
// `can_edit_tenant` = owner OR (tenant admin AND an active subscription). So a
// customer without a subscription can open every screen in the Studio and
// cannot save a single field.
//
// Without this notice that behaves as follows: they type, autosave fires, the
// database silently changes zero rows, and lib/studio-data raises the blocked-
// write error — once per field, forever. The screen would be a working editor
// that rejects every keystroke, which is the worst possible way to tell someone
// they need to pay.
//
// So the Studio asks ONCE, up front, and says so plainly.
//
// ── THIS IS A REPORT, NOT A GATE ─────────────────────────────────────────
// The database is the authority and refuses the write on its own. Making the
// fields read-only here is a courtesy that stops a customer typing a paragraph
// they are about to lose — nothing more. If the entitlement answer is unknown
// the notice does not appear, because a paywall shown on a failed lookup is a
// paywall shown to someone who has already paid.
//
// ── IT DISAPPEARS BY ITSELF IF THE RULE CHANGES ──────────────────────────
// The product direction says free users should be able to edit and merely not
// publish. That is a change to can_edit_tenant, not to this file: the day writes
// stop requiring a subscription, `canEdit` is true for everyone and none of this
// renders. Nothing here needs unwinding.

export function ReadOnlyNotice({ ar }) {
  return (
    <div className="ro" role="status">
      <p className="what">
        {ar ? 'يمكنك التصفّح، ولا يمكنك الحفظ بعد.' : 'You can look around. You cannot save yet.'}
      </p>
      <p className="why">
        {ar
          ? 'تحرير المعرض يحتاج اشتراكًا نشطًا. كل ما هو مكتوب محفوظ كما هو.'
          : 'Editing your portfolio needs an active subscription. Everything already written is safe.'}
      </p>
      <a href="/subscribe">{ar ? 'الاشتراك' : 'Subscribe'}</a>
      <style jsx>{`
        .ro {
          margin-bottom: var(--space-5);
          padding: var(--space-3) var(--space-4);
          border: 1px solid var(--warning-border);
          border-radius: var(--radius-md);
          background: var(--warning-bg);
        }
        .what { margin: 0 0 4px; font-size: var(--text-sm); font-weight: 600; color: var(--warning-ink); }
        .why { margin: 0 0 var(--space-3); font-size: var(--text-xs); color: var(--warning-ink);
               line-height: 1.7; opacity: 0.9; }
        a { display: inline-flex; align-items: center; min-height: 38px; padding: 0 var(--space-4);
            border-radius: var(--radius-sm); background: var(--action-primary-bg);
            color: var(--action-primary-fg); text-decoration: none;
            font-size: var(--text-sm); font-weight: 700; }
        a:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
      `}</style>
    </div>
  );
}

/* A workspace whose profile row is missing entirely.
   Different from "not entitled" and different from "empty": signup creates an
   empty row, so its ABSENCE means something went wrong at signup rather than
   that the customer has not started. Saying "blocked write" here would send
   them to buy a subscription that would not fix it. */
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
