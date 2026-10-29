/**
 * The word "Wave", drawn in Wave's own line.
 *
 * The mark is two crests of a wave; the rest of the word is the same pen
 * continuing — one stroke width, round caps, letters built from arcs and
 * corners rather than from a font. It is a path, not text, because no typeface
 * on a device has this shape: a screenshot of it has to look the same on a
 * phone, on Windows and in the browser. `currentColor` keeps it tinted by
 * whatever is playing, exactly like the mark on its own.
 */
export function WaveWordmark({ className = 'wave-wordmark' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 32"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={4.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* W: the crests of the mark. */}
      <path d="M4 8C7 8 7 24 12 24C17 24 17 8 20 8C23 8 23 24 28 24C33 24 33 8 36 8" />
      {/* a: one round bowl and a stem that meets it. */}
      <path d="M59 9v14" />
      <path d="M52 9a7 7 0 1 0 0 14a7 7 0 0 0 0-14" />
      {/* v: two strokes to a point. */}
      <path d="M68 9L75 23L82 9" />
      {/* e: a bar and an open bowl, ending where the stroke began. */}
      <path d="M90 16h14" />
      <path d="M104 16A7 7 0 1 0 102.36 20.5" />
    </svg>
  );
}
