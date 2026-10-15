import { MotionPreference } from '../ui/motion';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppPalette } from './useAppPalette';
vi.mock('./useArtworkColor', () => ({
  useArtworkColor: (artwork?: string) =>
    artwork ? { '--art-hue': artwork === 'red' ? 10 : 220, '--art-saturation': '30%' } : {},
}));
afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  document.documentElement.style.removeProperty('--wave-hue');
  document.documentElement.style.removeProperty('--wave-saturation');
});
it('ignores stale palette callbacks after rapid track/pause changes', () => {
  const updates: (() => void)[] = [],
    skip = vi.fn();
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (update: () => void) => {
      updates.push(update);
      return { ready: Promise.resolve(), finished: Promise.resolve(), skipTransition: skip };
    },
  });
  const { rerender } = renderHook(({ artwork }: { artwork?: string }) => useAppPalette(artwork), {
    initialProps: { artwork: 'red' as string | undefined },
  });
  rerender({ artwork: 'blue' });
  rerender({ artwork: undefined });
  act(() => {
    updates.at(-1)!();
    updates[1]();
    updates[0]();
  });
  expect(document.documentElement.style.getPropertyValue('--wave-hue')).toBe('226');
  expect(skip).toHaveBeenCalled();
});
it('interpolates the palette through the real overlap without a view transition per frame', () => {
  const start = vi.fn();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  const hook = renderHook(
    ({ progress }) => useAppPalette('blue', { from: { artwork: 'red' }, progress, seconds: 4 }),
    { initialProps: { progress: 0 } },
  );
  expect(document.documentElement.style.getPropertyValue('--wave-hue')).toBe('10.000');
  hook.rerender({ progress: 0.5 });
  expect(document.documentElement.style.getPropertyValue('--wave-hue')).toBe('295.000');
  expect(document.documentElement.dataset.paletteTransition).toBe('mix');
  hook.rerender({ progress: 1 });
  expect(document.documentElement.style.getPropertyValue('--wave-hue')).toBe('220');
  expect(start).not.toHaveBeenCalled();
  hook.unmount();
  expect(document.documentElement.dataset.paletteTransition).toBeUndefined();
});
it('uses the current displayed palette until outgoing artwork has decoded', () => {
  document.documentElement.style.setProperty('--wave-hue', '80');
  document.documentElement.style.setProperty('--wave-saturation', '40%');
  renderHook(() => useAppPalette('blue', { from: {}, progress: 0, seconds: 4 }));
  expect(document.documentElement.style.getPropertyValue('--wave-hue')).toBe('80.000');
});

it('honors motion opt-out during overlap and persists the final palette without an extra reveal', () => {
  const start = vi.fn();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  const hook = renderHook(
    ({ mixing }) =>
      useAppPalette(
        'blue',
        mixing ? { from: { artwork: 'red' }, progress: 0.3, seconds: 4 } : null,
      ),
    {
      initialProps: { mixing: true },
      wrapper: ({ children }: { children: ReactNode }) => (
        <MotionPreference.Provider value={false}>{children}</MotionPreference.Provider>
      ),
    },
  );
  expect(document.documentElement.style.getPropertyValue('--wave-hue')).toBe('220');
  expect(document.documentElement.dataset.paletteTransition).toBeUndefined();
  hook.rerender({ mixing: false });
  expect(JSON.parse(localStorage.getItem('wave-palette')!)).toEqual({
    hue: 220,
    saturation: '30%',
  });
  expect(start).not.toHaveBeenCalled();
});
