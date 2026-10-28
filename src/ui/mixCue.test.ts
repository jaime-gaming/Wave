import { describe, expect, it, vi } from 'vitest';
import { cueForTrack, cueTiming, MIX_CUE_SECONDS, MixCueStore } from './mixCue';
import { makeTrack } from '../test/fixtures';

const cue = (seconds: number, progress = 0.5) => ({
  from: makeTrack(),
  to: makeTrack({ id: 'next', title: 'Next' }),
  seconds,
  progress,
});

describe('the lead-in to a mix', () => {
  it('tells its listeners once when the cue appears and once when it leaves', () => {
    const store = new MixCueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(cue(20));
    store.clear();
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get()).toBeNull();
  });

  it('announces a new second, and a visible change, but not every frame', () => {
    const store = new MixCueStore();
    store.set(cue(20, 0.1));
    const listener = vi.fn();
    store.subscribe(listener);
    // A fraction this small is invisible: the picture stays where it is.
    store.set(cue(20, 0.11));
    expect(listener).not.toHaveBeenCalled();
    // Two per cent is enough to redraw the split.
    store.set(cue(20, 0.42));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()?.progress).toBe(0.42);
    store.set(cue(19, 0.5));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('starts a new cue when the song it is leaving changes', () => {
    const store = new MixCueStore();
    store.set(cue(20));
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ ...cue(20), from: makeTrack({ id: 'other' }) });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()?.from.id).toBe('other');
  });
});

describe('when the word appears', () => {
  it('starts a few seconds before the blend, not before the end of the file', () => {
    // A twenty-second blend: the cue belongs at 28 s from the end, so it is on
    // screen for its whole lead-in *before* the two songs meet.
    expect(cueTiming(28, 20)).toEqual({ seconds: MIX_CUE_SECONDS, progress: 0 });
    expect(cueTiming(29, 20)).toBeNull();
    expect(cueTiming(24, 20)?.progress).toBeCloseTo(0.5, 5);
    // The blend has begun: pinned at the end of the lead-in, not gone.
    expect(cueTiming(20, 20)).toEqual({ seconds: 1, progress: 1 });
    expect(cueTiming(6, 20)).toEqual({ seconds: 1, progress: 1 });
  });

  it('says nothing without a clock or a window', () => {
    expect(cueTiming(Number.POSITIVE_INFINITY, 20)).toBeNull();
    expect(cueTiming(10, 0)).toBeNull();
    expect(cueTiming(0, 20)).toBeNull();
    expect(cueTiming(10, Number.NaN)).toBeNull();
  });

  it('belongs to either of the two songs, so the blend cannot hide it', () => {
    const value = cue(4, 1);
    expect(cueForTrack(value, value.from.id)).toBe(value);
    // During the blend the bar already shows the incoming song.
    expect(cueForTrack(value, value.to.id)).toBe(value);
    expect(cueForTrack(value, 'something-else')).toBeNull();
    expect(cueForTrack(null, value.from.id)).toBeNull();
    expect(cueForTrack(value, undefined)).toBeNull();
  });
});
