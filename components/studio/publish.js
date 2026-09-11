// The publish panel and the draft preview.
//
// ── THE PANEL ANSWERS "WHY NOT", NOT JUST "NO" ───────────────────────────
// A disabled Publish button with no explanation is the complaint the old
// sidebar earned: it looked the same whether there was something to publish or
// not. Every refusal here names its cause and, where the customer can act,
// links to the screen where they would act.
//
// The two refusals are never conflated. NOT READY is missing content the
// customer can add. NOT PAID is a finished portfolio that cannot go live.
// Showing a payment wall to someone who has not written their name, or a
// checklist to someone who has finished and simply has not paid, sends them to
// work on the wrong thing.
//
// ── THE GATE IS STILL THE DATABASE'S ─────────────────────────────────────
// publish_tenant() checks can_edit_tenant() and refuses with 42501. Everything
// on this screen is explanation, never enforcement — the button being enabled
// is a prediction, and the database is the authority that decides.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui';
import { publish } from '../../lib/studio-publish';
import { publishRequirements } from '../../lib/publish-requirements';

export function PublishPanel({ ar, tenant, profile, projectCount, published, entitled, hasChanges, onSection, onPublished }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const reqs = publishRequirements(profile, projectCount, ar);
  const missing = reqs.filter((r) => !r.ok);
  const ready = missing.length === 0;

  /* `entitled` is null while unknown. A publish button that is enabled before
     the answer arrives promises something we cannot yet keep, and one that is
     disabled says "no" for a reason that may not be true. It waits. */
  const known = entitled !== null;
  const canTry = ready && entitled === true && !busy;

  async function go() {
    setBusy(true); setResult(null);
    const r = await publish(tenant.id, ar);
    setBusy(false);
    setResult(r);
    if (r.ok) onPublished(r.at);
  }

  return (
    <section className="panel">
      <h2>{ar ? 'النشر' : 'Publishing'}</h2>

      {published && !hasChanges && (
        <p className="line live">
          <span className="dot ok" aria-hidden="true" />
          {ar ? 'كل تغييراتك منشورة.' : 'Everything you have written is live.'}
        </p>
      )}
      {published && hasChanges && (
        <p className="line pending">
          <span className="dot warn" aria-hidden="true" />
          {ar ? 'لديك تغييرات لا يراها الزوّار بعد.' : 'You have changes visitors cannot see yet.'}
        </p>
      )}
      {!published && (
        <p className="line">
          <span className="dot" aria-hidden="true" />
          {ar ? 'معرضك لم يُنشر بعد.' : 'Your portfolio has not been published yet.'}
        </p>
      )}

      {/* NOT READY — the customer can fix every line of this themselves. */}
      {!ready && (
        <ul className="reqs">
          {missing.map((r) => (
            <li key={r.id}>
              <span className="x" aria-hidden="true" />
              <span className="txt">
                <b>{r.label}</b>
                <em>{r.why}</em>
              </span>
              <button type="button" onClick={() => onSection(r.section)}>
                {ar ? 'الانتقال' : 'Go there'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* NOT PAID — nothing the customer writes will change this one. */}
      {ready && known && entitled === false && (
        <div className="wall">
          <p>
            {ar
              ? 'معرضك جاهز. النشر يحتاج اشتراكًا نشطًا.'
              : 'Your portfolio is ready. Publishing needs an active subscription.'}
          </p>
          <a className="cta" href="/subscribe">{ar ? 'الاشتراك' : 'Subscribe'}</a>
        </div>
      )}

      {ready && entitled === true && (
        <button type="button" className="go" disabled={!canTry} onClick={go}>
          {busy
            ? (ar ? 'جارٍ النشر…' : 'Publishing…')
            : published
              ? (ar ? 'نشر التغييرات' : 'Publish changes')
              : (ar ? 'نشر المعرض' : 'Publish portfolio')}
        </button>
      )}

      {result && !result.ok && <p className="bad" role="alert">{result.message}</p>}
      {result && result.ok && (
        <p className="good" role="status">
          {ar ? 'تم النشر. معرضك مباشر الآن.' : 'Published. Your portfolio is live.'}
        </p>
      )}

      <style jsx>{`
        .panel { border: 1px solid var(--border-default); border-radius: var(--radius-lg);
                 background: var(--surface-card); padding: var(--space-4); }
        h2 { margin: 0 0 var(--space-3); font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
        .line { display: flex; align-items: center; gap: 8px; margin: 0 0 var(--space-3);
                font-size: var(--text-md); }
        .live { color: var(--success-ink); }
        .pending { color: var(--warning-ink); }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-tertiary); flex: none; }
        .dot.ok { background: var(--success); }
        .dot.warn { background: var(--warning); }
        .reqs { list-style: none; margin: 0 0 var(--space-3); padding: 0;
                display: flex; flex-direction: column; gap: var(--space-3); }
        .reqs li { display: flex; align-items: flex-start; gap: var(--space-3); }
        .x { flex: none; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%;
             background: var(--border-strong); }
        .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .txt b { font-size: var(--text-sm); font-weight: 600; }
        .txt em { font-style: normal; font-size: var(--text-xs); color: var(--text-tertiary); line-height: 1.6; }
        .reqs button { flex: none; border: 0; background: none; color: var(--text-link);
                       font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer;
                       padding: 4px 6px; border-radius: var(--radius-sm); }
        .reqs button:hover { background: var(--surface-hover); }
        .reqs button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 1px; }
        .wall { border: 1px solid var(--warning-border); background: var(--warning-bg);
                border-radius: var(--radius-md); padding: var(--space-3); }
        .wall p { margin: 0 0 var(--space-3); font-size: var(--text-sm); color: var(--warning-ink); line-height: 1.7; }
        .cta { display: inline-flex; align-items: center; min-height: 40px; padding: 0 var(--space-4);
               border-radius: var(--radius-md); background: var(--action-primary-bg);
               color: var(--action-primary-fg); text-decoration: none;
               font-size: var(--text-sm); font-weight: 700; }
        .cta:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .go { min-height: 44px; padding: 0 var(--space-5); border: 0; border-radius: var(--radius-md);
              background: var(--action-primary-bg); color: var(--action-primary-fg);
              font: inherit; font-size: var(--text-sm); font-weight: 700; cursor: pointer; }
        .go:hover:not(:disabled) { background: var(--action-primary-bg-hover); }
        .go:disabled { opacity: 0.5; cursor: default; }
        .go:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .bad { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--danger-ink); line-height: 1.7; }
        .good { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--success-ink); }
      `}</style>
    </section>
  );
}

/* THE PREVIEW IS THE REAL PAGE, NOT A DRAWING OF IT.
 *
 * It iframes /{slug}?preview=1, which the public page already understands: in
 * preview mode it reads the DRAFT rather than the published snapshot, gated by
 * RLS so only a tenant admin gets it and an anonymous visitor adding the
 * parameter sees the published site instead. That mechanism exists and is used
 * by /admin; this is a second caller of it, not a second implementation.
 *
 * Same origin, so it reloads by changing a query parameter on the element that
 * is already mounted rather than remounting — a remount flashes white on every
 * save, which is exactly when the customer is looking at it. */
export function Preview({ ar, slug, token, onRefresh }) {
  const [device, setDevice] = useState('mobile');
  const [state, setState] = useState('loading');
  const frame = useRef(null);

  useEffect(() => { setState('loading'); }, [token, slug]);

  const src = slug ? `/${slug}?preview=1&v=${token}` : '';
  const width = device === 'mobile' ? 390 : 1100;

  return (
    <section className="pv">
      <div className="bar">
        <h2>{ar ? 'المعاينة' : 'Preview'}</h2>
        <div className="ctl" role="group" aria-label={ar ? 'حجم المعاينة' : 'Preview size'}>
          <button type="button" className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}>
            {ar ? 'جوال' : 'Phone'}
          </button>
          <button type="button" className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>
            {ar ? 'سطح المكتب' : 'Desktop'}
          </button>
        </div>
        <button type="button" className="rf" onClick={onRefresh}>
          <Icon name="refresh" size={14} />
          <span>{ar ? 'تحديث' : 'Refresh'}</span>
        </button>
      </div>

      <p className="note">
        {ar
          ? 'هذه مسودتك كما ستبدو — بما فيها ما لم يُنشر بعد.'
          : 'This is your draft as it will look — including anything not published yet.'}
      </p>

      <div className="stage">
        <div className="frame" style={{ width, maxWidth: '100%' }}>
          {state === 'loading' && <span className="load">{ar ? 'جارٍ التحميل…' : 'Loading…'}</span>}
          {src && (
            <iframe
              ref={frame}
              title={ar ? 'معاينة المعرض' : 'Portfolio preview'}
              src={src}
              onLoad={() => setState('ready')}
              onError={() => setState('error')}
            />
          )}
        </div>
      </div>

      <style jsx>{`
        .pv { border: 1px solid var(--border-default); border-radius: var(--radius-lg);
              background: var(--surface-card); padding: var(--space-4); }
        .bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: 6px; }
        h2 { margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary);
             margin-inline-end: auto; }
        .ctl { display: flex; border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow: hidden; }
        .ctl button { min-height: 32px; padding: 0 10px; border: 0; background: none;
                      color: var(--text-secondary); font: inherit; font-size: var(--text-xs); cursor: pointer; }
        .ctl button + button { border-inline-start: 1px solid var(--border-default); }
        .ctl button.on { background: var(--brand-soft); color: var(--text-primary); font-weight: 600; }
        .ctl button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; }
        .rf { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px;
              border: 1px solid var(--action-secondary-border); border-radius: var(--radius-sm);
              background: var(--action-secondary-bg); color: var(--action-secondary-fg);
              font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer; }
        .rf:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

        /* THUMB TARGETS. Every control here is comfortably clickable with a
           mouse and too small for a finger: --tap-min is 44px and these sit at
           32-38. Raised only on a phone, so the desktop layout is unchanged. */
        @media (max-width: 720px) {
          .ctl button, .rf { min-height: var(--tap-min); }
        }
        .note { margin: 0 0 var(--space-3); font-size: var(--text-xs); color: var(--text-tertiary); line-height: 1.6; }
        .stage { display: flex; justify-content: center; }
        .frame { position: relative; height: 560px; border: 1px solid var(--border-default);
                 border-radius: var(--radius-md); overflow: hidden; background: var(--bg-elevated); }
        .load { position: absolute; inset: 0; display: grid; place-items: center;
                font-size: var(--text-sm); color: var(--text-tertiary); }
        iframe { width: 100%; height: 100%; border: 0; display: block; }
      `}</style>
    </section>
  );
}
