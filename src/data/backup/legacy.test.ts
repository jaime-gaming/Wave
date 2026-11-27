import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { exportLibrary, importLibrary } from './index';
import { openLibrary, saveTrack } from '../library';
import { makeTrack } from '../../test/fixtures';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(async () => {
  const db = await openLibrary();
  for (const store of [
    'tracks',
    'playlists',
    'artists',
    'albumOrders',
    'plays',
    'folders',
  ] as const)
    await db.clear(store);
  db.close();
  vi.unstubAllGlobals();
});

it('round trips songs, original bytes, playlists and history', async () => {
  const blob = new NodeBlob(['original music'], { type: 'audio/wav' }) as unknown as Blob;
  await saveTrack(makeTrack({ id: 'song', blob }));
  let db = await openLibrary();
  await db.put('playlists', {
    id: 'list',
    name: 'Favorites',
    description: '',
    trackIds: ['song'],
    createdAt: 1,
    updatedAt: 1,
  });
  await db.put('plays', { id: 'play', trackId: 'song', at: 100, seconds: 20, completed: false });
  db.close();
  const backup = await exportLibrary();
  const realFile = backup;
  db = await openLibrary();
  await db.clear('tracks');
  await db.clear('playlists');
  await db.clear('plays');
  db.close();
  await importLibrary(realFile);
  db = await openLibrary();
  const track = await db.get('tracks', 'song');
  expect(await track!.blob!.text()).toBe('original music');
  expect((await db.get('playlists', 'list'))?.trackIds).toEqual(['song']);
  expect((await db.get('plays', 'play'))?.trackId).toBe('song');
  db.close();
});

it('rejects corrupt files and never overwrites an existing library', async () => {
  await expect(importLibrary(new NodeBlob(['wrong']) as unknown as Blob)).rejects.toThrow();
  await saveTrack(makeTrack({ id: 'existing', blob: new NodeBlob(['x']) as unknown as Blob }));
  const backup = await exportLibrary();
  const realFile = backup;
  await expect(importLibrary(realFile)).rejects.toThrow('Library not empty');
  const db = await openLibrary();
  expect(await db.count('tracks')).toBe(1);
  db.close();
});

it('rolls back the entire restore if the backup contains duplicate keys', async () => {
  const db = await openLibrary();
  await db.put('playlists', {
    id: 'list',
    name: 'List',
    description: '',
    trackIds: [],
    createdAt: 1,
    updatedAt: 1,
  });
  db.close();
  const good = await exportLibrary();
  const bytes = new Uint8Array(await good.arrayBuffer());
  const length = new DataView(bytes.buffer).getUint32(8, true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes.slice(12, 12 + length)));
  manifest.playlists.push(manifest.playlists[0]);
  const encoded = new TextEncoder().encode(JSON.stringify(manifest));
  const header = bytes.slice(0, 12);
  new DataView(header.buffer).setUint32(8, encoded.length, true);
  const invalid = new NodeBlob([header, encoded, bytes.slice(12 + length)]) as unknown as Blob;
  const clean = await openLibrary();
  await clean.clear('playlists');
  clean.close();
  await expect(importLibrary(invalid)).rejects.toThrow();
  const after = await openLibrary();
  expect(await after.count('playlists')).toBe(0);
  expect(await after.count('tracks')).toBe(0);
  after.close();
});

it('previews exact duplicate audio and remaps playlist and history references atomically', async () => {
  const { prepareLibrary } = await import('./index');
  const data = new NodeBlob(['same bytes']) as unknown as Blob;
  await saveTrack(makeTrack({ id: 'one', blob: data }));
  await saveTrack(makeTrack({ id: 'two', blob: data }));
  let db = await openLibrary();
  await db.put('playlists', {
    id: 'p',
    name: 'List',
    description: '',
    trackIds: ['two', 'one'],
    createdAt: 1,
    updatedAt: 1,
  });
  await db.put('plays', { id: 'h', trackId: 'two', at: 1, seconds: 1, completed: false });
  db.close();
  const file = await exportLibrary();
  db = await openLibrary();
  await db.clear('tracks');
  await db.clear('playlists');
  await db.clear('plays');
  db.close();
  const progress: Array<[number, number]> = [];
  const preview = await prepareLibrary(file, (done, total) => progress.push([done, total]));
  expect(progress).toEqual([
    [0, 2],
    [1, 2],
    [2, 2],
  ]);
  expect(preview.tracks).toBe(2);
  expect(preview.duplicates).toBe(1);
  db = await openLibrary();
  expect(await db.count('tracks')).toBe(0);
  db.close();
  await preview.restore(true);
  db = await openLibrary();
  expect(await db.count('tracks')).toBe(1);
  expect((await db.get('playlists', 'p'))?.trackIds).toEqual(['one']);
  expect((await db.get('plays', 'h'))?.trackId).toBe('one');
  db.close();
});

it('preserves exact duplicates unless explicitly skipped and refuses a later nonempty restore', async () => {
  const { prepareLibrary } = await import('./index');
  const data = new NodeBlob(['identical']) as unknown as Blob;
  await saveTrack(makeTrack({ id: 'first', blob: data }));
  await saveTrack(makeTrack({ id: 'second', blob: data }));
  const file = await exportLibrary();
  let db = await openLibrary();
  await db.clear('tracks');
  db.close();
  const prepared = await prepareLibrary(file);
  expect(prepared.duplicates).toBe(1);
  await prepared.restore();
  db = await openLibrary();
  expect(await db.count('tracks')).toBe(2);
  db.close();
  await expect(prepared.restore(true)).rejects.toThrow('Library not empty');
});
