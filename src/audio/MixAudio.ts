import { mixCues, mixGains, type MixCues } from '../domain/mix';
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
    mix: boolean;
  };
  private mixEnabled = false;
  private profiles = new WeakMap<Blob, MixCues>();
  private requested = new WeakSet<Blob>();
  private pending = false;
  private blocked?: Blob;
  private generation = 0;
  private volume = 1;
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
  setMixEnabled(enabled: boolean) {
    this.mixEnabled = enabled;
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
    return this.mixEnabled && deck.blob
      ? (this.profiles.get(deck.blob) ?? { start: 0, end: deck.element.duration })
      : { start: 0, end: deck.element.duration };
  }
  get mixRemaining() {
    return Math.min(this.element.duration, this.cues(this.active).end) - this.element.currentTime;
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
  transition(blob: Blob, seconds: number, guard: () => boolean, onStarted: () => void) {
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
    const cue = this.cues(incoming).start;
    const length = Math.min(seconds, this.mixRemaining, (incoming.element.duration - cue) / 2);
    if (length < 0.1) return;
    this.pending = true;
    const generation = this.generation;
    incoming.element.currentTime = cue;
    incoming.element.volume = 0;
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
          mix: this.mixEnabled,
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
    this.active.element.volume = this.volume;
  }
  setVolume(volume: number) {
    for (const deck of [this.active, this.spare]) if (deck) deck.element.muted = volume === 0;
    this.volume = volume;
    this.applyGains();
  }
  private applyGains() {
    if (!this.fading) {
      this.active.element.volume = this.volume;
      return;
    }
    const progress = Math.max(
      0,
      Math.min(
        1,
        (this.fading.incoming.element.currentTime - this.fading.cue) / this.fading.seconds,
      ),
    );
    const gains = mixGains(progress, this.fading.mix);
    this.fading.outgoing.element.volume = this.volume * gains.outgoing;
    this.fading.incoming.element.volume = this.volume * gains.incoming;
    if (progress >= 1) {
      this.release(this.fading.outgoing);
      this.fading = undefined;
      this.callbacks.blend?.(null);
    }
  }
  destroy() {
    clearInterval(this.timer);
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
