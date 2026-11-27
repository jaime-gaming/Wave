import { memo } from 'react';

export const MusicLighting = memo(function MusicLighting({ className }: { className: string }) {
  return (
    <div className={`${className} music-lighting`} aria-hidden="true">
      <i className="music-lighting__bass" />
      <i className="music-lighting__body" />
      <i className="music-lighting__air" />
    </div>
  );
});
