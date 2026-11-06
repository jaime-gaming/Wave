import { expect, it } from 'vitest';
import {
  inferFileMetadata,
  rolesSwapped,
  matchesSearch,
  splitInlineArtist,
  stripLeadingNumber,
} from './musicIdentity';
import { cleanTitle, recordingMatch } from './lyricsMatch';
import { makeTrack } from '../test/fixtures';
it('infers a conservative filename identity across track prefixes and spaced dash styles', () => {
  expect(inferFileMetadata('01 - Beyoncé — Déjà_Vu.mp3')).toEqual({
    artist: 'Beyoncé',
    title: 'Déjà Vu',
  });
  expect(inferFileMetadata('1.02. Artist – Song (Live).flac')).toEqual({
    artist: 'Artist',
    title: 'Song (Live)',
  });
  expect(inferFileMetadata('Artist - Album - Song.mp3')).toEqual({
    title: 'Artist - Album - Song',
  });
  expect(inferFileMetadata('AC-DC-Thunderstruck.wav')).toEqual({ title: 'AC-DC-Thunderstruck' });
  expect(inferFileMetadata('1975 - Somebody Else.wav')).toEqual({
    artist: '1975',
    title: 'Somebody Else',
  });
});
it('retains genuine numeric titles and edition distinctions during lyric lookup', () => {
  expect(cleanTitle('7 Rings')).toBe('7 Rings');
  expect(cleanTitle('2.0')).toBe('2.0');
  expect(cleanTitle('1-800-LOVE')).toBe('1-800-LOVE');
  expect(cleanTitle('99 Luftballons')).toBe('99 Luftballons');
  expect(
    recordingMatch(
      { trackName: 'Rings', artistName: 'Wave Tests', duration: 90 },
      makeTrack({ title: '7 Rings' }),
    ),
  ).toBeUndefined();
  for (const edition of ['Acoustic', 'Live', 'Sped Up', 'Instrumental', 'Remix'])
    expect(
      recordingMatch(
        { trackName: 'Signal', artistName: 'Wave Tests', duration: 90 },
        makeTrack({ title: `Signal (${edition})` }),
      ),
    ).toBeUndefined();
  expect(cleanTitle('Signal (feat. Guest) (Official Audio)')).toBe('Signal');
});
it('matches words in any order without accents while preserving non-Latin scripts', () => {
  expect(matchesSearch('Beyoncé · Déjà Vu · B’Day', 'vu beyonce deja')).toBe(true);
  expect(matchesSearch('東京 夕方', '夕方 東京')).toBe(true);
  expect(matchesSearch('Signal Wave Tests', 'tests missing')).toBe(false);
  expect(matchesSearch('Anything', '   ')).toBe(true);
});
it('recognizes an underscore-delimited artist-title filename without guessing bare hyphens', () => {
  expect(inferFileMetadata('01_Wave_Tests_-_Signal.wav')).toEqual({
    artist: 'Wave Tests',
    title: 'Signal',
  });
  expect(inferFileMetadata('Signal-Part-Two.wav')).toEqual({ title: 'Signal-Part-Two' });
});

it('lifts the artist out of a title that holds the whole line', () => {
  expect(splitInlineArtist('Nils Frahm - Says')).toEqual({ artist: 'Nils Frahm', title: 'Says' });
  expect(splitInlineArtist('01 - Nils Frahm - Says')).toEqual({
    artist: 'Nils Frahm',
    title: 'Says',
  });
  // Not enough evidence to split: a number, a long left side, or brackets.
  expect(splitInlineArtist('1975')).toBeNull();
  expect(splitInlineArtist('12 - Says')).toBeNull();
  expect(splitInlineArtist('Song (Live) - Again')).toBeNull();
  expect(splitInlineArtist('Artist - Album - Song')).toBeNull();
});

it('drops a zero-padded album position but keeps real numbers', () => {
  expect(stripLeadingNumber('01 - Song')).toBe('Song');
  expect(stripLeadingNumber('07 Song')).toBe('Song');
  expect(stripLeadingNumber('1975')).toBe('1975');
  expect(stripLeadingNumber('99 Luftballons')).toBe('99 Luftballons');
  expect(stripLeadingNumber('7 Rings')).toBe('7 Rings');
});

it('detects reversed roles across accents, punctuation and upload labels without erasing versions', () => {
  expect(
    rolesSwapped({
      title: 'Beyonce',
      artist: 'Deja Vu (Official Video)',
      fileName: 'Beyoncé - Déjà Vu.mp3',
    }),
  ).toBe(true);
  expect(
    rolesSwapped({
      title: 'AC/DC',
      artist: 'Back In Black',
      fileName: 'AC_DC - Back in Black.flac',
    }),
  ).toBe(true);
  expect(
    rolesSwapped({ title: 'Artist', artist: 'Song (Live)', fileName: 'Artist - Song.mp3' }),
  ).toBe(false);
  expect(rolesSwapped({ title: 'Artist', artist: 'Artist', fileName: 'Artist - Artist.mp3' })).toBe(
    false,
  );
});
