import { expect, it } from 'vitest';
import { makeTrack } from '../test/fixtures';
import { cleanTitle, lookupMetadata, recordingMatch } from './lyricsMatch';
import { duplicateNames } from './duplicates';
it('cleans decoration and accents but preserves recording editions', () => {
  expect(cleanTitle('01 - Canción (Official Audio)')).toBe('Canción');
  const track = makeTrack({ title: 'Canción', artist: 'Beyoncé' });
  expect(
    recordingMatch({ trackName: 'Cancion', artistName: 'Beyonce', duration: 90 }, track),
  ).toMatchObject({ synchronized: true });
  expect(
    recordingMatch({ trackName: 'Canción (Live)', artistName: 'Beyoncé', duration: 90 }, track),
  ).toBeUndefined();
});
it('infers filename metadata only for a two-part artist-title name', () => {
  expect(
    lookupMetadata(makeTrack({ artist: 'Unknown artist', fileName: 'Beyoncé - Halo.mp3' })),
  ).toEqual({ artist: 'Beyoncé', title: 'Halo' });
  expect(lookupMetadata(makeTrack({ artist: 'Unknown artist', fileName: 'Halo.mp3' })).artist).toBe(
    '',
  );
});
it('permits plain text for small duration differences but rejects wrong recordings', () => {
  const candidate = { trackName: 'Signal', artistName: 'Wave Tests', duration: 95 };
  expect(recordingMatch(candidate, makeTrack())).toMatchObject({ synchronized: false });
  expect(recordingMatch({ ...candidate, duration: 120 }, makeTrack())).toBeUndefined();
});
it('same-name review includes artist identity and never modifies tracks', () => {
  const tracks = [
    makeTrack(),
    makeTrack({ id: 'edition', album: 'Live' }),
    makeTrack({ id: 'different', artist: 'Other artist' }),
  ];
  expect(duplicateNames(tracks).map((group) => group.map((track) => track.id))).toEqual([
    ['signal', 'edition'],
  ]);
  expect(tracks).toHaveLength(3);
});
it('removes an artist prefix only when it matches metadata, and keeps live/remix editions distinct', () => {
  expect(lookupMetadata(makeTrack({ title: 'Wave Tests - Signal - Remastered 2020' }))).toEqual({
    title: 'Signal',
    artist: 'Wave Tests',
  });
  expect(lookupMetadata(makeTrack({ title: 'Different Artist - Signal' })).title).toBe(
    'Different Artist - Signal',
  );
  expect(
    recordingMatch(
      { trackName: 'Signal', artistName: 'Wave Tests', duration: 90 },
      makeTrack({ title: 'Signal (Remix)' }),
    ),
  ).toBeUndefined();
  expect(
    recordingMatch(
      { trackName: 'Signal', artistName: 'Wave Tests', duration: 90 },
      makeTrack({ duration: 0 }),
    ),
  ).toMatchObject({ synchronized: false });
});
it('matches parenthesized featured credits without discarding real group names', () => {
  expect(lookupMetadata(makeTrack({ artist: 'Wave Tests (feat. Guest)' })).artist).toBe(
    'Wave Tests',
  );
  expect(
    recordingMatch(
      { trackName: 'Signal', artistName: 'Wave Tests (ft. Guest)', duration: 90 },
      makeTrack(),
    ),
  ).toBeDefined();
  expect(
    recordingMatch(
      { trackName: 'Signal', artistName: 'Earth Wind & Fire', duration: 90 },
      makeTrack({ artist: 'Earth Wind' }),
    ),
  ).toBeUndefined();
});
it('recognizes reissues while keeping conflicting performance albums separate', () => {
  const track = makeTrack();
  const record = { trackName: track.title, artistName: track.artist, duration: 90 };
  expect(
    recordingMatch({ ...record, albumName: 'First light (Deluxe Edition)' }, track),
  ).toMatchObject({ album: 'match', synchronized: true });
  expect(recordingMatch({ ...record, albumName: 'A compilation' }, track)).toMatchObject({
    album: 'conflict',
    synchronized: false,
  });
  expect(recordingMatch({ ...record, albumName: 'Live at Wembley' }, track)).toBeUndefined();
  expect(
    recordingMatch(
      { ...record, albumName: 'First light' },
      makeTrack({ album: 'Live at Wembley' }),
    ),
  ).toBeUndefined();
  expect(recordingMatch({ ...record, albumName: '' }, track)).toMatchObject({ album: 'unknown' });
});
it('matches full collaboration credits and common video labels without broadening recording editions', () => {
  const track = makeTrack({
    title: 'Wave Tests — Signal (Official Lyric Video 4K)',
    artist: 'Wave Tests',
  });
  expect(
    recordingMatch({ trackName: 'Signal', artistName: 'Wave Tests', duration: 90 }, track),
  ).toBeTruthy();
  const duet = makeTrack({ artist: 'Wave Tests & Other' });
  expect(
    recordingMatch(
      { trackName: 'Signal', artistName: 'Wave Tests feat. Other', duration: 90 },
      duet,
    ),
  ).toBeTruthy();
  expect(
    recordingMatch({ trackName: 'Signal', artistName: 'Wave Tests', duration: 90 }, duet),
  ).toBeUndefined();
  expect(
    recordingMatch({ trackName: 'Signal (Live)', artistName: 'Wave Tests', duration: 90 }, track),
  ).toBeUndefined();
});
