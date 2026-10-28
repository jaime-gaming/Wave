import { sourceEnvelope } from './sourceEnvelope';
import { handoverGains } from '../domain/mixPlanner';
vi.mock('./sourceEnvelope', () => ({ sourceEnvelope: vi.fn().mockResolvedValue(undefined) }));
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { MixAudio } from './MixAudio';
let elements: HTMLAudioElement[], engine: MixAudio;
const callbacks = () => ({
  time: vi.fn(),
  duration: vi.fn(),
  buffering: vi.fn(),
  ended: vi.fn(),
  error: vi.fn(),
  tick: vi.fn(),
  warning: vi.fn(),
  reset: vi.fn(),
});
beforeEach(() => {
  vi.mocked(sourceEnvelope).mockResolvedValue(undefined);
  vi.useFakeTimers();
  elements = [];
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        const element = document.createElement('audio');
        Object.defineProperty(element, 'duration', { value: 4, writable: true });
        Object.defineProperty(element, 'readyState', { value: 4, writable: true });
        elements.push(element);
        return element;
      }
    },
  );
});
afterEach(() => {
  engine?.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('overlaps two native sources, advances their identity and applies complementary gains', async () => {
  const events = callbacks();
  engine = new MixAudio(events);
  const a = new Blob(['a']),
    b = new Blob(['b']);
  engine.load(a);
  await engine.play();
  engine.prepare(b);
  elements[0].currentTime = 2;
  const started = vi.fn();
  engine.transition(b, 2, () => true, started);
  await Promise.resolve();
  expect(started).toHaveBeenCalledOnce();
  expect(engine.element).toBe(elements[1]);
  expect(engine.transitioning).toBe(true);
  expect(engine.outgoingBlob).toBe(a);
  elements[1].currentTime = 1;
  vi.advanceTimersByTime(1000);
  expect(elements[0].volume).toBeCloseTo(Math.SQRT1_2);
  expect(elements[1].volume).toBeCloseTo(Math.SQRT1_2);
  engine.setVolume(0.37);
  expect(Math.hypot(elements[0].volume, elements[1].volume)).toBeCloseTo(0.37);
  engine.setVolume(0);
  expect(elements.map((element) => element.volume)).toEqual([0, 0]);
  expect(elements.every((element) => element.muted)).toBe(true);
  engine.setVolume(0.37);
  elements[1].currentTime = 2;
  vi.advanceTimersByTime(1000);
  expect(engine.transitioning).toBe(false);
  expect(elements[0].hasAttribute('src')).toBe(false);
  expect(elements[1].volume).toBeCloseTo(0.37);
});
it('keeps the song on the native element when the audio context cannot run', async () => {
  // A suspended context would swallow the audio: a media element routed into it
  // no longer reaches the speakers. Playback must stay unplugged instead.
  const context = {
    state: 'suspended',
    currentTime: 0,
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowshelf',
      frequency: { value: 0 },
      gain: { value: 0, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 1, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  vi.stubGlobal('AudioContext', function AudioContext() {
    return context;
  });
  engine = new MixAudio(callbacks());
  engine.setMixEnabled(true);
  // Creating the context at mount is what caused silence: nothing is built yet.
  expect(context.createMediaElementSource).not.toHaveBeenCalled();
  engine.load(new Blob(['a']));
  await engine.play();
  expect(context.createMediaElementSource).not.toHaveBeenCalled();
  expect(elements[0].volume).toBe(1);
  expect(elements[0].muted).toBe(false);
});

it('routes through the graph only once the context is running', async () => {
  const context = {
    state: 'suspended',
    currentTime: 0,
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowshelf',
      frequency: { value: 0 },
      gain: { value: 0, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 1, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => undefined),
  };
  vi.stubGlobal('AudioContext', function AudioContext() {
    return context;
  });
  engine = new MixAudio(callbacks());
  engine.setMixEnabled(true);
  engine.load(new Blob(['a']));
  await engine.play();
  expect(context.resume).toHaveBeenCalled();
  expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
});

it('cancels the outgoing tail on seek/pause and revokes all source URLs on destruction', async () => {
  engine = new MixAudio(callbacks());
  engine.load(new Blob(['a']));
  await engine.play();
  const next = new Blob(['b']);
  engine.prepare(next);
  elements[0].currentTime = 2;
  engine.transition(
    next,
    2,
    () => true,
    () => {},
  );
  await Promise.resolve();
  engine.seek(1);
  expect(engine.transitioning).toBe(false);
  expect(elements[0].hasAttribute('src')).toBe(false);
  expect(engine.element.currentTime).toBe(1);
  expect(engine.element.volume).toBe(1);
  engine.pause();
  engine.destroy();
  expect(elements.every((element) => !element.hasAttribute('src'))).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('does not advance for rejected incoming playback and falls back to ordinary transitions', async () => {
  const events = callbacks();
  engine = new MixAudio(events);
  engine.load(new Blob(['a']));
  await engine.play();
  const next = new Blob(['b']);
  engine.prepare(next);
  elements[0].currentTime = 2;
  elements[1].play = vi.fn().mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'));
  const started = vi.fn();
  engine.transition(next, 2, () => true, started);
  await Promise.resolve();
  await Promise.resolve();
  expect(started).not.toHaveBeenCalled();
  expect(engine.element).toBe(elements[0]);
  expect(engine.element.volume).toBe(1);
  expect(events.warning).toHaveBeenCalledOnce();
});
it('discards a pending transition when the queue changes or playback is paused', async () => {
  engine = new MixAudio(callbacks());
  engine.load(new Blob(['a']));
  await engine.play();
  const next = new Blob(['b']);
  engine.prepare(next);
  elements[0].currentTime = 2;
  const started = vi.fn();
  engine.transition(next, 2, () => false, started);
  await Promise.resolve();
  expect(started).not.toHaveBeenCalled();
  expect(engine.element).toBe(elements[0]);
  engine.transition(next, 2, () => true, started);
  engine.pause();
  await Promise.resolve();
  expect(started).not.toHaveBeenCalled();
});
it('ignores outgoing ended/errors and switches current lyric clock to the incoming element', async () => {
  const events = callbacks();
  engine = new MixAudio(events);
  engine.load(new Blob(['a']));
  await engine.play();
  const next = new Blob(['b']);
  engine.prepare(next);
  elements[0].currentTime = 2;
  engine.transition(
    next,
    2,
    () => true,
    () => {},
  );
  await Promise.resolve();
  elements[0].dispatchEvent(new Event('ended'));
  elements[0].dispatchEvent(new Event('error'));
  expect(events.ended).not.toHaveBeenCalled();
  expect(events.error).not.toHaveBeenCalled();
  elements[1].currentTime = 0.25;
  elements[1].dispatchEvent(new Event('timeupdate'));
  expect(events.time).toHaveBeenLastCalledWith(0.25);
});
it('uses equal-power gains and reports real mix progress, clearing it on cancellation', async () => {
  const events = { ...callbacks(), blend: vi.fn() };
  engine = new MixAudio(events);
  const a = new Blob(['a']),
    b = new Blob(['b']);
  engine.load(a);
  await engine.play();
  engine.prepare(b);
  elements[0].currentTime = 2;
  engine.transition(
    b,
    2,
    () => true,
    () => {},
  );
  await Promise.resolve();
  elements[1].currentTime = 0.5;
  vi.advanceTimersByTime(500);
  expect(elements[1].volume).toBeCloseTo(Math.sin(Math.PI / 8));
  expect(elements[0].volume).toBeCloseTo(Math.cos(Math.PI / 8));
  expect(Math.hypot(elements[0].volume, elements[1].volume)).toBeCloseTo(1);
  expect(events.blend).toHaveBeenLastCalledWith(
    expect.objectContaining({ outgoing: a, incoming: b, seconds: 2, progress: expect.any(Number) }),
  );
  engine.pause();
  expect(events.blend).toHaveBeenLastCalledWith(null);
});
it('a stale incoming play resolution cannot pause a newer transition on the same deck', async () => {
  engine = new MixAudio(callbacks());
  const a = new Blob(['a']),
    b = new Blob(['b']);
  engine.load(a);
  await engine.play();
  engine.prepare(b);
  elements[0].currentTime = 2;
  let oldResolve!: () => void, newResolve!: () => void;
  vi.spyOn(elements[1], 'play')
    .mockImplementationOnce(() => new Promise<void>((r) => (oldResolve = r)))
    .mockImplementationOnce(() => new Promise<void>((r) => (newResolve = r)));
  const pause = vi.spyOn(elements[1], 'pause'),
    oldStarted = vi.fn(),
    newStarted = vi.fn();
  engine.transition(b, 2, () => true, oldStarted);
  engine.cancelTransition();
  const pauses = pause.mock.calls.length;
  engine.transition(b, 2, () => true, newStarted);
  oldResolve();
  await Promise.resolve();
  expect(pause).toHaveBeenCalledTimes(pauses);
  expect(oldStarted).not.toHaveBeenCalled();
  newResolve();
  await Promise.resolve();
  expect(newStarted).toHaveBeenCalledOnce();
  expect(engine.element).toBe(elements[1]);
});
it('an obsolete play rejection cannot cancel a fresh play intent', async () => {
  engine = new MixAudio(callbacks());
  engine.load(new Blob(['a']));
  let rejectOld!: (e: Error) => void;
  vi.spyOn(elements[0], 'play')
    .mockImplementationOnce(() => new Promise<void>((_, reject) => (rejectOld = reject)))
    .mockResolvedValue(undefined);
  const stale = engine.play();
  engine.pause();
  await engine.play();
  rejectOld(new DOMException('Old request', 'NotAllowedError'));
  await expect(stale).resolves.toBeUndefined();
  const b = new Blob(['b']);
  engine.prepare(b);
  elements[0].currentTime = 2;
  const started = vi.fn();
  engine.transition(b, 2, () => true, started);
  await Promise.resolve();
  expect(started).toHaveBeenCalledOnce();
});

it('mixes from conservative cue points with the unshifted recording clock and original native blobs', async () => {
  const values = new Float32Array(200);
  values.fill(0.1, 20, 180);
  vi.mocked(sourceEnvelope).mockResolvedValue({ step: 0.1, values });
  const events = { ...callbacks(), blend: vi.fn() };
  engine = new MixAudio(events);
  const a = new Blob(['original a']),
    b = new Blob(['original b']);
  engine.load(a);
  Object.defineProperty(elements[0], 'duration', { value: 20 });
  engine.setMixEnabled(true);
  await engine.play();
  engine.prepare(b);
  Object.defineProperty(elements[1], 'duration', { value: 20 });
  elements[1].dispatchEvent(new Event('loadedmetadata'));
  await Promise.resolve();
  elements[0].currentTime = 16.2;
  expect(engine.mixRemaining).toBeCloseTo(2);
  engine.transition(
    b,
    2,
    () => true,
    () => {},
  );
  await Promise.resolve();
  expect(elements[1].currentTime).toBeCloseTo(1.85);
  expect(engine.active.blob).toBe(b);
  elements[1].currentTime = 2.15;
  vi.advanceTimersByTime(100);
  expect(elements[1].volume).toBeCloseTo(handoverGains(0.15).incoming);
  expect(Math.hypot(...elements.map((a) => a.volume))).toBeCloseTo(1);
  expect(events.time).toHaveBeenLastCalledWith(2.15);
  expect(events.blend).toHaveBeenLastCalledWith(
    expect.objectContaining({ progress: expect.closeTo(0.15), outgoing: a, incoming: b }),
  );
  engine.pause();
  engine.setMixEnabled(false);
  expect(engine.mixRemaining).toBeCloseTo(17.85);
});

it('executes a beat-matched plan with cue, stretch and equal-power gains', async () => {
  const events = { ...callbacks(), blend: vi.fn() };
  vi.mocked(sourceEnvelope).mockResolvedValue(undefined);
  engine = new MixAudio(events);
  const a = new Blob(['song a']),
    b = new Blob(['song b']);
  engine.load(a);
  Object.defineProperty(elements[0], 'duration', { value: 30 });
  engine.setMixEnabled(true);
  await engine.play();
  engine.prepare(b);
  Object.defineProperty(elements[1], 'duration', { value: 30 });
  elements[1].dispatchEvent(new Event('loadedmetadata'));
  await Promise.resolve();

  elements[0].currentTime = 26;
  engine.transitionWithPlan(
    b,
    {
      mode: 'beatmatched',
      seconds: 4,
      startAt: 26,
      cue: 12.5,
      incomingRate: 0.96,
      stretched: true,
      bassSwapAt: 0.5,
      bars: 8,
      phaseAligned: true,
      notes: [],
    },
    () => true,
    () => {},
  );
  await Promise.resolve();
  // The incoming deck starts at the planned cue with a gentle tempo match that
  // preserves pitch, and its gain starts from silence.
  expect(elements[1].currentTime).toBeCloseTo(12.5);
  expect(elements[1].playbackRate).toBeCloseTo(0.96);
  expect(elements[1].preservesPitch).toBe(true);
  expect(elements[1].volume).toBeCloseTo(0);

  // Halfway through, both decks sit at equal power.
  elements[1].currentTime = 14.5;
  vi.advanceTimersByTime(100);
  expect(Math.hypot(elements[0].volume, elements[1].volume)).toBeCloseTo(1, 4);
  expect(events.blend).toHaveBeenLastCalledWith(
    expect.objectContaining({ incoming: b, outgoing: a }),
  );

  // After the overlap the outgoing file is released and the rate returns to 1.
  elements[1].currentTime = 16.5;
  vi.advanceTimersByTime(100);
  expect(elements[1].playbackRate).toBe(1);
});

it('ignores a cut plan instead of joining two songs abruptly', async () => {
  const events = { ...callbacks(), blend: vi.fn() };
  engine = new MixAudio(events);
  const a = new Blob(['a']),
    b = new Blob(['b']);
  engine.load(a);
  engine.setMixEnabled(true);
  await engine.play();
  engine.prepare(b);
  elements[1].dispatchEvent(new Event('loadedmetadata'));
  await Promise.resolve();
  engine.transitionWithPlan(
    b,
    {
      mode: 'cut',
      seconds: 0,
      startAt: 0,
      cue: 0,
      incomingRate: 1,
      stretched: false,
      bassSwapAt: 0.5,
      bars: 0,
      phaseAligned: false,
      notes: [],
    },
    () => true,
    () => {},
  );
  await Promise.resolve();
  expect(engine.transitioning).toBe(false);
});

it('reports analysed tempo so the planner can stretch a deck', () => {
  engine = new MixAudio(callbacks());
  const blob = new Blob(['x']);
  engine.setAnalysis(blob, {
    duration: 200,
    frameSeconds: 0.02,
    beats: { bpm: 126, offset: 0, confidence: 0.9 },
    trimmed: { start: 0, end: 200 },
    segments: [],
    vocals: [],
    profile: { bass: 0.3, low: 0.2, mid: 0.3, high: 0.2 },
    peak: 0.9,
  });
  expect(engine.analysisFor(blob)?.beats.bpm).toBe(126);
  expect(engine.stretchFor(blob, 120)).toBeCloseTo(0.952, 3);
  expect(engine.stretchFor(blob, 160)).toBe(1);
  expect(engine.analysisFor(undefined)).toBeUndefined();
});

it('moves the low end and closes the outgoing top when a mix is possible', async () => {
  // A minimal AudioContext with the two filters each deck needs.
  const param = () => {
    const value = {
      value: 0,
      targets: [] as number[],
      setTargetAtTime(v: number) {
        this.value = v;
        this.targets.push(v);
      },
    };
    return value;
  };
  const node = () => ({ connect: () => undefined, disconnect: () => undefined });
  const filters: {
    type: string;
    frequency: ReturnType<typeof param>;
    gain: ReturnType<typeof param>;
  }[] = [];
  const context = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    destination: node(),
    createMediaElementSource: () => node(),
    createBiquadFilter: () => {
      const filter = { ...node(), type: 'lowpass', frequency: param(), gain: param() };
      filters.push(filter);
      return filter;
    },
    createGain: () => ({ ...node(), gain: param() }),
    resume: async () => undefined,
    close: async () => undefined,
  };
  vi.stubGlobal('AudioContext', function AudioContext() {
    return context;
  });
  engine = new MixAudio(callbacks());
  const a = new Blob(['first']),
    b = new Blob(['second']);
  engine.load(a);
  Object.defineProperty(elements[0], 'duration', { value: 30 });
  engine.setMixEnabled(true);
  await engine.play();
  engine.prepare(b);
  Object.defineProperty(elements[1], 'duration', { value: 30 });
  elements[1].dispatchEvent(new Event('loadedmetadata'));
  await Promise.resolve();
  expect(filters.length).toBeGreaterThanOrEqual(4);
  const [outShelf, outAir, inShelf, inAir] = filters;
  expect(outShelf.type).toBe('lowshelf');
  expect(inAir.type).toBe('lowpass');

  elements[0].currentTime = 26;
  engine.transition(
    b,
    4,
    () => true,
    () => {},
  );
  await Promise.resolve();
  elements[1].currentTime = 2;
  vi.advanceTimersByTime(100);
  // Halfway through the overlap the low end has changed hands...
  expect(outShelf.gain.value).toBeLessThan(-10);
  expect(inShelf.gain.value).toBeGreaterThan(-10);
  // ...and the outgoing song has lost its top.
  expect(outAir.frequency.value).toBeLessThan(20_000);
  // The incoming song is never filtered.
  expect(inAir.frequency.value).toBe(20_000);

  // When the handover ends nothing stays filtered or shifted.
  elements[1].currentTime = 6;
  vi.advanceTimersByTime(100);
  expect(inAir.frequency.value).toBe(20_000);
  expect(inShelf.gain.value).toBe(0);
});
