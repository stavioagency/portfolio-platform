// lib/studio-data.js
// -----------------------------------------------------------------------------
// The Studio's data layer. Every read and every write the Studio performs goes
// through this file, so the rules below are stated once instead of being
// remembered at each call site.
//
// ── THE RULE THAT MATTERS MOST ───────────────────────────────────────────
// A WRITE THAT RLS FILTERS OUT IS NOT AN ERROR. PostgREST reports success
// having changed zero rows, so saving into a workspace you cannot write to
// looked exactly like a real save — and the work was gone on reload. Every
// write here therefore ends in `.select()` and treats an empty result as a
// failure. /admin learned this the hard way and the reasoning is preserved
// beside its own helpers; this is the same rule, applied once for the Studio.
//
// ── AUTHORIZATION IS NOT HERE ────────────────────────────────────────────
// Nothing in this file is a security boundary. RLS decides which workspaces a
// customer can read and which they can write; can_edit_tenant() additionally
// requires a subscription for writes. This layer's job is to surface what the
// database decided, never to pre-empt it — a client-side check would be a
// second, weaker opinion about the same question.
//
// ── IT DOES NOT INVENT ───────────────────────────────────────────────────
// No defaults are written on the customer's behalf, no fields are back-filled,
// and nothing is normalised on the way in. A row that has been empty since
// signup stays empty until the customer fills it, because a portfolio that
// silently acquired content nobody typed is worse than one that is blank.

import { supabase } from './supabase';
import { compressImage, fileExtension, MAX_AVATAR_DIMENSION } from './image-compress';

// The message a blocked write reports. Deliberately explicit about the cause:
// "save failed" sends someone to check their connection, which is not it.
export const BLOCKED_WRITE = 'This account cannot write to this workspace. '
  + 'That is usually a lapsed subscription — nothing was changed.';

const NO_TENANT = 'No workspace selected.';

/* Tenant-isolated storage path: a tenant's media lives under `t-<id>/`. Returns
   null rather than a bare filename when there is no tenant — a flat path is
   what the storage policies refuse to write, and before those policies existed
   it dropped the file into a shared root beside every other client's images. */
export function tenantStoragePath(tenantId, name) {
  if (!tenantId) return null;
  return `t-${tenantId}/${name}`;
}

// ------------------------------------------------------------------ reads ---

/* The workspaces this account administers.
 *
 * SCOPED BY MEMBERSHIP, AND IT HAS TO BE. `tenants` carries a PUBLIC read
 * policy — USING (true) — so selecting from it returns every workspace on the
 * platform to anybody, signed in or not. The first version of this function did
 * exactly that and then took row zero, which happened to be the right answer
 * for a platform owner and would have shown every real customer somebody else's
 * portfolio: the wrong name, the wrong address, and a profile they cannot read,
 * reported as "this account is missing its setup".
 *
 * `tenant_admins` is the membership table and its policy is own-rows-only
 * (user_id = auth.uid()), so joining THROUGH it is what makes the list the
 * caller's own.
 *
 * NO SEPARATE OWNER BRANCH, deliberately. /admin needs one because a platform
 * owner must see workspaces they did not create. The Studio does not: owners
 * are enrolled as an admin of every tenant by trg_enroll_platform_owners, so
 * membership already returns everything for them — verified against production,
 * where two owners hold fourteen of the eighteen membership rows across seven
 * tenants. Managing somebody else's portfolio is /client's job, not this one.
 *
 * Nothing here is a security boundary: RLS decides which rows come back. This
 * only decides what is LISTED, so getting it wrong is a correctness bug rather
 * than a leak — profile and projects stay unreadable either way. */
export async function loadWorkspaces() {
  const { data, error } = await supabase
    .from('tenant_admins')
    .select('tenants ( id, slug, name, status, default_lang, published_at, created_at )');
  if (error) throw error;
  return (data || [])
    .map((row) => row.tenants)
    .filter(Boolean)
    /* DETERMINISTIC, AND THE TIEBREAK IS NOT OPTIONAL.
       Sorting on created_at alone is not a total order: designakum and
       f9designer carry the IDENTICAL created_at, so the tie broke on whatever
       order the join happened to return — and the Studio silently changed which
       workspace it was editing between two page loads. Home said one name while
       Profile loaded the other one's fields, which is how somebody edits a
       client's portfolio believing it is their own.
       Found by opening the two screens in sequence and reading the values. */
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))
      || String(a.id).localeCompare(String(b.id)));
}

export async function loadProfile(tenantId) {
  if (!tenantId) throw new Error(NO_TENANT);
  const { data, error } = await supabase
    .from('profile').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return data || null;
}

/* Ordered by display_order, which is what the public page reads. Ties fall back
   to id so a portfolio whose orders were never set still has a stable sequence
   rather than one that shuffles between loads. */
export async function loadProjects(tenantId) {
  if (!tenantId) throw new Error(NO_TENANT);
  const { data, error } = await supabase
    .from('projects').select('*').eq('tenant_id', tenantId)
    .order('display_order', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ----------------------------------------------------------------- writes ---

/* Partial update of the profile row. `fields` is exactly what changed — never
   the whole row, so two screens saving different things cannot overwrite each
   other's work with a stale copy of the rest. */
export async function saveProfile(tenantId, fields) {
  if (!tenantId) throw new Error(NO_TENANT);
  const { data, error } = await supabase
    .from('profile').update(fields).eq('tenant_id', tenantId).select('tenant_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(BLOCKED_WRITE);
  return true;
}

export async function createProject(tenantId, order) {
  if (!tenantId) throw new Error(NO_TENANT);
  /* An unstamped project belongs to no tenant and would be invisible to every
     policy, including the one that would let its owner delete it again. */
  const row = {
    tenant_id: tenantId,
    title: { ar: '', en: '' },
    description: { ar: '', en: '' },
    images: [],
    display_order: order,
  };
  const { data, error } = await supabase.from('projects').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function saveProject(id, fields) {
  const { data, error } = await supabase
    .from('projects').update(fields).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(BLOCKED_WRITE);
  return true;
}

export async function deleteProject(id) {
  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(BLOCKED_WRITE);
  return true;
}

/* Reordering writes only the rows whose position actually moved. Rewriting all
   of them makes a two-item swap look like an eight-row edit in any future audit
   trail, and multiplies the chance of one write being the one that fails. */
export async function reorderProjects(ordered) {
  const changed = ordered
    .map((p, i) => ({ id: p.id, display_order: i }))
    .filter((row, i) => ordered[i].display_order !== i);
  for (const row of changed) {
    // Sequential on purpose: a partial failure must stop rather than race the
    // rest into an order nobody chose.
    await saveProject(row.id, { display_order: row.display_order });
  }
  return changed.length;
}

// ------------------------------------------------------------------ media ---

/* What the product accepts. Anything else is refused BEFORE it is uploaded, so
   a customer never waits for a transfer that was always going to be rejected.
   GIF is deliberately absent: it is the one raster format that arrives at
   megabytes for a few seconds of motion. */
export const ACCEPTED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function describeRejection(file, ar) {
  if (!file) return ar ? 'لم يُختَر ملف.' : 'No file chosen.';
  if (!ACCEPTED_IMAGE.includes(file.type)) {
    return ar
      ? 'الصيغة غير مدعومة. الصيغ المقبولة: JPG أو PNG أو WebP.'
      : 'That format is not supported. Use JPG, PNG or WebP.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    return ar
      ? `الملف كبير (${mb} ميغابايت). الحد الأقصى 8 ميغابايت.`
      : `That file is ${mb}MB. The limit is 8MB.`;
  }
  return '';
}

/* Upload one image and return its public URL.
   Compressed first, always: the customer's phone produces four-megabyte photos
   and the portfolio is a page a stranger loads on mobile data. `avatar` uses the
   smaller ceiling because a profile picture renders at a fraction of the size a
   project cover does. */
export async function uploadImage(tenantId, kind, file, { avatar = false } = {}) {
  const rejection = describeRejection(file, false);
  if (rejection) throw new Error(rejection);

  const img = await compressImage(file,
    avatar ? { maxDimension: MAX_AVATAR_DIMENSION } : undefined);
  const path = tenantStoragePath(tenantId, `${kind}-${Date.now()}.${fileExtension(img)}`);
  if (!path) throw new Error(NO_TENANT);

  const { error } = await supabase.storage.from('media').upload(path, img, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}
