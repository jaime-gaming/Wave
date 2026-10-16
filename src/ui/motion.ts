import { createContext, useContext, useSyncExternalStore } from 'react';
import { type Transition } from 'motion/react';

export const MotionPreference = createContext(true);
export const spatial: Transition = { type: 'spring', stiffness: 420, damping: 26, mass: 0.9 };
export const fastSpatial: Transition = { type: 'spring', stiffness: 650, damping: 29, mass: 0.7 };
export const expressive: Transition = { type: 'spring', stiffness: 280, damping: 25, mass: 1 };
export const effects: Transition = { duration: 0.16, ease: [0.2, 0, 0, 1] };
const query = '(prefers-reduced-motion: reduce)';
function subscribe(listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const snapshot = () => window.matchMedia(query).matches;
export function useWaveMotion() {
  const preference = useContext(MotionPreference);
  const reduced = useSyncExternalStore(subscribe, snapshot, () => true);
  const enabled = preference && !reduced;
  return {
    enabled,
    spatial: enabled ? spatial : { duration: 0 },
    fast: enabled ? fastSpatial : { duration: 0 },
    expressive: enabled ? expressive : { duration: 0 },
    effects: enabled ? effects : { duration: 0 },
  };
}
