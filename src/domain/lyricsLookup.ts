import { lookupMetadata } from './lyricsMatch';
import type { Track } from './types';
export interface LyricsLookup {
  key: string;
  status: 'found' | 'not-found' | 'instrumental' | 'error';
  checkedAt: number;
  retryAt?: number;
}
export const normalizeMetadata = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function lyricsKey(track: Pick<Track, 'title' | 'artist' | 'album' | 'duration'>): string {
  return JSON.stringify([
    'lrclib-v4',
    normalizeMetadata(track.title),
    normalizeMetadata(track.artist),
    normalizeMetadata(track.album),
    Math.round(track.duration || 0),
  ]);
}
export function canLookup(track: Track) {
  const meta = lookupMetadata(track);
  return !!meta.title && !!meta.artist;
}
export function needsLyrics(track: Track, now = Date.now()) {
  if (!canLookup(track) || track.lyrics?.lines.length) return false;
  const cached = track.lyricsLookup;
  if (!cached || cached.key !== lyricsKey(track)) return true;
  const ttl =
    cached.status === 'error'
      ? 15 * 60_000
      : cached.status === 'not-found'
        ? 86400_000
        : 7 * 86400_000;
  return now - cached.checkedAt > ttl;
}
