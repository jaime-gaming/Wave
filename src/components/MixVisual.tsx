import type { CSSProperties } from 'react';
import { Artwork } from './Artwork';
import type { usePlayer } from '../hooks/usePlayer';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export function MixVisual({
  blend,
  artworkClassName = 'player-artwork',
}: {
  blend: ReturnType<typeof usePlayer>['blend'];
  artworkClassName?: string;
}) {
  if (!blend) return null;
  const progress = clamp01(blend.progress);

  const arrive = smooth(progress / 0.55);

  const leave = smooth((progress - 0.3) / 0.7);
  const style = {
    '--mix-progress': progress,
    '--mix-arrive': arrive,
    '--mix-leave': leave,

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
