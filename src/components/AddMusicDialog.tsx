import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Link2, Video } from 'lucide-react';
import { Modal } from './Modal';
import { networkAriaLabel, networkLabel, useOnline } from '../ui/network';
import type { Track } from '../domain/types';

/**
 * "Add music" now asks where the song comes from.
 *
 * - **This device** imports files, exactly as before (MP3, WAV, M4A, OGG, FLAC).
 * - **YouTube** stores a reference to a video and plays it through the official
 *   embed. Nothing is downloaded, converted or extracted: playback needs a
 *   connection and the provider stays visible.
 */
export function AddMusicDialog({
  onClose,
  onLocal,
  onYouTube,
  onAdded,
  busy = false,
}: {
  onClose: () => void;
  onLocal: () => void;
  onYouTube: (link: string) => Promise<{ ok: boolean; error?: string; track?: Track }>;
  onAdded: (track: Track) => void;
  busy?: boolean;
}) {
  const [mode, setMode] = useState<'choose' | 'youtube'>('choose');
  const [link, setLink] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const online = useOnline();

  useEffect(() => {
    if (mode === 'youtube') input.current?.focus();
  }, [mode]);

  const submit = async () => {
    if (!link.trim() || pending) return;
    setPending(true);
    setError('');
    const result = await onYouTube(link.trim());
    setPending(false);
    if (!result.ok || !result.track) {
      setError(result.error ?? 'That link could not be added.');
      return;
    }
    onAdded(result.track);
    onClose();
  };

  return (
    <Modal title="Add music" className="add-music-modal" onClose={onClose}>
      {mode === 'choose' ? (
        <>
          <p className="modal-description">
            Songs from this device stay on this device. A YouTube song is a link: Wave plays it
            through YouTube&apos;s own player and never downloads it.
          </p>
          <div className="add-music-choices">
            <button
              type="button"
              className="add-music-choice"
              onClick={() => {
                onClose();
                onLocal();
              }}
              disabled={busy}
            >
              <FolderOpen size={24} aria-hidden="true" />
              <strong>From this device</strong>
              <span>MP3, WAV, M4A, OGG or FLAC, up to 200 MB each. Original files, untouched.</span>
            </button>
            <button
              type="button"
              className="add-music-choice"
              onClick={() => setMode('youtube')}
              disabled={busy || !online}
              aria-label={networkAriaLabel(online, 'From YouTube')}
            >
              <Video size={24} aria-hidden="true" />
              <strong>{networkLabel(online, 'From YouTube')}</strong>
              <span>
                {online
                  ? 'Paste a video link. The song plays from YouTube with its video, and Wave keeps its own controls.'
                  : 'Adding a YouTube song needs a connection. Files on this device work offline.'}
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="modal-description">
            Paste the YouTube link for the song. Wave reads its title and artist, and looks up
            lyrics like any other song.
          </p>
          <div className="video-clip-form">
            <label>
              <Link2 size={16} aria-hidden="true" />
              <span className="sr-only">YouTube link</span>
              <input
                ref={input}
                type="url"
                inputMode="url"
                placeholder="https://youtu.be/…"
                value={link}
                onChange={(event) => {
                  setLink(event.target.value);
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit();
                }}
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => void submit()}
              disabled={!link.trim() || pending}
            >
              {pending ? 'Adding…' : 'Add song'}
            </button>
          </div>
          {error && (
            <p className="video-clip-error" role="alert">
              {error}
            </p>
          )}
          <div className="add-music-footer">
            <button type="button" className="text-button" onClick={() => setMode('choose')}>
              Back
            </button>
          </div>
        </>
      )}
      <p className="add-music-note">
        {mode === 'youtube'
          ? 'Only the link is sent. Audio is never downloaded.'
          : 'Your files stay on this device.'}
      </p>
    </Modal>
  );
}
