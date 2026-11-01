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
 * The animation is the word doing what a blend does. Each letter lights in turn
 * — a highlight that travels left to right and never restarts in the middle of
 * the lead-in — and as the handover gets closer the letters tighten by a hair
 * and the glow behind them grows, so the announcement is *approaching*
 * something instead of looping until the song happens to end.
 *
 * Every letter is its own span so the light can be a per-letter delay rather
 * than a sliding gradient: a gradient across a whole word can only cross it at
 * one constant speed, while letters can wait, hurry and settle. The word is
 * still one string for a screen reader, which hears the sentence and not the
 * parts.
 *
 * Reduced motion keeps the word still and readable: no sweep, no tightening.
 */
export function MixCueLabel({ cue }: { cue: MixCue }) {
  const progress = Math.max(0, Math.min(1, cue.progress));
  const word = 'Mixing';
  return (
    <span
      className="mix-cue-label"
      role="status"
      aria-label={`Mixing into ${cue.to.title} by ${cue.to.artist}`}
    >
      <span
        className="mix-cue-word"
        aria-hidden="true"
        style={{ '--cue-progress': progress } as CSSProperties}
      >
        {[...word].map((letter, index) => (
          <span
            className="mix-cue-letter"
            key={`${letter}-${index}`}
            style={{ '--letter-index': index, '--letters': word.length } as CSSProperties}
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}
