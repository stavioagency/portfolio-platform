/* Version history: what your page looked like, and putting one back.
 *
 * The database does the work (Section AB): every publish captures a version,
 * rolling back is itself captured, and the version currently being served is
 * never expired. This screen is the reading of it.
 *
 * ── RESTORING IS OFFERED PLAINLY, BECAUSE IT IS NOT DANGEROUS ───────────
 * Rollback writes through the same column a publish does, so it captures a new
 * version on the way -- the state being rolled away from is still there
 * afterwards. There is nothing to lose, so this does not arm, confirm and
 * warn: a screen that treats a reversible action as frightening teaches people
 * to click through warnings that matter.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, EmptyState, Icon } from '../ui';

const RETENTION_DAYS = 14;

export function History({ ar, tenant, canEdit = true, onRestored }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(0);
  const [said, setSaid] = useState(null);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from('portfolio_versions')
      .select('id, number, created_at')
      .eq('tenant_id', tenant.id)
      .order('number', { ascending: false })
      .limit(50);
    setRows(data || []);
  }, [tenant]);

  useEffect(() => { void load(); }, [load]);

  async function restore(number) {
    setBusy(number); setSaid(null);
    try {
      const { error } = await supabase.rpc('rollback_tenant', {
        tid: tenant.id, version_number: number,
      });
      if (error) throw error;
      setSaid({ ok: true, text: ar ? `أُعيدت النسخة ${number}.` : `Version ${number} is live again.` });
      await load();
      if (onRestored) onRestored();
    } catch (e) {
      setSaid({ ok: false, text: e?.message || String(e) });
    } finally { setBusy(0); }
  }

  return (
    <section className="hist">
      <h2>{ar ? 'النسخ السابقة' : 'Version history'}</h2>
      <p className="hint">
        {ar
          ? `كل نشر يحفظ نسخة. تُحفظ ${RETENTION_DAYS} يومًا — والنسخة المنشورة حاليًا تبقى دائمًا.`
          : `Every publish saves a version. They are kept for ${RETENTION_DAYS} days — and the one currently live is always kept.`}
      </p>

      {rows === null ? (
        <p className="hint">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Icon name="clock" size={24} />}
                    title={ar ? 'لم تنشر بعد.' : 'Nothing published yet.'} compact />
      ) : rows.map((v, i) => (
        <div key={v.id} className="row">
          <span className="grow">
            <b>{ar ? `النسخة ${v.number}` : `Version ${v.number}`}</b>
            <span className="hint">
              {new Date(v.created_at).toLocaleString(ar ? 'ar' : 'en-GB',
                { dateStyle: 'medium', timeStyle: 'short' })}
              {i === 0 && ` · ${ar ? 'المنشورة الآن' : 'live now'}`}
            </span>
          </span>
          {i !== 0 && canEdit && (
            <Button size="sm" variant="secondary" disabled={busy !== 0}
                    onClick={() => void restore(v.number)}>
              {busy === v.number
                ? (ar ? 'جارٍ…' : 'Working…')
                : (ar ? 'إعادة' : 'Restore')}
            </Button>
          )}
        </div>
      ))}

      {said && <p className={said.ok ? 'ok' : 'bad'} role="status">{said.text}</p>}

      <style jsx>{`
        .hist { display: flex; flex-direction: column; gap: 8px; }
        h2 { margin: 0; font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
        .hint { margin: 0; color: var(--text-tertiary); font-size: var(--text-xs); line-height: 1.6; }
        .row { display: flex; align-items: center; gap: 10px; padding: var(--space-3);
               border: 1px solid var(--border-default); border-radius: var(--radius-md);
               background: var(--surface-card); color: var(--text-primary); }
        .grow { display: flex; flex-direction: column; gap: 2px; flex: 1; min-inline-size: 0; }
        .ok { margin: 0; color: var(--success-ink); font-size: var(--text-sm); }
        .bad { margin: 0; color: var(--danger-ink); font-size: var(--text-sm); }
      `}</style>
    </section>
  );
}

export default History;
