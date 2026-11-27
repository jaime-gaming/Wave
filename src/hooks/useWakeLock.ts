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
      } catch {}
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
