import { useEffect, useState, useCallback } from 'react';
/** Visible, playing sessions only; editing dialogs are never covered. */
export function useIdleListening(playing: boolean) {
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
      }, 30000);
    };
    const activity = () => {
      setImmersive(false);
      arm();
    };
    const visibility = () => {
      setImmersive(false);
      if (document.visibilityState === 'visible') arm();
      else clearTimeout(timer);
    };
    const events = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel'] as const;
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener('blur', visibility);
    window.addEventListener('focus', visibility);
    document.addEventListener('visibilitychange', visibility);
    arm();
    return () => {
      setImmersive(false);
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, activity));
      window.removeEventListener('blur', visibility);
      window.removeEventListener('focus', visibility);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [playing, epoch]);
  useEffect(() => {
    document.documentElement.dataset.immersive = String(playing && immersive);
    return () => {
      delete document.documentElement.dataset.immersive;
    };
  }, [playing, immersive]);
  return { immersive: playing && immersive, wake };
}
