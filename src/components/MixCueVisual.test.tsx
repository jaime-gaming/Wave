import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MixCueLabel, MixCueVisual } from './MixCueVisual';
import { makeTrack } from '../test/fixtures';

const cue = {
  from: makeTrack(),
  to: makeTrack({ id: 'next', title: 'Next', artist: 'Wave Tests' }),
  seconds: 12,
  progress: 0.5,
};

it('splits the playing cover and shows the next one behind it', () => {
  const { container } = render(<MixCueVisual cue={cue} artworkClassName="stage-artwork" />);
  expect(container.querySelectorAll('.mix-cue-half')).toHaveLength(2);
  expect(container.querySelector('.mix-cue-next .stage-artwork')).toBeInTheDocument();
  const root = container.querySelector<HTMLElement>('.mix-cue')!;
  expect(root.style.getPropertyValue('--cue-progress')).toBe('0.5');
});

it('keeps the opening inside its range whatever the engine reports', () => {
  const { container, rerender } = render(<MixCueVisual cue={{ ...cue, progress: 2 }} />);
  const root = container.querySelector<HTMLElement>('.mix-cue')!;
  expect(Number(root.style.getPropertyValue('--cue-open'))).toBe(1);
  rerender(<MixCueVisual cue={{ ...cue, progress: -3 }} />);
  expect(Number(root.style.getPropertyValue('--cue-open'))).toBe(0);
});

it('says what is happening once, in words, for a screen reader', () => {
  const { getByRole } = render(<MixCueLabel cue={cue} />);
  const status = getByRole('status');
  expect(status).toHaveAttribute('aria-label', 'Mixing into Next by Wave Tests');
  expect(status).toHaveTextContent('Mixing');
});
