// lib/storage-sweep.js
// -----------------------------------------------------------------------------
// Finding media nobody references any more, so an operator can reclaim it.
//
// ── THE PROBLEM ──────────────────────────────────────────────────────────
// Deleting a project removes the row and leaves its images in the bucket, and
// replacing an image orphans the old one. /admin has always behaved this way,
// so the bucket accumulates files no page will ever load. It is cost and
// tidiness, not correctness — nothing breaks and no customer sees anything
// wrong — which is exactly why it needs to be deliberate rather than automatic.
//
// ── WHY A SWEEP RATHER THAN A CASCADE ────────────────────────────────────
// A cascade on every delete runs inside the customer's own delete, can fail
// halfway leaving a row without its images, and makes every project delete a
// storage operation that can go wrong. A sweep is run by an operator who can
// read what it found before anything is removed, and a bad sweep is recoverable
// by not confirming it.
//
// ── THE TWO RAILS, WHICH MATTER MORE THAN THE SWEEP ──────────────────────
// 1. A GRACE PERIOD. An image is uploaded to storage BEFORE the row that points
//    at it is saved — see uploadImage() in lib/studio-data.js. So a file that
//    is seconds old and unreferenced is not garbage, it is a customer mid-edit.
//    Sweeping it deletes a picture out from under someone who is still typing.
// 2. AN EMPTINESS REFUSAL. Every path below is parsed out of a stored public
//    URL. If that parsing ever breaks, the reference set comes back empty and
//    EVERY FILE IN THE BUCKET LOOKS ORPHANED. A sweep that deletes everything
//    is not a worse version of this feature, it is the destruction of every
//    customer's images. So a sweep that finds no references at all, while rows
//    exist that should have produced some, refuses to run.
//
// Pure. The listing and the removal belong to the caller; what is testable is
// the decision about which files are garbage, and that is all that is here.

/* An upload has this long to have a row saved against it before the sweep will
   consider it garbage. Generous on purpose: the cost of waiting a day is some
   bytes, and the cost of being wrong is a customer's photograph. */
export const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;

/* Where a public URL stops being a URL and starts being a storage path.
   Supabase serves `/storage/v1/object/public/<bucket>/<path>`. */
const PUBLIC_MARKER = '/storage/v1/object/public/';

/**
 * The storage path inside `bucket` that a stored public URL points at, or null.
 *
 * Returns null for anything it does not recognise rather than guessing. A guess
 * here becomes a path that matches no object, which makes a real file look
 * unreferenced — the failure mode this whole module is built to avoid.
 */
export function pathFromPublicUrl(url, bucket = 'media') {
  if (typeof url !== 'string' || !url) return null;
  const i = url.indexOf(PUBLIC_MARKER);
  if (i === -1) return null;
  let rest = url.slice(i + PUBLIC_MARKER.length);
  // A query string (cache-busting) or fragment is not part of the path.
  rest = rest.split('?')[0].split('#')[0];
  const prefix = `${bucket}/`;
  if (!rest.startsWith(prefix)) return null;
  const path = rest.slice(prefix.length);
  if (!path) return null;
  try { return decodeURIComponent(path); } catch (_) { return path; }
}

/**
 * Every storage path referenced by a tenant's rows.
 *
 * Takes the rows rather than reading them, so the caller owns the query and
 * this stays testable. `profiles` is a list because a sweep may cover more than
 * one workspace; a single profile object is accepted too.
 */
export function referencedPaths({ profiles = [], projects = [] } = {}, bucket = 'media') {
  const out = new Set();
  const add = (url) => {
    const p = pathFromPublicUrl(url, bucket);
    if (p) out.add(p);
  };

  const profileList = Array.isArray(profiles) ? profiles : [profiles];
  for (const p of profileList) {
    if (!p) continue;
    add(p.profile_image);
    // Read defensively: a column added later that holds an image must not
    // silently become unreferenced. Anything string-shaped that parses as a
    // public URL counts, whatever the column is called.
    for (const v of Object.values(p)) {
      if (typeof v === 'string') add(v);
    }
  }

  for (const pr of Array.isArray(projects) ? projects : []) {
    if (!pr) continue;
    add(pr.cover_image);
    if (Array.isArray(pr.images)) for (const src of pr.images) add(src);
    for (const v of Object.values(pr)) {
      if (typeof v === 'string') add(v);
    }
  }

  return out;
}

/**
 * The objects that nothing points at and that are old enough to be sure.
 *
 * `objects` are storage rows as `list()` returns them: `{ name, created_at }`,
 * where `name` is relative to `prefix`.
 */
export function findOrphans(objects, referenced, { prefix = '', now = Date.now(), graceMs = SWEEP_GRACE_MS } = {}) {
  const refs = referenced instanceof Set ? referenced : new Set(referenced || []);
  const out = [];

  for (const o of Array.isArray(objects) ? objects : []) {
    if (!o || !o.name) continue;
    const path = prefix ? `${prefix}/${o.name}` : o.name;
    if (refs.has(path)) continue;

    /* Age is measured from created_at, and a row with NO timestamp is treated
       as too young rather than too old. An unknown age is not evidence that a
       file is safe to delete. */
    const t = o.created_at ? Date.parse(o.created_at) : NaN;
    if (!Number.isFinite(t)) continue;
    if (now - t < graceMs) continue;

    out.push({ path, name: o.name, created_at: o.created_at, size: o.metadata?.size ?? null });
  }

  return out;
}

/**
 * Whether a sweep may proceed at all.
 *
 * THE REFUSAL IS THE POINT. If path parsing breaks, `referenced` is empty and
 * every object looks like garbage — a sweep would then delete every image every
 * customer has. So: rows that should have produced references, but produced
 * none, is treated as a broken sweep rather than as a very successful one.
 *
 * Returns `{ ok, reason }`.
 */
export function sweepAllowed({ referenced, rowsWithImages, orphans, objects }) {
  const refCount = referenced instanceof Set ? referenced.size : (referenced || []).length;

  if (refCount === 0 && rowsWithImages > 0) {
    return { ok: false, reason: 'no-references-parsed' };
  }

  /* Everything in the bucket being garbage is possible in principle and is
     almost always a bug in practice. It needs a human to look, not a confirm
     dialog to be clicked through. */
  const total = Array.isArray(objects) ? objects.length : 0;
  if (total > 0 && orphans.length === total && refCount === 0) {
    return { ok: false, reason: 'everything-orphaned' };
  }

  return { ok: true, reason: null };
}

/** Bytes the sweep would reclaim, where sizes are known. */
export function reclaimable(orphans) {
  return (orphans || []).reduce((n, o) => n + (Number(o.size) || 0), 0);
}
