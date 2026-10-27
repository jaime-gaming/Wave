import { matchesSearch } from './musicIdentity';
import type { LyricsLookup } from './lyricsLookup';
import type { Lyrics } from './lyrics';
export interface AudioInfo {
  codec?: string;
  sampleRate?: number;
  bitsPerSample?: number;
  bitrate?: number;
  lossless?: boolean;
}
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileName: string;
  size: number;
  addedAt: number;
  favorite: boolean;
  /** Local file bytes. Absent for songs played from YouTube. */
  blob?: Blob;
  /** Where playback comes from. Local files are the default. */
  source?: 'local' | 'youtube';
  /** YouTube video id, for `source: 'youtube'` songs. */
  videoId?: string;
  artwork?: string;
  audioInfo?: AudioInfo;
  lyrics?: Lyrics;
  lyricsLookup?: LyricsLookup;
  contentHash?: string;
  genres?: string[];
  year?: number;
  metadataCheck?: import('./metadata').MetadataCheck;
  trackNumber?: number;
  discNumber?: number;
  originalMetadata?: TrackMetadata;
  editedAt?: number;
}

export type RepeatMode = 'off' | 'all' | 'one';
export type LibraryView = 'songs' | 'albums' | 'artists' | 'playlists' | 'favorites';
export type TrackMetadata = Pick<Track, 'title' | 'artist' | 'album' | 'artwork'>;

export interface Playlist {
  id: string;
  name: string;
  description: string;
  artwork?: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function filterTracks(tracks: Track[], query: string): Track[] {
  return tracks.filter((track) =>
    matchesSearch(`${track.title} ${track.artist} ${track.album}`, query),
  );
}

export interface ArtistProfile {
  name: string;
  artwork?: string;
}
export interface AlbumOrder {
  id: string;
  trackIds: string[];
}
