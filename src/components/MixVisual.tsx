import type { CSSProperties } from 'react';
import { Artwork } from './Artwork';
import type { usePlayer } from '../hooks/usePlayer';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/**
 * The join, drawn the way it is heard.
 *
 * The audio does two separate things — the new song arrives first, the old song
 * leaves later — so the picture does the same instead of a plain cross-fade. The
 * incoming cover settles into place from slightly large while the outgoing one
 * sinks back, loses colour and goes; one progress value drives both, so the
 * sleeve and the blend cannot drift apart.
 *
 * What it deliberately does not do is show both covers at full strength for
 * half the overlap, or open the new one through a circle: the first reads as two
 * album covers stacked on top of each other, the second as a hole in the
 * picture. The incoming cover is invisible until the old one has started to
 * leave, and the only ornament is a band of light crossing the sleeve once.
 */
export function MixVisual({
  blend,
  artworkClassName = 'player-artwork',
}: {
  blend: ReturnType<typeof usePlayer>['blend'];
  artworkClassName?: string;
}) {
  if (!blend) return null;
  const progress = clamp01(blend.progress);
  // The arrival is a slow settle rather than a pop, and it starts at the very
  // beginning of the overlap, which is when the incoming song becomes audible.
  const arrive = smooth(progress / 0.55);
  // The outgoing cover only starts to go once the new one is already there.
  const leave = smooth((progress - 0.3) / 0.7);
  const style = {
    '--mix-progress': progress,
    '--mix-arrive': arrive,
    '--mix-leave': leave,
    // Brightest halfway, where the two records are actually playing together.
    '--mix-peak': 1 - Math.abs(2 * progress - 1),
  } as CSSProperties;
  return (
    <div className="mix-artwork" aria-hidden="true" style={style}>
      <div className="mix-outgoing">
        <Artwork track={blend.from} className={artworkClassName} />
      </div>
      <div className="mix-incoming">
        <Artwork track={blend.to} className={artworkClassName} />
      </div>
      <span className="mix-seam" />
    </div>
  );
}
