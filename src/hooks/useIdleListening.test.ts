import { renderHook, act } from '@testing-library/react';
import { it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useIdleListening } from './useIdleListening';
beforeEach(() => vi.spyOn(document, 'hasFocus').mockReturnValue(true));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('enters after 30 seconds and wakes immediately without changing playback', () => {
  vi.useFakeTimers();
  const hook = renderHook(({ playing }) => useIdleListening(playing), {
    initialProps: { playing: true },
  });
  act(() => vi.advanceTimersByTime(29999));
  expect(hook.result.current.immersive).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(hook.result.current.immersive).toBe(true);
  act(() => window.dispatchEvent(new Event('pointermove')));
  expect(hook.result.current.immersive).toBe(false);
  act(() => vi.advanceTimersByTime(30000));
  expect(hook.result.current.immersive).toBe(true);
  act(() => hook.rerender({ playing: false }));
  expect(hook.result.current.immersive).toBe(false);
});
it('does not cover editing dialogs', () => {
  vi.useFakeTimers();
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  const hook = renderHook(() => useIdleListening(true));
  act(() => vi.advanceTimersByTime(30000));
  expect(hook.result.current.immersive).toBe(false);
  dialog.remove();
  act(() => vi.advanceTimersByTime(30000));
  expect(hook.result.current.immersive).toBe(true);
});
it('requires a fresh idle period after playback stops or buffers', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ playing }) => useIdleListening(playing), {
    initialProps: { playing: true },
  });
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.immersive).toBe(true);
  rerender({ playing: false });
  rerender({ playing: true });
  expect(result.current.immersive).toBe(false);
  act(() => vi.advanceTimersByTime(29999));
  expect(result.current.immersive).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.immersive).toBe(true);
});
it('does not cover a focused text editor outside a dialog', () => {
  vi.useFakeTimers();
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  const { result } = renderHook(() => useIdleListening(true));
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.immersive).toBe(false);
  input.blur();
  input.remove();
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.immersive).toBe(true);
});
it('cannot enter while another tab or application owns focus and blur wakes immediately', () => {
  vi.useFakeTimers();
  const focus = vi.mocked(document.hasFocus);
  focus.mockReturnValue(false);
  const { result } = renderHook(() => useIdleListening(true));
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.immersive).toBe(false);
  focus.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('focus')));
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.immersive).toBe(true);
  focus.mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('blur')));
  expect(result.current.immersive).toBe(false);
});

it('does not cover an open lyric timing adjustment', () => {
  vi.useFakeTimers();
  const details = document.createElement('details');
  details.className = 'lyrics-timing';
  details.open = true;
  document.body.append(details);
  const { result } = renderHook(() => useIdleListening(true));
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.immersive).toBe(false);
  details.remove();
  act(() => window.dispatchEvent(new Event('pointermove')));
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.immersive).toBe(true);
});
it('signals complete-shell hiding only while immersive playback is active and cleans up', () => {
  vi.useFakeTimers();
  const { unmount } = renderHook(() => useIdleListening(true));
  expect(document.documentElement.dataset.immersive).toBe('false');
  act(() => vi.advanceTimersByTime(30000));
  expect(document.documentElement.dataset.immersive).toBe('true');
  act(() => window.dispatchEvent(new Event('pointermove')));
  expect(document.documentElement.dataset.immersive).toBe('false');
  unmount();
  expect(document.documentElement.dataset.immersive).toBeUndefined();
});
