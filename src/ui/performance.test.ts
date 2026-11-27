import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  applyPerformanceProfile,
  budgetFor,
  currentProfile,
  motionEnabled,
  profileFor,
  readDeviceSignals,
  usePerformanceProfile,
} from './performance';

describe('automatic device profiles', () => {
  it('keeps the full experience when the browser reports no power hints', () => {
    expect(profileFor({})).toBe('full');
    expect(profileFor({ reducedMotion: false, devicePixelRatio: 1, smallScreen: false })).toBe(
      'full',
    );
  });

  it('always honours the OS reduced-motion preference', () => {
    expect(profileFor({ reducedMotion: true, deviceMemory: 16, hardwareConcurrency: 16 })).toBe(
      'lite',
    );
  });

  it('sheds decorative work on a small or constrained device', () => {
    expect(profileFor({ deviceMemory: 2, hardwareConcurrency: 2 })).toBe('lite');
    expect(profileFor({ deviceMemory: 4, hardwareConcurrency: 4, saveData: true })).toBe('lite');
    expect(
      profileFor({
        deviceMemory: 4,
        hardwareConcurrency: 4,
        effectiveType: '3g',
        devicePixelRatio: 3,
        smallScreen: true,
        pointerCoarse: true,
      }),
    ).toBe('lite');
  });

  it('uses a middle profile for ordinary hardware and everything for fast hardware', () => {
    expect(profileFor({ deviceMemory: 4, hardwareConcurrency: 4 })).toBe('balanced');
    expect(profileFor({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe('full');
  });

  it('budgets less work as the profile gets lighter', () => {
    const lite = budgetFor('lite');
    const balanced = budgetFor('balanced');
    const full = budgetFor('full');
    expect(lite.maxAnalysisBytes).toBeLessThan(balanced.maxAnalysisBytes);
    expect(balanced.maxAnalysisBytes).toBeLessThan(full.maxAnalysisBytes);
    expect(lite.incrementalRows).toBeLessThan(balanced.incrementalRows);
    expect(balanced.incrementalRows).toBeLessThan(full.incrementalRows);
    expect(lite.maxCachedAnalyses).toBeLessThan(full.maxCachedAnalyses);
    expect(lite.heavyEffects).toBe(false);
    expect(lite.ambientMotion).toBe(false);
    expect(full.heavyEffects).toBe(true);
  });
});

describe('profile in the app', () => {
  it('motion obeys the user switch and OS setting; profiles only shed ambient work', () => {
    expect(motionEnabled(true, false)).toBe(true);
    expect(motionEnabled(false, false)).toBe(false);
    expect(motionEnabled(true, true)).toBe(false);
    expect(budgetFor('full').ambientMotion).toBe(true);
    expect(budgetFor('lite').ambientMotion).toBe(false);
  });

  it('writes the profile to the root element before any component reads it', () => {
    const root = document.createElement('div');
    applyPerformanceProfile('lite', root);
    expect(root.dataset.perf).toBe('lite');
    applyPerformanceProfile('full', root);
    expect(root.dataset.perf).toBe('full');
  });

  it('reads optional signals without throwing in a test browser', () => {
    const signals = readDeviceSignals();
    expect(signals).toBeTypeOf('object');
    expect(signals.reducedMotion).toBe(false);

    expect(['lite', 'balanced', 'full']).toContain(currentProfile());
  });

  it('exposes a stable reactive profile to components', () => {
    const { result } = renderHook(() => usePerformanceProfile());
    expect(['lite', 'balanced', 'full']).toContain(result.current);
    expect(result.current).toBe(currentProfile());
  });
});
