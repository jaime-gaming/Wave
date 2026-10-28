import type { CSSProperties } from 'react';
import { Artwork } from './Artwork';
import type { MixCue } from '../ui/mixCue';

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/**
 * The mix, announced.
 *
 * A handover used to arrive without warning. Here the cover being played splits
 * down the middle and the two halves step aside, so the next song's sleeve is
 * already there when the join happens — the same move Apple Music makes when two
 * songs meet, because a split tells you "two records" faster than any label.
 *
 * The halves stay almost closed for most of the lead-in and open over the last
 * few seconds, so the picture is not exhausted before the sound arrives. One
 * `progress` value drives everything, and with reduced motion it degrades to a
 * quiet cross-dissolve.
 */
export function MixCueVisual({
  cue,
  artworkClassName = 'player-artwork',
}: {
  cue: MixCue;
  artworkClassName?: string;
}) {
  const progress = Math.max(0, Math.min(1, cue.progress));
  // Nothing moves until the join is close; then it opens quickly and evenly.
  const open = smooth((progress - 0.7) / 0.3);
  const style = {
    '--cue-progress': progress,
    '--cue-open': open,
    '--cue-breathe': 0.5 + 0.5 * Math.sin(progress * Math.PI * 6),
  } as CSSProperties;
  return (
    <div className="mix-cue" aria-hidden="true" style={style}>
      <div className="mix-cue-next">
        <Artwork track={cue.to} className={artworkClassName} />
      </div>
      <div className="mix-cue-half mix-cue-left">
        <Artwork track={cue.from} className={artworkClassName} />
      </div>
      <div className="mix-cue-half mix-cue-right">
        <Artwork track={cue.from} className={artworkClassName} />
      </div>
      <span className="mix-cue-seam" />
    </div>
  );
}

/** The word itself: small, quiet, and the only place Wave says "Mixing". */
export function MixCueLabel({ cue }: { cue: MixCue }) {
  return (
    <span
      className="mix-cue-label"
      role="status"
      aria-label={`Mixing into ${cue.to.title} by ${cue.to.artist}`}
    >
      <span className="mix-cue-waves" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="mix-cue-word">Mixing</span>
      {/* A thin line of light crosses the word, pauses, and crosses again. */}
      <span className="mix-cue-scan" aria-hidden="true" />
    </span>
  );
}
