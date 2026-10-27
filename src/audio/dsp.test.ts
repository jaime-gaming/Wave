import { describe, expect, it } from 'vitest';
import {
  analyzePcm,
  energySegments,
  estimatePhase,
  estimateTempo,
  fft,
  frameFeatures,
  introEnd,
  outroStart,
  overlapsRegion,
  silenceBounds,
  snapToBeat,
  vocalRegions,
  type TrackAnalysis,
} from './dsp';

const SAMPLE_RATE = 11025;

/** Clicks every `beat` seconds plus a low sine body, i.e. a metronome groove. */
function groove(
  bpm: number,
  seconds: number,
  options: { startAt?: number; silent?: [number, number] } = {},
) {
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * seconds));
  const beat = 60 / bpm;
  for (let index = 0; index < samples.length; index++) {
    const time = index / SAMPLE_RATE;
    // Continuous low body so silence detection has something to find.
    samples[index] = 0.12 * Math.sin(2 * Math.PI * 60 * time);
    const sinceBeat = (time - (options.startAt ?? 0)) % beat;
    if (sinceBeat >= 0 && sinceBeat < 0.012)
      samples[index] += 0.8 * Math.sin(2 * Math.PI * 110 * sinceBeat);
  }
  if (options.silent) {
    const [from, to] = options.silent;
    for (let index = Math.floor(from * SAMPLE_RATE); index < Math.floor(to * SAMPLE_RATE); index++)
      samples[index] = 0;
  }
  return samples;
}

describe('fft', () => {
  it('finds a single tone in the right bin', () => {
    const size = 1024;
    const re = new Float32Array(size);
    const im = new Float32Array(size);
    const bin = 64;
    for (let index = 0; index < size; index++)
      re[index] = Math.cos((2 * Math.PI * bin * index) / size);
    fft(re, im);
    const magnitudes = Array.from({ length: size / 2 }, (_, index) =>
      Math.hypot(re[index], im[index]),
    );
    const peak = magnitudes.indexOf(Math.max(...magnitudes));
    expect(peak).toBe(bin);
  });

  it('keeps energy bounded for silence and noise', () => {
    const size = 256;
    const silent = new Float32Array(size);
    fft(silent, new Float32Array(size));
    expect(Math.max(...silent)).toBe(0);
  });
});

describe('tempo and beat grid', () => {
  it('recovers the BPM of a steady groove', () => {
    for (const bpm of [96, 128, 174]) {
      const samples = groove(bpm, 20);
      const analysis = analyzePcm(samples, SAMPLE_RATE);
      expect(Math.abs(analysis.beats.bpm - bpm)).toBeLessThanOrEqual(2);
      expect(analysis.beats.confidence).toBeGreaterThan(0.2);
    }
  });

  it('recovers the beat phase for a shifted groove', () => {
    const samples = groove(120, 20, { startAt: 0.25 });
    const analysis = analyzePcm(samples, SAMPLE_RATE);
    const period = 60 / analysis.beats.bpm;
    const phase = ((analysis.beats.offset % period) + period) % period;
    expect(Math.min(Math.abs(phase - 0.25), Math.abs(phase - 0.25 - period))).toBeLessThan(0.08);
  });

  it('returns low confidence instead of a beat grid for silence', () => {
    const analysis = analyzePcm(new Float32Array(SAMPLE_RATE * 5), SAMPLE_RATE);
    expect(analysis.beats.bpm).toBe(0);
    expect(analysis.beats.confidence).toBe(0);
  });

  it('snaps to the nearest beat only when the grid is trusted', () => {
    const trusted = { bpm: 120, offset: 0.1, confidence: 0.8 };
    expect(snapToBeat(1.03, trusted)).toBeCloseTo(1.1, 3);
    expect(snapToBeat(0.2, trusted)).toBeCloseTo(0.1, 3);
    expect(snapToBeat(1.03, { ...trusted, confidence: 0.1 })).toBe(1.03);
    expect(snapToBeat(-3, trusted)).toBe(0);
    expect(estimatePhase(new Float32Array(10), 0)).toBe(0);
  });

  it('rejects unusable input', () => {
    expect(estimateTempo(new Float32Array(4), 0.02).bpm).toBe(0);
    expect(estimateTempo(new Float32Array(100), 0).bpm).toBe(0);
    expect(frameFeatures(new Float32Array(10), SAMPLE_RATE).frames).toEqual([]);
  });
});

describe('structure', () => {
  it('trims leading and trailing silence', () => {
    const samples = groove(120, 12, { silent: [0, 2] });
    const analysis = analyzePcm(samples, SAMPLE_RATE);
    expect(analysis.trimmed.start).toBeGreaterThan(1.6);
    expect(analysis.trimmed.start).toBeLessThan(2.3);
  });

  it('segments a quiet intro, a loud body and a quiet outro', () => {
    const samples = groove(120, 24);
    const quiet = 0.05;
    for (let index = 0; index < samples.length; index++) {
      const time = index / SAMPLE_RATE;
      if (time < 4 || time > 20) samples[index] *= quiet;
    }
    const { frames, frameSeconds } = frameFeatures(samples, SAMPLE_RATE);
    const segments = energySegments(frames, frameSeconds);
    expect(segments[0].kind).toBe('intro');
    expect(segments.at(-1)!.kind).toBe('outro');
    expect(segments.some((segment) => segment.kind === 'body' || segment.kind === 'build')).toBe(
      true,
    );
    expect(segments.length).toBeLessThanOrEqual(24);
    for (let index = 1; index < segments.length; index++)
      expect(segments[index].start).toBeGreaterThanOrEqual(segments[index - 1].start);
  });

  it('reports empty structure for empty audio', () => {
    expect(energySegments([], 0.02)).toEqual([]);
    expect(vocalRegions([], 0.02)).toEqual([]);
    expect(silenceBounds([], 0.02)).toEqual({ start: 0, end: 0 });
  });
});

describe('vocal and section helpers', () => {
  const analysis = (over: Partial<TrackAnalysis> = {}): TrackAnalysis => ({
    duration: 200,
    frameSeconds: 0.02,
    beats: { bpm: 120, offset: 0.05, confidence: 0.8 },
    trimmed: { start: 1, end: 198 },
    segments: [
      { start: 1, end: 20, level: 0.3, kind: 'intro' },
      { start: 20, end: 170, level: 0.9, kind: 'body' },
      { start: 170, end: 198, level: 0.3, kind: 'outro' },
    ],
    vocals: [{ start: 25, end: 60, strength: 0.7 }],
    profile: { bass: 0.4, low: 0.2, mid: 0.3, high: 0.1 },
    peak: 0.9,
    ...over,
  });

  it('detects vocal regions above the threshold only', () => {
    const samples = groove(120, 8);
    for (let index = Math.floor(SAMPLE_RATE * 2); index < Math.floor(SAMPLE_RATE * 5); index++)
      samples[index] += 0.4 * Math.sin(2 * Math.PI * 900 * (index / SAMPLE_RATE));
    const result = vocalRegions(frameFeatures(samples, SAMPLE_RATE).frames, 256 / SAMPLE_RATE);
    expect(result.some((region) => region.start >= 1.8 && region.end <= 5.4)).toBe(true);
    for (const region of result) {
      expect(region.end).toBeGreaterThan(region.start);
      expect(region.strength).toBeGreaterThan(0);
    }
  });

  it('derives intro and outro boundaries from the segments', () => {
    expect(introEnd(analysis())).toBe(20);
    expect(outroStart(analysis())).toBe(170);
    expect(introEnd(analysis({ segments: [] }))).toBe(1);
    expect(outroStart(analysis({ segments: [] }))).toBe(198);
  });

  it('detects overlap with a vocal region', () => {
    const vocals = analysis().vocals;
    expect(overlapsRegion(vocals, 30, 40)).toBe(true);
    expect(overlapsRegion(vocals, 60, 70)).toBe(false);
    expect(overlapsRegion(vocals, 59.95, 60.2)).toBe(false);
    expect(overlapsRegion(vocals, 59.8, 60.4)).toBe(true);
  });

  it('summarises a real groove end to end', () => {
    const result = analyzePcm(groove(128, 30, { silent: [0, 1] }), SAMPLE_RATE);
    expect(result.duration).toBeCloseTo(30, 0);
    expect(Math.abs(result.beats.bpm - 128)).toBeLessThanOrEqual(2);
    expect(result.profile.bass).toBeGreaterThan(0.2);
    expect(result.peak).toBeGreaterThan(0);
  });
});
