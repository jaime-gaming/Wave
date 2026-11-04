/**
 * Extra lyric providers, for word-by-word timings.
 *
 * LRCLIB is excellent at line timing and has no word stamps. NetEase and Kugou
 * publish word-level formats (YRC and KRC), which is the only realistic way to
 * get real per-word timing for a local file instead of an estimate.
 *
 * Both are community endpoints without a contract, so:
 * - they are **opt-in** in Settings and documented in PRIVACY;
 * - every request has a timeout and failures fall through to LRCLIB;
 * - only the title and artist are sent, never audio;
 * - a lyric is accepted only when the recording matches and the timings fit the
 *   file's duration.
 */
import {
  parseKugouCandidates,
  parseKugouLyric,
  parseNetEaseLyric,
  parseNetEaseSongs,
  pickProviderSong,
} from '../domain/wordProviders';
import {
  decodeKrc,
  hasWordTimings,
  headerOffsetMs,
  parseKrc,
  parseYrc,
  wordTimelinePlausible,
} from '../domain/wordLyrics';
import type { LyricLine } from '../domain/lyrics';

export const EXTENDED_LYRICS_KEY = 'wave-lyrics-extended';
export const PROVIDER_TIMEOUT_MS = 6_000;

export type WordProviderId = 'netease' | 'kugou';

export interface WordLyrics {
  provider: WordProviderId;
  lines: LyricLine[];
  offsetMs: number;
  /** Provider row id, kept so the interface can credit the source. */
  providerId?: string;
  /** True when the provider returned real per-word timing. */
  wordLevel: boolean;
}

interface Context {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export function extendedLyricsEnabled(): boolean {
  try {
    return localStorage.getItem(EXTENDED_LYRICS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setExtendedLyrics(enabled: boolean): void {
  try {
    localStorage.setItem(EXTENDED_LYRICS_KEY, String(enabled));
  } catch {
    /* Session-only preference. */
  }
}

async function getJson(url: string, context: Context): Promise<unknown> {
  const fetcher = context.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs ?? PROVIDER_TIMEOUT_MS);
  const abort = () => controller.abort();
  context.signal?.addEventListener('abort', abort);
  // Abort covers a normal fetch; the race covers an implementation that ignores
  // the signal, so a dead provider can never keep a lookup pending.
  let timerHandle: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timerHandle = setTimeout(() => resolve(undefined), context.timeoutMs ?? PROVIDER_TIMEOUT_MS);
  });
  try {
    const request = fetcher(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      if (!response.ok) return undefined;
      return (await response.json()) as unknown;
    });
    return await Promise.race([request.catch(() => undefined), deadline]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timerHandle);
    clearTimeout(timer);
    clearTimeout(timer);
    context.signal?.removeEventListener('abort', abort);
  }
}

const query = (title: string, artist: string) => `${title} ${artist}`.trim();

/** NetEase: search, then fetch the lyric with both formats requested. */
async function fromNetEase(
  track: { title: string; artist: string; duration: number },
  context: Context,
): Promise<WordLyrics | undefined> {
  const search = await getJson(
    `https://music.163.com/api/search/get/web?s=${encodeURIComponent(
      query(track.title, track.artist),
    )}&type=1&limit=10`,
    context,
  );
  const song = pickProviderSong(parseNetEaseSongs(search), track);
  if (!song) return undefined;
  const payload = await getJson(
    `https://music.163.com/api/song/lyric?id=${encodeURIComponent(song.id)}&lv=-1&kv=-1&tv=-1`,
    context,
  );
  const { yrc, lrc } = parseNetEaseLyric(payload);
  const wordLines = yrc ? parseYrc(yrc) : [];
  if (wordLines.length && wordTimelinePlausible(wordLines, track.duration))
    return {
      provider: 'netease',
      lines: wordLines,
      offsetMs: yrc ? headerOffsetMs(yrc) : 0,
      providerId: song.id,
      wordLevel: hasWordTimings(wordLines),
    };
  if (lrc) {
    const lines = parseYrc(lrc);
    if (lines.length && wordTimelinePlausible(lines, track.duration))
      return {
        provider: 'netease',
        lines,
        offsetMs: headerOffsetMs(lrc),
        providerId: song.id,
        wordLevel: false,
      };
  }
  return undefined;
}

/** Kugou: search for the lyric id, then download the KRC. */
async function fromKugou(
  track: { title: string; artist: string; duration: number },
  context: Context,
): Promise<WordLyrics | undefined> {
  const search = await getJson(
    `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(
      query(track.title, track.artist),
    )}`,
    context,
  );
  const song = pickProviderSong(parseKugouCandidates(search), track);
  if (!song?.accessKey) return undefined;
  const payload = await getJson(
    `https://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(
      song.id,
    )}&accesskey=${encodeURIComponent(song.accessKey)}&fmt=krc&charset=utf8`,
    context,
  );
  const { krc } = parseKugouLyric(payload);
  if (!krc) return undefined;
  const decoded = decodeKrc(krc) || krc;
  const lines = parseKrc(decoded);
  if (!lines.length || !wordTimelinePlausible(lines, track.duration)) return undefined;
  return {
    provider: 'kugou',
    lines,
    offsetMs: headerOffsetMs(decoded),
    providerId: song.id,
    wordLevel: hasWordTimings(lines),
  };
}

/**
 * Tries each provider until one returns usable word-level lyrics. Line-only
 * answers are ignored here on purpose: LRCLIB already does line timing better,
 * and mixing sources would make attribution and offsets inconsistent.
 */
export async function fetchWordLyrics(
  track: { title: string; artist: string; duration: number },
  context: Context = {},
): Promise<WordLyrics | undefined> {
  if (!isOnline() || !track.title || !track.artist) return undefined;
  for (const provider of [fromNetEase, fromKugou]) {
    if (context.signal?.aborted) return undefined;
    const result = await provider(track, context);
    if (result?.wordLevel) return result;
  }
  return undefined;
}

/** Human-readable provider name for attribution in the lyrics panel. */
export function wordProviderName(provider: WordProviderId): string {
  return provider === 'netease' ? 'NetEase' : 'Kugou';
}
