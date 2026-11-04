import { useRef, useState } from 'react';
import { ImagePlus, X } from './Glyphs';
import { Artwork } from './Artwork';
import { ARTWORK_ACCEPT, readArtwork } from '../data/artwork';
import { useT } from '../i18n';

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
  const t = useT();
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
          {busy
            ? t('Reading image…')
            : value
              ? t(kind === 'photo' ? 'Replace photo' : 'Replace cover')
              : t(kind === 'photo' ? 'Add photo' : 'Add cover')}
        </button>
        {value && (
          <button
            type="button"
            className="text-button"
            disabled={disabled || busy}
            onClick={() => onChange(undefined)}
          >
            <X size={16} />
            {t(kind === 'photo' ? 'Remove photo' : 'Remove cover')}
          </button>
        )}
        <p>
          {t('JPEG, PNG or WebP · Up to 5 MB')}
          <br />
          {t(
            kind === 'photo'
              ? 'Saved as a square photo in Wave.'
              : 'Saved as a square cover in Wave.',
          )}
        </p>
      </div>
      <input
        ref={input}
        className="file-input"
        type="file"
        accept={ARTWORK_ACCEPT}
        disabled={disabled || busy}
        aria-label={t(kind === 'photo' ? 'Artist photo file' : 'Artwork file')}
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
            setError(
              reason instanceof Error ? t(reason.message) : t('This image could not be read.'),
            );
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
