import { createContext, useContext, useSyncExternalStore } from 'react';
import { type Transition, type Variants } from 'motion/react';

/**
 * Motion tokens.
 *
 * Two families, used on purpose: springs for anything the user moves or opens
 * (they settle without a hard stop), and eased fades for anything that only
 * changes appearance (they never overshoot). Every token collapses to zero
 * duration when the user asks for reduced motion, so nothing has to special-case
 * it at the call site.
 */
export const MotionPreference = createContext(true);

export const spatial: Transition = { type: 'spring', stiffness: 420, damping: 26, mass: 0.9 };
export const fastSpatial: Transition = { type: 'spring', stiffness: 650, damping: 29, mass: 0.7 };
export const expressive: Transition = { type: 'spring', stiffness: 280, damping: 25, mass: 1 };
/** Slow, wide movement for the stage: openings and artwork. */
export const cinematic: Transition = { type: 'spring', stiffness: 150, damping: 24, mass: 1.1 };
export const effects: Transition = { duration: 0.16, ease: [0.2, 0, 0, 1] };
/** Longer cross-fade used when a whole surface changes. */
export const reveal: Transition = { duration: 0.42, ease: [0.16, 1, 0.3, 1] };

/** Entrance for a card or row: rises, settles and loses its blur. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

/** Parent that releases its children one after another. */
export const stagger = (delayChildren = 0.04, staggerChildren = 0.05): Variants => ({
  hidden: {},
  visible: { transition: { delayChildren, staggerChildren } },
});

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
    cinematic: enabled ? cinematic : { duration: 0 },
    effects: enabled ? effects : { duration: 0 },
    reveal: enabled ? reveal : { duration: 0 },
    /** Variants with the durations removed when motion is off. */
    rise: enabled ? riseIn : { hidden: { opacity: 1 }, visible: { opacity: 1 } },
    stagger: enabled ? stagger() : { hidden: {}, visible: {} },
  };
}
