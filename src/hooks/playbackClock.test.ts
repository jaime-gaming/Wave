import { afterEach, expect, it, vi } from 'vitest';
import { PlaybackClock } from './playbackClock';

afterEach(() => {
  vi.useRealTimers();
});

it('notifies subscribers at most ten times a second, delivering the last position', () => {
  vi.useFakeTimers();
  const clock = new PlaybackClock();
  const seen = vi.fn();
  clock.subscribe(seen);
  // A 20 Hz source must not become 20 renders.
  for (let i = 1; i <= 4; i++) clock.set(i * 0.05);
  expect(seen).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(seen).toHaveBeenCalledTimes(1);
  expect(clock.get()).toBe(0.2);
});

it('delivers a seek straight away', () => {
  const clock = new PlaybackClock();
  const seen = vi.fn();
  clock.subscribe(seen);
  clock.set(42, true);
  expect(seen).toHaveBeenCalledTimes(1);
  expect(clock.get()).toBe(42);
});

it('ignores an unchanged or invalid position and can reset', () => {
  const clock = new PlaybackClock();
  const seen = vi.fn();
  clock.subscribe(seen);
  clock.set(0, true);
  expect(seen).not.toHaveBeenCalled();
  clock.set(Number.NaN, true);
  expect(clock.get()).toBe(0);
  clock.set(12, true);
  clock.reset();
  expect(clock.get()).toBe(0);
  expect(seen).toHaveBeenCalledTimes(2);
});

it('stops notifying after a subscriber leaves', () => {
  vi.useFakeTimers();
  const clock = new PlaybackClock();
  const seen = vi.fn();
  const stop = clock.subscribe(seen);
  stop();
  clock.set(3, true);
  vi.advanceTimersByTime(200);
  expect(seen).not.toHaveBeenCalled();
});
