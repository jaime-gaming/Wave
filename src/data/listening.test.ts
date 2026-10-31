import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { clearPlays, countPlays, getPlays, savePlay } from './listening';
import { getTracks, LIBRARY_VERSION, openLibrary, saveTrack } from './library';
import { makePlay, MAX_PLAYS } from '../domain/listening';
import { makeTrack } from '../test/fixtures';

const deleted = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('wave-library');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });

beforeEach(async () => {
  await clearPlays();
  const db = await openLibrary();
  await db.clear('tracks');
  db.close();
});

describe('listening history storage', () => {
  it('starts empty and keeps plays in time order', async () => {
    expect(await getPlays()).toEqual([]);
    await savePlay(makePlay('signal', 2_000, 40, false));
    await savePlay(makePlay('signal', 1_000, 90, true));
    expect((await getPlays()).map((play) => play.at)).toEqual([1_000, 2_000]);
    expect(await countPlays()).toBe(2);
  });

  it('prunes itself instead of growing for ever', async () => {
    const plays = Array.from({ length: MAX_PLAYS + 3 }, (_, index) =>
      makePlay('signal', index * 1_000, 30, false),
    );
    for (const play of plays) await savePlay(play);
    expect(await countPlays()).toBe(MAX_PLAYS);
    const stored = await getPlays();
    // The oldest three went, the newest is still there.
    expect(stored[0].at).toBe(3_000);
    expect(stored.at(-1)?.at).toBe((MAX_PLAYS + 2) * 1_000);
  });

  it('forgets everything only when asked', async () => {
    await savePlay(makePlay('signal', 1_000, 40, false));
    await clearPlays();
    expect(await getPlays()).toEqual([]);
  });
});

describe('the library upgrade', () => {
  it('adds the history store to a version-3 library without touching its rows', async () => {
    // Start from nothing so the database can be created at the older version.
    await deleted();
    // A library as it was written by the previous release: tracks and
    // playlists exist, listening history does not.
    const legacy = await openDB('wave-library', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore('tracks', { keyPath: 'id' });
        if (oldVersion < 2) db.createObjectStore('playlists', { keyPath: 'id' });
        if (oldVersion < 3) {
          db.createObjectStore('artists', { keyPath: 'name' });
          db.createObjectStore('albumOrders', { keyPath: 'id' });
        }
      },
    });
    await legacy.put('tracks', makeTrack());
    expect(legacy.objectStoreNames.contains('plays')).toBe(false);
    legacy.close();

    // Opening it again goes through the version-4 upgrade.
    const upgraded = await openLibrary();
    expect(upgraded.version).toBe(LIBRARY_VERSION);
    expect(upgraded.objectStoreNames.contains('plays')).toBe(true);
    expect(await getTracks()).toMatchObject([{ id: 'signal' }]);
    upgraded.close();
  });

  it('adds the folder store to a version-4 library without touching its rows', async () => {
    // A library from before folders were remembered: history and playlists are
    // there, and the only thing the version-5 upgrade may do is add one store.
    await deleted();
    const legacy = await openDB('wave-library', 4, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore('tracks', { keyPath: 'id' });
        if (oldVersion < 2) db.createObjectStore('playlists', { keyPath: 'id' });
        if (oldVersion < 3) {
          db.createObjectStore('artists', { keyPath: 'name' });
          db.createObjectStore('albumOrders', { keyPath: 'id' });
        }
        if (oldVersion < 4)
          db.createObjectStore('plays', { keyPath: 'id' }).createIndex('by-at', 'at');
      },
    });
    await legacy.put('tracks', makeTrack({ title: 'Before folders' }));
    await legacy.put('plays', { id: 'play-1', trackId: 'signal', at: Date.now(), seconds: 90 });
    expect(legacy.objectStoreNames.contains('folders')).toBe(false);
    legacy.close();

    const upgraded = await openLibrary();
    expect(upgraded.objectStoreNames.contains('folders')).toBe(true);
    expect(await getTracks()).toMatchObject([{ title: 'Before folders' }]);
    expect(await countPlays()).toBe(1);
    upgraded.close();
  });

  it('keeps a saved track readable across the upgrade', async () => {
    await saveTrack(makeTrack({ title: 'Across the upgrade' }));
    expect(await getTracks()).toMatchObject([{ title: 'Across the upgrade' }]);
  });
});
