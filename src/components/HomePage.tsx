import type { DailyMix } from '../domain/dailyMixes';
import { DailyMixes } from './DailyMixes';
import { memo, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Disc3, Heart, ListMusic, Music2, Users, Plus, Smartphone } from './Glyphs';
import { albumKey, collectAlbums, collectArtists } from '../domain/collections';
import type { LibraryView, Playlist, Track } from '../domain/types';
import { useWaveMotion } from '../ui/motion';
import { AlbumCard } from './CollectionCard';
import { usePlaylistVisual } from '../hooks/usePlaylistVisual';
import { useArtworkColor } from '../hooks/useArtworkColor';
import { Artwork } from './Artwork';
import { ArtistPortrait } from './Artists';
import { LibraryContent } from './LibraryContent';

import { useT } from '../i18n';
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
  onDevices,
}: {
  tracks: Track[];
  artistPhotos?: Map<string, string | undefined>;
  /** Opens the device screen: the first thing a phone should offer. */
  onDevices?: () => void;
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
}) {
  const t = useT();
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
    ['songs', t('Songs'), Music2],
    ['albums', t('Albums'), Disc3],
    ['artists', t('Artists'), Users],
    ['playlists', t('Playlists'), ListMusic],
    ['favorites', t('Favorites'), Heart],
  ] as const;
  return (
    <div className="home-content">
      <section aria-label={t('Your collection')} className="home-overview">
        <div className="section-heading">
          <h2>{t('Your collection')}</h2>
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
      {/*
       * Linking, first, on a phone.
       *
       * A person opening Wave on their phone usually has their music on the
       * computer in front of them, and the one thing that makes this app worth
       * having there is that the two devices share what they hold. It is a card
       * of its own at the top of the page rather than a line in Settings, and it
       * disappears once a device is linked.
       */}
      {onDevices && (
        <motion.button
          type="button"
          className="home-link-card"
          onClick={onDevices}
          whileTap={animation.enabled ? { scale: 0.985 } : undefined}
          transition={animation.fast}
        >
          <span className="home-link-icon" aria-hidden="true">
            <Smartphone size={20} />
          </span>
          <span className="home-link-copy">
            <strong>{t('Bring your other device in')}</strong>
            <small>{t('Scan a code and listen to the songs on your computer from here.')}</small>
          </span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </motion.button>
      )}
      <DailyMixes tracks={tracks} onOpen={onMix} />
      {albums.length > 0 && (
        <section aria-label={t('Recently added albums')} className="home-albums">
          <div className="section-heading">
            <h2>{t('Recently added albums')}</h2>
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
        <section aria-label={t('Recently added songs')} className="home-recent-songs">
          <div className="section-heading">
            <h2>{tracks.length ? t('Recently added songs') : t('Your music')}</h2>
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
              <section aria-label={t('Your playlists')}>
                <div className="section-heading">
                  <h2>{t('Your playlists')}</h2>
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
              <section aria-label={t('Artists in your library')}>
                <div className="section-heading">
                  <h2>{t('Artists')}</h2>
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
