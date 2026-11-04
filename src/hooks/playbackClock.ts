import { useSyncExternalStore } from 'react';

/**
 * Playback position, kept outside React state.
 *
 * A song's position changes twenty times a second. Holding it in `useState` at
 * the top of the tree re-rendered the whole interface — every library row, every
 * card — twenty times a second, which is what made the app crawl on a phone.
 * Only the seek bar and the time readout need this value, so they subscribe to
 * it directly and nothing else re-renders.
 */
const NOTIFY_MS = 100;

export class PlaybackClock {
  private value = 0;
  private last = Date.now();
  private trailing: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();

  get = () => this.value;

  /**
   * Records a new position. Listeners are notified at most every `NOTIFY_MS`,
   * so a 20 Hz source cannot turn into 20 renders a second; the last value of a
   * burst is always delivered.
   */
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

  /** Resets to zero when a new song loads. */
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

/** Current position, only for the components that draw it. */
export function usePlaybackTime(clock: PlaybackClock): number {
  return useSyncExternalStore(clock.subscribe, clock.get, clock.get);
}
