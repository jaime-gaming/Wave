import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

describe('Screen Wake Lock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('acquires a screen wake lock while playing and releases it on pause', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ released: false, release });
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });

    const { rerender } = renderHook(({ playing }) => useWakeLock(playing), {
      initialProps: { playing: true },
    });

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    rerender({ playing: false });
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });

  it('fails silently when the Wake Lock API is unsupported or rejected', () => {
    const request = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
