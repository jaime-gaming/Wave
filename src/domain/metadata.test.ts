import { it, expect } from 'vitest';
import { cleanTag, metadataIssues } from './metadata';
import { makeTrack } from '../test/fixtures';
it('normalizes broken controls and identifies missing fields without inventing metadata', () => {
  expect(cleanTag('  A\0B\n C  ')).toBe('A B C');
  expect(
    metadataIssues(makeTrack({ artist: 'Unknown artist', album: 'Unknown album', duration: 0 })),
  ).toEqual(['artist', 'album', 'duration', 'artwork']);
  expect(metadataIssues(makeTrack({ artwork: 'data:image/jpeg;base64,cover' }))).toEqual([]);
});
