import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIP_CACHE_KEY, findClip, rememberClip, resetProviderHealth } from './clipSearch';
import { CLIP_STORAGE_KEY, loadClips } from '../domain/videoClips';

const song = { title: 'Midnight City', artist: 'M83', duration: 244 };
const piped = (items: unknown[]) => ({
  ok: true,
  json: async () => ({ items }),
});
const goodItem = {
  url: '/watch?v=dX3k_QDnzHE',
  title: 'M83 - Midnight City (Official Video)',
  uploaderName: 'M83',
  duration: 244,
};

beforeEach(() => {
  localStorage.clear();
  resetProviderHealth();
});

describe('automatic clip search', () => {
  it('returns the best match from the first provider and caches it', async () => {
    const fetcher = vi.fn().mockResolvedValue(piped([goodItem]));
    const result = await findClip(song, { fetcher });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.candidate.videoId).toBe('dX3k_QDnzHE');
    expect(result.cached).toBe(false);
    expect(fetcher.mock.calls[0][0]).toContain('m83%20midnight%20city');

    // Second call is answered from the cache: no extra request leaves the device.
    const again = await findClip(song, { fetcher });
    expect(again.status).toBe('found');
    if (again.status === 'found') expect(again.cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next provider when the first fails', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            type: 'video',
            videoId: 'dX3k_QDnzHE',
            title: 'M83 - Midnight City',
            author: 'M83',
            lengthSeconds: 244,
          },
        ],
      });
    const result = await findClip(song, { fetcher });
    expect(result.status).toBe('found');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('asks a second host when the first one is slow, and takes the first good answer', async () => {
    // The first host never answers. Before the hedge, one dead instance could
    // spend the whole budget and the search said "unreachable" with the rest of
    // the list still untried.
    const fetcher = vi.fn().mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes('pipedapi.kavin.rocks')) return new Promise(() => {});
      if (target.includes('inv.nadeko.net')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              type: 'video',
              videoId: 'dX3k_QDnzHE',
              title: 'M83 - Midnight City (Official Video)',
              author: 'M83',
              lengthSeconds: 244,
            },
          ],
        });
      }
      return Promise.resolve(piped([]));
    });
    const result = await findClip(song, { fetcher, hedgeMs: 10, providerTimeoutMs: 5_000 });
    expect(result.status).toBe('found');
    // Two hosts were asked; the healthy one answered and the search stopped there.
    expect(fetcher.mock.calls.slice(0, 2).map((call) => String(call[0]))).toEqual([
      expect.stringContaining('pipedapi.kavin.rocks'),
      expect.stringContaining('inv.nadeko.net'),
    ]);
  });

  it('places the clip where the music is, not where the upload begins', () => {
    // 24 s of intro on the upload: start the clip inside it, bounded and rounded.
    expect(
      rememberClip(
        'track-1',
        { videoId: 'dX3k_QDnzHE', title: '', author: '', duration: 270 },
        240,
      ),
    ).toMatchObject({ startAt: 18 });
    // A clip about as long as the song starts at the beginning.
    expect(
      rememberClip(
        'track-2',
        { videoId: 'dX3k_QDnzHE', title: '', author: '', duration: 245 },
        244,
      ),
    ).toMatchObject({ startAt: 0 });
  });

  it('does not replay a remembered clip that the current rules reject', async () => {
    // Saved before lyric videos stopped counting as clips. The cache is a
    // shortcut, not a verdict: it is re-checked against today's rules.
    const stored = {
      videoId: 'eeeeeeeeeee',
      title: 'M83 - Midnight City (Lyric Video)',
      author: 'M83',
      duration: 244,
      at: 1,
    };
    localStorage.setItem(CLIP_CACHE_KEY, JSON.stringify({ 'm83 midnight city': stored }));
    const fetcher = vi.fn().mockResolvedValue(piped([goodItem]));
    const result = await findClip(song, { fetcher });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.candidate.title).toContain('Official Video');
    expect(result.cached).toBe(false);
    expect(fetcher).toHaveBeenCalled();
  });

  it('never settles for the only lyric video the hosts returned', async () => {
    const lyric = {
      ...goodItem,
      url: '/watch?v=eeeeeeeeeee',
      title: 'M83 - Midnight City (Lyrics)',
    };
    const fetcher = vi.fn().mockResolvedValue(piped([lyric]));
    expect(await findClip(song, { fetcher })).toEqual({ status: 'empty' });
  });

  it('reports unavailable when nothing answers, without throwing', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('blocked'));
    expect(await findClip(song, { fetcher })).toEqual({ status: 'unavailable' });
  });

  it('remembers an empty answer so it is not asked again and remembers the clip', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(piped([{ url: '/watch?v=aaaaaaaaaaa', title: 'Other', duration: 100 }]));
    expect(await findClip(song, { fetcher })).toEqual({ status: 'empty' });
    expect(localStorage.getItem(CLIP_CACHE_KEY)).toContain('miss');

    expect(
      rememberClip('track-1', {
        videoId: 'dX3k_QDnzHE',
        title: 'Midnight City',
        author: 'M83',
        duration: 244,
      }),
    ).toMatchObject({ videoId: 'dX3k_QDnzHE' });
    expect(loadClips()['track-1'].videoId).toBe('dX3k_QDnzHE');
    expect(localStorage.getItem(CLIP_STORAGE_KEY)).toContain('track-1');
    // A malformed video id can never be saved.
    expect(rememberClip('track-2', { videoId: 'nope', title: '', author: '', duration: 0 })).toBe(
      null,
    );
  });

  it('asks another host when one fails, and skips the dead one next time', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValue(piped([goodItem]));
    const first = await findClip(song, { fetcher });
    expect(first.status).toBe('found');
    expect(fetcher.mock.calls[0][0]).toContain('pipedapi.kavin.rocks');
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);

    localStorage.clear();
    fetcher.mockClear();
    await findClip({ ...song, title: 'Outro' }, { fetcher });
    // The host that failed is not asked again immediately.
    expect(fetcher.mock.calls[0][0]).not.toContain('pipedapi.kavin.rocks');
  });

  it('stops at the search budget instead of hanging on dead hosts', async () => {
    // A host that never answers; a real fetch rejects when its signal aborts.
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const result = await findClip(song, { fetcher, timeoutMs: 600, providerTimeoutMs: 150 });
    expect(result).toEqual({ status: 'unavailable' });
  });
});
