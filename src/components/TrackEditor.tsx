import { AudioTrimEditor } from './AudioTrimEditor';
import { useState } from 'react';
import { RotateCcw, Save } from './Glyphs';
import type { Track, TrackMetadata } from '../domain/types';
import { Modal } from './Modal';
import { ArtworkPicker } from './ArtworkPicker';
import { ClipSection } from './ClipSection';

import { useT } from '../i18n';
export function TrackEditor({
  track,
  onClose,
  onSave,
  onRestore,
  onRestoreSilence,
  onTrim,
  onPreview,
  previewVolume,
  onFixVolume,
}: {
  onFixVolume?: (id: string, reset?: boolean) => Promise<Track['volumeFix']>;
  onPreview?: () => void;
  previewVolume?: number;
  onTrim?: (bounds: { start: number; end: number }) => Promise<void>;
  track: Track;
  onClose: () => void;
  onSave: (id: string, metadata: TrackMetadata) => Promise<boolean>;
  onRestore: (id: string) => Promise<boolean>;
  /** Gives the silent edges back, leaving every byte of the file as it was. */
  onRestoreSilence?: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [metadata, setMetadata] = useState<TrackMetadata>({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
  });
  const [trimming, setTrimming] = useState(false);
  const [bounds, setBounds] = useState<{ start: number; end: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');
  const [fixingVolume, setFixingVolume] = useState(false);
  const [volumeFix, setVolumeFix] = useState(track.volumeFix);
  const busy = saving || imageBusy || fixingVolume;
  const adjustVolume = async (reset = false) => {
    if (!onFixVolume || busy) return;
    setFixingVolume(true);
    setError('');
    try {
      setVolumeFix(await onFixVolume(track.id, reset));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Volume could not be adjusted.'));
    } finally {
      setFixingVolume(false);
    }
  };
  return (
    <Modal
      title={trimming ? 'Trim audio' : t('Edit song')}
      closeDisabled={busy}
      className="editor-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {!trimming && (
        <p className="modal-description">
          Changes apply to your Wave library. Your original audio file stays unchanged.
        </p>
      )}
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setSaving(true);
          setError('');
          if (await onSave(track.id, metadata)) {
            if (bounds) await onTrim?.(bounds);
            onClose();
          } else setError(t('Changes could not be saved. Please try again.'));
          setSaving(false);
        }}
      >
        {trimming ? (
          <>
            <AudioTrimEditor
              track={track}
              value={bounds}
              onChange={setBounds}
              onPreview={onPreview}
              volume={previewVolume}
            />
            <button type="button" className="tonal-button" onClick={() => setTrimming(false)}>
              ← Back to song details
            </button>
          </>
        ) : (
          <>
            <ArtworkPicker
              value={metadata.artwork}
              disabled={busy}
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
                  disabled={busy}
                  onChange={(event) =>
                    setMetadata((current) => ({ ...current, [field]: event.target.value }))
                  }
                />
              </label>
            ))}
            <ClipSection track={track} />
            {track.blob && onFixVolume && (
              <section className="volume-fix-control" aria-label={t('Fix volume')}>
                <button
                  type="button"
                  className="editor-submenu-button"
                  disabled={busy}
                  onClick={() => void adjustVolume()}
                >
                  <span>
                    <strong>{fixingVolume ? t('Measuring volume…') : t('Fix volume')}</strong>
                    <small>{t('Balance this recording without changing the file')}</small>
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
                {volumeFix && (
                  <p role="status">
                    {t('Volume adjusted')} · {Math.round(20 * Math.log10(volumeFix.gain) * 10) / 10}{' '}
                    dB
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => void adjustVolume(true)}
                    >
                      {t('Restore original volume')}
                    </button>
                  </p>
                )}
              </section>
            )}
            {track.blob && (
              <button
                type="button"
                className="editor-submenu-button"
                onClick={() => setTrimming(true)}
              >
                <span>
                  <strong>Trim audio</strong>
                  <small>Shape the beginning and ending</small>
                </span>
                <span>↗</span>
              </button>
            )}
            {/*
             * Silent edges, offered once they have been measured. The original file
             * is never altered: skipping silence is a pair of bounds, and undoing it
             * gives the song back exactly as it arrived.
             */}
            {track.trim && (
              <button
                type="button"
                className="text-button silence-editor-restore"
                disabled={busy}
                onClick={async () => {
                  setSaving(true);
                  await onRestoreSilence?.(track.id);
                  setSaving(false);
                }}
              >
                <RotateCcw size={18} />
                Play the whole file again
              </button>
            )}
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
                  else setError(t('Original information could not be restored.'));
                  setSaving(false);
                }}
              >
                <RotateCcw size={18} />
                Restore original information and cover
              </button>
            )}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="tonal-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="filled-button" disabled={busy || !metadata.title.trim()}>
            <Save size={18} />
            {saving ? t('Saving…') : t('Save changes')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
