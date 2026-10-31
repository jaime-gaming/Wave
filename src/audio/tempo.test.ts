import { describe, expect, it } from 'vitest';
import { foldBpm, isRubato, tempoRelation, tempoStability } from './tempo';
import { estimateTempo } from './dsp';

/** An onset envelope with a click every `period` frames. */
function clicks(period: (index: number) => number, length = 4000) {
  const envelope = new Float32Array(length);
  let position = 0;
  let index = 0;
  while (position < length) {
    envelope[Math.round(position)] = 1;
    position += period(index++);
  }
  return envelope;
}

describe('Folding a tempo', () => {
  it('brings every octave of the same pulse into one range', () => {
    expect(foldBpm(87)).toBeCloseTo(87, 5);
    expect(foldBpm(174)).toBeCloseTo(87, 5);
    expect(foldBpm(43.5)).toBeCloseTo(87, 5);
    expect(foldBpm(128)).toBeCloseTo(128, 5);
    expect(foldBpm(62)).toBeCloseTo(124, 5);
    expect(foldBpm(0)).toBe(0);
    expect(foldBpm(Number.NaN)).toBe(0);
  });

  it('reads a 174 record and an 87 one as the same tempo', () => {
    const relation = tempoRelation(174, 87);
    expect(relation.kind).toBe('matched');
    expect(relation.ratio).toBeCloseTo(1, 5);
  });

  it('keeps a small real gap as a stretch and a large one as a refusal', () => {
    expect(tempoRelation(128, 124).difference).toBeCloseTo(0.032, 3);
    expect(tempoRelation(100, 128).kind).toBe('wide');
  });
});

describe('Tempo stability', () => {
  it('scores a machine steady and unsteady playing low', () => {
    const steady = tempoStability(clicks(() => 25), 0.02, estimateTempo);
    expect(steady).toBeGreaterThanOrEqual(0.9);
    // A take that drifts from 100 to 150 BPM across the song.
    const drifting = tempoStability(clicks((index) => 25 + index * 0.12), 0.02, estimateTempo);
    expect(drifting).toBeLessThan(steady);
    expect(drifting).toBeLessThan(0.6);
  });

  it('treats steady material as mixable and drifting material as rubato', () => {
    expect(isRubato({ bpm: 120, offset: 0, confidence: 0.9, stability: 0.9 })).toBe(false);
    expect(isRubato({ bpm: 120, offset: 0, confidence: 0.9, stability: 0.2 })).toBe(true);
    // An analysis from before stability was measured is not condemned by it.
    expect(isRubato({ bpm: 120, offset: 0, confidence: 0.9 })).toBe(false);
  });
});
