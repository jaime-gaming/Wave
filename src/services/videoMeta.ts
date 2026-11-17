import { YOUTUBE_PLAYLIST_ID, YOUTUBE_VIDEO_ID, youtubeThumbnailUrl } from '../domain/youtube';
import { cleanYouTubeAuthor, splitVideoTitle } from '../domain/youtubeTrack';

export interface VideoMeta {
  title: string;
  artist: string;
  rawTitle: string;
  author: string;
  /** Seconds, or 0 when the answering provider does not report a length. */
  duration: number;
  /** Thumbnail URL when available. */
  thumbnail?: string;
}

export interface PlaylistVideoEntry {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
}

export interface YouTubePlaylistMeta {
  playlistId: string;
  title: string;
  videos: PlaylistVideoEntry[];
}

export interface VideoMetaOptions {
  signal?: AbortSignal;
  /** Milliseconds allowed per provider before trying the next one. */
  timeoutMs?: number;
  /** Total milliseconds allowed across the whole chain. */
  budgetMs?: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetcher?: typeof fetch;
  /** Override whether Wave's same-origin `/api/youtube-meta` endpoint is tried first. */
  useWorker?: boolean;
}

export const VIDEO_META_TIMEOUT_MS = 2_500;
/**
 * Ceiling on the whole fallback chain.
 *
 * Adding a song waits on this before the track appears, so a user whose network
 * blocks third-party hosts should see the song appear in under five seconds
 * rather than stare at a spinner while every fallback times out in turn.
 */
export const VIDEO_META_BUDGET_MS = 5_000;

interface Provider {
  name: string;
  url: (videoId: string) => string;
  read: (body: unknown) => { rawTitle: string; author: string; duration: number } | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const seconds = (value: unknown) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

function readOEmbed(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const rawTitle = text(record.title);
  if (!rawTitle) return null;
  return { rawTitle, author: text(record.author_name), duration: 0 };
}

function readPiped(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const rawTitle = text(record.title);
  if (!rawTitle) return null;
  return { rawTitle, author: text(record.uploader), duration: seconds(record.duration) };
}

function readInvidious(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const rawTitle = text(record.title);
  if (!rawTitle) return null;
  return { rawTitle, author: text(record.author), duration: seconds(record.lengthSeconds) };
}

/**
 * Public metadata endpoints, ordered from canonical to community mirror.
 *
 * Every URL is constructed from a validated 11-character video ID; nothing else
 * leaves the device. YouTube's oEmbed is tried first and usually replies in one
 * round trip, `noembed.com` fills in when YouTube withholds CORS headers, and
 * Piped / Invidious mirrors also report the video length.
 */
export const VIDEO_META_PROVIDERS: readonly Provider[] = [
  {
    name: 'youtube-oembed',
    url: (id) =>
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
    read: readOEmbed,
  },
  {
    name: 'noembed',
    url: (id) =>
      `https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    read: readOEmbed,
  },
  {
    name: 'piped',
    url: (id) => `https://pipedapi.kavin.rocks/streams/${id}`,
    read: readPiped,
  },
  {
    name: 'piped-syncpundit',
    url: (id) => `https://api.piped.private.coffee/streams/${id}`,
    read: readPiped,
  },
  {
    name: 'invidious',
    url: (id) => `https://inv.nadeko.net/api/v1/videos/${id}?fields=title,author,lengthSeconds`,
    read: readInvidious,
  },
  {
    name: 'invidious-yewtu',
    url: (id) => `https://yewtu.be/api/v1/videos/${id}?fields=title,author,lengthSeconds`,
    read: readInvidious,
  },
];

async function fetchJsonWithTimeout(
  fetcher: typeof fetch,
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  init?: RequestInit,
): Promise<unknown> {
  if (signal?.aborted || timeoutMs <= 0) return null;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetcher(url, { ...init, signal: controller.signal }).catch(() => null),
      timeout,
    ]);
    if (!response || !response.ok) return null;
    return await Promise.race([response.json().catch(() => null), timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function canUseWorkerEndpoint(options: VideoMetaOptions): boolean {
  if (typeof options.useWorker === 'boolean') return options.useWorker;
  // When a test injects a custom fetcher, stick strictly to VIDEO_META_PROVIDERS
  // so unit tests verify the direct provider chain deterministically.
  if (options.fetcher) return false;
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function toVideoMeta(
  rawTitle: string,
  author: string,
  duration: number,
  videoId?: string,
  includeThumbnail = false,
): VideoMeta {
  const cleanAuthor = cleanYouTubeAuthor(author);
  const split = splitVideoTitle(rawTitle, cleanAuthor);
  return {
    title: split.title,
    artist: split.artist,
    rawTitle,
    author,
    duration,
    ...(includeThumbnail && videoId ? { thumbnail: youtubeThumbnailUrl(videoId) } : {}),
  };
}

/**
 * Looks up a YouTube video's title, artist, channel and (when available) length.
 * Tries Wave's same-origin `/api/youtube-meta` Worker endpoint first in the browser
 * (zero CORS issues, official YouTube oEmbed + exact duration), then falls through
 * public metadata providers.
 *
 * Returns `null` when every provider is unreachable or blocked; callers fall back
 * gracefully rather than refusing to add the song.
 */
export async function fetchVideoMeta(
  videoId: string,
  options: VideoMetaOptions = {},
): Promise<VideoMeta | null> {
  if (!YOUTUBE_VIDEO_ID.test(videoId)) return null;
  if (options.signal?.aborted) return null;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? VIDEO_META_TIMEOUT_MS;
  const deadline = Date.now() + (options.budgetMs ?? VIDEO_META_BUDGET_MS);

  // 1. Same-origin Wave Worker endpoint (100% CORS-free, official YouTube oEmbed + watch duration)
  if (canUseWorkerEndpoint(options)) {
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      const body = await fetchJsonWithTimeout(
        fetcher,
        `/api/youtube-meta?id=${encodeURIComponent(videoId)}`,
        Math.min(timeoutMs, remaining),
        options.signal,
      );
      if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        const rawTitle = text(record.title);
        if (rawTitle) {
          return toVideoMeta(
            rawTitle,
            text(record.author),
            seconds(record.duration),
            videoId,
            true,
          );
        }
      }
    }
  }

  // 2. Direct public fallback providers
  for (const provider of VIDEO_META_PROVIDERS) {
    if (options.signal?.aborted) return null;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const body = await fetchJsonWithTimeout(
      fetcher,
      provider.url(videoId),
      Math.min(timeoutMs, remaining),
      options.signal,
    );
    const parsed = body ? provider.read(body) : null;
    if (parsed) {
      return toVideoMeta(parsed.rawTitle, parsed.author, parsed.duration);
    }
  }
  return null;
}

function normalizePlaylistEntries(raw: unknown[]): PlaylistVideoEntry[] {
  const out: PlaylistVideoEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const rawId = text(rec.videoId) || (/v=([A-Za-z0-9_-]{11})/u.exec(text(rec.url))?.[1] ?? '');
    if (!YOUTUBE_VIDEO_ID.test(rawId) || seen.has(rawId)) continue;
    const rawTitle = text(rec.title);
    if (!rawTitle) continue;
    const rawAuthor = text(rec.artist) || text(rec.author) || text(rec.uploaderName);
    const split = splitVideoTitle(rawTitle, rawAuthor);
    seen.add(rawId);
    out.push({
      videoId: rawId,
      title: split.title,
      artist: split.artist,
      duration: seconds(rec.duration ?? rec.lengthSeconds),
      thumbnail: youtubeThumbnailUrl(rawId),
    });
  }
  return out;
}

/**
 * Fetches all public videos in a YouTube playlist.
 * Uses Wave's same-origin `/api/youtube-playlist` Worker endpoint first, then falls
 * back to Piped and Invidious public playlist APIs when hosted statically.
 */
export async function fetchYouTubePlaylist(
  playlistId: string,
  options: VideoMetaOptions = {},
): Promise<YouTubePlaylistMeta | null> {
  if (!YOUTUBE_PLAYLIST_ID.test(playlistId)) return null;
  if (options.signal?.aborted) return null;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  // 1. Same-origin Wave Worker endpoint
  if (canUseWorkerEndpoint(options)) {
    const body = await fetchJsonWithTimeout(
      fetcher,
      '/api/youtube-playlist',
      timeoutMs,
      options.signal,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ list: playlistId }),
      },
    );
    if (body && typeof body === 'object') {
      const rec = body as { title?: unknown; videos?: unknown };
      if (Array.isArray(rec.videos)) {
        const videos = normalizePlaylistEntries(rec.videos);
        if (videos.length) {
          return {
            playlistId,
            title: text(rec.title) || 'YouTube playlist',
            videos,
          };
        }
      }
    }
  }

  // 2. Fallback Piped & Invidious playlist APIs
  const fallbacks: Array<{
    url: string;
    read: (body: unknown) => { title: string; items: unknown[] } | null;
  }> = [
    {
      url: `https://pipedapi.kavin.rocks/playlists/${encodeURIComponent(playlistId)}`,
      read: (b) => {
        const r = b as { name?: unknown; relatedStreams?: unknown };
        return Array.isArray(r?.relatedStreams)
          ? { title: text(r.name), items: r.relatedStreams }
          : null;
      },
    },
    {
      url: `https://api.piped.private.coffee/playlists/${encodeURIComponent(playlistId)}`,
      read: (b) => {
        const r = b as { name?: unknown; relatedStreams?: unknown };
        return Array.isArray(r?.relatedStreams)
          ? { title: text(r.name), items: r.relatedStreams }
          : null;
      },
    },
    {
      url: `https://inv.nadeko.net/api/v1/playlists/${encodeURIComponent(playlistId)}`,
      read: (b) => {
        const r = b as { title?: unknown; videos?: unknown };
        return Array.isArray(r?.videos) ? { title: text(r.title), items: r.videos } : null;
      },
    },
  ];

  for (const fallback of fallbacks) {
    if (options.signal?.aborted) return null;
    const body = await fetchJsonWithTimeout(fetcher, fallback.url, 4_000, options.signal);
    const parsed = body ? fallback.read(body) : null;
    if (parsed) {
      const videos = normalizePlaylistEntries(parsed.items);
      if (videos.length) {
        return {
          playlistId,
          title: parsed.title || 'YouTube playlist',
          videos,
        };
      }
    }
  }
  return null;
}

export interface YouTubeCatalogResult {
  videoId: string;
  title: string;
  artist: string;
  rawTitle: string;
  author: string;
  duration: number;
  thumbnail: string;
}

const CATALOG_SEARCH_CACHE = new Map<string, { at: number; items: YouTubeCatalogResult[] }>();
const CATALOG_CACHE_TTL_MS = 5 * 60_000;

function normalizeCatalogItems(rawItems: unknown[], limit: number): YouTubeCatalogResult[] {
  const seen = new Set<string>();
  const out: YouTubeCatalogResult[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const rawId =
      text(rec.videoId) ||
      text(rec.url).match(/[?&]v=([\w-]{11})/u)?.[1] ||
      text(rec.url).match(/\/watch\?v=([\w-]{11})/u)?.[1] ||
      '';
    if (!YOUTUBE_VIDEO_ID.test(rawId) || seen.has(rawId)) continue;
    const rawTitle = text(rec.title);
    if (!rawTitle) continue;
    const author = cleanYouTubeAuthor(
      text(rec.author) || text(rec.uploaderName) || text(rec.uploader),
    );
    const split = splitVideoTitle(rawTitle, author);
    const duration = seconds(rec.duration ?? rec.lengthSeconds);
    seen.add(rawId);
    out.push({
      videoId: rawId,
      title: split.title || rawTitle,
      artist: split.artist || author || 'YouTube',
      rawTitle,
      author,
      duration,
      thumbnail: youtubeThumbnailUrl(rawId),
    });
    if (out.length >= limit) break;
  }
  return out;
}

const FAST_SEARCH_MIRRORS: ReadonlyArray<{
  url: (q: string) => string;
  extract: (body: unknown) => unknown[];
}> = [
  {
    url: (q) => `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(q)}&filter=music_songs`,
    extract: (b) =>
      Array.isArray((b as { items?: unknown[] })?.items) ? (b as { items: unknown[] }).items : [],
  },
  {
    url: (q) => `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
    extract: (b) => (Array.isArray(b) ? b : []),
  },
  {
    url: (q) => `https://api.piped.private.coffee/search?q=${encodeURIComponent(q)}&filter=videos`,
    extract: (b) =>
      Array.isArray((b as { items?: unknown[] })?.items) ? (b as { items: unknown[] }).items : [],
  },
  {
    url: (q) => `https://yewtu.be/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
    extract: (b) => (Array.isArray(b) ? b : []),
  },
  {
    url: (q) => `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
    extract: (b) => (Array.isArray(b) ? b : []),
  },
];

/**
 * Fast YouTube catalogue search for the unified Add Music input.
 * Uses an in-memory session cache, tries Wave's `/api/youtube-search` endpoint
 * first, and falls back to racing public search mirrors in parallel so results
 * arrive rapidly from any environment.
 */
export async function searchYouTubeCatalog(
  rawQuery: string,
  options: VideoMetaOptions & { limit?: number } = {},
): Promise<YouTubeCatalogResult[]> {
  const query = rawQuery.trim();
  const limit = Math.max(1, Math.min(12, options.limit ?? 8));
  if (query.length < 2 || options.signal?.aborted) return [];

  const cacheKey = `${query.toLowerCase()}:${limit}`;
  const cached = CATALOG_SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < CATALOG_CACHE_TTL_MS) {
    return cached.items;
  }

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 2_800;

  if (canUseWorkerEndpoint(options)) {
    const body = await fetchJsonWithTimeout(
      fetcher,
      '/api/youtube-search',
      timeoutMs,
      options.signal,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: query, limit }),
      },
    );
    if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown[] }).items)) {
      const items = normalizeCatalogItems((body as { items: unknown[] }).items, limit);
      if (items.length) {
        CATALOG_SEARCH_CACHE.set(cacheKey, { at: Date.now(), items });
        return items;
      }
    }
  }

  if (options.signal?.aborted) return [];

  const raceController = new AbortController();
  const forwardAbort = () => raceController.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    const attempts = FAST_SEARCH_MIRRORS.map(async (mirror) => {
      const body = await fetchJsonWithTimeout(
        fetcher,
        mirror.url(query),
        timeoutMs,
        raceController.signal,
      );
      if (!body) throw new Error('empty');
      const items = normalizeCatalogItems(mirror.extract(body), limit);
      if (!items.length) throw new Error('no-items');
      return items;
    });
    const winner = await Promise.any(attempts);
    raceController.abort();
    CATALOG_SEARCH_CACHE.set(cacheKey, { at: Date.now(), items: winner });
    return winner;
  } catch {
    return [];
  } finally {
    raceController.abort();
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}
