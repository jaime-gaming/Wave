import { afterEach, expect, it, vi } from 'vitest';
import { parseMusicBrainz, searchMusicBrainz } from './musicBrainz';
afterEach(() => vi.unstubAllGlobals());
it('reads recordings and credits without inventing covers or durations', () => {
  expect(
    parseMusicBrainz({
      recordings: [
        {
          title: 'Says',
          length: 214500,
          'artist-credit': [{ name: 'Nils Frahm' }],
          releases: [{ title: 'Spaces', date: '2013-11-08' }],
        },
        { title: 'Missing artist' },
      ],
    }),
  ).toEqual([
    {
      title: 'Says',
      artist: 'Nils Frahm',
      album: 'Spaces',
      year: 2013,
      duration: 215,
      provider: 'MusicBrainz',
    },
  ]);
  expect(parseMusicBrainz(null)).toEqual([]);
});
it('sends just the requested search terms and tolerates errors', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, text: async () => JSON.stringify({ recordings: [] }) });
  vi.stubGlobal('fetch', fetcher);
  await expect(searchMusicBrainz('Nils Frahm Says')).resolves.toEqual([]);
  expect(String(fetcher.mock.calls[0][0])).toContain('musicbrainz.org/ws/2/recording/');
  expect(String(fetcher.mock.calls[0][0])).toContain('Nils+AND+Frahm+AND+Says');
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
});
it('returns Deezer suggestions from the same-origin service without audio URLs', async () => {
  const { searchDeezer } = await import('./musicBrainz');
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [
        {
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          duration: 120,
          preview: 'https://example.test/audio',
        },
      ],
    }),
  });
  vi.stubGlobal('fetch', fetcher);
  expect(await searchDeezer('Artist Song')).toEqual([
    { title: 'Song', artist: 'Artist', album: 'Album', duration: 120, provider: 'Deezer' },
  ]);
  expect(fetcher.mock.calls[0][0]).toBe('/api/deezer-search');
});
