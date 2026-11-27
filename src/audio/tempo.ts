import type { Beats } from './dsp';

export const FOLD_MIN = 74;
export const FOLD_MAX = 148;

export function foldBpm(bpm: number, min = FOLD_MIN, max = FOLD_MAX): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  let value = bpm;

  for (let pass = 0; pass < 8 && value < min; pass++) value *= 2;
  for (let pass = 0; pass < 8 && value > max; pass++) value /= 2;
  return value;
}

export type TempoKind = 'matched' | 'half' | 'double' | 'wide';

export interface TempoRelation {
  kind: TempoKind;

  ratio: number;

  foldedA: number;
  foldedB: number;

  difference: number;
}

export function tempoRelation(bpmA: number, bpmB: number, tolerance = 0.03): TempoRelation {
  const foldedA = foldBpm(bpmA);
  const foldedB = foldBpm(bpmB);
  if (!foldedA || !foldedB)
    return { kind: 'wide', ratio: 1, foldedA, foldedB, difference: Number.POSITIVE_INFINITY };
  const ratio = foldedA / foldedB;
  const difference = Math.abs(ratio - 1);
  if (difference <= tolerance) return { kind: 'matched', ratio, foldedA, foldedB, difference };

  for (const [factor, kind] of [
    [2, 'double'],
    [0.5, 'half'],
  ] as const) {
    if (Math.abs(ratio / factor - 1) <= tolerance)
      return { kind, ratio, foldedA, foldedB, difference: Math.abs(ratio / factor - 1) };
  }
  return { kind: 'wide', ratio, foldedA, foldedB, difference };
}

export function isRubato(beats: Beats | undefined, floor = 0.45): boolean {
  if (!beats) return false;
  return (beats.stability ?? 1) < floor;
}

export function tempoStability(
  onset: Float32Array,
  frameSeconds: number,
  estimate: (onset: Float32Array, frameSeconds: number) => Beats,
): number {
  const windowSize = Math.floor(onset.length / 2);
  if (windowSize < 32) return 1;
  const readings: number[] = [];
  for (const start of [0, Math.floor(onset.length / 4), onset.length - windowSize]) {
    const slice = onset.subarray(start, start + windowSize);
    const beats = estimate(slice, frameSeconds);
    if (!beats.bpm || beats.confidence < 0.2) continue;
    readings.push(foldBpm(beats.bpm));
  }
  if (readings.length < 2) return 0.5;
  const mean = readings.reduce((total, value) => total + value, 0) / readings.length;
  if (mean <= 0) return 0.5;
  const spread =
    readings.reduce((total, value) => total + Math.abs(value - mean), 0) / readings.length / mean;

  return Math.max(0, Math.min(1, Math.round((1 - spread / 0.06) * 100) / 100));
}
