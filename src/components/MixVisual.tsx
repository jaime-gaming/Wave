import type { CSSProperties } from 'react';
import { Artwork } from './Artwork';
import type { usePlayer } from '../hooks/usePlayer';

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/**
 * The join, drawn the way it is heard.
 *
 * The audio does two separate things — the new song arrives first, the old song
 * leaves later — so the picture does the same instead of a plain cross-fade. The
 * incoming cover opens from its centre while the outgoing one settles back,
 * loses a little colour and steps behind it; the two are tied to one progress
 * value, so the sleeve and the blend cannot drift apart.
 */
export function MixVisual({
  blend,
  artworkClassName = 'player-artwork',
}: {
  blend: ReturnType<typeof usePlayer>['blend'];
  artworkClassName?: string;
}) {
  if (!blend) return null;
  const progress = Math.max(0, Math.min(1, blend.progress));
  // Arrival finishes early (that is when the new song is at level) and the
  // departure only starts once both songs are already playing together.
  const arrive = smooth(progress / 0.45);
  const leave = smooth((progress - 0.38) / 0.62);
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
