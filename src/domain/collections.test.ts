import { describe, expect, it } from 'vitest';
import { makeTrack } from '../test/fixtures';
import {
  albumKey,
  artistCredits,
  collectAlbums,
  collectArtists,
  initials,
  primaryArtist,
} from './collections';

describe('local collection grouping', () => {
  it('keeps same-named albums by different artists separate', () => {
    const tracks = [makeTrack({ id: 'one', artist: 'A' }), makeTrack({ id: 'two', artist: 'B' })];
    expect(collectAlbums(tracks)).toHaveLength(2);
    expect(albumKey(tracks[0])).not.toBe(albumKey(tracks[1]));
  });
  it('chooses available embedded artwork and records most recent import without mutating tracks', () => {
    const tracks = [
      makeTrack({ id: 'one', addedAt: 1 }),
      makeTrack({ id: 'two', addedAt: 3, artwork: 'local-cover' }),
    ];
    const album = collectAlbums(tracks)[0];
    expect(album.cover.id).toBe('two');
    expect(album.addedAt).toBe(3);
    expect(album.tracks).toHaveLength(2);
    expect(tracks[0].artwork).toBeUndefined();
  });
  it('derives artist counts and only sums known finite durations', () => {
    const tracks = [
      makeTrack({ artist: 'B', duration: 20 }),
      makeTrack({ id: 'two', artist: 'B', album: 'Other', duration: NaN }),
      makeTrack({ id: 'three', artist: 'A', duration: Infinity }),
    ];
    const artists = collectArtists(tracks);
    expect(artists.map((artist) => artist.name)).toEqual(['A', 'B']);
    expect(artists[1].duration).toBe(20);
    expect(artists[1].albums).toHaveLength(2);
    expect(artists[0].duration).toBe(0);
  });
  it('renders local initials without assuming a portrait exists', () => {
    expect(initials('  Jaime Gaming  ')).toBe('JG');
    expect(initials('Álvaro')).toBe('Á');
    expect(initials('')).toBe('');
  });
});

describe('an artist tag that names two acts', () => {
  it('gives each of them a profile', () => {
    expect(artistCredits('Nils Frahm, Ólafur Arnalds')).toEqual(['Nils Frahm', 'Ólafur Arnalds']);
    expect(artistCredits('A; B')).toEqual(['A', 'B']);
  });

  it('lets the song appear under both', () => {
    const duet = makeTrack({ id: 'duet', artist: 'A, B', title: 'Together' });
    const solo = makeTrack({ id: 'solo', artist: 'B', title: 'Alone' });
    const artists = collectArtists([duet, solo]);
    expect(artists.map((artist) => artist.name)).toEqual(['A', 'B']);
    expect(artists[0].tracks.map((track) => track.id)).toEqual(['duet']);
    expect(artists[1].tracks.map((track) => track.id)).toEqual(['duet', 'solo']);
  });

  it('leaves the names that really contain a comma alone', () => {
    for (const name of ['Earth, Wind & Fire', 'Tyler, the Creator', 'Crosby, Stills & Nash']) {
      expect(artistCredits(name)).toEqual([name]);
    }
  });

  it('keeps a collaboration phrasing as one credit', () => {
    expect(artistCredits('Nils Frahm feat. Ólafur Arnalds')).toEqual([
      'Nils Frahm feat. Ólafur Arnalds',
    ]);
    expect(primaryArtist('A, B')).toBe('A');
    expect(primaryArtist('Solo')).toBe('Solo');
  });
});
