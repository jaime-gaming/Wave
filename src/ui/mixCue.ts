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

/** How long the cue is shown before a handover. */
export const MIX_CUE_SECONDS = 20;

export class MixCueStore {
  private value: MixCue | null = null;
  private listeners = new Set<() => void>();

  get = () => this.value;

  set(next: MixCue | null) {
    const previous = this.value;
    if (!next && !previous) return;
    if (!next || !previous) {
      this.value = next;
      this.emit();
      return;
    }
    // One notification per whole second, not per frame: the label counts seconds
    // and the picture moves by a fraction the CSS interpolates itself.
    if (
      previous.from.id === next.from.id &&
      previous.to.id === next.to.id &&
      previous.seconds === next.seconds
    ) {
      previous.progress = next.progress;
      return;
    }
    this.value = next;
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

/** The pending cue, for the two places that draw it. */
export function useMixCue(store: MixCueStore): MixCue | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
