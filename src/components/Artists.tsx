import { memo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Music2, Disc3, Play, Shuffle, ImagePlus } from 'lucide-react';
import { collectArtists, initials, type ArtistGroup } from '../domain/collections';
import { filterTracks, formatTime, type Track } from '../domain/types';
import { AlbumCard } from './CollectionCard';
import { Artwork } from './Artwork';
import { useWaveMotion } from '../ui/motion';

export function ArtistPortrait({ artist, photo }: { artist: ArtistGroup; photo?: string }) {
  const covers = artist.albums.filter((album) => album.cover.artwork).slice(0, 3);
  return (
    <div className="artist-portrait" aria-hidden="true">
      {photo ? (
        <img className="artist-photo" src={photo} alt="" />
      ) : (
        <span>{initials(artist.name)}</span>
      )}
      {!photo && covers.length > 0 && (
        <div className="artist-cover-stack">
          {covers.map((album) => (
            <Artwork key={album.id} track={album.cover} />
          ))}
        </div>
      )}
    </div>
  );
}
export const Artists = memo(function Artists({
  tracks,
  query,
  onOpen,
  loading = false,
  photos,
}: {
  tracks: Track[];
  query: string;
  onOpen: (name: string) => void;
  loading?: boolean;
  photos?: Map<string, string | undefined>;
}) {
  const animation = useWaveMotion();
  const matches = new Set(filterTracks(tracks, query).map((track) => track.artist));
  const artists = collectArtists(tracks).filter((artist) => matches.has(artist.name));
  if (loading)
    return (
      <div className="empty-state">
        <h2>Loading artists</h2>
      </div>
    );
  return (
    <section aria-label="Artists collection" className="artists-collection">
      <div className="section-heading">
        <h2>
          Artists <span>{artists.length}</span>
        </h2>
        <p>From your library</p>
      </div>
      {artists.length ? (
        <div className="artist-grid-new">
          {artists.map((artist, index) => (
            <motion.button
              key={artist.name}
              className="artist-card"
              onClick={() => onOpen(artist.name)}
              whileHover={animation.enabled ? { y: -5 } : undefined}
              whileTap={animation.enabled ? { scale: 0.97 } : undefined}
              transition={{
                ...animation.fast,
                opacity: {
                  ...animation.effects,
                  delay: animation.enabled ? Math.min(index, 6) * 0.035 : 0,
                },
              }}
            >
              <ArtistPortrait artist={artist} photo={photos?.get(artist.name)} />
              <strong>{artist.name}</strong>
              <span>
                {artist.tracks.length} {artist.tracks.length === 1 ? 'song' : 'songs'} ·{' '}
                {artist.albums.length} {artist.albums.length === 1 ? 'album' : 'albums'}
              </span>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Music2 size={36} />
          <h2>{query ? 'No artists found' : 'No artists yet'}</h2>
          <p>
            {query
              ? 'Try an artist, album, or song name.'
              : 'Import music to build your artist collection.'}
          </p>
        </div>
      )}
    </section>
  );
});
export function ArtistHeader({
  artist,
  onBack,
  onAlbum,
  onPlay,
  onShuffle,
  photo,
  onEditPhoto,
}: {
  artist: ArtistGroup;
  photo?: string;
  onEditPhoto: () => void;
  onPlay: () => void;
  onShuffle: () => void;
  onBack: () => void;
  onAlbum: (id: string) => void;
}) {
  return (
    <>
      <button className="text-button collection-back" onClick={onBack}>
        <ArrowLeft size={20} />
        Back to artists
      </button>
      <section className="artist-detail" aria-label="Artist details">
        <ArtistPortrait artist={artist} photo={photo} />
        <div>
          <h2>{artist.name}</h2>
          <div className="artist-stats">
            <span>
              <Music2 size={17} />
              {artist.tracks.length} {artist.tracks.length === 1 ? 'song' : 'songs'}
            </span>
            <span>
              <Disc3 size={17} />
              {artist.albums.length} {artist.albums.length === 1 ? 'album' : 'albums'}
            </span>
            {artist.duration > 0 && <span>{formatTime(artist.duration)} known duration</span>}
          </div>
          <div className="artist-actions">
            <button
              className="filled-button"
              disabled={!artist.tracks.length}
              onClick={onPlay}
              aria-label={`Play artist ${artist.name}`}
            >
              <Play size={19} />
              Play
            </button>
            <button
              className="tonal-button"
              disabled={!artist.tracks.length}
              onClick={onShuffle}
              aria-label={`Shuffle artist ${artist.name}`}
            >
              <Shuffle size={19} />
              Shuffle
            </button>
            <button className="tonal-button" onClick={onEditPhoto}>
              <ImagePlus size={18} />
              Edit artist photo
            </button>
          </div>
        </div>
      </section>
      {artist.albums.length > 0 && (
        <section className="artist-albums" aria-label="Artist albums">
          <div className="section-heading">
            <h3>Albums</h3>
            <span>{artist.albums.length}</span>
          </div>
          <div className="album-shelf">
            {artist.albums.map((album) => (
              <AlbumCard key={album.id} album={album} onOpen={onAlbum} />
            ))}
          </div>
        </section>
      )}
      <h3 className="songs-section-title">Songs</h3>
    </>
  );
}
