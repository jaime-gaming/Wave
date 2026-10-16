import { expect, it } from 'vitest';
import { lyricsKey, needsLyrics } from './lyricsLookup';
import { makeTrack } from '../test/fixtures';
import { parseLyrics } from './lyrics';
it('avoids unknown artists and existing embedded/manual lyrics', () => {
  expect(needsLyrics(makeTrack({ artist: 'Unknown artist' }))).toBe(false);
  expect(needsLyrics(makeTrack({ lyrics: parseLyrics('[00:01]Saved') }))).toBe(false);
  expect(needsLyrics(makeTrack())).toBe(true);
});
it('caches misses for seven days, errors for fifteen minutes and invalidates metadata', () => {
  const track = makeTrack();
  const key = lyricsKey(track);
  expect(
    needsLyrics({ ...track, lyricsLookup: { key, status: 'not-found', checkedAt: 1 } }, 86400_000),
  ).toBe(false);
  expect(
    needsLyrics(
      { ...track, lyricsLookup: { key, status: 'not-found', checkedAt: 1 } },
      8 * 86400_000,
    ),
  ).toBe(true);
  expect(
    needsLyrics({ ...track, lyricsLookup: { key, status: 'error', checkedAt: 1 } }, 14 * 60_000),
  ).toBe(false);
  expect(
    needsLyrics({ ...track, lyricsLookup: { key, status: 'error', checkedAt: 1 } }, 16 * 60_000),
  ).toBe(true);
  expect(
    needsLyrics(
      { ...track, title: 'Changed', lyricsLookup: { key, status: 'not-found', checkedAt: 1 } },
      2,
    ),
  ).toBe(true);
});
it('retries misses cached before matching fixes without replacing existing local lyrics', () => {
  const track = makeTrack();
  const oldKey = JSON.stringify(['signal', 'wave tests', 'first light', 90]);
  const cached = {
    ...track,
    lyricsLookup: { key: oldKey, status: 'not-found' as const, checkedAt: Date.now() },
  };
  expect(needsLyrics(cached)).toBe(true);
  expect(needsLyrics({ ...cached, lyrics: parseLyrics('[00:01]Keep my words') })).toBe(false);
});

it('rechecks provider-throttled tracks at their actual deadline, without a fifteen-minute penalty', () => {
  const track = makeTrack();
  const paused = {
    ...track,
    lyricsLookup: {
      key: lyricsKey(track),
      status: 'error' as const,
      checkedAt: 1000,
      retryAt: 3000,
    },
  };
  expect(needsLyrics(paused, 2999)).toBe(false);
  expect(needsLyrics(paused, 3000)).toBe(true);
});
