import { rolesSwapped } from './musicIdentity';
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

export function metadataIssues(
  track: Pick<Track, 'title' | 'artist' | 'album' | 'duration' | 'artwork'> & {
    fileName?: string;
  },
): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  for (const field of ['title', 'artist', 'album'] as const)
    if (missingTag(track[field])) issues.push(field);
  // "The artist and the title look swapped" is only said when there is evidence
  // for it: the file name itself disagrees with the tags in exactly that way.
  // Comparing two tags for equality flagged every song whose title repeats its
  // artist — self-titled albums, "X by X" singles — which is not a mistake.
  if (rolesSwapped(track)) issues.push('roles');
  if (!Number.isFinite(track.duration) || track.duration <= 0) issues.push('duration');
  if (!track.artwork) issues.push('artwork');
  return issues;
}

/** What is wrong with a song, said the way a person would say it. */
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
