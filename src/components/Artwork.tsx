import { memo } from 'react';
import { Music2 } from 'lucide-react';
import type { Track } from '../domain/types';

export const Artwork = memo(function Artwork({
  track,
  className = '',
}: {
  track?: Pick<Track, 'artwork' | 'album' | 'title'>;
  className?: string;
}) {
  return (
    <div className={`artwork ${className}`} aria-hidden="true">
      {track?.artwork ? (
        <img src={track.artwork} alt="" loading="lazy" decoding="async" />
      ) : (
        <Music2 strokeWidth={1.5} />
      )}
    </div>
  );
});
