import type { Track } from './types';
import { normalizeMetadata } from './lyricsLookup';
export function duplicateNames(tracks: Track[]) {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = normalizeMetadata(track.title) + '\0' + normalizeMetadata(track.artist);
    groups.set(key, [...(groups.get(key) ?? []), track]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
