import { useCallback, useEffect, useState } from 'react';
/** The quiet album/lyrics scene from 0.1.0, never covering an editor or hidden tab. */
export function useIdleListening(playing: boolean, trackId?: string) {
  const [immersive, setImmersive] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const wake = useCallback(() => {
    setImmersive(false);
    setEpoch((value) => value + 1);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (
          document.visibilityState === 'visible' &&
          document.hasFocus() &&
          !document.querySelector('dialog[open]:not(.player-modal), .lyrics-timing[open]') &&
          !document.activeElement?.matches(
            'textarea,select,[contenteditable="true"],input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="file"])',
          )
        )
          setImmersive(true);
        else arm();
      }, 30_000);
    };
    const activity = () => {
      setImmersive(false);
      arm();
    };
    const visibility = () => {
      setImmersive(false);
      if (document.visibilityState === 'visible' && document.hasFocus()) arm();
      else clearTimeout(timer);
    };
    const events = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel'] as const;
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener('blur', visibility);
    window.addEventListener('focus', visibility);
    document.addEventListener('visibilitychange', visibility);
    const initial = setTimeout(activity, 0);
    return () => {
      clearTimeout(initial);
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, activity));
      window.removeEventListener('blur', visibility);
      window.removeEventListener('focus', visibility);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [playing, trackId, epoch]);
  return { immersive: playing && immersive, wake };
}
