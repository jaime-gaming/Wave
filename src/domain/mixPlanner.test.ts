import { describe, expect, it } from 'vitest';
import {
  automaticBars,
  bassSwapGains,
  handoverGains,
  isUsablePlan,
  levelTrim,
  MAX_CUE_LEAD,
  MAX_ENTRY,
  MAX_STRETCH,
  planGains,
  planTransition,
  planTransitionCached,
  realignPlan,
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

describe('Level matching across a handover', () => {
  const quiet = analysis({
    segments: [
      { start: 1, end: 16, level: 0.2, kind: 'intro' },
      { start: 16, end: 210, level: 0.5, kind: 'body' },
    ],
  });
  const loud = analysis({
    segments: [
      { start: 1, end: 16, level: 0.2, kind: 'intro' },
      { start: 16, end: 210, level: 0.9, kind: 'body' },
    ],
  });

  it('turns the louder record down instead of the quieter one up', () => {
    const aLoud = levelTrim(loud, quiet);
    expect(aLoud.outgoing).toBeLessThan(1);
    expect(aLoud.incoming).toBe(1);
    const bLoud = levelTrim(quiet, loud);
    expect(bLoud.outgoing).toBe(1);
    expect(bLoud.incoming).toBeLessThan(1);
    // -6 dB is the ceiling, so a badly mastered pair cannot be silenced.
    expect(bLoud.incoming).toBeGreaterThanOrEqual(0.5);
  });

  it('leaves decks alone when they already match or cannot be measured', () => {
    expect(levelTrim(quiet, quiet)).toEqual({ outgoing: 1, incoming: 1 });
    expect(levelTrim(quiet, undefined)).toEqual({ outgoing: 1, incoming: 1 });
    const noBody = analysis({ segments: [] });
    expect(levelTrim(quiet, noBody)).toEqual({ outgoing: 1, incoming: 1 });
  });
});

describe('Mix transition planning', () => {
  it('mixes two songs with the same tempo on a bar boundary', () => {
    const plan = planTransition(
      analysis(),
      analysis({ duration: 200, trimmed: { start: 0, end: 198 } }),
    );
    expect(plan.mode).toBe('beatmatched');
    // Three phrases at 120 BPM: long enough for an arrival, a passage together
    // and a departure, instead of one slide.
    expect(plan.bars).toBe(12);
    expect(plan.seconds).toBeCloseTo(24, 5);
    // The incoming song is cued on the first bar of its body, not on the beatless
    // intro it opens with, and never deeper than MAX_ENTRY.
    expect(plan.cue).toBeCloseTo(16.05, 2);
    expect(plan.cue).toBeLessThanOrEqual(MAX_ENTRY + 2);
    const entry = (plan.cue - 0.05) / (60 / 120);
    expect(Math.abs(entry - Math.round(entry))).toBeLessThan(0.01);
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

  it('never skips the start of the incoming song, even when it starts with a vocal', () => {
    const withVocal = analysis({ vocals: [{ start: 0, end: 60, strength: 0.8 }] });
    const plan = planTransition(analysis(), withVocal);
    expect(plan.mode).toBe('beatmatched');
    // A vocal at the join shortens the overlap; it never moves the entry forward.
    expect(plan.cue).toBeLessThanOrEqual(MAX_CUE_LEAD);
    expect(plan.seconds).toBeLessThanOrEqual(12);
  });

  it('never skips more than MAX_ENTRY of an intro', () => {
    const longIntro = analysis({
      duration: 300,
      trimmed: { start: 0, end: 298 },
      segments: [
        { start: 0, end: 45, level: 0.4, kind: 'intro' },
        { start: 45, end: 280, level: 0.9, kind: 'body' },
        { start: 280, end: 298, level: 0.3, kind: 'outro' },
      ],
    });
    const plan = planTransition(analysis(), longIntro);
    expect(plan.mode).toBe('beatmatched');
    // A 45-second intro is a section, not a count-in: Mix takes the first bar
    // inside it and no more.
    expect(plan.cue).toBeLessThanOrEqual(MAX_ENTRY + 2);
    expect(plan.notes.join(' ')).not.toMatch(/skipped/i);
  });

  it('keeps a song with no sections at its first beat', () => {
    const plan = planTransition(
      analysis(),
      analysis({ segments: [], trimmed: { start: 2, end: 198 } }),
    );
    expect(plan.mode).toBe('beatmatched');
    expect(plan.cue - 2).toBeLessThanOrEqual(MAX_CUE_LEAD + 1);
  });

  it('halves the overlap when both songs have vocals at the join', () => {
    const outgoing = analysis({ vocals: [{ start: 200, end: 240, strength: 0.9 }] });
    const incoming = analysis({
      duration: 200,
      trimmed: { start: 0, end: 198 },
      vocals: [{ start: 0, end: 300, strength: 0.9 }],
    });
    const plan = planTransition(outgoing, incoming);
    // Half of twelve bars, so the two voices collide for six bars, not twelve.
    expect(plan.bars).toBe(6);
    expect(plan.seconds).toBeCloseTo(12, 5);
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

  it('clamps the requested bar count to 4–16', () => {
    expect(planTransition(analysis(), analysis(), { bars: 2 }).bars).toBe(4);
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
    expect(automaticBars(120)).toBe(12);
    expect(automaticBars(174)).toBe(16);
    expect(automaticBars(60)).toBe(4);
    expect(automaticBars(0)).toBe(4);
    expect(automaticBars(Number.NaN)).toBe(4);
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
    expect(slow.seconds).toBeGreaterThan(10);
    const fast = planTransition(
      analysis({ beats: { bpm: 172, offset: 0.05, confidence: 0.9 } }),
      analysis({ beats: { bpm: 174, offset: 0.05, confidence: 0.9 } }),
    );
    expect(fast.bars).toBe(16);
    expect(fast.seconds).toBeLessThan(slow.seconds);
  });

  it('reuses the plan for the same pair instead of planning fifty times a second', () => {
    const a = analysis();
    const b = analysis({ duration: 200, trimmed: { start: 0, end: 198 } });
    const first = planTransitionCached(a, b, { fallbackSeconds: 7 });
    const second = planTransitionCached(a, b, { fallbackSeconds: 7 });
    expect(second).toBe(first);
    // Different options are a different plan.
    expect(planTransitionCached(a, b, { fallbackSeconds: 4 })).not.toBe(first);
  });
});

describe('the mix curve', () => {
  it('brings the new song in early and lets the old one leave afterwards', () => {
    // A quarter of the way in the new song is already at level, which is what
    // makes the handover audible as an arrival instead of a slide.
    expect(handoverGains(0.25).incoming).toBeGreaterThan(0.65);
    // A symmetric crossfade would still be barely half way there.
    expect(handoverGains(0.25).incoming).toBeGreaterThan(planGains(0.25).incoming + 0.25);
    // The old song is still there when the new one lands: this is a mix, not a cut.
    expect(handoverGains(0.25).outgoing).toBeGreaterThan(0.6);
    // And it is the one that leaves in the second half of the overlap.
    expect(handoverGains(0.5).outgoing).toBeGreaterThan(handoverGains(0.75).outgoing);
    expect(handoverGains(0.9).outgoing).toBeLessThan(0.2);
  });

  it('stays at constant power the whole way, so nothing clips or drops out', () => {
    for (let step = 0; step <= 200; step++) {
      const { outgoing, incoming } = handoverGains(step / 200);
      expect(Math.hypot(outgoing, incoming)).toBeCloseTo(1, 12);
    }
  });

  it('starts with the old song alone and ends with the new one alone', () => {
    expect(handoverGains(0)).toEqual({ outgoing: 1, incoming: 0 });
    expect(handoverGains(1).incoming).toBeCloseTo(1, 12);
    expect(handoverGains(1).outgoing).toBeCloseTo(0, 12);
    // No jumps anywhere: a step would be heard as a click.
    let previous = 0;
    for (let step = 0; step <= 400; step++) {
      const value = handoverGains(step / 400).incoming;
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(value - previous).toBeLessThan(0.02);
      previous = value;
    }
  });
});

describe('keeping the blend on the phrase', () => {
  const plan = {
    mode: 'beatmatched' as const,
    seconds: 20,
    startAt: 200,
    cue: 12,
    incomingRate: 1,
    stretched: false,
    bassSwapAt: 0.5,
    bars: 10,
    phaseAligned: true,
    notes: [] as string[],
  };

  it('leaves a plan alone when the song reaches the cue point on time', () => {
    expect(realignPlan(plan, 200)).toEqual(plan);
    expect(realignPlan(plan, 199.9)).toEqual(plan);
  });

  it('moves a late blend to the next bar instead of starting mid-bar', () => {
    const late = realignPlan(plan, 203.4);
    // 20 s over 10 bars: each bar is 2 s, so the blend moves 4 s and loses 2 bars.
    expect(late).toMatchObject({ startAt: 204, bars: 8, seconds: 16 });
    expect(late?.notes.join(' ')).toMatch(/next bar/);
  });

  it('gives up rather than stagger when the phrase is gone', () => {
    expect(realignPlan(plan, 218)).toBeNull();
  });

  it('does not touch fallbacks or cuts', () => {
    expect(realignPlan({ ...plan, mode: 'crossfade' }, 260)).not.toBeNull();
    expect(realignPlan({ ...plan, mode: 'cut', seconds: 0, bars: 0 }, 260)).not.toBeNull();
  });
});
