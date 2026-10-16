import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import type { Track, TrackMetadata } from '../domain/types';
import { Modal } from './Modal';
import { ArtworkPicker } from './ArtworkPicker';

export function TrackEditor({
  track,
  onClose,
  onSave,
  onRestore,
}: {
  track: Track;
  onClose: () => void;
  onSave: (id: string, metadata: TrackMetadata) => Promise<boolean>;
  onRestore: (id: string) => Promise<boolean>;
}) {
  const [metadata, setMetadata] = useState<TrackMetadata>({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
  });
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');
  const busy = saving || imageBusy;
  return (
    <Modal
      title="Edit song"
      closeDisabled={busy}
      className="editor-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="modal-description">
        Changes apply to your Wave library. Your original audio file stays unchanged.
      </p>
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setSaving(true);
          setError('');
          if (await onSave(track.id, metadata)) onClose();
          else setError('Changes could not be saved. Please try again.');
          setSaving(false);
        }}
      >
        <ArtworkPicker
          value={metadata.artwork}
          disabled={saving}
          onChange={(artwork) => setMetadata((current) => ({ ...current, artwork }))}
          onBusy={setImageBusy}
        />
        {(['title', 'artist', 'album'] as const).map((field) => (
          <label className="form-field" key={field}>
            {field[0].toUpperCase() + field.slice(1)}
            <input
              value={metadata[field]}
              required={field === 'title'}
              maxLength={200}
              disabled={saving}
              onChange={(event) =>
                setMetadata((current) => ({ ...current, [field]: event.target.value }))
              }
            />
          </label>
        ))}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {track.originalMetadata && (
          <button
            type="button"
            className="text-button restore-metadata"
            disabled={busy}
            onClick={async () => {
              setSaving(true);
              if (await onRestore(track.id)) onClose();
              else setError('Original information could not be restored.');
              setSaving(false);
            }}
          >
            <RotateCcw size={18} />
            Restore original information and cover
          </button>
        )}
        <div className="modal-actions">
          <button type="button" className="tonal-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="filled-button" disabled={busy || !metadata.title.trim()}>
            <Save size={18} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
