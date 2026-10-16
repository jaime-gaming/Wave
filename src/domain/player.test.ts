import { describe, expect, it } from 'vitest';
import { initialPlayerState, playerReducer, shuffleQueue, type PlayerState } from './player';

const loaded = (): PlayerState =>
  playerReducer(initialPlayerState, { type: 'load', queue: ['a', 'b', 'c'], id: 'a' });
describe('player queue', () => {
  it('does not play an empty queue or load an invalid selection', () => {
    expect(playerReducer(initialPlayerState, { type: 'toggle' })).toEqual(initialPlayerState);
    expect(playerReducer(initialPlayerState, { type: 'load', queue: ['a'], id: 'b' })).toEqual(
      initialPlayerState,
    );
  });
  it('deduplicates a loaded queue and selects the requested entry', () => {
    expect(
      playerReducer(initialPlayerState, { type: 'load', queue: ['a', 'b', 'b'], id: 'b' }),
    ).toMatchObject({ queue: ['a', 'b'], index: 1, playing: true });
  });
  it('advances without mutating the previous state', () => {
    const state = loaded();
    expect(playerReducer(state, { type: 'next' }).index).toBe(1);
    expect(state.index).toBe(0);
    expect(state.queue).toEqual(['a', 'b', 'c']);
  });
  it('stops at the end with repeat off', () => {
    expect(playerReducer({ ...loaded(), index: 2 }, { type: 'ended' })).toMatchObject({
      index: 2,
      playing: false,
    });
  });
  it('wraps forwards and backwards with repeat all', () => {
    expect(playerReducer({ ...loaded(), index: 2, repeat: 'all' }, { type: 'ended' }).index).toBe(
      0,
    );
    expect(playerReducer({ ...loaded(), repeat: 'all' }, { type: 'previous' }).index).toBe(2);
  });
  it('retains repeat-one on ended but respects manual next', () => {
    const state = { ...loaded(), repeat: 'one' as const };
    expect(playerReducer(state, { type: 'ended' })).toEqual(state);
    expect(playerReducer(state, { type: 'next' }).index).toBe(1);
  });
  it('cycles repeat modes', () => {
    let state = loaded();
    for (const repeat of ['all', 'one', 'off']) {
      state = playerReducer(state, { type: 'repeat' });
      expect(state.repeat).toBe(repeat);
    }
  });
  it('preserves current ID when shuffled and rejects invalid permutations', () => {
    const state = { ...loaded(), index: 1 };
    const result = playerReducer(state, { type: 'shuffle', queue: ['b', 'c', 'a'] });
    expect(result.queue[result.index]).toBe('b');
    expect(result.shuffled).toBe(true);
    expect(playerReducer(state, { type: 'shuffle', queue: ['a', 'a', 'b'] })).toEqual(state);
    expect(playerReducer(state, { type: 'shuffle', queue: ['a', 'b', 'z'] })).toEqual(state);
  });
  it('keeps the current entry while removing an earlier entry', () => {
    const result = playerReducer({ ...loaded(), index: 2 }, { type: 'remove', id: 'a' });
    expect(result.queue[result.index]).toBe('c');
  });
  it('selects the next entry when removing the current one', () => {
    const result = playerReducer({ ...loaded(), index: 1 }, { type: 'remove', id: 'b' });
    expect(result.queue[result.index]).toBe('c');
  });
  it('handles removal of the last and only entries', () => {
    const result = playerReducer({ ...loaded(), index: 2 }, { type: 'remove', id: 'c' });
    expect(result.queue[result.index]).toBe('b');
    const one = playerReducer(initialPlayerState, { type: 'load', queue: ['a'], id: 'a' });
    expect(playerReducer(one, { type: 'remove', id: 'a' })).toEqual(initialPlayerState);
    expect(playerReducer(one, { type: 'remove', id: 'missing' })).toEqual(one);
  });
  it('returns a shuffled copy with current track first', () => {
    const queue = ['a', 'b', 'c', 'd'];
    const result = shuffleQueue(queue, 'b', () => 0);
    expect(result[0]).toBe('b');
    expect(new Set(result)).toEqual(new Set(queue));
    expect(queue).toEqual(['a', 'b', 'c', 'd']);
  });
});

it('reorders the queue without changing selected identity or play intent, and commits the new shuffle baseline', () => {
  const state = { ...loaded(), index: 1, shuffled: true };
  for (const playing of [true, false]) {
    const next = playerReducer({ ...state, playing }, { type: 'reorder', ids: ['c', 'a', 'b'] });
    expect(next).toMatchObject({
      queue: ['c', 'a', 'b'],
      orderedQueue: ['c', 'a', 'b'],
      index: 2,
      shuffled: false,
      playing,
    });
  }
  for (const ids of [
    ['a', 'b'],
    ['a', 'a', 'c'],
    ['a', 'b', 'z'],
  ])
    expect(playerReducer(state, { type: 'reorder', ids })).toBe(state);
  expect(state.queue).toEqual(['a', 'b', 'c']);
});
it('continues at the boundary without duplicating current IDs and respects repeat/manual pause', () => {
  const last = { ...loaded(), index: 2 };
  expect(playerReducer(last, { type: 'continue', ids: ['c', 'a', 'b', 'b'] })).toMatchObject({
    queue: ['c', 'a', 'b'],
    index: 0,
    playing: true,
  });
  expect(playerReducer(last, { type: 'continue', ids: ['a'], advance: true }).index).toBe(1);
  for (const state of [
    { ...last, repeat: 'all' as const },
    { ...last, playing: false },
    { ...last, index: 0 },
  ])
    expect(playerReducer(state, { type: 'continue', ids: ['a'] })).toBe(state);
});
