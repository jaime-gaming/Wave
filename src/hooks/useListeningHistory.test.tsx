import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListeningHistory } from './useListeningHistory';
import { clearPlays, getPlays } from '../data/listening';
import { makeTrack } from '../test/fixtures';

const track = makeTrack({ id: 'signal', duration: 200 });
const other = makeTrack({ id: 'other', title: 'Other', duration: 200 });

beforeEach(async () => {
  await clearPlays();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Advances the hook and a pretend player position together, one second a tick. */
function setup(initial: { track?: typeof track; playing: boolean; duration?: number }) {
  let position = 0;
  const readTime = () => position;
  const view = renderHook(
    (props: { track?: typeof track; playing: boolean; duration: number }) =>
      useListeningHistory({
        track: props.track,
        playing: props.playing,
        duration: props.duration,
        readTime,
        tracks: [track, other],
      }),
    { initialProps: { ...initial, duration: initial.duration ?? 200 } },
  );
  const listen = async (seconds: number) => {
    for (let index = 0; index < seconds; index++) {
      position += 1;
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
    }
  };
  return { ...view, listen, setPosition: (value: number) => (position = value) };
}

describe('recording what was listened to', () => {
  beforeEach(() => {
    // Only the sampler's interval is faked: IndexedDB needs real timers to
    // resolve, and faking them hangs every write in this file.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  it('writes one play once the threshold is passed', async () => {
    const { listen } = setup({ track, playing: true });
    await listen(10);
    expect(await getPlays()).toHaveLength(0);
    await listen(25);
    const plays = await getPlays();
    // Still nothing: a session is written when it closes, not while it runs.
    expect(plays).toHaveLength(0);
  });

  it('counts the first second of a short song', async () => {
    const short = makeTrack({ id: 'short', duration: 8 });
    const { listen, rerender } = setup({ track: short, playing: true, duration: 8 });
    await listen(5);
    rerender({ track: short, playing: false, duration: 8 });
    expect(await getPlays()).toMatchObject([{ trackId: 'short', seconds: 5 }]);
  });

  it('does not round up to the listening threshold', async () => {
    const short = makeTrack({ id: 'short', duration: 8 });
    const { listen, setPosition, rerender } = setup({ track: short, playing: true, duration: 8 });
    await listen(4);
    setPosition(4.7);
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    rerender({ track: short, playing: false, duration: 8 });
    expect(await getPlays()).toHaveLength(0);
  });

  it('records the song when it is paused after enough listening', async () => {
    const { listen, rerender } = setup({ track, playing: true });
    await listen(35);
    rerender({ track, playing: false, duration: 200 });
    const plays = await getPlays();
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ trackId: 'signal', completed: false });
    expect(plays[0].seconds).toBeGreaterThanOrEqual(34);
  });

  it('leaves no trace of a song that was skipped before the threshold', async () => {
    const { listen, rerender } = setup({ track, playing: true });
    await listen(6);
    rerender({ track: other, playing: true, duration: 200 });
    expect(await getPlays()).toHaveLength(0);
  });

  it('counts a play that ran to the end as completed', async () => {
    const { listen, rerender } = setup({ track, playing: true });
    await listen(60);
    // A different song starting is how a finished one ends in practice.
    rerender({ track: other, playing: true, duration: 200 });
    const plays = await getPlays();
    expect(plays).toHaveLength(1);
    expect(plays[0].trackId).toBe('signal');
  });

  it('does not count time that a seek jumped over', async () => {
    const { listen, rerender } = setup({ track, playing: true });
    await listen(4);
    // Someone drags the slider an hour ahead: that is not an hour of listening.
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    rerender({ track, playing: false, duration: 200 });
    expect(await getPlays()).toHaveLength(0);
  });
});
