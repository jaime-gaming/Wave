import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QrScanner } from './QrScanner';

describe('QrScanner', () => {
  const getUserMedia = vi.fn();
  beforeEach(() => {
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue({ getTracks: () => [] });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts the camera once, however often the page re-renders', async () => {
    const first = vi.fn();
    const view = render(<QrScanner onResult={first} onCancel={() => undefined} />);
    await Promise.resolve();
    view.rerender(<QrScanner onResult={vi.fn()} onCancel={() => undefined} />);
    view.rerender(<QrScanner onResult={vi.fn()} onCancel={() => undefined} />);
    await Promise.resolve();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
