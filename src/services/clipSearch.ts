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
/** Whole search budget: a song either finds a clip quickly or says so. */
export const CLIP_SEARCH_TIMEOUT_MS = 9_000;
/** How long one host is allowed to answer before the next one is asked. */
export const CLIP_PROVIDER_TIMEOUT_MS = 4_000;
/** How long a host gets on its own before the next one is asked as well. */
export const CLIP_SEARCH_HEDGE_MS = 1_200;
/** How many hosts can be in flight at once. */
export const CLIP_PROVIDERS_MAX_WORKERS = 4;
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
  /** How long a single host may take before the next one is asked as well. */
  hedgeMs?: number;
  /** Skip the local cache; used by the manual retry button. */
  refresh?: boolean;
  providers?: Provider[];
  store?: Storage | null;
}

/**
 * Asks the hosts and returns everything they offered.
 *
 * Discovery needs one answer; the song's options need a shortlist. Both start
 * here so a retry, a cooldown and a timeout behave the same way in both places.
 *
 * The hosts are interchangeable and their health changes by the hour, so they
 * are asked one after another with a hedge: when a host has not answered within
 * `hedgeMs` the next one is asked as well, and the first convincing answer ends
 * the search. Asking strictly in order meant a single dead instance could spend
 * the whole budget and the clip search reported "unreachable" while healthy
 * hosts sat untried at the back of the list.
 */
async function askProviders(
  query: string,
  options: ClipSearchOptions,
  stopAt?: (batch: ClipCandidate[]) => boolean,
): Promise<
  { status: 'unavailable' } | { status: 'answered'; answered: boolean; candidates: ClipCandidate[] }
> {
  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return { status: 'unavailable' };
  // An explicit retry means the user asked again: give every host another chance.
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
  let cursor = 0;
  let done = false;
  let release = () => {};
  const stopped = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Resolves true when the wait ran out, false when someone else found the answer.
  const wait = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(true), ms);
      void stopped.then(() => {
        clearTimeout(timer);
        resolve(false);
      });
    });

  const inFlight = new Set<AbortController>();
  /** Ends the search once every host has answered or given up. */
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
        // The front-ends cache their own answers; a retry should not be served
        // the same stale list.
        cache: options.refresh ? 'reload' : 'default',
      } as RequestInit);
      if (!response?.ok) throw new Error('provider refused');
      const payload: unknown = await response.json();
      // It answered with JSON: the host is alive even if nothing matches.
      answered = true;
      cooling.delete(provider.name);
      candidates.push(...provider.parse(payload));
      if (stopAt?.(candidates) && !done) {
        done = true;
        // The answer is in: nothing else that is still in flight is needed.
        for (const active of inFlight) active.abort();
        release();
      }
    } catch {
      // Dead, blocked, rate limited or not JSON at all: skip this host for a
      // while and let the others carry the search.
      cooling.set(provider.name, Date.now() + PROVIDER_COOLDOWN_MS);
    } finally {
      clearTimeout(timer);
      inFlight.delete(controller);
      options.signal?.removeEventListener('abort', onAbort);
      // Without this the search would still wait for the workers that were
      // scheduled to hedge later, which is pure latency when the queue is done.
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
  // Whichever comes first: every host tried, or one good answer.
  await Promise.race([running, stopped]);
  return { status: 'answered', answered, candidates };
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
      const candidate = {
        videoId: cached.videoId,
        title: cached.title,
        author: cached.author,
        duration: cached.duration,
      };
      // The rules get stricter, and a song keeps yesterday's answer forever.
      // A remembered clip that no longer passes them — a lyric video saved
      // before those stopped counting as clips — is searched again instead of
      // being played because it happens to be in the cache.
      if (scoreClip(candidate, source) >= 0.45) return { status: 'found', cached: true, candidate };
    }
  }

  const fetched = await askProviders(query, options, (batch) => pickClip(batch, source) !== null);
  if (fetched.status === 'unavailable') return { status: 'unavailable' };
  let best = pickClip(fetched.candidates, source);

  // A song is not a clip. When the plain search only came back with audio
  // uploads — a lyric video, a still sleeve — one more request asks for the
  // video by name before settling for the still one. It is only spent when the
  // answer really is a song, or when nothing matched but the front-end did
  // return results: a neutral title from the artist's own channel is not a
  // reason to double the search.
  const worthAsking = best ? isAudioOnly(best) : fetched.candidates.length > 0;
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

  // A dead host is not an answer about the song: say the search failed instead
  // of telling the listener no clip exists.
  if (!fetched.answered) return { status: 'unavailable' };
  // A real answer with no convincing match is remembered for a day, so Wave does
  // not ask on every visit but a later search can still find a new upload.
  writeCache({ ...cache, [key]: { at: Date.now(), miss: true } }, store);
  return { status: 'empty' };
}

/** Saves a discovered clip so the backdrop opens straight into the video. */
export function rememberClip(
  trackId: string,
  candidate: ClipCandidate,
  songSeconds?: number,
  store: Storage | null = storage(),
): StoredClip | null {
  // The clip is placed where the music is, not where the video begins: an upload
  // with a ten-second title card would otherwise stay ten seconds behind the song
  // for its whole length. `autoClipStart` is a bounded guess, and the editor can
  // correct it.
  return storeClip(
    trackId,
    candidate.videoId,
    autoClipStart(candidate.duration, songSeconds ?? 0),
    store,
    candidate.duration,
  );
}

/**
 * The shortlist for a song: what discovery would pick, plus the runners-up.
 *
 * Used by the song's own options, where choosing a different clip is a normal
 * thing to want — the automatic match is a guess, and a guess you cannot correct
 * is worse than no guess at all. Nothing is stored until a candidate is chosen.
 */
export async function searchClips(
  source: { title: string; artist: string; duration: number },
  options: ClipSearchOptions = {},
): Promise<{ status: 'found' | 'empty' | 'unavailable'; candidates: ClipCandidate[] }> {
  const query = clipQuery(source);
  if (!query) return { status: 'empty', candidates: [] };
  const fetched = await askProviders(query, { ...options, refresh: true });
  if (fetched.status === 'unavailable') return { status: 'unavailable', candidates: [] };
  let ranked = rankClips(fetched.candidates, source, 6);
  // The same rule as discovery: a list of songs with no video in it is worth one
  // more request, and the videos it finds go to the top of the shortlist.
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

/** Replaces the clip for a song with a chosen candidate, keeping it local. */
export function chooseClip(
  trackId: string,
  candidate: ClipCandidate,
  startAt = 0,
): StoredClip | null {
  return storeClip(trackId, candidate.videoId, startAt, undefined, candidate.duration);
}
