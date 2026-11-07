import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SilenceNotice } from './SilenceNotice';

it('says nothing when there is nothing to say', () => {
  const { container } = render(<SilenceNotice text={null} onRemove={vi.fn()} onKeep={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

it('offers the two answers and nothing else', async () => {
  const onRemove = vi.fn();
  const onKeep = vi.fn();
  render(
    <SilenceNotice
      text="2.4 seconds of silence at the start"
      onRemove={onRemove}
      onKeep={onKeep}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('2.4 seconds of silence at the start');
  await userEvent.click(screen.getByRole('button', { name: 'Review silence' }));
  await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
  expect(onRemove).toHaveBeenCalledOnce();
  expect(onKeep).toHaveBeenCalledOnce();
});
