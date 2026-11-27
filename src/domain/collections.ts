import type { Track } from './types';

export interface AlbumGroup {
  id: string;
  name: string;
  artist: string;
  tracks: Track[];
  cover: Track;
  addedAt: number;
}
export interface ArtistGroup {
  name: string;
  tracks: Track[];
  albums: AlbumGroup[];
  duration: number;
}
export function albumKey(track: Pick<Track, 'artist' | 'album'>): string {
  return JSON.stringify([track.artist, track.album]);
}
export function collectAlbums(tracks: Track[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    const id = albumKey(track);
    const group = groups.get(id);
    if (group) {
      group.tracks.push(track);
      group.addedAt = Math.max(group.addedAt, track.addedAt);
      if (!group.cover.artwork && track.artwork) group.cover = track;
    } else
      groups.set(id, {
        id,
        name: track.album,
        artist: track.artist,
        tracks: [track],
        cover: track,
        addedAt: track.addedAt,
      });
  }
  return [...groups.values()];
}

const COMMA_NAMES = new Set([
  'earth, wind & fire',
  'crosby, stills & nash',
  'crosby, stills, nash & young',
  'tyler, the creator',
  'marilyn manson, the beautiful people',
]);

export function artistCredits(artist: string): string[] {
  const value = artist.trim();
  if (!value) return [value];
  if (COMMA_NAMES.has(value.toLowerCase())) return [value];

  const parts = value
    .split(/\s*[;,]\s*(?![^()]*\))/u)
    .map((part) => part.trim())
    .filter(Boolean)

    .filter((part, index) => index === 0 || /^[\p{Lu}\p{N}]/u.test(part));
  return parts.length > 1 ? parts : [value];
}

export function primaryArtist(artist: string): string {
  return artistCredits(artist)[0] || artist;
}

export function collectArtists(tracks: Track[]): ArtistGroup[] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    for (const name of artistCredits(track.artist)) {
      const songs = groups.get(name);
      if (songs) {
        if (!songs.includes(track)) songs.push(track);
      } else groups.set(name, [track]);
    }
  }
  return [...groups]
    .map(([name, songs]) => ({
      name,
      tracks: songs,
      albums: collectAlbums(songs),
      duration: songs.reduce(
        (sum, track) =>
          sum + (Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0),
        0,
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toLocaleUpperCase();
}
