import { useState } from 'react';
import { Modal } from './Modal';
import { ArtworkPicker } from './ArtworkPicker';
import type { ArtistProfile } from '../domain/types';
export function ArtistEditor({
  profile,
  onSave,
  onClose,
}: {
  profile: ArtistProfile;
  onSave: (profile: ArtistProfile) => Promise<boolean>;
  onClose: () => void;
}) {
  const [artwork, setArtwork] = useState(profile.artwork),
    [busy, setBusy] = useState(false),
    [imageBusy, setImageBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Edit artist photo" closeDisabled={busy || imageBusy} onClose={onClose}>
      <p className="modal-description">
        Choose a profile photo for {profile.name}. It is saved locally, separately from album
        covers. Nothing is downloaded or uploaded.
      </p>
      <ArtworkPicker
        value={artwork}
        kind="photo"
        disabled={busy}
        onChange={setArtwork}
        onBusy={setImageBusy}
      />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="tonal-button" disabled={busy || imageBusy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="filled-button"
          disabled={busy || imageBusy}
          onClick={async () => {
            setBusy(true);
            if (await onSave({ ...profile, artwork })) onClose();
            else setError('This photo could not be saved. Try again.');
            setBusy(false);
          }}
        >
          Save artist photo
        </button>
      </div>
    </Modal>
  );
}
