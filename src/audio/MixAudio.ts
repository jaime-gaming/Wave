import { mixCues, mixGains, type MixCues } from '../domain/mix';
import { planGains, type TransitionPlan } from '../domain/mixPlanner';
import { bassShelfDb, MixGraph, stretchRate } from './mixGraph';
import type { TrackAnalysis } from './dsp';
import { sourceEnvelope } from './sourceEnvelope';
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
/** Two native decoders; equal-power sine/cosine gains preserve nominal power during overlap. */
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
    /** Bass swap only when the plan asked for it and Web Audio is available. */
    bassSwap: boolean;
    bassSwapAt: number;
  };
  private mixEnabled = false;
  private graph: MixGraph | null = null;
  private analyses = new WeakMap<Blob, TrackAnalysis>();
  private profiles = new WeakMap<Blob, MixCues>();
  private requested = new WeakSet<Blob>();
  private pending = false;
  private blocked?: Blob;
  private generation = 0;
  private volume = 1;
  /** Master ramp used when a YouTube song takes over or hands back control. */
  private fadeState: {
    from: number;
    to: number;
    start: number;
    seconds: number;
    pauseAtEnd: boolean;
  } | null = null;
  private fadeGain = 1;
  private lastReport = 0;
  private playing = false;
  private playIntent = 0;
  private timer: ReturnType<typeof setInterval>;
  private listeners = new Map<HTMLAudioElement, () => void>();
  constructor(private callbacks: AudioCallbacks) {
    this.active = this.createDeck();
    this.timer = setInterval(() => {
      if (!this.playing) return;
      this.applyGains();
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
  /** Analysis results used to plan transitions; never mutates the audio. */
  setAnalysis(blob: Blob, analysis: TrackAnalysis) {
    this.analyses.set(blob, analysis);
  }
  analysisFor(blob: Blob | undefined) {
    return blob ? this.analyses.get(blob) : undefined;
  }
  /** Playback rate that matches a deck to `bpm`, inside the 8 % window. */
  stretchFor(blob: Blob | undefined, bpm: number) {
    return stretchRate(blob ? this.analyses.get(blob) : undefined, bpm);
  }
  get bassSwapAvailable() {
    return !!this.graph?.available;
  }
  setMixEnabled(enabled: boolean) {
    this.mixEnabled = enabled;
    if (enabled && !this.graph) this.graph = MixGraph.create();
    if (this.graph) {
      void this.graph.resume();
      this.attachGraph(this.active);
      if (this.spare) this.attachGraph(this.spare);
    }
    if (enabled) {
      this.prime(this.active);
      if (this.spare) this.prime(this.spare);
    }
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
      if (envelope) this.profiles.set(blob, mixCues(envelope, duration));
    });
  }
  private cues(deck: Deck) {
    const duration = deck.element.duration;
    if (!this.mixEnabled || !deck.blob) return { start: 0, end: duration };
    // The worker analysis knows where the audio actually starts and ends.
    const analysis = this.analyses.get(deck.blob);
    if (analysis) return { start: analysis.trimmed.start, end: analysis.trimmed.end };
    return this.profiles.get(deck.blob) ?? { start: 0, end: duration };
  }
  get mixRemaining() {
    return Math.min(this.element.duration, this.cues(this.active).end) - this.element.currentTime;
  }
  private attachGraph(deck: Deck) {
    if (!this.graph) return;
    const chain = this.graph.chain(deck.element);
    if (!chain) return;
    // The element keeps only the master volume; the mix curve lives in the graph.
    this.graph.setGain(deck.element, 1);
    this.graph.setBass(deck.element, 0);
  }
  private applyDeckGain(deck: Deck, gain: number) {
    const value = Math.max(0, Math.min(1, gain));
    if (this.graph) {
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
    deck.blob = blob;
    deck.url = URL.createObjectURL(blob);
    deck.element.src = deck.url;
    deck.element.currentTime = 0;
    this.attachGraph(deck);
  }
  private report() {
    this.callbacks.time(Number.isFinite(this.element.currentTime) ? this.element.currentTime : 0);
    this.callbacks.duration(Number.isFinite(this.element.duration) ? this.element.duration : 0);
    if (this.fading && this.fading.outgoing.blob && this.fading.incoming.blob) {
      const p = Math.max(
        0,
        Math.min(
          1,
          (this.fading.incoming.element.currentTime - this.fading.cue) / this.fading.seconds,
        ),
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
    const intent = ++this.playIntent,
      deck = this.active;
    this.playing = true;
    try {
      if (this.element.ended) this.element.currentTime = 0;
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
  restart() {
    this.cancelTransition();
    this.element.currentTime = 0;
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
  /**
   * Executes a planned transition: beat-aligned overlap, optional tempo match and
   * a bass swap in the middle. `plan.seconds` is the overlap the planner chose.
   */
  transitionWithPlan(
    blob: Blob,
    plan: TransitionPlan,
    guard: () => boolean,
    onStarted: () => void,
  ) {
    if (plan.mode === 'cut' || plan.seconds < 0.5) return;
    this.startTransition(blob, plan.seconds, guard, onStarted, {
      cue: plan.cue,
      rate: plan.incomingRate,
      bassSwap: plan.mode === 'beatmatched' && !!this.graph?.available,
      bassSwapAt: plan.bassSwapAt,
    });
  }
  transition(blob: Blob, seconds: number, guard: () => boolean, onStarted: () => void) {
    this.startTransition(blob, seconds, guard, onStarted, {});
  }
  private startTransition(
    blob: Blob,
    seconds: number,
    guard: () => boolean,
    onStarted: () => void,
    options: { cue?: number; rate?: number; bassSwap?: boolean; bassSwapAt?: number },
  ) {
    const incoming = this.spare,
      outgoing = this.active;
    if (
      this.pending ||
      this.fading ||
      this.blocked === blob ||
      !incoming ||
      incoming.blob !== blob ||
      incoming.element.readyState < 3 ||
      !Number.isFinite(incoming.element.duration) ||
      incoming.element.duration <= 0 ||
      !this.playing
    )
      return;
    const incomingCues = this.cues(incoming);
    const cue = options.cue ?? incomingCues.start;
    const length = Math.min(seconds, this.mixRemaining, incoming.element.duration - cue);
    if (length < 0.1) return;
    this.pending = true;
    const generation = this.generation;
    incoming.element.currentTime = cue;
    const rate = options.rate ?? 1;
    incoming.element.preservesPitch = true;
    incoming.element.playbackRate = rate;
    this.applyDeckGain(incoming, 0);
    void incoming.element
      .play()
      .then(() => {
        // A newer command owns these decks now; never pause it or clear its pending flag.
        if (generation !== this.generation) return;
        if (!this.playing || !guard()) {
          incoming.element.pause();
          this.pending = false;
          return;
        }
        this.pending = false;
        this.active = incoming;
        this.spare = outgoing;
        this.fading = {
          outgoing,
          incoming,
          start: performance.now(),
          seconds: length,
          cue,
          mixed: this.mixEnabled,
          bassSwap: options.bassSwap === true,
          bassSwapAt: options.bassSwapAt ?? 0.5,
        };
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
        this.graph.setGain(deck.element, 1);
      }
    }
    this.active.element.volume = this.volume;
  }
  /**
   * Ramps the whole deck down over `seconds`. Used when a YouTube song takes
   * over: the local element keeps its position but goes quiet with the same
   * equal-power curve the embed applies to itself.
   */
  fadeOut(seconds: number, pauseAtEnd = true) {
    this.startFade(1, 0, seconds, pauseAtEnd);
  }
  /** Ramps the deck back up, used when control returns from a YouTube song. */
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
      for (const deck of [this.active, this.spare]) {
        if (deck && this.graph) {
          this.graph.setBass(deck.element, 0);
          this.graph.setGain(deck.element, 1);
        }
      }
      this.active.element.volume = master;
      return;
    }
    const progress = Math.max(
      0,
      Math.min(
        1,
        (this.fading.incoming.element.currentTime - this.fading.cue) / this.fading.seconds,
      ),
    );
    const gains = this.fading.bassSwap
      ? planGains(progress)
      : mixGains(progress, this.fading.mixed);
    this.applyDeckGain(this.fading.outgoing, gains.outgoing);
    this.applyDeckGain(this.fading.incoming, gains.incoming);
    if (this.fading.bassSwap && this.graph) {
      // Cross point near the middle: A's lows close as B's open, so the kick never
      // disappears between the two songs.
      this.graph.setBass(this.fading.outgoing.element, bassShelfDb('outgoing', progress));
      this.graph.setBass(this.fading.incoming.element, bassShelfDb('incoming', progress));
    }
    if (progress >= 1) {
      const finished = this.fading;
      this.release(finished.outgoing);
      finished.incoming.element.playbackRate = 1;
      if (this.graph) this.graph.setBass(finished.incoming.element, 0);
      this.fading = undefined;
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
