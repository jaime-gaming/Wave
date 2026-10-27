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
  expect(container.querySelector('.mix-incoming')).toHaveStyle({ opacity: '0.4' });
});
it('retains the compact default and renders nothing outside an overlap', () => {
  const { container, rerender } = render(<MixVisual blend={blend} />);
  expect(container.querySelectorAll('.player-artwork')).toHaveLength(2);
  rerender(<MixVisual blend={null} />);
  expect(container).toBeEmptyDOMElement();
});
