import type { DailyMix } from '../domain/dailyMixes';
import { DailyMixes } from './DailyMixes';
import { memo, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Disc3, Heart, ListMusic, Music2, Users, Plus } from 'lucide-react';
import { albumKey, collectAlbums, collectArtists } from '../domain/collections';
import type { LibraryView, Playlist, Track } from '../domain/types';
import { useWaveMotion } from '../ui/motion';
import { AlbumCard } from './CollectionCard';
import { usePlaylistVisual } from '../hooks/usePlaylistVisual';
import { useArtworkColor } from '../hooks/useArtworkColor';
import { Artwork } from './Artwork';
import { ArtistPortrait } from './Artists';
import { LibraryContent } from './LibraryContent';
import { listeningTime } from '../domain/listening';

export const HomePage = memo(function HomePage({
  tracks,
  playlists,
  current,
  playing,
  loading,
  busy,
  onAdd,
  onMix,
  onView,
  onAlbum,
  onArtist,
  onPlaylist,
  onPlay,
  onFavorite,
  onMore,
  artistPhotos,
  recentTracks = [],
  weekSeconds = 0,
  onListening,
}: {
  tracks: Track[];
  artistPhotos?: Map<string, string | undefined>;
  playlists: Playlist[];
  current?: Track;
  playing: boolean;
  loading: boolean;
  busy: boolean;
  onAdd: () => void;
  onMix: (mix: DailyMix, number: number) => void;
  onView: (view: LibraryView) => void;
  onAlbum: (id: string) => void;
  onArtist: (name: string) => void;
  onPlaylist: (id: string) => void;
  onPlay: (tracks: Track[], id: string) => void;
  onFavorite: (track: Track) => void;
  onMore: (track: Track) => void;
  /** Songs this device played most recently, newest first. */
  recentTracks?: Track[];
  /** Seconds listened in the last seven days, for the Remix card. */
  weekSeconds?: number;
  onListening?: () => void;
}) {
  const animation = useWaveMotion();
  const albums = useMemo(
    () => collectAlbums(tracks).sort((a, b) => b.addedAt - a.addedAt),
    [tracks],
  );
  const artists = useMemo(() => collectArtists(tracks), [tracks]);
  const recent = useMemo(
    () => [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6),
    [tracks],
  );
  const favorites = tracks.filter((track) => track.favorite);
  const counts = [tracks.length, albums.length, artists.length, playlists.length, favorites.length];
  const destinations = [
    ['songs', 'Songs', Music2],
    ['albums', 'Albums', Disc3],
    ['artists', 'Artists', Users],
    ['playlists', 'Playlists', ListMusic],
    ['favorites', 'Favorites', Heart],
  ] as const;
  return (
    <div className="home-content">
      <section aria-label="Your collection" className="home-overview">
        <div className="section-heading">
          <h2>Your collection</h2>
          <button className="tonal-button" disabled={busy} onClick={onAdd}>
            <Plus size={18} />
            Add music
          </button>
        </div>
        <div className="home-shortcuts">
          {destinations.map(([view, label, Icon], index) => (
            <motion.button
              key={view}
              className="home-shortcut"
              onClick={() => onView(view)}
              whileHover={animation.enabled ? { y: -3 } : undefined}
              whileTap={animation.enabled ? { scale: 0.95 } : undefined}
              transition={animation.fast}
            >
              <Icon size={22} />
              <strong>{counts[index]}</strong>
              <span>{label}</span>
            </motion.button>
          ))}
        </div>
      </section>
      {recentTracks.length > 0 && (
        <section aria-label="Jump back in" className="home-resume-section">
          <div className="section-heading">
            <h2>Jump back in</h2>
            {onListening && (
              <button className="text-button" onClick={onListening}>
                {weekSeconds ? `${listeningTime(weekSeconds)} this week` : 'Remix'}
                <ArrowUpRight size={18} />
              </button>
            )}
          </div>
          <div className="home-resume">
            {recentTracks.slice(0, 6).map((track) => (
              <motion.button
                key={track.id}
                className="home-resume-card"
                onClick={() => onPlay(recentTracks, track.id)}
                whileHover={animation.enabled ? { y: -3 } : undefined}
                whileTap={animation.enabled ? { scale: 0.97 } : undefined}
                transition={animation.fast}
              >
                <Artwork track={track} />
                <strong>{track.title}</strong>
                <span>{track.artist}</span>
              </motion.button>
            ))}
          </div>
        </section>
      )}
      <DailyMixes tracks={tracks} onOpen={onMix} />
      {albums.length > 0 && (
        <section aria-label="Recently added albums" className="home-albums">
          <div className="section-heading">
            <h2>Recently added albums</h2>
            <button className="text-button" onClick={() => onView('albums')}>
              All albums
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="album-shelf">
            {albums.slice(0, 6).map((album) => (
              <AlbumCard key={album.id} album={album} onOpen={onAlbum} />
            ))}
          </div>
        </section>
      )}
      <div
        className={`home-dashboard ${playlists.length || artists.length ? 'has-secondary' : ''}`}
      >
        <section aria-label="Recently added songs" className="home-recent-songs">
          <div className="section-heading">
            <h2>{tracks.length ? 'Recently added songs' : 'Your music'}</h2>
            {tracks.length > 0 && (
              <button className="text-button" onClick={() => onView('songs')}>
                All songs
                <ArrowUpRight size={18} />
              </button>
            )}
          </div>
          <LibraryContent
            tracks={recent}
            total={tracks.length}
            loading={loading}
            busy={busy}
            view="songs"
            group={null}
            query=""
            currentId={current?.id}
            playing={playing}
            onAdd={onAdd}
            onGroup={() => {}}
            onClearSearch={() => {}}
            onPlay={onPlay}
            onFavorite={onFavorite}
            onMore={onMore}
            onArtist={onArtist}
            onAlbum={(track) => onAlbum(albumKey(track))}
          />
        </section>
        {(playlists.length > 0 || artists.length > 0) && (
          <div className="home-secondary">
            {playlists.length > 0 && (
              <section aria-label="Your playlists">
                <div className="section-heading">
                  <h2>Your playlists</h2>
                  <button className="text-button" onClick={() => onView('playlists')}>
                    All playlists
                    <ArrowUpRight size={18} />
                  </button>
                </div>
                <div className="home-playlists">
                  {[...playlists]
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, 4)
                    .map((playlist) => (
                      <PlaylistShortcut
                        key={playlist.id}
                        playlist={playlist}
                        tracks={tracks}
                        onPlaylist={onPlaylist}
                      />
                    ))}
                </div>
              </section>
            )}
            {artists.length > 0 && (
              <section aria-label="Artists in your library">
                <div className="section-heading">
                  <h2>Artists</h2>
                  <button className="text-button" onClick={() => onView('artists')}>
                    All artists
                    <ArrowUpRight size={18} />
                  </button>
                </div>
                <div className="home-artists">
                  {artists.slice(0, 6).map((artist) => (
                    <button
                      className="home-artist"
                      key={artist.name}
                      onClick={() => onArtist(artist.name)}
                    >
                      <ArtistPortrait artist={artist} photo={artistPhotos?.get(artist.name)} />
                      <strong>{artist.name}</strong>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function PlaylistShortcut({
  playlist,
  tracks,
  onPlaylist,
}: {
  playlist: import('../domain/types').Playlist;
  tracks: import('../domain/types').Track[];
  onPlaylist: (id: string) => void;
}) {
  const visual = usePlaylistVisual(playlist, tracks),
    palette = useArtworkColor(visual.artwork);
  return (
    <button className="home-playlist" style={palette} onClick={() => onPlaylist(playlist.id)}>
      <Artwork track={{ title: playlist.name, album: '', artwork: visual.artwork }} />
      <span>
        <strong>{playlist.name}</strong>
        <small>{playlist.trackIds.length} songs</small>
      </span>
      <ArrowUpRight size={20} />
    </button>
  );
}
