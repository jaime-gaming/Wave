import { memo } from 'react';
import { collectAlbums, albumKey } from '../domain/collections';
import { AlbumCard } from './CollectionCard';
import { AnimatePresence } from 'motion/react';
import { AnimatedListItem } from './AnimatedListItem';
import { PlayingIndicator } from './PlayingIndicator';
import {
  AudioLines,
  ArrowLeft,
  Disc3,
  FolderOpen,
  Heart,
  MoreVertical,
  Music2,
  Play,
  Plus,
  Search,
} from 'lucide-react';
import { Artwork } from './Artwork';
import { formatTime, type LibraryView, type Track } from '../domain/types';

export const LibraryContent = memo(function LibraryContent({
  loading,
  tracks,
  total,
  view,
  query,
  group,
  onGroup,
  onClearSearch,
  onImport,
  busy,
  currentId,
  playing,
  onPlay,
  onFavorite,
  onMore,
  onArtist,
  onAlbum,
  hideGroupHeader = false,
}: {
  onArtist?: (name: string) => void;
  onAlbum?: (track: Track) => void;
  hideGroupHeader?: boolean;
  loading: boolean;
  tracks: Track[];
  total: number;
  view: LibraryView;
  query: string;
  group: string | null;
  onGroup: (group: string | null) => void;
  onClearSearch: () => void;
  onImport: () => void;
  busy: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (tracks: Track[], id: string) => void;
  onFavorite: (track: Track) => void;
  onMore: (track: Track) => void;
}) {
  const grouped = (view === 'albums' || view === 'artists') && !group;
  const groups = new Map<string, Track[]>();
  if (grouped && view === 'artists')
    for (const track of tracks) {
      const key = view === 'artists' ? track.artist : albumKey(track);
      const songs = groups.get(key);
      if (songs) songs.push(track);
      else groups.set(key, [track]);
    }
  if (loading)
    return (
      <div className="empty-state">
        <AudioLines className="loading-icon" size={32} />
        <h2>Loading library</h2>
      </div>
    );
  if (!total && view !== 'playlists')
    return (
      <div className="empty-state">
        <div className="empty-symbol">
          <FolderOpen size={42} strokeWidth={1.4} />
        </div>
        <h2>No songs yet</h2>
        <p>Add audio files from your device.</p>
        <button className="filled-button" disabled={busy} onClick={onImport}>
          <Plus size={20} />
          Add music
        </button>
        <span className="supported-formats">MP3, WAV, M4A, OGG &amp; FLAC · up to 200 MB</span>
      </div>
    );
  if (!tracks.length)
    return (
      <div className="empty-state">
        <div className="empty-symbol">
          {query ? (
            <Search size={38} />
          ) : view === 'favorites' ? (
            <Heart size={38} />
          ) : (
            <Music2 size={38} />
          )}
        </div>
        <h2>
          {query
            ? 'No tracks found.'
            : view === 'favorites'
              ? 'No favorites yet'
              : view === 'playlists'
                ? 'This playlist is empty'
                : 'No songs in this collection'}
        </h2>
        <p>
          {query
            ? 'Try a different title, artist, or album.'
            : view === 'playlists'
              ? 'Use Add songs to build this playlist.'
              : view === 'favorites'
                ? 'Use the heart on a song to add it here.'
                : 'Choose another collection or add music to your library.'}
        </p>
        {query && (
          <button className="tonal-button" onClick={onClearSearch}>
            Clear search
          </button>
        )}
      </div>
    );
  return (
    <>
      {group && !hideGroupHeader && (
        <div className="group-heading">
          <button
            className="icon-button"
            onClick={() => onGroup(null)}
            aria-label={`Back to ${view}`}
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h2>{view === 'albums' ? (tracks[0]?.album ?? 'Album') : group}</h2>
            <p>
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
            </p>
          </div>
        </div>
      )}
      {grouped ? (
        <div className={`group-grid ${view === 'artists' ? 'artist-grid' : ''}`}>
          {view === 'albums'
            ? collectAlbums(tracks).map((album) => (
                <AlbumCard key={album.id} album={album} onOpen={onGroup} />
              ))
            : [...groups].map(([name, songs]) => (
                <button className="group-card" key={name} onClick={() => onGroup(name)}>
                  <Artwork track={songs[0]} />
                  <strong>{name}</strong>
                  <span>{songs.length} songs</span>
                </button>
              ))}
        </div>
      ) : (
        <>
          <div className="song-list-heading">
            <span /> <span>Song</span>
            <span>Album</span>
            <span>Duration</span>
            <span />
          </div>
          <ol className="song-list">
            <AnimatePresence initial={false}>
              {tracks.map((track, index) => (
                <AnimatedListItem
                  key={track.id}
                  trackId={track.id}
                  animateLayout={tracks.length <= 120}
                  index={index}
                  className={`song-row ${currentId === track.id ? 'current' : ''}`}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('button,a,input'))
                      onPlay(tracks, track.id);
                  }}
                >
                  <button
                    className="row-play"
                    aria-label={`Play ${track.title}`}
                    onClick={() => onPlay(tracks, track.id)}
                  >
                    {currentId === track.id && playing ? (
                      <PlayingIndicator />
                    ) : (
                      <>
                        <span>{index + 1}</span>
                        <Play className="hover-play" size={19} />
                      </>
                    )}
                  </button>
                  <div className="song-title-button">
                    <button
                      className="song-cover-play"
                      aria-label={`Play artwork for ${track.title}`}
                      onClick={() => onPlay(tracks, track.id)}
                    >
                      <Artwork track={track} />
                    </button>
                    <div className="track-info">
                      <button
                        className="song-name"
                        onClick={() => onPlay(tracks, track.id)}
                        aria-label={`Play ${track.title} by ${track.artist}`}
                        title={track.title}
                      >
                        <strong>{track.title}</strong>
                      </button>
                      <button
                        className="metadata-link song-artist-link"
                        onClick={() => onArtist?.(track.artist)}
                        aria-label={`Open artist ${track.artist}`}
                        title={track.artist}
                      >
                        {track.artist}
                      </button>
                    </div>
                  </div>
                  <button
                    className="album-name metadata-link"
                    onClick={() => onAlbum?.(track)}
                    aria-label={`Open album ${track.album}`}
                    title={track.album}
                  >
                    <Disc3 size={15} />
                    <span>{track.album}</span>
                  </button>
                  <span className="song-duration">
                    {track.duration ? formatTime(track.duration) : '—'}
                  </span>
                  <div className="song-actions">
                    <button
                      className={`icon-button row-favorite ${track.favorite ? 'active' : ''}`}
                      aria-label={`${track.favorite ? 'Unfavorite' : 'Favorite'} ${track.title}`}
                      aria-pressed={track.favorite}
                      onClick={() => onFavorite(track)}
                    >
                      <Heart size={20} fill={track.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      className="icon-button mobile-more"
                      aria-label={`Options for ${track.title}`}
                      onClick={() => onMore(track)}
                    >
                      <MoreVertical size={23} />
                    </button>
                  </div>
                </AnimatedListItem>
              ))}
            </AnimatePresence>
          </ol>
        </>
      )}
    </>
  );
});
