import { openLibrary } from '../library';
import { contentIdentity, MAX_FILE_SIZE } from '../import';
import type { AlbumOrder, ArtistProfile, Playlist, Track } from '../../domain/types';
import type { PlayEvent } from '../../domain/listening';

const MAGIC = 'WAVEBK1\n';
const MAX_MANIFEST = 32 * 1024 * 1024;
const names = ['tracks', 'playlists', 'artists', 'albumOrders', 'plays'] as const;
const restoreNames = [...names, 'folders'] as const;
type Audio = { offset: number; size: number; type: string };
type SavedTrack = Omit<Track, 'blob'> & { audio?: Audio };
type Manifest = {
  version: 1;
  tracks: SavedTrack[];
  playlists: Playlist[];
  artists: ArtistProfile[];
  albumOrders: AlbumOrder[];
  plays: PlayEvent[];
};

export async function exportLibrary(): Promise<Blob> {
  const db = await openLibrary();
  try {
    const tx = db.transaction(names, 'readonly');
    const [tracks, playlists, artists, albumOrders, plays] = await Promise.all(
      names.map((name) => tx.objectStore(name).getAll()),
    );
    await tx.done;
    let offset = 0;
    const audio: Blob[] = [];
    const saved = (tracks as Track[]).map(({ blob, ...track }) => {
      if (!blob) return track;
      const part = { offset, size: blob.size, type: blob.type };
      offset += blob.size;
      audio.push(blob);
      return { ...track, audio: part };
    });
    const manifest = new TextEncoder().encode(
      JSON.stringify({ version: 1, tracks: saved, playlists, artists, albumOrders, plays }),
    );
    if (manifest.length > MAX_MANIFEST) throw new Error('Library metadata is too large');
    const header = new Uint8Array(12);
    header.set(new TextEncoder().encode(MAGIC));
    new DataView(header.buffer).setUint32(8, manifest.length, true);
    return new Blob([header, manifest, ...audio], { type: 'application/octet-stream' });
  } finally {
    db.close();
  }
}

export interface PreparedBackup {
  tracks: number;
  playlists: number;
  duplicates: number;
  restore: (skipDuplicates?: boolean) => Promise<void>;
}

export async function prepareLibrary(
  file: Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<PreparedBackup> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (header.length !== 12 || new TextDecoder().decode(header.slice(0, 8)) !== MAGIC)
    throw new Error('Invalid backup');
  const length = new DataView(header.buffer).getUint32(8, true);
  if (!length || length > MAX_MANIFEST || 12 + length > file.size)
    throw new Error('Invalid backup');
  const data: unknown = JSON.parse(await file.slice(12, 12 + length).text());
  if (!data || typeof data !== 'object') throw new Error('Invalid backup');
  const manifest = data as Manifest;
  if (
    manifest.version !== 1 ||
    names.some((name) => !Array.isArray(manifest[name]) || manifest[name].length > 100_000)
  )
    throw new Error('Invalid backup');
  const validKey = (value: unknown) =>
    typeof value === 'string' && value.length > 0 && value.length <= 4096;
  let offset = 0;
  const tracks: Track[] = manifest.tracks.map((saved) => {
    if (
      !saved ||
      !validKey(saved.id) ||
      typeof saved.title !== 'string' ||
      typeof saved.artist !== 'string' ||
      typeof saved.album !== 'string' ||
      typeof saved.fileName !== 'string' ||
      !Number.isFinite(saved.duration) ||
      !Number.isFinite(saved.size) ||
      !Number.isFinite(saved.addedAt) ||
      typeof saved.favorite !== 'boolean'
    )
      throw new Error('Invalid track');
    const { audio, ...track } = saved;
    if (!audio) {
      if (track.source !== 'youtube' || !validKey(track.videoId)) throw new Error('Missing audio');
      return track;
    }
    if (
      !Number.isSafeInteger(audio.offset) ||
      !Number.isSafeInteger(audio.size) ||
      audio.offset !== offset ||
      audio.size <= 0 ||
      typeof audio.type !== 'string' ||
      audio.type.length > 200 ||
      12 + length + offset + audio.size > file.size
    )
      throw new Error('Invalid audio');
    const blob = file.slice(12 + length + offset, 12 + length + offset + audio.size, audio.type);
    offset += audio.size;
    return { ...track, blob };
  });
  if (
    12 + length + offset !== file.size ||
    manifest.playlists.some(
      (p) =>
        !p ||
        !validKey(p.id) ||
        typeof p.name !== 'string' ||
        !Array.isArray(p.trackIds) ||
        p.trackIds.some((id) => !validKey(id)),
    ) ||
    manifest.artists.some((a) => !a || !validKey(a.name)) ||
    manifest.albumOrders.some(
      (a) =>
        !a ||
        !validKey(a.id) ||
        !Array.isArray(a.trackIds) ||
        a.trackIds.some((id) => !validKey(id)),
    ) ||
    manifest.plays.some(
      (p) =>
        !p ||
        !validKey(p.id) ||
        !validKey(p.trackId) ||
        !Number.isFinite(p.at) ||
        !Number.isFinite(p.seconds) ||
        typeof p.completed !== 'boolean',
    )
  )
    throw new Error('Invalid backup');
  const unique = (keys: string[]) => new Set(keys).size === keys.length;
  if (
    !unique(tracks.map((v) => v.id)) ||
    !unique(manifest.playlists.map((v) => v.id)) ||
    !unique(manifest.artists.map((v) => v.name)) ||
    !unique(manifest.albumOrders.map((v) => v.id)) ||
    !unique(manifest.plays.map((v) => v.id))
  )
    throw new Error('Duplicate record keys');

  const byContent = new Map<string, string>();
  const aliases = new Map<string, string>();
  const kept: Track[] = [];
  onProgress?.(0, tracks.length);
  for (const [index, track] of tracks.entries()) {
    if (track.blob && track.blob.size > MAX_FILE_SIZE) throw new Error('Audio too large');
    const key = track.blob
      ? `audio:${await contentIdentity(track.blob)}`
      : `youtube:${track.videoId}`;
    const original = byContent.get(key);
    if (original) aliases.set(track.id, original);
    else {
      byContent.set(key, track.id);
      kept.push(track);
    }
    onProgress?.(index + 1, tracks.length);
  }
  const remap = (id: string) => aliases.get(id) ?? id;
  const duplicates = tracks.length - kept.length;
  return {
    tracks: tracks.length,
    playlists: manifest.playlists.length,
    duplicates,
    restore: async (skipDuplicates = false) => {
      const restoredTracks = skipDuplicates ? kept : tracks;
      const playlists = skipDuplicates
        ? manifest.playlists.map((p) => ({ ...p, trackIds: [...new Set(p.trackIds.map(remap))] }))
        : manifest.playlists;
      const albumOrders = skipDuplicates
        ? manifest.albumOrders.map((a) => ({ ...a, trackIds: [...new Set(a.trackIds.map(remap))] }))
        : manifest.albumOrders;
      const plays = skipDuplicates
        ? manifest.plays.map((p) => ({ ...p, trackId: remap(p.trackId) }))
        : manifest.plays;
      const db = await openLibrary();
      try {
        const tx = db.transaction(restoreNames, 'readwrite');
        void tx.done.catch(() => undefined);
        const counts = await Promise.all(restoreNames.map((name) => tx.objectStore(name).count()));
        if (counts.some(Boolean)) {
          tx.abort();
          await tx.done.catch(() => undefined);
          throw new Error('Library not empty');
        }
        try {
          await Promise.all([
            ...restoredTracks.map((value) => tx.objectStore('tracks').add(value)),
            ...playlists.map((value) => tx.objectStore('playlists').add(value)),
            ...manifest.artists.map((value) => tx.objectStore('artists').add(value)),
            ...albumOrders.map((value) => tx.objectStore('albumOrders').add(value)),
            ...plays.map((value) => tx.objectStore('plays').add(value)),
          ]);
          await tx.done;
        } catch (error) {
          try {
            tx.abort();
          } catch {}
          await tx.done.catch(() => undefined);
          throw error;
        }
      } finally {
        db.close();
      }
    },
  };
}

export async function importLibrary(file: Blob): Promise<void> {
  const prepared = await prepareLibrary(file);
  await prepared.restore();
}
