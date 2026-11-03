/**
 * The tempo facts a mix needs, in one place.
 *
 * A tempo estimate from autocorrelation is only ever one of a family: the same
 * record can read as 87, 174 or 43.5 BPM with almost identical confidence,
 * because the pulse repeats at every one of those periods. Dance records are
 * written at 174 (drum & bass) and played as 87 in a hip-hop set; a house edit at
 * 124 reads as 62 under a slow filter.
 *
 * Everything here works on *folded* tempi, so two songs are compared as a DJ
 * compares them — is this the same pulse, twice as fast, half as fast, or
 * something else — instead of comparing two numbers that came out of an
 * estimator on different days.
 */
import type { Beats } from './dsp';

/** Where a folded tempo lands: the range a person can tap their foot to. */
export const FOLD_MIN = 74;
export const FOLD_MAX = 148;

/** The same pulse, expressed inside the folding range. */
export function foldBpm(bpm: number, min = FOLD_MIN, max = FOLD_MAX): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  let value = bpm;
  // Bounded passes: a wild estimate (or zero from a silent file) must not spin.
  for (let pass = 0; pass < 8 && value < min; pass++) value *= 2;
  for (let pass = 0; pass < 8 && value > max; pass++) value /= 2;
  return value;
}

export type TempoKind = 'matched' | 'half' | 'double' | 'wide';

export interface TempoRelation {
  kind: TempoKind;
  /** Rate for the incoming deck: folded A / folded B. */
  ratio: number;
  /** Folded tempi the decision was made from. */
  foldedA: number;
  foldedB: number;
  /** Percentage difference after folding. */
  difference: number;
}

/**
 * How two songs relate, half and double included.
 *
 * A 174 BPM record and an 87 BPM one fold to the same number, which is exactly
 * the point: they *are* the same tempo to a dancer, and blending them needs no
 * stretching at all. Only a genuine gap — 100 against 128 — is reported as wide,
 * and only that is refused.
 */
export function tempoRelation(bpmA: number, bpmB: number, tolerance = 0.03): TempoRelation {
  const foldedA = foldBpm(bpmA);
  const foldedB = foldBpm(bpmB);
  if (!foldedA || !foldedB)
    return { kind: 'wide', ratio: 1, foldedA, foldedB, difference: Number.POSITIVE_INFINITY };
  const ratio = foldedA / foldedB;
  const difference = Math.abs(ratio - 1);
  if (difference <= tolerance) return { kind: 'matched', ratio, foldedA, foldedB, difference };
  // A fold that lands just outside the range (75 against 148) is still an
  // octave: report it as such so the planner does not try to stretch it.
  for (const [factor, kind] of [
    [2, 'double'],
    [0.5, 'half'],
  ] as const) {
    if (Math.abs(ratio / factor - 1) <= tolerance)
      return { kind, ratio: factor, foldedA, foldedB, difference };
  }
  return { kind: 'wide', ratio, foldedA, foldedB, difference };
}

/**
 * Whether the beat grid is too unsteady to mix against.
 *
 * Rubato material — a live drummer, a string quartet, a ballad that breathes —
 * has no fixed period, so a tempo-matched grid drifts off it within a bar and
 * every bar-aligned entry lands in the wrong place. Those songs are crossfaded,
 * not beatmatched.
 */
export function isRubato(beats: Beats | undefined, floor = 0.45): boolean {
  if (!beats) return false;
  return (beats.stability ?? 1) < floor;
}

/**
 * How steady the pulse is, 0–1.
 *
 * The estimate is repeated on three overlapping halves of the onset envelope and
 * the folded answers are compared. A drum machine returns the same number three
 * times and scores 1; a live take drifts and scores low; a quiet intro that was
 * never a beat at all scores low too, which is the answer we want.
 */
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
  // 2 % of drift between halves is a live band; 0 % is a loop. The floor keeps a
  // single doubtful window from condemning a perfectly steady record.
  return Math.max(0, Math.min(1, Math.round((1 - spread / 0.06) * 100) / 100));
}
