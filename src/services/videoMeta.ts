/**
 * Reads a YouTube video's title so the user does not have to type it.
 *
 * Uses YouTube's public oEmbed endpoint, which is designed for exactly this: it
 * returns the title and channel of a public video, needs no key and no account.
 * Only the video id is sent. Failure is expected (private, removed or offline) and
 * handled by leaving the fields for the user to fill in.
 */
import { splitVideoTitle } from '../domain/youtubeTrack';

export const OEMBED_TIMEOUT_MS = 5_000;

export interface VideoMeta {
  title: string;
  artist: string;
  /** Title exactly as YouTube reports it, kept for the editor. */
  rawTitle: string;
  author: string;
}

export async function fetchVideoMeta(
  videoId: string,
  options: { fetcher?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<VideoMeta | null> {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId)) return null;
  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? OEMBED_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') return null;
    const { title, author_name: author } = payload as { title?: unknown; author_name?: unknown };
    if (typeof title !== 'string' || !title.trim()) return null;
    const split = splitVideoTitle(title);
    return {
      ...split,
      rawTitle: title,
      author: typeof author === 'string' ? author : '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
