import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WaveSeek } from './WaveSeek';
afterEach(() => vi.unstubAllGlobals());
it('covers every resized track and bounds the thumb/clip at both endpoints', () => {
  let resize: ResizeObserverCallback = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const props = { time: 50, duration: 100, playing: true, onSeek: vi.fn() };
  const { container, rerender } = render(<WaveSeek {...props} />);
  for (const width of [280, 720, 1600]) {
    act(() => resize([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
    for (const time of [0, 0.1, 50, 99.9, 100]) {
      rerender(<WaveSeek {...props} time={time} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe(`0 0 ${width} 28`);
      const thumb = container.querySelector('.wave-seek__thumb')!;
      const x = Number(thumb.getAttribute('x'));
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x + 6).toBeLessThanOrEqual(width - 3);
      const clip = container.querySelector('clipPath rect')!;
      expect(Number(clip.getAttribute('width'))).toBeGreaterThanOrEqual(0);
      expect(Number(clip.getAttribute('width')) + 6).toBeLessThanOrEqual(width);
      const wave = container.querySelector('.wave-seek__played')!.getAttribute('d')!;
      const end = Number(wave.trim().split(' ').at(-2));
      expect(end).toBeGreaterThanOrEqual(width + 32);
    }
  }
  fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '45.5' } });
  expect(props.onSeek).toHaveBeenCalledWith(45.5);
  rerender(<WaveSeek {...props} playing={false} />);
  expect(container.firstChild).toHaveAttribute('data-playing', 'false');
  expect(container.querySelector('.wave-seek__played')!.getAttribute('d')).not.toMatch(
    /\s(?:6|22)\s/,
  );
  rerender(<WaveSeek {...props} duration={0} time={0} />);
  expect(screen.getByRole('slider')).toBeDisabled();
});
