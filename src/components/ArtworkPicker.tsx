import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Artwork } from './Artwork';
import { ARTWORK_ACCEPT, readArtwork } from '../data/artwork';

export function ArtworkPicker({
  value,
  onChange,
  onBusy,
  disabled = false,
  kind = 'cover',
}: {
  kind?: 'photo' | 'cover';
  value?: string;
  disabled?: boolean;
  onChange: (value?: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="artwork-picker">
      <Artwork track={{ title: 'Cover', album: '', artwork: value }} />
      <div>
        <button
          type="button"
          className="tonal-button"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={19} />
          {busy ? 'Reading image…' : value ? `Replace ${kind}` : `Add ${kind}`}
        </button>
        {value && (
          <button
            type="button"
            className="text-button"
            disabled={disabled || busy}
            onClick={() => onChange(undefined)}
          >
            <X size={16} />
            Remove {kind}
          </button>
        )}
        <p>
          JPEG, PNG or WebP · Up to 5 MB
          <br />
          Saved as a square {kind} in Wave.
        </p>
      </div>
      <input
        ref={input}
        className="file-input"
        type="file"
        accept={ARTWORK_ACCEPT}
        disabled={disabled || busy}
        aria-label={kind === 'photo' ? 'Artist photo file' : 'Artwork file'}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file || disabled || busy) return;
          setBusy(true);
          onBusy(true);
          setError('');
          try {
            onChange(await readArtwork(file));
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'This image could not be read.');
          } finally {
            setBusy(false);
            onBusy(false);
          }
        }}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
