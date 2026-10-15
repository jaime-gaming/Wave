import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';
import {
  createPlaylist,
  deletePlaylist,
  deleteTrack,
  editTrackMetadata,
  getPlaylists,
  getTracks,
  openLibrary,
  restoreTrackMetadata,
  saveTrack,
  toggleTrackFavorite,
  updatePlaylist,
} from './library';
import { makeTrack } from '../test/fixtures';

beforeEach(async () => {
  const db = await openLibrary();
  await db.clear('tracks');
  await db.clear('playlists');
  db.close();
});
describe('persistent playlists and edits', () => {
  it('upgrades a v1 database without losing tracks or favorites', async () => {
    await deleteDB('wave-library');
    const old = await openDB('wave-library', 1, {
      upgrade(db) {
        db.createObjectStore('tracks', { keyPath: 'id' });
      },
    });
    await old.put('tracks', makeTrack({ favorite: true }));
    old.close();
    const db = await openLibrary();
    expect(db.version).toBe(3);
    expect(db.objectStoreNames.contains('playlists')).toBe(true);
    db.close();
    expect(await getTracks()).toMatchObject([{ id: 'signal', favorite: true }]);
  });
  it('creates, edits, and deletes a playlist while retaining songs', async () => {
    await saveTrack(makeTrack());
    const playlist = await createPlaylist({ name: 'Night', description: 'Evening music' });
    await updatePlaylist(playlist.id, { type: 'add', ids: ['signal', 'signal', 'missing'] });
    expect(await getPlaylists()).toMatchObject([{ name: 'Night', trackIds: ['signal'] }]);
    await updatePlaylist(playlist.id, {
      type: 'details',
      details: { name: 'Morning', description: 'New name', artwork: 'data:image/png;base64,test' },
    });
    expect(await getPlaylists()).toMatchObject([
      { name: 'Morning', artwork: 'data:image/png;base64,test' },
    ]);
    await deletePlaylist(playlist.id);
    expect(await getPlaylists()).toEqual([]);
    expect(await getTracks()).toHaveLength(1);
  });
  it('deleting a library song atomically removes its playlist references', async () => {
    await saveTrack(makeTrack());
    await saveTrack(makeTrack({ id: 'other' }));
    const playlist = await createPlaylist({ name: 'Mix', description: '' });
    await updatePlaylist(playlist.id, { type: 'add', ids: ['signal', 'other'] });
    await deleteTrack('signal');
    expect(await getPlaylists()).toMatchObject([{ trackIds: ['other'] }]);
  });
  it('rolls back the entire track deletion if playlist pruning fails', async () => {
    await saveTrack(makeTrack());
    const playlist = await createPlaylist({ name: 'Mix', description: '' });
    await updatePlaylist(playlist.id, { type: 'add', ids: ['signal'] });
    const db = await openLibrary();
    await db.put('playlists', { ...playlist, id: 'zz-invalid', name: ' ', trackIds: ['signal'] });
    db.close();
    await expect(deleteTrack('signal')).rejects.toThrow('playlist name');
    expect(await getTracks()).toHaveLength(1);
    expect(
      (await getPlaylists()).every((collection) => collection.trackIds.includes('signal')),
    ).toBe(true);
  });
  it('preserves original metadata through repeated edits and restores it', async () => {
    await saveTrack(makeTrack({ artwork: 'original-cover' }));
    await editTrackMetadata('signal', {
      title: 'Custom title',
      artist: 'Custom artist',
      album: 'Custom album',
      artwork: 'custom-cover',
    });
    await editTrackMetadata('signal', {
      title: 'Second edit',
      artist: '',
      album: '',
      artwork: undefined,
    });
    expect(await getTracks()).toMatchObject([
      {
        title: 'Second edit',
        artist: 'Unknown artist',
        originalMetadata: { title: 'Signal', artwork: 'original-cover' },
      },
    ]);
    await toggleTrackFavorite('signal');
    await restoreTrackMetadata('signal');
    expect(await getTracks()).toMatchObject([
      { title: 'Signal', artwork: 'original-cover', favorite: true },
    ]);
    expect((await getTracks())[0].originalMetadata).toBeUndefined();
  });
  it('serializes favorite and metadata writes without overwriting either change', async () => {
    await saveTrack(makeTrack());
    await Promise.all([
      editTrackMetadata('signal', {
        title: 'New name',
        artist: 'Wave Tests',
        album: 'First light',
      }),
      toggleTrackFavorite('signal'),
    ]);
    expect(await getTracks()).toMatchObject([{ title: 'New name', favorite: true }]);
  });
  it('rejects invalid edits and removed playlist targets', async () => {
    await saveTrack(makeTrack());
    await expect(
      editTrackMetadata('signal', { title: ' ', artist: '', album: '' }),
    ).rejects.toThrow();
    await expect(updatePlaylist('missing', { type: 'add', ids: ['signal'] })).rejects.toThrow();
    expect((await getTracks())[0].title).toBe('Signal');
  });
});
