import { describe, it, expect } from 'vitest';
import { volumeCorrection } from './volumeAnalysis';
const tone = (level: number, frames = 44100) =>
  Float32Array.from({ length: frames }, (_, i) => level * Math.sin(i * 0.1));
describe('Fix volume', () => {
  it('raises a quiet recording while leaving peak headroom', () => {
    const fix = volumeCorrection([tone(0.025)], 22050);
    expect(fix.gain).toBeGreaterThan(1);
    expect(fix.gain).toBeLessThanOrEqual(8);
    expect(0.025 * fix.gain).toBeLessThan(0.9);
  });
  it('never boosts a transient past the -1 dB sample ceiling', () => {
    const audio = tone(0.02);
    audio[50] = 0.98;
    const fix = volumeCorrection([audio], 22050);
    expect(fix.gain * 0.98).toBeLessThanOrEqual(Math.pow(10, -1 / 20) + 1e-6);
  });
  it('does not count dead air as a quiet recording', () => {
    const audio = tone(0.1);
    const padded = new Float32Array(audio.length * 3);
    padded.set(audio, audio.length);
    expect(volumeCorrection([padded], 22050).gain).toBeCloseTo(
      volumeCorrection([audio], 22050).gain,
      1,
    );
  });
  it('attenuates loud recordings and measures every channel', () => {
    expect(volumeCorrection([tone(0.8)], 22050).gain).toBeLessThan(1);
    const fix = volumeCorrection([tone(0.01), tone(0.95)], 22050);
    expect(fix.gain * 0.95).toBeLessThan(0.9);
  });
  it('refuses silence, invalid samples and invalid sample rates', () => {
    expect(() => volumeCorrection([new Float32Array(100)], 22050)).toThrow();
    expect(() => volumeCorrection([new Float32Array([NaN])], 22050)).toThrow();
    expect(() => volumeCorrection([tone(0.1)], 0)).toThrow();
  });
});
