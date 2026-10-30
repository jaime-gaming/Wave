import { memo } from 'react';

/**
 * Soft spectral illumination: no wave silhouettes or foreground shapes.
 *
 * Memoised on purpose. It sits inside the player, which re-renders ten times a
 * second while a song plays because the clock is part of its props; this markup
 * takes nothing but a class name, so it is built once per player and left
 * alone. On a phone that is the difference between three elements per tick and
 * none.
 */
export const MusicLighting = memo(function MusicLighting({ className }: { className: string }) {
  return (
    <div className={`${className} music-lighting`} aria-hidden="true">
      <i className="music-lighting__bass" />
      <i className="music-lighting__body" />
      <i className="music-lighting__air" />
    </div>
  );
});
