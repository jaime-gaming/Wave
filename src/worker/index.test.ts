import { afterEach, expect, it, vi } from 'vitest';
import worker, { extractYouTubeSearchResults, publicPlaylistText } from './index';
import { parsePlaylistText } from '../domain/importFile';
const env = { ASSETS: { fetch: vi.fn(async () => new Response('asset')) } };
const request = (url: string, origin = 'https://wave.test') =>
  new Request('https://wave.test/api/import-playlist', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
afterEach(() => vi.unstubAllGlobals());
it('extracts bounded public Spotify metadata for local matching', () => {
  const html =
    '<script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({ props: { trackList: [{ title: 'Song, part 1', subtitle: 'Artist' }] } }) +
    '</script>';
  const list = parsePlaylistText(publicPlaylistText(html));
  expect(list.entries[0]).toMatchObject({ title: 'Song, part 1', artist: 'Artist' });
});
it('reads YouTube page JSON without executing scripts', () => {
  const html =
    '<script>var ytInitialData = ' +
    JSON.stringify({
      contents: [
        {
          playlistVideoRenderer: {
            title: { runs: [{ text: 'Song' }] },
            shortBylineText: { runs: [{ text: 'Artist' }] },
          },
        },
      ],
    }) +
    ';</script>';
  expect(parsePlaylistText(publicPlaylistText(html)).entries[0]).toMatchObject({
    title: 'Song',
    artist: 'Artist',
  });
});
it('rejects foreign origins and arbitrary hosts without a request', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect((await worker.fetch(request('https://127.0.0.1/private'), env)).status).toBe(400);
  expect(
    (
      await worker.fetch(
        request('https://youtube.com/playlist?list=PL123456789', 'https://evil.test'),
        env,
      )
    ).status,
  ).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it('uses a canonical HTTPS provider URL, forbids redirects and never stores metadata', async () => {
  const html =
    '<script id="__NEXT_DATA__">{"trackList":[{"title":"Song","subtitle":"Artist"}]}</script>';
  const fetch = vi.fn().mockResolvedValue(new Response(html));
  vi.stubGlobal('fetch', fetch);
  const response = await worker.fetch(
    request('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?tracking=private'),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(fetch).toHaveBeenCalledWith(
    'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M',
    expect.objectContaining({ redirect: 'error' }),
  );
});
it('keeps the application assets and unknown API routes separate', async () => {
  expect(await (await worker.fetch(new Request('https://wave.test/Remix'), env)).text()).toBe(
    'asset',
  );
  expect((await worker.fetch(new Request('https://wave.test/api/unknown'), env)).status).toBe(404);
});
it('serves CORS-free YouTube video metadata from /api/youtube-meta', async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/oembed')) {
      return new Response(
        JSON.stringify({ title: 'Daft Punk - Digital Love', author_name: 'Daft Punk - Topic' }),
        { status: 200 },
      );
    }
    return new Response(
      '<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"dQw4w9WgXcQ","title":"Daft Punk - Digital Love","author":"Daft Punk - Topic","lengthSeconds":"301"}};</script>',
      { status: 200 },
    );
  });
  vi.stubGlobal('fetch', fetch);
  const res = await worker.fetch(
    new Request('https://wave.test/api/youtube-meta?id=dQw4w9WgXcQ', {
      headers: { origin: 'https://wave.test' },
    }),
    env,
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    videoId: 'dQw4w9WgXcQ',
    title: 'Daft Punk - Digital Love',
    author: 'Daft Punk - Topic',
    duration: 301,
  });
});
it('extracts public YouTube playlist entries from /api/youtube-playlist', async () => {
  const html =
    '<script>var ytInitialData = ' +
    JSON.stringify({
      metadata: { playlistMetadataRenderer: { title: 'Late Night Synth' } },
      contents: [
        {
          playlistVideoRenderer: {
            videoId: 'dQw4w9WgXcQ',
            title: { runs: [{ text: 'M83 - Midnight City' }] },
            shortBylineText: { runs: [{ text: 'M83' }] },
            lengthSeconds: '244',
          },
        },
      ],
    }) +
    ';</script>';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status: 200 })));
  const res = await worker.fetch(
    new Request('https://wave.test/api/youtube-playlist', {
      method: 'POST',
      headers: { origin: 'https://wave.test', 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/playlist?list=PL1234567890' }),
    }),
    env,
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    playlistId: 'PL1234567890',
    title: 'Late Night Synth',
    videos: [
      expect.objectContaining({
        videoId: 'dQw4w9WgXcQ',
        title: 'M83 - Midnight City',
        duration: 244,
      }),
    ],
  });
});

it('extracts YouTube catalog search results cleanly and validates /api/youtube-search', async () => {
  const items = extractYouTubeSearchResults({
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      videoRenderer: {
                        videoId: 'dQw4w9WgXcQ',
                        title: { runs: [{ text: 'M83 - Midnight City (Official Video)' }] },
                        ownerText: { runs: [{ text: 'M83' }] },
                        lengthText: { simpleText: '4:04' },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  });
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    videoId: 'dQw4w9WgXcQ',
    title: 'M83 - Midnight City (Official Video)',
    author: 'M83',
    duration: 244,
  });

  const crossOrigin = await worker.fetch(
    new Request('https://wave.test/api/youtube-search', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'Midnight City' }),
    }),
    env,
  );
  expect(crossOrigin.status).toBe(403);
});

it('resolves only known release downloads from the official repository', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          assets: [
            {
              name: 'Wave.exe',
              browser_download_url:
                'https://evil.test/jaime-gaming/Wave/releases/download/v0.2.2/Wave.exe',
            },
            {
              name: 'Wave-Windows-x64-unsigned.zip',
              browser_download_url:
                'https://github.com/jaime-gaming/Wave/releases/download/v0.2.1/Wave-Windows-x64-unsigned.zip',
            },
          ],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const response = await worker.fetch(new Request('https://wave.test/api/download/windows'), env);
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe(
    'https://github.com/jaime-gaming/Wave/releases/download/v0.2.1/Wave-Windows-x64-unsigned.zip',
  );
  expect(
    (await worker.fetch(new Request('https://wave.test/api/download/other'), env)).status,
  ).toBe(404);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('reports unavailable downloads rather than redirecting to an untrusted file', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            assets: [{ name: 'Wave.apk', browser_download_url: 'https://example.com/Wave.apk' }],
          }),
        ),
    ),
  );
  const response = await worker.fetch(new Request('https://wave.test/api/download/android'), env);
  expect(response.status).toBe(503);
});
