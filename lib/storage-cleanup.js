// Removing a deleted workspace's files from the `media` bucket.
//
// THE PROBLEM THIS EXISTS FOR
// ---------------------------
// The delete used to be one `list(prefix, { limit: 1000 })` followed by one
// `remove()`. Storage list calls are PAGED, so that is not "delete the folder",
// it is "delete the first page of the folder" — a workspace with more than 1000
// objects kept everything past the first page, permanently, with nothing left
// pointing at the files. Nobody would ever see them again to clean them up by
// hand, because the tenant row that named the prefix is gone.
//
// It also discarded the list error. `const { data: files }` with no `error`
// binding means an RLS refusal and an empty folder were the same outcome:
// silence.
//
// A tenant's media is FLAT — `t-<id>/<file>`, from tenantStoragePath() — so
// there are no sub-prefixes to recurse into. This pages; it does not walk a
// tree, and it would need to change if uploads ever gained a subfolder.
//
// Pure except for the two calls it is handed, so the paging is testable without
// a network or a Supabase client. pages/admin.js passes
// `supabase.storage.from('media')`.

// Per request. The storage API caps a page and silently returns fewer rows than
// asked for, which is exactly why the caller must page rather than trust one
// large limit.
export const PAGE_SIZE = 100;

// A workspace with more than this many files stops the loop rather than running
// forever. 1000 passes is 100k objects — far past any real portfolio, and the
// point is only that a `remove` that reports success without deleting anything
// cannot spin here indefinitely.
export const MAX_PASSES = 1000;

/**
 * Delete every object under `t-<tenantId>/`, a page at a time.
 *
 * Returns `{ removed, passes, error }`. It does NOT throw: the tenant row is
 * already gone by the time this runs, so a storage failure leaves unreachable
 * files rather than a broken workspace, and must never surface to the owner as
 * a failed delete. The caller logs `error`; it is returned rather than
 * swallowed so that "nothing to delete" and "could not delete" stay
 * distinguishable — the same distinction the billing gate makes.
 *
 * ALWAYS LISTS FROM OFFSET 0. Paging with a moving offset over a collection
 * being deleted from skips rows: remove the first 100 and the old offset 100
 * is now offset 0. Each pass therefore re-reads the head of the folder, which
 * is correct precisely because the previous pass emptied it.
 */
export async function deleteTenantStorage(bucket, tenantId) {
  if (!bucket || !tenantId) return { removed: 0, passes: 0, error: null };
  const prefix = `t-${tenantId}`;
  let removed = 0;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { data: files, error: listErr } = await bucket.list(prefix, {
      limit: PAGE_SIZE,
      offset: 0,
    });
    if (listErr) return { removed, passes: pass, error: listErr };
    if (!files || files.length === 0) return { removed, passes: pass, error: null };

    const { error: rmErr } = await bucket.remove(files.map((f) => `${prefix}/${f.name}`));
    // Stop on the first refusal. Retrying the same page would list it again,
    // fail again, and never terminate — MAX_PASSES would be the only thing
    // ending it, after a thousand round trips.
    if (rmErr) return { removed, passes: pass + 1, error: rmErr };
    removed += files.length;
  }

  return {
    removed,
    passes: MAX_PASSES,
    error: new Error(`storage_cleanup_incomplete: more than ${MAX_PASSES * PAGE_SIZE} objects under ${prefix}`),
  };
}
