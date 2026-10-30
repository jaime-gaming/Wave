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
 * The rest of the name, set in the same pen on the same baseline.
 *
 * Every letter is one monoline stroke with the same weight as the mark, so the
 * word reads as one hand rather than a logo followed by type: an `a` whose stem
 * settles into the baseline like a wave, a `v` that is a trough of the same wave
 * instead of two straight arms, and an `e` whose bar runs into a bowl that lifts
 * away at the end. Nothing here is a font glyph, so it looks identical in the
 * browser, on a phone and on Windows.
 */
const WORD = [
  W,
  // a — bowl, then a stem that eases into the baseline.
  'M60 10.2C60 16.4 60 21.4 61.6 22.4',
  'M53 10a7 7 0 1 0 0 13a7 7 0 0 0 0-13',
  // v — one trough, the same curve as the W's dips.
  'M68 10.4C68.8 10.4 71.6 23.4 75.3 23.4C79 23.4 81.8 10.4 82.6 10.4',
  // e — a bar, and a bowl that opens out to the lower right.
  'M91 17.2H105',
  'M105 17.2A7 7 0 1 0 103.2 20.4',
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
      viewBox="1 4.8 38 21"
      className={className ?? 'wave-wordmark wave-wordmark-mark'}
    />
  ) : (
    <Pen
      paths={WORD}
      viewBox="1 4.8 112 21"
      className={className ?? 'wave-wordmark wave-wordmark-full'}
    />
  );
}
