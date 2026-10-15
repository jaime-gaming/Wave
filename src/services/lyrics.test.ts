import { afterEach, expect, it, vi } from 'vitest';
import { lookupLyrics } from './lyrics';
import { makeTrack } from '../test/fixtures';
const record = {
  id: 42,
  trackName: 'Signal',
  artistName: 'Wave Tests',
  duration: 90,
  instrumental: false,
  syncedLyrics: '[00:00.00]First line\n[00:04.00]Second line',
  plainLyrics: 'First line\nSecond line',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function response(value: unknown = record, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
it('gets verified synchronized lyrics with metadata only and no credentials', async () => {
  const fetcher = vi.fn().mockResolvedValue(response());
  vi.stubGlobal('fetch', fetcher);
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(result.lyrics).toMatchObject({
    source: 'lrclib',
    providerId: 42,
    lines: [
      { time: 0, text: 'First line' },
      { time: 4, text: 'Second line' },
    ],
  });
  const [url, options] = fetcher.mock.calls[0];
  const query = new URL(url).searchParams;
  expect(query.get('track_name')).toBe('Signal');
  expect(query.get('artist_name')).toBe('Wave Tests');
  expect(query.get('duration')).toBe('90');
  expect(options).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
  expect(options.body).toBeUndefined();
});
it('retries a missing album match once without album', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({}, 404))
    .mockResolvedValueOnce(response());
  vi.stubGlobal('fetch', fetcher);
  expect((await lookupLyrics(makeTrack(), new AbortController().signal)).lookup.status).toBe(
    'found',
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.has('album_name')).toBe(false);
});
it.each([{ trackName: 'Other title' }, { artistName: 'Someone else' }, { duration: 100 }])(
  'rejects a wrong recording %j',
  async (change) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(response({ ...record, ...change }))),
    );
    expect((await lookupLyrics(makeTrack(), new AbortController().signal)).lookup.status).toBe(
      'not-found',
    );
  },
);
it('keeps plain lyrics explicitly unsynchronized', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...record, syncedLyrics: null })));
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(result.lyrics?.lines.every((line) => line.time === undefined)).toBe(true);
});
it('distinguishes instrumental, unavailable and provider errors', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ...record, instrumental: true }))
    .mockResolvedValueOnce(response({}, 404))
    .mockResolvedValueOnce(response({}, 404))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({}, 429));
  vi.stubGlobal('fetch', fetcher);
  for (const status of ['instrumental', 'not-found', 'error'])
    expect((await lookupLyrics(makeTrack(), new AbortController().signal)).lookup.status).toBe(
      status,
    );
});
it('bounds actual response size even without content-length', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(600_001))));
  expect((await lookupLyrics(makeTrack(), new AbortController().signal)).lookup.status).toBe(
    'error',
  );
});
it('times out without treating a network failure as missing lyrics', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
  );
  const pending = lookupLyrics(makeTrack(), new AbortController().signal);
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await pending).lookup.status).toBe('error');
});
it('rejects user cancellation so no cancelled result can be saved', async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
  );
  const pending = lookupLyrics(makeTrack(), controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
it('uses identified structured search after exact misses and ranks verified candidates', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({}, 404))
    .mockResolvedValueOnce(response({}, 404))
    .mockResolvedValueOnce(response([{ ...record, artistName: 'Wrong' }, record]));
  vi.stubGlobal('fetch', fetcher);
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(new URL(fetcher.mock.calls[2][0]).pathname).toBe('/api/search');
  expect(fetcher.mock.calls[0][1].headers['Lrclib-Client']).toContain('Wave/');
});
it('honors Retry-After even when an edge error response is not JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('Rate limited', { status: 429, headers: { 'Retry-After': '120' } }),
      ),
  );
  const now = Date.now();
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('error');
  expect(result.lookup.retryAt).toBeGreaterThanOrEqual(now + 120000);
});
it('uses inferred clean metadata on the first request, not the untagged filename title', async () => {
  const fetcher = vi.fn().mockResolvedValue(response());
  vi.stubGlobal('fetch', fetcher);
  const track = makeTrack({
    artist: 'Unknown artist',
    title: 'Wave Tests - Signal',
    fileName: 'Wave Tests - Signal.wav',
  });
  expect((await lookupLyrics(track, new AbortController().signal)).lookup.status).toBe('found');
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('track_name')).toBe('Signal');
});
it('downgrades impossible timing to plain text instead of synchronizing beyond the audio', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        response({ ...record, syncedLyrics: '[00:00]First\n[04:00]Beyond this recording' }),
      ),
  );
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(result.lyrics?.lines.every((line) => line.time === undefined)).toBe(true);
});
it('falls back to safe plain lyrics when synchronized text is malformed', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        response({ ...record, syncedLyrics: '[offset:999999]\n[00:00.00]Invalid' }),
      ),
  );
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(result.lyrics?.lines.every((l) => l.time === undefined)).toBe(true);
  expect(result.lyrics?.lines[0].text).toBe('First line');
});
it('continues past a malformed exact result to another verified recording', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        ...record,
        syncedLyrics: '[offset:999999]\n[00:00.00]Invalid',
        plainLyrics: null,
      }),
    )
    .mockResolvedValueOnce(response(record));
  vi.stubGlobal('fetch', fetcher);
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(result.lyrics?.lines[1].time).toBe(4);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('searches directly for unknown duration and only keeps untimed text', async () => {
  const fetcher = vi.fn().mockResolvedValue(response([record]));
  vi.stubGlobal('fetch', fetcher);
  const result = await lookupLyrics(makeTrack({ duration: 0 }), new AbortController().signal);
  expect(String(fetcher.mock.calls[0][0])).toContain('/search?');
  expect(result.lookup.status).toBe('found');
  expect(result.lyrics?.lines.every((l) => l.time === undefined)).toBe(true);
});
it('continues to structured search when exact lookup rejects the query shape', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({}, 400))
    .mockResolvedValueOnce(response({}, 422))
    .mockResolvedValueOnce(response([record]));
  vi.stubGlobal('fetch', fetcher);
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it.each([null, 'not-a-date'])(
  'uses a finite minimum cooldown for missing or inaccessible Retry-After: %s',
  async (value) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (value) headers['Retry-After'] = value;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers })));
    const start = Date.now(),
      result = await lookupLyrics(makeTrack(), new AbortController().signal);
    expect(result.lookup.status).toBe('error');
    expect(Number.isFinite(result.lookup.retryAt)).toBe(true);
    expect(result.lookup.retryAt).toBeGreaterThanOrEqual(start + 60_000);
  },
);

it('retries a browser network/preflight failure with a safelisted GET to the same provider', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(response());
  vi.stubGlobal('fetch', fetcher);
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][0]).toBe(fetcher.mock.calls[1][0]);
  expect(fetcher.mock.calls[0][1].headers).toHaveProperty('Lrclib-Client');
  expect(fetcher.mock.calls[1][1].headers).toEqual({ Accept: 'application/json' });
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
});
it('recognizes provider-normalized apostrophes and official music video decorations', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        response({ ...record, trackName: 'Dont Stop', artistName: 'Guns N Roses' }),
      ),
  );
  const result = await lookupLyrics(
    makeTrack({ title: "Don't Stop (Official Music Video)", artist: 'Guns N’ Roses' }),
    new AbortController().signal,
  );
  expect(result.lookup.status).toBe('found');
  expect(result.lyrics?.lines[1].time).toBe(4);
});
it('searches past a conflicting exact album and prefers a verified album/reissue', async () => {
  const conflict = { ...record, albumName: 'A compilation', id: 12 };
  const verified = { ...record, albumName: 'First light (Deluxe Edition)', id: 77 };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(conflict))
    .mockResolvedValueOnce(response(conflict))
    .mockResolvedValueOnce(response([conflict, verified]));
  vi.stubGlobal('fetch', fetcher);
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lyrics?.providerId).toBe(77);
  expect(result.lyrics?.lines[0].time).toBe(0);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('only retains untimed text when all otherwise verified results conflict on album', async () => {
  const conflict = { ...record, albumName: 'A compilation' };
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(response(url.includes('/search?') ? [conflict] : conflict)),
      ),
  );
  const result = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(result.lookup.status).toBe('found');
  expect(result.lyrics?.lines[0].time).toBeUndefined();
});
it('cancels an advertised oversized response before reading its body', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({ cancel });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-length': '900000' } })),
  );
  expect((await lookupLyrics(makeTrack(), new AbortController().signal)).lookup.status).toBe(
    'error',
  );
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('persists provider cooldown across manual callers without sending another request', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response('Busy', { status: 503, headers: { 'Retry-After': '60' } }));
  vi.stubGlobal('fetch', fetcher);
  const first = await lookupLyrics(makeTrack(), new AbortController().signal);
  expect(first.lookup.retryAt).toBeGreaterThan(Date.now());
  const second = await lookupLyrics(
    makeTrack({ id: 'other', title: 'Other' }),
    new AbortController().signal,
  );
  expect(second.lookup.retryAt).toBe(first.lookup.retryAt);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
