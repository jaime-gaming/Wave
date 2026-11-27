import { describe, expect, it } from 'vitest';
import { type TrackAnalysis } from '../audio/dsp';
import {
  alignInstrumentalPulse,
  barPhase,
  downbeats,
  instrumentalEdges,
  MIN_INSTRUMENTAL_SECONDS,
  pulseGrid,
  pulsesMeet,
  type InstrumentalPair,
  type PulseGrid,
} from './instrumentalPulse';

const analysis = (over: Partial<TrackAnalysis> = {}): TrackAnalysis => ({
  duration: 240,
  frameSeconds: 0.02,
  beats: { bpm: 120, offset: 0.05, confidence: 0.9 },
  trimmed: { start: 1, end: 238 },
  segments: [{ start: 1, end: 238, level: 0.8, kind: 'body' }],
  vocals: [],
  profile: { bass: 0.4, low: 0.2, mid: 0.3, high: 0.1 },
  peak: 0.9,
  ...over,
});

const withVocals = (over: Partial<TrackAnalysis> = {}) =>
  analysis({
    vocals: [{ start: 36, end: 210, strength: 0.85 }, ...(over.vocals ?? [])],
    ...over,
  });

const gridA: PulseGrid = { bpm: 120, offset: 0.05 };
const gridB: PulseGrid = { bpm: 120, offset: 0.95 };

describe('instrumental edges', () => {
  it('finds an instrumental outro and an instrumental intro from the vocal regions', () => {
    const edges = instrumentalEdges(withVocals(), withVocals());
    expect(edges).toEqual({
      outgoing: { start: 210, end: 238 },
      incoming: { start: 1, end: 36 },
    });
  });

  it('does nothing when either record has no vocal regions at all', () => {
    expect(instrumentalEdges(analysis(), withVocals())).toBeUndefined();
    expect(instrumentalEdges(withVocals(), analysis())).toBeUndefined();
  });

  it('does nothing when the last word runs into the final fade', () => {
    const sungToTheEnd = withVocals({ vocals: [{ start: 36, end: 237.8, strength: 0.9 }] });
    expect(instrumentalEdges(sungToTheEnd, withVocals())).toBeUndefined();
  });

  it('does nothing when the incoming song opens with a voice', () => {
    const opensSinging = withVocals({ vocals: [{ start: 1, end: 210, strength: 0.9 }] });
    expect(instrumentalEdges(withVocals(), opensSinging)).toBeUndefined();
  });

  it('ignores a gap between phrases that is shorter than a section', () => {
    const shortTail = withVocals({
      vocals: [{ start: 36, end: 238 - MIN_INSTRUMENTAL_SECONDS + 0.5, strength: 0.9 }],
    });
    expect(instrumentalEdges(shortTail, withVocals())).toBeUndefined();
  });
});

describe('pulse grids', () => {
  it('only trusts a steady, usable tempo grid', () => {
    expect(pulseGrid(analysis())).toEqual(gridA);
    expect(
      pulseGrid(analysis({ beats: { bpm: 120, offset: 0, confidence: 0.2 } })),
    ).toBeUndefined();
    expect(pulseGrid(analysis({ beats: { bpm: 40, offset: 0, confidence: 0.9 } }))).toBeUndefined();
  });

  it('measures phase inside a four-beat bar and lists downbeats', () => {
    expect(barPhase(0.05, gridA)).toBeCloseTo(0, 6);
    expect(barPhase(1.05, gridA)).toBeCloseTo(1, 6);
    expect(barPhase(2.05, gridA)).toBeCloseTo(0, 6);
    expect(downbeats(gridB, 10, 18)).toEqual([10.95, 12.95, 14.95, 16.95]);
  });
});

describe('alignInstrumentalPulse', () => {
  const edges: InstrumentalPair = {
    outgoing: { start: 210, end: 238 },
    incoming: { start: 1, end: 36 },
  };
  const base = {
    startAt: 216.05,
    cue: 16.95,
    seconds: 20,
    maxCue: 35,
    minSeconds: 1.5,
    driftPerSecond: 0,
    driftBeats: 1.5,
  };

  it('puts both instrumental stretches on their own downbeat', () => {
    const aligned = alignInstrumentalPulse(edges, gridA, gridB, base);
    expect(aligned).toBeDefined();
    expect(pulsesMeet(aligned!, gridA, gridB)).toBe(true);
    expect(aligned!.startAt).toBe(216.05);
    expect(aligned!.cue).toBe(16.95);

    expect(aligned!.seconds).toBe(18);
    expect(aligned!.bars).toBe(9);
    expect(aligned!.notes.join(' ')).toMatch(/instrumental outro and intro/i);
  });

  it('only moves a cue by whole bars and keeps the overlap inside both edges', () => {
    const aligned = alignInstrumentalPulse(edges, gridA, gridB, {
      ...base,
      cue: 15.2,
      startAt: 219,
    });
    expect(aligned).toBeDefined();
    expect(downbeats(gridA, edges.outgoing.start, edges.outgoing.end)).toContain(aligned!.startAt);
    expect(downbeats(gridB, edges.incoming.start, edges.incoming.end)).toContain(aligned!.cue);
    expect(aligned!.startAt + aligned!.seconds).toBeLessThanOrEqual(edges.outgoing.end + 1e-6);
    expect(aligned!.cue + aligned!.seconds).toBeLessThanOrEqual(edges.incoming.end + 1e-6);
    expect(aligned!.seconds).toBeCloseTo(aligned!.bars * 2, 6);
  });

  it('bounds the overlap when the two instrumental tempos drift', () => {
    const faster: PulseGrid = { bpm: 126, offset: 0.4 };
    const aligned = alignInstrumentalPulse(edges, gridA, faster, {
      ...base,
      driftPerSecond: Math.abs(1 - 126 / 120),
    });
    expect(aligned).toBeDefined();
    expect(aligned!.seconds).toBeLessThan(20);
    expect(aligned!.notes.join(' ')).toMatch(/drift/i);
  });

  it('gives up instead of guessing when no downbeat fits', () => {
    expect(
      alignInstrumentalPulse(
        { outgoing: { start: 210, end: 214 }, incoming: { start: 1, end: 4 } },
        gridA,
        gridB,
        base,
      ),
    ).toBeUndefined();
  });
});
