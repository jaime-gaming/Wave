import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIP_CACHE_KEY, findClip, rememberClip } from './clipSearch';
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
});
