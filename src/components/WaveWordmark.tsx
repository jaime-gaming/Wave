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
  // v — the trough of the W, at the height of the letters beside it: two arms
  // that leave the x-height straight down and meet once, in the middle, with the
  // same vertical tangents the W's dips have. Drawn symmetrically about 63.6 so
  // the letter cannot lean; the previous one had its right arm half the weight of
  // its left and a hinge at the bottom, which is what read as a broken V.
  'M57.6 10.9C57.6 17.4 61.2 23 63.6 23C66 23 69.6 17.4 69.6 10.9',
  // e — the bar, then a bowl that leaves the stroke open towards the bottom.
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
      viewBox="1 4 87 21"
      className={className ?? 'wave-wordmark wave-wordmark-full'}
    />
  );
}
