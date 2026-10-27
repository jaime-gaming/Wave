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
/** Whole search budget: a song either finds a clip quickly or says so. */
export const CLIP_SEARCH_TIMEOUT_MS = 7_000;
/** How long one host is allowed to answer before the next one is asked. */
export const CLIP_PROVIDER_TIMEOUT_MS = 2_500;
/** A host that just failed is skipped for this long instead of being retried. */
export const PROVIDER_COOLDOWN_MS = 10 * 60_000;
/** An "empty" answer is re-checked after a day: instances move, matches appear. */
export const MISS_TTL_MS = 24 * 60 * 60_000;
export const MAX_CLIP_CACHE = 400;

interface Provider {
  name: string;
  url: (query: string) => string;
  parse: (payload: unknown) => ClipCandidate[];
}

/**
 * Public front-ends, asked in order until one answers with a usable list.
 *
 * No API key and no catalogue: Piped and Invidious are community services and
 * any single instance is regularly down, rate limited or behind a challenge.
 * One instance was never enough — that is why clip search used to look broken —
 * so the list is long, a dead host is remembered and skipped for ten minutes,
 * and the whole search gives up after seven seconds instead of hanging.
 */
export const CLIP_PROVIDERS: Provider[] = [
  {
    name: 'piped.kavin',
    url: (query) =>
      `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`,
    parse: parsePipedResults,
  },
  {
    name: 'invidious.nadeko',
    url: (query) =>
      `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    parse: parseInvidiousResults,
  },
  {
    name: 'piped.adminforge',
    url: (query) =>
      `https://pipedapi.adminforge.de/search?q=${encodeURIComponent(query)}&filter=videos`,
    parse: parsePipedResults,
  },
  {
    name: 'invidious.yewtu',
    url: (query) => `https://yewtu.be/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    parse: parseInvidiousResults,
  },
  {
    name: 'piped.reallyaweso',
    url: (query) =>
      `https://pipedapi.reallyaweso.me/search?q=${encodeURIComponent(query)}&filter=videos`,
    parse: parsePipedResults,
  },
  {
    name: 'invidious.nerdvpn',
    url: (query) =>
      `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    parse: parseInvidiousResults,
  },
  {
    name: 'piped.privatecoffee',
    url: (query) =>
      `https://api.piped.private.coffee/search?q=${encodeURIComponent(query)}&filter=videos`,
    parse: parsePipedResults,
  },
  {
    name: 'invidious.ggtyler',
    url: (query) =>
      `https://iv.ggtyler.dev/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    parse: parseInvidiousResults,
  },
];

/** Hosts that failed recently, by name; skips dead instances for a while. */
const cooling = new Map<string, number>();

/** Only for tests: forget which hosts were marked dead. */
export function resetProviderHealth() {
  cooling.clear();
}

function coolingDown(name: string, now: number): boolean {
  const until = cooling.get(name);
  if (until === undefined) return false;
  if (until > now) return true;
  cooling.delete(name);
  return false;
}

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
  /** Budget for the whole search, across providers. */
  timeoutMs?: number;
  /** How long one host gets before the next one is asked. */
  providerTimeoutMs?: number;
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
    if ('miss' in cached) {
      // Retried once the negative answer is old enough to be worth doubting.
      if (Date.now() - cached.at < MISS_TTL_MS) return { status: 'empty' };
    } else {
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
  }

  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return { status: 'unavailable' };
  // An explicit retry means the user asked again: give every host another chance.
  if (options.refresh) cooling.clear();
  const budget = options.timeoutMs ?? CLIP_SEARCH_TIMEOUT_MS;
  const providerTimeout = options.providerTimeoutMs ?? CLIP_PROVIDER_TIMEOUT_MS;
  const deadline = Date.now() + budget;
  let answered = false;
  const now = Date.now();

  for (const provider of options.providers ?? CLIP_PROVIDERS) {
    if (Date.now() >= deadline) break;
    if (!options.providers && coolingDown(provider.name, now)) continue;
    const controller = new AbortController();
    const wait = Math.min(providerTimeout, Math.max(500, deadline - Date.now()));
    const timer = setTimeout(() => controller.abort(), wait);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);
    let payload: unknown;
    try {
      const response = await fetcher(provider.url(query), {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response?.ok) throw new Error('provider refused');
      payload = await response.json();
    } catch {
      // Dead, blocked, rate limited or not JSON at all: skip this host for a
      // while and ask the next one.
      cooling.set(provider.name, Date.now() + PROVIDER_COOLDOWN_MS);
      continue;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
    // The host answered with JSON: it is alive, even if nothing matches.
    answered = true;
    const best = pickClip(provider.parse(payload), source);
    if (!best) continue;
    cooling.delete(provider.name);
    writeCache({ ...cache, [key]: { ...best, at: Date.now() } }, store);
    return { status: 'found', candidate: best, cached: false };
  }

  if (!answered) return { status: 'unavailable' };
  // A real answer with no convincing match is remembered for a day, so Wave does
  // not ask on every visit but a later search can still find a new upload.
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
