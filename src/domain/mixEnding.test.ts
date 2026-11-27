import { describe, expect, it } from 'vitest';
import {
  detectEndingFromEvidence,
  detectEndingShape,
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

  it('recognises a still-audible echo-like tail', () => {
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

  it('keeps both ending shapes continuous and releases only at zero', () => {
    expect(endingCutProgress('echo-cut')).toBe(1);
    for (let i = 0; i < 1000; i++) {
      const before = endingGains(i / 1000, 'echo-cut');
      const after = endingGains((i + 1) / 1000, 'echo-cut');
      expect(Math.abs(before.outgoing - after.outgoing)).toBeLessThan(0.01);
      expect(Math.abs(before.incoming - after.incoming)).toBeLessThan(0.01);
      expect(after.outgoing).toBeLessThanOrEqual(before.outgoing + 1e-9);
    }
    expect(endingGains(1, 'echo-cut').outgoing).toBeCloseTo(0, 10);
    expect(endingGains(1, 'echo-cut').incoming).toBeCloseTo(1, 10);
  });
});
