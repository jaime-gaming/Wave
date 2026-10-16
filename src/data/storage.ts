import type { Track } from '../domain/types';
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Unavailable';
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024,
    index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[index]}`;
}
export function libraryFootprint(tracks: Track[]) {
  return tracks.reduce(
    (total, track) => ({
      audio: total.audio + track.size,
      artwork:
        total.artwork +
        new TextEncoder().encode((track.artwork ?? '') + (track.originalMetadata?.artwork ?? ''))
          .byteLength,
      lyrics:
        total.lyrics + (track.lyrics ? new TextEncoder().encode(track.lyrics.raw).byteLength : 0),
    }),
    { audio: 0, artwork: 0, lyrics: 0 },
  );
}
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
