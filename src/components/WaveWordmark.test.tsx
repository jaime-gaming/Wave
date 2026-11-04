import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaveWordmark } from './WaveWordmark';

describe('the Wave wordmark', () => {
  it('draws the whole word as strokes, not as text', () => {
    const { container } = render(<WaveWordmark variant="full" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('wave-wordmark-full');
    // W, the bowl and the stem of the a, the v, and the two strokes of the e.
    expect(svg.querySelectorAll('path')).toHaveLength(6);
    expect(svg.textContent).toBe('');
  });

  it('offers the first letter alone for a narrow rail', () => {
    const { container } = render(<WaveWordmark variant="mark" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('wave-wordmark-mark');
    // The same W curves as the full wordmark, so the swap is not a swap of logos.
    const { container: full } = render(<WaveWordmark variant="full" />);
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(
      full.querySelector('path')!.getAttribute('d'),
    );
  });

  it('is decorative: the name is announced once, in text, by its host', () => {
    const { container } = render(<WaveWordmark variant="full" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
