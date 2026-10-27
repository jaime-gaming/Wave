import type { TrackAnalysis } from './dsp';

/**
 * Web Audio routing for Mix.
 *
 * Each deck gets `source → low shelf → gain → destination`. The shelf is what
 * makes a bass swap possible: the outgoing kick and sub-bass are rolled off while
 * the incoming ones open, so the two songs never fight for the same low end.
 *
 * The graph is additive, never destructive: it sits between the native element
 * and the speakers. The file, its sample rate, its bit depth and its bitrate are
 * untouched; nothing is re-encoded. If Web Audio is unavailable the engine falls
 * back to plain element volume, which sounds the same minus the bass swap.
 */
export interface DeckChain {
  gain: GainNode;
  bass: BiquadFilterNode;
}

/** Low shelf corner: below this, the deck is the "bass" deck or it is not. */
export const BASS_SHELF_HZ = 180;
/** How far down the outgoing low end goes at the swap point. */
export const BASS_CUT_DB = -22;

type Chain = { gain: AudioParam; bass: AudioParam };

export class MixGraph {
  private readonly context: AudioContext;
  private readonly chains = new Map<HTMLAudioElement, Chain>();
  private readonly sources = new Set<MediaElementAudioSourceNode>();

  private constructor(context: AudioContext) {
    this.context = context;
  }

  /** Returns null when Web Audio is unavailable (old browser, jsdom, private mode). */
  static create(): MixGraph | null {
    if (typeof AudioContext === 'undefined') return null;
    try {
      const context = new AudioContext();
      return new MixGraph(context);
    } catch {
      return null;
    }
  }

  get available(): boolean {
    return this.context.state !== 'closed';
  }

  /**
   * True only while the context is actually producing sound.
   *
   * This matters more than it looks: once an element is attached to a source
   * node, its audio no longer reaches the speakers by itself. A suspended
   * context would therefore make the song play silently. Nothing is attached
   * until this is true.
   */
  get running(): boolean {
    // `state` is narrowed by the DOM lib; a suspended context makes no sound.
    return (this.context.state as AudioContextState) === 'running';
  }

  /**
   * Web Audio starts suspended until a user gesture. Returns whether the graph
   * can be used right now; a browser that refuses keeps playback unplugged.
   */
  async resume(): Promise<boolean> {
    if (this.running) return true;
    try {
      await this.context.resume();
    } catch {
      return false;
    }
    return this.running;
  }

  /**
   * Connects a deck once. `createMediaElementSource` throws if called twice for
   * the same element, so chains are cached and reused.
   */
  chain(element: HTMLAudioElement): DeckChain | null {
    let chain = this.chains.get(element);
    if (!chain) {
      try {
        const source = this.context.createMediaElementSource(element);
        const bass = this.context.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = BASS_SHELF_HZ;
        bass.gain.value = 0;
        const gain = this.context.createGain();
        gain.gain.value = 1;
        source.connect(bass);
        bass.connect(gain);
        gain.connect(this.context.destination);
        this.sources.add(source);
        chain = { gain: gain.gain, bass: bass.gain };
        this.chains.set(element, chain);
      } catch {
        return null;
      }
    }
    return {
      gain: chain.gain as unknown as GainNode,
      bass: chain.bass as unknown as BiquadFilterNode,
    };
  }

  setGain(element: HTMLAudioElement, value: number, at = 0): void {
    const chain = this.chains.get(element);
    if (!chain) return;
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (at > 0) chain.gain.setTargetAtTime(safe, this.context.currentTime + at, 0.02);
    else chain.gain.value = safe;
  }

  setBass(element: HTMLAudioElement, decibels: number, at = 0): void {
    const chain = this.chains.get(element);
    if (!chain) return;
    const safe = Number.isFinite(decibels) ? Math.max(BASS_CUT_DB, Math.min(9, decibels)) : 0;
    if (at > 0) chain.bass.setTargetAtTime(safe, this.context.currentTime + at, 0.05);
    else chain.bass.value = safe;
  }

  /** Releases the context. Sources cannot be detached, so they are left silent. */
  async close(): Promise<void> {
    for (const source of this.sources) {
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.sources.clear();
    this.chains.clear();
    try {
      await this.context.close();
    } catch {
      // Nothing to release.
    }
  }
}

/** Bass shelf value for a deck at a given point of the swap. */
export function bassShelfDb(role: 'outgoing' | 'incoming', progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  const t = Math.max(0, Math.min(1, (p - 0.28) / 0.44));
  const smooth = t * t * (3 - 2 * t);
  const value = role === 'outgoing' ? BASS_CUT_DB * smooth : BASS_CUT_DB * (1 - smooth);
  // Normalise -0 so setBass and tests see a plain zero.
  return value === 0 ? 0 : value;
}

/**
 * Playback rate for the incoming deck while it is being beat matched. Pitch is
 * preserved by the browser, so this is a small tempo adjustment, not a chipmunk
 * effect, and it is reverted as soon as the transition ends.
 */
export function stretchRate(analysis: TrackAnalysis | undefined, targetBpm: number): number {
  if (!analysis || analysis.beats.confidence < 0.35) return 1;
  if (!Number.isFinite(targetBpm) || targetBpm <= 0) return 1;
  const rate = targetBpm / analysis.beats.bpm;
  if (!Number.isFinite(rate) || Math.abs(rate - 1) > 0.08) return 1;
  return Math.round(rate * 1000) / 1000;
}
