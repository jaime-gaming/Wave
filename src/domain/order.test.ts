import { it, expect } from 'vitest';
import { orderedTracks, isPermutation, moveId } from './order';
import { makeTrack } from '../test/fixtures';
import { playerReducer, initialPlayerState } from './player';
it('applies album order, removes stale IDs and appends newly added tracks by disc/track number', () => {
  const a = makeTrack({ id: 'a', trackNumber: 2 }),
    b = makeTrack({ id: 'b', trackNumber: 1 }),
    c = makeTrack({ id: 'c', discNumber: 2, trackNumber: 1 });
  expect(orderedTracks([c, a, b]).map((track) => track.id)).toEqual(['b', 'a', 'c']);
  expect(orderedTracks([c, a, b], ['missing', 'a', 'a']).map((track) => track.id)).toEqual([
    'a',
    'b',
    'c',
  ]);
});
it('validates complete permutations and handles accessible boundary moves', () => {
  expect(isPermutation(['b', 'a'], ['a', 'b'])).toBe(true);
  expect(isPermutation(['a', 'a'], ['a', 'b'])).toBe(false);
  expect(isPermutation(['a'], ['a', 'b'])).toBe(false);
  expect(moveId(['a', 'b'], 'a', 1)).toEqual(['b', 'a']);
  expect(moveId(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
});
it('appends unique queue IDs without changing play intent or the playing entry', () => {
  const playing = playerReducer(initialPlayerState, { type: 'load', queue: ['a'], id: 'a' });
  const shuffled = playerReducer(playing, { type: 'shuffle', queue: ['a'] });
  const added = playerReducer(shuffled, { type: 'enqueue', ids: ['b', 'a', 'b', 'c'] });
  expect(added.queue).toEqual(['a', 'b', 'c']);
  expect(added.orderedQueue).toEqual(['a', 'b', 'c']);
  expect(added.index).toBe(0);
  expect(added.playing).toBe(true);
  const empty = playerReducer(initialPlayerState, { type: 'enqueue', ids: ['b'] });
  expect(empty.index).toBe(0);
  expect(empty.playing).toBe(false);
});
it('jumping to a queued song preserves shuffle and the selected original order', () => {
  const loaded = playerReducer(initialPlayerState, { type: 'load', queue: ['a', 'b'], id: 'a' });
  const state = playerReducer(loaded, { type: 'shuffle', queue: ['b', 'a'] });
  const jump = playerReducer(state, { type: 'jump', id: 'b' });
  expect(jump.orderedQueue).toEqual(['a', 'b']);
  expect(jump.shuffled).toBe(true);
  expect(jump.index).toBe(0);
  expect(playerReducer(jump, { type: 'jump', id: 'absent' })).toBe(jump);
});
