import { useEffect, useId, useRef, useState, useMemo } from 'react';
import { useWaveMotion } from '../ui/motion';
export function WaveSeek({
  time,
  duration,
  playing,
  onSeek,
}: {
  time: number;
  duration: number;
  playing: boolean;
  onSeek: (time: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(600);
  const id = useId().replace(/\W/g, '');
  const animation = useWaveMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(24, entry.contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const progress = duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0;
  const position = 6 + (width - 12) * progress;
  const wave = useMemo(() => {
    let path = 'M -32 14';
    for (let x = -16; x <= width + 48; x += 16)
      path += ` Q ${x - 8} ${playing ? ((x / 16) % 2 === 0 ? 22 : 6) : 14} ${x} 14`;
    return path;
  }, [width, playing]);
  return (
    <div ref={ref} className="wave-seek" data-playing={playing} data-motion={animation.enabled}>
      <svg viewBox={`0 0 ${width} 28`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id={id}>
            <rect x="6" y="0" width={Math.max(0, position - 14)} height="28" />
          </clipPath>
        </defs>
        {position < width - 12 && (
          <path className="wave-seek__rest" d={`M ${position + 10} 14 H ${width - 6}`} />
        )}
        <g clipPath={`url(#${id})`}>
          <path className="wave-seek__played" d={wave} />
        </g>
        <rect className="wave-seek__thumb" x={position - 3} y="1" width="6" height="26" rx="3" />
      </svg>
      <input
        type="range"
        aria-label="Seek"
        min="0"
        max={duration || 1}
        step="0.1"
        value={Math.min(time, duration || 1)}
        disabled={!duration}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
    </div>
  );
}
