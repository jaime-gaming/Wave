import { Blob as NativeBlob } from 'node:buffer';
import { beforeEach, expect, it } from 'vitest';
import { getTracks, mergeExactDuplicates, openLibrary, saveTrack } from './library';
import { parseLyrics } from '../domain/lyrics';
import { makeTrack } from '../test/fixtures';
beforeEach(async () => {
  const db = await openLibrary();
  await db.clear('tracks');
  await db.clear('playlists');
  await db.clear('albumOrders');
  db.close();
});
it('merges byte-identical records atomically preserving favorites, local lyrics and references', async () => {
  await saveTrack(makeTrack({ blob: new NativeBlob(['audio']) as unknown as Blob }));
  await saveTrack(
    makeTrack({
      id: 'duplicate',
      blob: new NativeBlob(['audio']) as unknown as Blob,
      favorite: true,
      lyrics: parseLyrics('[00:00]Local words'),
    }),
  );
  const db = await openLibrary();
  await db.put('playlists', {
    id: 'list',
    name: 'List',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    trackIds: ['duplicate', 'signal'],
  });
  await db.put('albumOrders', { id: 'album', trackIds: ['duplicate', 'signal'] });
  db.close();
  await mergeExactDuplicates('signal', ['signal', 'duplicate']);
  expect(await getTracks()).toMatchObject([
    { id: 'signal', favorite: true, lyrics: { raw: '[00:00]Local words', source: 'local' } },
  ]);
  const next = await openLibrary();
  expect((await next.get('playlists', 'list'))?.trackIds).toEqual(['signal']);
  expect((await next.get('albumOrders', 'album'))?.trackIds).toEqual(['signal']);
  next.close();
});
it('refuses to remove a same-name different recording', async () => {
  await saveTrack(makeTrack({ blob: new NativeBlob(['audio']) as unknown as Blob }));
  await saveTrack(
    makeTrack({ id: 'other', blob: new NativeBlob(['different audio']) as unknown as Blob }),
  );
  await expect(mergeExactDuplicates('signal', ['signal', 'other'])).rejects.toThrow(
    'not byte-identical',
  );
  expect(await getTracks()).toHaveLength(2);
});
