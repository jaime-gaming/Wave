import { describe, expect, it } from 'vitest';
import {
  clampCrossfadeSeconds,
  CROSSFADE_DEFAULT_SECONDS,
  CROSSFADE_MAX_SECONDS,
  CROSSFADE_MIN_SECONDS,
  crossfadeGains,
  crossfadeProgress,
  planCrossfade,
  suggestCrossfadeSeconds,
} from './mixPlan';

describe('Apple Music style crossfade', () => {
  it('clamps the requested length to the allowed range', () => {
    expect(clampCrossfadeSeconds(6.3)).toBe(6.5);
    expect(clampCrossfadeSeconds(0)).toBe(CROSSFADE_MIN_SECONDS);
    expect(clampCrossfadeSeconds(99)).toBe(CROSSFADE_MAX_SECONDS);
    expect(clampCrossfadeSeconds(Number.NaN)).toBe(CROSSFADE_DEFAULT_SECONDS);
  });

  it('uses an equal-power curve that keeps total power constant', () => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const { outgoing, incoming } = crossfadeGains(progress);
      expect(outgoing ** 2 + incoming ** 2).toBeCloseTo(1, 5);
    }
    expect(crossfadeGains(0)).toEqual({ outgoing: 1, incoming: 0 });
    expect(crossfadeGains(1).incoming).toBeCloseTo(1, 6);
    expect(crossfadeGains(-3)).toEqual({ outgoing: 1, incoming: 0 });
    expect(crossfadeGains(Number.NaN)).toEqual({ outgoing: 1, incoming: 0 });
  });

  it('starts the overlap inside audible audio, not in trailing silence', () => {
    const plan = planCrossfade({
      outgoingDuration: 200,
      incomingDuration: 180,
      outgoingCues: { start: 2, end: 190 },
      incomingCues: { start: 1.5, end: 178 },
      requestedSeconds: 6,
    });
    expect(plan.seconds).toBe(6);
    expect(plan.startAt).toBe(184);
    expect(plan.cue).toBe(1.5);
  });

  it('shortens the overlap for short songs and refuses a useless fade', () => {
    const short = planCrossfade({ outgoingDuration: 5, incomingDuration: 4, requestedSeconds: 6 });
    expect(short.seconds).toBe(2);

    const tiny = planCrossfade({ outgoingDuration: 1.2, incomingDuration: 1, requestedSeconds: 6 });
    expect(tiny.seconds).toBe(0);
    expect(tiny.startAt).toBe(1.2);

    const invalid = planCrossfade({ outgoingDuration: Number.NaN, incomingDuration: 0 });
    expect(invalid.seconds).toBe(0);
  });

  it('never fades more than half of the incoming song', () => {
    const plan = planCrossfade({
      outgoingDuration: 300,
      incomingDuration: 8,
      requestedSeconds: 12,
    });
    expect(plan.seconds).toBe(4);
  });

  it('reports progress from the incoming clock', () => {
    expect(crossfadeProgress(2, 6, 2)).toBe(0);
    expect(crossfadeProgress(2, 6, 5)).toBe(0.5);
    expect(crossfadeProgress(2, 6, 9)).toBe(1);
    expect(crossfadeProgress(2, 0, 9)).toBe(1);
  });

  it('lengthens a quiet ending and shortens a loud one', () => {
    const quiet = { step: 0.1, values: new Float32Array(200).fill(0.01) };
    const loud = { step: 0.1, values: new Float32Array(200).fill(0.8) };
    expect(suggestCrossfadeSeconds(quiet, 20, 6)).toBeGreaterThan(6);
    expect(suggestCrossfadeSeconds(loud, 20, 6)).toBeLessThan(6);
    expect(suggestCrossfadeSeconds(undefined, 20, 6)).toBe(6);
    expect(suggestCrossfadeSeconds(quiet, 4, 6)).toBe(6);
    expect(suggestCrossfadeSeconds(quiet, 300, 12)).toBe(CROSSFADE_MAX_SECONDS);
  });
});
