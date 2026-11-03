import { useSyncExternalStore } from 'react';
import type { Track } from '../domain/types';

/**
 * The announcement before a mix.
 *
 * A handover begins in the last seconds of a song, which means the listener gets
 * no warning at all: one song is playing and then, abruptly, two. Real mixing
 * announces itself — the next record is cued, you can see it coming, and the join
 * arrives on time. This is that announcement, kept deliberately small: an id
 * pair, how long is left and how far through the lead-in we are.
 *
 * Like the playback clock it lives outside React state, because it changes every
 * frame. Only the bar that draws it subscribes.
 */
export interface MixCue {
  from: Track;
  to: Track;
  /** Whole seconds until the handover window. */
  seconds: number;
  /** 0 at the start of the lead-in, 1 when the mix begins. */
  progress: number;
}

/**
 * How long the cue is shown before a handover starts, and how long it stays
 * afterwards. Long enough to read the word twice; the blend itself then keeps
 * it on screen until the two songs have finished meeting.
 */
export const MIX_CUE_SECONDS = 8;

export class MixCueStore {
  private value: MixCue | null = null;
  private announced = -1;
  private listeners = new Set<() => void>();

  get = () => this.value;

  set(next: MixCue | null) {
    const previous = this.value;
    if (!next && !previous) return;
    if (!next || !previous) {
      this.value = next;
      this.announced = next ? next.progress : -1;
      this.emit();
      return;
    }
    // Not once per frame — that would re-render two components twenty times a
    // second — but often enough that the cover opens in steps nobody can see:
    // a new second, a new song, or a two-percent change in the fraction.
    if (
      previous.from.id === next.from.id &&
      previous.to.id === next.to.id &&
      previous.seconds === next.seconds &&
      Math.abs(next.progress - this.announced) < 0.02
    )
      return;
    this.value = next;
    this.announced = next.progress;
    this.emit();
  }

  clear() {
    this.set(null);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

/**
 * When the cue should be on screen, and how far through its lead-in it is.
 *
 * The lead-in is measured from the **start of the blend**, not from the end of
 * the file. A mix begins a whole phrase before the end — sixteen to twenty-four
 * seconds of it — so counting backwards from the end announced the handover only
 * after the two songs had already met, which is the same as not announcing it.
 * Returns null when there is nothing to announce yet.
 */
export function cueTiming(
  remaining: number,
  blendWindow: number,
): { seconds: number; progress: number } | null {
  if (!Number.isFinite(remaining) || !Number.isFinite(blendWindow)) return null;
  if (remaining <= 0 || blendWindow <= 0) return null;
  if (remaining > blendWindow + MIX_CUE_SECONDS) return null;
  const untilBlend = Math.max(0, remaining - blendWindow);
  return {
    seconds: Math.max(1, Math.ceil(untilBlend)),
    progress: Math.max(0, Math.min(1, 1 - untilBlend / MIX_CUE_SECONDS)),
  };
}

/**
 * The cue while the song in the bar is one of the two songs in it.
 *
 * Either side counts: the word appears while the outgoing song is still playing,
 * and by the moment the two meet the bar has already moved on to the incoming
 * one. Requiring the outgoing song kept the cue invisible for the whole blend.
 */
export function cueForTrack(cue: MixCue | null, trackId: string | undefined): MixCue | null {
  if (!cue || !trackId) return null;
  return cue.from.id === trackId || cue.to.id === trackId ? cue : null;
}

/** The pending cue, for the two places that draw it. */
export function useMixCue(store: MixCueStore): MixCue | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
