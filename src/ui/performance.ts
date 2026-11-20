import { useSyncExternalStore } from 'react';

/**
 * One Wave, every kind of device (Wave 3.0).
 *
 * Wave used to make every phone, tablet and desktop do the same work: the same
 * ambient blur, the same spring animations, the same sized decoded analyses and
 * the same number of rows rendered at once. That is fine on a fast laptop and
 * visibly not fine on a small phone.
 *
 * This module reads only signals the browser already exposes and chooses one of
 * three profiles. There is no setting to find and nothing to configure: a
 * capable device keeps everything, a modest one sheds decorative work first,
 * and the user's own reduced-motion preference always wins. Audio files, playback
 * features and stored data are never affected — only how much work the interface
 * does to draw and analyse them.
 */
export type PerformanceProfile = 'lite' | 'balanced' | 'full';

export interface DeviceSignals {
  /** Approximate device RAM in GB (`navigator.deviceMemory`). */
  deviceMemory?: number;
  /** Logical CPU cores. */
  hardwareConcurrency?: number;
  /** The user asked for less motion at the OS level. */
  reducedMotion?: boolean;
  /** Data Saver is on. */
  saveData?: boolean;
  /** Effective connection class, e.g. '3g'. */
  effectiveType?: string;
  devicePixelRatio?: number;
  /** Narrow viewport, where a large list is most expensive. */
  smallScreen?: boolean;
  pointerCoarse?: boolean;
}

export interface PerformanceBudget {
  /** Largest source we will decode for Mix analysis on this device. */
  maxAnalysisBytes: number;
  /** Largest source we will decode for the amplitude envelope. */
  maxEnvelopeBytes: number;
  /** How many finished analyses stay in memory. */
  maxCachedAnalyses: number;
  /** Rows rendered per page of a long library. */
  incrementalRows: number;
  /** Blurs, backdrop filters and large glows. */
  heavyEffects: boolean;
  /** Decorative, continuously running motion. */
  ambientMotion: boolean;
}

const MB = 1024 * 1024;
const budgets: Record<PerformanceProfile, PerformanceBudget> = {
  full: {
    maxAnalysisBytes: 60 * MB,
    maxEnvelopeBytes: 24 * MB,
    maxCachedAnalyses: 32,
    incrementalRows: 80,
    heavyEffects: true,
    ambientMotion: true,
  },
  balanced: {
    maxAnalysisBytes: 36 * MB,
    maxEnvelopeBytes: 16 * MB,
    maxCachedAnalyses: 20,
    incrementalRows: 60,
    heavyEffects: true,
    ambientMotion: false,
  },
  lite: {
    maxAnalysisBytes: 16 * MB,
    maxEnvelopeBytes: 8 * MB,
    maxCachedAnalyses: 8,
    incrementalRows: 32,
    heavyEffects: false,
    ambientMotion: false,
  },
};

export function budgetFor(profile: PerformanceProfile): PerformanceBudget {
  return budgets[profile] ?? budgets.full;
}

/**
 * A deliberate score rather than a user-agent list: an old phone, a tablet with
 * two cores and a laptop on Data Saver all end up in `lite` for the same reason,
 * and a device that tells us nothing keeps the complete experience.
 */
export function profileFor(signals: DeviceSignals): PerformanceProfile {
  if (signals.reducedMotion) return 'lite';
  // Only real hardware/network hints justify downgrading. A browser that just
  // reports "not reduced motion, one device pixel, a wide window" told us
  // nothing about its power, and keeps the full experience.
  const informative = [
    signals.deviceMemory,
    signals.hardwareConcurrency,
    signals.saveData,
    signals.effectiveType,
  ].some((value) => value !== undefined);
  if (!informative) return 'full';

  let score = 0;
  const memory = signals.deviceMemory;
  if (memory !== undefined) score += memory <= 2 ? -2 : memory <= 4 ? -1 : memory >= 8 ? 1 : 0;
  const cores = signals.hardwareConcurrency;
  if (cores !== undefined) score += cores <= 2 ? -2 : cores <= 4 ? -1 : cores >= 8 ? 1 : 0;
  if (signals.saveData) score -= 2;
  if (signals.effectiveType && /^(?:slow-2g|2g|3g)$/i.test(signals.effectiveType)) score -= 1;
  if (signals.devicePixelRatio !== undefined && signals.devicePixelRatio >= 3) score -= 1;
  if (signals.smallScreen && signals.pointerCoarse) score -= 1;
  return score <= -3 ? 'lite' : score <= 0 ? 'balanced' : 'full';
}

interface NetworkInformation extends EventTarget {
  saveData?: boolean;
  effectiveType?: string;
}

function network(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function matches(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** Reads what the browser is willing to tell us; every signal is optional. */
export function readDeviceSignals(): DeviceSignals {
  if (typeof window === 'undefined') return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  const connection = network();
  return {
    deviceMemory: number(nav.deviceMemory),
    hardwareConcurrency: number(nav.hardwareConcurrency),
    reducedMotion: matches('(prefers-reduced-motion: reduce)'),
    saveData: typeof connection?.saveData === 'boolean' ? connection.saveData : undefined,
    effectiveType: connection?.effectiveType,
    devicePixelRatio: number(window.devicePixelRatio),
    smallScreen: typeof window.innerWidth === 'number' ? window.innerWidth < 700 : undefined,
    pointerCoarse: matches('(pointer: coarse)'),
  };
}

export function currentProfile(): PerformanceProfile {
  return profileFor(readDeviceSignals());
}

/** The CSS hooks read `data-perf` on the root element. */
export function applyPerformanceProfile(
  profile: PerformanceProfile,
  root: HTMLElement | undefined = typeof document === 'undefined'
    ? undefined
    : document.documentElement,
): void {
  if (root) root.dataset.perf = profile;
}

/** Re-evaluates when the OS motion preference, connection or viewport changes. */
export function watchPerformanceProfile(
  onChange: (profile: PerformanceProfile) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const notify = () => onChange(profileFor(readDeviceSignals()));
  const media = ['(prefers-reduced-motion: reduce)', '(pointer: coarse)']
    .map((query) => {
      try {
        return window.matchMedia(query);
      } catch {
        return undefined;
      }
    })
    .filter((item): item is MediaQueryList => !!item);
  for (const item of media) item.addEventListener?.('change', notify);
  const connection = network();
  connection?.addEventListener?.('change', notify);
  window.addEventListener('resize', notify, { passive: true });
  return () => {
    for (const item of media) item.removeEventListener?.('change', notify);
    connection?.removeEventListener?.('change', notify);
    window.removeEventListener('resize', notify);
  };
}

const subscribe = (listener: () => void) => watchPerformanceProfile(() => listener());
const getSnapshot = () => currentProfile();

/** Reactive profile for components; stable during a render. */
export function usePerformanceProfile(): PerformanceProfile {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'full');
}

/**
 * Interface motion belongs to the user's switch and the OS reduced-motion
 * setting. Automatic profiles shed ambient/decorative effects through
 * `budgetFor(profile).ambientMotion` and `data-perf`; they must not silently
 * disable the transitions that the user explicitly left on.
 */
export function motionEnabled(preference: boolean, reducedMotion: boolean): boolean {
  return preference && !reducedMotion;
}
