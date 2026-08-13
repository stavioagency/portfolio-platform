// find-user.ts — look up an auth user BY EMAIL, correctly.
//
// WHY THIS EXISTS
// ---------------
// `admin.auth.admin.listUsers({ page, perPage, email })` does NOT filter by
// email. Three functions in this repo believed it did, and carried a comment
// saying "the filter is applied server-side by GoTrue". It is not. Read the
// SDK (@supabase/auth-js, GoTrueAdminApi.listUsers): the request it builds is
//
//     GET /admin/users?page=<page>&per_page=<perPage>
//
// and nothing else. Any other property of the params object — `email` very
// much included — is dropped on the floor before the request is made. There is
// no error, no warning, and no empty result: the call succeeds and returns
// whatever page you asked for.
//
// Combined with `perPage: 1` that produced the worst possible shape of bug.
// The call returned exactly ONE user — the newest account in the project — and
// the caller then re-checked the address against it and concluded "no such
// account" for all 24 others. Password reset worked for precisely one person
// in the system, and only until somebody else signed up. It is written up in
// docs/architecture/auth.md §7.
//
// The test suite did not catch it because tests/helpers/fake-supabase.mjs
// implemented the filter that the real SDK lacks — the fake was more capable
// than the thing it stood in for, so a broken function passed. That fake now
// models the real behaviour (page/per_page honoured, `email` ignored), which
// is what makes this module's tests meaningful.
//
// SHARED, like reset-token.ts and unlike the email templates.
// The templates are duplicated per function on a deploy-order argument: drift
// there makes a message look wrong and somebody notices. Drift here means an
// account cannot be found, silently, on whichever function was left behind —
// exactly the failure this file exists to remove. One implementation, and
// deploy every function that imports it when it changes.

/** How many users to pull per request. Comfortably above the project's size
 *  (25 accounts at the time of writing) so the common case is a single call,
 *  and well within what GoTrue will return in one page. */
const PER_PAGE = 200;

/** Hard cap on pages walked, so a runaway cannot spin forever. 50 × 200 =
 *  10,000 accounts, far past anything this platform will see before someone
 *  revisits this file. */
const MAX_PAGES = 50;

/**
 * The auth user with this email address, or null.
 *
 * `email` is expected already normalised (trimmed, lowercased) — every caller
 * runs it through normalizeEmail() first. The comparison is done here anyway,
 * lowercased on both sides, because this function's contract is "the user with
 * this address" and it must not depend on the caller having been careful.
 *
 * Walks pages until it finds a match or runs out. It stops early on a hit,
 * which means a lookup that MISSES costs more requests than one that hits.
 * That is a timing signal in principle; it is not a usable enumeration oracle
 * here — a single page covers the whole project today, so both paths make
 * exactly one request, and network variance dwarfs the difference long before
 * the account count would make it measurable. Revisit if this ever pages for
 * real.
 */
// deno-lint-ignore no-explicit-any
export async function findUserByEmail(admin: any, email: unknown): Promise<any | null> {
  const target = String(email ?? "").trim().toLowerCase();
  if (!target) return null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    // Surfaced, never swallowed. A caller that cannot tell "no such user" from
    // "the lookup failed" is how this class of bug survives: request-password-
    // reset in particular must treat a failed lookup as an error it logs, not
    // as an absent account it silently ignores.
    if (error) throw new Error(`user_lookup_failed: ${error.message}`);

    const batch = data?.users ?? [];
    const hit = batch.find(
      (u: { email?: string }) => (u.email ?? "").toLowerCase() === target,
    );
    if (hit) return hit;

    // A short page is the last page.
    if (batch.length < PER_PAGE) return null;
  }
  return null;
}

/**
 * Every auth user, paged.
 *
 * For the callers that genuinely need the whole set rather than one address.
 * Same cap and the same reasoning as above; a bare `listUsers()` returns only
 * the first 50 accounts, which is a silent correctness bug in anything that
 * treats the result as complete.
 */
// deno-lint-ignore no-explicit-any
export async function listAllUsers(admin: any): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`user_lookup_failed: ${error.message}`);
    const batch = data?.users ?? [];
    out.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return out;
}
