import { useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Modal } from './Modal';
import { ArtworkPicker } from './ArtworkPicker';
import { usePlaylistVisual } from '../hooks/usePlaylistVisual';
import { Artwork } from './Artwork';
import { filterTracks, type Playlist, type Track } from '../domain/types';
import type { PlaylistDetails } from '../domain/playlists';

export function PlaylistDialog({
  playlist,
  editorEnabled,
  onSave,
  onClose,
}: {
  playlist?: Playlist;
  editorEnabled: boolean;
  onSave: (details: PlaylistDetails) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(playlist?.name ?? '');
  const [description, setDescription] = useState(playlist?.description ?? '');
  const [artwork, setArtwork] = useState(playlist?.artwork);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');
  const busy = saving || imageBusy;
  return (
    <Modal
      title={playlist ? 'Edit playlist' : 'Create playlist'}
      closeDisabled={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setSaving(true);
          setError('');
          if (await onSave({ name, description, artwork })) onClose();
          else setError('This playlist could not be saved. Please try again.');
          setSaving(false);
        }}
      >
        {editorEnabled && (
          <ArtworkPicker
            value={artwork}
            onChange={setArtwork}
            onBusy={setImageBusy}
            disabled={saving}
          />
        )}
        <label className="form-field">
          Playlist name
          <input
            autoFocus
            value={name}
            required
            maxLength={100}
            disabled={saving}
            placeholder="Name your playlist"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {editorEnabled && (
          <label className="form-field">
            Description
            <textarea
              value={description}
              maxLength={1000}
              rows={3}
              disabled={saving}
              placeholder="Optional"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="tonal-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="filled-button" disabled={busy || !name.trim()}>
            <Check size={19} />
            {saving ? 'Saving…' : playlist ? 'Save playlist' : 'Create playlist'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AddSongsDialog({
  playlist,
  existingIds,
  destination,
  title = 'Add songs',
  tracks,
  onAdd,
  onClose,
}: {
  playlist?: Playlist;
  existingIds?: string[];
  destination?: string;
  title?: string;
  tracks: Track[];
  onAdd: (ids: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set<string>());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const available = tracks.filter(
    (track) => !(playlist?.trackIds ?? existingIds ?? []).includes(track.id),
  );
  const visible = filterTracks(available, query);
  return (
    <Modal
      title={title}
      closeDisabled={saving}
      className="picker-modal"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <p className="modal-description">
        Add songs to {playlist?.name ?? destination ?? 'your collection'}.
      </p>
      <div className="search-box picker-search">
        <Search size={20} />
        <input
          aria-label="Search songs to add"
          placeholder="Search your library"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="song-picker">
        {visible.map((track) => (
          <label
            key={track.id}
            className={`picker-row ${selected.has(track.id) ? 'selected' : ''}`}
          >
            <input
              type="checkbox"
              disabled={saving}
              checked={selected.has(track.id)}
              onChange={(event) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(track.id);
                  else next.delete(track.id);
                  return next;
                })
              }
            />
            <Artwork track={track} />
            <span className="track-info">
              <strong>{track.title}</strong>
              <span>{track.artist}</span>
            </span>
          </label>
        ))}
        {!visible.length && (
          <p className="picker-empty">
            {available.length
              ? 'No songs match your search.'
              : tracks.length
                ? `All your songs are already in ${playlist ? 'this playlist' : 'the queue'}.`
                : 'Import audio files into your library first.'}
          </p>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="tonal-button" disabled={saving} onClick={onClose}>
          Cancel
        </button>
        <button
          className="filled-button"
          disabled={saving || !selected.size}
          onClick={async () => {
            setSaving(true);
            if (await onAdd([...selected])) onClose();
            else setError('Songs could not be added. Please try again.');
            setSaving(false);
          }}
        >
          <Plus size={18} />
          {saving ? 'Adding…' : `Add ${selected.size} ${selected.size === 1 ? 'song' : 'songs'}`}
        </button>
      </div>
    </Modal>
  );
}

export function AddToPlaylistDialog({
  track,
  playlists,
  tracks = [],
  onAdd,
  onCreate,
  onClose,
}: {
  track: Track;
  playlists: Playlist[];
  tracks?: Track[];
  onAdd: (id: string) => Promise<boolean>;
  onCreate: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title="Add to playlist"
      closeDisabled={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="modal-description">Choose a playlist for {track.title}.</p>
      <div className="playlist-picker">
        {playlists.map((playlist) => (
          <button
            className="options-action"
            key={playlist.id}
            disabled={busy || playlist.trackIds.includes(track.id)}
            onClick={async () => {
              setBusy(true);
              if (await onAdd(playlist.id)) onClose();
              else setError('The song could not be added. Please try again.');
              setBusy(false);
            }}
          >
            <PlaylistPreview playlist={playlist} tracks={tracks} />
            <span>
              {playlist.name}
              <small>
                {playlist.trackIds.includes(track.id)
                  ? 'Already added'
                  : `${playlist.trackIds.length} songs`}
              </small>
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="tonal-button" disabled={busy} onClick={onCreate}>
        <Plus size={19} />
        Create playlist
      </button>
    </Modal>
  );
}

function PlaylistPreview({ playlist, tracks }: { playlist: Playlist; tracks: Track[] }) {
  const visual = usePlaylistVisual(playlist, tracks);
  return <Artwork track={{ title: playlist.name, album: '', artwork: visual.artwork }} />;
}
