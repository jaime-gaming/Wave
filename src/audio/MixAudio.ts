import { mixCues, type MixCues } from '../domain/mix';
import {
  panSpread,
  handoverGains,
  levelTrim,
  planGains,
  smoothstep,
  type TransitionPlan,
} from '../domain/mixPlanner';
import { bassShelfDb, filterOutHz, MixGraph, OPEN_AIR_HZ, stretchRate } from './mixGraph';
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
/** How long the new song takes to get its own level back after a handover. */
export const SETTLE_SECONDS = 4;

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
    /** Rolling the outgoing song's top down, only with Web Audio. */
    filterOut: boolean;
    /** Level match between the two records, applied only for the overlap. */
    trim: { outgoing: number; incoming: number };
    /** Playback rate the outgoing deck is bent towards, and by when. */
    outgoingRate: number;
  };
  /**
   * The few seconds after a handover where the new song's level match is given
   * back to it.
   *
   * A level match only exists while two songs share the stage. When the overlap
   * ends, restoring the deck to unity in one frame is a jump in volume — the new
   * song sounds like it suddenly got louder, which is the one thing the match
   * was supposed to prevent. The match is therefore released slowly, over about
   * four seconds, and nobody can hear a ramp that gentle.
   */
  private settling?: { deck: Deck; from: number; start: number; seconds: number };
  private mixEnabled = false;
  private graph: MixGraph | null = null;
  private analyses = new WeakMap<Blob, TrackAnalysis>();
  private profiles = new WeakMap<Blob, MixCues>();
  private requested = new WeakSet<Blob>();
  /** Elements that really have a Web Audio chain; anything else uses volume. */
  private attached = new WeakSet<HTMLAudioElement>();
  /**
   * Bounds a file is played between, per file.
   *
   * The engine owns playback for the whole app, so this is the one place a
   * library trim has to be honoured: start after the silence, and treat the end
   * of the music as the end of the song.
   */
  private bounds = new WeakMap<Blob, { start: number; end: number }>();
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
  private lastResume = 0;
  private playing = false;
  private playIntent = 0;
  private timer: ReturnType<typeof setInterval>;
  private listeners = new Map<HTMLAudioElement, () => void>();
  constructor(private callbacks: AudioCallbacks) {
    this.active = this.createDeck();
    this.timer = setInterval(() => {
      if (!this.playing) return;
      // A context can be suspended later (background tab, iOS interruption).
      // Retry occasionally so playback never continues silently.
      if (this.graph && !this.graph.running && performance.now() - this.lastResume > 1000) {
        this.lastResume = performance.now();
        void this.graph.resume().then((running) => {
          if (running) this.attachDecks();
        });
      }
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
  /** Sets or clears the silent edges the listener removed from a song. */
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
  /** Playback rate that matches a deck to `bpm`, inside the stretch window. */
  stretchFor(blob: Blob | undefined, bpm: number) {
    return stretchRate(blob ? this.analyses.get(blob) : undefined, bpm);
  }
  get bassSwapAvailable() {
    return !!this.graph?.available;
  }
  setMixEnabled(enabled: boolean) {
    this.mixEnabled = enabled;
    if (!enabled) {
      // The graph stays idle; decks keep playing natively at full level.
      this.applyGains();
      return;
    }
    // No AudioContext is created here: this runs on mount, before any gesture,
    // and a context created then stays suspended. `route()` builds it on play.
    this.prime(this.active);
    if (this.spare) this.prime(this.spare);
  }

  /**
   * Builds the Web Audio graph and attaches it — only inside a user gesture and
   * only if the context is really running.
   *
   * Attaching a media element to an AudioContext takes its audio out of the
   * normal output path. If the context cannot run (autoplay policy, background
   * tab), the song would play silently, which is exactly what must never happen.
   * When the graph cannot run, playback stays on the native element.
   */
  private async route() {
    if (!this.mixEnabled) return;
    this.graph ??= MixGraph.create();
    if (!this.graph) return;
    const running = await this.graph.resume();
    // Keep the graph even when it cannot run yet: the elements stay unplugged (so
    // the song is never silent) and the context is retried from the timer. Tossing
    // it here is what made a mix fall back to a bare crossfade for a whole session.
    if (!running) return;
    this.attachDecks();
  }

  /** Attaches both decks once the context is really running. Chains are cached. */
  private attachDecks() {
    if (!this.graph?.running) return;
    this.attachGraph(this.active);
    if (this.spare) this.attachGraph(this.spare);
    this.prime(this.active);
    if (this.spare) this.prime(this.spare);
  }

  /** Called from a click so a suspended context can be brought back. */
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
    if (!this.graph?.running) return;
    const chain = this.graph.chain(deck.element);
    if (!chain) return;
    this.attached.add(deck.element);
    // The element keeps only the master volume; the mix curve lives in the graph.
    this.graph.setGain(deck.element, 1);
    this.graph.setBass(deck.element, 0);
  }
  /**
   * Sets a deck's share of the mix.
   *
   * The check is on the deck, not on the graph. An element that was assigned
   * while the audio context was still suspended has no chain yet, and writing a
   * gain into a chain that does not exist does nothing at all — which is how a
   * newly arriving song ended up playing at full volume for a second before
   * "adjusting". If the deck is not attached, the element's own volume carries
   * the curve, and the very same value is written to the graph the moment it is.
   */
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
    if (this.graph) this.graph.setAir(deck.element, OPEN_AIR_HZ);
    deck.blob = blob;
    deck.url = URL.createObjectURL(blob);
    deck.element.src = deck.url;
    deck.element.currentTime = 0;
    this.attachGraph(deck);
  }
  private report() {
    const bounds = this.boundsOf(this.active);
    const position = Number.isFinite(this.element.currentTime) ? this.element.currentTime : 0;
    this.callbacks.time(position);
    this.callbacks.duration(
      bounds.end > 0 && Number.isFinite(bounds.end) ? bounds.end : this.element.duration || 0,
    );
    // The music has ended; the rest of the file is a fade into nothing. This is
    // the same handover the element's own `ended` event performs, reached a few
    // seconds early because the listener asked for that.
    if (!this.fading && bounds.end > 0 && position >= bounds.end - 0.02 && !this.element.ended) {
      this.element.pause();
      this.cancelTransition();
      this.callbacks.ended();
      return;
    }
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
      // Inside the user gesture: this is the only moment the browser will let
      // the audio context start. Routing first means the graph is attached and
      // running before a single sample is played.
      if (this.mixEnabled) await this.route();
      const bounds = this.boundsOf(this.active);
      const atStart = deck.element.currentTime < 0.2 || deck.element.ended;
      if (deck.element.ended) deck.element.currentTime = 0;
      // A song whose silent opening was removed starts where the music starts.
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
      outgoingRate: plan.outgoingRate,
      bassSwapAt: plan.bassSwapAt,
    });
  }
  transition(blob: Blob, seconds: number, guard: () => boolean, onStarted: () => void) {
    this.startTransition(blob, seconds, guard, onStarted, {});
  }
  /** Whether the EQ moves (bass swap, filter out) can be applied right now. */
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
      rate?: number;
      outgoingRate?: number;
      bassSwap?: boolean;
      bassSwapAt?: number;
      filterOut?: boolean;
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
          trim: levelTrim(
            outgoing.blob ? this.analyses.get(outgoing.blob) : undefined,
            incoming.blob ? this.analyses.get(incoming.blob) : undefined,
            // Where the two songs are actually heard together: the outgoing one
            // from the point its tail begins, the incoming one from its cue.
            {
              outgoing: this.element.currentTime,
              incoming: cue,
            },
          ),
          outgoingRate: options.outgoingRate ?? 1,
          outgoing,
          incoming,
          start: performance.now(),
          seconds: length,
          cue,
          mixed: this.mixEnabled,
          // Every handover Mix performs gets the low-end swap and the filter out,
          // planned or not: a song that was analysed badly must not sound like a
          // bare crossfade while the next one sounds like a mix.
          bassSwap: options.bassSwap ?? this.eqAvailable,
          bassSwapAt: options.bassSwapAt ?? 0.5,
          filterOut: options.filterOut ?? this.eqAvailable,
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
        this.graph.setAir(deck.element, OPEN_AIR_HZ);
        this.graph.setPan(deck.element, 0);
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
              this.graph.setGain(deck.element, 1);
            }
          }
          return;
        }
      }
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
    // A mix is staged, not symmetric: the new song arrives early and stays, the
    // old one leaves afterwards. That difference is the whole point of the
    // feature — a symmetric equal-power slide is just a crossfade.
    const gains = this.fading.mixed ? handoverGains(progress) : planGains(progress);
    // The level match rides on top of the curve, so a quieter record is not
    // heard as the mix going quiet.
    this.applyDeckGain(this.fading.outgoing, gains.outgoing * this.fading.trim.outgoing);
    this.applyDeckGain(this.fading.incoming, gains.incoming * this.fading.trim.incoming);
    // Two records in one space: they separate in the stereo field as they meet
    // and come back to the centre together. No level is touched.
    if (this.fading.mixed && this.graph) {
      this.graph.setPan(this.fading.outgoing.element, panSpread(progress, 'outgoing'));
      this.graph.setPan(this.fading.incoming.element, panSpread(progress, 'incoming'));
    }
    // The old song eases towards the new one's tempo over the first half of the
    // overlap instead of the new one doing all the travelling.
    if (this.fading.mixed && this.fading.outgoingRate !== 1) {
      const bend = smoothstep(Math.min(1, progress / 0.45));
      this.fading.outgoing.element.playbackRate = 1 + (this.fading.outgoingRate - 1) * bend;
    }
    if (this.fading.bassSwap && this.graph) {
      // A's lows close as B's open, so the kick never disappears between the two
      // songs and the low end clearly changes hands once.
      this.graph.setBass(this.fading.outgoing.element, bassShelfDb('outgoing', progress));
      this.graph.setBass(this.fading.incoming.element, bassShelfDb('incoming', progress));
    }
    if (this.fading.filterOut && this.graph) {
      // The outgoing song loses its top as it leaves: the clearest sign that this
      // is a mix and not two songs sliding past each other.
      this.graph.setAir(this.fading.outgoing.element, filterOutHz(progress));
    }
    if (progress >= 1) {
      const finished = this.fading;
      this.release(finished.outgoing);
      finished.incoming.element.playbackRate = 1;
      if (this.graph) {
        this.graph.setBass(finished.incoming.element, 0);
        this.graph.setAir(finished.incoming.element, OPEN_AIR_HZ);
        this.graph.setPan(finished.incoming.element, 0);
      }
      this.fading = undefined;
      // The new song takes its own level back — slowly. Anything under about
      // four seconds is inaudible as a change and stops the one jump a handover
      // used to have.
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
