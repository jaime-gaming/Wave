import { afterEach, expect, it, vi } from 'vitest';
import worker, { publicPlaylistText } from './index';
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
