import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BreakPrompt } from './BreakPrompt';

it('asks the question in the player’s own words', () => {
  render(<BreakPrompt open onContinue={vi.fn()} onStop={vi.fn()} />);
  expect(screen.getByRole('dialog')).toHaveTextContent('Hey, wanna take a break?');
});

it('offers both ways out', async () => {
  const onContinue = vi.fn();
  const onStop = vi.fn();
  render(<BreakPrompt open onContinue={onContinue} onStop={onStop} />);
  await userEvent.click(screen.getByRole('button', { name: 'Keep listening' }));
  await userEvent.click(screen.getByRole('button', { name: 'Take a break' }));
  expect(onContinue).toHaveBeenCalledOnce();
  expect(onStop).toHaveBeenCalledOnce();
});

it('is not in the way when the session is young', () => {
  render(<BreakPrompt open={false} onContinue={vi.fn()} onStop={vi.fn()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
