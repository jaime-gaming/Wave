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
/**
 * The W is the mark the app has always had: two crests of one stroke, drawn
 * with round caps. It is not a letter with a wave in it — it is the wave.
 */
const W = 'M4 7C7 7 7 23 12 23C17 23 17 7 20 7C23 7 23 23 28 23C33 23 33 7 36 7';

/**
 * The rest of the name, on the same baseline and in the same pen.
 *
 * Each letter is one monoline stroke at the mark's own weight, so the word reads
 * as one hand rather than a logo followed by type: an `a` that is a bowl with a
 * stem set against it, a `v` that is a trough of the same wave as the W instead
 * of two straight arms, and an `e` whose bar runs into a bowl that lifts away at
 * the end. Nothing here is a font glyph, so it looks identical in the browser, on
 * a phone and on Windows.
 */
const WORD = [
  W,
  // a — one closed bowl, drawn in two half turns so the start and the end meet.
  'M47.2 10.8a6.1 6.1 0 1 0 0 12.2a6.1 6.1 0 1 0 0-12.2',
  // a — the stem, set against the bowl and stopping a little short of it.
  'M53.3 11.4V22.2',
  // v — one trough, the same curve as the dips in the W.
  'M62 10.9C63.4 15.2 65.2 23.3 66.9 23.3C68.6 23.3 70.4 15.2 71.8 10.9',
  // e — the bar, then a bowl that leaves the stroke open towards the bottom.
  'M89.2 16.4H76.6',
  'M89.2 16.4A6.3 6.3 0 1 0 87.6 21.7',
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
      viewBox="1.5 4.6 37 21"
      className={className ?? 'wave-wordmark wave-wordmark-mark'}
    />
  ) : (
    <Pen
      paths={WORD}
      viewBox="0.5 4.4 91.5 21.4"
      className={className ?? 'wave-wordmark wave-wordmark-full'}
    />
  );
}
