import { PlayerActionButton } from './PlayerActionButton';
import { memo } from 'react';
import { collectAlbums, albumKey } from '../domain/collections';
import { AlbumCard } from './CollectionCard';
import { AnimatePresence } from 'motion/react';
import { AnimatedListItem } from './AnimatedListItem';
import { useIncrementalRows } from '../hooks/useIncrementalRows';
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
} from './Glyphs';
import { Artwork } from './Artwork';
import { EmptyState } from './EmptyState';
import { formatTime, type LibraryView, type Track } from '../domain/types';

import { useT } from '../i18n';
export const LibraryContent = memo(function LibraryContent({
  loading,
  tracks,
  total,
  view,
  query,
  group,
  onGroup,
  onClearSearch,
  onAdd,
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
  onAdd: () => void;
  busy: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (tracks: Track[], id: string) => void;
  onFavorite: (track: Track) => void;
  onMore: (track: Track) => void;
}) {
  const t = useT();
  const grouped = (view === 'albums' || view === 'artists') && !group;
  // Only the rows near the viewport exist at any moment; the rest arrive on scroll.
  const rows = useIncrementalRows(tracks.length);
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
        <h2>{t('Loading library')}</h2>
      </div>
    );
  if (!total && view !== 'playlists')
    return (
      <EmptyState
        icon={<FolderOpen size={42} strokeWidth={1.4} />}
        title={t('No songs yet')}
        description={t('Import your own files, or add a song from YouTube by link.')}
        hint={t('MP3, WAV, M4A, OGG and FLAC')}
        actions={
          <button className="filled-button" disabled={busy} onClick={onAdd}>
            <Plus size={20} />
            {t('Add music')}
          </button>
        }
      />
    );
  if (!tracks.length)
    return (
      <EmptyState
        announce={Boolean(query)}
        icon={
          query ? (
            <Search size={38} />
          ) : view === 'favorites' ? (
            <Heart size={38} />
          ) : (
            <Music2 size={38} />
          )
        }
        title={
          query
            ? t('No tracks found.')
            : view === 'favorites'
              ? t('No favorites yet')
              : view === 'playlists'
                ? t('This playlist is empty')
                : t('No songs in this collection')
        }
        description={
          query
            ? t('Try a different title, artist, or album.')
            : view === 'playlists'
              ? t('Use Add songs to build this playlist.')
              : view === 'favorites'
                ? t('Use the heart on a song to add it here.')
                : t('Choose another collection or add music to your library.')
        }
        actions={
          query ? (
            <button className="tonal-button" onClick={onClearSearch}>
              {t('Clear search')}
            </button>
          ) : undefined
        }
      />
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
            <h2>{view === 'albums' ? (tracks[0]?.album ?? t('Album')) : group}</h2>
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
            <span /> <span>{t('Song')}</span>
            <span>{t('Album')}</span>
            <span>{t('Duration')}</span>
            <span />
          </div>
          {/* Long libraries: rows outside the viewport are not laid out or
              painted until they are needed. */}
          <ol
            className="song-list"
            data-virtual={tracks.length > 40 ? 'true' : undefined}
            data-count={tracks.length}
          >
            <AnimatePresence initial={false}>
              {tracks.slice(0, rows.limit).map((track, index) => (
                <AnimatedListItem
                  key={track.id}
                  trackId={track.id}
                  // Only the first rows are worth an entrance animation; animating
                  // hundreds of them costs more than it shows.
                  animateLayout={index < 12}
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
                    <PlayerActionButton
                      action="favorite"
                      value={track.favorite}
                      className={`icon-button row-favorite ${track.favorite ? 'active' : ''}`}
                      aria-label={`${track.favorite ? t('Unfavorite') : t('Favorite')} ${track.title}`}
                      aria-pressed={track.favorite}
                      onClick={() => onFavorite(track)}
                    >
                      <Heart size={20} fill={track.favorite ? 'currentColor' : 'none'} />
                    </PlayerActionButton>
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
              {rows.limit < tracks.length && (
                <li ref={rows.sentinelRef} className="song-row-sentinel" aria-hidden="true" />
              )}
            </AnimatePresence>
          </ol>
        </>
      )}
    </>
  );
});
