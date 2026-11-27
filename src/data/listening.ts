import { MAX_PLAYS, type PlayEvent } from '../domain/listening';
import { openLibrary } from './library';

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

export async function savePlay(play: PlayEvent): Promise<void> {
  const db = await openLibrary();
  try {
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

export async function clearPlays(): Promise<void> {
  const db = await openLibrary();
  try {
    await db.clear('plays');
  } finally {
    db.close();
  }
}

export async function countPlays(): Promise<number> {
  const db = await openLibrary();
  try {
    return await db.count('plays');
  } finally {
    db.close();
  }
}
