import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchVideoMeta,
  VIDEO_META_BUDGET_MS,
  VIDEO_META_PROVIDERS,
  VIDEO_META_TIMEOUT_MS,
} from './videoMeta';

const ID = 'dQw4w9WgXcQ';

/** Replies per host, then fails the way a CORS-blocked browser fetch does. */
function fetcherReplies(replies: Record<string, () => Promise<unknown> | unknown>) {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const host = new URL(url).host;
    const reply = replies[host];
    if (!reply) throw new TypeError('Failed to fetch');
    const body = await reply();
    if (body instanceof Error) throw body;
    return {
      ok: true,
      json: async () => body,
    } as Response;
  });
}

const asks = (fetcher: ReturnType<typeof fetcherReplies>) =>
  fetcher.mock.calls.map(([url]) => new URL(String(url)).host);

afterEach(() => {
  vi.useRealTimers();
});

describe('video metadata', () => {
  it('reads a title, artist and channel from YouTube oEmbed', async () => {
    const fetcher = fetcherReplies({
      'www.youtube.com': () => ({
        title: 'M83 - Midnight City (Official Video)',
        author_name: 'M83',
      }),
    });
    const meta = await fetchVideoMeta(ID, { fetcher });
    expect(meta).toEqual({
      title: 'Midnight City',
      artist: 'M83',
      rawTitle: 'M83 - Midnight City (Official Video)',
      author: 'M83',
      duration: 0,
    });
    expect(asks(fetcher)[0]).toBe('www.youtube.com');
  });

  it('moves to the next provider when a fetch is blocked', async () => {
    const fetcher = fetcherReplies({
      'noembed.com': () => ({ title: 'Burial - Archangel', author_name: 'Burial' }),
    });
    const meta = await fetchVideoMeta(ID, { fetcher });
    expect(meta?.title).toBe('Archangel');
    expect(asks(fetcher)).toEqual(['www.youtube.com', 'noembed.com']);
  });

  it('takes the length when the provider publishes one', async () => {
    const fetcher = fetcherReplies({
      'pipedapi.kavin.rocks': () => ({
        title: 'Aphex Twin - Xtal',
        uploader: 'Aphex Twin',
        duration: 293,
      }),
    });
    const meta = await fetchVideoMeta(ID, { fetcher });
    expect(meta).toMatchObject({ title: 'Xtal', artist: 'Aphex Twin', duration: 293 });

    const invidious = fetcherReplies({
      'inv.nadeko.net': () => ({
        title: 'Aphex Twin - Xtal',
        author: 'Aphex Twin',
        lengthSeconds: '293',
      }),
    });
    expect((await fetchVideoMeta(ID, { fetcher: invidious }))?.duration).toBe(293);
  });

  it('answers null when every provider fails', async () => {
    const fetcher = fetcherReplies({});
    await expect(fetchVideoMeta(ID, { fetcher })).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(VIDEO_META_PROVIDERS.length);
  });

  it('gives up on a provider that never answers', async () => {
    const hanging = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const started = Date.now();
    await expect(fetchVideoMeta(ID, { fetcher: hanging, timeoutMs: 20 })).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(VIDEO_META_TIMEOUT_MS);
  });

  it('stops asking once the whole chain has used its budget', async () => {
    const hanging = vi.fn(() => new Promise<Response>(() => {}));
    await expect(
      fetchVideoMeta(ID, {
        fetcher: hanging as unknown as typeof fetch,
        timeoutMs: VIDEO_META_BUDGET_MS * 4,
        budgetMs: 30,
      }),
    ).resolves.toBeNull();
    // One hanging provider uses the whole budget; the rest are never tried.
    expect(hanging).toHaveBeenCalledTimes(1);
  });

  it('rejects anything that is not a video id', async () => {
    const fetcher = fetcherReplies({});
    await expect(fetchVideoMeta('https://youtu.be/short', { fetcher })).resolves.toBeNull();
    await expect(fetchVideoMeta('../../etc/passwd', { fetcher })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stops when the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = fetcherReplies({
      'www.youtube.com': () => ({ title: 'A - B' }),
    });
    await expect(fetchVideoMeta(ID, { fetcher, signal: controller.signal })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ignores a provider that answers with a body it cannot use', async () => {
    const fetcher = fetcherReplies({
      'www.youtube.com': () => ({ title: '   ' }),
      'noembed.com': () => ({ error: 'not found' }),
      'pipedapi.kavin.rocks': () => ({ title: 'Sault - Wildfires' }),
    });
    const meta = await fetchVideoMeta(ID, { fetcher });
    expect(meta?.title).toBe('Wildfires');
    expect(meta?.artist).toBe('Sault');
  });
});
