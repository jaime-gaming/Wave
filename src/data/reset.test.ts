import { afterEach, expect, it } from 'vitest';
import { openDB } from 'idb';
import { clearWaveData, RESET_MARKER, WAVE_DATABASES } from './reset';

afterEach(async () => {
  for (const name of [...WAVE_DATABASES, 'another-app']) {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = r.onerror = () => resolve();
    });
  }
});
it('clears every Wave store and preference but preserves other apps and the pending reset marker', async () => {
  for (const name of [...WAVE_DATABASES, 'another-app']) {
    const db = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('first');
        db.createObjectStore('second');
      },
    });
    await db.put('first', 'saved', 'item');
    await db.put('second', 'saved', 'item');
    db.close();
  }
  localStorage.setItem('wave-theme', 'light');
  localStorage.setItem('another-app', 'safe');
  sessionStorage.setItem(RESET_MARKER, 'true');
  sessionStorage.setItem('wave-other', 'x');
  await clearWaveData();
  for (const name of WAVE_DATABASES) {
    const db = await openDB(name, 1);
    expect(await db.count('first')).toBe(0);
    expect(await db.count('second')).toBe(0);
    db.close();
  }
  const other = await openDB('another-app', 1);
  expect(await other.get('first', 'item')).toBe('saved');
  other.close();
  expect(localStorage.getItem('wave-theme')).toBeNull();
  expect(localStorage.getItem('another-app')).toBe('safe');
  expect(sessionStorage.getItem(RESET_MARKER)).toBe('true');
  expect(sessionStorage.getItem('wave-other')).toBeNull();
});
it('does not leave empty version-one databases that prevent Wave from initialising', async () => {
  await clearWaveData();
  const { openLibrary, LIBRARY_VERSION } = await import('./library');
  const db = await openLibrary();
  expect(db.version).toBe(LIBRARY_VERSION);
  expect([...db.objectStoreNames]).toContain('tracks');
  expect([...db.objectStoreNames]).toContain('plays');
  db.close();
});
