import { describe, expect, it } from 'vitest';
import {
  EDGE_MAX_SECONDS,
  EDGE_MIN_SECONDS,
  edgeGains,
  edgeRemaining,
  planEdgeHandover,
} from './edgeMix';

describe('handovers with YouTube songs', () => {
  it('sizes the window from the shorter song and keeps it bounded', () => {
    expect(planEdgeHandover(240, 200).seconds).toBe(EDGE_MAX_SECONDS);
    expect(planEdgeHandover(60, 60).seconds).toBe(8);
    // A 20 s clip gets a 5 s window, not eight.
    expect(planEdgeHandover(240, 20).seconds).toBe(5);
    // Very short songs never produce a window longer than the song itself.
    expect(planEdgeHandover(6, 240).seconds).toBeLessThanOrEqual(2.5);
  });

  it('never asks for less than the minimum and explains itself', () => {
    const plan = planEdgeHandover(8, 8);
    expect(plan.seconds).toBe(EDGE_MIN_SECONDS);
    expect(plan.notes.join(' ')).toMatch(/short|crossfade/i);
  });

  it('falls back to the minimum when a duration is unknown', () => {
    const plan = planEdgeHandover(0, Number.NaN);
    expect(plan.seconds).toBe(EDGE_MIN_SECONDS);
    expect(plan.notes.join(' ')).toMatch(/unknown/i);
  });

  it('uses equal-power gains so the two sides of the fade match', () => {
    expect(edgeGains(0)).toEqual({ outgoing: 1, incoming: 0 });
    expect(edgeGains(1).outgoing).toBeCloseTo(0);
    const middle = edgeGains(0.5);
    expect(middle.outgoing).toBeCloseTo(middle.incoming);
    expect(Math.hypot(middle.outgoing, middle.incoming)).toBeCloseTo(1);
    // Out of range progress is clamped instead of exploding.
    expect(edgeGains(-2)).toEqual({ outgoing: 1, incoming: 0 });
    expect(edgeGains(9).incoming).toBeCloseTo(1);
  });

  it('reads the remaining time without inventing one', () => {
    expect(edgeRemaining(200, 186)).toBe(14);
    expect(edgeRemaining(200, 400)).toBe(0);
    expect(edgeRemaining(0, 3)).toBe(Number.POSITIVE_INFINITY);
  });
});
