import { beforeEach, it, expect } from 'vitest';
import { deleteDB, openDB } from 'idb';
import {
  openLibrary,
  saveTrack,
  createPlaylist,
  getPlaylists,
  getTracks,
  getCustomizations,
  saveArtistProfile,
  saveAlbumOrder,
  saveTrackLyrics,
  deleteTrack,
  editTrackMetadata,
  toggleTrackFavorite,
} from './library';
import { makeTrack } from '../test/fixtures';
import { albumKey } from '../domain/collections';
import { parseLyrics } from '../domain/lyrics';
beforeEach(async () => {
  const db = await openLibrary();
  for (const store of ['tracks', 'playlists', 'artists', 'albumOrders'] as const)
    await db.clear(store);
  db.close();
});
it('upgrades v2 without losing songs, favorites or ordered playlists', async () => {
  await deleteDB('wave-library');
  const old = await openDB('wave-library', 2, {
    upgrade(db) {
      db.createObjectStore('tracks', { keyPath: 'id' });
      db.createObjectStore('playlists', { keyPath: 'id' });
    },
  });
  await old.put('tracks', makeTrack({ favorite: true }));
  await old.put('playlists', {
    id: 'p',
    name: 'Saved',
    description: '',
    trackIds: ['signal'],
    createdAt: 1,
    updatedAt: 1,
  });
  old.close();
  const db = await openLibrary();
  expect(db.version).toBe(3);
  expect(db.objectStoreNames.contains('artists')).toBe(true);
  expect(db.objectStoreNames.contains('albumOrders')).toBe(true);
  db.close();
  expect((await getTracks())[0].favorite).toBe(true);
  expect((await getPlaylists())[0].trackIds).toEqual(['signal']);
});
it('persists and removes manual artist photos separately from audio and album artwork', async () => {
  await saveTrack(makeTrack());
  await saveArtistProfile({ name: 'Wave Tests', artwork: 'data:image/jpeg;base64,abcd' });
  expect((await getCustomizations()).artists[0].artwork).toBe('data:image/jpeg;base64,abcd');
  await saveArtistProfile({ name: 'Wave Tests' });
  expect((await getCustomizations()).artists[0].artwork).toBeUndefined();
  expect((await getTracks())[0].artwork).toBeUndefined();
  await expect(
    saveArtistProfile({ name: 'A', artwork: 'https://example.com/photo.jpg' }),
  ).rejects.toThrow();
});
it('saves only complete album permutations and atomically prunes deleted memberships', async () => {
  const a = makeTrack({ id: 'a' }),
    b = makeTrack({ id: 'b' }),
    c = makeTrack({ id: 'c', artist: 'Other' });
  for (const track of [a, b, c]) await saveTrack(track);
  await saveAlbumOrder(albumKey(a), ['b', 'a']);
  await expect(saveAlbumOrder(albumKey(a), ['a', 'c'])).rejects.toThrow();
  expect((await getCustomizations()).albums[0].trackIds).toEqual(['b', 'a']);
  const playlist = await createPlaylist({ name: 'List', description: '' });
  const db = await openLibrary();
  await db.put('playlists', { ...playlist, trackIds: ['a', 'b'] });
  db.close();
  await deleteTrack('a');
  expect((await getCustomizations()).albums[0].trackIds).toEqual(['b']);
  expect((await getPlaylists())[0].trackIds).toEqual(['b']);
});
it('serializes lyric, metadata and favorite edits while retaining source bytes and independent fields', async () => {
  await saveTrack(makeTrack());
  const original = (await getTracks())[0].blob ?? new Blob();
  await Promise.all([
    saveTrackLyrics('signal', parseLyrics('[00:01.500]One')),
    editTrackMetadata('signal', { title: 'New', artist: 'Wave Tests', album: 'First light' }),
    toggleTrackFavorite('signal'),
  ]);
  const saved = (await getTracks())[0];
  expect(saved.title).toBe('New');
  expect(saved.favorite).toBe(true);
  expect(saved.lyrics?.lines).toEqual([{ text: 'One', time: 1.5 }]);
  expect(saved.blob?.size).toBe(original.size);
  await saveTrackLyrics('signal');
  expect((await getTracks())[0].lyrics).toBeUndefined();
});
