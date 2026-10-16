import { matchesSearch } from '../domain/musicIdentity';
import { ArrowLeft, ListMusic, Pencil, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { Playlist, Track } from '../domain/types';
import { usePlaylistVisual } from '../hooks/usePlaylistVisual';
import { useArtworkColor } from '../hooks/useArtworkColor';
import { Artwork } from './Artwork';
import { useWaveMotion } from '../ui/motion';

export function PlaylistCollection({
  playlists,
  tracks,
  query,
  onOpen,
  onCreate,
}: {
  playlists: Playlist[];
  tracks: Track[];
  query: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const visible = [...playlists]
    .filter((playlist) => matchesSearch(`${playlist.name} ${playlist.description}`, query))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <section aria-label="Playlists">
      <div className="collection-heading">
        <h2>
          Your playlists <span>{playlists.length}</span>
        </h2>
        <button className="filled-button" onClick={onCreate}>
          <Plus size={20} />
          Create playlist
        </button>
      </div>
      {visible.length ? (
        <div className="group-grid playlist-grid">
          {visible.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} tracks={tracks} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-symbol">
            <ListMusic size={40} />
          </div>
          <h2>{query ? 'No playlists found' : 'Your first playlist starts here'}</h2>
          <p>
            {query
              ? 'Try a different playlist name.'
              : 'Collect your songs in the order you want to hear them.'}
          </p>
        </div>
      )}
    </section>
  );
}

export function PlaylistHeader({
  playlist,
  tracks,
  onBack,
  onEdit,
  onAdd,
  onDelete,
}: {
  playlist: Playlist;
  tracks: Track[];
  onBack: () => void;
  onEdit: () => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const visual = usePlaylistVisual(playlist, tracks),
    palette = useArtworkColor(visual.artwork);
  return (
    <section style={palette} className="playlist-detail" aria-label="Playlist details">
      <button className="icon-button playlist-back" onClick={onBack} aria-label="Back to playlists">
        <ArrowLeft size={23} />
      </button>
      <Artwork track={{ title: playlist.name, album: '', artwork: visual.artwork }} />
      <div className="playlist-detail-copy">
        <p className="playlist-kicker">
          Playlist · {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'song' : 'songs'}
        </p>
        <h2>{playlist.name}</h2>
        {playlist.description && <p className="playlist-description">{playlist.description}</p>}
        <div className="playlist-detail-actions">
          <button className="tonal-button" onClick={onAdd}>
            <Plus size={19} />
            Add songs
          </button>
          <button className="icon-button" onClick={onEdit} aria-label="Edit playlist">
            <Pencil size={20} />
          </button>
          <button className="icon-button" onClick={onDelete} aria-label="Delete playlist">
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}

function PlaylistCard({
  playlist,
  tracks,
  onOpen,
}: {
  playlist: Playlist;
  tracks: Track[];
  onOpen: (id: string) => void;
}) {
  const visual = usePlaylistVisual(playlist, tracks),
    animation = useWaveMotion(),
    palette = useArtworkColor(visual.artwork);
  return (
    <motion.button
      layout
      style={palette}
      className="group-card playlist-card"
      onClick={() => onOpen(playlist.id)}
      whileHover={animation.enabled ? { y: -4 } : undefined}
      whileTap={animation.enabled ? { scale: 0.97 } : undefined}
      transition={animation.spatial}
    >
      <Artwork track={{ title: playlist.name, album: '', artwork: visual.artwork }} />
      <strong>{playlist.name}</strong>
      <span>
        {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'song' : 'songs'}
      </span>
    </motion.button>
  );
}
