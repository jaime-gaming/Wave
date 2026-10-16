import { expect, it } from 'vitest';
import { readPlaybackSession, writePlaybackSession, PLAYBACK_SESSION_KEY } from './playbackSession';
import { initialPlayerState } from './player';
it('restores queue, selection, levels of ordering and positions but never autoplays', () => {
  writePlaybackSession(
    {
      ...initialPlayerState,
      queue: ['b', 'a'],
      orderedQueue: ['a', 'b'],
      index: 0,
      playing: true,
      repeat: 'all',
      shuffled: true,
    },
    { a: 7.5, b: 23.125 },
  );
  expect(readPlaybackSession()).toMatchObject({
    state: {
      queue: ['b', 'a'],
      orderedQueue: ['a', 'b'],
      index: 0,
      playing: false,
      repeat: 'all',
      shuffled: true,
    },
    positions: { b: 23.125, a: 7.5 },
  });
});
it('rejects malformed sessions and unsafe positions and deduplicates queue IDs', () => {
  localStorage.setItem(PLAYBACK_SESSION_KEY, 'broken');
  expect(readPlaybackSession().state.queue).toEqual([]);
  localStorage.setItem(
    PLAYBACK_SESSION_KEY,
    JSON.stringify({
      version: 1,
      queue: ['a', 'a', null, 3],
      currentId: 'a',
      positions: { a: 4, b: -1, c: '2' },
    }),
  );
  expect(readPlaybackSession().state.queue).toEqual(['a']);
  expect(readPlaybackSession().positions).toEqual({ a: 4 });
});
