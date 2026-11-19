import { useEffect } from 'react';

interface WakeLockSentinelLike {
  released?: boolean;
  release(): Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

/**
 * Keeps the screen awake via the Screen Wake Lock API while Wave is open and
 * playing music. Re-acquires automatically when returning to a visible tab, and
 * releases cleanly when playback pauses or stops.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (navigator as Navigator & NavigatorWithWakeLock).wakeLock;
    if (!active || !api) return;

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const release = () => {
      const current = sentinel;
      sentinel = null;
      if (current && !current.released) {
        void current.release().catch(() => {});
      }
    };

    const acquire = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      if (sentinel && !sentinel.released) return;
      try {
        const lock = await api.request('screen');
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        // Low-battery mode or denied permissions simply leave screen timeout untouched.
      }
    };

    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
      else release();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);
}
