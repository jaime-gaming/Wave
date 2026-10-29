/**
 * Reading and writing the listening history.
 *
 * Plays live in the same IndexedDB database as the library, in their own store,
 * so the whole history disappears when the user clears site data and nothing
 * about it is derived from a server. The store is append-only and pruned by the
 * domain rules: the newest `MAX_PLAYS` entries survive.
 */
import { MAX_PLAYS, type PlayEvent } from '../domain/listening';
import { openLibrary } from './library';

/** Every recorded play, newest last. */
export async function getPlays(): Promise<PlayEvent[]> {
  const db = await openLibrary();
  try {
    return (await db.getAllFromIndex('plays', 'by-at')).filter(
      (play) => play && typeof play.trackId === 'string',
    );
  } finally {
    db.close();
  }
}

/**
 * Records one play.
 *
 * Returns the plays that were dropped to stay inside the limit, so the caller
 * can delete them in the same transaction instead of leaving a store that grows
 * for ever beneath a list that pretends it does not.
 */
export async function savePlay(play: PlayEvent): Promise<void> {
  const db = await openLibrary();
  try {
    // One transaction: append, then trim from the old end if the store grew
    // past the limit. Doing the trim on every write would read the whole store
    // to keep it the same size, which is work for nothing.
    const tx = db.transaction('plays', 'readwrite');
    await tx.store.put(play);
    const count = await tx.store.count();
    if (count > MAX_PLAYS) {
      let excess = count - MAX_PLAYS;
      let cursor = await tx.store.index('by-at').openCursor();
      while (cursor && excess > 0) {
        await cursor.delete();
        excess--;
        cursor = await cursor.continue();
      }
    }
    await tx.done;
  } finally {
    db.close();
  }
}

/** Forgets everything. Called only from the explicit action in the page. */
export async function clearPlays(): Promise<void> {
  const db = await openLibrary();
  try {
    await db.clear('plays');
  } finally {
    db.close();
  }
}

/** How many plays are stored, for the storage panel and the empty state. */
export async function countPlays(): Promise<number> {
  const db = await openLibrary();
  try {
    return await db.count('plays');
  } finally {
    db.close();
  }
}
