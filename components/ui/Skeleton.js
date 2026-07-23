// Skeleton — loading placeholder. The admin currently renders nothing while
// data loads, which reads as a broken screen on slow connections.
// The shimmer direction flips under [dir="rtl"]; the global
// prefers-reduced-motion rule already neutralises the animation.
export default function Skeleton({ width = '100%', height = 14, radius = 'var(--radius-sm)', className = '' }) {
  return (
    <span
      className={`ui-skel ${className}`}
      style={{ width, height: typeof height === 'number' ? `${height}px` : height, borderRadius: radius }}
      aria-hidden="true"
    >
      <style jsx>{`
        .ui-skel {
          display: block;
          background: var(--bg-elevated);
          background-image: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.055) 50%,
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
