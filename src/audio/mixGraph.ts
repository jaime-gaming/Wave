import type { TrackAnalysis } from './dsp';

/**
 * Web Audio routing for Mix.
 *
 * Each deck gets `source → low shelf → gain → low-pass → destination`. The shelf
 * is what makes a bass swap possible: the outgoing kick and sub-bass are rolled
 * off while the incoming ones open, so the two songs never fight for the same low
 * end. The low-pass is what makes the handover audible as a mix: the outgoing
 * song loses its top as it leaves instead of simply getting quieter.
 *
 * The graph is additive, never destructive: it sits between the native element
 * and the speakers. The file, its sample rate, its bit depth and its bitrate are
 * untouched; nothing is re-encoded. If Web Audio is unavailable the engine falls
 * back to plain element volume, which sounds the same minus the bass swap.
 */
export interface DeckChain {
  gain: GainNode;
  bass: BiquadFilterNode;
  air: BiquadFilterNode;
}

/** Low shelf corner: below this, the deck is the "bass" deck or it is not. */
export const BASS_SHELF_HZ = 180;
/** How far down the outgoing low end goes at the swap point. */
export const BASS_CUT_DB = -22;
/** A deck with its low-pass wide open: no audible change to the file. */
export const OPEN_AIR_HZ = 20_000;
/** Where the outgoing song's top ends up as it leaves the mix. */
export const CLOSED_AIR_HZ = 1_600;

type Chain = { gain: AudioParam; bass: AudioParam; air: AudioParam };

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
        const air = this.context.createBiquadFilter();
        air.type = 'lowpass';
        air.frequency.value = OPEN_AIR_HZ;
        source.connect(bass);
        bass.connect(gain);
        gain.connect(air);
        air.connect(this.context.destination);
        this.sources.add(source);
        chain = { gain: gain.gain, bass: bass.gain, air: air.frequency };
        this.chains.set(element, chain);
      } catch {
        return null;
      }
    }
    return {
      gain: chain.gain as unknown as GainNode,
      bass: chain.bass as unknown as BiquadFilterNode,
      air: chain.air as unknown as BiquadFilterNode,
    };
  }

  setGain(element: HTMLAudioElement, value: number, at = 0): void {
    const chain = this.chains.get(element);
    if (!chain) return;
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (at > 0) chain.gain.setTargetAtTime(safe, this.context.currentTime + at, 0.02);
    else chain.gain.value = safe;
  }

  /**
   * Sets the low-pass corner of a deck. Used only during a mix and always
   * returned to `OPEN_AIR_HZ` afterwards, so nothing is filtered in normal
   * playback.
   */
  setAir(element: HTMLAudioElement, hertz: number, at = 0): void {
    const chain = this.chains.get(element);
    if (!chain) return;
    const safe = Number.isFinite(hertz)
      ? Math.max(CLOSED_AIR_HZ, Math.min(OPEN_AIR_HZ, hertz))
      : OPEN_AIR_HZ;
    if (at > 0) chain.air.setTargetAtTime(safe, this.context.currentTime + at, 0.06);
    else chain.air.value = safe;
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
  // The low end changes hands early — on the incoming song's first bars — because
  // that is where the listener expects the new record to take over.
  const t = Math.max(0, Math.min(1, p / 0.55));
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

/**
 * Low-pass corner for the outgoing deck across a mix, in hertz.
 *
 * The top is untouched for the first half (the two songs still have to sound
 * like themselves), then rolls down so the old song is unmistakably leaving.
 * Playback only: the element, the file and its samples are never changed, and
 * the corner returns to `OPEN_AIR_HZ` when the handover finishes.
 */
export function filterOutHz(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  const t = Math.max(0, Math.min(1, (p - 0.45) / 0.5));
  const smooth = t * t * (3 - 2 * t);
  // Exponential sweep: 20 kHz → 1.6 kHz reads as a filter, not as a fade.
  const value = OPEN_AIR_HZ * Math.pow(CLOSED_AIR_HZ / OPEN_AIR_HZ, smooth);
  return Math.round(value);
}
