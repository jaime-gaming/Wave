import { memo, useDeferredValue, useEffect, useMemo, useState, type RefObject } from 'react';
import { Search, X, Music2, Disc3, Users, ListMusic, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { Track, Playlist, LibraryView } from '../domain/types';
import { collectAlbums, collectArtists, initials } from '../domain/collections';
import { matchesSearch } from '../domain/musicIdentity';
import {
  clearRecentSearches,
  loadRecentSearches,
  rankTracks,
  rememberSearch,
} from '../domain/searchRank';
import { AlbumCard } from './CollectionCard';
import { LibraryContent } from './LibraryContent';
import { PlaylistCollection } from './PlaylistCollection';
import { useWaveMotion } from '../ui/motion';

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
  const [kind, setKind] = useState('All');
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
  const albums = useMemo(
    () =>
      collectAlbums(tracks).filter((a) => matchesSearch(`${a.name} ${a.artist}`, deferredQuery)),
    [tracks, deferredQuery],
  );
  const artists = useMemo(
    () => collectArtists(tracks).filter((a) => matchesSearch(a.name, deferredQuery)),
    [tracks, deferredQuery],
  );
  const playlists = allPlaylists.filter((a) =>
    matchesSearch(`${a.name} ${a.description}`, deferredQuery),
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
    <section className="search-destination" aria-label="Search your collection">
      <div className="search-composer">
        <Search size={28} />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search library"
          placeholder="Songs, artists, albums, playlists"
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
            aria-label="Clear search"
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
      <div className="search-kinds" aria-label="Search categories">
        {['All', 'Songs', 'Artists', 'Albums', 'Playlists'].map((label) => (
          <motion.button
            key={label}
            aria-pressed={kind === label}
            onClick={() => setKind(label)}
            whileTap={animation.enabled ? { scale: 0.94 } : undefined}
            transition={animation.fast}
          >
            {label}
          </motion.button>
        ))}
      </div>
      {!query.trim() ? (
        <div className="search-start">
          <h2>Browse your collection</h2>
          <p>
            Find something in your collection. Search ignores accents and matches words in any
            order, and puts the closest name first.
          </p>
          {!!recent.length && (
            <div className="search-recent">
              <div className="search-recent-head">
                <span>Recent searches</span>
                <button
                  className="text-button"
                  onClick={() => {
                    clearRecentSearches();
                    setRecent([]);
                  }}
                >
                  Clear
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
                { id: 'songs', label: 'Songs', icon: Music2, count: tracks.length },
                {
                  id: 'artists',
                  label: 'Artists',
                  icon: Users,
                  count: collectArtists(tracks).length,
                },
                {
                  id: 'albums',
                  label: 'Albums',
                  icon: Disc3,
                  count: collectAlbums(tracks).length,
                },
                { id: 'playlists', label: 'Playlists', icon: ListMusic, count: playlists.length },
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
                <span>{count} in your collection</span>
                <ArrowUpRight size={18} />
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <p className="search-result-count" role="status">
            {count} {count === 1 ? 'result' : 'results'} for “{query}”
          </p>
          {(kind === 'All' || kind === 'Songs') && (
            <section className="search-results-section" aria-label="Song results">
              <h2>
                Songs <span>{songs.length}</span>
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
                  Show all {songs.length} songs
                </button>
              )}
            </section>
          )}
          {(kind === 'All' || kind === 'Artists') && artists.length > 0 && (
            <section className="search-results-section" aria-label="Artist results">
              <h2>
                Artists <span>{artists.length}</span>
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
            <section className="search-results-section" aria-label="Album results">
              <h2>
                Albums <span>{albums.length}</span>
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
            <p className="search-no-results">No matching {kind.toLowerCase()}. Try another name.</p>
          )}
        </>
      )}
    </section>
  );
});
