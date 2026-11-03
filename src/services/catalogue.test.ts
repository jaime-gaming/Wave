import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadCover,
  parseCatalogueResults,
  preferredCountry,
  searchCatalogue,
} from './catalogue';

afterEach(() => vi.unstubAllGlobals());

const payload = {
  resultCount: 2,
  results: [
    {
      trackName: 'Says',
      artistName: 'Nils Frahm',
      collectionName: 'Spaces',
      releaseDate: '2013-11-08T08:00:00Z',
      primaryGenreName: 'Electronic',
      trackTimeMillis: 214_500,
      artworkUrl100: 'https://is1.mzstatic.com/image/100x100bb.jpg',
    },
    { trackName: 'Instrumental only' },
  ],
};

describe('reading a catalogue answer', () => {
  it('keeps the useful fields and upgrades the cover to the sleeve', () => {
    expect(parseCatalogueResults(payload)).toEqual([
      {
        title: 'Says',
        artist: 'Nils Frahm',
        album: 'Spaces',
        year: 2013,
        genre: 'Electronic',
        duration: 215,
        artworkUrl: 'https://is1.mzstatic.com/image/600x600bb.jpg',
      },
    ]);
  });

  it('survives anything the provider feels like returning', () => {
    expect(parseCatalogueResults(null)).toEqual([]);
    expect(parseCatalogueResults({ results: 'no' })).toEqual([]);
    expect(parseCatalogueResults({ results: [{}] })).toEqual([]);
  });

  it('asks with the listener’s own storefront when the browser says', () => {
    expect(preferredCountry('es-ES')).toBe('ES');
    expect(preferredCountry('en')).toBe('US');
    expect(preferredCountry(undefined)).toBe('US');
  });
});

describe('asking the catalogue', () => {
  it('sends only the words it was given and returns nothing on a bad answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(payload),
      body: null,
    });
    vi.stubGlobal('fetch', fetchMock);
    const releases = await searchCatalogue('Nils Frahm Says', { country: 'ES' });
    expect(releases).toHaveLength(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('itunes.apple.com/search');
    expect(url).toContain('country=ES');
    expect(url).toContain('entity=song');
  });

  it('says nothing rather than throwing when the provider is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await searchCatalogue('anything')).toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, body: null }));
    expect(await searchCatalogue('anything')).toEqual([]);
    expect(await searchCatalogue('   ')).toEqual([]);
  });

  it('accepts a cover as a file, and refuses one that is not an https image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
      }),
    );
    const file = await downloadCover('https://example.test/cover.jpg');
    expect(file?.type).toBe('image/jpeg');
    expect(await downloadCover('http://example.test/cover.jpg')).toBeUndefined();
  });
});
