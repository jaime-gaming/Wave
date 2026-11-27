import { lookupMetadata } from '../domain/lyricsMatch';
import { searchableTitle } from '../domain/searchText';

import {
  parseKugouCandidates,
  parseKugouLyric,
  parseNetEaseLyric,
  parseNetEaseSongs,
  rankProviderSongs,
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
export const PROVIDER_TIMEOUT_MS = 2_500;

export type WordProviderId = 'netease' | 'kugou';

export interface WordLyrics {
  provider: WordProviderId;
  lines: LyricLine[];
  offsetMs: number;

  providerId?: string;

  wordLevel: boolean;
}

interface Context {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;

  useWorker?: boolean;
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

function canUseWordWorker(context: Context): boolean {
  if (typeof context.useWorker === 'boolean') return context.useWorker;
  if (context.fetcher) return false;
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

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
  } catch {}
}

async function getJson(url: string, context: Context): Promise<unknown> {
  if (context.signal?.aborted) return undefined;
  const fetcher = context.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs ?? PROVIDER_TIMEOUT_MS);
  const abort = () => controller.abort();
  context.signal?.addEventListener('abort', abort);

  const deadline = new Promise<undefined>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(undefined), { once: true });
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
    clearTimeout(timer);
    controller.abort();
    context.signal?.removeEventListener('abort', abort);
  }
}

const query = (title: string, artist: string) =>
  `${searchableTitle(title) || title} ${artist}`.trim();

async function fromWorker(
  track: { title: string; artist: string; duration: number; fileName?: string },
  context: Context,
): Promise<WordLyrics | undefined> {
  if (!canUseWordWorker(context) || context.signal?.aborted) return undefined;
  const fetcher = context.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return undefined;
  const meta = lookupMetadata(track);
  const cleanTitle = searchableTitle(meta.title) || meta.title;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(6_000, context.timeoutMs ?? PROVIDER_TIMEOUT_MS),
  );
  const onAbort = () => controller.abort();
  context.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetcher('/api/word-lyrics', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ title: cleanTitle, artist: meta.artist, duration: track.duration }),
    });
    if (!res.ok) return undefined;
    const payload = (await res.json().catch(() => null)) as {
      results?: {
        provider?: WordProviderId;
        id?: string;
        title?: string;
        artist?: string;
        duration?: number;
        yrc?: string;
        krc?: string;
      }[];
    } | null;
    const items = payload?.results ?? [];
    if (!items.length) return undefined;
    const ranked = rankProviderSongs(
      items.map((item, idx) => ({
        id: String(idx),
        title: item.title || cleanTitle,
        artist: item.artist || meta.artist,
        duration: item.duration || 0,
      })),
      { ...track, ...meta },
    );
    const byId = new Map(items.map((item, idx) => [String(idx), item]));
    for (const candidate of ranked) {
      const item = byId.get(candidate.id);
      if (!item) continue;
      if (item.provider === 'netease' && item.yrc) {
        const wordLines = parseYrc(item.yrc);
        if (hasWordTimings(wordLines) && wordTimelinePlausible(wordLines, track.duration)) {
          return {
            provider: 'netease',
            lines: wordLines,
            offsetMs: headerOffsetMs(item.yrc),
            providerId: item.id,
            wordLevel: true,
          };
        }
      }
      if (item.provider === 'kugou' && item.krc) {
        const decoded = (await decodeKrc(item.krc)) || item.krc;
        const lines = parseKrc(decoded);
        if (hasWordTimings(lines) && wordTimelinePlausible(lines, track.duration)) {
          return {
            provider: 'kugou',
            lines,
            offsetMs: headerOffsetMs(decoded),
            providerId: item.id,
            wordLevel: true,
          };
        }
      }
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener('abort', onAbort);
  }
}

async function fromNetEase(
  track: { title: string; artist: string; duration: number; fileName?: string },
  context: Context,
): Promise<WordLyrics | undefined> {
  track = { ...track, ...lookupMetadata(track) };
  const search = await getJson(
    `https://music.163.com/api/search/get/web?s=${encodeURIComponent(
      query(lookupMetadata(track).title, lookupMetadata(track).artist),
    )}&type=1&limit=10`,
    context,
  );
  for (const song of rankProviderSongs(parseNetEaseSongs(search), track).slice(0, 3)) {
    if (context.signal?.aborted) return undefined;
    const payload = await getJson(
      `https://music.163.com/api/song/lyric?id=${encodeURIComponent(song.id)}&lv=-1&kv=-1&tv=-1&yv=-1`,
      context,
    );
    const { yrc } = parseNetEaseLyric(payload);
    const wordLines = yrc ? parseYrc(yrc) : [];
    if (hasWordTimings(wordLines) && wordTimelinePlausible(wordLines, track.duration))
      return {
        provider: 'netease',
        lines: wordLines,
        offsetMs: yrc ? headerOffsetMs(yrc) : 0,
        providerId: song.id,
        wordLevel: hasWordTimings(wordLines),
      };
  }

  return undefined;
}

async function fromKugou(
  track: { title: string; artist: string; duration: number; fileName?: string },
  context: Context,
): Promise<WordLyrics | undefined> {
  track = { ...track, ...lookupMetadata(track) };
  const search = await getJson(
    `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(
      query(lookupMetadata(track).title, lookupMetadata(track).artist),
    )}`,
    context,
  );
  for (const song of rankProviderSongs(parseKugouCandidates(search), track)
    .filter((song) => song.accessKey)
    .slice(0, 3)) {
    if (context.signal?.aborted) return undefined;
    const payload = await getJson(
      `https://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(
        song.id,
      )}&accesskey=${encodeURIComponent(song.accessKey!)}&fmt=krc&charset=utf8`,
      context,
    );
    const { krc } = parseKugouLyric(payload);
    if (!krc) continue;
    const decoded = (await decodeKrc(krc)) || krc;
    const lines = parseKrc(decoded);
    if (!hasWordTimings(lines) || !wordTimelinePlausible(lines, track.duration)) continue;
    return {
      provider: 'kugou',
      lines,
      offsetMs: headerOffsetMs(decoded),
      providerId: song.id,
      wordLevel: hasWordTimings(lines),
    };
  }
  return undefined;
}

export async function fetchWordLyrics(
  track: { title: string; artist: string; duration: number; fileName?: string },
  context: Context = {},
): Promise<WordLyrics | undefined> {
  if (!isOnline() || !track.title || !track.artist || context.signal?.aborted) return undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  context.signal?.addEventListener('abort', abort, { once: true });

  const timer = setTimeout(abort, 7000);
  try {
    const workerHit = await fromWorker(track, { ...context, signal: controller.signal });
    if (workerHit?.wordLevel && !controller.signal.aborted) return workerHit;
    if (controller.signal.aborted) return undefined;

    if (context.fetcher) {
      for (const provider of [fromNetEase, fromKugou]) {
        if (controller.signal.aborted) return undefined;
        const result = await provider(track, { ...context, signal: controller.signal });
        if (result?.wordLevel && !controller.signal.aborted) return result;
      }
      return undefined;
    }
    const attempts = [fromNetEase, fromKugou].map(async (provider) => {
      const result = await provider(track, { ...context, signal: controller.signal });
      if (!result?.wordLevel) throw new Error('miss');
      return result;
    });
    return await Promise.any(attempts).catch(() => undefined);
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

export function wordProviderName(provider: WordProviderId): string {
  return provider === 'netease' ? 'NetEase' : 'Kugou';
}
