import type { CSSProperties } from 'react';
import { Artwork } from './Artwork';
import type { MixCue } from '../ui/mixCue';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/**
 * The cover while the mix is being announced.
 *
 * One cover, not two. The sleeve that is playing stays where it is and simply
 * takes a breath — a slow push in and a slight dim — while a soft band of light
 * crosses it. Splitting it in half to show the next sleeve underneath looked
 * busy next to the word, and it read as a glitch rather than an announcement:
 * the announcement is the word, and the blend itself is the transition.
 *
 * Nothing here is a hard step: the same progress value drives the zoom, the dim
 * and the sweep, and the picture at the end of the lead-in is exactly the
 * picture the blend starts from.
 */
export function MixCueVisual({
  cue,
  artworkClassName = 'player-artwork',
}: {
  cue: MixCue;
  artworkClassName?: string;
}) {
  const progress = clamp01(cue.progress);
  // Rises over the whole lead-in, so the cover is never still and never jumps.
  const breath = smooth(progress);
  const style = { '--cue-progress': progress, '--cue-breath': breath } as CSSProperties;
  return (
    <div className="mix-cue" aria-hidden="true" style={style}>
      <div className="mix-cue-cover">
        <Artwork track={cue.from} className={artworkClassName} />
      </div>
    </div>
  );
}

/**
 * The word itself: small, quiet, and the only place Wave says "Mixing".
 *
 * The light is inside the word, not around it. A soft highlight travels across
 * the letters — the letters themselves brighten as it passes and go back to
 * grey behind it — then rests before going round again. That is the whole
 * animation: no bars, no line, no border, nothing beside the word.
 *
 * The sweep is a `background-clip: text` gradient with a static grey underneath,
 * so a browser that cannot clip to text still shows a plain word rather than a
 * hole where the word should be. Reduced motion stops it on the first frame.
 */
export function MixCueLabel({ cue }: { cue: MixCue }) {
  return (
    <span
      className="mix-cue-label"
      role="status"
      aria-label={`Mixing into ${cue.to.title} by ${cue.to.artist}`}
    >
      <span className="mix-cue-word" aria-hidden="true">
        Mixing
      </span>
    </span>
  );
}
