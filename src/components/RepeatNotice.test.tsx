import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RepeatNotice } from './RepeatNotice';
afterEach(() => vi.useRealTimers());
it('acknowledges a real repeat, not the initial mount', async () => {
  vi.useFakeTimers();
  const { rerender } = render(<RepeatNotice serial={0} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(<RepeatNotice serial={1} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole('status')).toHaveTextContent('Playing again');
  rerender(<RepeatNotice serial={2} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole('status')).toHaveTextContent('Playing again');
});
it('does not replay an old acknowledgement when the expanded player opens', async () => {
  vi.useFakeTimers();
  render(<RepeatNotice serial={4} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
