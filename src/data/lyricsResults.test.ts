import { beforeEach, expect, it } from 'vitest';
import {
  getTracks,
  openLibrary,
  saveTrack,
  saveTrackLyrics,
  saveLyricsResult,
  editTrackMetadata,
} from './library';
import { parseLyrics } from '../domain/lyrics';
import { lyricsKey } from '../domain/lyricsLookup';
import { makeTrack } from '../test/fixtures';
beforeEach(async () => {
  const db = await openLibrary();
  await db.clear('tracks');
  db.close();
});
it('stores raw lyrics once and hydrates synchronized lines with provider attribution', async () => {
  const track = makeTrack(),
    lyrics = { ...parseLyrics('[00:01]One\n[00:03]Two', 100, 'lrclib'), providerId: 42 };
  await saveTrack(track);
  await saveLyricsResult(track.id, {
    lookup: { key: lyricsKey(track), checkedAt: 1, status: 'found' },
    lyrics,
  });
  const db = await openLibrary();
  expect((await db.get('tracks', track.id))?.lyrics?.lines).toEqual([]);
  db.close();
  const [saved] = await getTracks();
  expect(saved.lyrics).toEqual(lyrics);
  await saveTrackLyrics(track.id, { ...saved.lyrics!, offsetMs: 200 });
  expect((await getTracks())[0].lyrics?.providerId).toBe(42);
});
it('does not overwrite local lyrics, resurrect deletions or save stale metadata matches', async () => {
  const track = makeTrack();
  await saveTrack(track);
  const result = {
    lookup: { key: lyricsKey(track), checkedAt: 1, status: 'found' as const },
    lyrics: parseLyrics('[00:02]Remote', 0, 'lrclib'),
  };
  await saveTrackLyrics(track.id, parseLyrics('[00:01]Manual'));
  await saveLyricsResult(track.id, result);
  expect((await getTracks())[0].lyrics?.lines[0].text).toBe('Manual');
  await saveTrackLyrics(track.id);
  await editTrackMetadata(track.id, { title: 'Changed', artist: track.artist, album: track.album });
  await saveLyricsResult(track.id, result);
  expect((await getTracks())[0].lyrics).toBeUndefined();
  await expect(saveLyricsResult('deleted', result)).rejects.toThrow();
});
it('invalidates downloaded lyrics on title edits but retains manual lyrics', async () => {
  const track = makeTrack();
  await saveTrack({
    ...track,
    lyrics: parseLyrics('[00:00]Remote', 0, 'lrclib'),
    lyricsLookup: { key: lyricsKey(track), status: 'found', checkedAt: 1 },
  });
  await editTrackMetadata(track.id, { title: 'Other', artist: track.artist, album: track.album });
  expect((await getTracks())[0]).toMatchObject({ lyrics: undefined, lyricsLookup: undefined });
  await saveTrackLyrics(track.id, parseLyrics('[00:00]Local'));
  await editTrackMetadata(track.id, { title: 'Another', artist: track.artist, album: track.album });
  expect((await getTracks())[0].lyrics?.source).toBe('local');
});
