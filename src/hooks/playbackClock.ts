import { useSyncExternalStore } from 'react';

const NOTIFY_MS = 100;

export class PlaybackClock {
  private value = 0;
  private last = Date.now();
  private trailing: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();

  get = () => this.value;

  set(next: number, immediate = false) {
    const value = Number.isFinite(next) && next >= 0 ? next : 0;
    if (value === this.value) return;
    this.value = value;
    if (immediate) {
      this.flush();
      return;
    }
    const wait = NOTIFY_MS - (Date.now() - this.last);
    if (wait <= 0) {
      this.flush();
      return;
    }
    if (this.trailing) return;
    this.trailing = setTimeout(() => {
      this.trailing = undefined;
      this.emit();
    }, wait);
  }

  reset() {
    this.value = 0;
    this.flush();
  }

  private flush() {
    if (this.trailing) {
      clearTimeout(this.trailing);
      this.trailing = undefined;
    }
    this.emit();
  }

  private emit() {
    this.last = Date.now();
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  destroy() {
    if (this.trailing) clearTimeout(this.trailing);
    this.trailing = undefined;
    this.listeners.clear();
  }
}

export function usePlaybackTime(clock: PlaybackClock): number {
  return useSyncExternalStore(clock.subscribe, clock.get, clock.get);
}
