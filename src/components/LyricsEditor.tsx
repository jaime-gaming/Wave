import { lookupLyrics } from '../services/lyrics';
import { extendedLyricsEnabled } from '../services/lyricsExtra';
import { lyricsCooldown } from '../services/lyricsCooldown';
import { canLookup } from '../domain/lyricsLookup';
import { useEffect, useRef, useState } from 'react';
import { FileUp, Save, Trash2, Search, X } from './Glyphs';
import { parseLyrics, MAX_LYRICS_LENGTH, type Lyrics } from '../domain/lyrics';
import type { Track } from '../domain/types';
import { Modal } from './Modal';
import { useT } from '../i18n';
export function LyricsEditor({
  track,
  onSave,
  onClose,
  retryAt = 0,
}: {
  track: Track;
  retryAt?: number;
  onSave: (id: string, lyrics?: Lyrics) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useT();
  const [raw, setRaw] = useState(track.lyrics?.raw ?? ''),
    [offset, setOffset] = useState(track.lyrics?.offsetMs ?? 0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [searching, setSearching] = useState(false),
    [candidate, setCandidate] = useState<Lyrics>(),
    [applied, setApplied] = useState<Lyrics | undefined>(track.lyrics),
    [searchMessage, setSearchMessage] = useState('');
  const [cooldown, setCooldown] = useState(() => Math.max(retryAt, lyricsCooldown())),
    [now, setNow] = useState(Date.now);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const remaining = Math.max(cooldown, retryAt) - now;
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(remaining, 2147483647));
    return () => clearTimeout(timer);
  }, [cooldown, retryAt, now]);
  const search = async () => {
    const deadline = Math.max(cooldown, retryAt, lyricsCooldown());
    if (searching || deadline > Date.now()) {
      setCooldown(deadline);
      setNow(Date.now());
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setCandidate(undefined);
    setSearchMessage(
      extendedLyricsEnabled() ? 'Looking for word-by-word lyrics…' : t('Searching LRCLIB…'),
    );
    try {
      const result = await lookupLyrics(track, controller.signal);
      if (controller.signal.aborted) return;
      setCandidate(result.lyrics);
      setCooldown(result.lookup.retryAt ?? 0);
      setNow(Date.now());
      setSearchMessage(
        result.lyrics
          ? t('Matching lyrics found. Use the result to replace the draft, then Save lyrics.')
          : result.lookup.status === 'instrumental'
            ? t('This recording is listed as instrumental.')
            : result.lookup.status === 'error'
              ? t('Lyrics could not be retrieved. Your draft is unchanged.')
              : t('No matching lyrics found for this recording. Your draft is unchanged.'),
      );
    } catch {
      if (!controller.signal.aborted)
        setSearchMessage(t('Lyrics could not be retrieved. Your draft is unchanged.'));
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };
  const file = useRef<HTMLInputElement>(null);
  const save = async (remove = false) => {
    setError('');
    setBusy(true);
    try {
      const parsed = remove
        ? undefined
        : parseLyrics(raw, offset, applied?.raw === raw ? applied.source : 'local');
      if (parsed && applied?.raw === raw) {
        parsed.lines = applied.lines;
        parsed.providerId = applied.providerId;
        parsed.provider = applied.provider;
      }
      if (!remove && !parsed?.lines.some((line) => line.text))
        throw Error(t('Add some lyrics or choose Remove lyrics.'));
      if (await onSave(track.id, parsed)) onClose();
      else setError(t('Lyrics could not be saved. Please try again.'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Lyrics could not be read.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('Edit lyrics')}
      onClose={onClose}
      closeDisabled={busy}
      className="lyrics-editor-modal"
    >
      <div className="lyrics-editor-body">
        <p className="modal-description">
          {track.title} · {track.artist}
          <br />
          Import LRC timestamps like [00:12.500], or paste plain text. Your audio file stays
          unchanged. No automatic online lookup is performed.
        </p>
        <section className="editor-lookup" aria-label={t('Find lyrics')}>
          <p>
            {extendedLyricsEnabled()
              ? 'Search for real word-by-word timings, with line-synced lyrics as a fallback.'
              : 'Search for matching lyrics.'}{' '}
            Only song information is sent, never your audio. Nothing changes until you save.
          </p>
          <div className="editor-lookup-actions">
            <button
              className="tonal-button"
              disabled={busy || searching || !canLookup(track) || Math.max(cooldown, retryAt) > now}
              onClick={() => void search()}
            >
              <Search size={18} />
              Search online
            </button>
            {searching && (
              <button
                className="text-button"
                onClick={() => {
                  request.current?.abort();
                  setSearching(false);
                  setSearchMessage(t('Search canceled. Your draft is unchanged.'));
                }}
              >
                <X size={18} />
                Cancel search
              </button>
            )}
          </div>
          {!canLookup(track) && (
            <p>{t('Add a song title and artist in Song options before searching.')}</p>
          )}
          <p role="status" aria-live="polite">
            {searchMessage}
            {Math.max(cooldown, retryAt) > now &&
              ` Try again after ${new Date(Math.max(cooldown, retryAt)).toLocaleTimeString()}.`}
          </p>
          {candidate && (
            <>
              <pre className="editor-result" tabIndex={0} aria-label={t('Lyrics search preview')}>
                {candidate.raw}
              </pre>
              <button
                className="tonal-button"
                disabled={busy}
                onClick={() => {
                  setRaw(candidate.raw);
                  setOffset(candidate.offsetMs);
                  setApplied(candidate);
                  setCandidate(undefined);
                  setSearchMessage(t('Result placed in the draft. Save lyrics to keep it.'));
                }}
              >
                Use found lyrics
              </button>
              <span className="lyrics-search-source">
                {candidate.provider ?? 'LRCLIB'} ·{' '}
                {candidate.lines.some((line) => line.words?.length)
                  ? 'Word by word'
                  : 'Line synced'}
              </span>
            </>
          )}
        </section>
        <button className="tonal-button" disabled={busy} onClick={() => file.current?.click()}>
          <FileUp size={18} /> Import LRC or TXT
        </button>
        <input
          ref={file}
          type="file"
          className="file-input"
          aria-label={t('Lyrics file')}
          accept=".lrc,.txt,text/plain"
          disabled={busy}
          onChange={async (event) => {
            const input = event.currentTarget,
              selected = input.files?.[0];
            input.value = '';
            if (!selected) return;
            setBusy(true);
            setError('');
            try {
              if (selected.size > MAX_LYRICS_LENGTH * 3 || !/\.(lrc|txt)$/i.test(selected.name))
                throw Error(t('Choose an LRC or TXT file up to 300 KB.'));
              const text = await selected.text();
              parseLyrics(text);
              setRaw(text);
              setOffset(0);
              setApplied(undefined);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : t('The file could not be read.'));
            } finally {
              setBusy(false);
            }
          }}
        />
        <label className="form-field lyrics-field">
          {t('Lyrics')}
          <textarea
            value={raw}
            disabled={busy}
            maxLength={MAX_LYRICS_LENGTH}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={'[00:05.000]First line\n[00:12.500]Next line'}
          />
        </label>
        <label className="form-field">
          Timing offset (ms)
          <input
            type="number"
            min={-10000}
            max={10000}
            step={100}
            value={offset}
            disabled={busy}
            onChange={(event) => setOffset(Number(event.target.value))}
          />
        </label>
        <p className="lyrics-caption">{t('Positive values show lines later.')}</p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <div className="modal-actions">
        {track.lyrics && (
          <button className="text-button" disabled={busy} onClick={() => void save(true)}>
            <Trash2 size={18} />
            Remove lyrics
          </button>
        )}
        <button className="tonal-button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="filled-button"
          onClick={() => void save()}
          disabled={busy || !raw.trim()}
        >
          <Save size={18} />
          {busy ? t('Saving…') : t('Save lyrics')}
        </button>
      </div>
    </Modal>
  );
}
