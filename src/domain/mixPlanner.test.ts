import { describe, expect, it } from 'vitest';
import {
  automaticBars,
  bassSwapGains,
  isUsablePlan,
  MAX_STRETCH,
  planGains,
  planTransition,
  TARGET_SECONDS,
} from './mixPlanner';
import type { TrackAnalysis } from '../audio/dsp';

const analysis = (over: Partial<TrackAnalysis> = {}): TrackAnalysis => ({
  duration: 240,
  frameSeconds: 0.02,
  beats: { bpm: 120, offset: 0.05, confidence: 0.85 },
  trimmed: { start: 1, end: 238 },
  segments: [
    { start: 1, end: 16, level: 0.25, kind: 'intro' },
    { start: 16, end: 210, level: 0.9, kind: 'body' },
    { start: 210, end: 238, level: 0.25, kind: 'outro' },
  ],
  vocals: [],
  profile: { bass: 0.4, low: 0.2, mid: 0.3, high: 0.1 },
  peak: 0.9,
  ...over,
});

describe('Mix transition planning', () => {
  it('mixes two songs with the same tempo on a bar boundary', () => {
    const plan = planTransition(
      analysis(),
      analysis({ duration: 200, trimmed: { start: 0, end: 198 } }),
    );
    expect(plan.mode).toBe('beatmatched');
    expect(plan.bars).toBe(8);
    // 8 bars at 120 BPM = 16 s.
    expect(plan.seconds).toBeCloseTo(16, 5);
    expect(plan.cue).toBeGreaterThanOrEqual(16);
    // The overlap must start on a beat of the outgoing grid.
    const period = 60 / 120;
    const beats = (plan.startAt - 0.05) / period;
    expect(Math.abs(beats - Math.round(beats))).toBeLessThan(0.01);
    expect(plan.startAt + plan.seconds).toBeLessThanOrEqual(238 + 0.05);
    expect(plan.incomingRate).toBe(1);
    expect(plan.stretched).toBe(false);
    expect(plan.phaseAligned).toBe(true);
  });

  it('stretches the incoming song when the tempo gap is under 8 %', () => {
    const plan = planTransition(
      analysis(),
      analysis({ beats: { bpm: 126, offset: 0.02, confidence: 0.8 } }),
    );
    expect(plan.mode).toBe('beatmatched');
    expect(plan.stretched).toBe(true);
    expect(plan.incomingRate).toBeCloseTo(120 / 126, 3);
    expect(Math.abs(plan.incomingRate - 1)).toBeLessThanOrEqual(MAX_STRETCH);
    expect(plan.notes.join(' ')).toMatch(/pitch preserved/i);
  });

  it('refuses to stretch beyond the limit and shortens the overlap instead', () => {
    const plan = planTransition(
      analysis(),
      analysis({ beats: { bpm: 140, offset: 0, confidence: 0.9 } }),
    );
    expect(plan.incomingRate).toBe(1);
    expect(plan.stretched).toBe(false);
    expect(plan.bars).toBeLessThanOrEqual(4);
    expect(plan.notes.join(' ')).toMatch(/too wide to stretch/i);
  });

  it('falls back to an equal-power crossfade without a trusted grid', () => {
    const plan = planTransition(
      analysis({ beats: { bpm: 0, offset: 0, confidence: 0 } }),
      analysis(),
      { fallbackSeconds: 7 },
    );
    expect(plan.mode).toBe('crossfade');
    expect(plan.seconds).toBeCloseTo(7, 2);
    expect(plan.cue).toBeGreaterThanOrEqual(0);
    expect(plan.notes.join(' ')).toMatch(/equal-power crossfade/i);
  });

  it('cuts when there is nothing to analyse', () => {
    const plan = planTransition(undefined, undefined);
    expect(plan.mode).toBe('cut');
    expect(plan.seconds).toBe(0);
  });

  it('moves the incoming entry when the song starts with a vocal', () => {
    const withVocal = analysis({ vocals: [{ start: 16, end: 60, strength: 0.8 }] });
    const plan = planTransition(analysis(), withVocal);
    expect(plan.mode).toBe('beatmatched');
    expect(plan.cue).toBeGreaterThanOrEqual(60 - 0.001);
    expect(plan.notes.join(' ')).toMatch(/without a prominent vocal/i);
  });

  it('halves the overlap when both songs have vocals at the join', () => {
    const outgoing = analysis({ vocals: [{ start: 200, end: 240, strength: 0.9 }] });
    const incoming = analysis({
      duration: 200,
      trimmed: { start: 0, end: 198 },
      vocals: [{ start: 0, end: 300, strength: 0.9 }],
    });
    const plan = planTransition(outgoing, incoming);
    expect(plan.bars).toBe(4);
    expect(plan.notes.join(' ')).toMatch(/halved/i);
  });

  it('keeps the overlap inside the audible tail', () => {
    const short = analysis({ trimmed: { start: 1, end: 40 } });
    const plan = planTransition(short, analysis());
    expect(plan.seconds).toBeLessThanOrEqual(39);
    expect(plan.startAt).toBeGreaterThanOrEqual(1);
    expect(plan.startAt + plan.seconds).toBeLessThanOrEqual(40.05);
  });

  it('reports an unusable plan instead of pretending', () => {
    expect(isUsablePlan(planTransition(undefined, undefined), 30)).toBe(false);
    const plan = planTransition(analysis(), analysis());
    expect(isUsablePlan(plan, 30)).toBe(true);
    expect(isUsablePlan(plan, 0)).toBe(false);
  });

  it('clamps the requested bar count to 8–16', () => {
    expect(planTransition(analysis(), analysis(), { bars: 2 }).bars).toBe(8);
    expect(planTransition(analysis(), analysis(), { bars: 99 }).bars).toBe(16);
  });
});

describe('gain curves', () => {
  it('keeps total power constant across the fade', () => {
    for (const progress of [0, 0.3, 0.5, 0.8, 1]) {
      const { outgoing, incoming } = planGains(progress);
      expect(outgoing ** 2 + incoming ** 2).toBeCloseTo(1, 6);
    }
  });

  it('swaps bass around the midpoint without a hole', () => {
    const start = bassSwapGains(0);
    const middle = bassSwapGains(0.45);
    const end = bassSwapGains(1);
    expect(start.outgoing).toBeCloseTo(1, 6);
    expect(start.incoming).toBeCloseTo(0, 6);
    expect(middle.outgoing).toBeCloseTo(middle.incoming, 2);
    expect(end.incoming).toBeCloseTo(1, 6);
    // Never both at zero: the low end is continuous.
    for (let step = 0; step <= 20; step++) {
      const gains = bassSwapGains(step / 20);
      expect(Math.hypot(gains.outgoing, gains.incoming)).toBeGreaterThan(0.9);
    }
    expect(bassSwapGains(-1)).toEqual({ outgoing: 1, incoming: 0 });
    expect(bassSwapGains(9).incoming).toBeCloseTo(1, 6);
  });

  it('chooses its own bar count so a blend lasts about the target length', () => {
    expect(automaticBars(120)).toBe(8);
    expect(automaticBars(174)).toBe(12);
    expect(automaticBars(60)).toBe(8);
    expect(automaticBars(0)).toBe(8);
    expect(automaticBars(Number.NaN)).toBe(8);
    for (const bpm of [72, 96, 120, 128, 150, 174, 190]) {
      const seconds = (automaticBars(bpm) * 4 * 60) / bpm;
      expect(seconds).toBeGreaterThan(TARGET_SECONDS * 0.55);
      expect(seconds).toBeLessThan(TARGET_SECONDS * 1.55);
    }
  });

  it('adapts the overlap to a slow song without being asked', () => {
    const slow = planTransition(
      analysis({ beats: { bpm: 78, offset: 0.05, confidence: 0.9 } }),
      analysis({ beats: { bpm: 80, offset: 0.05, confidence: 0.9 } }),
    );
    expect(slow.mode).toBe('beatmatched');
    expect(slow.bars).toBe(8);
    expect(slow.seconds).toBeGreaterThan(20);
    const fast = planTransition(
      analysis({ beats: { bpm: 172, offset: 0.05, confidence: 0.9 } }),
      analysis({ beats: { bpm: 174, offset: 0.05, confidence: 0.9 } }),
    );
    expect(fast.bars).toBe(12);
    expect(fast.seconds).toBeLessThan(slow.seconds);
  });
});
