import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useControlsIdle } from './useControlsIdle';

describe('controls that step back while listening', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hides the transport after two still seconds and comes back on movement', () => {
    const { result } = renderHook(() => useControlsIdle(true));
    expect(result.current.idle).toBe(false);
    act(() => void vi.advanceTimersByTime(1999));
    expect(result.current.idle).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.idle).toBe(true);
    act(() => void window.dispatchEvent(new Event('pointermove')));
    expect(result.current.idle).toBe(false);
  });

  it('never hides anything while the player is paused', () => {
    const { result } = renderHook(() => useControlsIdle(false));
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current.idle).toBe(false);
  });

  it('keeps the transport on screen while one of its controls has focus', () => {
    const transport = document.createElement('div');
    transport.className = 'stage-transport';
    const button = document.createElement('button');
    transport.append(button);
    document.body.append(transport);
    button.focus();
    const { result } = renderHook(() => useControlsIdle(true));
    act(() => void vi.advanceTimersByTime(4000));
    expect(result.current.idle).toBe(false);
    transport.remove();
    document.body.focus();
  });
});
