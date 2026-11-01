import type { ReactElement, ReactNode, SVGProps } from 'react';

/**
 * Wave's own icons.
 *
 * A library of icons bought by the dozen all share one problem: they are drawn
 * on a grid, at a weight, with corners that never touch, and a screen full of
 * them reads as a template. These are drawn instead the way the wordmark is —
 * one pen, round caps, one stroke weight, on and off the grid wherever the shape
 * wants it. A record is a circle with a gap where the light falls on it, a home
 * is a rooftop over a doorway, the speaker is a cone with two arcs leaving it.
 *
 * They are deliberately not literal: the point is that they look drawn by the
 * same hand as the rest of Wave, at any size, in whatever colour the music is.
 */
type Glyph = (props: SVGProps<SVGSVGElement> & { size?: number }) => ReactElement;

function Pen({
  size = 22,
  children,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
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

/** A rooftop with a doorway under it: home. */
export const HomeGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M3.4 10.6C6.2 8 9 5.4 11.2 3.9a1.4 1.4 0 0 1 1.6 0c2.2 1.5 5 4.1 7.8 6.7" />
    <path d="M5.4 12.2v6.3a1.6 1.6 0 0 0 1.6 1.6h10a1.6 1.6 0 0 0 1.6-1.6v-6.3" />
    <path d="M9.7 20.1v-4a2.3 2.3 0 0 1 4.6 0v4" />
  </Pen>
);

/** Three sleeves leaning together: the library. */
export const LibraryGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M4.2 6.2v11.1a1.7 1.7 0 0 0 1.7 1.7h4.4" />
    <path d="M8.6 3.9v13.4a1.7 1.7 0 0 0 1.7 1.7h3" />
    <path d="M13.8 3.2l3.9 1.1a1.7 1.7 0 0 1 1.2 2.1l-2.6 9.4a1.7 1.7 0 0 1-2.1 1.2L12.3 16" />
  </Pen>
);

/** A magnifier tilted the way a hand holds one. */
export const SearchGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M10.7 4.3a6.1 6.1 0 1 1-4.4 1.9 6 6 0 0 1 4.4-1.9" />
    <path d="M15.3 15.1l1.1 1.1 3.4 3.3" />
  </Pen>
);

/** A cog with four teeth, drawn as a ring and four short spokes. */
export const SettingsGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M12 8.7a3.3 3.3 0 1 1-2.3 1a3.3 3.3 0 0 1 2.3-1" />
    <path d="M12 3.3v2.1M12 18.6v2.1M3.3 12h2.1M18.6 12h2.1" />
    <path d="M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5" />
  </Pen>
);

/** A heart with one flat shoulder, so it reads as drawn rather than stamped. */
export const HeartGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M12 20.1c-3.6-2.5-7.7-5.4-7.7-9.4a4 4 0 0 1 7.3-2.4c.2.3.6.3.8 0a4 4 0 0 1 7.3 2.4c0 4-4.1 6.9-7.7 9.4Z" />
  </Pen>
);

/** A record with the light across it. */
export const RecordGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M21 12a9 9 0 0 1-9 9 9 9 0 1 1 6.4-15.4" />
    <path d="M15.6 12.9a3.7 3.7 0 1 1-2.7-2.6" />
  </Pen>
);

/** A list that is slightly uneven: a queue written by a person. */
export const QueueGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M4 6.4h11.4M4 11.9h8.2M4 17.4h9.6" />
    <path d="M19.1 13.6v5.1M17 12.6l2.1-1.1" />
  </Pen>
);

/** Play: a triangle with a slightly bowed edge. */
export const PlayGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M7.6 4.9c0-.9 1-1.4 1.7-.9l9.1 6.2c.7.5.7 1.5 0 2l-9.1 6.2c-.7.5-1.7 0-1.7-.9Z" />
  </Pen>
);

export const PauseGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M9.4 4.6c0-.6.5-1.1 1.1-1.1h.4c.6 0 1.1.5 1.1 1.1v14.8c0 .6-.5 1.1-1.1 1.1h-.4a1.1 1.1 0 0 1-1.1-1.1Z" />
    <path d="M12.9 4.6c0-.6.5-1.1 1.1-1.1h.4c.6 0 1.1.5 1.1 1.1v14.8c0 .6-.5 1.1-1.1 1.1h-.4a1.1 1.1 0 0 1-1.1-1.1Z" />
  </Pen>
);

/** A speaker cone with two arcs leaving it. */
export const SoundGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M4.3 9.6h2.6l4-3.2c.6-.5 1.4 0 1.4.7v9.8c0 .7-.8 1.2-1.4.7l-4-3.2H4.3a1 1 0 0 1-1-1v-2.8a1 1 0 0 1 1-1Z" />
    <path d="M15.6 9.1a4.2 4.2 0 0 1 0 5.8" />
    <path d="M18.4 6.7a7.7 7.7 0 0 1 0 10.6" />
  </Pen>
);

export const MutedGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M4.3 9.6h2.6l4-3.2c.6-.5 1.4 0 1.4.7v9.8c0 .7-.8 1.2-1.4.7l-4-3.2H4.3a1 1 0 0 1-1-1v-2.8a1 1 0 0 1 1-1Z" />
    <path d="M16.2 9.8l4.1 4.4M20.3 9.8l-4.1 4.4" />
  </Pen>
);

/** The waveform that stands for the automatic mix. */
export const RemixGlyph: Glyph = (props) => (
  <Pen {...props}>
    <path d="M3.2 12v.1M6.4 9.2v5.6M9.6 6.4v11.2M12.8 8.6v6.8M16 4.9v14.2M19.2 9.8v4.4M21.6 11.4v1.2" />
  </Pen>
);
