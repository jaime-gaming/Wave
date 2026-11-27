import { useSyncExternalStore } from 'react';
import type { Track } from '../domain/types';

export interface MixCue {
  from: Track;
  to: Track;

  seconds: number;

  progress: number;
}

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

export function cueForTrack(cue: MixCue | null, trackId: string | undefined): MixCue | null {
  if (!cue || !trackId) return null;
  return cue.from.id === trackId || cue.to.id === trackId ? cue : null;
}

export function useMixCue(store: MixCueStore): MixCue | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
