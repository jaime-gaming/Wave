import { useEffect, useState } from 'react';
const IDLE_MS = 30000;
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
const dialogOpen = () => !!document.querySelector('dialog[open]:not(.player-modal)');
const interactive = () => !document.hidden && document.hasFocus() && !dialogOpen();

/**
 * Enters the immersive idle listening screen after 30 seconds of inactivity
 * while music is playing.
 *
 * Intentionally independent of `trackId`: changing tracks or crossing a Mix
 * transition keeps the idle listening scene active instead of dismissing it.
 */
export function useIdleListening(active: boolean, _trackId?: string) {
  void _trackId;
  const [immersive, setImmersive] = useState(false);
  useEffect(() => {
    if (!active) {
      const clear = setTimeout(() => setImmersive(false), 0);
      return () => clearTimeout(clear);
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (interactive()) setImmersive(true);
        else schedule();
      }, IDLE_MS);
    };
    const activity = () => {
      setImmersive(false);
      schedule();
    };
    schedule();
    for (const event of EVENTS) window.addEventListener(event, activity, { passive: true });
    window.addEventListener('blur', activity);
    document.addEventListener('visibilitychange', activity);
    return () => {
      clearTimeout(timer);
      for (const event of EVENTS) window.removeEventListener(event, activity);
      window.removeEventListener('blur', activity);
      document.removeEventListener('visibilitychange', activity);
    };
  }, [active]);
  return { immersive: active && immersive, wake: () => setImmersive(false) };
}
