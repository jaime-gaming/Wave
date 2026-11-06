import { describe, expect, it } from 'vitest';
import {
  clearRecentSearches,
  loadRecentSearches,
  rankMatch,
  rankNames,
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

describe('closer answers first', () => {
  const shelf = [
    makeTrack({ id: 'deluxe', title: 'Nightcall (Deluxe)', artist: 'Kavinsky' }),
    makeTrack({ id: 'plain', title: 'Nightcall', artist: 'Kavinsky' }),
    makeTrack({ id: 'word', title: 'The Nightingale', artist: 'Someone' }),
    makeTrack({ id: 'artist', title: 'Odyssey', artist: 'Nightcall' }),
    makeTrack({ id: 'inner', title: 'Goodnight Moon', artist: 'Ambrosia' }),
  ];

  it('puts the same title with nothing added above its deluxe edition', () => {
    expect(
      rankTracks(shelf, 'nightcall')
        .map((track) => track.id)
        .slice(0, 2),
    ).toEqual(['plain', 'deluxe']);
  });

  it('separates a title word from the same letters buried in the middle of a word', () => {
    expect(rankMatch(shelf[2], 'night')).toBe('word');
    expect(rankMatch(shelf[4], 'night')).toBe('letters');
    const order = rankTracks(shelf, 'night').map((track) => track.id);
    expect(order.indexOf('word')).toBeLessThan(order.indexOf('inner'));
  });

  it('finds a song by its artist even when the title has none of the words', () => {
    // The title is an exact word match, the artist match comes after it, and a
    // song whose title only contains the letters comes last of the three.
    expect(rankMatch(shelf[0], 'nightcall')).toBe('prefix');
    expect(rankMatch(shelf[3], 'nightcall')).toBe('artist');
    expect(rankTracks(shelf, 'nightcall').map((track) => track.id)).toEqual([
      'plain',
      'deluxe',
      'artist',
    ]);
  });

  it('matches the words of a query in any order at the start of words', () => {
    const track = makeTrack({ id: 'c', title: 'Midnight City', artist: 'M83' });
    expect(rankMatch(track, 'city mid')).toBe('word');
  });
});

describe('ranking names', () => {
  const names = ['Nightcall', 'Nightcall (Deluxe)', 'Midnight City', 'Nights'];

  it('answers a typed name with that name before a longer one that starts with it', () => {
    expect(rankNames(names, 'night', (name) => name)).toEqual([
      'Nights',
      'Nightcall',
      'Nightcall (Deluxe)',
      'Midnight City',
    ]);
  });

  it('keeps every match of an empty query, and drops what does not match at all', () => {
    expect(rankNames(names, '  ', (name) => name)).toEqual(names);
    expect(rankNames(names, 'zzz', (name) => name)).toEqual([]);
    expect(rankNames(names, 'midnight', (name) => name)).toEqual(['Midnight City']);
  });
});

describe('a query with a letter in the wrong place', () => {
  it('still finds the song, below everything spelled correctly', () => {
    expect(rankMatch(library[1], 'nightclal')).toBe('near');
    expect(rankMatch(library[2], 'midngiht city')).toBe('near');
    expect(rankTracks(library, 'nightclal').map((track) => track.id)[0]).toBe('b');
    // A correctly spelled query never needs the tolerance, so it keeps its rank.
    expect(rankMatch(library[1], 'nightcall')).toBe('exact');
    expect(rankMatch(library[1], 'night')).toBe('prefix');
  });

  it('does not turn noise into results', () => {
    expect(rankMatch(library[0], 'qqqq')).toBeNull();
    expect(rankTracks(library, 'zzzz')).toEqual([]);
    const names = ['Midnight City', 'Nightcall', 'Tonight'];
    expect(rankNames(names, 'midnigth', (name) => name)).toEqual(['Midnight City']);
  });
});

it('searches local genre/year metadata and invalidates its index on immutable edits', () => {
  const track = makeTrack({ title: 'Signal', genres: ['Neo Soul'], year: 2001 });
  expect(rankTracks([track], 'soul 2001')).toEqual([track]);
  const edited = { ...track, title: 'New title', genres: ['Jazz'], year: 2020 };
  expect(rankTracks([edited], 'soul 2001')).toEqual([]);
  expect(rankTracks([edited], 'jazz 2020')).toEqual([edited]);
});
it('uses stable ranking with bounded, fractional and invalid limits', () => {
  expect(rankTracks(library, '', 2)).toEqual(library.slice(0, 2));
  expect(rankTracks(library, 'night', -1)).toEqual([]);
  expect(rankTracks(library, 'night', NaN)).toEqual([]);
  expect(rankTracks(library, 'night', 1.8)).toHaveLength(1);
});
