/**
 * Reads a YouTube video's title, channel and length.
 *
 * Four sources, tried in order, because no single one works everywhere: YouTube's
 * own oEmbed endpoint does not send CORS headers for browser requests, public
 * front-ends do, and a blocked request must not leave the song half-created.
 * Only the video id is sent.
 */
import { splitVideoTitle } from '../domain/youtubeTrack';

export const VIDEO_META_TIMEOUT_MS = 5_000;
/** Whole chain budget, so adding a song never waits on every provider in turn. */
export const VIDEO_META_BUDGET_MS = 9_000;

export interface VideoMeta {
  title: string;
  artist: string;
  /** Title exactly as the provider reports it. */
  rawTitle: string;
  author: string;
  /** Length in seconds when the provider reports one, else 0. */
  duration: number;
}

type Provider = {
  name: string;
  url: (videoId: string) => string;
  parse: (payload: unknown) => VideoMeta | null;
};

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : '');
const seconds = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

const fromOEmbed = (payload: unknown): VideoMeta | null => {
  const body = payload as { title?: unknown; author_name?: unknown };
  const title = text(body?.title);
  if (!title) return null;
  return {
    ...splitVideoTitle(title),
    rawTitle: title,
    author: text(body?.author_name),
    duration: 0,
  };
};

/** Piped `/streams/<id>`: the closest thing to a public JSON description. */
const fromPiped = (payload: unknown): VideoMeta | null => {
  const body = payload as { title?: unknown; uploader?: unknown; duration?: unknown };
  const title = text(body?.title);
  if (!title) return null;
  return {
    ...splitVideoTitle(title),
    rawTitle: title,
    author: text(body?.uploader),
    duration: seconds(body?.duration),
  };
};

/** Invidious `/api/v1/videos/<id>`. */
const fromInvidious = (payload: unknown): VideoMeta | null => {
  const body = payload as {
    title?: unknown;
    author?: unknown;
    lengthSeconds?: unknown;
    videoThumbnails?: unknown;
  };
  const title = text(body?.title);
  if (!title) return null;
  return {
    ...splitVideoTitle(title),
    rawTitle: title,
    author: text(body?.author),
    duration: seconds(Number(body?.lengthSeconds)),
  };
};

export const VIDEO_META_PROVIDERS: Provider[] = [
  {
    name: 'youtube',
    url: (id) =>
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${id}`,
      )}&format=json`,
    parse: fromOEmbed,
  },
  {
    name: 'noembed',
    url: (id) =>
      `https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    parse: fromOEmbed,
  },
  {
    name: 'piped',
    url: (id) => `https://pipedapi.kavin.rocks/streams/${id}`,
    parse: fromPiped,
  },
  {
    name: 'invidious',
    url: (id) => `https://inv.nadeko.net/api/v1/videos/${id}`,
    parse: fromInvidious,
  },
];

async function ask(
  provider: Provider,
  videoId: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<{ meta: VideoMeta | null; expired: boolean }> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  // A timeout that does not depend on the fetch implementation honouring abort.
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve(null);
    }, timeoutMs);
  });
  try {
    const request = fetcher(provider.url(videoId), {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    }).then(async (response) => (response.ok ? provider.parse(await response.json()) : null));
    return { meta: await Promise.race([request.catch(() => null), deadline]), expired };
  } catch {
    return { meta: null, expired };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** First provider that answers with a usable title. */
export async function fetchVideoMeta(
  videoId: string,
  options: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    budgetMs?: number;
    providers?: Provider[];
  } = {},
): Promise<VideoMeta | null> {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId)) return null;
  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return null;
  const timeoutMs = options.timeoutMs ?? VIDEO_META_TIMEOUT_MS;
  const giveUpAt = Date.now() + (options.budgetMs ?? VIDEO_META_BUDGET_MS);
  for (const provider of options.providers ?? VIDEO_META_PROVIDERS) {
    if (options.signal?.aborted) return null;
    const left = giveUpAt - Date.now();
    if (left <= 0) return null;
    const waited = Math.min(timeoutMs, left);
    const { meta, expired } = await ask(provider, videoId, fetcher, options.signal, waited);
    if (meta) return meta;
    // A provider that used up the budget ends the chain. Asking the clock again
    // here was a race: a timer may fire a millisecond early, so the remaining
    // budget read as positive and one more provider was tried, which is exactly
    // what the budget exists to prevent.
    if (expired && waited < timeoutMs) return null;
  }
  return null;
}
