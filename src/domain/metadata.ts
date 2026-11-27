import { rolesSwapped, searchText } from './musicIdentity';
import type { Track } from './types';
export type MetadataIssue = 'title' | 'artist' | 'album' | 'duration' | 'artwork' | 'roles';
export interface MetadataCheck {
  checkedAt: number;
  issues: MetadataIssue[];
}
export const cleanTag = (value: unknown) =>
  typeof value === 'string'
    ? value
        .normalize('NFC')
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 500)
    : '';
export const missingTag = (value: string) =>
  !value.trim() ||
  /^(?:unknown(?: (?:artist|album|title))?|untitled|n\/a|null|undefined)$/iu.test(value.trim());

export function knownArtistSet(tracks: Pick<Track, 'artist'>[]): Set<string> {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    if (missingTag(track.artist)) continue;
    const key = searchText(track.artist);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result = new Set<string>();
  for (const [key, count] of counts) {
    if (count >= 2) result.add(key);
  }
  return result;
}

export function metadataIssues(
  track: Pick<Track, 'title' | 'artist' | 'album' | 'duration' | 'artwork'> & {
    fileName?: string;
    rolesReviewed?: string;
  },
  knownArtists?: ReadonlySet<string>,
): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  for (const field of ['title', 'artist', 'album'] as const)
    if (missingTag(track[field])) issues.push(field);
  if (rolesSwapped(track, knownArtists) && track.rolesReviewed !== rolesReviewKey(track))
    issues.push('roles');
  if (!Number.isFinite(track.duration) || track.duration <= 0) issues.push('duration');
  if (!track.artwork) issues.push('artwork');
  return issues;
}

export function describeIssues(issues: MetadataIssue[]): string {
  const missing = issues.filter((issue) => issue !== 'roles');
  const words: Record<Exclude<MetadataIssue, 'roles'>, string> = {
    title: 'a title',
    artist: 'the artist',
    album: 'the album',
    duration: 'its length',
    artwork: 'a cover',
  };
  const parts = missing.map((issue) => words[issue]);
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
      : (parts[0] ?? '');
  if (issues.includes('roles') && list) return `Needs ${list} · the artist and title look swapped`;
  if (issues.includes('roles')) return 'The artist and title look swapped';
  return list ? `Needs ${list}` : '';
}

export function rolesReviewKey(track: {
  title: string;
  artist: string;
  fileName?: string;
}): string {
  return JSON.stringify([track.title.trim(), track.artist.trim(), track.fileName ?? '']);
}
