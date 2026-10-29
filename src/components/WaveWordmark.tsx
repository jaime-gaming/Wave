/**
 * The word "Wave", drawn in Wave's own line.
 *
 * The mark is two crests of a wave; the rest of the word is the same pen
 * continuing — one stroke width, round caps, letters built from arcs and
 * corners rather than from a font. It is a path, not text, because no typeface
 * on a device has this shape: a screenshot of it has to look the same on a
 * phone, on Windows and in the browser. `currentColor` keeps it tinted by
 * whatever is playing, exactly like the mark on its own.
 *
 * Two drawings live here. The full word is what the sidebar shows when there is
 * room for a word; the lone W is the same first letter, for the narrow rail and
 * anywhere the name would have to shrink to be readable. They are the same
 * curves, so the switch never looks like two different logos.
 */
const W =
  'M4 8.6C7 8.6 7 23.4 12 23.4C17 23.4 17 8.6 20 8.6C23 8.6 23 23.4 28 23.4C33 23.4 33 8.6 36 8.6';

/** The word: W, then a bowl-and-stem a, a two-stroke v, and an e with its bar. */
const WORD = [
  W,
  // a: the stem first, then the bowl that closes onto it.
  'M59 9.4v13.2',
  'M52 9a7 7 0 1 0 0 14a7 7 0 0 0 0-14',
  // v: two strokes meeting at a round point.
  'M67 9.2L75 23L83 9.2',
  // e: a crossbar that sits a hair off level, and a bowl whose stroke leaves
  // through the lower right rather than closing into a ring.
  'M91.06 16.9H104.9',
  'M104.9 16.9A7 7 0 1 0 101.84 21.87',
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
      strokeWidth={4.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function WaveWordmark({
  variant = 'full',
  className,
}: {
  /** `full` is the whole word; `mark` is the W on its own. */
  variant?: 'full' | 'mark';
  className?: string;
}) {
  return variant === 'mark' ? (
    <Pen
      paths={[W]}
      viewBox="1.8 6 37 20"
      className={className ?? 'wave-wordmark wave-wordmark-mark'}
    />
  ) : (
    <Pen
      paths={WORD}
      viewBox="1 6 114 20"
      className={className ?? 'wave-wordmark wave-wordmark-full'}
    />
  );
}
