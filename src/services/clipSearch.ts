import { lookupMetadata } from '../domain/lyricsMatch';

import {
  autoClipStart,
  clipQuery,
  isAudioOnly,
  isMusicVideo,
  scoreClip,
  parseInvidiousResults,
  parsePipedResults,
  pickClip,
  rankClips,
  videoClipQuery,
  type ClipCandidate,
} from '../domain/clipSearch';
import { storeClip, type StoredClip } from '../domain/videoClips';

export const CLIP_CACHE_KEY = 'wave-clip-search-v1';

export const CLIP_SEARCH_TIMEOUT_MS = 9_000;

export const CLIP_PROVIDER_TIMEOUT_MS = 4_000;

export const CLIP_SEARCH_HEDGE_MS = 850;

export const CLIP_PROVIDERS_MAX_WORKERS = 4;

export const PROVIDER_COOLDOWN_MS = 10 * 60_000;

export const MISS_TTL_MS = 24 * 60 * 60_000;
export const MAX_CLIP_CACHE = 400;

interface Provider {
  name: string;
  url: (query: string) => string;
  parse: (payload: unknown) => ClipCandidate[];
}

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
  {
    name: 'piped.drgns',
    url: (query) =>
      `https://pipedapi.drgns.space/search?q=${encodeURIComponent(query)}&filter=videos`,
    parse: parsePipedResults,
  },
  {
    name: 'invidious.f5',
    url: (query) =>
      `https://invidious.f5.si/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    parse: parseInvidiousResults,
  },
  {
    name: 'piped.leptons',
    url: (query) =>
      `https://pipedapi.leptons.xyz/search?q=${encodeURIComponent(query)}&filter=videos`,
    parse: parsePipedResults,
  },
  {
    name: 'invidious.melmac',
    url: (query) =>
      `https://iv.melmac.space/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    parse: parseInvidiousResults,
  },
];

const cooling = new Map<string, number>();

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
  } catch {}
}

export type ClipSearchResult =
  | { status: 'found'; candidate: ClipCandidate; cached: boolean }
  | { status: 'empty' }
  | { status: 'unavailable' };

export interface ClipSearchOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;

  timeoutMs?: number;

  providerTimeoutMs?: number;

  hedgeMs?: number;

  refresh?: boolean;
  providers?: Provider[];
  store?: Storage | null;
}

async function askProviders(
  query: string,
  options: ClipSearchOptions,
  stopAt?: (batch: ClipCandidate[]) => boolean,
): Promise<
  { status: 'unavailable' } | { status: 'answered'; answered: boolean; candidates: ClipCandidate[] }
> {
  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return { status: 'unavailable' };

  if (options.refresh) cooling.clear();
  const budget = options.timeoutMs ?? CLIP_SEARCH_TIMEOUT_MS;
  const providerTimeout = options.providerTimeoutMs ?? CLIP_PROVIDER_TIMEOUT_MS;
  const hedge = options.hedgeMs ?? CLIP_SEARCH_HEDGE_MS;
  const deadline = Date.now() + budget;
  const startedAt = Date.now();
  const queue = (options.providers ?? CLIP_PROVIDERS).filter(
    (provider) => Boolean(options.providers) || !coolingDown(provider.name, startedAt),
  );

  const candidates: ClipCandidate[] = [];
  let answered = false;

  const canUseWorker =
    !options.fetcher &&
    !options.providers &&
    typeof window !== 'undefined' &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:');
  if (canUseWorker && !options.signal?.aborted) {
    const workerController = new AbortController();
    const workerTimer = setTimeout(
      () => workerController.abort(),
      Math.min(3_200, Math.max(1_000, deadline - Date.now())),
    );
    const onAbort = () => workerController.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await fetcher('/api/youtube-search', {
        method: 'POST',
        signal: workerController.signal,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ q: query, limit: 10 }),
      });
      if (response?.ok) {
        const payload = (await response.json().catch(() => null)) as {
          items?: { videoId?: string; title?: string; author?: string; duration?: number }[];
        } | null;
        if (payload && Array.isArray(payload.items) && payload.items.length > 0) {
          answered = true;
          for (const item of payload.items) {
            if (item.videoId && item.title) {
              candidates.push({
                videoId: item.videoId,
                title: item.title,
                author: item.author || 'YouTube',
                duration: typeof item.duration === 'number' ? item.duration : 0,
              });
            }
          }
          if (!stopAt || stopAt(candidates)) {
            return { status: 'answered', answered: true, candidates };
          }
        }
      }
    } catch {
    } finally {
      clearTimeout(workerTimer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }
  let cursor = 0;
  let done = false;
  let release = () => {};
  const stopped = new Promise<void>((resolve) => {
    release = resolve;
  });

  const wait = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(true), ms);
      void stopped.then(() => {
        clearTimeout(timer);
        resolve(false);
      });
    });

  const inFlight = new Set<AbortController>();

  const drained = () => {
    if (!done && inFlight.size === 0 && cursor >= queue.length) release();
  };
  const ask = async (provider: Provider) => {
    const controller = new AbortController();
    inFlight.add(controller);
    const waitMs = Math.min(providerTimeout, Math.max(1200, deadline - Date.now()));
    const timer = setTimeout(() => controller.abort(), waitMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);
    try {
      const response = await fetcher(provider.url(query), {
        signal: controller.signal,
        headers: { accept: 'application/json' },

        cache: options.refresh ? 'reload' : 'default',
      } as RequestInit);
      if (!response?.ok) throw new Error('provider refused');
      const payload: unknown = await response.json();

      answered = true;
      cooling.delete(provider.name);
      candidates.push(...provider.parse(payload));
      if (stopAt?.(candidates) && !done) {
        done = true;

        for (const active of inFlight) active.abort();
        release();
      }
    } catch {
      cooling.set(provider.name, Date.now() + PROVIDER_COOLDOWN_MS);
    } finally {
      clearTimeout(timer);
      inFlight.delete(controller);
      options.signal?.removeEventListener('abort', onAbort);

      drained();
    }
  };

  const worker = async (index: number) => {
    if (index > 0 && !(await wait(Math.min(index * hedge, Math.max(0, deadline - Date.now()))))) {
      return;
    }
    while (!done && cursor < queue.length && Date.now() < deadline) {
      await ask(queue[cursor++]);
    }
  };

  const workers = Math.max(1, Math.min(queue.length, CLIP_PROVIDERS_MAX_WORKERS));
  const running = Promise.all(Array.from({ length: workers }, (_, index) => worker(index)));

  await Promise.race([running, stopped]);
  return { status: 'answered', answered, candidates };
}

export async function findClip(
  source: {
    title: string;
    artist: string;
    duration: number;
    fileName?: string;
    rolesReviewed?: string;
  },
  options: ClipSearchOptions = {},
): Promise<ClipSearchResult> {
  source = {
    ...source,
    ...lookupMetadata(source),
  };
  const query = clipQuery(source);
  if (!query) return { status: 'empty' };
  const key = query;
  const store = options.store === undefined ? storage() : options.store;
  const cache = readCache(store);
  const cached = cache[key];
  if (!options.refresh && cached) {
    if ('miss' in cached) {
      if (Date.now() - cached.at < MISS_TTL_MS) return { status: 'empty' };
    } else {
      const candidate = {
        videoId: cached.videoId,
        title: cached.title,
        author: cached.author,
        duration: cached.duration,
      };

      if (scoreClip(candidate, source) >= 0.45) return { status: 'found', cached: true, candidate };
    }
  }

  const fetched = await askProviders(query, options, (batch) => pickClip(batch, source) !== null);
  if (fetched.status === 'unavailable') return { status: 'unavailable' };
  let best = pickClip(fetched.candidates, source);

  const worthAsking = !best && fetched.candidates.length > 0;
  if (fetched.answered && worthAsking) {
    const asked = await askProviders(videoClipQuery(source), options);
    if (asked.status === 'answered') {
      const video = pickClip(asked.candidates, source);
      if (video && isMusicVideo(video)) best = video;
    }
  }

  if (best) {
    writeCache({ ...cache, [key]: { ...best, at: Date.now() } }, store);
    return { status: 'found', candidate: best, cached: false };
  }

  if (!fetched.answered) return { status: 'unavailable' };

  writeCache({ ...cache, [key]: { at: Date.now(), miss: true } }, store);
  return { status: 'empty' };
}

export function rememberClip(
  trackId: string,
  candidate: ClipCandidate,
  songSeconds?: number,
  store: Storage | null = storage(),
): StoredClip | null {
  return storeClip(
    trackId,
    candidate.videoId,
    autoClipStart(candidate.duration, songSeconds ?? 0),
    store,
    candidate.duration,
  );
}

export async function searchClips(
  source: {
    title: string;
    artist: string;
    duration: number;
    fileName?: string;
    rolesReviewed?: string;
  },
  options: ClipSearchOptions = {},
): Promise<{ status: 'found' | 'empty' | 'unavailable'; candidates: ClipCandidate[] }> {
  source = {
    ...source,
    ...lookupMetadata(source),
  };
  const query = clipQuery(source);
  if (!query) return { status: 'empty', candidates: [] };
  const fetched = await askProviders(query, { ...options, refresh: true });
  if (fetched.status === 'unavailable') return { status: 'unavailable', candidates: [] };
  let ranked = rankClips(fetched.candidates, source, 6);

  if (!ranked.some(isMusicVideo) && (ranked.length === 0 || ranked.every(isAudioOnly))) {
    const asked = await askProviders(videoClipQuery(source), { ...options, refresh: true });
    if (asked.status === 'answered') {
      const byId = new Map(fetched.candidates.map((candidate) => [candidate.videoId, candidate]));
      for (const candidate of asked.candidates) byId.set(candidate.videoId, candidate);
      ranked = rankClips([...byId.values()], source, 6);
    }
  }
  return { status: ranked.length ? 'found' : 'empty', candidates: ranked };
}

export function chooseClip(
  trackId: string,
  candidate: ClipCandidate,
  startAt = 0,
): StoredClip | null {
  return storeClip(trackId, candidate.videoId, startAt, undefined, candidate.duration);
}
