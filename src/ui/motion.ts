import { createContext, useContext, useSyncExternalStore } from 'react';
import { type Transition, type Variants } from 'motion/react';

export const MotionPreference = createContext(true);

export const spatial: Transition = { type: 'spring', stiffness: 380, damping: 36, mass: 0.85 };

export const wobble: Transition = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 };
export const fastSpatial: Transition = { type: 'spring', stiffness: 650, damping: 38, mass: 0.7 };
export const expressive: Transition = { type: 'spring', stiffness: 280, damping: 32, mass: 1 };

export const cinematic: Transition = { type: 'spring', stiffness: 150, damping: 27, mass: 1.1 };
export const lateral: Transition = { type: 'spring', stiffness: 310, damping: 34, mass: 0.85 };
export const effects: Transition = { duration: 0.16, ease: [0.2, 0, 0, 1] };

export const reveal: Transition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] };

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export const stagger = (delayChildren = 0.02, staggerChildren = 0.035): Variants => ({
  hidden: {},
  visible: { transition: { delayChildren, staggerChildren } },
});

function mediaStore(query: string, fallback: boolean) {
  let media: MediaQueryList | undefined;
  const listeners = new Set<() => void>();
  const getMedia = () => {
    if (!media && typeof window !== 'undefined' && window.matchMedia) {
      media = window.matchMedia(query);
    }
    return media;
  };
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    snapshot: () => getMedia()?.matches ?? fallback,
    subscribe: (listener: () => void) => {
      const current = getMedia();
      if (!listeners.size) current?.addEventListener('change', notify);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          current?.removeEventListener('change', notify);
          media = undefined;
        }
      };
    },
  };
}

// Hundreds of song and lyric rows share two OS listeners, rather than each
// allocating a pair of MediaQueryLists and change handlers.
const reducedMotion = mediaStore('(prefers-reduced-motion: reduce)', true);
const hover = mediaStore('(hover: hover) and (pointer: fine)', false);

export function useWaveMotion() {
  const preference = useContext(MotionPreference);
  const reduced = useSyncExternalStore(reducedMotion.subscribe, reducedMotion.snapshot, () => true);

  const enabled = preference && !reduced;
  const canHover = useSyncExternalStore(hover.subscribe, hover.snapshot, () => false);
  return {
    enabled,
    hoverEnabled: enabled && canHover,
    lateral: enabled ? lateral : { duration: 0 },
    spatial: enabled ? spatial : { duration: 0 },
    wobble: enabled ? wobble : { duration: 0 },
    fast: enabled ? fastSpatial : { duration: 0 },
    expressive: enabled ? expressive : { duration: 0 },
    cinematic: enabled ? cinematic : { duration: 0 },
    effects: enabled ? effects : { duration: 0 },
    reveal: enabled ? reveal : { duration: 0 },

    rise: enabled ? riseIn : { hidden: { opacity: 1 }, visible: { opacity: 1 } },
    stagger: enabled ? stagger() : { hidden: {}, visible: {} },
  };
}
