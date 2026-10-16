import { lyricsRequest, LyricsPaused } from './lyricsRequests';
import { lyricsCooldown, rememberLyricsCooldown } from './lyricsCooldown';
import { parseLyrics, validLyricTimeline, type Lyrics } from '../domain/lyrics';
import { lyricsKey, type LyricsLookup } from '../domain/lyricsLookup';
import { lookupMetadata, recordingMatch } from '../domain/lyricsMatch';
import type { Track } from '../domain/types';
export interface LyricsResult {
  lookup: LyricsLookup;
  lyrics?: Lyrics;
}
const ROOT = 'https://lrclib.net/api';
async function boundedJson(response: Response): Promise<unknown> {
  const max = 600_000;
  if (Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel().catch(() => undefined);
    throw Error('Lyrics response too large.');
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > max) throw Error('Lyrics response too large.');
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw Error('Lyrics response too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function fetchLyrics(track: Track, signal: AbortSignal): Promise<LyricsResult> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const lookup: LyricsLookup = {
    key: lyricsKey(track),
    checkedAt: Date.now(),
    status: 'not-found',
  };
  const retryAt = lyricsCooldown();
  if (retryAt > Date.now()) return { lookup: { ...lookup, status: 'error', retryAt } };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 15_000);
  try {
    const metadata = lookupMetadata(track);
    if (!metadata.artist || !metadata.title) return { lookup };
    const params = new URLSearchParams({
      track_name: metadata.title,
      artist_name: metadata.artist,
    });
    if (track.album && track.album !== 'Unknown album')
      params.set('album_name', track.album.trim());
    if (track.duration >= 1 && track.duration <= 3600)
      params.set('duration', String(track.duration));
    const request = (path: string, query: URLSearchParams) =>
      lyricsRequest(controller.signal, async () => {
        const response = await fetch(`${ROOT}/${path}?${query}`, {
          signal: controller.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          // Safelisted headers avoid an OPTIONS preflight and a duplicate network retry.
          headers: { Accept: 'application/json' },
        });
        if (response.status === 404 || (path === 'get' && [400, 422].includes(response.status))) {
          await response.body?.cancel().catch(() => undefined);
          return undefined;
        }
        if (response.status === 429 || response.status === 503) {
          const value = response.headers.get('Retry-After');
          const seconds = Number(value);
          const date = Date.parse(value ?? '');
          const delay =
            value?.trim() && Number.isFinite(seconds * 1000) && seconds >= 0
              ? seconds * 1000
              : value?.trim() && !Number.isFinite(seconds) && Number.isFinite(date)
                ? Math.max(0, date - Date.now())
                : 60_000;
          lookup.retryAt = Math.max(lyricsCooldown(), Date.now() + Math.max(1000, delay));
          rememberLyricsCooldown(lookup.retryAt);
          await response.body?.cancel().catch(() => undefined);
          throw Error('Service cooldown.');
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw Error('Service unavailable.');
        }
        return boundedJson(response);
      });
    const resultFor = (match: ReturnType<typeof recordingMatch>): LyricsResult | undefined => {
      if (!match) return;
      const { record, synchronized } = match;
      if (record.instrumental === true) return { lookup: { ...lookup, status: 'instrumental' } };
      const parseCandidate = (raw: unknown) => {
        if (typeof raw !== 'string' || !raw.trim()) return;
        try {
          return parseLyrics(raw, 0, 'lrclib');
        } catch {
          return;
        }
      };
      const plain = parseCandidate(record.plainLyrics);
      let lyrics = synchronized ? parseCandidate(record.syncedLyrics) : undefined;
      // A malformed candidate must not prevent another verified recording from matching.
      if (!lyrics || !validLyricTimeline(lyrics, track.duration)) lyrics = plain;
      if (!lyrics) {
        const timed = parseCandidate(record.syncedLyrics);
        if (timed) lyrics = parseCandidate(timed.lines.map((line) => line.text).join('\n'));
      }
      if (!lyrics) return;
      if (!synchronized || !validLyricTimeline(lyrics, track.duration)) {
        lyrics = parseCandidate(lyrics.lines.map((line) => line.text).join('\n'));
        if (!lyrics || lyrics.lines.some((line) => line.time !== undefined)) return;
      }
      if (!lyrics.lines.some((line) => line.text)) return;
      if (typeof record.id === 'number' && Number.isSafeInteger(record.id) && record.id > 0)
        lyrics.providerId = record.id;
      return { lookup: { ...lookup, status: 'found' }, lyrics };
    };
    let deferred: LyricsResult | undefined;
    const accept = (value: unknown) => {
      const match = recordingMatch(value, track),
        result = resultFor(match);
      if (result && match?.album === 'conflict') {
        // A compilation/other album may supply text, but not authoritative timing.
        if (result.lyrics) deferred ??= result;
        return;
      }
      return result;
    };
    let value = params.has('duration') ? await request('get', params) : undefined;
    let found = accept(value);
    if (found) return found;
    if (params.has('album_name') && params.has('duration')) {
      params.delete('album_name');
      value = await request('get', params);
      found = accept(value);
      if (found) return found;
    }
    for (const query of [
      new URLSearchParams({ track_name: metadata.title, artist_name: metadata.artist }),
      new URLSearchParams({ q: `${metadata.title} ${metadata.artist}` }),
      ...(track.artist.trim() !== metadata.artist
        ? [new URLSearchParams({ track_name: metadata.title, artist_name: track.artist.trim() })]
        : []),
    ]) {
      const results = await request('search', query);
      if (!Array.isArray(results)) continue;
      const matches = results
        .slice(0, 20)
        .map((value) => recordingMatch(value, track))
        .filter((match): match is NonNullable<typeof match> => !!match)
        .sort((a, b) => b.score - a.score);
      for (const match of matches) {
        found = accept(match.record);
        if (found) return found;
      }
    }
    return deferred ?? { lookup };
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof LyricsPaused) lookup.retryAt = error.retryAt;
    return { lookup: { ...lookup, status: 'error' } };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

interface PendingLookup {
  controller: AbortController;
  promise: Promise<LyricsResult>;
  users: number;
}
const pending = new Map<string, PendingLookup>();

/** Share identical concurrent work, while keeping every caller's cancellation independent. */
export function lookupLyrics(track: Track, signal: AbortSignal): Promise<LyricsResult> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  // Include inferred identity and exact duration; never coalesce different recording identities.
  const metadata = lookupMetadata(track);
  const key = JSON.stringify([lyricsKey(track), metadata.title, metadata.artist, track.duration]);
  let entry = pending.get(key);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, promise: fetchLyrics(track, controller.signal), users: 0 };
    pending.set(key, entry);
    const current = entry;
    const remove = () => {
      if (pending.get(key) === current) pending.delete(key);
    };
    void entry.promise.then(remove, remove);
  }
  const current = entry;
  current.users++;
  return new Promise((resolve, reject) => {
    let finished = false;
    const settle = (action: () => void) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', abort);
      if (--current.users === 0) {
        if (pending.get(key) === current) pending.delete(key);
        current.controller.abort();
      }
      action();
    };
    const abort = () => settle(() => reject(new DOMException('Aborted', 'AbortError')));
    signal.addEventListener('abort', abort, { once: true });
    void current.promise.then(
      (result) => settle(() => resolve(structuredClone(result))),
      (error: unknown) => settle(() => reject(error)),
    );
    if (signal.aborted) abort();
  });
}
