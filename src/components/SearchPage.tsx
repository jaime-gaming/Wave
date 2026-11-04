import { memo, useDeferredValue, useEffect, useMemo, useState, type RefObject } from 'react';
import { Search, X, Music2, Disc3, Users, ListMusic, ArrowUpRight } from './Glyphs';
import { motion } from 'motion/react';
import type { Track, Playlist, LibraryView } from '../domain/types';
import { collectAlbums, collectArtists, initials } from '../domain/collections';
import {
  clearRecentSearches,
  loadRecentSearches,
  rankNames,
  rankTracks,
  rememberSearch,
} from '../domain/searchRank';
import { AlbumCard } from './CollectionCard';
import { LibraryContent } from './LibraryContent';
import { PlaylistCollection } from './PlaylistCollection';
import { useWaveMotion } from '../ui/motion';

import { useT } from '../i18n';
type Props = {
  tracks: Track[];
  playlists: Playlist[];
  query: string;
  onQuery: (q: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  photos: Map<string, string | undefined>;
  loading: boolean;
  busy: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (tracks: Track[], id: string) => void;
  onFavorite: (t: Track) => void;
  onMore: (t: Track) => void;
  onArtist: (name: string) => void;
  onAlbum: (id: string) => void;
  onPlaylist: (id: string) => void;
  onBrowse: (v: LibraryView) => void;
  onAdd: () => void;
  onCreatePlaylist: () => void;
};
export const SearchPage = memo(function SearchPage({
  inputRef,
  tracks,
  query,
  playlists: allPlaylists,
  onQuery,
  onBrowse,
  loading,
  onAdd,
  busy,
  currentId,
  playing,
  onPlay,
  onFavorite,
  onMore,
  onArtist,
  onAlbum,
  photos,
  onPlaylist,
  onCreatePlaylist,
}: Props) {
  const t = useT();
  // The filter is a stable id, never a translated label: the comparisons below
  // must keep working whichever language the chips are drawn in.
  const [kind, setKind] = useState<'All' | 'Songs' | 'Artists' | 'Albums' | 'Playlists'>('All');
  const [recent, setRecent] = useState<string[]>(loadRecentSearches);
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);
  const animation = useWaveMotion();
  const deferredQuery = useDeferredValue(query);
  // Ranked, not filtered: the song you meant belongs at the top of the list.
  const songs = useMemo(() => rankTracks(tracks, deferredQuery), [tracks, deferredQuery]);
  /**
   * A search is remembered when it settles — the library already narrowed —
   * not on every keystroke, so the list holds phrases rather than prefixes.
   */
  useEffect(() => {
    if (deferredQuery.trim().length < 3) return;
    const timer = setTimeout(() => setRecent(rememberSearch(deferredQuery)), 1200);
    return () => clearTimeout(timer);
  }, [deferredQuery]);
  // Ranked like the songs are: the collection whose name you typed comes first,
  // not whichever one was alphabetically in the way.
  const albums = useMemo(
    () =>
      rankNames(
        collectAlbums(tracks),
        deferredQuery,
        (album) => album.name,
        (album) => album.artist,
      ),
    [tracks, deferredQuery],
  );
  const artists = useMemo(
    () => rankNames(collectArtists(tracks), deferredQuery, (artist) => artist.name),
    [tracks, deferredQuery],
  );
  // The ranking already drops what does not answer, including the near miss, so
  // filtering first only removed results twice.
  const playlists = useMemo(
    () =>
      rankNames(
        allPlaylists,
        deferredQuery,
        (list) => list.name,
        (list) => list.description,
      ),
    [allPlaylists, deferredQuery],
  );
  const count =
    kind === 'Songs'
      ? songs.length
      : kind === 'Artists'
        ? artists.length
        : kind === 'Albums'
          ? albums.length
          : kind === 'Playlists'
            ? playlists.length
            : songs.length + artists.length + albums.length + playlists.length;
  return (
    <section className="search-destination" aria-label={t('Search your collection')}>
      <div className="search-composer">
        <Search size={28} />
        <input
          ref={inputRef}
          type="search"
          aria-label={t('Search library')}
          placeholder={t('Songs, artists, albums, playlists')}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(event) => {
            // Enter plays the best match; Escape gives the library back.
            if (event.key === 'Escape') {
              onQuery('');
              return;
            }
            if (event.key !== 'Enter') return;
            const best = songs[0];
            if (best) {
              rememberSearch(deferredQuery);
              setRecent(loadRecentSearches());
              onPlay(songs, best.id);
            }
          }}
        />
        {query ? (
          <button
            className="icon-button"
            aria-label={t('Clear search')}
            onClick={() => {
              onQuery('');
              inputRef.current?.focus();
            }}
          >
            <X />
          </button>
        ) : (
          <kbd>⌘ / Ctrl K</kbd>
        )}
      </div>
      <div className="search-kinds" aria-label={t('Search categories')}>
        {(['All', 'Songs', 'Artists', 'Albums', 'Playlists'] as const).map((id) => (
          <motion.button
            key={id}
            aria-pressed={kind === id}
            onClick={() => setKind(id)}
            whileTap={animation.enabled ? { scale: 0.94 } : undefined}
            transition={animation.fast}
          >
            {t(id)}
          </motion.button>
        ))}
      </div>
      {!query.trim() ? (
        <div className="search-start">
          <h2>{t('Browse your collection')}</h2>
          <p>{t('Accents and word order do not matter. The closest name comes first.')}</p>
          {!!recent.length && (
            <div className="search-recent">
              <div className="search-recent-head">
                <span>{t('Recent searches')}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    clearRecentSearches();
                    setRecent([]);
                  }}
                >
                  {t('Clear')}
                </button>
              </div>
              <div className="search-recent-chips">
                {recent.map((term) => (
                  <button key={term} onClick={() => onQuery(term)}>
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="search-shortcuts">
            {(
              [
                { id: 'songs', label: t('Songs'), icon: Music2, count: tracks.length },
                {
                  id: 'artists',
                  label: t('Artists'),
                  icon: Users,
                  count: collectArtists(tracks).length,
                },
                {
                  id: 'albums',
                  label: t('Albums'),
                  icon: Disc3,
                  count: collectAlbums(tracks).length,
                },
                {
                  id: 'playlists',
                  label: t('Playlists'),
                  icon: ListMusic,
                  count: playlists.length,
                },
              ] as const
            ).map(({ id, label, icon: Icon, count }, i) => (
              <motion.button
                key={id}
                onClick={() => onBrowse(id)}
                initial={{ opacity: animation.enabled ? 0 : 1, y: animation.enabled ? 12 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...animation.spatial, delay: animation.enabled ? i * 0.04 : 0 }}
              >
                <Icon size={30} />
                <strong>{label}</strong>
                <span>{t('{count} in your collection', { count })}</span>
                <ArrowUpRight size={18} />
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <p className="search-result-count" role="status">
            {count === 1
              ? t('{count} result for “{query}”', { count, query })
              : t('{count} results for “{query}”', { count, query })}
          </p>
          {(kind === 'All' || kind === 'Songs') && (
            <section className="search-results-section" aria-label={t('Song results')}>
              <h2>
                {t('Songs')} <span>{songs.length}</span>
              </h2>
              <LibraryContent
                loading={loading}
                tracks={kind === 'All' ? songs.slice(0, 12) : songs}
                total={tracks.length}
                view="songs"
                query={query}
                group={null}
                onGroup={() => {}}
                onClearSearch={() => onQuery('')}
                onAdd={onAdd}
                busy={busy}
                currentId={currentId}
                playing={playing}
                onPlay={(_, id) => onPlay(songs, id)}
                onFavorite={onFavorite}
                onMore={onMore}
                onArtist={onArtist}
                onAlbum={(t) => onAlbum(JSON.stringify([t.artist, t.album]))}
              />
              {kind === 'All' && songs.length > 12 && (
                <button className="text-button" onClick={() => setKind('Songs')}>
                  {t('Show all {count} songs', { count: songs.length })}
                </button>
              )}
            </section>
          )}
          {(kind === 'All' || kind === 'Artists') && artists.length > 0 && (
            <section className="search-results-section" aria-label={t('Artist results')}>
              <h2>
                {t('Artists')} <span>{artists.length}</span>
              </h2>
              <div className="search-artist-grid">
                {artists.map((a) => (
                  <motion.button
                    key={a.name}
                    onClick={() => onArtist(a.name)}
                    whileHover={animation.enabled ? { y: -4 } : undefined}
                    whileTap={animation.enabled ? { scale: 0.96 } : undefined}
                    transition={animation.fast}
                  >
                    <span className="search-artist-image">
                      {photos.get(a.name) ? (
                        <img src={photos.get(a.name)} alt="" />
                      ) : (
                        initials(a.name)
                      )}
                    </span>
                    <strong>{a.name}</strong>
                    <small>{a.tracks.length} songs</small>
                  </motion.button>
                ))}
              </div>
            </section>
          )}
          {(kind === 'All' || kind === 'Albums') && albums.length > 0 && (
            <section className="search-results-section" aria-label={t('Album results')}>
              <h2>
                {t('Albums')} <span>{albums.length}</span>
              </h2>
              <div className="group-grid">
                {albums.map((a) => (
                  <AlbumCard key={a.id} album={a} onOpen={onAlbum} />
                ))}
              </div>
            </section>
          )}
          {(kind === 'All' || kind === 'Playlists') && playlists.length > 0 && (
            <PlaylistCollection
              playlists={playlists}
              tracks={tracks}
              query=""
              onOpen={onPlaylist}
              onCreate={onCreatePlaylist}
            />
          )}
          {!count && kind !== 'All' && kind !== 'Songs' && (
            <p className="search-no-results">
              {t('No matching {kind}. Try another name.', { kind: t(kind.toLowerCase()) })}
            </p>
          )}
        </>
      )}
    </section>
  );
});
