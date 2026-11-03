import { Blob as NativeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteTrack, getTracks, openLibrary, saveTrack, recordDecodedDuration } from './library';
import { makeTrack } from '../test/fixtures';

beforeEach(async () => {
  const db = await openLibrary();
  await db.clear('tracks');
  db.close();
});
describe('IndexedDB library', () => {
  it('opens an empty library', async () => {
    expect(await getTracks()).toEqual([]);
  });
  it('persists metadata and favorite updates across repository connections', async () => {
    const track = makeTrack();
    await saveTrack(track);
    expect(await getTracks()).toMatchObject([{ id: track.id, title: 'Signal', favorite: false }]);
    await saveTrack({ ...track, favorite: true });
    expect(await getTracks()).toMatchObject([{ favorite: true }]);
    expect(await getTracks()).toHaveLength(1);
  });
  it('removes only the requested record', async () => {
    await saveTrack(makeTrack());
    await saveTrack(makeTrack({ id: 'other' }));
    await deleteTrack('signal');
    expect(await getTracks()).toMatchObject([{ id: 'other' }]);
  });
});

it('reconciles decoder duration without changing bytes or local lyrics, and clears only stale online matches', async () => {
  const blob = new NativeBlob(['source-bytes']);
  const local = makeTrack({
    blob: blob as unknown as Blob,
    lyrics: { raw: '[00:00]Local text', source: 'local', offsetMs: 100, lines: [] },
  });
  await saveTrack(local);
  const corrected = await recordDecodedDuration(local.id, 120);
  expect(corrected.duration).toBe(120);
  expect(corrected.lyrics?.raw).toBe(local.lyrics?.raw);
  expect(await corrected.blob?.arrayBuffer()).toEqual(await blob.arrayBuffer());
  expect(corrected.audioInfo).toEqual(local.audioInfo);
  await saveTrack(
    makeTrack({
      id: 'online',
      lyrics: { raw: '[00:00]Online text', source: 'lrclib', offsetMs: 0, lines: [] },
      lyricsLookup: { key: 'old-recording', status: 'found', checkedAt: 1 },
    }),
  );
  const online = await recordDecodedDuration('online', 120);
  expect(online.lyrics).toBeUndefined();
  expect(online.lyricsLookup).toBeUndefined();
});
