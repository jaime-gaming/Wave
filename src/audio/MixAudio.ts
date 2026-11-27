import { mixCues } from '../domain/mix';
import {
  levelTrim,
  panSpread,
  planGains,
  smoothstep,
  type TransitionPlan,
} from '../domain/mixPlanner';
import {
  bassShelfDb,
  filterOutHz,
  incomingAirHz,
  midCarveDb,
  MixGraph,
  OPEN_AIR_HZ,
} from './mixGraph';
import type { TrackAnalysis } from './dsp';
import { sourceEnvelope } from './sourceEnvelope';
import {
  detectEndingShape,
  endingCutProgress,
  endingGains,
  type EndingShape,
} from '../domain/mixEnding';
interface Deck {
  element: HTMLAudioElement;
  blob?: Blob;
  url?: string;
}
interface AudioCallbacks {
  time: (time: number) => void;
  duration: (duration: number) => void;
  buffering: (waiting: boolean) => void;
  ended: () => void;
  error: (message: string) => void;
  tick: () => void;
  warning: (message: string) => void;
  reset: () => void;
  blend?: (
    value: { outgoing: Blob; incoming: Blob; progress: number; seconds: number } | null,
  ) => void;
}

export const SETTLE_SECONDS = 4;

export class MixAudio {
  active: Deck;
  private spare?: Deck;
  private fading?: {
    outgoing: Deck;
    incoming: Deck;
    start: number;
    seconds: number;
    cue: number;
    mixed: boolean;

    bassSwap: boolean;
    bassSwapAt: number;

    filterOut: boolean;

    vocalOverlap: boolean;

    trim: { outgoing: number; incoming: number };

    ending: EndingShape;
  };

  private settling?: { deck: Deck; from: number; start: number; seconds: number };
  private mixEnabled = false;

  private graph: MixGraph | null = null;
  private analyses = new WeakMap<Blob, TrackAnalysis>();
  private endings = new WeakMap<Blob, EndingShape>();
  private requested = new WeakSet<Blob>();

  private attached = new WeakSet<HTMLAudioElement>();

  private corrections = new WeakMap<Blob, number>();
  setVolumeFix(blob: Blob, gain = 1) {
    const safe = Number.isFinite(gain) ? Math.max(0.01, Math.min(8, gain)) : 1;
    if (safe === 1) this.corrections.delete(blob);
    else this.corrections.set(blob, safe);
    for (const deck of [this.active, this.spare])
      if (deck?.blob === blob && this.attached.has(deck.element))
        this.graph?.setNormalization(deck.element, this.corrections.get(blob) ?? 1);
  }
  private bounds = new WeakMap<Blob, { start: number; end: number }>();
  private pending = false;
  private blocked?: Blob;
  private generation = 0;
  private volume = 1;

  private fadeState: {
    from: number;
    to: number;
    start: number;
    seconds: number;
    pauseAtEnd: boolean;
  } | null = null;
  private fadeGain = 1;
  private lastReport = 0;
  private lastResume = 0;
  private playing = false;
  private playIntent = 0;
  private timer: ReturnType<typeof setInterval>;
  private listeners = new Map<HTMLAudioElement, () => void>();
  constructor(private callbacks: AudioCallbacks) {
    this.active = this.createDeck();
    this.timer = setInterval(() => {
      if (!this.playing) return;

      if (this.graph && !this.graph.running && performance.now() - this.lastResume > 1000) {
        this.lastResume = performance.now();
        void this.graph.resume().then((running) => {
          if (running) this.attachDecks();
        });
      }
      if (this.fading || this.fadeState || this.settling) this.applyGains();
      const now = performance.now();
      if (now - this.lastReport >= 50) {
        this.lastReport = now;
        this.report();
        this.callbacks.tick();
      }
    }, 20);
  }
  get preparedDuration() {
    return this.spare?.element.duration || 0;
  }
  get element() {
    return this.active.element;
  }
  get outgoingBlob() {
    return this.fading?.outgoing.blob;
  }
  get transitioning() {
    return !!this.fading;
  }

  setAnalysis(blob: Blob, analysis: TrackAnalysis) {
    this.analyses.set(blob, analysis);
  }
  analysisFor(blob: Blob | undefined) {
    return blob ? this.analyses.get(blob) : undefined;
  }

  setBounds(blob: Blob | undefined, bounds?: { start: number; end: number }) {
    if (!blob) return;
    if (!bounds || (!bounds.start && !Number.isFinite(bounds.end))) this.bounds.delete(blob);
    else this.bounds.set(blob, bounds);
  }
  private boundsOf(deck: Deck) {
    if (!deck.blob) return { start: 0, end: 0 };
    const stored = this.bounds.get(deck.blob);
    if (stored) return stored;
    const duration = Number.isFinite(deck.element.duration) ? deck.element.duration : 0;
    return { start: 0, end: duration };
  }
  get bassSwapAvailable() {
    return !!this.graph?.available;
  }
  setMixEnabled(enabled: boolean) {
    this.mixEnabled = enabled;
    if (!enabled) {
      this.applyGains();
      return;
    }

    this.prime(this.active);
    if (this.spare) this.prime(this.spare);
  }

  private async route(force = false) {
    if (
      !force &&
      !this.mixEnabled &&
      (!this.active.blob || !this.corrections.has(this.active.blob))
    )
      return;
    this.graph ??= MixGraph.create();
    if (!this.graph) return;
    const running = await this.graph.resume();

    if (!running) return;
    this.attachDecks();
  }

  private attachDecks() {
    if (!this.graph?.running) return;
    this.attachGraph(this.active);
    if (this.spare) this.attachGraph(this.spare);
    this.prime(this.active);
    if (this.spare) this.prime(this.spare);
  }

  async prepareVolumeFix() {
    await this.route(true);
    if (!this.graph?.running)
      throw Error('Volume processing is not available. Start playback and try again.');
  }

  async resumeAudio(): Promise<void> {
    await this.route();
  }
  private prime(deck: Deck) {
    const blob = deck.blob,
      duration = deck.element.duration;
    if (
      !this.mixEnabled ||
      !blob ||
      this.requested.has(blob) ||
      !Number.isFinite(duration) ||
      duration < 8
    )
      return;
    this.requested.add(blob);
    void sourceEnvelope(blob, duration).then((envelope) => {
      if (!envelope) return;
      const cues = mixCues(envelope, duration);
      this.endings.set(blob, detectEndingShape(envelope, duration, cues.end));
    });
  }

  endingFor(blob: Blob | undefined): EndingShape {
    return blob ? (this.endings.get(blob) ?? 'fade-to-zero') : 'fade-to-zero';
  }

  get mixRemaining() {
    const bounds = this.boundsOf(this.active);

    return (
      Math.min(this.element.duration, bounds.end > 0 ? bounds.end : Infinity) -
      this.element.currentTime
    );
  }
  private attachGraph(deck: Deck) {
    if (!this.graph?.running || this.attached.has(deck.element)) return;
    const chain = this.graph.chain(deck.element);
    if (!chain) return;
    this.attached.add(deck.element);
    this.graph.setNormalization(
      deck.element,
      deck.blob ? (this.corrections.get(deck.blob) ?? 1) : 1,
      true,
    );

    this.graph.setGain(deck.element, this.silenced(deck) ? 0 : 1);
    this.graph.setBass(deck.element, 0);
  }

  private silenced(deck: Deck) {
    return this.pending && deck === this.spare;
  }

  private applyDeckGain(deck: Deck, gain: number) {
    const value = Math.max(0, Math.min(1, gain));
    if (this.graph && this.attached.has(deck.element)) {
      this.graph.setGain(deck.element, value);
      deck.element.volume = this.volume;
    } else {
      deck.element.volume = value * this.volume;
    }
  }
  private createDeck(): Deck {
    const deck: Deck = { element: new Audio() };
    deck.element.preload = 'auto';
    deck.element.muted = this.volume === 0;
    const guarded = (callback: () => void) => () => {
      if (this.active === deck) callback();
    };
    const events: { [key: string]: () => void } = {
      timeupdate: guarded(() => {
        this.report();
        this.callbacks.tick();
      }),
      loadedmetadata: () => {
        this.prime(deck);
        if (this.active === deck) this.report();
      },
      durationchange: guarded(() => this.report()),
      waiting: guarded(() => this.callbacks.buffering(true)),
      playing: guarded(() => {
        this.callbacks.buffering(false);
        this.callbacks.reset();
      }),
      canplay: guarded(() => this.callbacks.buffering(false)),
      ended: guarded(() => {
        this.cancelTransition();
        this.callbacks.ended();
      }),
      error: () => {
        if (this.active === deck) {
          this.cancelTransition();
          this.callbacks.buffering(false);
          this.callbacks.error(
            'This file could not be played. Its codec may not be supported by your browser.',
          );
        } else this.blocked = deck.blob;
      },
    };
    for (const [name, callback] of Object.entries(events))
      deck.element.addEventListener(name, callback);
    this.listeners.set(deck.element, () => {
      for (const [name, callback] of Object.entries(events))
        deck.element.removeEventListener(name, callback);
    });
    return deck;
  }
  private release(deck: Deck) {
    deck.element.pause();
    deck.element.removeAttribute('src');
    deck.element.load();
    if (deck.url) URL.revokeObjectURL(deck.url);
    deck.url = undefined;
    deck.blob = undefined;
  }
  private assign(deck: Deck, blob: Blob) {
    this.release(deck);
    if (this.graph) {
      this.graph.setAir(deck.element, OPEN_AIR_HZ);
      this.graph.setMid(deck.element, 0);
    }
    deck.blob = blob;
    this.graph?.setNormalization(deck.element, this.corrections.get(blob) ?? 1, true);
    deck.url = URL.createObjectURL(blob);
    deck.element.src = deck.url;
    deck.element.load();
    deck.element.currentTime = 0;
    this.attachGraph(deck);
  }
  private blendProgress(fading: NonNullable<MixAudio['fading']>): number {
    const raw = (fading.incoming.element.currentTime - fading.cue) / fading.seconds;

    if (fading.cue > 0.5 && fading.incoming.element.currentTime < fading.cue - 0.5) {
      const elapsed = (performance.now() - fading.start) / (fading.seconds * 1000);
      return Math.max(0, Math.min(1, elapsed));
    }
    return Math.max(0, Math.min(1, raw));
  }
  private report() {
    const bounds = this.boundsOf(this.active);
    const position = Number.isFinite(this.element.currentTime) ? this.element.currentTime : 0;
    this.callbacks.time(position);
    this.callbacks.duration(
      bounds.end > 0 && Number.isFinite(bounds.end) ? bounds.end : this.element.duration || 0,
    );

    if (!this.fading && bounds.end > 0 && position >= bounds.end - 0.02 && !this.element.ended) {
      this.element.pause();
      this.cancelTransition();
      this.callbacks.ended();
      return;
    }
    if (this.fading && this.fading.outgoing.blob && this.fading.incoming.blob) {
      const p = Math.min(
        1,
        this.blendProgress(this.fading) / endingCutProgress(this.fading.ending),
      );
      this.callbacks.blend?.({
        outgoing: this.fading.outgoing.blob,
        incoming: this.fading.incoming.blob,
        progress: p,
        seconds: this.fading.seconds,
      });
    }
  }
  load(blob?: Blob) {
    this.callbacks.reset();
    if (blob && this.active.blob === blob) {
      this.report();
      return;
    }
    this.playIntent++;
    this.cancelTransition();
    this.blocked = undefined;
    this.release(this.active);
    if (this.spare) this.release(this.spare);
    this.callbacks.time(0);
    this.callbacks.duration(0);
    this.callbacks.buffering(false);
    if (blob) this.assign(this.active, blob);
    this.applyGains();
  }
  async play() {
    if (this.fading?.incoming === this.active && !this.active.element.paused) {
      this.playing = true;
      return;
    }
    const intent = ++this.playIntent,
      deck = this.active;
    this.playing = true;
    try {
      await this.route();
      const bounds = this.boundsOf(this.active);
      const atStart = deck.element.currentTime < 0.2 || deck.element.ended;
      if (deck.element.ended) deck.element.currentTime = 0;

      if (atStart && bounds.start > 0) deck.element.currentTime = bounds.start;
      await this.element.play();
    } catch (error) {
      if (intent !== this.playIntent || deck !== this.active || !this.playing) return;
      this.playing = false;
      throw error;
    }
  }
  pause() {
    this.playIntent++;
    this.playing = false;
    this.cancelTransition();
    this.element.pause();
  }
  seek(seconds: number) {
    this.cancelTransition();
    this.element.currentTime = seconds;
    this.report();
  }

  repeatTransition(guard: () => boolean, onStarted: () => void) {
    const blob = this.active.blob;
    if (!blob) return;
    this.startTransition(blob, 0.8, guard, onStarted, {
      cue: this.boundsOf(this.active).start,
      miniRepeat: true,
      bassSwap: !!this.graph?.available,
      filterOut: !!this.graph?.available,
    });
  }
  restart() {
    this.cancelTransition();
    this.element.currentTime = 0;

    this.fadeIn(0.22);
    return this.play();
  }
  prepare(blob?: Blob) {
    if (this.pending || this.fading) return;
    if (!blob) {
      if (this.spare?.blob) this.release(this.spare);
      return;
    }
    if (this.blocked === blob) return;
    this.spare ??= this.createDeck();
    if (this.spare.blob !== blob) {
      this.generation++;
      this.blocked = undefined;
      this.assign(this.spare, blob);
      this.spare.element.volume = 0;
    }
  }

  transitionWithPlan(
    blob: Blob,
    plan: TransitionPlan,
    guard: () => boolean,
    onStarted: () => void,
  ) {
    if (plan.mode === 'cut' || plan.seconds < 0.5) return;

    this.startTransition(blob, plan.seconds, guard, onStarted, {
      cue: plan.cue,
      planned: true,
      bassSwapAt: plan.bassSwapAt,
      vocalOverlap: plan.vocalOverlap,
      ending: plan.ending ?? this.endingFor(this.active.blob),
    });
  }
  transition(blob: Blob, seconds: number, guard: () => boolean, onStarted: () => void) {
    this.startTransition(blob, seconds, guard, onStarted, {});
  }

  private get eqAvailable() {
    return this.mixEnabled && !!this.graph?.available;
  }
  private startTransition(
    blob: Blob,
    seconds: number,
    guard: () => boolean,
    onStarted: () => void,
    options: {
      cue?: number;
      planned?: boolean;
      bassSwap?: boolean;
      bassSwapAt?: number;
      filterOut?: boolean;
      vocalOverlap?: boolean;
      miniRepeat?: boolean;
      ending?: EndingShape;
    },
  ) {
    const incoming = this.spare,
      outgoing = this.active;
    if (
      this.pending ||
      this.fading ||
      this.blocked === blob ||
      !incoming ||
      incoming.blob !== blob ||
      incoming.element.readyState < 1 ||
      !Number.isFinite(incoming.element.duration) ||
      incoming.element.duration <= 0 ||
      !this.playing
    )
      return;
    const incomingBounds = this.boundsOf(incoming);

    if (options.planned && (!Number.isFinite(options.cue) || options.cue! < incomingBounds.start))
      return;
    const cue = options.planned
      ? options.cue!
      : Math.max(0, Math.min(incomingBounds.start, incoming.element.duration - 0.1));
    const remaining = this.mixRemaining;
    const available = Math.min(incoming.element.duration, incomingBounds.end || Infinity) - cue;

    if (!options.planned && !options.miniRepeat && this.mixEnabled && remaining > available) return;
    const length =
      options.planned || options.miniRepeat || !this.mixEnabled
        ? Math.min(seconds, remaining, available)
        : Math.min(remaining, available);
    if (length < 0.1) return;
    this.pending = true;
    const generation = this.generation;
    const requestedAt = outgoing.element.currentTime;
    incoming.element.currentTime = cue;

    incoming.element.playbackRate = 1;
    this.applyDeckGain(incoming, 0);
    void incoming.element
      .play()
      .then(() => {
        if (generation !== this.generation) return;
        if (!this.playing || !guard()) {
          incoming.element.pause();
          this.pending = false;
          return;
        }

        const outgoingTime = outgoing.element.currentTime;
        const elapsed = options.planned ? Math.max(0, outgoingTime - requestedAt) : 0;
        const alignedCue = cue + elapsed;
        const remainingAfterStart =
          Math.min(outgoing.element.duration, this.boundsOf(outgoing).end || Infinity) -
          outgoingTime;
        const actualLength = Math.min(length - elapsed, remainingAfterStart, available - elapsed);
        if (actualLength < (options.planned ? 0.5 : 0.1) || (options.planned && elapsed > 1)) {
          incoming.element.pause();
          this.pending = false;
          return;
        }
        if (options.planned && Math.abs(incoming.element.currentTime - alignedCue) > 0.04) {
          try {
            incoming.element.currentTime = alignedCue;
          } catch {
            incoming.element.pause();
            this.pending = false;
            return;
          }
        }
        const ending = options.ending ?? this.endingFor(outgoing.blob);
        this.pending = false;
        this.active = incoming;
        this.spare = outgoing;
        this.fading = {
          trim: levelTrim(
            outgoing.blob ? this.analyses.get(outgoing.blob) : undefined,
            incoming.blob ? this.analyses.get(incoming.blob) : undefined,

            {
              outgoing: outgoingTime,
              incoming: alignedCue,
            },
          ),
          outgoing,
          incoming,
          start: performance.now(),
          seconds: actualLength,
          cue: alignedCue,
          mixed: this.mixEnabled || !!options.miniRepeat,

          bassSwap: options.bassSwap ?? this.eqAvailable,
          bassSwapAt: options.bassSwapAt ?? 0.5,
          filterOut: options.filterOut ?? this.eqAvailable,
          vocalOverlap: !!options.vocalOverlap,
          ending,
        };
        this.applyGains();
        this.callbacks.buffering(false);
        this.report();
        onStarted();
      })
      .catch(() => {
        if (generation !== this.generation) return;
        this.pending = false;
        incoming.element.pause();
        this.blocked = blob;
        this.callbacks.warning('Mix could not start. Playback will continue normally.');
      });
  }
  cancelTransition() {
    this.generation++;
    this.pending = false;
    this.callbacks.blend?.(null);
    if (this.fading) {
      this.release(this.fading.outgoing);
      this.fading = undefined;
    } else this.spare?.element.pause();
    for (const deck of [this.active, this.spare]) {
      if (!deck) continue;
      deck.element.playbackRate = 1;
      deck.element.preservesPitch = true;
      if (this.graph) {
        this.graph.setBass(deck.element, 0);
        this.graph.setMid(deck.element, 0);
        this.graph.setAir(deck.element, OPEN_AIR_HZ);
        this.graph.setPan(deck.element, 0);
        this.graph.setGain(deck.element, 1);
      }
    }
    this.active.element.volume = this.volume;
  }

  fadeOut(seconds: number, pauseAtEnd = true) {
    this.startFade(1, 0, seconds, pauseAtEnd);
  }

  fadeIn(seconds: number) {
    this.startFade(0, 1, seconds, false);
  }
  cancelFade() {
    this.fadeState = null;
    this.fadeGain = 1;
    this.applyGains();
  }
  private startFade(from: number, to: number, seconds: number, pauseAtEnd: boolean) {
    const length = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    if (length < 0.05) {
      this.fadeGain = to;
      this.fadeState = null;
      if (to === 0 && pauseAtEnd) this.element.pause();
      this.applyGains();
      return;
    }
    this.fadeState = { from, to, start: performance.now(), seconds: length, pauseAtEnd };
    this.fadeGain = from;
    if (from === 0) this.element.volume = 0;
  }
  private updateFade() {
    const fade = this.fadeState;
    if (!fade) return;
    const p = Math.min(1, (performance.now() - fade.start) / (fade.seconds * 1000));
    this.fadeGain = fade.from + (fade.to - fade.from) * p;
    if (p >= 1) {
      this.fadeState = null;
      this.fadeGain = fade.to;
      if (fade.to === 0 && fade.pauseAtEnd) this.element.pause();
    }
  }
  setVolume(volume: number) {
    for (const deck of [this.active, this.spare]) if (deck) deck.element.muted = volume === 0;
    this.volume = volume;
    this.applyGains();
  }
  private applyGains() {
    this.updateFade();
    const master = this.volume * this.fadeGain;
    if (!this.fading) {
      if (this.settling) {
        const settle = this.settling;
        const t = Math.min(1, (performance.now() - settle.start) / (settle.seconds * 1000));
        if (t >= 1 || settle.deck !== this.active) {
          this.settling = undefined;
          this.applyDeckGain(settle.deck, 1);
        } else {
          const eased = settle.from + (1 - settle.from) * smoothstep(t);
          this.applyDeckGain(settle.deck, eased);
          for (const deck of [this.active, this.spare]) {
            if (deck && deck !== settle.deck && this.graph) {
              this.graph.setBass(deck.element, 0);
              this.graph.setGain(deck.element, this.silenced(deck) ? 0 : 1);
            }
          }
          return;
        }
      }
      for (const deck of [this.active, this.spare]) {
        if (deck && this.graph) {
          this.graph.setBass(deck.element, 0);
          this.graph.setMid(deck.element, 0);
          this.graph.setGain(deck.element, this.silenced(deck) ? 0 : 1);
        }
      }
      this.active.element.volume = master;
      return;
    }
    const progress = this.blendProgress(this.fading);

    const gains = this.fading.mixed
      ? endingGains(progress, this.fading.ending)
      : planGains(progress);

    const outgoingGain =
      gains.outgoing *
      (1 + (this.fading.trim.outgoing - 1) * smoothstep(Math.min(1, progress / 0.2)));
    const incomingGain = gains.incoming * this.fading.trim.incoming;
    const headroom = Math.max(1, outgoingGain + incomingGain);
    this.applyDeckGain(this.fading.outgoing, outgoingGain / headroom);
    this.applyDeckGain(this.fading.incoming, incomingGain / headroom);

    if (this.fading.mixed && this.graph) {
      this.graph.setPan(this.fading.outgoing.element, panSpread(progress, 'outgoing'));
      this.graph.setPan(this.fading.incoming.element, panSpread(progress, 'incoming'));
    }
    if (this.fading.bassSwap && this.graph) {
      const swap = this.fading.bassSwapAt;
      this.graph.setBass(this.fading.outgoing.element, bassShelfDb('outgoing', progress, swap));
      this.graph.setBass(this.fading.incoming.element, bassShelfDb('incoming', progress, swap));
    }
    if (this.fading.filterOut && this.graph) {
      this.graph.setAir(this.fading.outgoing.element, filterOutHz(progress));
      this.graph.setMid(
        this.fading.outgoing.element,
        midCarveDb(progress, this.fading.vocalOverlap),
      );
      this.graph.setAir(this.fading.incoming.element, incomingAirHz(progress, this.fading.mixed));
    }
    if (progress >= endingCutProgress(this.fading.ending)) {
      const finished = this.fading;
      this.release(finished.outgoing);
      if (this.graph) {
        this.graph.setBass(finished.incoming.element, 0);
        this.graph.setMid(finished.incoming.element, 0);
        this.graph.setAir(finished.incoming.element, OPEN_AIR_HZ);
        this.graph.setPan(finished.incoming.element, 0);
      }
      this.fading = undefined;

      if (finished.trim.incoming !== 1) {
        this.settling = {
          deck: finished.incoming,
          from: finished.trim.incoming,
          start: performance.now(),
          seconds: SETTLE_SECONDS,
        };
      } else this.applyDeckGain(finished.incoming, 1);
      this.callbacks.blend?.(null);
    }
  }
  destroy() {
    clearInterval(this.timer);
    void this.graph?.close();
    this.playIntent++;
    this.playing = false;
    this.cancelTransition();
    for (const [element, remove] of this.listeners) {
      remove();
      element.pause();
    }
    this.release(this.active);
    if (this.spare) this.release(this.spare);
    this.listeners.clear();
  }
}
