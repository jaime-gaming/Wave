import { useSyncExternalStore } from 'react';

export type PerformanceProfile = 'lite' | 'balanced' | 'full';

export interface DeviceSignals {
  deviceMemory?: number;

  hardwareConcurrency?: number;

  reducedMotion?: boolean;

  saveData?: boolean;

  effectiveType?: string;
  devicePixelRatio?: number;

  smallScreen?: boolean;
  pointerCoarse?: boolean;
}

export interface PerformanceBudget {
  maxAnalysisBytes: number;

  maxEnvelopeBytes: number;

  maxCachedAnalyses: number;

  incrementalRows: number;

  heavyEffects: boolean;

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

export function profileFor(signals: DeviceSignals): PerformanceProfile {
  if (signals.reducedMotion) return 'lite';

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

export function applyPerformanceProfile(
  profile: PerformanceProfile,
  root: HTMLElement | undefined = typeof document === 'undefined'
    ? undefined
    : document.documentElement,
): void {
  if (root) root.dataset.perf = profile;
}

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

export function usePerformanceProfile(): PerformanceProfile {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'full');
}

export function motionEnabled(preference: boolean, reducedMotion: boolean): boolean {
  return preference && !reducedMotion;
}
