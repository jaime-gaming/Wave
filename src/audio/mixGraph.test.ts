import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASS_CUT_DB, BASS_SHELF_HZ, bassShelfDb, MixGraph, stretchRate } from './mixGraph';
import type { TrackAnalysis } from './dsp';

/** Minimal AudioContext double: enough to verify wiring and automation. */
class FakeParam {
  value = 0;
  targets: number[] = [];
  setTargetAtTime(value: number) {
    this.value = value;
    this.targets.push(value);
  }
}
interface FakeNode {
  connections: FakeNode[];
  connect: (node: FakeNode) => void;
  disconnect: () => void;
}
function fakeNode(): FakeNode {
  const node: FakeNode = {
    connections: [],
    connect(target) {
      node.connections.push(target);
    },
    disconnect() {
      node.connections = [];
    },
  };
  return node;
}
function fakeContext(initialState: 'running' | 'suspended' = 'running') {
  const filters: { type: string; frequency: FakeParam; gain: FakeParam }[] = [];
  const gains: { gain: FakeParam }[] = [];
  const context = {
    state: initialState as 'running' | 'suspended',
    currentTime: 10,
    destination: fakeNode(),
    createMediaElementSource: vi.fn(() => fakeNode()),
    createBiquadFilter: vi.fn(() => {
      const filter = Object.assign(fakeNode(), {
        type: 'lowpass',
        frequency: new FakeParam(),
        gain: new FakeParam(),
      });
      filters.push(filter);
      return filter;
    }),
    createGain: vi.fn(() => {
      const node = Object.assign(fakeNode(), { gain: new FakeParam() });
      gains.push(node);
      return node;
    }),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => undefined),
  };
  return { context, filters, gains };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mix graph', () => {
  it('builds a source → low shelf → gain chain per deck', () => {
    const { context, filters, gains } = fakeContext();
    vi.stubGlobal('AudioContext', function AudioContext() {
      return context;
    });
    const graph = MixGraph.create();
    expect(graph).not.toBeNull();
    const element = document.createElement('audio');
    const chain = graph!.chain(element);
    expect(chain).not.toBeNull();
    expect(filters[0].type).toBe('lowshelf');
    expect(filters[0].frequency.value).toBe(BASS_SHELF_HZ);
    expect(gains[0].gain.value).toBe(1);
    // The chain reaches the speakers.
    const shelf = filters[0] as unknown as FakeNode;
    expect(shelf.connections[0]).toBe(gains[0] as unknown as FakeNode);

    graph!.setGain(element, 0.4);
    expect(gains[0].gain.value).toBe(0.4);
    graph!.setGain(element, 5);
    expect(gains[0].gain.value).toBe(1);
    graph!.setGain(element, Number.NaN);
    expect(gains[0].gain.value).toBe(0);
    graph!.setBass(element, -6, 0.5);
    // Scheduled with a short ramp, which is what avoids a click.
    expect(filters[0].gain.targets.length).toBeGreaterThan(0);
    expect(filters[0].gain.value).toBe(-6);
    graph!.setBass(element, -999);
    expect(filters[0].gain.value).toBe(BASS_CUT_DB);
    expect(graph!.available).toBe(true);
  });

  it('reuses one source per element instead of throwing', () => {
    const { context } = fakeContext();
    vi.stubGlobal('AudioContext', function AudioContext() {
      return context;
    });
    const graph = MixGraph.create()!;
    const element = document.createElement('audio');
    graph.chain(element);
    graph.chain(element);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it('starts suspended and reports whether it can run', async () => {
    const { context } = fakeContext('suspended');
    vi.stubGlobal('AudioContext', function AudioContext() {
      return context;
    });
    const graph = MixGraph.create()!;
    expect(graph.running).toBe(false);
    expect(await graph.resume()).toBe(true);
    expect(graph.running).toBe(true);
  });

  it('reports that it cannot run when the browser refuses to resume', async () => {
    const { context } = fakeContext('suspended');
    context.resume = vi.fn(async () => undefined);
    vi.stubGlobal('AudioContext', function AudioContext() {
      return context;
    });
    const graph = MixGraph.create()!;
    expect(await graph.resume()).toBe(false);
    expect(graph.running).toBe(false);
  });

  it('degrades to nothing when Web Audio is missing', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(MixGraph.create()).toBeNull();
  });
});

describe('bass swap and stretch', () => {
  it('cuts the outgoing low end while opening the incoming one', () => {
    expect(bassShelfDb('outgoing', 0)).toBe(0);
    expect(bassShelfDb('incoming', 0)).toBe(BASS_CUT_DB);
    expect(bassShelfDb('outgoing', 1)).toBe(BASS_CUT_DB);
    expect(bassShelfDb('incoming', 1)).toBe(0);
    const middle = bassShelfDb('outgoing', 0.5);
    expect(middle).toBeLessThan(-5);
    expect(middle).toBeGreaterThan(BASS_CUT_DB);
    expect(bassShelfDb('outgoing', -1)).toBe(0);
  });

  it('only stretches inside the 8 % window', () => {
    const analysis = (bpm: number, confidence = 0.8): TrackAnalysis => ({
      duration: 200,
      frameSeconds: 0.02,
      beats: { bpm, offset: 0, confidence },
      trimmed: { start: 0, end: 200 },
      segments: [],
      vocals: [],
      profile: { bass: 0.3, low: 0.2, mid: 0.3, high: 0.2 },
      peak: 0.9,
    });
    expect(stretchRate(analysis(126), 120)).toBeCloseTo(0.952, 3);
    expect(stretchRate(analysis(120), 120)).toBe(1);
    expect(stretchRate(analysis(150), 120)).toBe(1);
    expect(stretchRate(analysis(126, 0.1), 120)).toBe(1);
    expect(stretchRate(undefined, 120)).toBe(1);
    expect(stretchRate(analysis(126), 0)).toBe(1);
  });
});
