import { describe, expect, it } from 'vitest';
import { cleanTag, describeIssues, metadataIssues } from './metadata';
import { makeTrack } from '../test/fixtures';
it('normalizes broken controls and identifies missing fields without inventing metadata', () => {
  expect(cleanTag('  A\0B\n C  ')).toBe('A B C');
  expect(
    metadataIssues(makeTrack({ artist: 'Unknown artist', album: 'Unknown album', duration: 0 })),
  ).toEqual(['artist', 'album', 'duration', 'artwork']);
  expect(metadataIssues(makeTrack({ artwork: 'data:image/jpeg;base64,cover' }))).toEqual([]);
});

describe('roles that were filed in the wrong place', () => {
  it('notices the artist sitting in the title', () => {
    const track = {
      title: 'Nils Frahm',
      artist: 'Nils Frahm',
      album: 'Spaces',
      duration: 214,
      artwork: 'x',
    };
    expect(metadataIssues(track)).toContain('roles');
    expect(describeIssues(metadataIssues(track))).toContain('look swapped');
  });

  it('says what a song needs without listing field names', () => {
    const track = { title: 'Says', artist: 'Nils Frahm', album: 'Spaces', duration: 0 };
    expect(describeIssues(metadataIssues(track))).toBe('Needs its length and a cover');
    expect(describeIssues(metadataIssues({ ...track, artwork: 'x', album: 'Unknown album' }))).toBe(
      'Needs the album and its length',
    );
  });
});
