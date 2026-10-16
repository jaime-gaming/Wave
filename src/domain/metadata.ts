import type { Track } from './types';
export type MetadataIssue = 'title' | 'artist' | 'album' | 'duration' | 'artwork';
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
  track: Pick<Track, 'title' | 'artist' | 'album' | 'duration' | 'artwork'>,
): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  for (const field of ['title', 'artist', 'album'] as const)
    if (missingTag(track[field])) issues.push(field);
  if (!Number.isFinite(track.duration) || track.duration <= 0) issues.push('duration');
  if (!track.artwork) issues.push('artwork');
  return issues;
}
