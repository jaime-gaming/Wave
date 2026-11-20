import { describe, expect, it } from 'vitest';
import { type TrackAnalysis } from '../audio/dsp';
import {
  alignIncomingLyrics,
  planTransition,
  realignPlan,
  type TransitionPlan,
} from './mixPlanner';
import { barPhase, instrumentalEdges, pulseGrid, type PulseGrid } from './instrumentalPulse';
import { parseLyrics } from './lyrics';

const analysis = (over: Partial<TrackAnalysis> = {}): TrackAnalysis => ({
  duration: 240,
  frameSeconds: 0.02,
  beats: { bpm: 120, offset: 0.05, confidence: 0.9 },
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

/** Both records sing from 36 s to 210 s: instrumental intro and outro at the edges. */
const instrumentalPair = (over: Partial<TrackAnalysis> = {}) =>
  analysis({
    vocals: [{ start: 36, end: 210, strength: 0.85 }],
    ...over,
  });

describe('Mix: instrumental outro and intro pulse alignment', () => {
  it('lines both instrumental stretches up on their own downbeat', () => {
    const outgoing = instrumentalPair();
    const incoming = instrumentalPair({
      beats: { bpm: 120, offset: 0.95, confidence: 0.9 },
    });
    const plan = planTransition(outgoing, incoming);
    expect(plan.mode).toBe('beatmatched');
    expect(plan.instrumentalPulseAligned).toBe(true);
    expect(plan.notes.join(' ')).toMatch(/instrumental outro and intro/i);

    const gridA = pulseGrid(outgoing)!;
    const gridB = pulseGrid(incoming)!;
    expect(barPhase(plan.startAt, gridA)).toBeCloseTo(0, 3);
    expect(barPhase(plan.cue, gridB)).toBeCloseTo(0, 3);

    // The whole handover stays inside the two instrumental stretches.
    const edges = instrumentalEdges(outgoing, incoming)!;
    expect(plan.startAt).toBeGreaterThanOrEqual(edges.outgoing.start);
    expect(plan.startAt + plan.seconds).toBeLessThanOrEqual(edges.outgoing.end);
    expect(plan.cue).toBeGreaterThanOrEqual(edges.incoming.start);
    expect(plan.cue + plan.seconds).toBeLessThanOrEqual(edges.incoming.end);
    expect(plan.seconds).toBeCloseTo(plan.bars * 2, 6);
    expect(plan.vocalOverlap).toBe(false);
  });

  it('leaves an ordinary pair exactly as it was', () => {
    const outgoing = analysis();
    const incoming = analysis({ beats: { bpm: 120, offset: 0.95, confidence: 0.9 } });
    const before = planTransition(outgoing, incoming);
    expect(before.instrumentalPulseAligned).toBeUndefined();
    // No vocals on either side means no instrumental edges to reconcile.
    expect(instrumentalEdges(outgoing, incoming)).toBeUndefined();
    expect(before.mode).toBe('beatmatched');
  });

  it('does not realign when only one side has an instrumental edge', () => {
    const plan = planTransition(instrumentalPair(), analysis());
    expect(plan.instrumentalPulseAligned).toBeUndefined();
  });

  it('does not align a pair whose grids cannot be trusted', () => {
    const unsteady = instrumentalPair({
      beats: { bpm: 120, offset: 0.05, confidence: 0.1 },
    });
    const plan = planTransition(unsteady, instrumentalPair());
    expect(plan.mode).not.toBe('beatmatched');
    expect(plan.instrumentalPulseAligned).toBeUndefined();
  });

  it('keeps the downbeat alignment when timed lyrics are available', () => {
    const plan = planTransition(
      instrumentalPair(),
      instrumentalPair({ beats: { bpm: 120, offset: 0.95, confidence: 0.9 } }),
    );
    const lyrics = parseLyrics('[00:24.00]A line that would otherwise pull the cue back');
    expect(alignIncomingLyrics(plan, lyrics).cue).toBe(plan.cue);
  });

  it('stays on the bar when the plan is re-anchored to a late player clock', () => {
    const outgoing = instrumentalPair();
    const plan: TransitionPlan = planTransition(
      outgoing,
      instrumentalPair({ beats: { bpm: 120, offset: 0.95, confidence: 0.9 } }),
    );
    const realigned = realignPlan(plan, plan.startAt + 2.1);
    expect(realigned).not.toBeNull();
    expect(realigned!.instrumentalPulseAligned).toBe(true);
    const gridA: PulseGrid = { bpm: 120, offset: 0.05 };
    expect(barPhase(realigned!.startAt, gridA)).toBeCloseTo(0, 3);
  });
});
