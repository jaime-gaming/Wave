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

export const spatial: Transition = { type: 'spring', stiffness: 380, damping: 36, mass: 0.85 };
/** A restrained accent spring: near-critical damping, no visible ringing. */
export const wobble: Transition = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 };
export const fastSpatial: Transition = { type: 'spring', stiffness: 650, damping: 38, mass: 0.7 };
export const expressive: Transition = { type: 'spring', stiffness: 280, damping: 32, mass: 1 };
/** Slow, wide movement for the stage: openings and artwork. */
export const cinematic: Transition = { type: 'spring', stiffness: 150, damping: 27, mass: 1.1 };
export const lateral: Transition = { type: 'spring', stiffness: 360, damping: 36, mass: 0.85 };
export const effects: Transition = { duration: 0.16, ease: [0.2, 0, 0, 1] };
/** Longer cross-fade used when a whole surface changes. */
export const reveal: Transition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] };

/** Entrance for a card or row: a short, sharp rise without expensive text blur. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

/** Parent that releases its children one after another. */
export const stagger = (delayChildren = 0.02, staggerChildren = 0.035): Variants => ({
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
const hoverQuery = '(hover: hover) and (pointer: fine)';
function subscribeHover(listener: () => void) {
  const media = window.matchMedia(hoverQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const hoverSnapshot = () => window.matchMedia(hoverQuery).matches;

export function useWaveMotion() {
  const preference = useContext(MotionPreference);
  const reduced = useSyncExternalStore(subscribe, snapshot, () => true);
  const enabled = preference && !reduced;
  const canHover = useSyncExternalStore(subscribeHover, hoverSnapshot, () => false);
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
    /** Variants with the durations removed when motion is off. */
    rise: enabled ? riseIn : { hidden: { opacity: 1 }, visible: { opacity: 1 } },
    stagger: enabled ? stagger() : { hidden: {}, visible: {} },
  };
}
