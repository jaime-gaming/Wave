import { describe, expect, it } from 'vitest';
import {
  clearRecentSearches,
  loadRecentSearches,
  rankMatch,
  rankTracks,
  rememberSearch,
} from './searchRank';
import { makeTrack } from '../test/fixtures';

const library = [
  makeTrack({ id: 'a', title: 'Tonight', artist: 'Other', album: 'Night' }),
  makeTrack({ id: 'b', title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun' }),
  makeTrack({ id: 'c', title: 'Midnight City', artist: 'M83', album: 'Hurry Up' }),
  makeTrack({ id: 'd', title: 'Call Me', artist: 'Blondie', album: 'Greatest' }),
];

describe('search ranking', () => {
  it('puts the song you meant above a song that merely contains the letters', () => {
    const result = rankTracks(library, 'night');
    expect(result.map((track) => track.id)[0]).toBe('b');
    expect(result.map((track) => track.id)).toContain('a');
  });

  it('prefers a title that starts with the query over one that starts with the artist', () => {
    expect(rankMatch(library[1], 'nightcall')).toBe('exact');
    expect(rankMatch(library[1], 'night')).toBe('prefix');
    expect(rankMatch(library[1], 'kavinsky')).toBe('artist');
    expect(rankMatch(library[1], 'outrun')).toBe('album');
    expect(rankMatch(library[1], 'label')).toBeNull();
  });

  it('ignores accents and word order, and keeps library order for equal matches', () => {
    expect(rankTracks(library, 'midnight').map((track) => track.id)).toEqual(['c']);
    expect(rankTracks(library, 'M83').map((track) => track.id)).toEqual(['c']);
    // Both are word matches only, so the library order survives untouched.
    const tied = rankTracks(
      [
        makeTrack({ id: 'x', title: 'Golden Hour', artist: 'A' }),
        makeTrack({ id: 'y', title: 'Silver Hour', artist: 'B' }),
      ],
      'hour',
    );
    expect(tied.map((track) => track.id)).toEqual(['x', 'y']);
  });

  it('respects a limit so a live search stays cheap', () => {
    expect(rankTracks(library, 'i', 2)).toHaveLength(2);
    expect(rankTracks(library, '')).toHaveLength(4);
  });
});

describe('recent searches', () => {
  const store = () => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    } as unknown as Storage;
  };

  it('keeps the last five, newest first, without duplicates or noise', () => {
    const local = store();
    for (const term of ['one', 'two', 'three', 'four', 'five', 'six']) rememberSearch(term, local);
    rememberSearch('three', local);
    rememberSearch('x', local);
    expect(loadRecentSearches(local)).toEqual(['three', 'six', 'five', 'four', 'two']);
    clearRecentSearches(local);
    expect(loadRecentSearches(local)).toEqual([]);
  });

  it('treats a missing or broken store as an empty list', () => {
    expect(loadRecentSearches(null)).toEqual([]);
    const broken = {
      getItem: () => 'not json',
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    expect(loadRecentSearches(broken)).toEqual([]);
    // A store that refuses the write still answers for this session.
    expect(rememberSearch('anything', broken)).toEqual(['anything']);
  });
});
