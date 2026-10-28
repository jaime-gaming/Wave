import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MixVisual } from './MixVisual';
import { makeTrack } from '../test/fixtures';
const from = makeTrack();
const to = makeTrack({ id: 'next' });
const blend = {
  from,
  to,
  outgoing: from.blob ?? new Blob(),
  incoming: to.blob ?? new Blob(),
  progress: 0.4,
  seconds: 4,
};
it('uses full-stage artwork styles on both blended covers when requested', () => {
  const { container } = render(<MixVisual blend={blend} artworkClassName="stage-artwork" />);
  expect(container.querySelectorAll('.stage-artwork')).toHaveLength(2);
  expect(container.querySelector('.mix-seam')).toBeInTheDocument();
});
it('drives both covers from one progress value, arriving before it leaves', () => {
  const { container, rerender } = render(<MixVisual blend={{ ...blend, progress: 0.2 }} />);
  const root = container.querySelector<HTMLElement>('.mix-artwork')!;
  expect(Number(root.style.getPropertyValue('--mix-arrive'))).toBeGreaterThan(0.3);
  expect(Number(root.style.getPropertyValue('--mix-leave'))).toBe(0);
  rerender(<MixVisual blend={{ ...blend, progress: 0.9 }} />);
  expect(Number(root.style.getPropertyValue('--mix-leave'))).toBeGreaterThan(0.5);
  // Beyond the ends of the overlap the numbers stay inside their range.
  rerender(<MixVisual blend={{ ...blend, progress: 2 }} />);
  expect(Number(root.style.getPropertyValue('--mix-arrive'))).toBe(1);
  expect(Number(root.style.getPropertyValue('--mix-peak'))).toBe(0);
});
it('clamps a stray progress instead of inverting the picture', () => {
  const { container } = render(<MixVisual blend={{ ...blend, progress: -1 }} />);
  const root = container.querySelector<HTMLElement>('.mix-artwork')!;
  expect(root.style.getPropertyValue('--mix-progress')).toBe('0');
});
it('retains the compact default and renders nothing outside an overlap', () => {
  const { container, rerender } = render(<MixVisual blend={blend} />);
  expect(container.querySelectorAll('.player-artwork')).toHaveLength(2);
  rerender(<MixVisual blend={null} />);
  expect(container).toBeEmptyDOMElement();
});
