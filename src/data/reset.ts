export const RESET_MARKER = 'wave-reset-requested';
export const WAVE_DATABASES = [
  'wave-library',
  'wave-sync',
  'wave-sync-identity',
  'wave-backup-identity',
] as const;

export function clearDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let failed = false;
    let absent = false;
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        absent = true;
        request.transaction?.abort();
      }
    };
    request.onblocked = () => {
      failed = true;
      reject(new Error('Database is blocked by another tab'));
    };
    request.onerror = () => {
      if (absent && request.error?.name === 'AbortError') {
        resolve();
        return;
      }
      failed = true;
      reject(request.error ?? new Error('Cannot open storage'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (failed) {
        db.close();
        return;
      }
      const names = Array.from(db.objectStoreNames);
      if (!names.length) {
        db.close();
        resolve();
        return;
      }
      try {
        const tx = db.transaction(names, 'readwrite');
        const timeout = setTimeout(() => {
          try {
            tx.abort();
          } catch {}
        }, 20_000);
        tx.oncomplete = () => {
          clearTimeout(timeout);
          db.close();
          resolve();
        };
        tx.onabort = tx.onerror = () => {
          clearTimeout(timeout);
          db.close();
          reject(tx.error ?? new Error('Could not clear storage'));
        };
        for (const store of names) tx.objectStore(store).clear();
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}

export function clearWaveKeys(storage: Storage, except?: string) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys) if (key?.startsWith('wave-') && key !== except) storage.removeItem(key);
}

export async function clearWaveData(): Promise<void> {
  for (const name of WAVE_DATABASES) await clearDatabase(name);
  clearWaveKeys(localStorage);
  clearWaveKeys(sessionStorage, RESET_MARKER);
}
