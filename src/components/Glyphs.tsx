/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useRef, type ReactNode, type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const n = (value: number) => Math.round(value * 1000) / 1000;

const box = (x: number, y: number, width: number, height: number, radius: number) => {
  const inner = n(width - radius * 2);
  const tall = n(height - radius * 2);
  return `M${n(x + radius)} ${n(y)}h${inner}a${radius} ${radius} 0 0 1 ${radius} ${radius}v${tall}a${radius} ${radius} 0 0 1 ${-radius} ${radius}h${-inner}a${radius} ${radius} 0 0 1 ${-radius} ${-radius}v${-tall}a${radius} ${radius} 0 0 1 ${radius} ${-radius}Z`;
};

const ring = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)} ${n(cy)}a${r} ${r} 0 1 0 ${n(r * 2)} 0a${r} ${r} 0 1 0 ${n(-r * 2)} 0`;

const dot = (x: number, y: number) => `M${x} ${y}h.01`;

function Pen({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const paths =
  (draw: () => string[]) =>
  ({ children, ...props }: IconProps) => (
    <Pen {...props}>
      {draw().map((d) => (
        <path key={d} d={d} />
      ))}
      {children}
    </Pen>
  );

export const ThumbsUp = paths(() => [
  'M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3Z',
  'M7 19c2 .2 3.1 1 5.1 1h4.2a2.4 2.4 0 0 0 2.3-1.8l1.5-5.5a2.2 2.2 0 0 0-2.1-2.8h-4.1l.5-3.3c.2-1.5-.5-2.6-1.5-2.6-.5 0-.8.4-1 1L10 8c-.7 1-1.6 1.7-3 2',
]);
export const ThumbsDown = (props: IconProps) => (
  <ThumbsUp {...props} style={{ ...props.style, transform: 'rotate(180deg)' }} />
);

export const Home = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--home${className ? ` ${className}` : ''}`} {...props}>
    <path
      className="glyph-roof"
      d="M3.3 10.7C6 8.1 9 5.5 11.2 4a1.5 1.5 0 0 1 1.7 0c2.2 1.5 5.2 4.1 7.9 6.7"
    />
    <path
      className="glyph-body"
      d="M5.5 12.4v6.1a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7v-6.1"
    />
    <path className="glyph-door" d="M9.7 20.1v-4a2.3 2.3 0 0 1 4.6 0v4" />
    {children}
  </Pen>
);

export const Library = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--library${className ? ` ${className}` : ''}`} {...props}>
    <path className="glyph-back-sleeve" d="M9.6 4.4h6.9a2.2 2.2 0 0 1 2.2 2.2v6.9" />
    <path className="glyph-front-sleeve" d={box(3.4, 8.2, 12.2, 11.5, 2.9)} />
    <path className="glyph-disc" d={ring(9.5, 14, 2.2)} />
    {children}
  </Pen>
);

export const Search = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--search${className ? ` ${className}` : ''}`} {...props}>
    <g className="glyph-lens">
      <path d="M10.6 3.9a6.7 6.7 0 1 1-4.7 2a6.6 6.6 0 0 1 4.7-2" />
      <path d="M15.5 15.3l.9.9 4 3.9" />
    </g>
    {children}
  </Pen>
);

export const Settings = ({ children, className, ...props }: IconProps) => {
  const gear = useRef<SVGGElement>(null);
  useEffect(() => {
    const part = gear.current;
    const button = part?.closest('button');
    if (!part || !button) return;
    const release = () => {
      (part.getAnimations?.() ?? [])
        .filter((item) => item.id === 'gear-tighten')
        .forEach((item) => item.cancel());
      button.classList.remove('gear-is-tightened');
    };
    const tighten = () => {
      if (
        document.documentElement.dataset.motion === 'reduced' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        typeof part.animate !== 'function'
      )
        return;
      const base = getComputedStyle(part).transform;
      const rotation = base === 'none' ? 'rotate(0deg)' : base;
      release();
      button.classList.add('gear-is-tightened');
      const motion = part.animate(
        [
          { transform: rotation, offset: 0 },
          { transform: 'rotate(8deg) scale(0.94)', offset: 0.36 },
          { transform: 'rotate(-2deg)', offset: 0.7 },
          { transform: 'rotate(0deg)', offset: 1 },
        ],
        { duration: 360, easing: 'ease-out', fill: 'forwards' },
      );
      motion.id = 'gear-tighten';
    };
    const key = (event: KeyboardEvent) => {
      if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) tighten();
    };
    button.addEventListener('pointerdown', tighten);
    button.addEventListener('keydown', key);
    button.addEventListener('pointerleave', release);
    button.addEventListener('blur', release);
    return () => {
      button.removeEventListener('pointerdown', tighten);
      button.removeEventListener('keydown', key);
      button.removeEventListener('pointerleave', release);
      button.removeEventListener('blur', release);
      release();
    };
  }, []);
  return (
    <Pen
      className={`wave-glyph wave-glyph--settings${className ? ` ${className}` : ''}`}
      {...props}
    >
      <g className="glyph-gear" ref={gear}>
        <path d="M10.21 5.75L10.59 3.11A9 9 0 0 1 13.41 3.11L13.79 5.75A6.5 6.5 0 0 1 16.52 7.32L18.99 6.34A9 9 0 0 1 20.4 8.77L18.31 10.43A6.5 6.5 0 0 1 18.31 13.57L20.4 15.23A9 9 0 0 1 18.99 17.66L16.52 16.68A6.5 6.5 0 0 1 13.79 18.25L13.41 20.89A9 9 0 0 1 10.59 20.89L10.21 18.25A6.5 6.5 0 0 1 7.48 16.68L5.01 17.66A9 9 0 0 1 3.6 15.23L5.69 13.57A6.5 6.5 0 0 1 5.69 10.43L3.6 8.77A9 9 0 0 1 5.01 6.34L7.48 7.32A6.5 6.5 0 0 1 10.21 5.75Z" />
        <path d={ring(12, 12, 2.8)} />
      </g>
      {children}
    </Pen>
  );
};

export const Record = paths(() => [
  'M20.7 14.3a9 9 0 1 1-1.3-6.5',
  'M15.2 12.6a3.4 3.4 0 1 1-2.6-2.9',
]);

export const Remix = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--remix${className ? ` ${className}` : ''}`} {...props}>
    <path className="glyph-bar-1" d="M3.8 10.6v2.8" />
    <path className="glyph-bar-2" d="M7.4 7.4v9.2" />
    <path className="glyph-bar-3" d="M11 4.8v14.4" />
    <path className="glyph-bar-4" d="M14.6 8.2v7.6" />
    <path className="glyph-bar-5" d="M18.2 10.2v3.6" />
    <path className="glyph-bar-6" d="M21 11.4v1.2" />
    {children}
  </Pen>
);

export const Play = paths(() => [
  'M7.7 4.9c0-.9 1-1.4 1.7-.9l9 6.2c.7.5.7 1.5 0 2l-9 6.2c-.7.5-1.7 0-1.7-.9Z',
]);

export const Pause = ({ children, ...props }: IconProps) => (
  <Pen {...props}>
    <path d="M9.3 6.5v11" strokeWidth={2.7} />
    <path d="M14.7 6.5v11" strokeWidth={2.7} />
    {children}
  </Pen>
);

export const PlayPauseGlyph = ({
  playing,
  size = 24,
  className,
  ...props
}: IconProps & { playing: boolean }) => (
  <Pen
    size={size}
    className={`wave-glyph wave-glyph--playpause${playing ? ' is-playing' : ''}${className ? ` ${className}` : ''}`}
    {...props}
  >
    <path
      className="glyph-play-shape"
      d="M7.7 4.9c0-.9 1-1.4 1.7-.9l9 6.2c.7.5.7 1.5 0 2l-9 6.2c-.7.5-1.7 0-1.7-.9Z"
    />
    <g className="glyph-pause-shape">
      <path className="glyph-pause-left" d="M9.3 6.5v11" strokeWidth={2.7} />
      <path className="glyph-pause-right" d="M14.7 6.5v11" strokeWidth={2.7} />
    </g>
  </Pen>
);

export const SkipBack = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--skip-back${className ? ` ${className}` : ''}`} {...props}>
    <path className="glyph-skip-bar" d="M6.1 5.8v12.4" />
    <path
      className="glyph-skip-arrow"
      d="M18.4 6.4v11.2a.9.9 0 0 1-1.4.7l-8-5.5a.9.9 0 0 1 0-1.6l8-5.5a.9.9 0 0 1 1.4.7Z"
    />
    {children}
  </Pen>
);

export const SkipForward = ({ children, className, ...props }: IconProps) => (
  <Pen
    className={`wave-glyph wave-glyph--skip-forward${className ? ` ${className}` : ''}`}
    {...props}
  >
    <path className="glyph-skip-bar" d="M17.9 5.8v12.4" />
    <path
      className="glyph-skip-arrow"
      d="M5.6 6.4v11.2a.9.9 0 0 0 1.4.7l8-5.5a.9.9 0 0 0 0-1.6l-8-5.5a.9.9 0 0 0-1.4.7Z"
    />
    {children}
  </Pen>
);

export const Shuffle = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--shuffle${className ? ` ${className}` : ''}`} {...props}>
    <path className="glyph-shuffle-a" d="M4 6.9C9.8 6.9 10.4 17.1 16.4 17.1L20 17.1" />
    <path className="glyph-shuffle-b" d="M4 17.1C9.8 17.1 10.4 6.9 16.4 6.9L20 6.9" />
    <path className="glyph-shuffle-tip-a" d="M17.7 4.6 20.2 6.9l-2.5 2.3" />
    <path className="glyph-shuffle-tip-b" d="M17.7 14.8 20.2 17.1l-2.5 2.3" />
    {children}
  </Pen>
);

export const Repeat = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--repeat${className ? ` ${className}` : ''}`} {...props}>
    <g className="glyph-repeat-arrows">
      <path d="M6.6 7.2h10.9a2.5 2.5 0 0 1 2.5 2.5v2.4" />
      <path d="M17.4 16.8H6.5A2.5 2.5 0 0 1 4 14.3v-2.4" />
      <path d="M8.4 4.7 6 7.2l2.4 2.5" />
      <path d="M15.6 19.3 18 16.8l-2.4-2.5" />
    </g>
    {children}
  </Pen>
);

export const Repeat1 = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--repeat1${className ? ` ${className}` : ''}`} {...props}>
    <g className="glyph-repeat-arrows">
      <path d="M6.6 7.2h10.9a2.5 2.5 0 0 1 2.5 2.5v2.4" />
      <path d="M17.4 16.8H6.5A2.5 2.5 0 0 1 4 14.3v-2.4" />
      <path d="M8.4 4.7 6 7.2l2.4 2.5" />
      <path d="M15.6 19.3 18 16.8l-2.4-2.5" />
    </g>
    <path className="glyph-repeat-one" d="M11.3 12.9l1.5-.9v3.8" />
    {children}
  </Pen>
);

export const Volume2 = ({ children, className, ...props }: IconProps) => (
  <Pen className={`wave-glyph wave-glyph--volume${className ? ` ${className}` : ''}`} {...props}>
    <path d="M4.2 9.7h2.6l3.9-3.2c.6-.5 1.5 0 1.5.8v9.4c0 .8-.9 1.3-1.5.8l-3.9-3.2H4.2a1 1 0 0 1-1-1v-2.6a1 1 0 0 1 1-1.1Z" />
    <path className="glyph-wave-inner" d="M15.6 9.1a4.3 4.3 0 0 1 0 5.8" />
    <path className="glyph-wave-outer" d="M18.4 6.7a7.7 7.7 0 0 1 0 10.6" />
    {children}
  </Pen>
);

export const VolumeX = paths(() => [
  'M4.2 9.7h2.6l3.9-3.2c.6-.5 1.5 0 1.5.8v9.4c0 .8-.9 1.3-1.5.8l-3.9-3.2H4.2a1 1 0 0 1-1-1v-2.6a1 1 0 0 1 1-1.1Z',
  'M16 9.9l4.2 4.4',
  'M20.2 9.9 16 14.3',
]);

export const Plus = paths(() => ['M12 5.4v13.2', 'M5.4 12h13.2']);

export const Minus = paths(() => ['M5.4 12h13.2']);

export const Check = paths(() => ['M4.9 12.6 9.4 17.3 19.1 6.9']);

export const X = paths(() => ['M6.4 6.4l11.2 11.2', 'M17.6 6.4 6.4 17.6']);

export const Pencil = paths(() => [
  'M4.9 19.1l.8-4L15.4 5.4a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.9 18.3l-4 .8Z',
  'M13.9 7.1l3 3',
]);

export const Trash2 = paths(() => [
  'M4.6 6.7h14.8',
  'M9.4 6.5V4.8a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2v1.7',
  'M6.7 6.7l.8 11.9a1.8 1.8 0 0 0 1.8 1.6h5.4a1.8 1.8 0 0 0 1.8-1.6l.8-11.9',
  'M10.4 10.6v6',
  'M13.6 10.6v6',
]);

export const Save = paths(() => [
  'M5.4 3.8h9.6l4.6 4.6v10.8a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8V5.6a1.8 1.8 0 0 1 1.8-1.8Z',
  'M7.9 3.9v4.3h6',
  'M7.9 19.9v-5.1h8.2v5.1',
]);

export const Copy = paths(() => [
  box(8.6, 3.7, 11.7, 11.7, 3),
  'M15.9 15.6v2.6a2.6 2.6 0 0 1-2.6 2.6H5.5a2.6 2.6 0 0 1-2.6-2.6v-7.4a2.6 2.6 0 0 1 2.6-2.6h2.6',
]);

export const RotateCcw = paths(() => ['M3.7 12a8.3 8.3 0 1 0 2.6-6', 'M3.3 4.4v4.7h4.7']);

export const RefreshCw = paths(() => ['M20.3 12a8.3 8.3 0 1 1-2.6-6', 'M20.7 4.4v4.7h-4.7']);

export const Loader2 = paths(() => ['M12 3.9a8.1 8.1 0 1 0 8.1 8.1']);

export const Link2 = paths(() => [
  'M10.2 13.8a3.7 3.7 0 0 0 5.2 0l2.6-2.6a3.7 3.7 0 0 0-5.2-5.2l-1.3 1.3',
  'M13.8 10.2a3.7 3.7 0 0 0-5.2 0l-2.6 2.6a3.7 3.7 0 0 0 5.2 5.2l1.3-1.3',
]);

export const ExternalLink = paths(() => [
  'M13.7 4.4h5.9v5.9',
  'M19.5 4.5 11.8 12.2',
  'M17.4 14.1v3.5a2.6 2.6 0 0 1-2.6 2.6H6.5a2.6 2.6 0 0 1-2.6-2.6V9.3a2.6 2.6 0 0 1 2.6-2.6h3.6',
]);

export const Download = paths(() => [
  'M12 3.9v10.3',
  'M7.5 10 12 14.5 16.5 10',
  'M4.5 17.1v1.6a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-1.6',
]);

export const Upload = paths(() => [
  'M12 15.5V5.2',
  'M7.9 9.3 12 5.2l4.1 4.1',
  'M4.6 17v1.5a1.8 1.8 0 0 0 1.8 1.8h11.2a1.8 1.8 0 0 0 1.8-1.8V17',
]);

export const FileUp = paths(() => [
  'M6.4 3.8h7l4.6 4.6v10.8a1.8 1.8 0 0 1-1.8 1.8H6.4a1.8 1.8 0 0 1-1.8-1.8V5.6a1.8 1.8 0 0 1 1.8-1.8Z',
  'M13.2 3.9v4.6h4.6',
  'M11.9 16.6v-4.4',
  'M10 13.9l1.9-1.9 1.9 1.9',
]);

export const FileText = paths(() => [
  'M6.4 3.8h7l4.6 4.6v10.8a1.8 1.8 0 0 1-1.8 1.8H6.4a1.8 1.8 0 0 1-1.8-1.8V5.6a1.8 1.8 0 0 1 1.8-1.8Z',
  'M13.2 3.9v4.6h4.6',
  'M7.9 13h7',
  'M7.9 16.5h4.6',
]);

export const Music2 = paths(() => [
  'M14.5 4.9v10.3',
  ring(11.7, 17.5, 2.8),
  'M14.5 4.9c2.7.6 4 2.1 4 4.4',
]);

export const ListMusic = paths(() => [
  'M4 6.6h10.2',
  'M4 11.3h7.4',
  'M4 16h5.4',
  ring(17.2, 16.5, 2.3),
  'M19.5 16.5V7.6',
]);

export const ListPlus = paths(() => [
  'M4 6.6h9.2',
  'M4 11.3h9.2',
  'M4 16h6',
  'M17.6 12.4v6.2',
  'M14.5 15.5h6.2',
]);

export const Heart = ({ children, ...props }: IconProps) => (
  <Pen {...props}>
    <path d="M12 20.1c-3.6-2.5-7.7-5.4-7.7-9.4a4 4 0 0 1 7.3-2.4c.2.3.6.3.8 0a4 4 0 0 1 7.3 2.4c0 4-4.1 6.9-7.7 9.4Z" />
    {children}
  </Pen>
);

export const Film = ({ children, className, ...props }: IconProps) => {
  const clipId = useId();
  return (
    <Pen className={`wave-glyph wave-glyph--film${className ? ` ${className}` : ''}`} {...props}>
      <defs>
        <clipPath id={clipId}>
          <rect x="3.4" y="5.7" width="17.2" height="12.6" rx="2.3" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g className="glyph-film-strip">
          {}
          <path d="M7.5 4.8v26.4" />
          <path d="M16.5 4.8v26.4" />
          <path d="M3 12h18" />
          <path d="M3 8.8h4.5M16.5 8.8H21M3 15.2h4.5M16.5 15.2H21" />
          <path d="M3 18.6h18" />
          <path d="M3 24.6h18" />
          <path d="M3 21.4h4.5M16.5 21.4H21M3 27.8h4.5M16.5 27.8H21" />
        </g>
      </g>
      <path className="glyph-film-frame" d={box(2.9, 5.2, 18.2, 13.6, 3)} />
      {children}
    </Pen>
  );
};

export const Video = paths(() => [
  box(2.9, 6.4, 12.6, 11.2, 3),
  'M15.5 10.7l4.2-2.7a.9.9 0 0 1 1.4.7v6.6a.9.9 0 0 1-1.4.7l-4.2-2.7',
]);

export const Camera = paths(() => [
  'M5.5 9.2h1.9l1.4-2.3h4.4l1.4 2.3h1.9a1.8 1.8 0 0 1 1.8 1.8v6.9a1.8 1.8 0 0 1-1.8 1.8H5.5a1.8 1.8 0 0 1-1.8-1.8v-6.9a1.8 1.8 0 0 1 1.8-1.8Z',
  ring(12, 14.4, 3.1),
]);

export const Captions = paths(() => [
  box(2.9, 5.3, 18.2, 13.4, 3.2),
  'M9.9 10.3H8a1.7 1.7 0 0 0-1.7 1.7v1.4A1.7 1.7 0 0 0 8 15.1h1.9',
  'M16.4 10.3h-1.9a1.7 1.7 0 0 0-1.7 1.7v1.4a1.7 1.7 0 0 0 1.7 1.7h1.9',
]);

export const FolderOpen = paths(() => [
  'M3.4 8.7V6.6a1.8 1.8 0 0 1 1.8-1.8h3.5l2.3 2.4h6.4a1.8 1.8 0 0 1 1.8 1.8v1.7',
  'M3.9 9.3h16.5a.9.9 0 0 1 .9 1l-1.3 6.6a1.8 1.8 0 0 1-1.8 1.5H5.2a1.8 1.8 0 0 1-1.8-1.5L2.8 10.3a.9.9 0 0 1 1.1-1Z',
]);

export const FolderInput = paths(() => [
  'M3.6 8.6V6.6a1.8 1.8 0 0 1 1.8-1.8h3.5l2.3 2.4h6.3a1.8 1.8 0 0 1 1.8 1.8V17a1.8 1.8 0 0 1-1.8 1.8H5.4A1.8 1.8 0 0 1 3.6 17Z',
  'M8.4 13.6h6.4',
  'M12.6 11.1l2.5 2.5-2.5 2.5',
]);

export const FolderSearch = paths(() => [
  'M3.6 8.6V6.6a1.8 1.8 0 0 1 1.8-1.8h3.4l2.2 2.4h6a1.8 1.8 0 0 1 1.8 1.8v1.9',
  'M3.6 8.6V17a1.8 1.8 0 0 0 1.8 1.8h5.2',
  ring(15, 14.6, 3.5),
  'M17.6 17.2l2.9 2.9',
]);

export const HardDrive = paths(() => [
  box(2.9, 7.3, 18.2, 9.4, 3),
  'M6.4 11.8h1.2',
  'M10 11.8h1.2',
]);

export const ImagePlus = paths(() => [
  box(2.7, 4.5, 13.8, 13.8, 3.2),
  ring(7.4, 9.2, 1.6),
  'M4.3 16.4l4-4.2 3.3 3.5 2.4-2.4',
  'M19.3 15.2v5.2',
  'M16.7 17.8h5.2',
]);

export const Palette = paths(() => [
  'M12 3.8a8.2 8.2 0 1 0 0 16.4c1.5 0 2-1 2-1.9 0-1.6 1.1-2.4 2.5-2.4h1.4a2.2 2.2 0 0 0 2.2-2.2A8 8 0 0 0 12 3.8Z',
  dot(8.1, 9.6),
  dot(6.9, 13.4),
  dot(11.4, 7.3),
  dot(15.3, 8.4),
]);

export const Smartphone = paths(() => [box(6.5, 2.9, 11, 18.2, 3), 'M10.4 18.4h3.2']);

export const QrCode = paths(() => [
  box(4.2, 4.2, 5.2, 5.2, 1.2),
  box(14.6, 4.2, 5.2, 5.2, 1.2),
  box(4.2, 14.6, 5.2, 5.2, 1.2),
  'M14.6 14.6h2.2v2.2h-2.2z',
  'M18.6 18.6h1.2v1.2h-1.2z',
  'M14.6 19.8v-1.2',
  'M19.8 14.6h-1.2',
]);

export const WifiOff = paths(() => [
  'M3.5 6.6a13.4 13.4 0 0 1 5.9-2.4',
  'M14.6 4.3a13.4 13.4 0 0 1 5.9 2.3',
  'M6.6 9.9a9.4 9.4 0 0 1 3.1-1.2',
  'M14.4 8.8a9.4 9.4 0 0 1 3 1.1',
  'M9.2 13.4a5.2 5.2 0 0 1 2.8-.9',
  dot(12, 17.6),
  'M3.7 3.7l16.6 16.6',
]);

export const Info = paths(() => [ring(12, 12, 8.4), 'M12 11v5.1', dot(12, 7.9)]);

export const ShieldCheck = paths(() => [
  'M12 3.6 5.1 6.2v5.5c0 4 2.9 7.2 6.9 8.7 4-1.5 6.9-4.7 6.9-8.7V6.2Z',
  'M9.2 11.9l2.1 2.2 3.7-3.9',
]);

export const Users = paths(() => [
  ring(9.4, 8.4, 3.5),
  'M3.6 19.6c0-3.2 2.6-5.3 5.8-5.3s5.8 2.1 5.8 5.3',
  'M15.7 5.3a3.5 3.5 0 0 1 0 6.2',
  'M17.4 14.7c1.9.5 3 2 3 4.3',
]);

export const LocateFixed = paths(() => [
  ring(12, 12, 6.8),
  ring(12, 12, 2.3),
  'M12 2.6v3',
  'M12 18.4v3',
  'M2.6 12h3',
  'M18.4 12h3',
]);

export const ArrowLeft = paths(() => ['M19.2 12H4.9', 'M11 5.8 4.8 12 11 18.2']);

export const ArrowRight = paths(() => ['M4.8 12h14.3', 'M13 5.8 19.2 12 13 18.2']);

export const ArrowUp = paths(() => ['M12 19.1V4.9', 'M5.8 11.1 12 4.9l6.2 6.2']);

export const ArrowDown = paths(() => ['M12 4.9v14.2', 'M5.8 12.9 12 19.1l6.2-6.2']);

export const ArrowUpRight = paths(() => ['M7.4 16.6 16.5 7.5', 'M9.4 7.5h7.1v7.1']);

export const ChevronDown = paths(() => ['M6.3 9.5 12 15.2l5.7-5.7']);

export const ChevronLeft = paths(() => ['M14.5 5.9 8.4 12l6.1 6.1']);

export const ChevronRight = paths(() => ['M9.5 5.9 15.6 12l-6.1 6.1']);

export const CircleDashed = paths(() => [
  'M12 3.6a8.4 8.4 0 0 1 6.2 2.6',
  'M20.4 14.3a8.4 8.4 0 0 1-4.3 5.4',
  'M12 20.4a8.4 8.4 0 0 1-6.3-2.7',
  'M3.6 9.6A8.4 8.4 0 0 1 8 4.3',
]);

export const MoreVertical = paths(() => [dot(12, 6.2), dot(12, 12), dot(12, 17.8)]);

export const GripVertical = paths(() => [
  dot(9.3, 7),
  dot(14.7, 7),
  dot(9.3, 12),
  dot(14.7, 12),
  dot(9.3, 17),
  dot(14.7, 17),
]);

export const SlidersHorizontal = paths(() => [
  'M3.9 7.7h16.2',
  'M3.9 16.3h16.2',
  ring(8.7, 7.7, 2.3),
  ring(15.1, 16.3, 2.3),
]);

export const Disc3 = Record;

export const AudioLines = Remix;
