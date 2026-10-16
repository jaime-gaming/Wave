import { it, expect } from 'vitest';
import { mixCues, mixGains } from './mix';
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
it('uses a staged monotonic handover with continuous complementary power', () => {
  let previous = 0;
  for (let i = 0; i <= 1000; i++) {
    const gains = mixGains(i / 1000, true);
    expect(Math.hypot(gains.incoming, gains.outgoing)).toBeCloseTo(1, 12);
    expect(gains.incoming).toBeGreaterThanOrEqual(previous);
    previous = gains.incoming;
  }
  expect(mixGains(0, true)).toEqual({ outgoing: 1, incoming: 0 });
  expect(mixGains(1, true).incoming).toBe(1);
  expect(mixGains(0.15, true).incoming).not.toBeCloseTo(mixGains(0.15, false).incoming, 3);
  for (const p of [0.35, 0.6])
    expect(mixGains(p - 1e-6, true).incoming).toBeCloseTo(mixGains(p + 1e-6, true).incoming, 5);
});
it('selects a bounded pair-specific window automatically', async () => {
  const { automaticMixSeconds } = await import('./mix');
  expect(automaticMixSeconds(240, 200)).toBeGreaterThan(automaticMixSeconds(20, 20));
  expect(automaticMixSeconds(4, 8)).toBeLessThanOrEqual(2);
  expect(automaticMixSeconds(1000, 1000)).toBeLessThanOrEqual(8);
  expect(automaticMixSeconds(NaN, 20)).toBe(0);
});
