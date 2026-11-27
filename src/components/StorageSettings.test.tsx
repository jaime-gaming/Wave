import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { StorageSettings } from './StorageSettings';
vi.mock('../data/listening', () => ({ countPlays: vi.fn().mockResolvedValue(0) }));
it('requires confirmation and allows cancelling without deleting anything', async () => {
  const user = userEvent.setup();
  render(<StorageSettings tracks={[]} />);
  localStorage.setItem('wave-theme', 'dark');
  await user.click(screen.getByRole('button', { name: 'Reset Wave' }));
  expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Erase Wave data' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('button', { name: 'Erase Wave data' })).not.toBeInTheDocument();
  expect(localStorage.getItem('wave-theme')).toBe('dark');
});
it('does not start a reset during an import', () => {
  render(<StorageSettings tracks={[]} importing />);
  expect(screen.getByRole('button', { name: 'Reset Wave' })).toBeDisabled();
});
it('offers backup controls and prevents restoring over a library or while importing', async () => {
  const { makeTrack } = await import('../test/fixtures');
  const view = render(<StorageSettings tracks={[makeTrack()]} />);
  expect(screen.getByRole('button', { name: 'Export library' })).toBeEnabled();
  expect(screen.getByLabelText('Import library')).toBeDisabled();
  expect(
    screen.getByText(/Settings, device links and remembered folders are not included/),
  ).toBeInTheDocument();
  view.rerender(<StorageSettings tracks={[]} importing />);
  expect(screen.getByRole('button', { name: 'Export library' })).toBeDisabled();
  expect(screen.getByLabelText('Import library')).toBeDisabled();
  view.rerender(<StorageSettings tracks={[]} />);
  expect(screen.getByLabelText('Import library')).toBeEnabled();
});
