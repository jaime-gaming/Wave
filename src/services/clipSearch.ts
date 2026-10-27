/**
 * Finds the video clip for a song without asking the user for a link.
 *
 * Wave 1.1 has no provider catalogue and no API key, so the search goes through
 * public, CORS-friendly YouTube front-ends (Piped and Invidious). Both are
 * best-effort community services: when they are down or rate limited the answer
 * is `unavailable`, the paste-a-link form stays on screen, and nothing about
 * playback degrades.
 *
 * Privacy: only the song title and artist are sent. No audio, no identifiers, and
 * the chosen clip is remembered locally so the search happens once per song.
 */
import {
  clipQuery,
  parseInvidiousResults,
  parsePipedResults,
  pickClip,
  type ClipCandidate,
} from '../domain/clipSearch';
import { storeClip, type StoredClip } from '../domain/videoClips';

export const CLIP_CACHE_KEY = 'wave-clip-search-v1';
export const CLIP_SEARCH_TIMEOUT_MS = 6_000;
export const MAX_CLIP_CACHE = 400;

interface Provider {
  name: string;
  url: (query: string) => string;
  parse: (payload: unknown) => ClipCandidate[];
}

/** Ordered by how reliably they answer from a browser without a key. */
export const CLIP_PROVIDERS: Provider[] = [
  {
    name: 'piped',
    url: (query) =>
      `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`,
    parse: parsePipedResults,
  },
  {
    name: 'invidious',
    url: (query) =>
      `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    parse: parseInvidiousResults,
  },
];

type CacheEntry = ClipCandidate & { at: number };
type Cache = Record<string, CacheEntry | { at: number; miss: true }>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readCache(store: Storage | null = storage()): Cache {
  if (!store) return {};
  try {
    const raw = store.getItem(CLIP_CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Cache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Cache, store: Storage | null = storage()): void {
  if (!store) return;
  const entries = Object.entries(cache);
  const trimmed =
    entries.length > MAX_CLIP_CACHE
      ? Object.fromEntries(entries.slice(entries.length - MAX_CLIP_CACHE))
      : cache;
  try {
    store.setItem(CLIP_CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* Cache only. */
  }
}

export type ClipSearchResult =
  | { status: 'found'; candidate: ClipCandidate; cached: boolean }
  | { status: 'empty' }
  | { status: 'unavailable' };

export interface ClipSearchOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Skip the local cache; used by the manual retry button. */
  refresh?: boolean;
  providers?: Provider[];
  store?: Storage | null;
}

/**
 * Searches for the song's clip. Never throws: a blocked request, an offline
 * device and a provider that changed shape all resolve to `unavailable`.
 */
export async function findClip(
  source: { title: string; artist: string; duration: number },
  options: ClipSearchOptions = {},
): Promise<ClipSearchResult> {
  const query = clipQuery(source);
  if (!query) return { status: 'empty' };
  const key = query;
  const store = options.store === undefined ? storage() : options.store;
  const cache = readCache(store);
  const cached = cache[key];
  if (!options.refresh && cached) {
    if ('miss' in cached) return { status: 'empty' };
    return {
      status: 'found',
      cached: true,
      candidate: {
        videoId: cached.videoId,
        title: cached.title,
        author: cached.author,
        duration: cached.duration,
      },
    };
  }

  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return { status: 'unavailable' };
  const timeout = options.timeoutMs ?? CLIP_SEARCH_TIMEOUT_MS;
  let answered = false;

  for (const provider of options.providers ?? CLIP_PROVIDERS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);
    try {
      const response = await fetcher(provider.url(query), {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) continue;
      answered = true;
      const best = pickClip(provider.parse(await response.json()), source);
      if (!best) continue;
      writeCache({ ...cache, [key]: { ...best, at: Date.now() } }, store);
      return { status: 'found', candidate: best, cached: false };
    } catch {
      // Try the next provider; the caller only needs to know whether any answered.
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  if (!answered) return { status: 'unavailable' };
  // A real answer with no convincing match is remembered so Wave does not ask
  // again on every visit, but the user can still paste a link.
  writeCache({ ...cache, [key]: { at: Date.now(), miss: true } }, store);
  return { status: 'empty' };
}

/** Saves a discovered clip so the backdrop opens straight into the video. */
export function rememberClip(
  trackId: string,
  candidate: ClipCandidate,
  store: Storage | null = storage(),
): StoredClip | null {
  return storeClip(trackId, candidate.videoId, 0, store);
}
