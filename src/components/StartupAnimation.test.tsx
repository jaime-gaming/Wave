import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StartupAnimation } from './StartupAnimation';

vi.mock('../ui/motion', () => ({
  useWaveMotion: () => ({ enabled: false, effects: { duration: 0 } }),
}));

afterEach(() => vi.useRealTimers());

it('shows on every opening and remains until the library is ready', () => {
  vi.useFakeTimers();
  sessionStorage.setItem('wave-booted', '1');
  const first = render(<StartupAnimation loading />);
  expect(screen.getByRole('progressbar', { name: 'Loading Wave' })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('progressbar', { name: 'Loading Wave' })).toBeInTheDocument();
  first.unmount();
  render(<StartupAnimation loading={false} />);
  expect(screen.getByRole('progressbar', { name: 'Loading Wave' })).toBeInTheDocument();
  sessionStorage.removeItem('wave-booted');
});
