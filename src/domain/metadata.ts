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
const comparable = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function metadataIssues(
  track: Pick<Track, 'title' | 'artist' | 'album' | 'duration' | 'artwork'>,
): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  for (const field of ['title', 'artist', 'album'] as const)
    if (missingTag(track[field])) issues.push(field);
  // The same words in two fields is the classic mis-mapping: the artist sat
  // down in the title, or the album did. Worth a look, never a silent rewrite.
  const title = missingTag(track.title) ? '' : comparable(track.title);
  if (title) {
    if (!missingTag(track.artist) && comparable(track.artist) === title) issues.push('roles');
    else if (!missingTag(track.album) && comparable(track.album) === title) issues.push('roles');
  }
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
