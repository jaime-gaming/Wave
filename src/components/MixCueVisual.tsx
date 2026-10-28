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
  const style = {
    '--cue-progress': progress,
    '--cue-breath': breath,
    // Brightest just before the handover, where the word matters most.
    '--cue-glow': smooth((progress - 0.45) / 0.55),
  } as CSSProperties;
  return (
    <div className="mix-cue" aria-hidden="true" style={style}>
      <div className="mix-cue-cover">
        <Artwork track={cue.from} className={artworkClassName} />
      </div>
      <span className="mix-cue-sheen" />
    </div>
  );
}

/**
 * The word itself: small, quiet, and the only place Wave says "Mixing".
 *
 * Grey capitals and one thin line of light that crosses left to right, pauses,
 * and crosses again. Nothing moves, nothing spins, nothing pulses: the line is
 * the only thing in the interface that is not standing still.
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
      <span className="mix-cue-line" aria-hidden="true" />
    </span>
  );
}
