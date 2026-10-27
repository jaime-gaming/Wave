import { lookupLyrics } from '../services/lyrics';
import { lyricsCooldown } from '../services/lyricsCooldown';
import { canLookup } from '../domain/lyricsLookup';
import { useEffect, useRef, useState } from 'react';
import { FileUp, Save, Trash2, Search, X } from 'lucide-react';
import { parseLyrics, MAX_LYRICS_LENGTH, type Lyrics } from '../domain/lyrics';
import type { Track } from '../domain/types';
import { Modal } from './Modal';
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
  const [raw, setRaw] = useState(track.lyrics?.raw ?? ''),
    [offset, setOffset] = useState(track.lyrics?.offsetMs ?? 0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [searching, setSearching] = useState(false),
    [candidate, setCandidate] = useState<Lyrics>(),
    [applied, setApplied] = useState<Lyrics>(),
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
    setSearchMessage('Searching LRCLIB…');
    try {
      const result = await lookupLyrics(track, controller.signal);
      if (controller.signal.aborted) return;
      setCandidate(result.lyrics);
      setCooldown(result.lookup.retryAt ?? 0);
      setNow(Date.now());
      setSearchMessage(
        result.lyrics
          ? 'Matching lyrics found. Use the result to replace the draft, then Save lyrics.'
          : result.lookup.status === 'instrumental'
            ? 'This recording is listed as instrumental.'
            : result.lookup.status === 'error'
              ? 'Lyrics could not be retrieved. Your draft is unchanged.'
              : 'No matching lyrics found for this recording. Your draft is unchanged.',
      );
    } catch {
      if (!controller.signal.aborted)
        setSearchMessage('Lyrics could not be retrieved. Your draft is unchanged.');
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
        : parseLyrics(raw, offset, applied?.raw === raw ? 'lrclib' : 'local');
      if (parsed && applied?.raw === raw) parsed.providerId = applied.providerId;
      if (!remove && !parsed?.lines.some((line) => line.text))
        throw Error('Add some lyrics or choose Remove lyrics.');
      if (await onSave(track.id, parsed)) onClose();
      else setError('Lyrics could not be saved. Please try again.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Lyrics could not be read.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Edit lyrics"
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
        <section className="editor-lookup" aria-label="Find lyrics">
          <p>
            Search LRCLIB with this song’s title, artist, album and duration. Your audio is never
            sent. Playback and automatic lookup are not required. Results are saved only when you
            choose Save lyrics.
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
                  setSearchMessage('Search canceled. Your draft is unchanged.');
                }}
              >
                <X size={18} />
                Cancel search
              </button>
            )}
          </div>
          {!canLookup(track) && (
            <p>Add a song title and artist in Song options before searching.</p>
          )}
          <p role="status" aria-live="polite">
            {searchMessage}
            {Math.max(cooldown, retryAt) > now &&
              ` Try again after ${new Date(Math.max(cooldown, retryAt)).toLocaleTimeString()}.`}
          </p>
          {candidate && (
            <>
              <pre className="editor-result" tabIndex={0} aria-label="Lyrics search preview">
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
                  setSearchMessage('Result placed in the draft. Save lyrics to keep it.');
                }}
              >
                Use found lyrics
              </button>
              <a href="https://lrclib.net" target="_blank" rel="noreferrer">
                LRCLIB
              </a>
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
          aria-label="Lyrics file"
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
                throw Error('Choose an LRC or TXT file up to 300 KB.');
              const text = await selected.text();
              parseLyrics(text);
              setRaw(text);
              setOffset(0);
              setApplied(undefined);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'The file could not be read.');
            } finally {
              setBusy(false);
            }
          }}
        />
        <label className="form-field lyrics-field">
          Lyrics
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
        <p className="lyrics-caption">Positive values show lines later.</p>
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
          {busy ? 'Saving…' : 'Save lyrics'}
        </button>
      </div>
    </Modal>
  );
}
