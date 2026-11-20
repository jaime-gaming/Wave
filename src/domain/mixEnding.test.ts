import { describe, expect, it } from 'vitest';
import {
  detectEndingFromEvidence,
  detectEndingShape,
  ECHO_CUT_FRACTION,
  endingCutProgress,
  endingGains,
  stagedGains,
} from './mixEnding';
import type { EnergyEnvelope } from './musicEnergy';

const envelope = (values: number[]): EnergyEnvelope => ({
  step: 0.1,
  values: Float32Array.from(values),
});

describe('detecting how the outgoing song ends', () => {
  it('follows a recorded fade all the way to zero', () => {
    const values = new Array(200).fill(0.5);
    for (let index = 120; index < 194; index++) {
      const t = (index - 120) / 74;
      values[index] = 0.5 * (1 - t) ** 2;
    }
    for (let index = 194; index < values.length; index++) values[index] = 0;
    expect(detectEndingShape(envelope(values), 20, 19.4)).toBe('fade-to-zero');
  });

  it('cuts a still-audible echo-like tail before it reaches zero', () => {
    const values = new Array(200).fill(0.5);
    for (let index = 160; index < 187; index++) {
      const phase = (index - 160) % 6;
      values[index] = phase === 0 ? 0.34 * Math.exp(-(index - 160) / 60) : 0.08;
    }
    for (let index = 187; index < values.length; index++) values[index] = 0;
    expect(detectEndingShape(envelope(values), 20, 18.7)).toBe('echo-cut');
  });

  it('uses duration and the last timed lyric where no decoded tail is available', () => {
    expect(detectEndingFromEvidence({ duration: 200, lastLyric: 196, bpm: 120 })).toBe('echo-cut');
    expect(detectEndingFromEvidence({ duration: 200, lastLyric: 170, bpm: 120 })).toBe(
      'fade-to-zero',
    );
    expect(detectEndingShape(undefined, 200, 200, { duration: 200, lastLyric: 196 })).toBe(
      'echo-cut',
    );
  });

  it('keeps short and unsupported recordings on the safe fade', () => {
    expect(detectEndingShape(undefined, 5)).toBe('fade-to-zero');
    expect(detectEndingShape(envelope(new Array(10).fill(0.5)), 1)).toBe('fade-to-zero');
  });
});

describe('the two outgoing endings', () => {
  it('reaches zero only at the end of a fade', () => {
    expect(endingCutProgress('fade-to-zero')).toBe(1);
    expect(stagedGains(0).outgoing).toBeCloseTo(1, 6);
    expect(stagedGains(1).outgoing).toBeCloseTo(0, 6);
    expect(endingGains(1, 'fade-to-zero')).toEqual(stagedGains(1));
  });

  it('cuts the echo at 75 % of the fade, with the incoming song already at level', () => {
    expect(endingCutProgress('echo-cut')).toBe(ECHO_CUT_FRACTION);
    const justBefore = endingGains(ECHO_CUT_FRACTION - 0.001, 'echo-cut');
    expect(justBefore.outgoing).toBeGreaterThan(0);
    expect(justBefore.incoming).toBeGreaterThan(0.9);
    expect(endingGains(ECHO_CUT_FRACTION, 'echo-cut')).toEqual({ outgoing: 0, incoming: 1 });
    expect(endingGains(1, 'echo-cut')).toEqual({ outgoing: 0, incoming: 1 });
  });
});
