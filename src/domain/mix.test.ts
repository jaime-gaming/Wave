import { describe, it, expect } from 'vitest';
import { mixCues, mixWindowReached } from './mix';
it('conservatively bounds silence cues without trimming quiet music', () => {
  const values = new Float32Array(200);
  values.fill(0.1, 20, 180);
  expect(mixCues({ step: 0.1, values }, 20)).toEqual({ start: 1.85, end: 18.2 });
  expect(mixCues({ step: 0.1, values: new Float32Array(200).fill(0.004) }, 20)).toEqual({
    start: 0,
    end: 20,
  });
  const long = new Float32Array(1000);
  long.fill(0.1, 100, 900);
  expect(mixCues({ step: 0.1, values: long }, 100)).toEqual({ start: 4, end: 96 });
});
it('keeps short, silent, missing or unsupported recordings unchanged', () => {
  for (const envelope of [undefined, { step: 0.1, values: new Float32Array(100) }])
    expect(mixCues(envelope, 10)).toEqual({ start: 0, end: 10 });
  expect(mixCues({ step: 0.1, values: Float32Array.from([0, 0, 0.5]) }, 5)).toEqual({
    start: 0,
    end: 5,
  });
});
it('selects a bounded pair-specific window automatically', async () => {
  const { automaticMixSeconds } = await import('./mix');
  expect(automaticMixSeconds(240, 200)).toBeGreaterThan(automaticMixSeconds(20, 20));
  expect(automaticMixSeconds(4, 8)).toBeLessThanOrEqual(2);
  expect(automaticMixSeconds(1000, 1000)).toBeLessThanOrEqual(8);
  expect(automaticMixSeconds(NaN, 20)).toBe(0);
});

describe('when a handover may start', () => {
  it('never begins before the final seconds of the file', () => {
    // A three minute song is not mixed at two minutes, whatever the analysis says.
    expect(mixWindowReached(120, 180, 8)).toBe(false);
    expect(mixWindowReached(160, 180, 8)).toBe(false);
    expect(mixWindowReached(170, 180, 8)).toBe(true);
  });

  it('keeps a short song whole too', () => {
    expect(mixWindowReached(3, 30, 4)).toBe(false);
    expect(mixWindowReached(20, 30, 4)).toBe(true);
  });

  it('refuses to judge a song with no known length', () => {
    expect(mixWindowReached(10, Number.NaN, 8)).toBe(false);
    expect(mixWindowReached(10, 0, 8)).toBe(false);
  });
});
