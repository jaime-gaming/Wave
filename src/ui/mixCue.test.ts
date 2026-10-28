import { describe, expect, it, vi } from 'vitest';
import { MixCueStore } from './mixCue';
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
