import { describe, it, expect } from 'vitest';
import {
  BALANCED_MAX_LUFS,
  BALANCED_MIN_LUFS,
  MAX_BOOST_LINEAR,
  VOLUME_FIX_VERSION,
  volumeCorrection,
} from './volumeAnalysis';

const tone = (level: number, frames = 44100) =>
  Float32Array.from({ length: frames }, (_, i) => level * Math.sin(i * 0.1));

describe('Fix volume', () => {
  it('raises a quiet recording cleanly while preserving headroom', () => {
    const fix = volumeCorrection([tone(0.05)], 22050);
    expect(fix.algorithmVersion).toBe(VOLUME_FIX_VERSION);
    expect(fix.applied).toBe(true);
    expect(fix.action).toBe('boost');
    expect(fix.gain).toBeGreaterThan(1.5);
    expect(fix.gain).toBeLessThanOrEqual(MAX_BOOST_LINEAR);
    expect(0.05 * fix.gain).toBeLessThan(0.95);
    expect(fix.lufs).toBeLessThan(BALANCED_MIN_LUFS);
  });

  it('leaves already well-leveled modern recordings completely untouched', () => {
    const fix = volumeCorrection([tone(0.42)], 22050);
    expect(fix.lufs).toBeGreaterThanOrEqual(BALANCED_MIN_LUFS);
    expect(fix.lufs).toBeLessThanOrEqual(BALANCED_MAX_LUFS);
    expect(fix.applied).toBe(false);
    expect(fix.action).toBe('balanced');
    expect(fix.gain).toBe(1);
  });

  it('can lift a quiet track that contains a lone transient click using limiter-assisted headroom', () => {
    const audio = tone(0.05);
    audio[50] = 0.98;
    const fix = volumeCorrection([audio], 22050);
    expect(fix.applied).toBe(true);
    expect(fix.action).toBe('boost');
    expect(fix.gain).toBeGreaterThan(1);
    expect(fix.limiterAssisted).toBe(true);

    expect(0.05 * fix.gain).toBeLessThan(0.85);
  });

  it('does not count dead air as a quiet recording', () => {
    const audio = tone(0.08);
    const padded = new Float32Array(audio.length * 3);
    padded.set(audio, audio.length);
    expect(volumeCorrection([padded], 22050).gain).toBeCloseTo(
      volumeCorrection([audio], 22050).gain,
      1,
    );
  });

  it('only gently trims extremely hot recordings without crushing them', () => {
    const fix = volumeCorrection([tone(0.92)], 22050);
    expect(fix.applied).toBe(true);
    expect(fix.action).toBe('trim');
    expect(fix.gain).toBeLessThan(1);
    expect(fix.gain).toBeGreaterThanOrEqual(0.55);
  });

  it('measures all channels safely', () => {
    const fix = volumeCorrection([tone(0.05), tone(0.95)], 22050);
    expect(fix.gain).toBeLessThanOrEqual(1);
  });

  it('refuses silence, invalid samples and invalid sample rates', () => {
    expect(() => volumeCorrection([new Float32Array(100)], 22050)).toThrow();
    expect(() => volumeCorrection([new Float32Array([NaN])], 22050)).toThrow();
    expect(() => volumeCorrection([tone(0.1)], 0)).toThrow();
  });
});
