export interface DeckChain {
  gain: GainNode;
  bass: BiquadFilterNode;
  air: BiquadFilterNode;
}

export const MAX_PAN = 0.5;

export const BASS_SHELF_HZ = 180;

export const BASS_CUT_DB = -22;

export const MID_CARVE_HZ = 1_400;

export const MID_CARVE_DB = -3.6;

export const VOCAL_CARVE_DB = -6.0;

export const OPEN_AIR_HZ = 20_000;

export const CLOSED_AIR_HZ = 1_600;

export const INCOMING_OPEN_START_HZ = 4_800;

type Chain = {
  limiter?: AudioParam;
  limiterKnee?: AudioParam;
  normalization: AudioParam;
  gain: AudioParam;
  bass: AudioParam;
  mid?: AudioParam;
  air: AudioParam;
  pan?: AudioParam;
};

export class MixGraph {
  private readonly context: AudioContext;
  private readonly chains = new Map<HTMLAudioElement, Chain>();
  private readonly sources = new Set<MediaElementAudioSourceNode>();

  private constructor(context: AudioContext) {
    this.context = context;
  }

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

  get running(): boolean {
    return (this.context.state as AudioContextState) === 'running';
  }

  async resume(): Promise<boolean> {
    if (this.running) return true;
    try {
      await this.context.resume();
    } catch {
      return false;
    }
    return this.running;
  }

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
        const mid = this.context.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = MID_CARVE_HZ;
        if (mid.Q) mid.Q.value = 0.85;
        mid.gain.value = 0;
        const normalization = this.context.createGain();
        normalization.gain.value = 1;
        source.connect(normalization);

        const limiter = this.context.createDynamicsCompressor?.();
        if (limiter) {
          limiter.threshold.value = 0;
          limiter.knee.value = 0;
          limiter.ratio.value = 12;
          limiter.attack.value = 0.002;
          limiter.release.value = 0.08;
          normalization.connect(limiter);
          limiter.connect(bass);
        } else normalization.connect(bass);
        bass.connect(gain);
        gain.connect(mid);
        mid.connect(air);

        const pan = this.context.createStereoPanner?.();
        if (pan) {
          air.connect(pan);
          pan.connect(this.context.destination);
        } else {
          air.connect(this.context.destination);
        }
        this.sources.add(source);
        chain = {
          ...(limiter ? { limiter: limiter.threshold, limiterKnee: limiter.knee } : {}),
          normalization: normalization.gain,
          gain: gain.gain,
          bass: bass.gain,
          mid: mid.gain,
          air: air.frequency,
          ...(pan ? { pan: pan.pan } : {}),
        };
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

  setNormalization(element: HTMLAudioElement, gain: number, immediate = false): void {
    const chain = this.chains.get(element);
    if (!chain) return;
    const safe = Number.isFinite(gain) ? Math.max(0.01, Math.min(8, gain)) : 1;
    const threshold = safe > 1 ? -1.5 : 0;
    const knee = safe > 1 ? 6 : 0;
    if (immediate) {
      chain.normalization.cancelScheduledValues?.(this.context.currentTime);
      chain.normalization.value = safe;
      if (chain.limiter) {
        chain.limiter.cancelScheduledValues?.(this.context.currentTime);
        chain.limiter.value = threshold;
      }
      if (chain.limiterKnee) {
        chain.limiterKnee.cancelScheduledValues?.(this.context.currentTime);
        chain.limiterKnee.value = knee;
      }
    } else {
      chain.limiter?.setTargetAtTime(threshold, this.context.currentTime, 0.02);
      chain.limiterKnee?.setTargetAtTime(knee, this.context.currentTime, 0.02);
      chain.normalization.setTargetAtTime(safe, this.context.currentTime, 0.12);
    }
  }
  setGain(element: HTMLAudioElement, value: number, at = 0): void {
    const chain = this.chains.get(element);
    if (!chain) return;
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (at > 0) chain.gain.setTargetAtTime(safe, this.context.currentTime + at, 0.02);
    else chain.gain.value = safe;
  }

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

  setMid(element: HTMLAudioElement, decibels: number, at = 0): void {
    const chain = this.chains.get(element);
    if (!chain?.mid) return;
    const safe = Number.isFinite(decibels) ? Math.max(-12, Math.min(3, decibels)) : 0;
    if (at > 0) chain.mid.setTargetAtTime(safe, this.context.currentTime + at, 0.05);
    else chain.mid.value = safe;
  }

  setPan(element: HTMLAudioElement, value: number, at = 0): void {
    const chain = this.chains.get(element);
    if (!chain?.pan) return;
    const safe = Number.isFinite(value) ? Math.max(-MAX_PAN, Math.min(MAX_PAN, value)) : 0;
    if (at > 0) chain.pan.setTargetAtTime(safe, this.context.currentTime + at, 0.08);
    else chain.pan.value = safe;
  }

  async close(): Promise<void> {
    for (const source of this.sources) {
      try {
        source.disconnect();
      } catch {}
    }
    this.sources.clear();
    this.chains.clear();
    try {
      await this.context.close();
    } catch {}
  }
}

export function bassShelfDb(
  role: 'outgoing' | 'incoming',
  progress: number,
  swapAt = 0.55,
): number {
  const p = Math.max(0, Math.min(1, progress));
  const pivot = Math.max(0.25, Math.min(0.85, Number.isFinite(swapAt) ? swapAt : 0.55));

  const t = Math.max(0, Math.min(1, p / pivot));
  const smooth = t * t * (3 - 2 * t);
  const value = role === 'outgoing' ? BASS_CUT_DB * smooth : BASS_CUT_DB * (1 - smooth);

  return value === 0 ? 0 : value;
}

export function filterOutHz(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  const t = Math.max(0, Math.min(1, (p - 0.45) / 0.5));
  const smooth = t * t * (3 - 2 * t);

  const value = OPEN_AIR_HZ * Math.pow(CLOSED_AIR_HZ / OPEN_AIR_HZ, smooth);
  return Math.round(value);
}

export function midCarveDb(progress: number, vocalOverlap = false): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0 || p >= 1) return 0;

  const bell = Math.sin(Math.PI * p);
  const shaped = bell * bell;
  const depth = vocalOverlap ? VOCAL_CARVE_DB : MID_CARVE_DB;
  const value = depth * shaped;
  return Math.abs(value) < 0.01 ? 0 : Math.round(value * 100) / 100;
}

export function incomingAirHz(progress: number, beatmatched = false): number {
  const p = Math.max(0, Math.min(1, progress));
  const span = beatmatched ? 0.32 : 0.38;
  const t = Math.max(0, Math.min(1, p / span));
  if (t >= 1) return OPEN_AIR_HZ;
  const smooth = t * t * (3 - 2 * t);
  const startHz = beatmatched ? INCOMING_OPEN_START_HZ + 800 : INCOMING_OPEN_START_HZ;
  const value = startHz * Math.pow(OPEN_AIR_HZ / startHz, smooth);
  return Math.round(value);
}
