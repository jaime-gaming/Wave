import { contentIdentity } from './import';
import { lyricsKey } from '../domain/lyricsLookup';
import type { LyricsResult } from '../services/lyrics';
import { albumKey } from '../domain/collections';
import { isPermutation } from '../domain/order';
import { parseLyrics, type Lyrics } from '../domain/lyrics';
import { openDB, type DBSchema } from 'idb';
import type { Playlist, Track, TrackMetadata, ArtistProfile, AlbumOrder } from '../domain/types';
import {
  applyPlaylistChange,
  validatePlaylist,
  type PlaylistChange,
  type PlaylistDetails,
} from '../domain/playlists';
import type { PlayEvent } from '../domain/listening';

interface WaveDatabase extends DBSchema {
  tracks: { key: string; value: Track };
  playlists: { key: string; value: Playlist };
  artists: { key: string; value: ArtistProfile };
  albumOrders: { key: string; value: AlbumOrder };
  plays: { key: string; value: PlayEvent; indexes: { 'by-at': number } };
  /** Folders the listener asked Wave to remember. Added in version 5. */
  folders: { key: string; value: RememberedFolder };
}

/** A folder Wave was given, and the browser's handle for asking again. */
export interface RememberedFolder {
  id: string;
  name: string;
  /** Absent on browsers without the File System Access API. */
  handle?: unknown;
  addedAt: number;
  /** Last time files were read from it, for the sheet's line of text. */
  scannedAt?: number;
}
const DATABASE_NAME = 'wave-library';

async function abortFailedTransaction(tx: { abort: () => void; done: Promise<unknown> }) {
  try {
    tx.abort();
  } catch {
    // An IndexedDB request may already have aborted the transaction.
  }
  await tx.done.catch(() => undefined);
}

/**
 * Schema versions.
 *
 * 1: tracks. 2: playlists. 3: artist profiles and album order. 4: listening
 * history. 5: remembered folders. Each step is additive, so an old library opens
 * and keeps every row; a play is only ever appended, and the store is pruned by
 * the domain rules rather than by a migration.
 *
 * Nothing is ever rewritten in place: a version bump only creates what is
 * missing, which means a listener who updates mid-week keeps the same library
 * and the same history. `docs/ARCHITECTURE.md` describes the rule and the
 * migration test that holds it.
 */
export const LIBRARY_VERSION = 5;

export function openLibrary() {
  return openDB<WaveDatabase>(DATABASE_NAME, LIBRARY_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore('tracks', { keyPath: 'id' });
      if (oldVersion < 2) db.createObjectStore('playlists', { keyPath: 'id' });
      if (oldVersion < 3) {
        db.createObjectStore('artists', { keyPath: 'name' });
        db.createObjectStore('albumOrders', { keyPath: 'id' });
      }
      if (oldVersion < 4) {
        const plays = db.createObjectStore('plays', { keyPath: 'id' });
        plays.createIndex('by-at', 'at');
      }
      if (oldVersion < 5) db.createObjectStore('folders', { keyPath: 'id' });
    },
    blocking(_old, _next, event) {
      (event.target as IDBDatabase).close();
    },
  });
}
export async function getTracks(): Promise<Track[]> {
  const db = await openLibrary();
  try {
    return (await db.getAll('tracks')).map(hydrateTrack);
  } finally {
    db.close();
  }
}
export async function saveTrack(track: Track): Promise<void> {
  const db = await openLibrary();
  try {
    await db.put('tracks', compactTrack(track));
  } finally {
    db.close();
  }
}
export async function deleteTrack(id: string): Promise<void> {
  const db = await openLibrary();
  try {
    const tx = db.transaction(['tracks', 'playlists', 'albumOrders'], 'readwrite');
    try {
      await tx.objectStore('tracks').delete(id);
      for (const playlist of await tx.objectStore('playlists').getAll()) {
        if (playlist.trackIds.includes(id))
          await tx
            .objectStore('playlists')
            .put(applyPlaylistChange(playlist, { type: 'remove', id }));
      }
      for (const album of await tx.objectStore('albumOrders').getAll()) {
        if (album.trackIds.includes(id))
          await tx
            .objectStore('albumOrders')
            .put({ ...album, trackIds: album.trackIds.filter((key) => key !== id) });
      }
      await tx.done;
    } catch (error) {
      await abortFailedTransaction(tx);
      throw error;
    }
  } finally {
    db.close();
  }
}
async function mutateTrack(id: string, mutate: (track: Track) => Track): Promise<Track> {
  const db = await openLibrary();
  try {
    const tx = db.transaction('tracks', 'readwrite');
    try {
      const track = await tx.store.get(id);
      if (!track) {
        throw new Error('This song is no longer in your library.');
      }
      const updated = mutate(hydrateTrack(track));
      await tx.store.put(compactTrack(updated));
      await tx.done;
      return updated;
    } catch (error) {
      await abortFailedTransaction(tx);
      throw error;
    }
  } finally {
    db.close();
  }
}
/**
 * Silent edges: recorded once, then either removed or kept.
 *
 * None of these touch the audio. `silence` is what the analysis measured, `trim`
 * is the pair of bounds playback obeys, and `silenceKept` is the listener saying
 * they want the file as it is. The recording keeps every sample in every case —
 * removing a trim restores the song exactly as it was imported.
 */
export function recordTrackSilence(
  id: string,
  bounds: { start: number; end: number },
): Promise<Track> {
  return mutateTrack(id, (track) =>
    track.trim || track.silenceKept ? track : { ...track, silence: bounds },
  );
}
export function trimTrackSilence(
  id: string,
  bounds: { start: number; end: number },
): Promise<Track> {
  return mutateTrack(id, (track) => {
    const start = Math.max(0, Math.min(bounds.start, track.duration || bounds.start));
    const end = Math.max(start, Math.min(bounds.end, track.duration || bounds.end));
    return { ...track, trim: { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 } };
  });
}
export function restoreTrackSilence(id: string): Promise<Track> {
  return mutateTrack(id, (track) => {
    const restored = { ...track };
    delete restored.trim;
    return restored;
  });
}
export function keepTrackSilence(id: string): Promise<Track> {
  return mutateTrack(id, (track) => ({ ...track, silenceKept: true }));
}
export function toggleTrackFavorite(id: string): Promise<Track> {
  return mutateTrack(id, (track) => ({ ...track, favorite: !track.favorite }));
}
export function editTrackMetadata(id: string, metadata: TrackMetadata): Promise<Track> {
  if (
    !metadata.title.trim() ||
    metadata.title.length > 200 ||
    metadata.artist.length > 200 ||
    metadata.album.length > 200
  )
    return Promise.reject(new Error('Enter a title and use at most 200 characters per field.'));
  return mutateTrack(id, (track) =>
    invalidateOnlineLyrics(track, {
      ...track,
      originalMetadata: track.originalMetadata ?? {
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
      },
      ...metadata,
      title: metadata.title.trim(),
      artist: metadata.artist.trim() || 'Unknown artist',
      album: metadata.album.trim() || 'Unknown album',
      editedAt: Date.now(),
    }),
  );
}
/**
 * Writes what an online catalogue filled in, and remembers that the song was
 * asked about.
 *
 * Two things can never come from here: a field the listener edited (a song with
 * `editedAt` is left alone entirely) and the running time, which belongs to the
 * decoded file rather than to a catalogue's edition of it. A title change
 * invalidates cached online lyrics the same way a hand edit does, because it
 * changes what would be searched for.
 */
export function applyOnlineDetails(
  id: string,
  patch: Partial<Pick<Track, 'title' | 'artist' | 'album' | 'year' | 'genres' | 'artwork'>>,
  options: { checked?: boolean } = {},
): Promise<Track | null> {
  return mutateTrack(id, (track) => {
    const next = track.editedAt ? { ...track } : { ...track, ...cleanPatch(patch) };
    next.detailsCheckedAt = Date.now();
    if (!options.checked) delete next.detailsCheckedAt;
    if (track.editedAt) return next;
    return next.title !== track.title || next.artist !== track.artist
      ? invalidateOnlineLyrics(track, next)
      : next;
  }).catch(() => null);
}

/** Blank values are never written: a gap is better than an empty string. */
function cleanPatch(
  patch: Partial<Pick<Track, 'title' | 'artist' | 'album' | 'year' | 'genres' | 'artwork'>>,
) {
  const clean: typeof patch = {};
  if (patch.title?.trim()) clean.title = patch.title.trim().slice(0, 200);
  if (patch.artist?.trim()) clean.artist = patch.artist.trim().slice(0, 200);
  if (patch.album?.trim()) clean.album = patch.album.trim().slice(0, 200);
  if (patch.year && patch.year > 1000) clean.year = patch.year;
  if (patch.genres?.length) clean.genres = patch.genres.filter(Boolean).slice(0, 4);
  if (patch.artwork) clean.artwork = patch.artwork;
  return clean;
}

/** Marks a song as already asked about, so it is not asked again for a month. */
export function markDetailsChecked(id: string): Promise<Track | null> {
  return mutateTrack(id, (track) => ({ ...track, detailsCheckedAt: Date.now() })).catch(() => null);
}

export function restoreTrackMetadata(id: string): Promise<Track> {
  return mutateTrack(id, (track) => {
    if (!track.originalMetadata) return track;
    const restored = { ...track, ...track.originalMetadata };
    delete restored.originalMetadata;
    delete restored.editedAt;
    return invalidateOnlineLyrics(track, restored);
  });
}
export async function getPlaylists(): Promise<Playlist[]> {
  const db = await openLibrary();
  try {
    return await db.getAll('playlists');
  } finally {
    db.close();
  }
}
export async function createPlaylist(
  details: PlaylistDetails,
  trackIds: string[] = [],
): Promise<Playlist> {
  const now = Date.now();
  const playlist = validatePlaylist({
    ...details,
    id: crypto.randomUUID(),
    trackIds,
    createdAt: now,
    updatedAt: now,
  });
  const db = await openLibrary();
  try {
    const tx = db.transaction(['tracks', 'playlists'], 'readwrite');
    const known = new Set(await tx.objectStore('tracks').getAllKeys());
    playlist.trackIds = playlist.trackIds.filter((id) => known.has(id));
    await tx.objectStore('playlists').add(playlist);
    await tx.done;
    return playlist;
  } finally {
    db.close();
  }
}
export async function updatePlaylist(id: string, change: PlaylistChange): Promise<Playlist> {
  const db = await openLibrary();
  try {
    const tx = db.transaction(['tracks', 'playlists'], 'readwrite');
    try {
      const playlist = await tx.objectStore('playlists').get(id);
      if (!playlist) {
        throw new Error('This playlist no longer exists.');
      }
      const updated = applyPlaylistChange(playlist, change);
      const valid = new Set(await tx.objectStore('tracks').getAllKeys());
      updated.trackIds = updated.trackIds.filter((key) => valid.has(key));
      await tx.objectStore('playlists').put(updated);
      await tx.done;
      return updated;
    } catch (error) {
      await abortFailedTransaction(tx);
      throw error;
    }
  } finally {
    db.close();
  }
}
export async function deletePlaylist(id: string): Promise<void> {
  const db = await openLibrary();
  try {
    await db.delete('playlists', id);
  } finally {
    db.close();
  }
}

export function saveTrackLyrics(id: string, lyrics?: Lyrics): Promise<Track> {
  const parsed = lyrics
    ? { ...parseLyrics(lyrics.raw, lyrics.offsetMs, lyrics.source), providerId: lyrics.providerId }
    : undefined;
  return mutateTrack(id, (track) => ({
    ...track,
    lyrics: parsed?.lines.length ? parsed : undefined,
  }));
}
export async function getCustomizations() {
  const db = await openLibrary();
  try {
    const tx = db.transaction(['artists', 'albumOrders']);
    const [artists, albums] = await Promise.all([
      tx.objectStore('artists').getAll(),
      tx.objectStore('albumOrders').getAll(),
    ]);
    await tx.done;
    return { artists, albums };
  } finally {
    db.close();
  }
}
export async function saveArtistProfile(profile: ArtistProfile): Promise<ArtistProfile> {
  if (
    !profile.name.trim() ||
    (profile.artwork &&
      (!/^data:image\/(jpeg|png|webp);base64,/.test(profile.artwork) ||
        profile.artwork.length > 7_000_000))
  )
    throw new Error('Invalid artist image.');
  const db = await openLibrary();
  try {
    await db.put('artists', profile);
    return profile;
  } finally {
    db.close();
  }
}
export async function saveAlbumOrder(id: string, trackIds: string[]): Promise<AlbumOrder> {
  const db = await openLibrary();
  try {
    const tx = db.transaction(['tracks', 'albumOrders'], 'readwrite');
    try {
      const owned = (await tx.objectStore('tracks').getAll())
        .filter((track) => albumKey(track) === id)
        .map((track) => track.id);
      if (!isPermutation(trackIds, owned))
        throw new Error('The album changed. Reopen its ordering view.');
      const order = { id, trackIds: [...trackIds] };
      await tx.objectStore('albumOrders').put(order);
      await tx.done;
      return order;
    } catch (error) {
      await abortFailedTransaction(tx);
      throw error;
    }
  } finally {
    db.close();
  }
}

function compactTrack(track: Track): Track {
  return track.lyrics ? { ...track, lyrics: { ...track.lyrics, lines: [] } } : track;
}
function hydrateTrack(track: Track): Track {
  if (!track.lyrics) return track;
  try {
    return {
      ...track,
      lyrics: {
        ...parseLyrics(track.lyrics.raw, track.lyrics.offsetMs, track.lyrics.source),
        providerId: track.lyrics.providerId,
      },
    };
  } catch {
    return { ...track, lyrics: undefined };
  }
}
function invalidateOnlineLyrics(before: Track, after: Track): Track {
  if (lyricsKey(before) === lyricsKey(after)) return after;
  return {
    ...after,
    lyrics: after.lyrics?.source === 'lrclib' ? undefined : after.lyrics,
    lyricsLookup: undefined,
  };
}
export function recordContentHash(id: string, contentHash: string) {
  return mutateTrack(id, (track) => ({ ...track, contentHash }));
}
export function saveLyricsResult(id: string, result: LyricsResult): Promise<Track> {
  return mutateTrack(id, (track) => {
    if (
      lyricsKey(track) !== result.lookup.key ||
      (track.lyrics && track.lyrics.source !== 'lrclib')
    )
      return track;
    return { ...track, lyrics: result.lyrics, lyricsLookup: result.lookup };
  });
}

/** Merge only byte-verified records; names alone never authorize deletion. */
export async function mergeExactDuplicates(keepId: string, ids: string[]) {
  const snapshot = await getTracks(),
    group = ids.map((id) => snapshot.find((track) => track.id === id));
  if (
    !ids.includes(keepId) ||
    ids.length < 2 ||
    new Set(ids).size !== ids.length ||
    group.some((track) => !track)
  )
    throw Error('The library changed. Scan again.');
  if (group.some((track) => !track?.blob))
    throw Error('Only local files can be compared byte for byte.');
  const hashes = await Promise.all(group.map((track) => contentIdentity(track!.blob!)));
  if (new Set(hashes).size !== 1) throw Error('These files are not byte-identical.');
  const db = await openLibrary();
  try {
    const tx = db.transaction(['tracks', 'playlists', 'albumOrders'], 'readwrite');
    try {
      const latest = await Promise.all(ids.map((id) => tx.objectStore('tracks').get(id)));
      if (latest.some((track) => !track)) throw Error('The library changed.');
      const keep = hydrateTrack(latest.find((track) => track?.id === keepId)!);
      const lyrics =
        latest
          .map((track) => hydrateTrack(track!).lyrics)
          .find((lyrics) => lyrics?.source === 'local') ??
        latest
          .map((track) => hydrateTrack(track!).lyrics)
          .find((lyrics) => lyrics?.source === 'embedded') ??
        keep.lyrics;
      await tx.objectStore('tracks').put(
        compactTrack({
          ...keep,
          contentHash: hashes[0],
          favorite: latest.some((track) => track?.favorite),
          lyrics,
        }),
      );
      const removed = new Set(ids.filter((id) => id !== keepId));
      const mapIds = (values: string[]) => [
        ...new Set(values.map((id) => (removed.has(id) ? keepId : id))),
      ];
      for (const list of await tx.objectStore('playlists').getAll())
        await tx.objectStore('playlists').put({ ...list, trackIds: mapIds(list.trackIds) });
      for (const list of await tx.objectStore('albumOrders').getAll())
        await tx.objectStore('albumOrders').put({ ...list, trackIds: mapIds(list.trackIds) });
      for (const id of removed) await tx.objectStore('tracks').delete(id);
      await tx.done;
    } catch (error) {
      await abortFailedTransaction(tx);
      throw error;
    }
  } finally {
    db.close();
  }
}

export function recordDecodedDuration(id: string, duration: number): Promise<Track> {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400)
    throw new Error('Invalid media duration.');
  return mutateTrack(id, (track) => invalidateOnlineLyrics(track, { ...track, duration }));
}
