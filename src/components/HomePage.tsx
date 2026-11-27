import { homeRecommendations } from '../domain/homeRecommendations';
import { cachedAnalysis } from '../audio/mixAnalysis';
import type { ListeningSummary } from '../domain/listening';
import type { ListeningSignal } from '../domain/mood';
import type { DailyMix } from '../domain/dailyMixes';
import { DailyMixes } from './DailyMixes';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import {
  ArrowUpRight,
  Disc3,
  Heart,
  ListMusic,
  Music2,
  Users,
  Plus,
  Smartphone,
  X,
} from './Glyphs';
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
function Notice({ children, label }: { children: ReactNode; label: string }) {
  const animation = useWaveMotion();
  const present = useIsPresent();
  return (
    <motion.aside
      className="windows-app-notice"
      aria-label={label}
      aria-hidden={!present}
      inert={!present}
      initial={animation.enabled ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={animation.enabled ? { opacity: 0, y: -8 } : { opacity: 0 }}
      transition={animation.effects}
    >
      {children}
    </motion.aside>
  );
}
export const HomePage = memo(function HomePage({
  tracks,
  listening,
  moodSignals,
  playlists,
  current,
  playing,
  loading,
  busy,
  onAdd,
  addAction,
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
  listening?: ListeningSummary;
  moodSignals?: ListeningSignal[];
  artistPhotos?: Map<string, string | undefined>;

  onDevices?: () => void;
  playlists: Playlist[];
  current?: Track;
  playing: boolean;
  loading: boolean;
  busy: boolean;
  onAdd: () => void;
  addAction?: ReactNode;
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
  const [showWindowsNotice, setShowWindowsNotice] = useState(() => {
    if (typeof navigator === 'undefined' || !/Windows NT/i.test(navigator.userAgent)) return false;
    try {
      return localStorage.getItem('wave-windows-notice-dismissed') !== 'true';
    } catch {
      return true;
    }
  });
  const animation = useWaveMotion();
  const recommendations = useMemo(
    () =>
      homeRecommendations(
        tracks,
        listening,
        undefined,
        current,
        (track) => cachedAnalysis(track.blob),
        moodSignals,
      ),
    [tracks, listening, current, moodSignals],
  );
  const albums = useMemo(() => {
    const rankMap = new Map(recommendations.map((track, idx) => [track.id, 12 - idx]));
    const weight = (ids: string[]) => ids.reduce((sum, id) => sum + (rankMap.get(id) ?? 0), 0);
    return collectAlbums(tracks).sort(
      (a, b) =>
        weight(b.tracks.map((track) => track.id)) - weight(a.tracks.map((track) => track.id)),
    );
  }, [tracks, recommendations]);
  const artists = useMemo(() => collectArtists(tracks), [tracks]);
  const recent = useMemo(() => recommendations.slice(0, 8), [recommendations]);
  const favoriteCount = useMemo(
    () => tracks.reduce((sum, track) => sum + (track.favorite ? 1 : 0), 0),
    [tracks],
  );
  const counts = [tracks.length, albums.length, artists.length, playlists.length, favoriteCount];
  const destinations = [
    ['songs', t('Songs'), Music2],
    ['albums', t('Albums'), Disc3],
    ['artists', t('Artists'), Users],
    ['playlists', t('Playlists'), ListMusic],
    ['favorites', t('Favorites'), Heart],
  ] as const;
  return (
    <div className="home-content">
      <AnimatePresence initial={false}>
        {showWindowsNotice && (
          <Notice label={t('Wave for Windows')}>
            <div>
              <strong>{t('Try Wave for Windows')}</strong>
              <p>{t('Enjoy Wave as a Windows app. Your web library stays in this browser.')}</p>
              <p>
                {t('The Windows download may be an older version and may show a security warning.')}
              </p>
            </div>
            <a className="tonal-button" href="/api/download/windows">
              {t('Download for Windows')}
            </a>
            <button
              className="icon-button"
              type="button"
              aria-label={t('Dismiss')}
              onClick={() => {
                try {
                  localStorage.setItem('wave-windows-notice-dismissed', 'true');
                } catch {}
                setShowWindowsNotice(false);
              }}
            >
              <X size={18} />
            </button>
          </Notice>
        )}
      </AnimatePresence>
      <section aria-label={t('Your collection')} className="home-overview">
        <div className="section-heading">
          <h2>{t('Your collection')}</h2>
          {addAction ?? (
            <button className="tonal-button" disabled={busy} onClick={onAdd}>
              <Plus size={18} />
              {t('Add music')}
            </button>
          )}
        </div>
        <div className="home-shortcuts">
          {destinations.map(([view, label, Icon], index) => (
            <motion.button
              key={view}
              className="home-shortcut"
              onClick={() => onView(view)}
              initial={animation.enabled ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              whileHover={animation.hoverEnabled ? { y: -2 } : undefined}
              whileTap={animation.enabled ? { scale: 0.975 } : undefined}
              transition={
                animation.enabled ? { ...animation.fast, delay: index * 0.035 } : animation.fast
              }
            >
              <Icon size={22} />
              <strong>{counts[index]}</strong>
              <span>{label}</span>
            </motion.button>
          ))}
        </div>
      </section>
      {}
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
      <DailyMixes
        tracks={tracks}
        listening={listening}
        loading={loading}
        busy={busy}
        onOpen={onMix}
      />
      {albums.length > 0 && (
        <section aria-label={t('Albums to get lost in')} className="home-albums">
          <div className="section-heading">
            <h2>{t('Albums to get lost in')}</h2>
            <button className="text-button" onClick={() => onView('albums')}>
              {t('All albums')}
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
        <section aria-label={t('Picked for you')} className="home-recent-songs">
          <div className="section-heading">
            <h2>{tracks.length ? t('Picked for you') : t('Your music')}</h2>
            {tracks.length > 0 && (
              <button className="text-button" onClick={() => onView('songs')}>
                {t('All songs')}
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
                    {t('All playlists')}
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
                    {t('All artists')}
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
