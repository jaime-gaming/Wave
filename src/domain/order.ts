import type { Track } from './types';
export function orderedTracks(tracks: Track[], ids: string[] = []): Track[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const ordered: Track[] = [];
  for (const id of ids) {
    const track = byId.get(id);
    if (track) {
      ordered.push(track);
      byId.delete(id);
    }
  }
  return [
    ...ordered,
    ...[...byId.values()].sort(
      (a, b) =>
        (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
        (a.trackNumber ?? Infinity) - (b.trackNumber ?? Infinity) ||
        a.addedAt - b.addedAt,
    ),
  ];
}
export function isPermutation(ids: string[], existing: string[]): boolean {
  const set = new Set(existing);
  return (
    ids.length === existing.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => set.has(id))
  );
}
export function moveId(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id),
    next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  const result = [...ids];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}
