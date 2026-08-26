// billing-errors.js — getting the REAL error out of a Supabase Edge Function
// call, and turning it into something the reader can act on.
//
// WHY THIS FILE EXISTS
// --------------------
// supabase-js does not put a non-2xx response body in `data`. On any error
// status it sets `data` to null and hands back a FunctionsHttpError whose
// message is the same nine words every time:
//
//     "Edge Function returned a non-2xx status code"
//
// The actual body — `{"error":"plan_not_available", ...}` — is only reachable
// through `error.context`, which is the raw Response. So the obvious-looking
//
//     if (error || data?.error) throw new Error(data?.error || error.message)
//
// silently discards every server error code and reports the generic sentence
// instead. That cost a full diagnosis round-trip on a failure the server had
// already named precisely.
//
// pages/admin.js already had this right in one place (resetPassword reads
// `error.context?.json?.()`); this makes it the rule rather than the exception,
// and puts it somewhere testable.

// Pull the server's own error code out of an invoke() result.
// Returns null when the call actually succeeded.
export async function edgeErrorCode(error, data) {
  // Some functions return 200 with an { error } body — check that first,
  // because it is the cheapest and needs no parsing.
  if (data && typeof data === 'object' && data.error) return String(data.error);
  if (!error) return null;

  // The body of a non-2xx lives on the Response in `context`. It can be read
  // only once, and it may not be JSON at all (a platform-level 404 or 502 is
  // HTML or plain text), so every step is guarded.
  try {
    const body = await error.context?.json?.();
    // `detail` carries the PROVIDER's own message — "paypal_400: Value is
    // invalid., shipping_preference". Without it a provider rejection reads as
    // the useless "PayPal refused the operation", and diagnosing it costs a
    // round-trip through logs that never contained the body anyway.
    if (body?.error && body?.detail) return `${body.error}: ${body.detail}`;
    if (body?.error) return String(body.error);
    if (body?.message) return String(body.message);
  } catch (_) {
    // Not JSON, already consumed, or no context. Fall through to the message.
  }
  return String(error.message || 'unknown_error');
}

// A billing error code, as a sentence an OPERATOR can act on. These surface in
// owner tools, where naming the fault and its fix is worth more than a tidy
// reassurance. Anything unrecognised is shown verbatim rather than swallowed.
export function billingActionError(code, lang = 'ar') {
  const ar = lang === 'ar';
  switch (code) {
    case 'plan_not_available':
      return ar
        ? 'الخطط غير مزامنة مع باي بال. اضغط "مزامنة الخطط مع باي بال" أولًا.'
        : 'Plans are not synced to PayPal yet — press "Sync plans to PayPal" first.';
    case 'grant_signing_failed':
      return ar
        ? 'مفتاح BILLING_GRANT_SECRET مفقود أو أقصر من 32 حرفًا في إعدادات Supabase.'
        : 'BILLING_GRANT_SECRET is missing or under 32 characters in the Supabase secrets.';
    case 'invalid_redirect_url':
      return ar
        ? 'النطاق غير مُدرج في BILLING_RETURN_HOSTS.'
        : 'That host is not in BILLING_RETURN_HOSTS.';
    case 'forbidden_not_owner':
      return ar ? 'هذا الإجراء لمالك المنصّة فقط.' : 'That action is for platform owners only.';
    case 'forbidden':
      return ar ? 'لا تملك صلاحية على هذه المساحة.' : 'You do not administer that workspace.';
    case 'not_a_paid_subscription':
      return ar ? 'لا يوجد اشتراك مدفوع على هذه المساحة.' : 'This workspace has no paid subscription.';
    case 'no_subscription':
      return ar ? 'لا يوجد اشتراك على هذه المساحة.' : 'This workspace has no subscription.';
    case 'already_subscribed':
      return ar ? 'هذه المساحة مشتركة بالفعل.' : 'This workspace already has a subscription.';
    // A cancelled subscription cannot be revised at PayPal — cancellation is
    // terminal there — so billing-subscription refuses the plan change rather
    // than forwarding a call that can only fail.
    case 'subscription_is_cancelled':
      return ar
        ? 'هذا الاشتراك ملغى، ولا يمكن تغيير خطته. اشترك من جديد بدلًا من ذلك.'
        : 'That subscription is cancelled, so its plan cannot be changed — subscribe again instead.';
    // The two comp_kind refusals. Both are operator-facing: they can only be
    // reached from the Subscribers screen, so they name the rule rather than
    // apologising.
    case 'invalid_comp_kind':
      return ar
        ? 'قيمة غير صالحة لنوع الوصول الممنوح. المسموح: دائم أو قابل للتحويل.'
        : 'Not a valid granted-access type — it must be permanent or convertible.';
    case 'not_a_comped_subscription':
      return ar
        ? 'هذه المساحة ليست وصولًا ممنوحًا، فلا يوجد نوع منح لتغييره.'
        : 'This workspace does not run on granted access, so there is no grant type to change.';
    // Granting a comp to a workspace that already has a subscription. Operator-
    // facing and almost always benign: a double-click, or a second owner who
    // got there first. It names what is already true rather than reporting a
    // failure, because nothing went wrong.
    case 'already_has_subscription':
      return ar
        ? 'هذه المساحة لديها اشتراك بالفعل، فلا حاجة لمنح وصول مجاني.'
        : 'This workspace already has a subscription, so there is nothing to grant.';
    case 'provider_unreachable':
      return ar ? 'تعذّر الوصول إلى باي بال. يمكن المحاولة مرة أخرى.' : 'PayPal could not be reached — try again.';
    case 'provider_error':
      return ar ? 'رفض باي بال العملية. راجع السجل.' : 'PayPal refused the operation — check the logs.';
    // provider_error arrives with PayPal's own message appended, so the code no
    // longer matches exactly. Show the whole thing: the provider's wording is
    // the most useful text available.
    default:
      if (typeof code === 'string' && code.startsWith('provider_error:')) {
        const detail = code.slice('provider_error:'.length).trim();
        return ar ? `رفض باي بال العملية — ${detail}` : `PayPal refused the operation — ${detail}`;
      }
      return ar
        ? `تعذّر تنفيذ العملية: ${code || 'خطأ غير معروف'}`
        : `The action failed: ${code || 'unknown error'}`;
  }
}
