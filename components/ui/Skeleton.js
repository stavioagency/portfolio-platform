// Skeleton — loading placeholder. The admin currently renders nothing while
// data loads, which reads as a broken screen on slow connections.
// The shimmer direction flips under [dir="rtl"]. The global
// prefers-reduced-motion rule EXEMPTS this animation rather than neutralising
// it — see the data-motion attribute below.
//
// The sheen is rgba(var(--on-bg), …), not white. --on-bg is the "ink on this
// background" channel: white on the dark theme, navy on the light one. A fixed
// white band is invisible on the light theme, where the base surface is already
// #e9edf7 — measured at 1.01:1 against its own base, versus 1.17:1 on dark.
// There is no lighter band available on that surface: pure white at full
// opacity still only reaches dL 0.0075. A darker band is the only physically
// visible direction, and --on-bg expresses it without a new token.
export default function Skeleton({ width = '100%', height = 14, radius = 'var(--radius-sm)', className = '' }) {
  return (
    <span
      className={`ui-skel ${className}`}
      style={{ width, height: typeof height === 'number' ? `${height}px` : height, borderRadius: radius }}
      aria-hidden="true"
      // The reduced-motion exemption in globals.css is written against
      // [data-motion='loading'] and, until now, NOTHING in the codebase set it.
      // The blanket rule was therefore freezing the shimmer for exactly the
      // users the exemption was written to protect — a skeleton that stops
      // moving reads as broken rather than as calm.
      data-motion="loading"
    >
      <style jsx>{`
        .ui-skel {
          display: block;
          background: var(--bg-elevated);
          background-image: linear-gradient(
            90deg,
            transparent 0%,
            rgba(var(--on-bg), 0.055) 50%,
            transparent 100%
          );
          background-size: 220% 100%;
          animation: ui-skel-sweep 1.4s ease-in-out infinite;
        }
        :global([dir='rtl']) .ui-skel { animation-direction: reverse; }
        @keyframes ui-skel-sweep {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
      `}</style>
    </span>
  );
}

// Convenience: a stack of text lines, last one shortened.
export function SkeletonText({ lines = 3, gap = 'var(--space-2)' }) {
  return (
    <div className="ui-skel-text" style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
      <style jsx>{`
        .ui-skel-text { display: flex; flex-direction: column; }
      `}</style>
    </div>
  );
}
