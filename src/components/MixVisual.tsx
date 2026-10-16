import { Artwork } from './Artwork';
import type { usePlayer } from '../hooks/usePlayer';
export function MixVisual({
  blend,
  artworkClassName = 'player-artwork',
}: {
  blend: ReturnType<typeof usePlayer>['blend'];
  artworkClassName?: string;
}) {
  if (!blend) return null;
  return (
    <div className="mix-artwork" aria-hidden="true">
      <div
        className="mix-outgoing"
        style={{
          opacity: 1,
        }}
      >
        <Artwork track={blend.from} className={artworkClassName} />
      </div>
      <div
        className="mix-incoming"
        style={{
          opacity: blend.progress,
        }}
      >
        <Artwork track={blend.to} className={artworkClassName} />
      </div>
    </div>
  );
}
