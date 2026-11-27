const W = 'M4 7C7 7 7 23 12 23C17 23 17 7 20 7C23 7 23 23 28 23C33 23 33 7 36 7';

const WORD = [
  W,

  'M47.2 10.8a6.1 6.1 0 1 0 0 12.2a6.1 6.1 0 1 0 0-12.2',

  'M53.3 11.4V22.2',

  'M57.6 10.9C57.6 17.4 61.2 23 63.6 23C66 23 69.6 17.4 69.6 10.9',

  'M84.6 16.2H72.2',
  'M84.6 16.2A6.4 6.4 0 1 0 82.4 21.6',
];

function Pen({
  paths,
  viewBox,
  className,
}: {
  paths: string[];
  viewBox: string;
  className: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d, index) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          transform={
            paths.length > 1 && index > 0
              ? `translate(${index < 3 ? 1.4 : index === 3 ? 3 : 8.5} 0)`
              : undefined
          }
        />
      ))}
    </svg>
  );
}

export function WaveWordmark({
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'mark';
  className?: string;
}) {
  return variant === 'mark' ? (
    <Pen
      paths={[W]}
      viewBox="1.5 4.6 37 21"
      className={className ?? 'wave-wordmark wave-wordmark-mark'}
    />
  ) : (
    <Pen
      paths={WORD}
      viewBox="1 4 96 21.2"
      className={className ?? 'wave-wordmark wave-wordmark-full'}
    />
  );
}
