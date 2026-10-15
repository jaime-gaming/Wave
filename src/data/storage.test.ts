import { afterEach, expect, it, vi } from 'vitest';
import { formatBytes, libraryFootprint, requestPersistentStorage } from './storage';
import { makeTrack } from '../test/fixtures';
import { parseLyrics } from '../domain/lyrics';
afterEach(() => vi.unstubAllGlobals());
it('handles unavailable, denied, failed and granted persistence requests', async () => {
  vi.stubGlobal('navigator', {});
  expect(await requestPersistentStorage()).toBe(false);
  for (const [callback, expected] of [
    [() => false, false],
    [
      () => {
        throw Error('denied');
      },
      false,
    ],
    [() => true, true],
  ] as const) {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn(callback) } });
    expect(await requestPersistentStorage()).toBe(expected);
  }
});
it('counts original audio and stored cover/raw text estimates', () => {
  const track = makeTrack({
    size: 2048,
    artwork: 'abc',
    originalMetadata: { title: 'Original', artist: 'Artist', album: 'Album', artwork: 'xyz' },
    lyrics: parseLyrics('Words'),
  });
  expect(libraryFootprint([track])).toEqual({ audio: 2048, artwork: 6, lyrics: 5 });
  expect(formatBytes(2048)).toBe('2.0 KB');
  expect(formatBytes(NaN)).toBe('Unavailable');
  expect(formatBytes(0)).toBe('0 B');
});
