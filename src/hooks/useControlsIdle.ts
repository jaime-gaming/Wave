import { useCallback, useEffect, useState } from 'react';

/** Anything the listener does counts as "I am here": mouse, wheel, keys, touch. */
const ACTIVITY = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'] as const;

/**
 * Puts the transport away while a song plays and nothing is happening.
 *
 * Now Playing is a listening screen, so after a couple of seconds without
 * movement the controls step back and the lyrics get the room. They come back on
 * the first movement or key press, and a focused control keeps them on screen:
 * hiding a button is fine, hiding the only way to reach it is not.
 */
export function useControlsIdle(active: boolean, delay = 2000) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Something inside the transport has focus, so it stays reachable.
        if (document.activeElement?.closest('.stage-transport')) {
          arm();
          return;
        }
        setIdle(true);
      }, delay);
    };
    const wake = () => {
      setIdle(false);
      arm();
    };
    ACTIVITY.forEach((event) => window.addEventListener(event, wake, { passive: true }));
    arm();
    return () => {
      if (timer) clearTimeout(timer);
      ACTIVITY.forEach((event) => window.removeEventListener(event, wake));
      setIdle(false);
    };
  }, [active, delay]);

  const wake = useCallback(() => setIdle(false), []);
  return { idle: active && idle, wake };
}
