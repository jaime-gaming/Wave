import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWaveMotion, MotionPreference } from './motion';
afterEach(() => vi.unstubAllGlobals());
it('responds immediately to system motion changes, not just the initial page load', () => {
  let reduced = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return reduced;
      },
      addEventListener: (_event: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_event: string, fn: () => void) => listeners.delete(fn),
    })),
  );
  const { result, unmount } = renderHook(() => useWaveMotion());
  expect(result.current.enabled).toBe(true);
  act(() => {
    reduced = true;
    listeners.forEach((listener) => listener());
  });
  expect(result.current.enabled).toBe(false);
  expect(result.current.spatial).toEqual({ duration: 0 });
  expect(result.current.lateral).toEqual({ duration: 0 });
  act(() => {
    reduced = false;
    listeners.forEach((listener) => listener());
  });
  expect(result.current.enabled).toBe(true);
  unmount();
  expect(listeners.size).toBe(0);
});
it('keeps the app animation preference authoritative even when the system permits motion', () => {
  const { result } = renderHook(() => useWaveMotion(), {
    wrapper: ({ children }) => (
      <MotionPreference.Provider value={false}>{children}</MotionPreference.Provider>
    ),
  });
  expect(result.current.enabled).toBe(false);
  expect(result.current.effects).toEqual({ duration: 0 });
});

it('allows hover motion only with a fine pointer and updates when input capabilities change', () => {
  let hover = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query.includes('pointer: fine') ? hover : false;
      },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  const { result, unmount } = renderHook(() => useWaveMotion());
  expect(result.current.hoverEnabled).toBe(true);
  act(() => {
    hover = false;
    listeners.forEach((listener) => listener());
  });
  expect(result.current.hoverEnabled).toBe(false);
  expect(result.current.enabled).toBe(true);
  unmount();
  expect(listeners.size).toBe(0);
});
