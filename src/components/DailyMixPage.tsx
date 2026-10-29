import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Shuffle, ListPlus } from 'lucide-react';
import type { DailyMix } from '../domain/dailyMixes';
import { formatTime, type Track } from '../domain/types';
import { playlistIcon } from '../domain/playlistVisual';
import { Artwork } from './Artwork';
import { LibraryContent } from './LibraryContent';
export interface MixSelection {
  mix: DailyMix;
  number: number;
}
export function DailyMixPage({
  selection,
  tracks,
  currentId,
  playing,
  onBack,
  onPlay,
  onShuffle,
  onFavorite,
  onMore,
  onArtist,
  onAlbum,
  onSave,
}: {
  selection: MixSelection;
  tracks: Track[];
  currentId?: string;
  playing: boolean;
  onBack: () => void;
  onPlay: (tracks: Track[], id: string) => void;
  onShuffle: (tracks: Track[]) => void;
  onFavorite: (track: Track) => void;
  onMore: (track: Track) => void;
  onArtist: (name: string) => void;
  onAlbum: (track: Track) => void;
  onSave: (tracks: Track[]) => Promise<boolean>;
}) {
  const { mix, number } = selection;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const songs = mix.tracks.flatMap((t) => (byId.has(t.id) ? [byId.get(t.id)!] : []));
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest('main')?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <section className="daily-mix-page" aria-label={`Daily mix ${number} playlist`}>
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={20} />
        Back to Home
      </button>
      <div className="daily-mix-header">
        <Artwork
          track={{
            title: mix.label,
            album: '',
            artwork: songs.find((t) => t.artwork)?.artwork ?? playlistIcon(mix.id, mix.label),
          }}
        />
        <div className="daily-mix-heading">
          <h2 tabIndex={-1} ref={heading}>
            Daily mix {number}
          </h2>
          <p className="daily-mix-label">{mix.label}</p>
          <p className="daily-mix-meta">
            {songs.length} {songs.length === 1 ? 'song' : 'songs'} ·{' '}
            {formatTime(songs.reduce((s, t) => s + t.duration, 0))}
          </p>
        </div>
      </div>
      <div className="daily-mix-actions">
        <button
          className="filled-button"
          disabled={!songs.length}
          onClick={() => onPlay(songs, songs[0].id)}
        >
          <Play size={20} />
          Play mix
        </button>
        <button className="tonal-button" disabled={!songs.length} onClick={() => onShuffle(songs)}>
          <Shuffle size={20} />
          Shuffle
        </button>
        <button
          className="tonal-button"
          disabled={saving || !songs.length}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              if (!(await onSave(songs)))
                setError('Could not save this playlist. Please try again.');
            } catch {
              setError('Could not save this playlist. Please try again.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <ListPlus size={20} />
          {saving ? 'Saving…' : 'Save as playlist'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <LibraryContent
        tracks={songs}
        total={songs.length}
        loading={false}
        busy={false}
        view="songs"
        query=""
        group={null}
        onGroup={() => {}}
        onClearSearch={() => {}}
        onImport={() => {}}
        currentId={currentId}
        playing={playing}
        onPlay={onPlay}
        onFavorite={onFavorite}
        onMore={onMore}
        onArtist={onArtist}
        onAlbum={onAlbum}
      />
    </section>
  );
}
