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
  it('says nothing when the title repeats the artist, because that is not a mistake', () => {
    const selfTitled = {
      title: 'Nils Frahm',
      artist: 'Nils Frahm',
      album: 'Spaces',
      duration: 214,
      artwork: 'x',
      fileName: 'Nils Frahm - Spaces.mp3',
    };
    expect(metadataIssues(selfTitled)).not.toContain('roles');
  });

  it('notices a swap the file name proves', () => {
    const swapped = {
      title: 'Says',
      artist: 'Nils Frahm',
      album: 'Spaces',
      duration: 214,
      artwork: 'x',
      fileName: 'Nils Frahm - Says.mp3',
    };
    // The file name says artist first, and the tags say it the other way round.
    expect(metadataIssues({ ...swapped, title: 'Nils Frahm', artist: 'Says' })).toContain('roles');
    expect(
      describeIssues(metadataIssues({ ...swapped, title: 'Nils Frahm', artist: 'Says' })),
    ).toContain('look swapped');
    // In the right order it is simply a correct song.
    expect(metadataIssues(swapped)).not.toContain('roles');
  });

  it('says what a song needs without listing field names', () => {
    const track = { title: 'Says', artist: 'Nils Frahm', album: 'Spaces', duration: 0 };
    expect(describeIssues(metadataIssues(track))).toBe('Needs its length and a cover');
    expect(describeIssues(metadataIssues({ ...track, artwork: 'x', album: 'Unknown album' }))).toBe(
      'Needs the album and its length',
    );
  });
});
