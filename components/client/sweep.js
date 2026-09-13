// Reclaiming a customer's unused images, one workspace at a time.
//
// ── TWO STEPS, NEVER ONE ─────────────────────────────────────────────────
// Scan, read what it found, then delete. There is no single button that finds
// and removes, because the only protection against a bad sweep is a person
// looking at the list before anything happens. The decision of what counts as
// garbage is lib/storage-sweep.js, which is pure and tested; this is the part
// that talks to storage.
//
// ── TENANT-SCOPED ON PURPOSE ─────────────────────────────────────────────
// Media lives under `t-<tenantId>/` and a sweep lists exactly that prefix. A
// platform-wide sweep would be one button that can empty every customer's
// images at once, which is not a button worth having for a problem measured in
// megabytes.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadProjects } from '../../lib/studio-data';
import {
  referencedPaths, findOrphans, sweepAllowed, reclaimable, SWEEP_GRACE_MS,
} from '../../lib/storage-sweep';

const PAGE = 100;
const MAX_PASSES = 200;

function kb(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StorageSweep({ ar, row }) {
  const [found, setFound] = useState(null);   // null | { orphans, bytes, total }
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState(null);

  const prefix = `t-${row.id}`;

  async function listAll() {
    /* Storage listing is PAGED and the API may return fewer rows than asked
       for. Paging with a moving offset is correct here because nothing is being
       deleted during the scan. */
    const all = [];
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const { data, error } = await supabase.storage.from('media')
        .list(prefix, { limit: PAGE, offset: pass * PAGE });
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
    }
    return all;
  }

  async function scan() {
    setBusy('scan'); setSaid(null); setFound(null);
    try {
      const [objects, { data: profile }, projects] = await Promise.all([
        listAll(),
        supabase.from('profile').select('*').eq('tenant_id', row.id).maybeSingle(),
        loadProjects(row.id),
      ]);

      const referenced = referencedPaths({ profiles: [profile], projects });
      const orphans = findOrphans(objects, referenced, { prefix });

      /* How many rows SHOULD have produced a reference. If this is non-zero and
         nothing parsed, the sweep is broken rather than successful — see
         sweepAllowed(). */
      const rowsWithImages =
        (profile && profile.profile_image ? 1 : 0)
        + (projects || []).filter((p) => p.cover_image || (p.images || []).length).length;

      const verdict = sweepAllowed({ referenced, rowsWithImages, orphans, objects });
      if (!verdict.ok) {
        setSaid({ tone: 'bad', text: verdict.reason === 'no-references-parsed'
          ? (ar
            ? 'توقّف الفحص: لم يُقرأ أي مسار صورة رغم وجود صور مرتبطة. هذا خلل في الفحص، وليس ملفات غير مستخدمة.'
            : 'Scan stopped: no image paths parsed even though rows reference images. That is a broken scan, not unused files.')
          : (ar
            ? 'توقّف الفحص: كل الملفات تبدو غير مستخدمة، وهذا يحتاج مراجعة يدوية.'
            : 'Scan stopped: every file looks unused, which needs a human to look.') });
        return;
      }

      setFound({ orphans, bytes: reclaimable(orphans), total: objects.length });
    } catch (e) {
      setSaid({ tone: 'bad', text: e?.message || String(e) });
    } finally {
      setBusy('');
    }
  }

  async function removeFound() {
    if (!found || found.orphans.length === 0) return;
    setBusy('del'); setSaid(null);
    try {
      const paths = found.orphans.map((o) => o.path);
      const { error } = await supabase.storage.from('media').remove(paths);
      if (error) throw error;
      setSaid({ tone: 'ok', text: ar
        ? `حُذف ${paths.length} ملفًا غير مستخدم.`
        : `Removed ${paths.length} unused files.` });
      setFound(null);
    } catch (e) {
      setSaid({ tone: 'bad', text: e?.message || String(e) });
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="sweep">
      <h4>{ar ? 'الصور غير المستخدمة' : 'Unused images'}</h4>
      <p className="fine">
        {ar
          ? 'حذف عمل يترك صوره في التخزين، واستبدال صورة يترك القديمة. هذا الفحص يجدها.'
          : 'Deleting a project leaves its images behind, and replacing one orphans the old file. This finds them.'}
      </p>

      <div className="line">
        <button type="button" disabled={busy === 'scan'} onClick={scan}>
          {busy === 'scan' ? (ar ? 'جارٍ الفحص…' : 'Scanning…') : (ar ? 'فحص' : 'Scan')}
        </button>

        {found && found.orphans.length > 0 && (
          <button type="button" className="danger" disabled={busy === 'del'} onClick={removeFound}>
            {busy === 'del'
              ? (ar ? 'جارٍ الحذف…' : 'Removing…')
              : (ar
                ? `حذف ${found.orphans.length} ملفًا (${kb(found.bytes)})`
                : `Remove ${found.orphans.length} files (${kb(found.bytes)})`)}
          </button>
        )}
      </div>

      {found && (
        <p className="fine">
          {found.orphans.length === 0
            ? (ar
              ? `لا ملفات غير مستخدمة. ${found.total} ملفًا، كلها مرتبطة.`
              : `Nothing unused. ${found.total} files, all referenced.`)
            : (ar
              ? `${found.orphans.length} من ${found.total} ملفًا غير مستخدم.`
              : `${found.orphans.length} of ${found.total} files are unreferenced.`)}
          {' '}
          {ar
            ? `الملفات الأحدث من ${SWEEP_GRACE_MS / 3600000} ساعة مستثناة — قد تكون رفعًا لم يُحفظ بعد.`
            : `Files newer than ${SWEEP_GRACE_MS / 3600000} hours are excluded — they may be an upload not yet saved.`}
        </p>
      )}

      {said && <p className={said.tone === 'bad' ? 'said bad' : 'said ok'} role="status">{said.text}</p>}

      <style jsx>{`
        .sweep { margin-bottom: var(--space-4); }
        h4 { margin: 0 0 6px; font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        .fine { margin: 6px 0 0; color: var(--text-tertiary); font-size: var(--text-xs); line-height: 1.6; }
        .line { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        button {
          flex: none; min-height: var(--tap-min); padding: 0 var(--space-3);
          border: 1px solid var(--action-secondary-border); border-radius: var(--radius-sm);
          background: var(--action-secondary-bg); color: var(--action-secondary-fg);
          font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer;
        }
        button:disabled { opacity: 0.45; cursor: default; }
        button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        button.danger { background: var(--danger-bg); color: var(--danger-ink); border-color: var(--danger-border); }
        .said { margin: var(--space-3) 0 0; padding: var(--space-3);
                border-radius: var(--radius-sm); font-size: var(--text-sm); line-height: 1.6; }
        .said.ok { background: var(--success-bg); color: var(--success-ink); }
        .said.bad { background: var(--danger-bg); color: var(--danger-ink); }
      `}</style>
    </section>
  );
}
