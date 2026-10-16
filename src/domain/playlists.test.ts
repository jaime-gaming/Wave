import { describe, expect, it } from 'vitest';
import { applyPlaylistChange, validatePlaylist } from './playlists';
import type { Playlist } from './types';

const playlist = (): Playlist => ({
  id: 'mix',
  name: 'Mix',
  description: '',
  trackIds: ['a', 'b', 'c'],
  createdAt: 1,
  updatedAt: 1,
});
describe('playlist domain', () => {
  it('validates names and keeps unique ordered IDs', () => {
    expect(
      validatePlaylist({ ...playlist(), name: ' Mix ', trackIds: ['a', 'b', 'a'] }),
    ).toMatchObject({ name: 'Mix', trackIds: ['a', 'b'] });
    expect(() => validatePlaylist({ ...playlist(), name: ' ' })).toThrow();
    expect(() => validatePlaylist({ ...playlist(), description: 'x'.repeat(1001) })).toThrow();
  });
  it('adds and removes songs without mutating input', () => {
    const original = playlist();
    expect(applyPlaylistChange(original, { type: 'add', ids: ['c', 'd'] }).trackIds).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(applyPlaylistChange(original, { type: 'remove', id: 'b' }).trackIds).toEqual(['a', 'c']);
    expect(original.trackIds).toEqual(['a', 'b', 'c']);
  });
  it('moves songs while respecting both boundaries', () => {
    expect(
      applyPlaylistChange(playlist(), { type: 'move', id: 'b', direction: -1 }).trackIds,
    ).toEqual(['b', 'a', 'c']);
    expect(
      applyPlaylistChange(playlist(), { type: 'move', id: 'b', direction: 1 }).trackIds,
    ).toEqual(['a', 'c', 'b']);
    expect(
      applyPlaylistChange(playlist(), { type: 'move', id: 'a', direction: -1 }).trackIds,
    ).toEqual(['a', 'b', 'c']);
    expect(
      applyPlaylistChange(playlist(), { type: 'move', id: 'missing', direction: 1 }).trackIds,
    ).toEqual(['a', 'b', 'c']);
  });
});
