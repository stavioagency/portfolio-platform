// PreviewPane — a live view of the REAL public website, shown beside the editor.
//
// It iframes the production public page (the same [slug] route a visitor gets),
// so there is no second renderer to keep in sync. It is tenant-aware: the URL is
// derived from the resolved tenant's slug, never hardcoded.
//
// Refresh model: ONE iframe element is kept mounted for the life of the pane.
// A successful save bumps `reloadToken`; that only changes a query param on the
// existing element's `src`, so the same iframe navigates and re-fetches fresh
// data — no remount, no postMessage into the public page, no touching public
// rendering. Device switches change the CSS frame only, never the src.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Skeleton, Button, Icon } from './ui';

const DEVICES = {
  desktop: { w: 1280, label: { en: 'Desktop', ar: 'سطح المكتب' } },
  mobile: { w: 390, label: { en: 'Mobile', ar: 'الجوال' } },
};
const LOAD_TIMEOUT_MS = 15000;

export default function PreviewPane({ origin, slug, reloadToken = 0, lang = 'en' }) {
  const ar = lang === 'ar';
  const [device, setDevice] = useState('desktop');
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [scale, setScale] = useState(1);
  const stageRef = useRef(null);
  const iframeRef = useRef(null);
  const timerRef = useRef(null);
  // Bumped locally by the Retry button; combined with the save-driven token so
  // both paths force a fresh navigation of the same element.
  const [retryTick, setRetryTick] = useState(0);
  const retriesRef = useRef(0);

  const path = slug ? `/${slug}` : '/';
  const cleanUrl = origin ? `${origin}${path}` : path;               // for "open in new tab" + display
  const version = `${reloadToken}.${retryTick}`;
  const src = origin ? `${cleanUrl}?preview=1&v=${version}` : '';    // iframe target (suppresses analytics)

  // Scale the fixed-width device frame down to fit the available column.
  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const avail = stage.clientWidth - 24; // breathing room inside the stage padding
    // While the pane is display:none (below the desktop breakpoint) clientWidth is
    // 0. Bail instead of computing a bogus scale — otherwise crossing into the
    // two-column layout leaves the frame at scale(1) and the preview looks cropped.
    //
    // BUT BAILING ALONE WAS THE BUG. If the very first measure landed before the
    // stage had been laid out, nothing ever measured again on a screen that
    // never fires a resize: scale stayed at its initial 1, a 1280px desktop
    // frame rendered at 1:1 inside a ~700px column, and the visible sliver of
    // the page's top-left corner read as "the preview is blank". Retry on the
    // next frame instead of giving up, bounded so it cannot spin.
    if (avail <= 0) {
      if (retriesRef.current < 20) {
        retriesRef.current += 1;
        requestAnimationFrame(() => measureRef.current && measureRef.current());
      }
      return;
    }
    retriesRef.current = 0;
    setScale(Math.min(1, avail / DEVICES[device].w));
  }, [device]);

  // measure() refers to itself through a ref so the retry above does not need it
  // in its own dependency list.
  const measureRef = useRef(null);
  measureRef.current = measure;

  // Re-measure on every state transition too (loading -> ready -> error swaps the
  // stage contents), so the frame can never be left at a stale scale.
  useLayoutEffect(() => { measure(); }, [measure, status, src]);
  useEffect(() => {
    // Window resize is the fallback: a ResizeObserver does not report elements
    // that are display:none, so crossing the breakpoint needs an explicit re-measure.
    window.addEventListener('resize', measure);
    let ro;
    if (typeof ResizeObserver !== 'undefined' && stageRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(stageRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, [measure]);

  // Whenever the target changes (save bump, retry, or tenant slug change), show the
  // skeleton and arm a timeout so a hard network failure surfaces the error card.
  useEffect(() => {
    if (!src) return undefined;
    setStatus('loading');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus('error'), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timerRef.current);
  }, [src]);

  const onLoad = () => {
    clearTimeout(timerRef.current);
    // A blank about:blank load (before src is applied) shouldn't flip to ready.
    if (src) setStatus('ready');
    // The stage definitely has geometry by now.
    measure();
  };
  const retry = () => setRetryTick(t => t + 1);

  const frameH = scale > 0 ? Math.round((stageRef.current?.clientHeight || 600) / scale) : 600;

  return (
    <div className="pv">
      <div className="pv-bar">
        <div className="pv-devices" role="group" aria-label={ar ? 'حجم المعاينة' : 'Preview size'}>
          {Object.entries(DEVICES).map(([key, d]) => (
            <button
              key={key}
              type="button"
              className={`pv-dev ${device === key ? 'on' : ''}`}
              aria-pressed={device === key}
              onClick={() => setDevice(key)}
            >
              {ar ? d.label.ar : d.label.en}
            </button>
          ))}
        </div>
        <span className="pv-url" title={cleanUrl} dir="ltr">{path}</span>
        <div className="pv-actions">
          <button type="button" className="pv-icon" onClick={retry} title={ar ? 'تحديث' : 'Refresh'} aria-label={ar ? 'تحديث' : 'Refresh'}>
            <Icon name="globe" size={15} />
          </button>
          <a className="pv-icon" href={cleanUrl} target="_blank" rel="noopener noreferrer" title={ar ? 'فتح في تبويب جديد' : 'Open in new tab'} aria-label={ar ? 'فتح في تبويب جديد' : 'Open in new tab'}>
            <Icon name="external" size={15} mirror />
          </a>
        </div>
      </div>

      <div className={`pv-stage dev-${device}`} ref={stageRef}>
        {status === 'error' ? (
          <div className="pv-error" role="alert">
            <div className="pv-error-title">{ar ? 'تعذّر تحميل المعاينة' : "Couldn't load the preview"}</div>
            <p className="pv-error-desc">
              {ar ? 'قد يكون الاتصال بطيئًا. يمكن المحاولة مرة أخرى.' : 'The connection may be slow. Try refreshing.'}
            </p>
            <Button size="sm" variant="secondary" onClick={retry}>{ar ? 'إعادة المحاولة' : 'Retry'}</Button>
          </div>
        ) : (
          <div className="pv-frame" style={{ width: DEVICES[device].w * scale }}>
            {status === 'loading' && (
              <div className="pv-skel" aria-hidden="true">
                <Skeleton width="100%" height="100%" radius="0" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              className="pv-iframe"
              src={src || undefined}
              title={ar ? 'معاينة الموقع' : 'Website preview'}
              onLoad={onLoad}
              loading="lazy"
              style={{
                width: DEVICES[device].w,
                height: frameH,
                transform: `scale(${scale})`,
                opacity: status === 'ready' ? 1 : 0,
              }}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        .pv {
          display: flex;
          flex-direction: column;
          block-size: 100%;
          min-block-size: 0;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .pv-bar {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          border-block-end: 1px solid var(--border);
          background: var(--bg-elevated);
        }
        .pv-devices { display: inline-flex; gap: 2px; padding: 3px; background: var(--bg-primary); border-radius: var(--radius-sm); }
        .pv-dev {
          padding: 4px 10px; border: none; background: none; border-radius: 5px;
          font-family: inherit; font-size: var(--text-xs); font-weight: 600;
          color: var(--text-tertiary); cursor: pointer; transition: background var(--transition), color var(--transition);
        }
        .pv-dev:hover { color: var(--text-primary); }
        .pv-dev.on { background: var(--bg-hover); color: var(--text-primary); }
        .pv-dev:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .pv-url {
          flex: 1; min-inline-size: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          text-align: center; font-size: var(--text-xs); color: var(--text-muted);
        }
        .pv-actions { display: inline-flex; gap: 4px; }
        .pv-icon {
          display: inline-flex; align-items: center; justify-content: center;
          inline-size: 30px; block-size: 30px; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--bg-primary);
          color: var(--text-secondary); cursor: pointer; transition: background var(--transition), color var(--transition);
        }
        .pv-icon:hover { background: var(--bg-hover); color: var(--text-primary); }
        .pv-icon:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .pv-stage {
          position: relative; flex: 1; min-block-size: 0;
          display: flex; align-items: flex-start; justify-content: center;
          padding: var(--space-3);
          overflow: hidden;
          /* a subtle checkerboard so the device frame reads as "canvas" */
          background:
            linear-gradient(45deg, rgba(var(--on-bg, 255,255,255), 0.02) 25%, transparent 25%, transparent 75%, rgba(var(--on-bg, 255,255,255), 0.02) 75%) 0 0 / 16px 16px,
            var(--bg-secondary);
        }
        .pv-frame { position: relative; block-size: 100%; overflow: hidden; border-radius: var(--radius-md); box-shadow: var(--shadow-md); }
        .dev-mobile .pv-frame { border-radius: var(--radius-lg); }
        .pv-iframe {
          border: none; background: #fff;
          transform-origin: top left;
          transition: opacity 0.2s ease;
          display: block;
        }
        .pv-skel { position: absolute; inset: 0; z-index: 1; }

        .pv-error {
          margin: auto; max-inline-size: 300px; text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: var(--space-3);
          padding: var(--space-5);
        }
        .pv-error-title { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); }
        .pv-error-desc { font-size: var(--text-sm); color: var(--text-tertiary); line-height: 1.6; }
      `}</style>
    </div>
  );
}
