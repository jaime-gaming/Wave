import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { dailyMixes, localDayKey } from '../domain/dailyMixes';
import { playlistIcon } from '../domain/playlistVisual';
import type { Track } from '../domain/types';
import { Artwork } from './Artwork';
export function DailyMixes({
  tracks,
  onPlay,
}: {
  tracks: Track[];
  onPlay: (tracks: Track[], id: string) => void;
}) {
  const [day, setDay] = useState(localDayKey);
  useEffect(() => {
    const refresh = () => setDay(localDayKey());
    const now = new Date();
    const timer = setTimeout(
      refresh,
      Math.max(
        1000,
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime(),
      ),
    );
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [day]);
  const mixes = useMemo(() => dailyMixes(tracks, day), [tracks, day]);
  if (!mixes.length) return null;
  return (
    <section className="daily-mixes" aria-label="Daily mixes">
      <div className="section-heading">
        <h2>Daily mixes</h2>
        <p>From your local library</p>
      </div>
      <div className="daily-mix-grid">
        {mixes.map((mix, index) => (
          <button
            key={mix.id}
            className="daily-mix-card"
            aria-label={`Play Daily mix ${index + 1}: ${mix.label}`}
            onClick={() => onPlay(mix.tracks, mix.tracks[0].id)}
          >
            <Artwork
              track={{
                title: mix.label,
                album: '',
                artwork:
                  mix.tracks.find((t) => t.artwork)?.artwork ?? playlistIcon(mix.id, mix.label),
              }}
            />
            <span className="daily-mix-copy">
              <strong>Daily mix {index + 1}</strong>
              <span title={mix.label}>{mix.label}</span>
              <small>
                {mix.tracks.length} songs · {mix.basis === 'genre' ? 'Genre tags' : 'Artist tags'}
              </small>
            </span>
            <Play size={20} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
