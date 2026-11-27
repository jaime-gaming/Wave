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

it('shows the cover that is playing, breathing, and nothing else', () => {
  const { container } = render(<MixCueVisual cue={cue} artworkClassName="stage-artwork" />);

  expect(container.querySelectorAll('.mix-cue-cover .stage-artwork')).toHaveLength(1);
  expect(container.querySelector('.mix-cue-half')).toBeNull();
  expect(container.querySelector('.mix-cue-next')).toBeNull();

  expect(container.querySelector('.mix-cue-sheen')).toBeNull();
  const root = container.querySelector<HTMLElement>('.mix-cue')!;
  expect(root.style.getPropertyValue('--cue-progress')).toBe('0.5');
});

it('keeps the movement inside its range whatever the engine reports', () => {
  const { container, rerender } = render(<MixCueVisual cue={{ ...cue, progress: 2 }} />);
  const root = container.querySelector<HTMLElement>('.mix-cue')!;
  expect(Number(root.style.getPropertyValue('--cue-progress'))).toBe(1);
  expect(Number(root.style.getPropertyValue('--cue-breath'))).toBe(1);
  rerender(<MixCueVisual cue={{ ...cue, progress: -3 }} />);
  expect(Number(root.style.getPropertyValue('--cue-progress'))).toBe(0);
  expect(Number(root.style.getPropertyValue('--cue-breath'))).toBe(0);
});

it('says what is happening once, in words, for a screen reader', () => {
  const { getByRole } = render(<MixCueLabel cue={cue} />);
  const status = getByRole('status');
  expect(status).toHaveAttribute('aria-label', 'Mixing into Next by Wave Tests');
  expect(status).toHaveTextContent('Mixing');
});

it('is one word and nothing else: no bars, no spinner, no rule beside it', () => {
  const { container } = render(<MixCueLabel cue={cue} />);

  expect(container.querySelector('.mix-cue-waves')).toBeNull();
  expect(container.querySelector('.mix-cue-scan')).toBeNull();
  expect(container.querySelector('.mix-cue-line')).toBeNull();
  expect(container.querySelectorAll('.mix-cue-word')).toHaveLength(1);
  expect(container.querySelector('.mix-cue-label')?.textContent).toBe('Mixing');
});
