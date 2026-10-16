import { describe, expect, it } from 'vitest';
import { filterTracks, formatTime } from './types';
import { makeTrack } from '../test/fixtures';

describe('library utilities', () => {
  it('formats durations and handles invalid values', () => {
    expect(formatTime(90.9)).toBe('1:30');
    expect(formatTime(3601)).toBe('60:01');
    for (const value of [-1, NaN, Infinity, 0]) expect(formatTime(value)).toBe('0:00');
  });
  it('searches title, artist, and album with case-insensitive trimmed queries', () => {
    const tracks = [
      makeTrack(),
      makeTrack({ id: 'other', title: 'Night', artist: 'Different', album: 'Elsewhere' }),
    ];
    for (const query of [' SiGNAl ', 'Wave Tests', 'first light'])
      expect(filterTracks(tracks, query)).toEqual([tracks[0]]);
    expect(filterTracks(tracks, '')).toEqual(tracks);
    expect(filterTracks(tracks, 'missing')).toEqual([]);
    expect(tracks).toHaveLength(2);
  });
});
