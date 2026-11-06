import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useIdleListening } from './useIdleListening';
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.querySelector('dialog')?.remove();
});
it('enters the old dedicated scene after thirty seconds and wakes on activity', () => {
  const { result } = renderHook(() => useIdleListening(true, 'song'));
  act(() => vi.advanceTimersByTime(29999));
  expect(result.current.immersive).toBe(false);
  act(() => vi.advanceTimersByTime(2));
  expect(result.current.immersive).toBe(true);
  act(() => window.dispatchEvent(new Event('pointermove')));
  expect(result.current.immersive).toBe(false);
});
it('does not cover an editor, and does not keep the scene when paused', () => {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  const { result, rerender } = renderHook(({ playing }) => useIdleListening(playing, 'song'), {
    initialProps: { playing: true },
  });
  act(() => vi.advanceTimersByTime(30001));
  expect(result.current.immersive).toBe(false);
  dialog.remove();
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.immersive).toBe(true);
  rerender({ playing: false });
  expect(result.current.immersive).toBe(false);
});
it('never enters in an unfocused tab', () => {
  vi.mocked(document.hasFocus).mockReturnValue(false);
  const { result } = renderHook(() => useIdleListening(true, 'song'));
  act(() => vi.advanceTimersByTime(60001));
  expect(result.current.immersive).toBe(false);
});
