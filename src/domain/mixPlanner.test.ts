import { describe, expect, it } from 'vitest';
import {
  alignIncomingLyrics,
  automaticBars,
  handoverGains,
  isUsablePlan,
  levelTrim,
  MAX_CUE_LEAD,
  DRIFT_BEATS,
  MAX_ENTRY,
  PAN_SPREAD,
  panSpread,
  planGains,
  planTransition,
  planTransitionCached,
  realignPlan,
  TARGET_SECONDS,
  transitionCompatibility,
} from './mixPlanner';
import { estimateKeyFromChroma, harmonicCompatibility, type TrackAnalysis } from '../audio/dsp';
import { incomingAirHz, midCarveDb, OPEN_AIR_HZ } from '../audio/mixGraph';

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

    expect(plan.bars).toBe(12);
    expect(plan.seconds).toBeCloseTo(24, 5);

    expect(plan.cue).toBeCloseTo(16.05, 2);
    expect(plan.cue).toBeLessThanOrEqual(MAX_ENTRY + 2);
    const entry = (plan.cue - 0.05) / (60 / 120);
    expect(Math.abs(entry - Math.round(entry))).toBeLessThan(0.01);

    const period = 60 / 120;
    const beats = (plan.startAt - 0.05) / period;
    expect(Math.abs(beats - Math.round(beats))).toBeLessThan(0.01);
    expect(plan.startAt + plan.seconds).toBeLessThanOrEqual(238 + 0.05);
    expect(plan.phaseAligned).toBe(true);
  });

  it('never changes the tempo of either song', () => {
    const plan = planTransition(
      analysis(),
      analysis({ beats: { bpm: 126, offset: 0.02, confidence: 0.8 } }),
    );
    expect(plan.mode).toBe('beatmatched');

    expect(plan.notes.join(' ')).toMatch(/neither song is stretched/i);
    expect(JSON.stringify(plan)).not.toMatch(/Rate"/);
  });

  it('keeps the full overlap for close tempos and shortens a gap that would drift', () => {
    const close = planTransition(
      analysis(),
      analysis({ beats: { bpm: 125, offset: 0, confidence: 0.9 } }),
    );
    expect(close.mode).toBe('beatmatched');
    expect(close.seconds).toBeGreaterThanOrEqual(12);
    expect(close.notes.join(' ')).toMatch(/neither song is stretched/i);

    const gap = planTransition(
      analysis(),
      analysis({ beats: { bpm: 140, offset: 0, confidence: 0.9 } }),
    );
    expect(gap.mode).toBe('beatmatched');
    const drift = gap.seconds * Math.abs(1 - 140 / 120);
    expect(drift).toBeLessThanOrEqual(DRIFT_BEATS + 0.01);
    expect(gap.bars).toBeLessThan(close.bars);

    const wide = planTransition(
      analysis({ beats: { bpm: 112, offset: 0.05, confidence: 0.85 } }),
      analysis({ beats: { bpm: 140, offset: 0, confidence: 0.9 } }),
    );
    expect(wide.notes.join(' ')).toMatch(/keep their own tempo/i);
  });

  it('enters where the new record is already sounding, not in a breakdown', () => {
    const breakdown = analysis({
      trimmed: { start: 0, end: 238 },
      segments: [
        { start: 0, end: 8, level: 0.7, kind: 'intro' as const },
        { start: 8, end: 20, level: 0.08, kind: 'breakdown' as const },
        { start: 20, end: 210, level: 0.9, kind: 'body' as const },
        { start: 210, end: 238, level: 0.2, kind: 'outro' as const },
      ],
      beats: { bpm: 120, offset: 0, confidence: 0.85 },
    });
    const plan = planTransition(analysis(), breakdown);
    expect(plan.mode).toBe('beatmatched');

    expect(plan.cue).toBeGreaterThanOrEqual(20);
    expect(Number.isInteger((plan.cue - 0) / (60 / 120) / 4)).toBe(true);
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

    expect(plan.bars).toBe(6);
    expect(plan.seconds).toBeCloseTo(12, 5);
    expect(plan.notes.join(' ')).toMatch(/halved/i);
    expect(outgoing.trimmed.end - (plan.startAt + plan.seconds)).toBeLessThan(2.01);
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

    expect(planTransitionCached(a, b, { fallbackSeconds: 4 })).not.toBe(first);
    expect(planTransitionCached(a, b, { ending: 'echo-cut' }).ending).toBe('echo-cut');
    expect(planTransitionCached(a, b, { ending: 'fade-to-zero' }).ending).toBe('fade-to-zero');
  });
});

describe('the mix curve', () => {
  it('brings the new song in early and lets the old one leave afterwards', () => {
    expect(handoverGains(0.25).incoming).toBeGreaterThan(0.65);

    expect(handoverGains(0.25).incoming).toBeGreaterThan(planGains(0.25).incoming + 0.25);

    expect(handoverGains(0.25).outgoing).toBeGreaterThan(0.6);

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

    expect(late).toMatchObject({ startAt: 204, bars: 8, seconds: 16 });
    expect(late?.notes.join(' ')).toMatch(/next bar/);
    expect(realignPlan(plan, 204.05)).toMatchObject({ startAt: 204, bars: 8 });
  });

  it('gives up rather than stagger when the phrase is gone', () => {
    expect(realignPlan(plan, 218)).toBeNull();
  });

  it('does not touch fallbacks or cuts', () => {
    expect(realignPlan({ ...plan, mode: 'crossfade' }, 260)).not.toBeNull();
    expect(realignPlan({ ...plan, mode: 'cut', seconds: 0, bars: 0 }, 260)).not.toBeNull();
  });
});

describe('Mix against real material', () => {
  const club = (over: Partial<TrackAnalysis> = {}) =>
    analysis({
      beats: { bpm: 174, offset: 0.04, confidence: 0.8, stability: 0.96 },
      ...over,
    });

  it('blends a 174 BPM record with an 87 BPM one without stretching either', () => {
    const plan = planTransition(
      club(),
      club({ beats: { bpm: 87, offset: 0.02, confidence: 0.79, stability: 0.95 } }),
    );
    expect(plan.mode).toBe('beatmatched');
    expect(plan.notes.join(' ')).toMatch(/half-time/i);
  });

  it('refuses the grid when the pulse drifts, and joins the pair gently instead', () => {
    const live = club({ beats: { bpm: 118, offset: 0.1, confidence: 0.8, stability: 0.2 } });
    const plan = planTransition(club(), live);
    expect(plan.mode).toBe('crossfade');
    expect(plan.seconds).toBeGreaterThan(6);
    expect(plan.notes.join(' ')).toMatch(/not steady|gently/i);
  });

  it('cues past a thirty-second intro to the first bar where the drums are playing', () => {
    const longIntro = club({
      segments: [
        { start: 0, end: 28, level: 0.18, kind: 'intro' },
        { start: 28, end: 200, level: 0.92, kind: 'body' },
      ],
      trimmed: { start: 0, end: 220 },
      beats: { bpm: 124, offset: 0, confidence: 0.85, stability: 0.97 },
    });
    const plan = planTransition(
      analysis({ beats: { bpm: 124, offset: 0, confidence: 0.85 } }),
      longIntro,
    );
    expect(plan.mode).toBe('beatmatched');

    expect(plan.cue).toBeGreaterThan(24);
    expect(plan.cue).toBeLessThanOrEqual(MAX_ENTRY + 1);
  });

  it('still joins a genuinely different tempo without touching either speed', () => {
    const plan = planTransition(
      analysis(),
      analysis({ beats: { bpm: 168, offset: 0, confidence: 0.8 } }),
    );

    expect(JSON.stringify(plan)).not.toMatch(/Rate"/);
    expect(plan.mode === 'beatmatched' || plan.mode === 'crossfade').toBe(true);
  });
});

describe('The extra moves a mix makes', () => {
  it('separates the two songs in the stereo field and brings them home', () => {
    expect(panSpread(0, 'outgoing')).toBe(0);
    expect(panSpread(1, 'incoming')).toBe(0);

    expect(panSpread(0.5, 'outgoing')).toBeLessThan(0);
    expect(panSpread(0.5, 'incoming')).toBeGreaterThan(0);
    expect(panSpread(0.5, 'incoming')).toBeCloseTo(-panSpread(0.5, 'outgoing'), 3);
    expect(Math.abs(panSpread(0.5, 'outgoing'))).toBeLessThanOrEqual(PAN_SPREAD);
  });

  it('matches levels where the two songs actually meet, not on average', () => {
    const outgoing = analysis({
      segments: [
        { start: 0, end: 100, level: 0.9, kind: 'body' },
        { start: 100, end: 200, level: 0.1, kind: 'body' },
      ],
    });
    const incoming = analysis({
      segments: [
        { start: 0, end: 100, level: 0.9, kind: 'body' },
        { start: 100, end: 200, level: 0.1, kind: 'body' },
      ],
    });
    expect(levelTrim(outgoing, incoming)).toEqual({ outgoing: 1, incoming: 1 });

    const join = levelTrim(outgoing, incoming, { outgoing: 190, incoming: 0 });
    expect(join.outgoing).toBe(1);
    expect(join.incoming).toBeLessThan(1);
  });

  it('never skips halfway into a rubato ballad with a quiet first verse', () => {
    const ballad = analysis({
      duration: 240,
      trimmed: { start: 0, end: 238 },
      beats: { bpm: 84, offset: 0, confidence: 0.7, stability: 0.2 },
      segments: [
        { start: 0, end: 95, level: 0.22, kind: 'intro' },
        { start: 95, end: 210, level: 0.9, kind: 'body' },
      ],
    });
    const plan = planTransition(analysis(), ballad);
    expect(plan.mode).toBe('crossfade');
    expect(plan.cue).toBeLessThanOrEqual(6);
  });

  it('bounds intro skipping proportionally on short songs so half the song is never skipped', () => {
    const shortSong = analysis({
      duration: 75,
      trimmed: { start: 0, end: 74 },
      segments: [
        { start: 0, end: 30, level: 0.2, kind: 'intro' },
        { start: 30, end: 70, level: 0.9, kind: 'body' },
      ],
    });
    const plan = planTransition(analysis(), shortSong);
    expect(plan.cue).toBeLessThanOrEqual(16);
  });

  it('scores Camelot harmonic compatibility and tightens clashing keys while letting matches breathe', () => {
    const cMajorChroma = new Float32Array(12);
    cMajorChroma[0] = 1.0;
    cMajorChroma[4] = 0.72;
    cMajorChroma[7] = 0.85;
    cMajorChroma[2] = 0.25;
    cMajorChroma[5] = 0.35;
    cMajorChroma[9] = 0.3;
    const detected = estimateKeyFromChroma(cMajorChroma);
    expect(detected?.camelot).toBe('8B');

    const key8A = {
      tonic: 9,
      mode: 'minor' as const,
      name: 'A minor',
      camelot: '8A',
      confidence: 0.9,
    };
    const key9A = {
      tonic: 4,
      mode: 'minor' as const,
      name: 'E minor',
      camelot: '9A',
      confidence: 0.9,
    };
    const key2A = {
      tonic: 3,
      mode: 'minor' as const,
      name: 'Eb minor',
      camelot: '2A',
      confidence: 0.9,
    };

    expect(harmonicCompatibility(key8A, key9A)).toBeGreaterThan(0.85);
    expect(harmonicCompatibility(key8A, key2A)).toBeLessThan(0.35);

    const matchPlan = planTransition(analysis({ key: key8A }), analysis({ key: key9A }));
    const clashPlan = planTransition(analysis({ key: key8A }), analysis({ key: key2A }));
    expect(matchPlan.harmonicScore).toBeGreaterThan(0.85);
    expect(clashPlan.harmonicScore).toBeLessThan(0.35);
    expect(clashPlan.bars).toBeLessThan(matchPlan.bars);
    expect(
      transitionCompatibility(analysis({ key: key8A }), analysis({ key: key9A })),
    ).toBeGreaterThan(transitionCompatibility(analysis({ key: key8A }), analysis({ key: key2A })));
  });

  it('shapes outgoing midrange vocal carve and incoming air bloom cleanly back to bypass', () => {
    expect(midCarveDb(0, false)).toBe(0);
    expect(midCarveDb(1, true)).toBe(0);
    expect(midCarveDb(0.5, true)).toBeLessThan(midCarveDb(0.5, false));
    expect(incomingAirHz(0, true)).toBeLessThan(OPEN_AIR_HZ);
    expect(incomingAirHz(0.5, true)).toBe(OPEN_AIR_HZ);
    expect(incomingAirHz(1, false)).toBe(OPEN_AIR_HZ);
  });
});

describe('timed lyric handovers', () => {
  it('moves an entry earlier toward the first vocal without skipping lyrics', () => {
    const plan = planTransition(analysis(), analysis());
    const first = plan.cue + 5;
    const adjusted = alignIncomingLyrics(
      plan,
      { raw: '', lines: [{ text: 'First verse', time: first }], offsetMs: 0, source: 'local' },
      1,
    );
    expect(adjusted.cue).toBeLessThan(plan.cue);
    expect(adjusted.cue).toBeGreaterThanOrEqual(1);
    expect(adjusted.seconds).toBe(plan.seconds);
    expect(adjusted.phaseAligned).toBe(false);
    expect(
      alignIncomingLyrics(
        plan,
        { raw: 'plain', lines: [{ text: 'plain' }], offsetMs: 0, source: 'local' },
        1,
      ),
    ).toEqual(plan);
  });
});

it('recognises near-octave pulse across the folding boundary without slowing either track', () => {
  const first = analysis({ beats: { bpm: 75, offset: 0, confidence: 0.9 } });
  const second = analysis({ beats: { bpm: 147, offset: 0, confidence: 0.9 } });
  const plan = planTransition(first, second);
  expect(plan.mode).toBe('beatmatched');
  expect(plan.seconds).toBeGreaterThan(0);
  expect(transitionCompatibility(first, second)).toBeGreaterThan(0.6);
});
it('treats a missing spectral profile neutrally, but keeps a real spectral clash distinct', () => {
  const bass = analysis({ profile: { bass: 1, low: 0, mid: 0, high: 0 } });
  const high = analysis({ profile: { bass: 0, low: 0, mid: 0, high: 1 } });
  const missing = analysis({ profile: { bass: 0, low: 0, mid: 0, high: 0 } });
  expect(transitionCompatibility(bass, missing)).toBeGreaterThan(
    transitionCompatibility(bass, high),
  );
  expect(Number.isFinite(transitionCompatibility(bass, missing))).toBe(true);
});

it('bounds residual drift even for near half-time tempos', () => {
  const out = analysis({ beats: { bpm: 120, offset: 0.05, confidence: 0.9 } });
  const into = analysis({ beats: { bpm: 61.5, offset: 0.05, confidence: 0.9 } });
  const plan = planTransition(out, into);
  expect(plan.mode).toBe('beatmatched');
  const driftSeconds = plan.seconds * Math.abs(1 - (61.5 * 2) / 120);
  expect(driftSeconds).toBeLessThanOrEqual((DRIFT_BEATS * 60) / 120 + 0.01);
});

it('treats adjacent tempos across the folding boundary as close, not half-time', () => {
  const out = analysis({ beats: { bpm: 147, offset: 0.05, confidence: 0.9 } });
  const into = analysis({ beats: { bpm: 149, offset: 0.05, confidence: 0.9 } });
  const plan = planTransition(out, into);
  expect(plan.mode).toBe('beatmatched');
  expect(plan.seconds).toBeGreaterThan(10);
  expect(plan.notes.join(' ')).not.toMatch(/Half-time relation/);
});
